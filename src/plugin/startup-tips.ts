import type { BB } from "./adapter.ts";
export function installStartupTips(b: BB) {
  const proto = b.BBPlugin.prototype,
    load = proto.runOnLoad;
  const loaded = function (this: any, ...args: any[]) {
    if (this.id !== "startup_tips" || this.version !== "1.1.0")
      return load.apply(this, args);
    const show = b.Blockbench.showMessageBox,
      button = Object.getOwnPropertyDescriptor(b, "button");
    let dialog: any;
    const restoreButton = () => {
      if (button) Object.defineProperty(b, "button", button);
      else delete b.button;
    };
    const patched = function (this: any, ...values: any[]) {
      const owned = new Error().stack?.includes("(Plugin):startup_tips.js");
      if (owned) values[0] = { ...values[0], confirmIndex: 1, cancelIndex: 0 };
      const result = show.apply(this, values);
      if (owned) dialog = b.Dialog.open;
      return result;
    };
    b.Blockbench.showMessageBox = patched;
    let result;
    try {
      result = load.apply(this, args);
    } catch (error) {
      if (b.Blockbench.showMessageBox === patched)
        b.Blockbench.showMessageBox = show;
      throw error;
    } finally {
      restoreButton();
    }
    const action = b.BarItems.show_tips,
      nativeUnload = this.onunload;
    this.onunload = function (this: any, ...values: any[]) {
      const previous = Object.getOwnPropertyDescriptor(b, "button");
      b.button = action;
      try {
        return nativeUnload.apply(this, values);
      } finally {
        if (previous) Object.defineProperty(b, "button", previous);
        else delete b.button;
        if (b.Dialog.open === dialog) dialog.hide();
        if (b.Blockbench.showMessageBox === patched)
          b.Blockbench.showMessageBox = show;
        this.onunload = nativeUnload;
      }
    };
    return result;
  };
  proto.runOnLoad = loaded;
  return () => {
    if (proto.runOnLoad === loaded) proto.runOnLoad = load;
  };
}
