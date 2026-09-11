import { Adapter, type BB } from "./adapter.ts";
import { Runtime } from "./runtime.ts";
import { commands, type CommandName } from "../shared/commands.ts";
import { errorData, Fault, stable, type Result } from "../shared/types.ts";
import { z } from "zod";
import {textureSetDocument,textureSetAssets} from '../shared/texture-set.ts';
declare const RBMCP_DEFAULTS: { url: string; token: string };
const b = globalThis as unknown as BB;
let runtime: Runtime | undefined,
  socket: WebSocket | undefined,
  reconnect: ReturnType<typeof setTimeout> | undefined,
  panel: any,
  action: any,
  property: any;
let loaded = false,
  authorized = false,
  queue = Promise.resolve();
const instanceId = crypto.randomUUID();
const callbacks: { event: string; fn: () => void }[] = [];
interface Job {
  fingerprint: string;
  state: "queued" | "running" | "completed" | "failed";
  result?: Result;
  error?: ReturnType<typeof errorData>;
}
const jobs = new Map<string, Job>();
const ui = {
  connection: "Stopped",
  last: "",
  error: "",
  paused: false,
  jobs: [] as { id: string; name: string; state: string }[],
};
const config = () => {
  let saved: any = {};
  try {
    saved = JSON.parse(
      localStorage.getItem("ruins_blockbench_mcp_connection") ??
        localStorage.getItem("perfect_blockbench_mcp_connection") ??
        "{}",
    );
  } catch {}
  return {
    url: saved.url || RBMCP_DEFAULTS.url,
    token: saved.token || RBMCP_DEFAULTS.token,
  };
};
function send(value: unknown) {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(value));
}
function connect() {
  if (!loaded) return;
  clearTimeout(reconnect);
  socket?.close();
  authorized = false;
  const c = config();
  if (!/^ws:\/\/127\.0\.0\.1:\d+\/bridge$/.test(c.url) || c.token.length < 32) {
    ui.connection = "Connection setup required";
    return;
  }
  ui.connection = "Connecting";
  const ws = (socket = new WebSocket(c.url));
  ws.onopen = () =>
    ws.send(
      JSON.stringify({
        type: "hello",
        token: c.token,
        instance_id: instanceId,
        version: "0.2.0",
        blockbench_version: b.Blockbench.version,
      }),
    );
  ws.onmessage = (e) => {
    if (socket !== ws || !loaded) return;
    let m: any;
    try {
      if (String(e.data).length > 64000000)
        throw new Error("Message too large");
      m = JSON.parse(String(e.data));
    } catch {
      ui.error = "Invalid message";
      return;
    }
    if (m.type === "ready") {
      authorized = true;
      ui.connection = "Connected";
      return;
    }
    if (
      !authorized ||
      m.type !== "request" ||
      typeof m.id !== "string" ||
      m.id.length > 160
    )
      return;
    void receive(m);
  };
  ws.onerror = () => {
    ui.connection = "Connection error";
  };
  ws.onclose = () => {
    if (socket !== ws) return;
    authorized = false;
    ui.connection = loaded ? "Waiting to reconnect" : "Stopped";
    if (loaded) reconnect = setTimeout(connect, 2500);
  };
}
async function receive(m: { id: string; method: string; args: any }) {
  const targetRuntime = runtime;
  const fingerprint = stable({ method: m.method, args: m.args });
  const previous = jobs.get(m.id);
  if (previous) {
    if (previous.fingerprint !== fingerprint) {
      send({
        type: "response",
        id: m.id,
        error: {
          code: "REQUEST_ID_REUSED",
          message: "request_id was reused with different arguments",
        },
      });
      return;
    }
    send(
      previous.state === "completed" || previous.state === "failed"
        ? {
            type: "response",
            id: m.id,
            result: previous.result,
            error: previous.error,
          }
        : { type: "accepted", id: m.id, state: previous.state },
    );
    return;
  }
  if (m.method === "bb_job") {
    const job = jobs.get(m.args?.request_id);
    send({
      type: "response",
      id: m.id,
      result: {
        data: job
          ? {
              request_id: m.args.request_id,
              state: job.state,
              result: job.result,
              error: job.error,
            }
          : {
              request_id: m.args?.request_id,
              state: "unknown",
              message:
                "Never received, evicted, or plugin reloaded; do not assume the edit was not applied.",
            },
      },
    });
    return;
  }
  if (
    Array.from(jobs.values()).filter(
      (j) => j.state === "queued" || j.state === "running",
    ).length >= 16
  ) {
    send({
      type: "response",
      id: m.id,
      error: { code: "QUEUE_FULL", message: "Too many queued requests" },
    });
    return;
  }
  const job: Job = { fingerprint, state: "queued" };
  jobs.set(m.id, job);
  send({ type: "accepted", id: m.id, state: "queued" });
  queue = queue
    .then(async () => {
      job.state = "running";
      ui.last = m.method;
      ui.error = "";
      ui.jobs.unshift({ id: m.id, name: m.method, state: "running" });
      ui.jobs = ui.jobs.slice(0, 30);
      try {
        if (!runtime || runtime !== targetRuntime || !loaded)
          throw new Fault("UNLOADED", "Plugin unloaded before execution");
        if(m.method==='__plan_texture_set') {
          const args=commands.bb_import_texture_set.schema.extend({document:textureSetDocument,assets:textureSetAssets}).strict().parse(m.args);
          job.result=await runtime.planTextureSet(args);
        } else if (
          m.method === "__import_model" ||
          m.method === "__import_animation"
        ) {
          const schema =
            m.method === "__import_model"
              ? commands.bb_import_model.schema
              : commands.bb_import_animation.schema;
          const args = schema
            .extend({
              path: z.string().max(2000),
              content: z.string().max(44000000),
            })
            .strict()
            .parse(m.args);
          job.result =
            m.method === "__import_model"
              ? await runtime.integrations.importModel(args)
              : await runtime.integrations.importAnimation(args);
        } else if (m.method === "__ui_files") {
          const args = z
            .object({
              snapshot_id: z.string().min(1).max(200),
              element_id: z.string().min(1).max(200),
              inputs: z
                .array(
                  z
                    .object({
                      filename: z.string().min(1).max(200),
                      path: z.string().max(2000),
                      content: z.string().max(44000000),
                    })
                    .strict(),
                )
                .min(1)
                .max(8),
            })
            .strict()
            .parse(m.args);
          if (
            args.inputs.reduce((n, input) => n + input.content.length, 0) >
            44000000
          )
            throw new Fault(
              "SIZE_LIMIT",
              "Combined UI file input is too large",
            );
          job.result = runtime.integrations.ui.files(args);
        } else if (m.method === "__file_import") {
          const args = z
            .object({
              file_request_id: z.string().max(200),
              inputs: z
                .array(
                  z
                    .object({
                      filename: z.string().max(200),
                      path: z.string().max(2000),
                      content: z.string().max(44000000),
                    })
                    .strict(),
                )
                .min(1)
                .max(8),
            })
            .strict()
            .parse(m.args);
          if (
            args.inputs.reduce((n, input) => n + input.content.length, 0) >
            44000000
          )
            throw new Fault(
              "SIZE_LIMIT",
              "Combined native file input is too large",
            );
          job.result = await runtime.integrations.files.import(
            args.file_request_id,
            args.inputs,
          );
        } else if (m.method === "__file_export_ack") {
          const args = z
            .object({
              file_request_id: z.string().max(200),
              path: z.string().max(2000),
            })
            .strict()
            .parse(m.args);
          job.result = runtime.integrations.files.acknowledge(
            args.file_request_id,
            args.path,
          );
        } else if (m.method === "__open_checkpoint") {
          const args = z
            .object({
              filename: z.string().max(200),
              model: z.record(z.string(), z.unknown()),
            })
            .strict()
            .parse(m.args);
          if (runtime.paused)
            throw new Fault("PAUSED", "MCP editing is paused");
          job.result = await runtime.openCheckpoint(args.model, args.filename);
        } else {
          if (!Object.hasOwn(commands, m.method))
            throw new Fault("UNKNOWN_TOOL", `Unknown tool ${m.method}`);
          job.result = await runtime.run(m.method as CommandName, m.args);
        }
        job.state = "completed";
        send({ type: "response", id: m.id, result: job.result });
      } catch (e) {
        job.error = errorData(e);
        job.state = "failed";
        ui.error = job.error.message;
        send({ type: "response", id: m.id, error: job.error });
      }
      const row = ui.jobs.find((j) => j.id === m.id);
      if (row) row.state = job.state;
      while (
        jobs.size > 128 ||
        Array.from(jobs.values()).reduce((n, j) => n + stable(j).length, 0) >
          64000000
      ) {
        const entry = Array.from(jobs.entries()).find(
          ([, j]) => j.state === "completed" || j.state === "failed",
        );
        if (!entry) break;
        jobs.delete(entry[0]);
      }
    })
    .catch((e) => {
      ui.error = String(e);
    });
}
function settings() {
  const c = config();
  new b.Dialog("ruins_mcp_connection", {
    title: "Ruin's BlockBenchMCP Connection",
    form: {
      url: { label: "WebSocket URL", type: "text", value: c.url },
      token: { label: "Connection token", type: "password", value: c.token },
    },
    onConfirm(values: any) {
      if (
        !/^ws:\/\/127\.0\.0\.1:\d+\/bridge$/.test(values.url) ||
        values.token.length < 32
      ) {
        b.Blockbench.showQuickMessage(
          "Enter a loopback URL and a token with at least 32 characters",
        );
        return;
      }
      localStorage.setItem(
        "ruins_blockbench_mcp_connection",
        JSON.stringify(values),
      );
      connect();
    },
  }).show();
}
b.BBPlugin.register("ruins_blockbench_mcp", {
  title: "Ruin's BlockBenchMCP",
  author: "Ruin's BlockBenchMCP contributors",
  description:
    "Planned model editing, UV, texture, animation, diagnostics, protection, and multi-view preview",
  version: "0.2.0",
  min_version: "5.1.6",
  variant: "desktop",
  icon: "smart_toy",
  tags: ["Modeling", "Animation", "API"],
  onload() {
    loaded = true;
    ui.error = "";
    runtime = new Runtime(new Adapter(b));
    const api = runtime.integrations.api();
    b.RuinBlockBenchMCP = api;
    // Keep the previous global as a compatibility alias for existing extensions.
    b.PerfectBlockbenchMCP = api;
    runtime.paused = ui.paused;
    property = new b.Property(
      b.ModelProject,
      "array",
      "perfect_mcp_protections",
      { default: () => [], exposed: false },
    );
    for (const p of b.ModelProject.all)
      if (!Array.isArray(p.perfect_mcp_protections))
        p.perfect_mcp_protections = [];
    for (const event of [
      "finished_edit",
      "undo",
      "redo",
      "select_project",
      "close_project",
      "new_project",
      "update_project_settings",
    ]) {
      const fn = () => {
        if (runtime) runtime.adapter.revision++;
      };
      callbacks.push({ event, fn });
      b.Blockbench.on(event, fn);
    }
    action = new b.Action("ruins_mcp_settings", {
      name: "Ruin's MCP Connection Settings",
      icon: "settings_ethernet",
      click: settings,
    });
    b.MenuBar.addAction(action, "tools");
    panel = new b.Panel("ruins_mcp_panel", {
      name: "Ruin's MCP",
      icon: "smart_toy",
      default_position: { slot: "right_bar", height: 240 },
      component: {
        data() {
          return ui;
        },
        methods: {
          settings,
          reconnect: connect,
          pause() {
            ui.paused = !ui.paused;
            if (runtime) runtime.paused = ui.paused;
          },
        },
        template: `<div style="padding:10px"><p><b>Ruin's BlockBenchMCP</b></p><p>{{ connection }}</p><p style="opacity:.7">Target: Blockbench 5.1.6</p><button @click="settings">Connection settings</button> <button @click="reconnect">Reconnect</button> <button @click="pause">{{ paused ? 'Resume editing' : 'Pause MCP editing' }}</button><p>Recent operation: {{ last }}</p><p style="color:var(--color-error)">{{ error }}</p><div style="max-height:120px;overflow:auto"><div v-for="job in jobs" :key="job.id">{{ job.name }} — {{ job.state }}</div></div></div>`,
      },
    });
    connect();
    b.Blockbench.dispatchEvent("ruins_mcp_ready", {
      api: b.RuinBlockBenchMCP,
    });
    b.Blockbench.dispatchEvent("perfect_mcp_ready", { api });
  },
  onunload() {
    b.Blockbench.dispatchEvent("ruins_mcp_unload", {});
    b.Blockbench.dispatchEvent("perfect_mcp_unload", {});
    delete b.RuinBlockBenchMCP;
    delete b.PerfectBlockbenchMCP;
    loaded = false;
    clearTimeout(reconnect);
    socket?.close();
    runtime?.dispose();
    runtime = undefined;
    for (const { event, fn } of callbacks)
      b.Blockbench.removeListener(event, fn);
    callbacks.length = 0;
    panel?.delete();
    action?.delete();
    property?.delete();
    jobs.clear();
    ui.connection = "Stopped";
  },
});
