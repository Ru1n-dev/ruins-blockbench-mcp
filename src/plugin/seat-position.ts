import type { BB } from "./adapter.ts";

export function installSeatPosition(b: BB) {
  const proto = b.BBPlugin.prototype,
    load = proto.runOnLoad;
  const styles = new Map<any, any[]>();
  const patchedLoad = function (this: any, ...args: any[]) {
    if (this.id !== "seat_position" || this.version !== "1.3.2")
      return load.apply(this, args);
    const addCSS = b.Blockbench.addCSS,
      captured: any[] = [];
    const record = function (this: any, ...args: any[]) {
      const style = addCSS.apply(this, args);
      captured.push(style);
      return style;
    };
    b.Blockbench.addCSS = record;
    try {
      const result = load.apply(this, args);
      styles.set(this, [...(styles.get(this) ?? []), ...captured]);
      return result;
    } catch (error) {
      for (const style of captured) style.delete();
      throw error;
    } finally {
      if (b.Blockbench.addCSS === record) b.Blockbench.addCSS = addCSS;
    }
  };
  proto.runOnLoad = patchedLoad;
  let restore: (() => void) | undefined;
  function sync(plugin: any, unloaded = false) {
    if (plugin?.id !== "seat_position" || plugin.version !== "1.3.2") return;
    restore?.();
    restore = undefined;
    if (unloaded) return;
    const seat = b.SeatPositioner,
      hitbox = b.SetupHitboxHelper;
    const update = seat.update,
      lines = seat.getDialogLines,
      onUnload = plugin.onunload;
    const seatHide = seat.dialog.hide,
      hitboxHide = hitbox.dialog.hide;
    const change = hitbox.dialog.onFormChange;
    let lastScale = 1;
    const fixedUpdate = function (this: any, ...args: any[]) {
      const field = b.document.getElementById("STP-s");
      const n = Number(field?.value);
      if (Number.isFinite(n) && n >= 0.00001 && n <= 100000) lastScale = n;
      if (field) field.value = String(lastScale);
      return update.apply(this, args);
    };
    const fixedLines = function (this: any, ...args: any[]) {
      return lines
        .apply(this, args)
        .map((line: string) =>
          line
            .replace('checked="false"', "")
            .replace('id="STP-s"', 'id="STP-s" min="0.00001" max="100000"'),
        );
    };
    const hideSeat = function (this: any, ...args: any[]) {
      seat.object.removeFromParent();
      return seatHide.apply(this, args);
    };
    const hideHitbox = function (this: any, ...args: any[]) {
      hitbox.object?.removeFromParent();
      return hitboxHide.apply(this, args);
    };
    const fixedChange = function (this: any, values: any) {
      hitbox.setupObject();
      change.call(this, values);
      if (values.type === "entity_collision")
        hitbox.object.position.set(0, 0, 0);
      this.setFormValues(
        { result: b.$("dialog#setup_hitbox textarea").val() },
        false,
      );
    };
    const disposeObjects = () => {
      const geometries = new Set<any>(),
        materials = new Set<any>();
      for (const helper of [seat, hitbox]) {
        helper.dialog.hide();
        helper.object?.traverse((node: any) => {
          if (node.geometry) geometries.add(node.geometry);
          for (const m of Array.isArray(node.material)
            ? node.material
            : [node.material])
            if (m) materials.add(m);
        });
        helper.object?.removeFromParent();
        helper.object?.clear();
        helper.init = false;
      }
      for (const geometry of geometries) geometry.dispose();
      for (const material of materials) material.dispose();
    };
    const unload = function (this: any, ...args: any[]) {
      try {
        return onUnload.apply(this, args);
      } finally {
        disposeObjects();
        for (const style of styles.get(plugin) ?? []) style.delete();
        styles.delete(plugin);
      }
    };
    seat.update = fixedUpdate;
    seat.getDialogLines = fixedLines;
    seat.dialog.hide = hideSeat;
    hitbox.dialog.hide = hideHitbox;
    hitbox.dialog.onFormChange = fixedChange;
    plugin.onunload = unload;
    restore = () => {
      if (seat.update === fixedUpdate) seat.update = update;
      if (seat.getDialogLines === fixedLines) seat.getDialogLines = lines;
      if (seat.dialog.hide === hideSeat) seat.dialog.hide = seatHide;
      if (hitbox.dialog.hide === hideHitbox) hitbox.dialog.hide = hitboxHide;
      if (hitbox.dialog.onFormChange === fixedChange)
        hitbox.dialog.onFormChange = change;
      if (plugin.onunload === unload) plugin.onunload = onUnload;
    };
  }
  return {
    sync,
    dispose: () => {
      restore?.();
      if (proto.runOnLoad === patchedLoad) proto.runOnLoad = load;
      styles.clear();
    },
  };
}
