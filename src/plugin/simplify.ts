import type { BB } from "./adapter.ts";
import { Fault } from "../shared/types.ts";
export function installSimplify(b: BB) {
  let restore: (() => void) | undefined;
  function sync(plugin: any, unloaded = false) {
    if (plugin?.id !== "simplify" || plugin.version !== "1.0.0") return;
    restore?.();
    restore = undefined;
    if (unloaded) {
      b.BarItems.simplify?.delete();
      return;
    }
    const action = b.BarItems.simplify,
      original = action.click;
    const dialogs = new Map<any, any>();
    const click = function (this: any, ...args: any[]) {
      const result = original.apply(this, args),
        d = b.Dialog.open;
      if (d?.id !== "simplify_options") return result;
      dialogs.set(d, d.onConfirm);
      d.onConfirm = (values: any) => {
        const amount = values.roundAmount;
        if (!Number.isFinite(amount) || amount <= 0)
          throw new Fault(
            "SIMPLIFY_AMOUNT",
            "Rounding amount must be positive and finite",
          );
        const round = (value: number) => {
          const rounded = Math.round(value / amount) * amount;
          if (!Number.isFinite(rounded))
            throw new Fault(
              "SIMPLIFY_AMOUNT",
              "Rounding amount overflows the coordinate range",
            );
          return rounded;
        };
        const cubes = [...(values.selectOnly ? b.Cube.selected : b.Cube.all)];
        const patches = cubes.map((cube: any) => {
          const copy = cube.getUndoCopy();
          if (values.size) {
            copy.from = copy.from.map(round);
            copy.to = copy.to.map(round);
          }
          if (values.origin) copy.origin = copy.origin.map(round);
          if (values.rotation && !b.Format.rotation_snap)
            copy.rotation = copy.rotation.map(round);
          if (values.uv) {
            if (cube.box_uv) copy.uv_offset = copy.uv_offset.map(round);
            else
              for (const face of Object.values(copy.faces) as any[])
                face.uv = face.uv.map(round);
          }
          const limits = b.Format.coordinate_limits;
          if (
            Array.isArray(limits) &&
            [...copy.from, ...copy.to].some(
              (n) => n < limits[0] || n > limits[1],
            )
          )
            throw new Fault(
              "SIMPLIFY_LIMIT",
              "Rounded geometry exceeds this format's coordinate limits",
            );
          return copy;
        });
        if (!cubes.length) return;
        b.Undo.initEdit({ elements: cubes });
        try {
          cubes.forEach((cube: any, i: number) => cube.extend(patches[i]));
          b.Canvas.updateView({
            elements: cubes,
            element_aspects: { transform: true, geometry: true, uv: true },
          });
          b.Undo.finishEdit("Simplify cubes");
        } catch (error) {
          b.Undo.cancelEdit(true);
          throw error;
        }
      };
      return result;
    };
    action.click = click;
    restore = () => {
      if (action.click === click) action.click = original;
      for (const [d, confirm] of dialogs) d.onConfirm = confirm;
      dialogs.clear();
    };
  }
  return { sync, dispose: () => restore?.() };
}
