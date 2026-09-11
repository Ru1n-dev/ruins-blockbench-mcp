import type { BB } from "./adapter.ts";
import { Fault } from "../shared/types.ts";
import { bindIconCamera } from "./menu-icon-camera.ts";

function captureIcon(b: BB, preview: any, values: any) {
  const size = Number(
    values.icon_size === "custom" ? values.custom_size : values.icon_size,
  );
  const multiplier = ({ standard: 4, high: 8, ultra: 16 } as any)[
    values.quality
  ];
  if (!Number.isInteger(size) || size < 8 || size > 512 || !multiplier)
    throw new Fault(
      "ICON_SIZE",
      "Icon size must be 8–512 pixels with a supported quality",
    );
  if (!preview?.renderer || !preview.canvas)
    throw new Fault("ICON_PREVIEW", "Open an icon preview first");
  const color =
    values.background === "custom"
      ? values.custom_color
      : (
          {
            white: "#ffffff",
            black: "#000000",
            gray: "#808080",
            transparent: null,
          } as any
        )[values.background];
  if (color !== null && !/^#[0-9a-f]{6}$/i.test(color))
    throw new Fault("ICON_COLOR", "Choose a valid background color");
  const renderSize = size * multiplier;
  const limit = preview.renderer.capabilities.maxTextureSize;
  if (renderSize > limit)
    throw new Fault(
      "ICON_SIZE",
      "The requested quality exceeds this GPU's texture limit",
    );
  const width = preview.width,
    height = preview.height;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  if (color) {
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, size, size);
  }
  let failure: unknown;
  try {
    preview.resize(renderSize, renderSize);
    b.Canvas.withoutGizmos(() => {
      try {
        preview.render();
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(preview.canvas, 0, 0, size, size);
      } catch (error) {
        failure = error;
      }
    });
    if (failure) throw failure;
    return canvas.toDataURL("image/png");
  } finally {
    preview.resize(width, height);
  }
}

