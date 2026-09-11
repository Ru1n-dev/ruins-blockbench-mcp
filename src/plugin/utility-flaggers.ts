import type { BB } from "./adapter.ts";
import { Fault } from "../shared/types.ts";
export function installUtilityFlaggers(b: BB) {
  let restore: (() => void) | undefined;
  const actions = [
    "small_cube_condition",
    "decimal_cube_condition",
    "inflate_condition",
    "all_mesh_condition",
    "six_mesh_condition",
    "invalid_rotation_restriction",
    "inverted_cube_conditions",
  ];
  const predicates: Record<string, (node: any) => boolean> = {
    small_cube_condition: (n) =>
      [0, 1, 2].some((i) => n.size(i) > 0 && n.size(i) < 1),
    decimal_cube_condition: (n) => [0, 1, 2].some((i) => n.size(i) % 1 !== 0),
    inflate_condition: (n) => n.inflate !== 0,
    all_mesh_condition: () => true,
    six_mesh_condition: (n) => Object.keys(n.faces).length === 6,
    invalid_rotation_restriction: (n) =>
      n.rotation.some((v: number) => ![0, 22.5, -22.5, 45, -45].includes(v)) ||
      n.rotation.filter((v: number) => v !== 0).length > 1,
    inverted_cube_conditions: (n) => [0, 1, 2].some((i) => n.size(i) < 0),
  };
  function sync(plugin: any, unloaded = false) {
    if (plugin?.id !== "utility_flaggers" || plugin.version !== "1.1.0") return;
    restore?.();
    restore = undefined;
    if (unloaded) {
      for (const id of [
        ...actions,
        "boxuv_conditions",
        "mesh_conditions",
        "flaggers_action",
      ])
        b.BarItems[id]?.delete();
      return;
    }
    if (actions.some((id) => !b.BarItems[id])) return;
    let timer: ReturnType<typeof setInterval> | undefined, material: any;
    const touched = new Map<any, { before: any; last: any }>(),
      restorers: Array<() => void> = [];
    const stop = () => {
      clearInterval(timer);
      timer = undefined;
      for (const [mesh, state] of touched)
        if (mesh.material === state.last) mesh.material = state.before;
      touched.clear();
      material?.dispose();
      material = undefined;
    };
    const start = (id: string, data: any) => {
      const amount = Number(data.amount),
        duration = Number(data.duration),
        color =
          typeof data.color === "string"
            ? data.color
            : data.color.toHexString();
      if (
        !Number.isInteger(amount) ||
        amount < 1 ||
        amount > 100 ||
        !Number.isFinite(duration) ||
        duration < 0.1 ||
        duration > 60
      )
        throw new Fault(
          "FLAGGER_INPUT",
          "Use 1–100 flashes and 0.1–60 seconds per phase",
        );
      if (!/^#[\da-f]{6}$/i.test(color))
        throw new Fault("FLAGGER_INPUT", "Use an RGB color");
      stop();
      const nodes = (
        id === "all_mesh_condition" || id === "six_mesh_condition"
          ? b.Mesh.all
          : b.Cube.all
      ).filter(predicates[id]);
      if (!nodes.length) {
        b.Blockbench.showQuickMessage("No invalid elements to flag!");
        return;
      }
      material = new b.THREE.MeshBasicMaterial({ color });
      for (const n of nodes)
        if (n.mesh)
          touched.set(n.mesh, {
            before: n.mesh.material,
            last: n.mesh.material,
          });
      let frame = 0;
      const flash = () => {
        if (frame >= amount * 2) {
          stop();
          return;
        }
        for (const [mesh, state] of touched) {
          if (mesh.material !== state.last) state.before = mesh.material;
          state.last = frame % 2 ? state.before : material;
          mesh.material = state.last;
        }
        frame++;
      };
      timer = setInterval(flash, duration * 1000);
      flash();
    };
    for (const id of actions) {
      const action = b.BarItems[id],
        original = action.onClick;
      let dialog: any, confirm: any;
      const click = function (this: any, ...args: any[]) {
        const result = original.apply(this, args);
        dialog = b.Dialog.open;
        if (dialog) {
          if (!confirm) confirm = dialog.onConfirm;
          dialog.onConfirm = (data: any) => start(id, data);
        }
        return result;
      };
      action.onClick = click;
      restorers.push(() => {
        if (action.onClick === click) action.onClick = original;
        if (dialog) {
          if (b.Dialog.open === dialog) dialog.hide();
          dialog.onConfirm = confirm;
        }
      });
    }
    b.Blockbench.on("select_project", stop);
    restore = () => {
      stop();
      b.Blockbench.removeListener("select_project", stop);
      for (const fn of restorers) fn();
    };
  }
  return { sync, dispose: () => restore?.() };
}
