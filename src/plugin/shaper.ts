import type { BB } from "./adapter.ts";
export function installShaper(b: BB) {
  const proto = b.BBPlugin.prototype,
    load = proto.runOnLoad;
  const loaded = function (this: any, ...args: any[]) {
    if (this.id !== "shaper" || this.version !== "1.0.0")
      return load.apply(this, args);
    const result = load.apply(this, args),
      action = b.BarItems.shaper_export_flat_json,
      click = action.click,
      unload = this.onunload;
    let dialog: any,
      active = true;
    action.click = function (this: any, ...values: any[]) {
      const result = click.apply(this, values);
      dialog = b.Dialog.open;
      return result;
    };
    this.onunload = function (this: any, ...values: any[]) {
      if (!active) return;
      active = false;
      const next = this.onload;
      this.onload = function (this: any, ...args: any[]) {
        this.onunload = unload;
        this.onload = next;
        return next.apply(this, args);
      };
      try {
        return unload.apply(this, values);
      } finally {
        action.click = click;
        if (dialog && b.Dialog.open === dialog) dialog.hide();
      }
    };
    return result;
  };
  proto.runOnLoad = loaded;
  return () => {
    if (proto.runOnLoad === loaded) proto.runOnLoad = load;
  };
}