export function installMenuIcon(b: BB) {
  const proto = b.BBPlugin.prototype,
    load = proto.runOnLoad;
  const unloads = new WeakMap<object, Function>();
  const loaded = function (this: any, ...args: any[]) {
    if (this.id !== "menu_icon_exporter" || this.version !== "1.0.0")
      return load.apply(this, args);
    if (!unloads.has(this)) unloads.set(this, this.onunload);
    const result = load.apply(this, args),
      dialogs = new Set<any>();
    let active = true;
    const timers = new Set<any>(),
      frames = new Set<any>();
    function scope<T>(run: () => T): T | undefined {
      if (!active) return;
      const timeout = b.setTimeout,
        raf = b.requestAnimationFrame;
      b.setTimeout = (callback: Function, delay: number, ...args: any[]) => {
        const id = timeout.call(
          b,
          () => {
            timers.delete(id);
            scope(() => callback(...args));
          },
          delay,
        );
        timers.add(id);
        return id;
      };
      b.requestAnimationFrame = (callback: Function) => {
        const id = raf.call(b, (time: number) => {
          frames.delete(id);
          scope(() => callback(time));
        });
        frames.add(id);
        return id;
      };
      try {
        return run();
      } finally {
        b.setTimeout = timeout;
        b.requestAnimationFrame = raf;
      }
    }
    for (const id of ["export_menu_icon", "open_icon_exporter_panel"]) {
      const action = b.BarItems[id],
        click = action.click;
      action.click = function (...args: any[]) {
        return scope(() => click.apply(this, args));
      };
    }
    const bound = new WeakSet<object>();
    const bind = (preview: any, values: () => any) => {
      if (!preview || bound.has(preview)) return;
      bound.add(preview);
      bindIconCamera(b, preview, values, () => active);
    };
    const exportImage = (preview: any, values: any) => {
      if (!active)
        throw new Fault("PLUGIN_UNLOADED", "Menu Icon Exporter was unloaded");
      if (values.save_mode === "auto_folder")
        throw new Fault(
          "ICON_SAVE_MODE",
          "Direct folder saving is not implemented; choose Ask every export",
        );
      // MCP writes remain native file requests, including the selected folder hint.
      const content = captureIcon(b, preview, values);
      return b.Blockbench.export({
        type: "PNG Image",
        extensions: ["png"],
        savetype: "image",
        name: values.filename || "icon",
        content,
        startpath: values.output_folder || undefined,
      });
    };
    const dialogProto = b.Dialog.prototype,
      show = dialogProto.show;
    const shown = function (this: any, ...values: any[]) {
      if (active && this.id === "icon_exporter_dialog") {
        const dialog = this,
          owner = b.Project,
          cancel = dialog.onCancel;
        if (!dialogs.has(dialog)) {
          const change = dialog.onFormChange;
          dialog.onFormChange = function (...args: any[]) {
            return scope(() => change?.apply(this, args));
          };
        }
        dialogs.add(dialog);
        const preview = b.Preview.all.find((p: any) =>
          p.id.startsWith("menu_icon_exporter_live_"),
        );
        bind(preview, () => (dialog.form ? dialog.getFormResult() : {}));
        dialog.onConfirm = (values: any) => {
          if (b.Project !== owner)
            throw new Fault("STALE_STATE", "The icon project changed");
          const preview = b.Preview.all.find((p: any) =>
            p.id.startsWith("menu_icon_exporter_live_"),
          );
          const result = exportImage(preview, values);
          cancel.call(dialog);
          return result;
        };
      }
      return show.apply(this, values);
    };
    dialogProto.show = shown;
    const patched = new WeakSet<object>();
    const patchPanel = () => {
      const panel = b.Panels.menu_icon_exporter_panel,
        vue = panel?.inside_vue;
      if (!active || !vue) return;
      bind(vue.panelPreviewIsolated, () => vue.getFormData());
      for (const row of vue.$el.querySelectorAll(".mie_row")) {
        const label = row.querySelector("label")?.textContent?.trim();
        if (label)
          row.querySelector("input,select")?.setAttribute("aria-label", label);
      }
      if (patched.has(vue)) return;
      patched.add(vue);
      for (const key of [
        "switchToFloat",
        "switchToPanel",
        "layoutPanel",
        "refreshPreview",
        "initPreview",
        "onCameraChange",
      ]) {
        const method = vue[key];
        if (method)
          vue[key] = (...args: any[]) =>
            !vue._isDestroyed ? scope(() => method(...args)) : undefined;
      }
      vue.doExport = () =>
        exportImage(vue.panelPreviewIsolated, vue.getFormData());
      vue.resetCamera = () => {
        vue.zoom_level = 1;
        vue.auto_frame = true;
        for (const key of [
          "rotate_x",
          "rotate_y",
          "rotate_z",
          "pan_x",
          "pan_y",
        ])
          vue[key] = 0;
        vue.panelPreviewIsolated?.render();
        vue.refreshPreview();
      };
      const remove = panel.delete;
      panel.delete = function (...values: any[]) {
        if (!vue._isDestroyed) vue.$destroy();
        return remove.apply(this, values);
      };
    };
    const observer = new MutationObserver(patchPanel);
    observer.observe(document.getElementById("work_screen") || document.body, {
      childList: true,
      subtree: true,
    });
    patchPanel();
    this.onunload = () => {
      active = false;
      for (const id of timers) b.clearTimeout(id);
      for (const id of frames) b.cancelAnimationFrame(id);
      timers.clear();
      frames.clear();
      observer.disconnect();
      if (dialogProto.show === shown) dialogProto.show = show;
      for (const dialog of dialogs) {
        if (b.Dialog.open === dialog) dialog.onCancel?.();
        dialog.hide();
        dialog.delete();
      }
      dialogs.clear();
      return unloads.get(this)!.call(this);
    };
    return result;
  };
  proto.runOnLoad = loaded;
  return () => {
    if (proto.runOnLoad === loaded) proto.runOnLoad = load;
  };
}
