import { readFile } from "node:fs/promises";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { commands, type CommandName } from "../shared/commands.ts";
import { errorData, Fault, stable, type Result } from "../shared/types.ts";
import { Bridge } from "./bridge.ts";
import { OutputFiles } from "./files.ts";
import {readTextureSetInput} from './texture-set-input.ts';
import {
  highLevelOperations,
  highLevelSchema,
  highLevelSummary,
  type HighLevelAssertions,
  type HighLevelInput,
  type HighLevelTask,
} from "../shared/high-level.ts";
import { buildCanonicalWorkflow } from "../shared/workflow-core.ts";

const arg = process.argv.indexOf("--config");
const configPath = path.resolve(
  arg >= 0
    ? process.argv[arg + 1]
    : (process.env.RBMCP_CONFIG ?? process.env.PBMC_CONFIG ?? ".runtime/connection.json"),
);
const config = z
  .object({
    token: z.string().min(32),
    port: z.number().int().min(1024).max(65535),
    output_dir: z.string(),
    url: z.string().optional(),
  })
  .parse(JSON.parse(await readFile(configPath, "utf8")));
const bridge = new Bridge(config.token);
await bridge.start(config.port);
const files = new OutputFiles(config.output_dir);
const server = new McpServer(
  { name: "ruins-blockbench-mcp", version: "0.2.0" },
  {
    instructions:
      "Use bb_status and bb_projects first, or use bb_task for an intent-level workflow. Obtain a bb_snapshot before edits. Plan using bb_plan_edit, inspect its changes and warnings, then bb_apply_plan. Batch related operations into one plan. IDs returned in created can be referenced within the same batch as $ref. Capture images and diagnose after edits. Locks affect MCP operations only. Save bbmodel checkpoints before conversion or major revisions. Never blindly retry a timed-out edit with a new operation_id; query bb_job.",
  },
);
async function execute(
  name: CommandName,
  args: any,
  instanceId?: string,
  requestId?: string,
): Promise<Result> {
  if (name === "bb_job") {
    const highLevel = highLevelRequests.get(args.request_id);
    if (highLevel) {
      return {
          data: {
            request_id: args.request_id,
            state: highLevel.done
              ? highLevel.error
                ? "failed"
                : "completed"
              : "running",
            phase: highLevel.phase,
            progress: highLevel.progress,
            started_at: new Date(highLevel.started_at).toISOString(),
            updated_at: new Date(highLevel.updated_at).toISOString(),
            result: highLevel.result,
            error: highLevel.error,
        },
      };
    }
  }
  if(name==='bb_import_texture_set') {
    const {source_hashes,...payload}=await readTextureSetInput(files,args.filename);
    const result=await bridge.request('__plan_texture_set',{...args,...payload},instanceId,requestId);
    return {data:{...result.data,source_hashes}};
  }
  if (name === "bb_ui_interact") {
    if (args.action === "file") {
      if (
        !args.filenames ||
        args.value !== undefined ||
        args.pointer ||
        args.wheel ||
        args.key ||
        args.hold_ms
      )
        throw new Fault(
          "INPUT",
          "File input requires filenames and no value, key, pointer or hold",
        );
      const inputs = await Promise.all(
        args.filenames.map(async (filename: string) => ({
          filename,
          ...(await files.readInput(filename)),
        })),
      );
      if (
        inputs.reduce((sum, input) => sum + input.content.length, 0) > 44000000
      )
        throw new Fault("SIZE_LIMIT", "Combined UI input exceeds 32 MB");
      return bridge.request(
        "__ui_files",
        { snapshot_id: args.snapshot_id, element_id: args.element_id, inputs },
        instanceId,
        requestId,
      );
    }
    if (args.filenames)
      throw new Fault("INPUT", "filenames are only valid for action file");
  }
  if (name === "bb_file_reply") {
    if (args.action === "cancel") {
      if (args.filename || args.filenames)
        throw new Fault("INPUT", "Cancel does not accept filenames");
      return bridge.request(name, args, instanceId, requestId);
    }
    if (args.action === "import") {
      if (!args.filenames || args.filename)
        throw new Fault("INPUT", "Import requires filenames only");
      const inputs = await Promise.all(
        args.filenames.map(async (filename: string) => ({
          filename,
          ...(await files.readInput(filename)),
        })),
      );
      if (inputs.reduce((n, input) => n + input.content.length, 0) > 44000000)
        throw new Fault("SIZE_LIMIT", "Combined input exceeds 32 MB");
      return bridge.request(
        "__file_import",
        { file_request_id: args.file_request_id, inputs },
        instanceId,
        requestId,
      );
    }
    if (args.filenames)
      throw new Fault("INPUT", "Export accepts a single output filename");
    if (args.filename) files.filename(args.filename);
    const payload = await bridge.request(name, args, instanceId, requestId);
    const extension =
      String(payload.data.extension)
        .replace(/[^a-zA-Z0-9_]/g, "")
        .slice(0, 16) || "bin";
    const filename =
      args.filename ??
      `native-${Date.now()}-${randomUUID().slice(0, 8)}.${extension}`;
    const saved = await files.write(
      filename,
      String(payload.data.content),
      payload.data.encoding === "base64" ? "base64" : "utf8",
    );
    try {
      const ack = await bridge.request(
        "__file_export_ack",
        { file_request_id: args.file_request_id, path: saved.path },
        instanceId,
      );
      return { data: { ...ack.data, ...saved, filename } };
    } catch (error) {
      // The file already exists. Cache this concrete result, even if the native
      // callback timed out or refused changed state, to prevent duplicate writes.
      return {
        data: {
          ...saved,
          filename,
          completion: "file_written_callback_failed_or_unknown",
          callback_error: errorData(error),
        },
      };
    }
  }
  if (name === "bb_import_model" || name === "bb_import_animation") {
    const file = await files.readInput(args.filename);
    return bridge.request(
      name === "bb_import_model" ? "__import_model" : "__import_animation",
      { ...args, ...file },
      instanceId,
      requestId,
    );
  }
  if (name === "bb_status") {
    const status = bridge.status();
    if (status.peers.length > 1 && !instanceId)
      return {
        data: { ...status, connected: true, needs_instance_selection: true },
      };
    if (!status.peers.length)
      return {
        data: {
          ...status,
          connected: false,
          setup:
            "Load dist/ruins_blockbench_mcp.js using Blockbench Plugins > Load Plugin from File.",
        },
      };
    const detail = await bridge.request(name, args, instanceId, requestId);
    return { data: { ...status, connected: true, ...detail.data } };
  }
  if (name === "bb_restore_checkpoint") {
    const model = await files.readCheckpoint(args.filename);
    return bridge.request(
      "__open_checkpoint",
      { model, filename: args.filename },
      instanceId,
      requestId,
    );
  }
  if (name === "bb_convert_copy") {
    const checkpoint = await bridge.request(
      "bb_export",
      { project_id: args.project_id, codec: "project", options: {} },
      instanceId,
    );
    const saved = await files.write(
      `before-conversion-${randomUUID()}.bbmodel`,
      String(checkpoint.data.content),
    );
    const converted = await bridge.request(name, args, instanceId, requestId);
    return { data: { ...converted.data, checkpoint: saved } };
  }
  const result = await bridge.request(name, args, instanceId, requestId);
  if (name === "bb_export" && args.codec !== "formats") {
    const extension =
      args.codec==='texture_mcmeta'?'png.mcmeta':args.codec==='texture_set'?'texture_set.json':String(result.data.extension)
        .replace(/[^a-zA-Z0-9_]/g, "")
        .slice(0, 16) || "bin";
    const filename =
      args.filename ??
      `blockbench-${Date.now()}-${randomUUID().slice(0, 8)}.${extension}`;
    const content = String(result.data.content);
    const contentBytes = result.data.encoding === "base64"
      ? Buffer.from(content, "base64")
      : Buffer.from(content, "utf8");
    const sha256 = createHash("sha256").update(contentBytes).digest("hex");
    const saved = await files.write(
      filename,
      content,
      result.data.encoding === "base64" ? "base64" : "utf8",
    );
    return {
      data: {
        ...saved,
        codec: args.codec,
        filename,
        encoding: result.data.encoding,
        sha256,
        ...(result.data.export_details ? { export_details: result.data.export_details } : {}),
        ...(result.data.archive_entries
          ? { archive_entries: result.data.archive_entries }
          : {}),
        verified: "File written; game runtime not verified",
      },
    };
  }
  return result;
}

