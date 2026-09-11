import type { BB } from "./adapter.ts";
import { repairPressurePatch } from "./brush-pressure.ts";
export function installBrushTuna(b: BB) {
  const proto = b.BBPlugin.prototype,
    load = proto.runOnLoad,
    unloads = new WeakMap<object, Function>(),
    states = new WeakMap<object, any>();
  let restorePressure: (() => void) | undefined;
  const loaded = function (this: any, ...args: any[]) {
    if (this.id !== "brush_tuna" || this.version !== "1.0.6")
      return load.apply(this, args);
    if (!unloads.has(this)) unloads.set(this, this.onunload);
    b.BrushTuna ??= states.get(this) || { brushPreset: null };
    const once = b.Blockbench.once;
    b.Blockbench.once = function (name: any, callback: any) {
      if (name !== "unloaded_plugin") return once.call(this, name, callback);
      const owned = (event: any) => {
        if (event?.plugin?.id === "brush_tuna") {
          b.Blockbench.removeListener(name, owned);
          callback(event);
        }
      };
      return b.Blockbench.on(name, owned);
    };
    let result;
    try {
      result = load.apply(this, args);
    } finally {
      b.Blockbench.once = once;
    }
    queueMicrotask(() => states.set(this, b.BrushTuna));
    if (!restorePressure) restorePressure = repairPressurePatch(b);
    const dialogs = new Set<any>(),
      show = b.Dialog.prototype.show;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const firstPreset = (event: Event) => {
      const target = event.target as Element;
      if (
        !target.closest?.(
          '[id="brush_tuna:brush_options"] .add-preset-button',
        ) ||
        b.StateMemory.brush_presets.length
      )
        return;
      const timer = setTimeout(() => {
        timers.delete(timer);
        if (
          b.StateMemory.brush_presets.length !== 1 ||
          document.querySelector('[id="brush_tuna:brush_options"] #brush-name')
        )
          return;
        const dialog = [...dialogs].find(
          (d) => d.id === "brush_tuna:brush_options" && d.object?.isConnected,
        );
        if (dialog) {
          dialog.close(dialog.cancelIndex);
          b.Painter.openBrushOptions();
        }
      }, 0);
      timers.add(timer);
    };
    document.addEventListener("click", firstPreset, true);
    const label = () => {
      document
        .querySelectorAll(
          '[id="brush_tuna:brush_options"] .add-preset-button i',
        )
        .forEach((element) => {
          if (!element.hasAttribute("aria-label"))
            element.setAttribute("aria-label", "Add brush preset");
        });
    };
    const observer = new MutationObserver(label);
    observer.observe(document.body, { childList: true, subtree: true });
    const shown = function (this: any, ...args: any[]) {
      if (this.id?.startsWith("brush_tuna:")) dialogs.add(this);
      return show.apply(this, args);
    };
    b.Dialog.prototype.show = shown;
    const action = new b.Action("brush_tuna:options", {
      name: "Brush Tuna options",
      icon: "tune",
      condition: () => b.Modes.paint,
      click: () => b.Painter.openBrushOptions(),
    });
    this.onunload = () => {
      observer.disconnect();
      document.removeEventListener("click", firstPreset, true);
      for (const timer of timers) clearTimeout(timer);
      action.delete();
      for (const d of dialogs) {
        d.close(d.cancelIndex);
        d.hide();
        d.delete();
      }
      dialogs.clear();
      if (b.Dialog.prototype.show === shown) b.Dialog.prototype.show = show;
      const state = states.get(this);
      if (b.BrushTuna === state) {
        state.brushPreset = null;
        delete b.BrushTuna;
      }
      return unloads.get(this)!.call(this);
    };
    return result;
  };
  proto.runOnLoad = loaded;
  return () => {
    restorePressure?.();
    if (proto.runOnLoad === loaded) proto.runOnLoad = load;
  };
}
