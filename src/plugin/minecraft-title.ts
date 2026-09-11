import type { BB } from "./adapter.ts";

export function installMinecraftTitle(b: BB) {
  const proto = b.BBPlugin.prototype,
    load = proto.runOnLoad;
  const unloads = new WeakMap<object, Function>();
  const loaded = function (this: any, ...args: any[]) {
    if (this.id !== "minecraft_title_generator" || this.version !== "1.10.4")
      return load.apply(this, args);
    if (!unloads.has(this)) unloads.set(this, this.onunload);
    const condition = b.settings.shading.condition;
    const dialogs = new Set<any>(),
      timers = new Set<any>();
    let active = true;
    function scope<T>(run: () => T): T | undefined {
      if (!active) return;
      const Dialog = b.Dialog,
        timeout = b.setTimeout;
      b.Dialog = new Proxy(Dialog, {
        construct(target, values) {
          const dialog: any = Reflect.construct(target, values);
          dialogs.add(dialog);
          return dialog;
        },
      });
      b.setTimeout = (callback: Function, delay: number, ...values: any[]) => {
        const id = timeout.call(
          b,
          () => {
            timers.delete(id);
            scope(() => callback(...values));
          },
          delay,
        );
        timers.add(id);
        return id;
      };
      try {
        return run();
      } finally {
        b.Dialog = Dialog;
        b.setTimeout = timeout;
      }
    }
    const result = scope(() => load.apply(this, args));
    const nativeCondition = b.settings.shading.condition;
    const format = b.Formats.minecraft_title;
    const controls = document.getElementById(
      "minecraft-title-render-controls-container",
    );
    const vue = controls?.querySelector<any>(
      "#minecraft-title-render-controls",
    )?.__vue__;
    for (const key of ["render", "custom"]) {
      const method = vue?.[key];
      if (!method) continue;
      vue[key] = (...values: any[]) => scope(() => method(...values));
    }
    const mode = b.Modes.options.minecraft_title_render,
      select = mode.onSelect;
    mode.onSelect = (...values: any[]) =>
      scope(() => select.apply(mode, values));
    controls
      ?.querySelectorAll("#minecraft-title-render-buttons > div")
      .forEach((node, i) =>
        node.setAttribute(
          "aria-label",
          i ? "Render Minecraft Title" : "Position camera",
        ),
      );
    this.onunload = () => {
      // The provider deletes its format without calling its deactivation hook.
      // Leaving an active title must restore shading and leave render mode first.
      if (b.Modes.selected?.id === "minecraft_title_render")
        b.Modes.options.edit.select();
      if (b.Format === format) {
        format.onDeactivation?.();
        format.onDeactivation = () => {};
      }
      try {
        return unloads.get(this)!.call(this);
      } finally {
        active = false;
        for (const timer of timers) b.clearTimeout(timer);
        timers.clear();
        if (b.settings.shading.condition === nativeCondition)
          b.settings.shading.condition = condition;
        for (const dialog of dialogs) {
          dialog.hide();
          dialog.content_vue?.$destroy();
          dialog.delete();
        }
        dialogs.clear();
        vue?.$destroy();
        controls?.remove();
      }
    };
    return result;
  };
  proto.runOnLoad = loaded;
  return () => {
    if (proto.runOnLoad === loaded) proto.runOnLoad = load;
  };
}
