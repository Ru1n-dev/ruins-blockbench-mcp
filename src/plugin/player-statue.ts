import type { BB } from "./adapter.ts";
export function installPlayerStatue(b: BB) {
  const proto = b.BBPlugin.prototype,
    load = proto.runOnLoad;
  const loaded = function (this: any, ...args: any[]) {
    if (this.id !== "player_statue_generator" || this.version !== "2.0.2")
      return load.apply(this, args);
    const result = load.apply(this, args),
      action = b.BarItems.generate_player_statue,
      click = action.click,
      unload = this.onunload;
    const dialogs = new Map<any, any>();
    let active = true;
    const transaction = (run: () => any, label: string) => {
      const undo = b.Undo,
        init = undo.initEdit,
        finish = undo.finishEdit,
        show = b.Dialog.prototype.show,
        elements = new Set(b.Outliner.elements),
        textures = new Set(b.Texture.all);
      const aspects: any = {
        elements: [],
        groups: [...b.Group.all],
        textures: [],
        outliner: true,
        display_slots: ["head"],
        selection: true,
      };
      const collect = () => {
        aspects.elements.splice(
          0,
          Infinity,
          ...b.Outliner.elements.filter((n: any) => !elements.has(n)),
        );
        aspects.textures.splice(
          0,
          Infinity,
          ...b.Texture.all.filter((n: any) => !textures.has(n)),
        );
        aspects.groups.splice(0, Infinity, ...b.Group.all);
      };
      const globals = Object.fromEntries(
        ["display", "steveGroup", "alexGroup"].map((key) => [
          key,
          Object.getOwnPropertyDescriptor(b, key),
        ]),
      );
      Object.defineProperty(b, "display", {
        value: b.Project.display_settings,
        writable: true,
        configurable: true,
      });
      init.call(undo, aspects);
      undo.initEdit = () => {};
      undo.finishEdit = () => {};
      b.Dialog.prototype.show = function (this: any, ...args: any[]) {
        if (this.id === "cape_warning")
          this.lines = this.lines.map((line: any) => {
            if (typeof line !== "string" || !line.includes("cape-gen-button"))
              return line;
            const p = b.document.createElement("p");
            p.innerHTML = line;
            return p;
          });
        return show.apply(this, args);
      };
      try {
        const value = run();
        collect();
        finish.call(undo, label, aspects);
        return value;
      } catch (error) {
        collect();
        if (undo.current_save) undo.cancelEdit(true);
        throw error;
      } finally {
        undo.initEdit = init;
        undo.finishEdit = finish;
        b.Dialog.prototype.show = show;
        for (const [key, descriptor] of Object.entries(globals)) {
          if (descriptor) Object.defineProperty(b, key, descriptor);
          else delete b[key];
        }
      }
    };
    const wrap = (dialog: any) => {
      if (
        !dialog ||
        dialogs.has(dialog) ||
        !["playerModelSettings", "cape_warning"].includes(dialog.id)
      )
        return;
      const confirm = dialog.onConfirm;
      dialogs.set(dialog, confirm);
      dialog.onConfirm = function (this: any, ...args: any[]) {
        const value = transaction(
          () => confirm.apply(this, args),
          dialog.id === "cape_warning"
            ? "Generated Cape Model"
            : "Generated Player Statue",
        );
        const next = b.Dialog.open;
        if (next !== dialog) wrap(next);
        if (next?.id === "cape_warning") {
          const link = b.document.getElementById("cape-gen-button"),
            handler = link?.onclick;
          if (handler)
            link.onclick = function (this: any, ...args: any[]) {
              return transaction(
                () => handler.apply(this, args),
                "Import Cape Template",
              );
            };
        }
        return value;
      };
    };
    action.click = function (this: any, ...args: any[]) {
      const result = click.apply(this, args);
      wrap(b.Dialog.open);
      return result;
    };
    this.onunload = function (this: any, ...args: any[]) {
      if (!active) return;
      active = false;
      const next = this.onload;
      this.onload = function (this: any, ...args: any[]) {
        this.onload = next;
        this.onunload = unload;
        return next.apply(this, args);
      };
      try {
        return unload.apply(this, args);
      } finally {
        action.click = click;
        for (const [dialog, confirm] of dialogs) {
          dialog.onConfirm = confirm;
          if (b.Dialog.open === dialog) dialog.hide();
        }
      }
    };
    return result;
  };
  proto.runOnLoad = loaded;
  return () => {
    if (proto.runOnLoad === loaded) proto.runOnLoad = load;
  };
}
