import type { BB } from "./adapter.ts";

const stateKey = Symbol.for("perfect_blockbench_mcp.duplicate_renamer.v1");

/** The fixed plugin stores its Action in an undeclared global `button`. */
export function installDuplicateRenamerLifecycle(b: BB) {
  const proto = b.BBPlugin.prototype, original = proto.runOnLoad;
  const load = function (this: any, ...args: any[]) {
    if (this.id !== "duplicate_renamer" || this.version !== "1.0.0")
      return original.apply(this, args);
    const old = this[stateKey];
    if (!old || this.onload !== old.load || this.onunload !== old.unload) {
      const nativeLoad = this.onload;
      let action: any;
      const unload = () => {
        if (action && b.BarItems.rename_duplicates === action) action.delete();
        action = undefined;
      };
      const safeLoad = function (this: any) {
        unload();
        const previous = Object.getOwnPropertyDescriptor(b, "button");
        try {
          nativeLoad.call(this);
          action = b.BarItems.rename_duplicates;
        } finally {
          if (previous) Object.defineProperty(b, "button", previous);
          else delete b.button;
        }
      };
      Object.defineProperty(this, stateKey, {
        value: {load: safeLoad, unload}, configurable: true,
      });
      this.onload = safeLoad;
      // The source unload callback only calls button.delete(). Keep ownership
      // even if a disabled plugin is later uninstalled (a second unload).
      this.onunload = unload;
    }
    return original.apply(this, args);
  };
  proto.runOnLoad = load;
  return () => { if (proto.runOnLoad === load) proto.runOnLoad = original; };
}