function snapshotSummary(data: Record<string, unknown> | undefined) {
  if (!data) return undefined;
  return {
    project_id: data.project_id,
    name: data.name,
    format: data.format,
    revision: data.revision,
    project_uv: data.project_uv,
    capabilities: data.capabilities,
    counts: data.counts,
    protections: data.protections,
  };
}

type ResolvedAssetRef = {
  asset_id: string;
  filename: string;
  bytes: number;
  sha256: string;
  texture_refs: string[];
};

async function resolveHighLevelAssets(args: HighLevelInput) {
  if (!args.task)
    return { task: undefined, refs: [] as ResolvedAssetRef[], byTextureRef: new Map<string, string>() };
  const task = structuredClone(args.task) as any;
  const textures: any[] = [];
  const collectTextures = (candidate: any) => {
    if (candidate?.kind === "pipeline") {
      for (const step of candidate.steps) collectTextures(step.task);
    } else if (candidate?.kind === "build_model" || candidate?.kind === "paint_texture") {
      textures.push(...(candidate.textures ?? []));
    }
  };
  collectTextures(task);
  const uses = new Map<string, string[]>();
  for (const texture of textures) {
    if (!texture.asset_id) continue;
    const textureRef = String(texture.ref ?? texture.name);
    const list = uses.get(texture.asset_id) ?? [];
    list.push(textureRef);
    uses.set(texture.asset_id, list);
  }
  const loaded = new Map<string, { data: string; ref: ResolvedAssetRef }>();
  for (const [assetId, textureRefs] of uses) {
    const spec = args.assets?.[assetId];
    if (!spec) throw new Fault("ASSET_NOT_FOUND", `Unknown asset_id ${assetId}`);
    let input: { path: string; content: string };
    try {
      input = await files.readInput(spec.filename);
    } catch (error) {
      throw new Fault("ASSET_NOT_FOUND", `Asset file could not be read: ${spec.filename}`, {
        asset_id: assetId,
        filename: spec.filename,
        cause: errorData(error),
      });
    }
    const bytes = Buffer.from(input.content, "base64");
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    if (spec.sha256 && spec.sha256.toLowerCase() !== sha256)
      throw new Fault("ASSET_HASH_MISMATCH", `SHA-256 mismatch for asset ${assetId}`, {
        asset_id: assetId,
        expected: spec.sha256.toLowerCase(),
        actual: sha256,
      });
    if (!input.content.startsWith("iVBORw0KGgo"))
      throw new Fault("ASSET_TYPE_UNSUPPORTED", `Asset ${assetId} is not a PNG image`);
    const data = `data:image/png;base64,${input.content}`;
    if (data.length > 24000000)
      throw new Fault("SIZE_LIMIT", `Asset ${assetId} exceeds the texture payload limit`);
    loaded.set(assetId, {
      data,
      ref: { asset_id: assetId, filename: spec.filename, bytes: bytes.length, sha256, texture_refs: textureRefs },
    });
  }
  const byTextureRef = new Map<string, string>();
  for (const texture of textures) {
    if (!texture.asset_id) continue;
    const loadedAsset = loaded.get(texture.asset_id);
    if (!loadedAsset) throw new Fault("ASSET_NOT_FOUND", `Asset ${texture.asset_id} was not loaded`);
    texture.png = loadedAsset.data;
    byTextureRef.set(String(texture.ref ?? texture.name), texture.asset_id);
    delete texture.asset_id;
  }
  return {
    task: task as HighLevelTask,
    refs: [...loaded.values()].map((entry) => entry.ref),
    byTextureRef,
  };
}

function redactHighLevelOperations(
  generated: Record<string, unknown>[],
  byTextureRef: Map<string, string>,
) {
  return generated.map((operation) => {
    if (operation.op !== "texture.add" || typeof operation.png !== "string")
      return operation;
    const { png, ...rest } = operation;
    const textureRef = String(rest.ref ?? rest.name ?? "");
    const assetId = byTextureRef.get(textureRef);
    return {
      ...rest,
      ...(assetId ? { asset_id: assetId } : {}),
      asset_payload: "omitted",
      asset_bytes: Math.max(0, Math.floor((png.length - "data:image/png;base64,".length) * 3 / 4)),
    };
  });
}

