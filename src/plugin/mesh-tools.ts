import type { BB } from "./adapter.ts";
import { Fault } from "../shared/types.ts";
import { withOutlinerUndo } from "./native-undo.ts";
import { splitVertexFans } from "./mesh-split.ts";
import { patchMeshTerrain } from "./mesh-terrain.ts";
import { patchMeshBridge } from "./mesh-bridge.ts";
import { patchMeshUV } from "./mesh-uv.ts";
export function smoothMeshVertices(
  vertices: Record<string, number[]>,
  faces: string[][],
  selected: string[],
  influence: number,
  iterations: number,
) {
  if (
    !Number.isFinite(influence) ||
    influence < 0 ||
    influence > 1 ||
    !Number.isInteger(iterations) ||
    iterations < 1 ||
    iterations > 10
  )
    throw new Fault("SMOOTH_INPUT", "Use 0–100% influence and 1–10 iterations");
  const neighbors = new Map<string, Set<string>>();
  for (const face of faces)
    for (const id of face) {
      const set = neighbors.get(id) ?? new Set();
      for (const other of face) if (other !== id) set.add(other);
      neighbors.set(id, set);
    }
  let result = Object.fromEntries(
    Object.entries(vertices).map(([id, v]) => [id, [...v]]),
  );
  for (let iteration = 0; iteration < iterations; iteration++) {
    const next = { ...result };
    for (const id of selected) {
      const near = [...(neighbors.get(id) ?? [])].filter((n) => result[n]);
      if (!result[id] || !near.length) continue;
      next[id] = result[id]!.map(
        (v, i) =>
          v +
          (near.reduce((sum, n) => sum + result[n]![i]!, 0) / near.length - v) *
            influence,
      );
    }
    result = next;
  }
  return result;
}
export function installMeshTools(b: BB) {
  let restore: (() => void) | undefined;
  const configs = new WeakMap<object, Array<{ id: string; options: any }>>();
  const proto = b.BBPlugin.prototype,
    load = proto.runOnLoad;
  const patchedLoad = function (this: any, ...args: any[]) {
    if (this.id === "mesh_tools" && this.version === "2.1.0")
      for (const config of configs.get(this) ?? [])
        if (!b.BarItems[config.id]) new b.Action(config.id, config.options);
    return load.apply(this, args);
  };
  proto.runOnLoad = patchedLoad;
  function sync(plugin: any, unloaded = false) {
    if (plugin?.id !== "mesh_tools" || plugin.version !== "2.1.0") return;
    restore?.();
    restore = undefined;
    if (unloaded) {
      b.Mesh.prototype.menu.structure = b.Mesh.prototype.menu.structure.filter(
        (id: any) =>
          id !== "@mesh_tools/tools" && id !== "@mesh_tools/operators",
      );
      b.Undo.closeAmendEditMenu();
      return;
    }
    const action = b.BarItems["@mesh_tools/laplacian_smooth"];
    if (!action) return;
    configs.set(
      plugin,
      Object.values(b.BarItems)
        .filter(
          (a: any) => a instanceof b.Action && a.id.startsWith("@mesh_tools/"),
        )
        .map((a: any) => ({
          id: a.id,
          options: { ...a, click: a.onClick, keybind: a.default_keybind },
        })),
    );
    const original = action.onClick;
    const restoreTerrain = patchMeshTerrain(b);
    const restoreBridge = patchMeshBridge(b);
    const restoreUV = patchMeshUV(b);
    const click = () => {
      const meshes = [...b.Mesh.selected],
        selected = meshes.map((m: any) => [...m.getSelectedVertices()]);
      if (!selected.some((ids) => ids.length))
        throw new Fault("SELECTION_EMPTY", "Select mesh vertices to smooth");
      const run = (amended = false, influence = 1, iterations = 1) => {
        const computed = meshes.map((m: any, i: number) =>
          smoothMeshVertices(
            m.vertices,
            Object.values(m.faces).map((f: any) => f.vertices),
            selected[i]!,
            influence,
            iterations,
          ),
        );
        b.Undo.initEdit({ elements: meshes, selection: true }, amended);
        try {
          meshes.forEach((m: any, i: number) => {
            m.vertices = computed[i];
          });
          b.Canvas.updateView({
            elements: meshes,
            element_aspects: { geometry: true, uv: true, faces: true },
            selection: true,
          });
          b.Undo.finishEdit("MTools: Laplacian Smooth selected vertices");
        } catch (error) {
          b.Undo.cancelEdit(true);
          throw error;
        }
      };
      run();
      b.Undo.amendEdit(
        {
          influence: {
            type: "range",
            value: 100,
            label: "Influence",
            min: 0,
            max: 100,
          },
          iterations: {
            type: "range",
            value: 1,
            label: "Iterations",
            min: 1,
            max: 10,
          },
        },
        (form: any) => run(true, form.influence / 100, form.iterations),
      );
    };
    action.onClick = click;
    const array = b.BarItems["@mesh_tools/array_elements"],
      arrayOriginal = array.onClick;
    const arrayClick = function (this: any, ...args: any[]) {
      const undo = b.Undo,
        amend = undo.amendEdit;
      const amendWithHierarchy = function (
        this: any,
        form: any,
        callback: any,
      ) {
        return amend.call(this, form, (...values: any[]) =>
          withOutlinerUndo(b, () => callback(...values), true),
        );
      };
      undo.amendEdit = amendWithHierarchy;
      try {
        return withOutlinerUndo(b, () => arrayOriginal.apply(this, args), true);
      } finally {
        if (undo.amendEdit === amendWithHierarchy) undo.amendEdit = amend;
      }
    };
    array.onClick = arrayClick;
    const split = b.BarItems["@mesh_tools/split_edges"],
      splitOriginal = split.onClick;
    const splitClick = () => {
      const meshes = [...b.Mesh.selected];
      const run = (angle = 180, amended = false) => {
        const plans = meshes.map((mesh: any) =>
          splitVertexFans(
            Object.entries(mesh.faces).map(([id, face]: [string, any]) => ({
              id,
              vertices: face.getSortedVertices(),
              normal: face.getNormal(true),
            })),
            angle,
          ),
        );
        b.Undo.initEdit({ elements: meshes, selection: true }, amended);
        try {
          meshes.forEach((mesh: any, i: number) => {
            for (const item of plans[i]!) {
              const newId = mesh.addVertices([
                ...mesh.vertices[item.vertex],
              ])[0];
              for (const faceId of item.faces) {
                const face = mesh.faces[faceId],
                  index = face.vertices.indexOf(item.vertex);
                face.vertices[index] = newId;
                face.uv[newId] = [...(face.uv[item.vertex] ?? [0, 0])];
                delete face.uv[item.vertex];
              }
            }
          });
          b.Canvas.updateView({
            elements: meshes,
            element_aspects: { geometry: true, uv: true, faces: true },
            selection: true,
          });
          b.Undo.finishEdit("MTools: Split edges");
        } catch (error) {
          b.Undo.cancelEdit(true);
          throw error;
        }
      };
      run();
      b.Undo.amendEdit(
        {
          angle: {
            label: "Angle (interior)",
            type: "range",
            value: 180,
            min: 0,
            max: 180,
          },
        },
        (form: any) => run(form.angle, true),
      );
    };
    split.onClick = splitClick;
    const shrink = b.BarItems["@mesh_tools/shrink_selection"],
      shrinkOriginal = shrink.onClick;
    const shrinkClick = () => {
      for (const mesh of b.Mesh.selected) {
        const before = new Set<string>(mesh.getSelectedVertices());
        const keep = new Set(before);
        for (const face of Object.values(mesh.faces) as any[])
          if (face.vertices.some((id: string) => !before.has(id)))
            for (const id of face.vertices) keep.delete(id);
        mesh.getSelectedVertices().splice(0, Infinity, ...keep);
        const mode = b.BarItems.selection_mode.value;
        if (mode !== "vertex") {
          const faces: string[] = [],
            edges: string[][] = [],
            seen = new Set<string>();
          for (const [id, face] of Object.entries(mesh.faces) as [
            string,
            any,
          ][]) {
            if (face.vertices.every((v: string) => keep.has(v))) faces.push(id);
            const vertices = face.getSortedVertices();
            vertices.forEach((v: string, i: number) => {
              const next = vertices[(i + 1) % vertices.length];
              const key = JSON.stringify([v, next].sort());
              if (
                v !== next &&
                keep.has(v) &&
                keep.has(next) &&
                !seen.has(key)
              ) {
                seen.add(key);
                edges.push([v, next]);
              }
            });
          }
          mesh
            .getSelectedFaces()
            .splice(0, Infinity, ...(mode === "edge" ? [] : faces));
          mesh
            .getSelectedEdges()
            .splice(0, Infinity, ...(mode === "edge" ? edges : []));
        }
      }
      b.Canvas.updateView({ elements: b.Mesh.selected, selection: true });
    };
    shrink.onClick = shrinkClick;
    restore = () => {
      restoreTerrain();
      restoreBridge();
      restoreUV();
      if (action.onClick === click) action.onClick = original;
      if (array.onClick === arrayClick) array.onClick = arrayOriginal;
      if (split.onClick === splitClick) split.onClick = splitOriginal;
      if (shrink.onClick === shrinkClick) shrink.onClick = shrinkOriginal;
    };
  }
  return {
    sync,
    dispose: () => {
      restore?.();
      if (proto.runOnLoad === patchedLoad) proto.runOnLoad = load;
    },
  };
}
