import type { BB } from "./adapter.ts";
import { Fault } from "../shared/types.ts";
export function installTintPreview(b: BB) {
  const proto = b.BBPlugin.prototype,
    load = proto.runOnLoad,
    unloads = new WeakMap<object, any>();
  const loaded = function (this: any, ...args: any[]) {
    if (this.id !== "tint_preview" || this.version !== "1.1.2")
      return load.apply(this, args);
    if (!unloads.has(this)) unloads.set(this, this.onunload);
    let active = true,
      refresh = () => {};
    const listeners: any[] = [],
      originals = new Map<any, any>(),
      materials = new Set<any>(),
      colors = new Map<any, any>(),
      dialogs = new Set<any>();
    const track = () => {
      for (const p of b.ModelProject.all) {
        for (const t of p.textures)
          if (!originals.has(t)) originals.set(t, t.getMaterial());
        for (const c of p.elements) {
          const geometry = b.ProjectData[p.uuid]?.nodes_3d?.[c.uuid]?.geometry;
          if (c instanceof b.Cube && geometry && !colors.has(geometry))
            colors.set(geometry, geometry.getAttribute("color"));
        }
      }
    };
    function scope<T>(run: () => T): T | undefined {
      if (!active) return;
      track();
      const outliner = Object.getOwnPropertyDescriptor(b.Outliner, "elements"),
        elements = b.Outliner.elements;
      Object.defineProperty(b.Outliner, "elements", {
        configurable: true,
        value: elements.filter(
          (c: any) =>
            c instanceof b.Cube &&
            b.ProjectData[b.Project?.uuid]?.nodes_3d?.[c.uuid]?.geometry,
        ),
      });
      try {
        return run();
      } finally {
        if (outliner) Object.defineProperty(b.Outliner, "elements", outliner);
        else delete b.Outliner.elements;
        for (const [t, original] of originals) {
          const material = t.getMaterial();
          if (material !== original) materials.add(material);
        }
      }
    }
    const on = b.Blockbench.on,
      codecOn = b.Codec.prototype.on;
    const register = (
      target: any,
      event: string,
      callback: any,
      method: any,
    ) => {
      const wrapped = (...args: any[]) => {
        if (!active) return;
        if (["finish_edit", "undo", "redo"].includes(event)) return refresh();
        if (!b.Project && !["unselect_project"].includes(event)) return;
        if (event === "unselect_project")
          for (const d of dialogs) if (b.Dialog.stack.includes(d)) d.hide();
        return scope(() => callback(...args));
      };
      listeners.push({ target, event, wrapped });
      return method.call(target, event, wrapped);
    };
    b.Blockbench.on = function (event: string, callback: any) {
      return register(this, event, callback, on);
    };
    b.Codec.prototype.on = function (event: string, callback: any) {
      return register(this, event, callback, codecOn);
    };
    let result;
    try {
      result = scope(() => load.apply(this, args));
    } finally {
      b.Blockbench.on = on;
      b.Codec.prototype.on = codecOn;
    }
    const toggle = b.BarItems.toggle_tint_preview,
      change = toggle.onChange,
      action = b.BarItems.set_tint_color,
      click = action.click;
    refresh = () => {
      if (
        active &&
        b.Project &&
        (b.Format.id === "java_block" || b.Format.allowTinting)
      )
        scope(() => change.call(toggle, b.StateMemory.show_tint));
    };
    toggle.onChange = function (...args: any[]) {
      return scope(() => change.apply(this, args));
    };
    action.click = function (...args: any[]) {
      const result = scope(() => click.apply(this, args)),
        d = b.Dialog.open;
      if (!d) return result;
      dialogs.add(d);
      const owner = b.Project,
        vue = d.content_vue;
      vue.palette = b.ColorPanel.palette;
      const valid = () => {
        if (!active || b.Project !== owner)
          throw new Fault("TINT_CHANGED", "Project or plugin changed");
      };
      const commit = vue.validateTintColorAndUpdate.bind(vue);
      vue.validateTintColorAndUpdate = function () {
        valid();
        const color = b.tinycolor(this.color_code);
        if (!color.isValid())
          throw new Fault("TINT_COLOR", "Enter a valid color");
        this.text_input = this.tint_color = color.toHexString();
        return scope(() => commit());
      };
      const choose = vue.setColor.bind(vue);
      vue.setColor = function (color: any) {
        valid();
        const value = b.tinycolor(color);
        if (!value.isValid())
          throw new Fault("TINT_COLOR", "Invalid palette color");
        choose(value);
        this.color_code = value.toHexString();
        return this.validateTintColorAndUpdate();
      };
      const textInput = vue.$el.querySelector('input[type="text"]');
      textInput?.addEventListener("change", () =>
        vue.validateTintColorAndUpdate(),
      );
      // Restore native modal tracking so inspected controls retain a valid dialog scope.
      b.open_dialog = d.id;
      return result;
    };
    this.onunload = function (...args: any[]) {
      if (!active) return;
      try {
        return scope(() => unloads.get(this)?.apply(this, args));
      } finally {
        active = false;
        for (const { target, event, wrapped } of listeners)
          target.removeListener(event, wrapped);
        for (const d of dialogs) {
          if (b.Dialog.stack.includes(d)) d.hide();
          d.delete();
        }
        for (const p of b.ModelProject.all)
          for (const t of p.textures) {
            const material = originals.get(t);
            if (material) {
              if (p.materials) p.materials[t.uuid] = material;
              else if (t._static?.properties)
                t._static.properties.material = material;
            }
          }
        for (const [geometry, color] of colors) {
          if (color) geometry.setAttribute("color", color);
          else geometry.deleteAttribute("color");
        }
        for (const material of materials) material.dispose();
        if (b.Project) b.Canvas.updateAll();
      }
    };
    return result;
  };
  proto.runOnLoad = loaded;
  return () => {
    if (proto.runOnLoad === loaded) proto.runOnLoad = load;
  };
}
