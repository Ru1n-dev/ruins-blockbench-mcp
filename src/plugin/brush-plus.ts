import type { BB } from "./adapter.ts";
import { Fault } from "../shared/types.ts";

/** Own the legacy provider's dialogs and restore its top-level CSS on reload. */
export function installBrushPlus(b: BB) {
  const proto = b.BBPlugin.prototype,
    load = proto.runOnLoad;
  const unloads = new WeakMap<object, Function>(),
    styles = new WeakMap<object, string>();
  const loaded = function (this: any, ...args: any[]) {
    if (this.id !== "brush" || this.version !== "1.0.1")
      return load.apply(this, args);
    if (!unloads.has(this)) unloads.set(this, this.onunload);
    const style = [...b.document.querySelectorAll("style")].find((node: any) =>
      node.textContent.includes("#panel_mtbrush_settings .toolbar"),
    );
    if (style) styles.set(this, style.textContent);
    const ownStyle =
      !style && styles.get(this)
        ? b.Blockbench.addCSS(styles.get(this))
        : undefined;
    const Dialog = b.Dialog,
      dialogs = new Set<any>();
    let active = true;
    b.Dialog = new Proxy(Dialog, {
      construct(target, args) {
        const options = typeof args[0] === "string" ? args[1] : args[0];
        if (options?.title === "Custom Brush" && options.form?.file) {
          options.form.file.return_as = "file";
          const confirm = options.onConfirm;
          options.onConfirm = async function (this: any, values: any) {
            const content = values.file?.content;
            if (
              typeof content !== "string" ||
              !/^data:image\//.test(content) ||
              content.length > 32000000
            )
              throw new Fault(
                "BRUSH_IMAGE",
                "Choose an embedded image up to 32 MB",
              );
            const image = new b.Image();
            image.src = content;
            await image.decode();
            if (
              !image.width ||
              !image.height ||
              image.width > 2048 ||
              image.height > 2048
            )
              throw new Fault(
                "BRUSH_IMAGE",
                "Brush input images must be at most 2048 pixels per side",
              );
            if (!active)
              throw new Fault("STALE_STATE", "Brush Plus was unloaded");
            return confirm.call(this, { ...values, file: content });
          };
        }
        const dialog: any = Reflect.construct(target, args);
        dialogs.add(dialog);
        return dialog;
      },
    });
    let result: any;
    try {
      result = load.apply(this, args);
    } catch (error) {
      ownStyle?.delete();
      for (const dialog of dialogs) {
        dialog.hide();
        dialog.delete();
      }
      throw error;
    } finally {
      b.Dialog = Dialog;
    }
    const panel = b.Panels.mtbrush_settings?.node;
    for (const label of panel?.querySelectorAll(".checklist label") ?? []) {
      label.setAttribute("aria-label", label.textContent);
      const row = label.parentElement;
      row.querySelector("input")?.setAttribute("aria-label", label.textContent);
      row
        .querySelector("i")
        ?.setAttribute("aria-label", `Edit ${label.textContent}`);
    }
    panel
      ?.querySelector(".add_custom_brush")
      ?.setAttribute("aria-label", "Add Custom Brush");
    panel
      ?.querySelector(".remove_custom_brush")
      ?.setAttribute("aria-label", "Remove Custom Brush");
    const show = Dialog.prototype.show;
    const shown = function (this: any, ...args: any[]) {
      const target = b.window.event?.target;
      if (
        target instanceof b.Element &&
        target.closest("#panel_mtbrush_settings")
      )
        dialogs.add(this);
      return show.apply(this, args);
    };
    Dialog.prototype.show = shown;
    this.onunload = () => {
      try {
        return unloads.get(this)!.call(this);
      } finally {
        active = false;
        if (Dialog.prototype.show === shown) Dialog.prototype.show = show;
        for (const dialog of dialogs) {
          dialog.hide();
          dialog.delete();
        }
        dialogs.clear();
        ownStyle?.delete();
      }
    };
    return result;
  };
  proto.runOnLoad = loaded;
  return () => {
    if (proto.runOnLoad === loaded) proto.runOnLoad = load;
  };
}
