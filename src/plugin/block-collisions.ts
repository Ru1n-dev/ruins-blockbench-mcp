import type { BB } from "./adapter.ts";
import { Fault } from "../shared/types.ts";
export function clampCollisionBox(size: number[], offset: number[]) {
  if (
    size.length !== 3 ||
    offset.length !== 3 ||
    [...size, ...offset].some((v) => !Number.isFinite(v))
  )
    throw new Fault(
      "COLLISION_INPUT",
      "Collision size and offset require three finite numbers",
    );
  const clamped = size.map((v, i) =>
    Math.max(0, Math.min(i === 1 ? 24 : 16, v)),
  );
  return {
    size: clamped,
    offset: offset.map((v, i) =>
      Math.max(
        i === 1 ? 0 : -8 + clamped[i]! / 2,
        Math.min(i === 1 ? 24 - clamped[i]! : 8 - clamped[i]! / 2, v),
      ),
    ),
  };
}
export function installBlockCollisions(b: BB) {
  let restore: (() => void) | undefined;
  const styles = new WeakMap<
    object,
    Array<{ args: any[]; handle: any; deleted: boolean }>
  >();
  const addCSS = b.Blockbench.addCSS;
  const css = function (this: any, ...args: any[]) {
    const handle = addCSS.apply(this, args),
      plugin = b.Plugins.registered.block_multi_collisions;
    // Blockbench 5.1.6 annotates plugin evaluation with this source URL.
    // This provider creates its CSS before onload, so onload-only tracking misses it.
    if (
      plugin &&
      new Error().stack?.includes("PLUGINS/(Plugin):block_multi_collisions.js:")
    ) {
      const list = styles.get(plugin) ?? [];
      list.push({ args, handle, deleted: false });
      styles.set(plugin, list);
    }
    return handle;
  };
  b.Blockbench.addCSS = css;
  function sync(plugin: any, unloaded = false) {
    if (plugin?.id !== "block_multi_collisions" || plugin.version !== "1.0.0")
      return;
    restore?.();
    restore = undefined;
    if (unloaded) {
      for (const style of styles.get(plugin) ?? []) {
        style.handle.delete();
        style.deleted = true;
      }
      return;
    }
    if (!b.BarItems.open_block_collision_editor) return;
    for (const style of styles.get(plugin) ?? [])
      if (style.deleted) {
        style.handle = addCSS.apply(b.Blockbench, style.args);
        style.deleted = false;
      }
    const manager = b.BlockCollisionManager;
    if (!manager) return;
    const dialog = manager.dialog,
      restorers: Array<() => void> = [];
    let owner: any,
      active = true;
    const replace = (object: any, key: string, value: any) => {
      const original = object[key];
      object[key] = value;
      restorers.push(() => {
        if (object[key] === value) object[key] = original;
      });
      return original;
    };
    const redraw = manager.redrawAllBoxes,
      output = manager.updateResultOutput,
      open = dialog.onOpen,
      hide = dialog.hide;
    replace(manager, "validateBox", clampCollisionBox);
    replace(manager, "redrawAllBoxes", () => {
      if (active && b.Dialog.open === dialog && owner === b.Project)
        redraw.call(manager);
    });
    replace(manager, "updateResultOutput", () => {
      if (active && b.Dialog.open === dialog) {
        output.call(manager);
        dialog.setFormValues(
          { result: dialog.object.querySelector("textarea")?.value ?? "" },
          false,
        );
      }
    });
    replace(manager, "loadBoxData", (index: number) => {
      const box = manager.collisionBoxes[index];
      if (!box) return;
      dialog.setFormValues(
        {
          size_block: [...box.size],
          offset_block: [...box.offset],
          box_index: index + 1,
        },
        false,
      );
      manager.previousBoxIndex = index;
      manager.redrawAllBoxes();
      manager.updateResultOutput();
    });
    replace(dialog, "onFormChange", (data: any) => {
      if (!Number.isInteger(data.box_index))
        throw new Fault("COLLISION_INDEX", "Box index must be an integer");
      const index = Math.max(
        0,
        Math.min(manager.collisionBoxes.length - 1, data.box_index - 1),
      );
      if (index !== manager.previousBoxIndex) {
        manager.currentBoxIndex = index;
        manager.loadBoxData(index);
        return;
      }
      const box = clampCollisionBox(data.size_block, data.offset_block);
      manager.currentBoxIndex = index;
      manager.updateCurrentBox(box.size, box.offset);
      dialog.setFormValues(
        {
          box_index: index + 1,
          size_block: box.size,
          offset_block: box.offset,
        },
        false,
      );
      manager.redrawAllBoxes();
      manager.updateResultOutput();
    });
    replace(dialog, "onOpen", function (this: any, ...args: any[]) {
      owner = b.Project;
      return open?.apply(this, args);
    });
    replace(dialog, "hide", function (this: any, ...args: any[]) {
      manager.clearAllBoxes();
      owner = undefined;
      return hide.apply(this, args);
    });
    replace(manager, "autoGenerateFromCubes", () => {
      const boxes = [];
      b.Project.model_3d.updateMatrixWorld(true);
      for (const cube of b.Cube.all) {
        let visible = true;
        for (
          let node: any = cube;
          node && typeof node === "object";
          node = node.parent
        )
          if (node.visibility === false) visible = false;
        if (!visible) continue;
        const vertices = cube.getGlobalVertexPositions();
        const min = [0, 1, 2].map((i) =>
            Math.min(...vertices.map((v: number[]) => v[i])),
          ),
          max = [0, 1, 2].map((i) =>
            Math.max(...vertices.map((v: number[]) => v[i])),
          );
        boxes.push(
          clampCollisionBox(
            max.map((v, i) => v - min[i]!),
            [-(min[0]! + max[0]!) / 2, min[1]!, (min[2]! + max[2]!) / 2],
          ),
        );
        if (boxes.length === 16) break;
      }
      if (!boxes.length) {
        b.Blockbench.showQuickMessage("No visible cubes to convert");
        return;
      }
      manager.collisionBoxes = boxes;
      manager.currentBoxIndex = 0;
      manager.previousBoxIndex = 0;
      manager.updateBoxCount();
      manager.loadBoxData(0);
      b.Blockbench.showQuickMessage(
        `Generated ${boxes.length} axis-aligned collision boxes`,
      );
    });
    const switchProject = () => {
      if (owner && owner !== b.Project) dialog.hide();
    };
    b.Blockbench.on("select_project", switchProject);
    restore = () => {
      active = false;
      if (b.Dialog.open === dialog) dialog.hide();
      manager.clearAllBoxes();
      b.Blockbench.removeListener("select_project", switchProject);
      for (const fn of restorers.reverse()) fn();
    };
  }
  return {
    sync,
    dispose: () => {
      restore?.();
      if (b.Blockbench.addCSS === css) b.Blockbench.addCSS = addCSS;
    },
  };
}
