import type { BB } from "./adapter.ts";

export function installGroundPlane(b: BB) {
  let restore: (() => void) | undefined;
  function sync(plugin: any, unloaded = false) {
    if (plugin?.id !== "ground_plane_editor" || plugin.version !== "1.1.1")
      return;
    restore?.();
    restore = undefined;
    if (unloaded) return;
    const action = b.BarItems.edit_ground_plane_action;
    if (!action) return;
    const original = action.click;
    let restoreButton: (() => void) | undefined;
    const fixed = function (this: any, ...args: any[]) {
      restoreButton?.();
      const result = original.apply(this, args);
      const dialog = b.Dialog.open;
      const options =
        dialog?.id === "ground_plane_dialog" &&
        dialog.form?.form_data.actions?.options;
      if (options) {
        const click = options.click;
        const reset = () => {
          const material = b.Canvas.ground_plane.material;
          material.color.setHex(0x21252b);
          material.opacity = 1;
          // Persist the same primitive units used by the normal Confirm path.
          localStorage.setItem("groundPlaneColor", String(0x21252b));
          localStorage.setItem("groundPlaneOpacity", "255");
          dialog.hide();
          b.Blockbench.showQuickMessage("Reset ground plane values!", 1500);
        };
        options.click = reset;
        restoreButton = () => {
          if (options.click === reset) options.click = click;
        };
      }
      return result;
    };
    action.click = fixed;
    restore = () => {
      restoreButton?.();
      if (action.click === fixed) action.click = original;
    };
  }
  return { sync, dispose: () => restore?.() };
}