function evaluateHighLevelAssertions(
  assertions: HighLevelAssertions,
  diagnosis: any,
  snapshot: any,
  exported: any,
) {
  const checks: Record<string, unknown>[] = [];
  const check = (name: string, passed: boolean, expected: unknown, actual: unknown, message: string) =>
    checks.push({ name, passed, expected, actual, ...(passed ? {} : { message }) });
  const counts = snapshot?.counts ?? {};
  const diagnosticCounts = diagnosis?.counts ?? {};
  const issues = Array.isArray(diagnosis?.issues) ? diagnosis.issues : [];
  const nodes = Array.isArray(snapshot?.nodes) ? snapshot.nodes : [];
  const textures = Array.isArray(snapshot?.textures) ? snapshot.textures : [];
  const animations = Array.isArray(snapshot?.animations) ? snapshot.animations : [];
  if (assertions.format !== undefined)
    check("format", snapshot?.format === assertions.format, assertions.format, snapshot?.format, "Unexpected project format");
  for (const [key, actual] of Object.entries(diagnosticCounts)) {
    const max = assertions[`max_${key}` as keyof HighLevelAssertions] as number | undefined;
    if (max !== undefined) check(`max_${key}`, Number(actual) <= max, max, actual, `Diagnostic ${key} count exceeds the limit`);
  }
  const countChecks: [string, number | undefined, number | undefined][] = [
    ["nodes", assertions.min_nodes, assertions.max_nodes],
    ["textures", assertions.min_textures, assertions.max_textures],
    ["animations", assertions.min_animations, assertions.max_animations],
  ];
  for (const [key, min, max] of countChecks) {
    const actual = Number(counts[key] ?? 0);
    if (min !== undefined) check(`min_${key}`, actual >= min, min, actual, `${key} count is below the minimum`);
    if (max !== undefined) check(`max_${key}`, actual <= max, max, actual, `${key} count exceeds the maximum`);
  }
  const meshVertices = nodes.reduce((total: number, node: any) => total + (node.type === "mesh" ? Object.keys(node.vertices ?? {}).length : 0), 0);
  const meshFaces = nodes.reduce((total: number, node: any) => total + (node.type === "mesh" ? Object.keys(node.faces ?? {}).length : 0), 0);
  if (assertions.max_mesh_vertices !== undefined)
    check("max_mesh_vertices", meshVertices <= assertions.max_mesh_vertices, assertions.max_mesh_vertices, meshVertices, "Mesh vertex count exceeds the maximum");
  if (assertions.max_mesh_faces !== undefined)
    check("max_mesh_faces", meshFaces <= assertions.max_mesh_faces, assertions.max_mesh_faces, meshFaces, "Mesh face count exceeds the maximum");
  for (const [kind, expected, actual] of [
    ["node", assertions.required_node_ids, new Set(nodes.map((node: any) => node.id))],
    ["texture", assertions.required_texture_ids, new Set(textures.map((texture: any) => texture.id))],
    ["animation", assertions.required_animation_ids, new Set(animations.map((animation: any) => animation.id))],
  ] as const) {
    if (!expected) continue;
    const missing = expected.filter((id) => !actual.has(id));
    check(`required_${kind}_ids`, missing.length === 0, expected, expected.filter((id) => !missing.includes(id)), `Required ${kind} IDs are missing: ${missing.join(", ")}`);
  }
  if (assertions.require_no_untextured_faces) {
    const actual = issues.filter((issue: any) => issue.code === "UNTEXTURED").length;
    check("require_no_untextured_faces", actual === 0, 0, actual, "Untextured faces were found");
  }
  if (assertions.require_uv_in_bounds) {
    const actual = issues.filter((issue: any) => issue.code === "UV_OUTSIDE").length;
    check("require_uv_in_bounds", actual === 0, 0, actual, "UV coordinates extend beyond the texture bounds");
  }
  if (assertions.require_export)
    check("require_export", !!exported?.path, true, !!exported?.path, "An export result with a written path is required");
  if (assertions.export_sha256 !== undefined)
    check("export_sha256", exported?.sha256 === assertions.export_sha256.toLowerCase(), assertions.export_sha256.toLowerCase(), exported?.sha256, "Export SHA-256 does not match");
  const failed = checks.filter((entry) => entry.passed === false);
  return { passed: failed.length === 0, checks, failed_count: failed.length };
}

function evaluateHighLevelPreconditions(
  preconditions: HighLevelInput["preconditions"],
  snapshot: Record<string, unknown> | undefined,
) {
  if (!preconditions || !snapshot) return { passed: true, failed: [] as Record<string, unknown>[] };
  const failed: Record<string, unknown>[] = [];
  const counts = (snapshot.counts ?? {}) as Record<string, unknown>;
  const capabilities = (snapshot.capabilities ?? {}) as Record<string, unknown>;
  const fail = (name: string, expected: unknown, actual: unknown, message: string) =>
    failed.push({ name, expected, actual, message });
  if (preconditions.expected_revision !== undefined && snapshot.revision !== preconditions.expected_revision)
    fail("expected_revision", preconditions.expected_revision, snapshot.revision, "Project revision does not match the expected revision");
  if (preconditions.expected_format !== undefined && snapshot.format !== preconditions.expected_format)
    fail("expected_format", preconditions.expected_format, snapshot.format, "Project format does not match the expected format");
  for (const capability of preconditions.required_capabilities ?? [])
    if (capabilities[capability] !== true)
      fail(`required_capability:${capability}`, true, capabilities[capability] ?? false, `Required capability is unavailable: ${capability}`);
  for (const key of ["nodes", "textures", "animations"] as const) {
    const max = preconditions[`max_${key}`];
    if (max !== undefined && Number(counts[key] ?? 0) > max)
      fail(`max_${key}`, max, counts[key] ?? 0, `${key} count exceeds the precondition`);
  }
  return { passed: failed.length === 0, failed };
}

type NativeTaskPlan = {
  project_id: string;
  operations: Array<Record<string, unknown>>;
  summary: Record<string, unknown>;
};
// Native task plans are intentionally short lived and bounded. They are
// separate from bb_plan_edit because UI, dialog, keybind and settings
// registrations do not participate in the model edit transaction.
const nativeTaskPlans = new Map<string, NativeTaskPlan>();
function rememberNativeTaskPlan(planId: string, plan: NativeTaskPlan) {
  nativeTaskPlans.set(planId, plan);
  while (nativeTaskPlans.size > 64) {
    const oldest = nativeTaskPlans.keys().next().value as string | undefined;
    if (!oldest) break;
    nativeTaskPlans.delete(oldest);
  }
}

type ProjectIoTaskPlan = {
  project_id: string;
  snapshot_id?: string;
  actions: Array<Record<string, unknown>>;
  summary: Record<string, unknown>;
};
const projectIoTaskPlans = new Map<string, ProjectIoTaskPlan>();
function rememberProjectIoTaskPlan(planId: string, plan: ProjectIoTaskPlan) {
  projectIoTaskPlans.set(planId, plan);
  while (projectIoTaskPlans.size > 64) {
    const oldest = projectIoTaskPlans.keys().next().value as string | undefined;
    if (!oldest) break;
    projectIoTaskPlans.delete(oldest);
  }
}

