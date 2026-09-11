import type { BB } from "./adapter.ts";
import { Fault } from "../shared/types.ts";
export function installTextGenerator(b: BB) {
  const proto = b.BBPlugin.prototype,
    load = proto.runOnLoad;
  const loaded = function (this: any, ...args: any[]) {
    if (this.id !== "mc_text_generator" || this.version !== "2.0.1")
      return load.apply(this, args);
    const oldAbout = b.BarItems.about_plugins,
      result = load.apply(this, args),
      action = b.BarItems.generate_text_action,
      click = action.click,
      about = b.BarItems.about_mc_text_generator,
      menu = b.BarItems.about_plugins;
    const dialogs = new Set<any>();
    let active = true;
    action.condition = () =>
      !!b.Project && b.Format.id !== "image" && b.Format.id !== "skin";
    action.click = function (...args: any[]) {
      const result = click.apply(this, args),
        d = b.Dialog.open;
      if (dialogs.has(d)) return result;
      dialogs.add(d);
      const confirm = d.onConfirm;
      d.onConfirm = function (data: any) {
        if (!active || !b.Project)
          throw new Fault("TEXT_UNAVAILABLE", "Open a model project");
        if (
          typeof data.input !== "string" ||
          !data.input.trim() ||
          data.input.length > 160 ||
          !/[a-z0-9.!+?:;,'\[\]()/\-]/i.test(data.input)
        )
          throw new Fault(
            "TEXT_INPUT",
            "Enter 1–160 characters containing supported letters, digits or punctuation",
          );
        for (const key of ["letterSpace", "wordSpace", "depth"])
          if (!Number.isFinite(data[key]) || data[key] < 0 || data[key] > 100)
            throw new Fault(
              "TEXT_RANGE",
              "Spacing and depth must be from 0 to 100",
            );
        if (![-45, -22.5, 0, 22.5, 45].includes(data.rotation))
          throw new Fault(
            "TEXT_ROTATION",
            "Use rotation -45, -22.5, 0, 22.5 or 45 degrees",
          );
        const undo = b.Undo,
          groupInit = b.Group.prototype.init,
          updateView = b.Canvas.updateView,
          init = undo.initEdit,
          finish = undo.finishEdit,
          elements = new Set(b.Outliner.elements),
          aspects: any = {
            elements: [],
            groups: [...b.Group.all],
            outliner: true,
            selection: true,
          };
        const collect = () => {
          aspects.elements.splice(
            0,
            Infinity,
            ...b.Outliner.elements.filter((n: any) => !elements.has(n)),
          );
          aspects.groups.splice(0, Infinity, ...b.Group.all);
        };
        const globals = Object.fromEntries(
          ["layerBaseGroup", "layerGroup", "selected"].map((key) => [
            key,
            Object.getOwnPropertyDescriptor(b, key),
          ]),
        );
        if (!globals.selected || globals.selected.configurable)
          Object.defineProperty(b, "selected", {
            configurable: true,
            get: () => b.Outliner.selected,
          });
        init.call(undo, aspects);
        undo.initEdit = () => {};
        undo.finishEdit = () => {};
        b.Group.prototype.init = function (...args: any[]) {
          return b.Group.all.includes(this)
            ? this
            : groupInit.apply(this, args);
        };
        b.Canvas.updateView = function (options: any, ...args: any[]) {
          if (Array.isArray(options?.groups))
            options = {
              ...options,
              groups: options.groups
                .flat()
                .filter((g: any) => g instanceof b.Group),
            };
          return updateView.call(this, options, ...args);
        };
        try {
          const result = confirm.call(this, data);
          collect();
          b.Canvas.updateAll();
          finish.call(undo, "Generated Text", aspects);
          return result;
        } catch (e) {
          collect();
          if (undo.current_save) undo.cancelEdit(true);
          throw e;
        } finally {
          undo.initEdit = init;
          undo.finishEdit = finish;
          b.Canvas.updateView = updateView;
          b.Group.prototype.init = groupInit;
          for (const [key, d] of Object.entries(globals)) {
            if (d) Object.defineProperty(b, key, d);
            else delete b[key];
          }
        }
      };
      return result;
    };
    this.onunload = function () {
      if (!active) return;
      active = false;
      action.delete();
      about?.delete();
      if (menu?.children)
        menu.children = menu.children.filter((a: any) => a !== about);
      if (!oldAbout && menu && !menu.children?.length) menu.delete();
      for (const d of dialogs) {
        if (b.Dialog.stack.includes(d)) d.hide();
        d.delete();
      }
    };
    return result;
  };
  proto.runOnLoad = loaded;
  return () => {
    if (proto.runOnLoad === loaded) proto.runOnLoad = load;
  };
}
