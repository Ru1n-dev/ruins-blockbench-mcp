import type { BB } from "./adapter.ts";

export function installEndimations(b: BB) {
  let restore: (() => void) | undefined;
  function sync(plugin: any, unloaded = false) {
    if (plugin?.id !== "endimations_exporter" || plugin.version !== "1.0.0")
      return;
    restore?.();
    restore = undefined;
    if (unloaded) return;
    const action = b.BarItems.export_endimations;
    if (!action) return;
    const original = action.click;
    let restoreDialog: (() => void) | undefined;
    const fixed = function (this: any, ...args: any[]) {
      restoreDialog?.();
      const result = original.apply(this, args);
      const dialog = b.Dialog.open;
      if (dialog?.id === "animation_export") {
        const keys = b.Animation.all.map((a: any) => String(a.name.hashCode()));
        const confirm = dialog.onConfirm;
        const guarded = function (this: any, values: any, ...rest: any[]) {
          if (!keys.some((key: string) => values[key])) {
            this.hide();
            return;
          }
          return confirm.call(this, values, ...rest);
        };
        dialog.onConfirm = guarded;
        restoreDialog = () => {
          if (dialog.onConfirm === guarded) dialog.onConfirm = confirm;
        };
      }
      return result;
    };
    action.click = fixed;
    restore = () => {
      restoreDialog?.();
      if (action.click === fixed) action.click = original;
    };
  }
  return { sync, dispose: () => restore?.() };
}