function projectIoRoute(action: Record<string, unknown>, projectId: string, snapshotId?: string) {
  const type = String(action.action ?? "");
  switch (type) {
    case "import_model":
      return {
        name: "bb_import_model" as const,
        args: {
          filename: action.filename,
          codec: action.codec,
          content_type: action.content_type,
          options: action.options ?? {},
        },
      };
    case "import_animation":
      return {
        name: "bb_import_animation" as const,
        args: { project_id: projectId, filename: action.filename, codec: action.codec ?? "bedrock", names: action.names },
      };
    case "import_texture_set":
      if (!snapshotId) throw new Fault("INPUT", "project_io import_texture_set requires a planning snapshot");
      return {
        name: "bb_import_texture_set" as const,
        args: { project_id: projectId, snapshot_id: snapshotId, filename: action.filename, name: action.name },
      };
    case "export":
      return {
        name: "bb_export" as const,
        args: { project_id: projectId, codec: action.codec, filename: action.filename, options: action.options ?? {} },
      };
    case "restore_checkpoint":
      return { name: "bb_restore_checkpoint" as const, args: { filename: action.filename } };
    case "convert_copy":
      if (!snapshotId) throw new Fault("INPUT", "project_io convert_copy requires a planning snapshot");
      return { name: "bb_convert_copy" as const, args: { project_id: projectId, snapshot_id: snapshotId, format: action.target_format } };
    default:
      throw new Fault("INPUT", `Unsupported project_io action: ${type}`);
  }
}

function nativeRegistrationId(operation: Record<string, unknown>) {
  if (typeof operation.native_id === "string") return operation.native_id;
  if (typeof operation.registration_key !== "string") return undefined;
  return operation.registration_key.split(":").slice(1).join(":").split("@")[0] || undefined;
}

/** Route native task items to the most specific public command available. */
function nativeTaskRoute(operation: Record<string, unknown>, projectId: string) {
  const kind = String(operation.registration_kind ?? "");
  const id = nativeRegistrationId(operation);
  const input = (operation.arguments ?? {}) as Record<string, unknown>;
  const base = { project_id: projectId };
  // Inspection is read-only and must preserve the native catalog request.
  // Never coerce it into an execution command merely because its registration
  // kind has a typed route.
  if (operation.operation === "inspect")
    return { name: "bb_native_operation" as const, args: { ...base, ...operation } };
  if (["Action", "Tool", "SharedActionHandler"].includes(kind) && id)
    return { name: "bb_action" as const, args: { ...base, action_id: id, modifiers: input.modifiers, shared_handler_token: input.shared_handler_token, wait_for_completion: input.wait_for_completion ?? true } };
  if (["Toggle", "BarSelect", "NumSlider", "BarSlider", "BarText", "ColorPicker"].includes(kind) && id && Object.hasOwn(input, "value"))
    return { name: "bb_control" as const, args: { ...base, control_id: id, value: input.value, mode: input.mode ?? "set" } };
  if (kind === "Setting" && id && Object.hasOwn(input, "value"))
    return { name: "bb_setting" as const, args: { setting_id: id, value: input.value } };
  if (kind === "Dialog" && (typeof input.dialog_token === "string" || typeof input.token === "string"))
    return { name: "bb_dialog" as const, args: { dialog_token: input.dialog_token ?? input.token, action: input.action ?? (operation.operation === "close" ? "cancel" : operation.operation === "set" ? "set" : "confirm"), values: input.values ?? {}, controls: input.controls ?? {}, wait_for_completion: input.wait_for_completion ?? true } };
  if (kind === "Keybind" && typeof input.key === "string")
    return { name: "bb_keybind" as const, args: { ...base, keybind_id: id, key: input.key, modifiers: input.modifiers } };
  if (kind === "Menu")
    return { name: "bb_menu" as const, args: { ...base, operation: operation.operation === "close" ? "close" : operation.operation === "open" ? "open" : "trigger", action_id: input.action_id, snapshot_id: input.snapshot_id, element_id: input.element_id, interaction: input.interaction ?? "click", value: input.value, modifiers: input.modifiers } };
  if (kind === "Panel" && id)
    return { name: "bb_panel" as const, args: { ...base, panel_id: id, operation: operation.operation === "close" ? "close" : operation.operation === "open" ? "open" : "select" } };
  if (kind === "Preview" && id)
    return { name: "bb_preview" as const, args: { ...base, preview_id: id, operation: operation.operation === "close" ? "close" : operation.operation === "open" ? "open" : "select" } };
  if (kind === "Mode" && id)
    return { name: "bb_mode" as const, args: { ...base, mode_id: id } };
  if (kind === "NodeType" && id)
    return { name: "bb_node_type" as const, args: { ...base, node_type_id: id, parent_id: input.parent_id, properties: input.properties ?? input } };
  if (kind === "Property" && typeof input.node_id === "string") {
    if (operation.operation === "inspect") return { name: "bb_node_properties" as const, args: { ...base, node_id: input.node_id } };
    if (operation.operation === "edit" && typeof input.property_snapshot_id === "string" && input.values && typeof input.values === "object")
      return { name: "bb_edit_node_properties" as const, args: { ...base, node_id: input.node_id, property_snapshot_id: input.property_snapshot_id, values: input.values } };
  }
  if (kind === "ModelLoader" && id)
    return { name: "bb_loader" as const, args: { loader_id: id } };
  return { name: "bb_native_operation" as const, args: { ...base, ...operation } };
}

