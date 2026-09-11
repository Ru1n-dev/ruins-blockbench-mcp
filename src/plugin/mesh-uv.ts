import type { BB } from "./adapter.ts";
import { Fault } from "../shared/types.ts";

export function patchMeshUV(b: BB) {
  const action = b.BarItems["@mesh_tools/uv_turnaround_projection"],
    original = action.onClick;
  const click = () => {
    const meshes = [...b.Mesh.selected],
      selections = meshes.map((m: any) => [...m.getSelectedFaces()]);
    const run = (margin = 0.1, split = true, amended = false) => {
      if (!Number.isFinite(margin) || margin < 0 || margin > 100)
        throw new Fault("UV_MARGIN", "Use a margin from 0 to 100 percent");
      const plans = meshes.map((mesh: any, index: number) => {
        const faces = selections[index]
          .map((id: string) => mesh.faces[id])
          .filter((f: any) => f && f.vertices.length >= 3);
        const positions = faces.flatMap((face: any) =>
          face.vertices.map((id: string) => mesh.vertices[id]),
        );
        if (!positions.length) return [];
        const min = [Infinity, Infinity, Infinity],
          max = [-Infinity, -Infinity, -Infinity];
        for (const position of positions)
          for (let axis = 0; axis < 3; axis++) {
            min[axis] = Math.min(min[axis]!, position[axis]);
            max[axis] = Math.max(max[axis]!, position[axis]);
          }
        const size = Math.min(
            b.Project._texture_width,
            b.Project._texture_height,
          ),
          factor = 1 - margin / 100;
        return faces.map((face: any) => {
          const normal = face.getNormal(true);
          if (!normal.every(Number.isFinite) || !Math.hypot(...normal))
            throw new Fault(
              "UV_DEGENERATE",
              "Cubic projection requires non-degenerate faces",
            );
          let axis = 0;
          for (let i = 1; i < 3; i++)
            if (Math.abs(normal[i]) > Math.abs(normal[axis])) axis = i;
          const dimensions = axis === 0 ? [2, 1] : axis === 1 ? [0, 2] : [0, 1];
          // Preserve the provider's six direction ordering and square cells.
          const cell = axis * 2 + (normal[axis] < 0 ? 2 : 1);
          const uv = Object.fromEntries(
            face.vertices.map((id: string) => [
              id,
              dimensions.map((dimension, i) => {
                const extent = max[dimension]! - min[dimension]!;
                const value = extent
                  ? (max[dimension]! - mesh.vertices[id][dimension]) / extent
                  : 0.5;
                return (
                  (split
                    ? (value * factor +
                        (i === 0 ? cell % 3 : cell > 3 ? 1 : 0)) /
                      3
                    : value * factor) * size
                );
              }),
            ]),
          );
          return { face, uv };
        });
      });
      b.Undo.initEdit(
        { elements: meshes, selection: true, uv_only: true, uv_mode: true },
        amended,
      );
      try {
        for (const plan of plans) for (const { face, uv } of plan) face.uv = uv;
        b.Canvas.updateView({
          elements: meshes,
          element_aspects: { uv: true, faces: true },
          selection: true,
        });
        b.updateSelection();
        b.Undo.finishEdit("MTools: Cubic UV projection", {
          elements: meshes,
          selection: true,
          uv_only: true,
          uv_mode: true,
        });
      } catch (error) {
        b.Undo.cancelEdit(true);
        throw error;
      }
    };
    run();
    b.Undo.amendEdit(
      {
        margin: {
          type: "number",
          value: 0.1,
          label: "Margin",
          min: 0,
          max: 100,
        },
        split: { type: "checkbox", label: "Split", value: true },
      },
      (form: any) => run(form.margin, form.split, true),
    );
  };
  action.onClick = click;
  const view = b.BarItems["@mesh_tools/uv_project_view"],
    viewOriginal = view.onClick;
  const runView = (callback: () => any) => {
    const elements = [...b.Mesh.selected],
      finish = b.Undo.finishEdit;
    const patched = function (this: any, label: any, aspects: any) {
      return finish.call(this, label, {
        ...aspects,
        elements,
        selection: true,
      });
    };
    b.Undo.finishEdit = patched;
    try {
      return callback();
    } finally {
      if (b.Undo.finishEdit === patched) b.Undo.finishEdit = finish;
    }
  };
  const viewClick = function (this: any, ...args: any[]) {
    const amend = b.Undo.amendEdit;
    const patched = function (this: any, form: any, callback: any) {
      return amend.call(this, form, (...values: any[]) =>
        runView(() => callback(...values)),
      );
    };
    b.Undo.amendEdit = patched;
    try {
      return runView(() => viewOriginal.apply(this, args));
    } finally {
      if (b.Undo.amendEdit === patched) b.Undo.amendEdit = amend;
    }
  };
  view.onClick = viewClick;
  return () => {
    if (action.onClick === click) action.onClick = original;
    if (view.onClick === viewClick) view.onClick = viewOriginal;
  };
}
