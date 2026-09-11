import type { BB } from "./adapter.ts";
import { Fault } from "../shared/types.ts";

// VOX Importer 1.2.2 creates geometry outside Undo, then starts several texture
// edits. Run that known synchronous importer as one native edit, and paint its
// generated palette canvas before scheduling image decoding.
export function runVoxImport<T>(b: BB, run: () => T): T {
  const project = b.Project,
    undo = b.Undo;
  if (!project || undo.current_save)
    throw new Fault("BUSY", "VOX import requires an idle project");
  const elements = [...b.Outliner.elements],
    groups = [...b.Group.all],
    textures = [...b.Texture.all];
  const aspects = () => ({
    elements: [...b.Outliner.elements],
    groups: [...b.Group.all],
    textures: [...b.Texture.all],
    outliner: true,
    bitmap: true,
    uv_mode: true,
  });
  const saved = project.saved;
  undo.initEdit(aspects());
  const init = undo.initEdit,
    finish = undo.finishEdit;
  const addBitmap = b.TextureGenerator.addBitmap,
    showMessage = b.Blockbench.showMessageBox;
  const ignoreInit = () => undo.current_save,
    ignoreFinish = () => undefined;
  const bitmap = function (this: any, options: any, after: any) {
    return addBitmap.call(
      this,
      { ...options, type: "blank" },
      (texture: any) => {
        const ownLoad = Object.getOwnPropertyDescriptor(texture, "load");
        texture.load = function (cb: any) {
          cb?.(texture);
          return texture;
        };
        try {
          after?.(texture);
        } finally {
          if (ownLoad) Object.defineProperty(texture, "load", ownLoad);
          else delete texture.load;
        }
        texture.updateSource(texture.canvas.toDataURL());
      },
    );
  };
  const message = function (this: any, options: any, callback: any) {
    return showMessage.call(
      this,
      options,
      typeof callback === "function"
        ? (...args: any[]) => {
            if (b.Project !== project)
              throw new Fault(
                "STALE_FILE_REQUEST",
                "VOX import project changed while the confirmation was open",
              );
            return runVoxImport(b, () => callback(...args));
          }
        : callback,
    );
  };
  undo.initEdit = ignoreInit;
  undo.finishEdit = ignoreFinish;
  b.TextureGenerator.addBitmap = bitmap;
  b.Blockbench.showMessageBox = message;
  const restore = () => {
    if (undo.initEdit === ignoreInit) undo.initEdit = init;
    if (undo.finishEdit === ignoreFinish) undo.finishEdit = finish;
    if (b.TextureGenerator.addBitmap === bitmap)
      b.TextureGenerator.addBitmap = addBitmap;
    if (b.Blockbench.showMessageBox === message)
      b.Blockbench.showMessageBox = showMessage;
  };
  try {
    const result = run();
    restore();
    if (b.Project !== project)
      throw new Fault(
        "STALE_FILE_REQUEST",
        "VOX importer changed the active project",
      );
    if (
      b.Outliner.elements.length === elements.length &&
      b.Group.all.length === groups.length &&
      b.Texture.all.length === textures.length
    )
      undo.cancelEdit();
    else {
      b.Canvas.updateAll();
      undo.finishEdit("Import VOX", aspects());
    }
    return result;
  } catch (error) {
    restore();
    if (b.Project === project) {
      for (const node of [...b.Outliner.elements])
        if (!elements.includes(node)) node.remove(false);
      for (const group of [...b.Group.all])
        if (!groups.includes(group)) group.remove(false);
      for (const texture of [...b.Texture.all])
        if (!textures.includes(texture)) texture.remove(true);
      undo.cancelEdit(true);
      project.saved = saved;
    }
    throw error;
  } finally {
    restore();
  }
}