async function executeHighLevel(
  args: HighLevelInput,
  instanceId: string | undefined,
  requestId: string,
  report: (phase: string, progress: number) => void = () => {},
): Promise<Result> {
  const taskId = requestId;
  report(args.mode, 0.02);
  if (args.mode === "capabilities") {
    const discovered = await executeOnce(
      "bb_capabilities",
      args.capability_query ?? { kind: "all", search: "", offset: 0, limit: 100 },
      instanceId,
      `${requestId}:capabilities`,
    );
    report("capabilities", 1);
    return {
      data: {
        task_id: taskId,
        phase: "capabilities",
        capabilities: discovered.data,
      },
    };
  }
  if (args.mode === "apply") {
    if (!args.project_id || !args.plan_id)
      throw new Fault("INPUT", "project_id and plan_id are required in apply mode");
    let beforeCheckpoint: Result | undefined;
    let afterCheckpoint: Result | undefined;
    if (args.checkpoint?.before_apply_filename) {
      report("checkpoint_before_apply", 0.15);
      beforeCheckpoint = await executeOnce(
        "bb_export",
        { project_id: args.project_id, codec: "project", filename: args.checkpoint.before_apply_filename, options: {} },
        instanceId,
        `${requestId}:checkpoint_before_apply`,
      );
    }
    const projectIoPlan = projectIoTaskPlans.get(args.plan_id);
    if (projectIoPlan) {
      if (projectIoPlan.project_id !== args.project_id)
        throw new Fault("PLAN_PROJECT_MISMATCH", "Project IO plan belongs to a different project", {
          plan_id: args.plan_id,
          expected_project_id: projectIoPlan.project_id,
          project_id: args.project_id,
        });
      report("project_io_apply", 0.35);
      const results: Result[] = [];
      const dispatchedRoutes: Array<{ index: number; command: string; action: string }> = [];
      for (const [index, action] of projectIoPlan.actions.entries()) {
        const routed = projectIoRoute(action, args.project_id, projectIoPlan.snapshot_id);
        dispatchedRoutes.push({ index, command: routed.name, action: String(action.action) });
        results.push(await executeOnce(routed.name, routed.args, instanceId, `${requestId}:project_io:${index}`));
        report("project_io_apply", 0.35 + ((index + 1) / projectIoPlan.actions.length) * 0.4);
      }
      if (args.checkpoint?.after_apply_filename) {
        report("checkpoint_after_apply", 0.85);
        afterCheckpoint = await executeOnce(
          "bb_export",
          { project_id: args.project_id, codec: "project", filename: args.checkpoint.after_apply_filename, options: {} },
          instanceId,
          `${requestId}:checkpoint_after_apply`,
        );
      }
      report("applied", 1);
      return {
        data: {
          task_id: taskId,
          phase: "applied",
          project_id: args.project_id,
          plan_id: args.plan_id,
          result: {
            completion: "project_io_actions_dispatched",
            operation_count: results.length,
            dispatched_routes: dispatchedRoutes,
            operations: results.map((result) => result.data),
          },
          ...(beforeCheckpoint || afterCheckpoint
            ? { checkpoints: { before_apply: beforeCheckpoint?.data, after_apply: afterCheckpoint?.data } }
            : {}),
        },
        images: results.flatMap((result) => result.images ?? []),
      };
    }
    const nativePlan = nativeTaskPlans.get(args.plan_id);
    if (nativePlan && nativePlan.project_id !== args.project_id)
      throw new Fault("PLAN_PROJECT_MISMATCH", "Native task plan belongs to a different project", {
        plan_id: args.plan_id,
        expected_project_id: nativePlan.project_id,
        project_id: args.project_id,
      });
    if (nativePlan) {
      report("native_apply", 0.45);
      const results: Result[] = [];
      const dispatchedRoutes: Array<{ index: number; command: string }> = [];
      for (const [index, operation] of nativePlan.operations.entries()) {
        const routed = nativeTaskRoute(operation, args.project_id);
        dispatchedRoutes.push({ index, command: routed.name });
        results.push(await executeOnce(
          routed.name,
          routed.args,
          instanceId,
          `${requestId}:native:${index}`,
        ));
        report("native_apply", 0.45 + ((index + 1) / nativePlan.operations.length) * 0.35);
      }
      if (args.checkpoint?.after_apply_filename) {
        report("checkpoint_after_apply", 0.85);
        afterCheckpoint = await executeOnce(
          "bb_export",
          { project_id: args.project_id, codec: "project", filename: args.checkpoint.after_apply_filename, options: {} },
          instanceId,
          `${requestId}:checkpoint_after_apply`,
        );
      }
      report("applied", 1);
      return {
        data: {
          task_id: taskId,
          phase: "applied",
          project_id: args.project_id,
          plan_id: args.plan_id,
          result: {
            completion: "native_operations_dispatched",
            operation_count: results.length,
            dispatched_routes: dispatchedRoutes,
            operations: results.map((result) => result.data),
          },
          ...(beforeCheckpoint || afterCheckpoint
            ? { checkpoints: { before_apply: beforeCheckpoint?.data, after_apply: afterCheckpoint?.data } }
            : {}),
        },
        images: results.flatMap((result) => result.images ?? []),
      };
    }
    report("apply", 0.45);
    const applied = await executeOnce(
      "bb_apply_plan",
      { project_id: args.project_id, plan_id: args.plan_id },
      instanceId,
      `${requestId}:apply`,
    );
    if (args.checkpoint?.after_apply_filename) {
      report("checkpoint_after_apply", 0.85);
      afterCheckpoint = await executeOnce(
        "bb_export",
        { project_id: args.project_id, codec: "project", filename: args.checkpoint.after_apply_filename, options: {} },
        instanceId,
        `${requestId}:checkpoint_after_apply`,
      );
    }
    report("applied", 1);
    return {
      data: {
        task_id: taskId,
        phase: "applied",
        project_id: args.project_id,
        plan_id: args.plan_id,
        result: applied.data,
        ...(beforeCheckpoint || afterCheckpoint
          ? { checkpoints: { before_apply: beforeCheckpoint?.data, after_apply: afterCheckpoint?.data } }
          : {}),
      },
      images: applied.images,
    };
  }

  if (args.mode === "verify") {
    if (!args.project_id || !args.verify)
      throw new Fault("INPUT", "project_id and verify are required in verify mode");
    const verification: Record<string, unknown> = {};
    const images: NonNullable<Result["images"]> = [];
    const verify = args.verify;
    report("verify", 0.05);
    let diagnosisData: any;
    let snapshotData: any;
    let exportData: any;
    if (verify.diagnose || verify.assertions) {
      const diagnosed = await executeOnce(
        "bb_diagnose",
        { project_id: args.project_id },
        instanceId,
        `${requestId}:diagnose`,
      );
      diagnosisData = diagnosed.data;
      if (verify.diagnose) verification.diagnose = diagnosed.data;
      report("diagnose", 0.25);
    }
    if (verify.assertions) {
      const snapshot = await executeOnce(
        "bb_snapshot",
        { project_id: args.project_id, limit: 1000 },
        instanceId,
        `${requestId}:assertions_snapshot`,
      );
      snapshotData = snapshot.data;
      verification.state = snapshotSummary(snapshot.data);
      report("assertions_snapshot", 0.35);
    }
    if (verify.capture) {
      const captured = await executeOnce(
        "bb_capture",
        { project_id: args.project_id, ...verify.capture },
        instanceId,
        `${requestId}:capture`,
      );
      verification.capture = captured.data;
      if (captured.images) images.push(...captured.images);
      report("capture", 0.5);
    }
    if (verify.animation_frames) {
      const frames = await executeOnce(
        "bb_animation_frames",
        { project_id: args.project_id, ...verify.animation_frames },
        instanceId,
        `${requestId}:animation_frames`,
      );
      verification.animation_frames = frames.data;
      if (frames.images) images.push(...frames.images);
      report("animation_frames", 0.62);
    }
    if (verify.conversion_format) {
      const conversion = await executeOnce(
        "bb_conversion_preview",
        { project_id: args.project_id, format: verify.conversion_format },
        instanceId,
        `${requestId}:conversion_preview`,
      );
      verification.conversion_preview = conversion.data;
      report("conversion_preview", 0.72);
    }
    if (verify.export) {
      const exported = await executeOnce(
        "bb_export",
        { project_id: args.project_id, ...verify.export },
        instanceId,
        `${requestId}:export`,
      );
      exportData = exported.data;
      verification.export = exported.data;
      if (exported.images) images.push(...exported.images);
      report("export", 0.84);
    }
    if (verify.assertions) {
      const assertions = evaluateHighLevelAssertions(verify.assertions, diagnosisData, snapshotData, exportData);
      verification.assertions = assertions;
      if (!assertions.passed && verify.assertions.on_failure === "error")
        throw new Fault("VERIFICATION_FAILED", "High-level verification assertions failed", assertions);
    }
    report("verified", 1);
    return {
      data: {
        task_id: taskId,
        phase: "verified",
        project_id: args.project_id,
        verification,
      },
      ...(images.length ? { images } : {}),
    };
  }

  if (!args.task) throw new Fault("INPUT", "task is required in plan mode");
  report("resolve_assets", 0.1);
  const resolved = await resolveHighLevelAssets(args);
  const task = resolved.task!;
  let projectId = args.project_id;
  let createdProject: Record<string, unknown> | undefined;
  if (!projectId) {
    if (task.kind !== "build_model" || !task.create_project)
      throw new Fault("INPUT", "build_model.create_project is required when project_id is omitted");
    const created = await executeOnce(
      "bb_create_project",
      task.create_project,
      instanceId,
      `${requestId}:create_project`,
    );
    createdProject = created.data;
    projectId = String(created.data.project_id);
    report("project_created", 0.2);
  }

  const generated = highLevelOperations(task);
  const workflow = buildCanonicalWorkflow(task.kind, generated);
  const summary = highLevelSummary(task, generated);
  let snapshotId = args.snapshot_id;
  let snapshot: Record<string, unknown> | undefined;
  const readOnlyTask = task.kind === "inspect_model" || task.kind === "compare_model" || task.kind === "repair_model";
  if (!snapshotId || readOnlyTask) {
    const captured = await executeOnce(
      "bb_snapshot",
      {
        project_id: projectId,
        limit: 1000,
        ...(task.kind === "compare_model" ? { since_snapshot_id: task.base_snapshot_id } : {}),
      },
      instanceId,
      `${requestId}:snapshot`,
    );
    snapshot = captured.data;
    snapshotId = String(captured.data.snapshot_id);
    report("snapshot", 0.35);
  } else if (args.preconditions) {
    const captured = await executeOnce(
      "bb_snapshot",
      { project_id: projectId, limit: 1000 },
      instanceId,
      `${requestId}:preconditions_snapshot`,
    );
    snapshot = captured.data;
    report("preconditions_snapshot", 0.35);
  }
  const preconditions = evaluateHighLevelPreconditions(args.preconditions, snapshot);
  if (!preconditions.passed)
    throw new Fault("PRECONDITION_FAILED", "High-level preconditions failed", preconditions);
  if (task.kind === "inspect_model") {
    const inspection: Record<string, unknown> = {
      sections: Object.entries(task.include).filter(([, enabled]) => enabled).map(([section]) => section),
      ...(task.include.snapshot
        ? { snapshot: snapshotSummary(snapshot), ...(args.detail === "full" ? { snapshot_data: snapshot } : {}) }
        : {}),
    };
    if (task.query) {
      const queried = await executeOnce("bb_query", { project_id: projectId, query: task.query }, instanceId, `${requestId}:inspect:query`);
      inspection.query = queried.data;
    }
    if (task.include.diagnostics) {
      const diagnosed = await executeOnce("bb_diagnose", { project_id: projectId }, instanceId, `${requestId}:inspect:diagnose`);
      inspection.diagnostics = diagnosed.data;
    }
    report("inspected", 1);
    return { data: { task_id: taskId, phase: "inspected", project_id: projectId, snapshot_id: snapshotId, summary, workflow: { version: workflow.version, operation_count: 0, route_counts: workflow.route_counts }, inspection } };
  }
  if (task.kind === "compare_model") {
    const comparison: Record<string, unknown> = {
      base_snapshot_id: task.base_snapshot_id,
      current_snapshot_id: snapshotId,
      sections: Object.entries(task.include).filter(([, enabled]) => enabled).map(([section]) => section),
      snapshot: snapshotSummary(snapshot),
      ...(args.detail === "full" ? { snapshot_data: snapshot } : {}),
    };
    if (task.query) {
      const queried = await executeOnce("bb_query", { project_id: projectId, query: task.query }, instanceId, `${requestId}:compare:query`);
      comparison.query = queried.data;
    }
    report("compared", 1);
    return { data: { task_id: taskId, phase: "compared", project_id: projectId, snapshot_id: snapshotId, summary, workflow: { version: workflow.version, operation_count: 0, route_counts: workflow.route_counts }, comparison } };
  }
  let repairDiagnosis: Record<string, unknown> | undefined;
  if (task.kind === "repair_model" && task.diagnose) {
    const diagnosed = await executeOnce("bb_diagnose", { project_id: projectId }, instanceId, `${requestId}:repair:diagnose`);
    repairDiagnosis = diagnosed.data;
    if (task.require_clean_diagnosis && Number((repairDiagnosis as any).counts?.errors ?? 0) > 0)
      throw new Fault("REPAIR_DIAGNOSIS_NOT_CLEAN", "Repair task requires a clean diagnosis before applying operations", repairDiagnosis);
  }
  if (task.kind === "project_io") {
    const planId = randomUUID();
    rememberProjectIoTaskPlan(planId, {
      project_id: projectId,
      snapshot_id: snapshotId,
      actions: task.actions,
      summary,
    });
    report("planned", 1);
    return {
      data: {
        task_id: taskId,
        phase: "planned",
        project_id: projectId,
        snapshot_id: snapshotId,
        plan_id: planId,
        created_project: createdProject,
        preflight: snapshotSummary(snapshot),
        summary,
        workflow: { version: workflow.version, operation_count: task.actions.length, route_counts: workflow.route_counts },
        project_io_plan: true,
        actions: args.detail === "full" ? task.actions : undefined,
        warnings: [],
      },
    };
  }
  if (task.kind === "native" || task.kind === "editor_context") {
    const planId = randomUUID();
    const nativeOperations = task.operations.map((operation) => ({
      registration_kind: operation.registration_kind,
      native_id: operation.native_id,
      registration_key: operation.registration_key,
      operation: operation.operation,
      arguments: operation.arguments,
    }));
    rememberNativeTaskPlan(planId, {
      project_id: projectId,
      operations: nativeOperations,
      summary,
    });
    report("planned", 1);
    return {
      data: {
        task_id: taskId,
        phase: "planned",
        project_id: projectId,
        snapshot_id: snapshotId,
        plan_id: planId,
        created_project: createdProject,
        preflight: snapshotSummary(snapshot),
        summary,
        native_plan: true,
        ...(task.kind === "editor_context" ? { editor_context_plan: true } : {}),
        workflow: {
          version: workflow.version,
          operation_count: nativeOperations.length,
          route_counts: workflow.route_counts,
          native: true,
        },
        operations: args.detail === "full" ? nativeOperations : undefined,
        warnings: [],
      },
    };
  }
  if (!generated.length) {
    report("planned", 1);
    return {
      data: {
        task_id: taskId,
        phase: "planned",
        project_id: projectId,
        snapshot_id: snapshotId,
        plan_id: null,
        created_project: createdProject,
        preflight: snapshotSummary(snapshot),
        summary,
        workflow: {
          version: workflow.version,
          operation_count: workflow.operation_count,
          route_counts: workflow.route_counts,
        },
        ...(repairDiagnosis ? { repair_diagnosis: repairDiagnosis } : {}),
        ...(resolved.refs.length ? { asset_refs: resolved.refs } : {}),
        warnings: [],
        no_op: true,
      },
    };
  }
  const planned = await executeOnce(
    "bb_plan_edit",
    {
      project_id: projectId,
      snapshot_id: snapshotId,
      label: args.label,
      operations: generated,
    },
    instanceId,
    `${requestId}:plan`,
  );
  report("planned", 1);
  const planData = planned.data as Record<string, unknown>;
  return {
    data: {
      task_id: taskId,
      phase: "planned",
      project_id: projectId,
      snapshot_id: snapshotId,
      plan_id: planData.plan_id,
      created_project: createdProject,
      preflight: snapshotSummary(snapshot),
      summary,
      ...(repairDiagnosis ? { repair_diagnosis: repairDiagnosis } : {}),
      workflow: {
        version: workflow.version,
        operation_count: workflow.operation_count,
        route_counts: workflow.route_counts,
      },
      changes: planData.changes,
      created: planData.created,
      warnings: planData.warnings,
      plan_summary: planData.summary,
      ...(resolved.refs.length ? { asset_refs: resolved.refs } : {}),
      ...(args.detail === "full"
        ? { operations: args.include_assets ? generated : redactHighLevelOperations(generated, resolved.byTextureRef) }
        : {}),
    },
  };
}
// Covers file writes as well as plugin mutations. Retrying a completed export
// must return the original path, rather than attempt another write.
const operations = new Map<
  string,
  {
    fingerprint: string;
    promise: Promise<Result>;
    bytes: number;
    done: boolean;
  }
