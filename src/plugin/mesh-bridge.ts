import type { BB } from "./adapter.ts";

export function patchMeshBridge(b: BB) {
  const action = b.BarItems["@mesh_tools/bridge_edge_loops"],
    original = action.onClick;
  const run = (callback: () => any) => {
    const state = b.Mesh.selected.map((mesh: any) => ({
      mesh,
      vertices: new Set(Object.keys(mesh.vertices)),
      faces: new Set(Object.keys(mesh.faces)),
    }));
    const finish = b.Undo.finishEdit;
    const patched = function (this: any, ...args: any[]) {
      for (const { mesh, vertices, faces } of state) {
        const edges = new Set<string>();
        for (const face of Object.values(mesh.faces) as any[]) {
          if (face.vertices.length < 3) continue;
          const sorted = face.getSortedVertices();
          sorted.forEach((id: string, i: number) =>
            edges.add(
              JSON.stringify([id, sorted[(i + 1) % sorted.length]].sort()),
            ),
          );
        }
        for (const [id, face] of Object.entries(mesh.faces) as [string, any][])
          if (
            !faces.has(id) &&
            face.vertices.length === 2 &&
            edges.has(JSON.stringify([...face.vertices].sort()))
          )
            delete mesh.faces[id];
        const used = new Set(
          Object.values(mesh.faces).flatMap((face: any) => face.vertices),
        );
        for (const id of Object.keys(mesh.vertices))
          if (!vertices.has(id) && !used.has(id)) delete mesh.vertices[id];
        const selected = mesh.getSelectedVertices();
        selected.splice(
          0,
          Infinity,
          ...selected.filter((id: string) => id in mesh.vertices),
        );
      }
      b.Canvas.updateView({
        elements: state.map((s: any) => s.mesh),
        element_aspects: { geometry: true, uv: true, faces: true },
        selection: true,
      });
      return finish.apply(this, args);
    };
    b.Undo.finishEdit = patched;
    try {
      return callback();
    } finally {
      if (b.Undo.finishEdit === patched) b.Undo.finishEdit = finish;
    }
  };
  const click = function (this: any, ...args: any[]) {
    const amend = b.Undo.amendEdit;
    const patched = function (this: any, form: any, callback: any) {
      return amend.call(this, form, (...values: any[]) =>
        run(() => callback(...values)),
      );
    };
    b.Undo.amendEdit = patched;
    try {
      return run(() => original.apply(this, args));
    } finally {
      if (b.Undo.amendEdit === patched) b.Undo.amendEdit = amend;
    }
  };
  action.onClick = click;
  return () => {
    if (action.onClick === click) action.onClick = original;
  };
}
