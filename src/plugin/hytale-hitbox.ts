import type { BB } from "./adapter.ts";
export function installHytaleHitbox(b: BB) {
  const proto = b.BBPlugin.prototype,
    load = proto.runOnLoad;
  const loaded = function (this: any, ...args: any[]) {
    if (this.id !== "hytale_hitbox_helper" || this.version !== "1.0.1")
      return load.apply(this, args);
    const conditions = new Map<any, any>();
    for (const id of [
      "import_project",
      "import_bbmodel",
      "import_obj",
      "import_gltf",
      "import_image",
      "extrude_texture",
    ])
      if (b.BarItems[id])
        conditions.set(b.BarItems[id], b.BarItems[id].condition);
    const previousFormat = b.Formats.hytale_hitbox,
      addCSS = b.Blockbench.addCSS,
      styles: any[] = [];
    b.Blockbench.addCSS = function (this: any, ...values: any[]) {
      const style = addCSS.apply(this, values);
      styles.push(style);
      return style;
    };
    let result;
    try {
      result = load.apply(this, args);
    } finally {
      b.Blockbench.addCSS = addCSS;
    }
    const action = b.BarItems.add_hytale_hitbox,
      click = action.click,
      unload = this.onunload,
      format = b.Formats.hytale_hitbox;
    let active = true;
    action.click = function (this: any, ...values: any[]) {
      const undo = b.Undo,
        init = undo.initEdit,
        finish = undo.finishEdit,
        elements = new Set(b.Outliner.elements),
        textures = new Set(b.Texture.all);
      const aspects: any = { elements: [], textures: [], outliner: true };
      const collect = () => {
        aspects.elements.splice(
          0,
          Infinity,
          ...b.Outliner.elements.filter((e: any) => !elements.has(e)),
        );
        aspects.textures.splice(
          0,
          Infinity,
          ...b.Texture.all.filter((t: any) => !textures.has(t)),
        );
      };
      init.call(undo, aspects);
      undo.initEdit = collect;
      let label = "Add Hytale Hitbox";
      undo.finishEdit = (_label: string) => {
        label = _label;
      };
      try {
        const result = click.apply(this, values);
        collect();
        finish.call(undo, label, aspects);
        return result;
      } catch (error) {
        if (undo.current_save) {
          collect();
          undo.cancelEdit(true);
        }
        throw error;
      } finally {
        undo.initEdit = init;
        undo.finishEdit = finish;
      }
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
        for (const [action, condition] of conditions)
          action.condition = condition;
        for (const style of styles) style.delete();
        if (b.Formats.hytale_hitbox === format) {
          format.delete();
          if (previousFormat) b.Formats.hytale_hitbox = previousFormat;
        }
        b.document.body.classList.remove("hytale_hitbox_mode");
      }
    };
    return result;
  };
  proto.runOnLoad = loaded;
  return () => {
    if (proto.runOnLoad === loaded) proto.runOnLoad = load;
  };
}