>();
async function executeOnce(
  name: CommandName,
  args: any,
  instanceId: string | undefined,
  requestId: string,
): Promise<Result> {
  const fingerprint = stable({ name, args, instanceId });
  const previous = operations.get(requestId);
  if (previous) {
    if (previous.fingerprint !== fingerprint)
      throw new Fault(
        "REQUEST_ID_REUSED",
        "operation_id was reused with different arguments",
      );
    return previous.promise;
  }
  const entry = {
    fingerprint,
    promise: execute(name, args, instanceId, requestId),
    bytes: fingerprint.length,
    done: false,
  };
  operations.set(requestId, entry);
  try {
    const result = await entry.promise;
    entry.bytes += stable(result).length;
    entry.done = true;
    while (
      operations.size > 128 ||
      Array.from(operations.values()).reduce((n, e) => n + e.bytes, 0) >
        64000000
    ) {
      const oldest = Array.from(operations.entries()).find(([, e]) => e.done);
      if (!oldest) break;
      operations.delete(oldest[0]);
    }
    return result;
  } catch (error) {
    operations.delete(requestId);
    throw error;
  }
}

type HighLevelRequest = {
  fingerprint: string;
  promise: Promise<Result>;
  bytes: number;
  done: boolean;
  phase: string;
  progress: number;
  started_at: number;
  updated_at: number;
  result?: Result;
  error?: ReturnType<typeof errorData>;
};
const highLevelRequests = new Map<string, HighLevelRequest>();
async function executeHighLevelOnce(
  args: HighLevelInput,
  instanceId: string | undefined,
  requestId: string,
): Promise<Result> {
  const fingerprint = stable({ name: "bb_task", args, instanceId });
  const previous = highLevelRequests.get(requestId);
  if (previous) {
    if (previous.fingerprint !== fingerprint)
      throw new Fault("REQUEST_ID_REUSED", "operation_id was reused with different arguments");
    return previous.promise;
  }
  const startedAt = Date.now();
  const entry: HighLevelRequest = {
    fingerprint,
    promise: undefined as unknown as Promise<Result>,
    bytes: fingerprint.length,
    done: false,
    phase: args.mode,
    progress: 0,
    started_at: startedAt,
    updated_at: startedAt,
  };
  const report = (phase: string, progress: number) => {
    entry.phase = phase;
    entry.progress = Math.max(0, Math.min(1, progress));
    entry.updated_at = Date.now();
  };
  entry.promise = executeHighLevel(args, instanceId, requestId, report);
  highLevelRequests.set(requestId, entry);
  try {
    const rawResult = await entry.promise;
    const finishedAt = Date.now();
    const result: Result = {
      ...rawResult,
      data: {
        ...rawResult.data,
        audit: {
          request_id: requestId,
          mode: args.mode,
          started_at: new Date(entry.started_at).toISOString(),
          finished_at: new Date(finishedAt).toISOString(),
          duration_ms: finishedAt - entry.started_at,
        },
      },
    };
    entry.result = result;
    entry.bytes += stable(result).length;
    entry.done = true;
    entry.progress = 1;
    entry.updated_at = finishedAt;
    while (
      highLevelRequests.size > 64 ||
      Array.from(highLevelRequests.values()).reduce((n, e) => n + e.bytes, 0) > 32000000
    ) {
      const oldest = Array.from(highLevelRequests.entries()).find(([, e]) => e.done);
      if (!oldest) break;
      highLevelRequests.delete(oldest[0]);
    }
    return result;
  } catch (error) {
    entry.error = errorData(error);
    entry.done = true;
    entry.phase = "failed";
    entry.progress = 1;
    entry.updated_at = Date.now();
    throw error;
  }
}

