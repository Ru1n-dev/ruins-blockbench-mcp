import type { BB } from "./adapter.ts";
import { Fault } from "../shared/types.ts";
export function highlightEdges(cubes: number[][][]) {
  const lines: number[][] = [],
    seen = new Set<string>();
  const pairs = [
    [6, 7],
    [6, 3],
    [3, 2],
    [7, 2],
    [4, 5],
    [4, 1],
    [1, 0],
    [5, 0],
    [5, 7],
    [4, 6],
    [1, 3],
    [0, 2],
  ];
  for (const vertices of cubes) {
    if (
      vertices.length !== 8 ||
      vertices.some((v) => v.length !== 3 || !v.every(Number.isFinite))
    )
      throw new Fault(
        "HIGHLIGHT_GEOMETRY",
        "Highlight export requires eight finite vertices per cube",
      );
    for (const [i, j] of pairs) {
      const a = vertices[i!]!.map((v) => v / 16),
        b = vertices[j!]!.map((v) => v / 16),
        key = [JSON.stringify(a), JSON.stringify(b)].sort().join("|");
      if (!seen.has(key)) {
        seen.add(key);
        lines.push([...a, ...b]);
      }
    }
  }
  return { lines };
}
export function installHighlightExport(b: BB) {
  let restore: (() => void) | undefined;
  function sync(plugin: any, unloaded = false) {
    if (plugin?.id !== "highlight_generator" || plugin.version !== "1.0.0")
      return;
    restore?.();
    restore = undefined;
    const action = b.BarItems.export_highlight;
    if (unloaded || !action) return;
    const original = action.onClick;
    const click = () => {
      const content = JSON.stringify(
        highlightEdges(
          b.Cube.all
            .filter((c: any) => c.export !== false)
            .map((c: any) => c.getGlobalVertexPositions()),
        ),
        null,
        2,
      );
      return b.Blockbench.export({
        type: "Highlight Shape Export",
        extensions: ["json"],
        savetype: "text",
        content,
      });
    };
    action.onClick = click;
    restore = () => {
      if (action.onClick === click) action.onClick = original;
    };
  }
  return { sync, dispose: () => restore?.() };
}
