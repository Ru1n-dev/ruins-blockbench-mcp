import type { BB } from "./adapter.ts";
import { Fault } from "../shared/types.ts";
export function installSkinMirror(b: BB) {
  let restore: (() => void) | undefined;
  function sync(plugin: any, unloaded = false) {
    if (plugin?.id !== "skin_mirror" || plugin.version !== "1.1.0") return;
    restore?.();
    restore = undefined;
    const dialog = b.MirrorUI?.dialog;
    if (!dialog || dialog.id !== "skin_mirror") return;
    if (unloaded) {
      if (b.Dialog.open === dialog) dialog.hide();
      return;
    }
    if (!b.BarItems.open_skin_mirror) return;
    const original = dialog.onConfirm;
    const confirm = function (this: any, ...args: any[]) {
      const textures = b.Texture.selected
        ? [b.Texture.selected]
        : b.Texture.all;
      if (!textures.length)
        throw new Fault("TEXTURE_REQUIRED", "Select a Minecraft skin texture");
      if (
        textures.some(
          (t: any) =>
            t.width < 64 ||
            t.width % 64 !== 0 ||
            t.height !== t.width ||
            t.display_height !== t.height,
        )
      )
        throw new Fault(
          "SKIN_DIMENSIONS",
          "Use non-animated square skin textures with dimensions in multiples of 64 pixels",
        );
      return original.apply(this, args);
    };
    dialog.onConfirm = confirm;
    restore = () => {
      if (dialog.onConfirm === confirm) dialog.onConfirm = original;
    };
  }
  return { sync, dispose: () => restore?.() };
}