const highLevelWireSchema = highLevelSchema.extend({
  instance_id: z.string().uuid().optional(),
  operation_id: z.string().uuid().optional(),
});
server.registerTool(
  "bb_task",
  {
    description:
      "Run a typed Blockbench intent workflow. capabilities negotiates the installed native surface; plan builds an atomic bb_plan_edit from build_model, layout_uv, paint_texture, animate, mesh_rig, spline, repair_model, geometry_edit or a dependency-ordered pipeline/automation. inspect_model and compare_model provide read-only snapshots and diffs; project_io plans bounded imports, exports, conversions and checkpoint restores; editor_context plans a bounded sequence of UI, mode, setting and panel registrations. The native task accepts a bounded sequence of exact Blockbench 5.1.6 registrations and applies each item through its most-specific typed command (bb_action, bb_control, bb_menu, bb_keybind, bb_panel, bb_preview, bb_mode, bb_node_type, property, setting or loader), retaining bb_native_operation as an explicit audit fallback for codec and provider-owned boundaries. mesh_rig supports typed transforms and normalized vertex weights; spline supports control vertices, handles and render/UV settings; animate supports sound, particle and timeline effect keys; build_model supports material texture groups; paint_texture accepts typed pixel edits and staged PNG asset_id references; apply consumes the returned plan_id and can write before/after checkpoints; verify bundles diagnosis, captures, animation frames, conversion preview, export and machine-checkable assertions. Progress and audit metadata are available through bb_job and every result. The low-level tools remain available for native or one-off operations. Official plugin-specific adapters are not implied.",
    inputSchema: highLevelWireSchema.shape,
    outputSchema: { result: z.record(z.string(), z.unknown()) },
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      openWorldHint: true,
    },
  },
  async (raw: any) => {
    const request_id = raw.operation_id ?? randomUUID();
    try {
      const parsed = highLevelWireSchema.parse(raw);
      const { instance_id, operation_id, ...input } = parsed;
      const args = highLevelSchema.parse(input);
      const result = await executeHighLevelOnce(args, instance_id, request_id);
      const data = { ...result.data, request_id };
      return {
        content: [
          { type: "text" as const, text: JSON.stringify(data) },
          ...(result.images ?? []).flatMap((img) => [
            { type: "text" as const, text: img.label },
            { type: "image" as const, data: img.data, mimeType: img.mimeType },
          ]),
        ],
        structuredContent: { result: data },
      };
    } catch (e) {
      const error = { ...errorData(e), request_id };
      return {
        isError: true,
        content: [{ type: "text" as const, text: JSON.stringify(error) }],
        structuredContent: { result: { error } },
      };
    }
  },
);
for (const [name, definition] of Object.entries(commands)) {
  const schema = definition.schema.extend({
    instance_id: z.string().uuid().optional(),
    operation_id: z.string().uuid().optional(),
  });
  server.registerTool(
    name,
    {
      description: definition.description,
      inputSchema: schema.shape,
      outputSchema: { result: z.record(z.string(), z.unknown()) },
      annotations: {
        readOnlyHint: definition.read,
        destructiveHint: !definition.read,
        openWorldHint: [
          "bb_mesh_operation",
          "bb_action",
          "bb_native_operation",
          "bb_dialog",
          "bb_setting",
          "bb_extension",
          "bb_control",
          "bb_loader",
          "bb_import_model",
          "bb_import_animation",
          "bb_edit_node_properties",
          "bb_ui_interact",
          "bb_file_reply",
        ].includes(name),
      },
    },
    async (raw: any) => {
      const request_id = raw.operation_id ?? randomUUID();
      try {
        const parsed = schema.parse(raw);
        const { instance_id, operation_id, ...input } = parsed;
        const args = definition.schema.parse(input);
        const result = await executeOnce(
          name as CommandName,
          args,
          instance_id,
          request_id,
        );
        const data = { ...result.data, request_id };
        return {
          content: [
            { type: "text" as const, text: JSON.stringify(data) },
            ...(result.images ?? []).flatMap((img) => [
              { type: "text" as const, text: img.label },
              {
                type: "image" as const,
                data: img.data,
                mimeType: img.mimeType,
              },
            ]),
          ],
          structuredContent: { result: data },
        };
      } catch (e) {
        const error = { ...errorData(e), request_id };
        return {
          isError: true,
          content: [{ type: "text" as const, text: JSON.stringify(error) }],
          structuredContent: { result: { error } },
        };
      }
    },
  );
}
server.registerResource(
  "workflow",
  "ruins-blockbench://workflow",
  {
    mimeType: "text/plain",
    description: "Recommended creation and verification workflow",
  },
  async (uri) => ({
    contents: [
      {
        uri: uri.href,
        text: "1. bb_status / bb_projects (or bb_task)\n2. bb_snapshot\n3. bb_templates or explicit operations\n4. bb_plan_edit\n5. bb_apply_plan\n6. bb_capture / bb_diagnose / bb_animation_frames\n7. bb_export codec=project for checkpoint, and selected game codec for distribution.\nUse bb_protection to lock completed parts. UV sizes and pixel sizes differ. Read-only queries must not change selection. bb_task keeps the same plan/apply/verify boundary for intent-level workflows.",
      },
    ],
  }),
);
let closing = false;
async function close() {
  if (closing) return;
  closing = true;
  await server.close();
  await bridge.close();
}
process.on("SIGINT", () => {
  void close().finally(() => process.exit(0));
});
process.on("SIGTERM", () => {
  void close().finally(() => process.exit(0));
});
process.stdin.on("end", () => {
  void close().finally(() => process.exit(0));
});
console.error(`Ruin's BlockBenchMCP ready on 127.0.0.1:${config.port}`);
await server.connect(new StdioServerTransport());
