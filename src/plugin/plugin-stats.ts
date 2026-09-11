import type { BB } from "./adapter.ts";
import { Fault } from "../shared/types.ts";
export function downloadSeries(
  rows: Record<string, number>[],
  id: string,
  perWeek: boolean,
) {
  return rows
    .map((row, i) =>
      perWeek
        ? Math.max(0, (row[id] || 0) - (rows[i - 1]?.[id] || 0))
        : row[id] || 0,
    )
    .reverse();
}
function validRows(value: any): value is Record<string, number>[] {
  return (
    Array.isArray(value) &&
    value.length === 52 &&
    value.every(
      (row) =>
        row &&
        typeof row === "object" &&
        !Array.isArray(row) &&
        Object.values(row).every(
          (n) => typeof n === "number" && Number.isSafeInteger(n) && n >= 0,
        ),
    )
  );
}
export function installPluginStats(b: BB) {
  const proto = b.BBPlugin.prototype,
    load = proto.runOnLoad;
  const wrapped = function (this: any, ...args: any[]) {
    if (this.id !== "pluginstats" || this.version !== "1.3.0")
      return load.apply(this, args);
    const nativeLoad = this.onload;
    this.onload = function () {
      let active = true,
        dialog: any,
        work: Promise<Record<string, number>[]> | undefined;
      const controller = new AbortController();
      const data = () =>
        (work ??= (async () => {
          let cached: any;
          try {
            cached = JSON.parse(sessionStorage.getItem("ps-data") || "null");
          } catch {}
          if (validRows(cached)) return cached;
          const rows: Record<string, number>[] = Array(52);
          const batch = new AbortController();
          let index = 0;
          await Promise.all(
            Array.from({ length: 4 }, async () => {
              while (index < 52) {
                const week = index++;
                const timeout = AbortSignal.timeout(10000),
                  signal = AbortSignal.any([
                    controller.signal,
                    batch.signal,
                    timeout,
                  ]);
                const response = await fetch(
                  "https://blckbn.ch/api/stats/plugins?weeks=" + (week + 1),
                  { signal },
                );
                if (!response.ok)
                  throw new Fault(
                    "PLUGIN_STATS_NETWORK",
                    "Statistics request failed: " + response.status,
                  );
                rows[week] = await response.json();
              }
            }),
          ).catch((error) => {
            batch.abort();
            throw error;
          });
          if (!validRows(rows))
            throw new Fault("PLUGIN_STATS_DATA", "Invalid statistics response");
          if (active) sessionStorage.setItem("ps-data", JSON.stringify(rows));
          return rows;
        })().catch((error) => {
          work = undefined;
          throw error;
        }));
      const action = new b.Action("plugin_stat_action", {
        name: "View Plugin Statistics",
        icon: "trending_up",
        async click() {
          const rows = await data();
          if (!active) return;
          const plugins = b.Plugins.all
            .filter(
              (p: any) => p.source === "store" || Object.hasOwn(rows[0], p.id),
            )
            .slice()
            .sort(
              (a: any, z: any) =>
                (rows[0][z.id] || 0) - (rows[0][a.id] || 0) ||
                a.id.localeCompare(z.id),
            );
          if (!plugins.length)
            throw new Fault(
              "PLUGIN_STATS_DATA",
              "No plugin metadata is available",
            );
          const content = document.createElement("div"),
            stats = document.createElement("pre"),
            graph = document.createElementNS(
              "http://www.w3.org/2000/svg",
              "svg",
            ),
            info = document.createElement("p");
          stats.id = "ps-stats";
          graph.id = "ps-graph";
          graph.setAttribute("viewBox", "0 0 520 180");
          graph.setAttribute("width", "520");
          graph.setAttribute("height", "180");
          info.id = "ps-graph-info";
          content.append(stats, graph, info);
          let points: number[] = [],
            perWeek = true;
          const update = (form: any) => {
            const plugin = plugins.find((p: any) => p.id === form.plugin);
            if (!plugin) return;
            perWeek = !!form.per_week;
            points = downloadSeries(rows, plugin.id, perWeek);
            stats.textContent = `Rank: ${plugins.indexOf(plugin) + 1}\nAuthor: ${plugin.author || ""}\nVersion: ${plugin.version || ""}\nWeekly Downloads: ${rows[0][plugin.id] || 0}\nYearly Downloads: ${rows[51][plugin.id] || 0}`;
            graph.replaceChildren();
            const line = document.createElementNS(
              graph.namespaceURI,
              "polyline",
            );
            const max = Math.max(1, ...points);
            line.setAttribute(
              "points",
              points
                .map(
                  (v, i) => `${10 + (i / 51) * 500},${170 - (v / max) * 160}`,
                )
                .join(" "),
            );
            line.setAttribute("fill", "none");
            line.setAttribute("stroke", "var(--color-accent)");
            line.setAttribute("stroke-width", "2");
            graph.append(line);
            graph.setAttribute(
              "aria-label",
              perWeek ? "Downloads per week" : "Downloads since each week",
            );
            info.textContent = "";
          };
          graph.addEventListener("mousemove", (event) => {
            const rect = graph.getBoundingClientRect(),
              index = Math.max(
                0,
                Math.min(
                  51,
                  Math.round(
                    ((((event.clientX - rect.x) / rect.width) * 520 - 10) /
                      500) *
                      51,
                  ),
                ),
              );
            info.textContent = `${52 - index} week${index === 51 ? "" : "s"} ${perWeek ? "ago" : "window"}: ${points[index]} downloads`;
          });
          graph.addEventListener("mouseleave", () => (info.textContent = ""));
          if (dialog) {
            if (b.Dialog.stack.includes(dialog)) dialog.hide();
            dialog.delete();
          }
          dialog = new b.Dialog({
            id: "plugin_stats",
            title: "Plugin Statistics",
            width: 600,
            lines: [content],
            form: {
              plugin: {
                label: "Plugin",
                type: "select",
                options: Object.fromEntries(
                  plugins.map((p: any) => [p.id, p.title || p.id]),
                ),
                value: plugins[0].id,
              },
              per_week: { label: "Per Week", type: "checkbox", value: true },
            },
            onFormChange: update,
          });
          dialog.show();
          update(dialog.getFormResult());
        },
      });
      b.MenuBar.addAction(action, "tools");
      this.onunload = () => {
        if (!active) return;
        active = false;
        controller.abort();
        action.delete();
        if (dialog) {
          if (b.Dialog.stack.includes(dialog)) dialog.hide();
          dialog.delete();
        }
      };
    };
    try {
      return load.apply(this, args);
    } finally {
      this.onload = nativeLoad;
    }
  };
  proto.runOnLoad = wrapped;
  return () => {
    if (proto.runOnLoad === wrapped) proto.runOnLoad = load;
  };
}
