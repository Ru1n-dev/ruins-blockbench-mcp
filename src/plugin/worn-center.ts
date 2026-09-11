import type { BB } from "./adapter.ts";
import { Fault } from "../shared/types.ts";

export function installWornCenter(b: BB) {
  const elements = () =>
    b.Outliner.elements.filter((e: any) =>
      ["cube", "mesh", "locator"].includes(e.type),
    );
  const bounds = (list: any[], space: any) => {
    b.Project.model_3d.updateMatrixWorld(true);
    const inverse = space.matrixWorld.clone().invert(),
      box = new b.THREE.Box3(),
      v = new b.THREE.Vector3();
    for (const e of list) {
      const mesh = e.mesh,
        positions = mesh?.geometry?.attributes?.position;
      if (e.type === "locator")
        box.expandByPoint(mesh.getWorldPosition(v).applyMatrix4(inverse));
      else if (positions)
        for (let i = 0; i < positions.count; i++)
          box.expandByPoint(
            v
              .fromBufferAttribute(positions, i)
              .applyMatrix4(mesh.matrixWorld)
              .applyMatrix4(inverse),
          );
    }
    return box;
  };
  b.BarItems.custom_disp_center_model.click = () => {
    const list = elements();
    if (list.length !== b.Outliner.elements.length)
      throw new Fault(
        "CENTER_NODE",
        "Centering currently supports Cube, Mesh and Locator nodes",
      );
    const box = bounds(list, b.Project.model_3d);
    if (box.isEmpty()) return;
    const center = box.getCenter(new b.THREE.Vector3()).toArray();
    b.Undo.initEdit({ elements: list, outliner: true });
    try {
      const shift = (v: number[]) => v.map((n, i) => n - center[i]);
      for (const e of list) {
        if (e.type === "cube") {
          e.from = shift(e.from);
          e.to = shift(e.to);
          e.origin = shift(e.origin);
        } else if (e.type === "mesh") e.origin = shift(e.origin);
        else e.position = shift(e.position);
      }
      for (const g of b.Group.all) g.origin = shift(g.origin);
      b.Canvas.updateAll();
      b.Undo.finishEdit("Center model at origin");
    } catch (error) {
      b.Undo.cancelEdit(true);
      throw error;
    }
  };
  b.BarItems.custom_disp_center_pivots.click = () => {
    const groups = b.Group.selected.length
      ? b.Group.selected.slice()
      : b.Group.all.slice();
    if (!groups.length) return;
    const list = elements();
    if (list.length !== b.Outliner.elements.length)
      throw new Fault(
        "CENTER_NODE",
        "Centering currently supports Cube, Mesh and Locator nodes",
      );
    b.Undo.initEdit({ elements: list, outliner: true });
    try {
      for (const g of groups) {
        const parent = g.mesh.parent,
          box = bounds(
            list.filter((e: any) => e.isChildOf(g)),
            parent,
          );
        if (box.isEmpty()) continue;
        const center = box.getCenter(new b.THREE.Vector3());
        if (g.parent instanceof b.Group)
          center.add(new b.THREE.Vector3().fromArray(g.parent.origin));
        g.transferOrigin(center.toArray());
        b.Canvas.updateAll();
      }
      b.Undo.finishEdit("Center group pivots");
    } catch (error) {
      b.Undo.cancelEdit(true);
      throw error;
    }
  };
}
