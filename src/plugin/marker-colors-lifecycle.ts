import type { BB } from "./adapter.ts";
import { Fault } from "../shared/types.ts";
import { remapMarkerReferences } from "./marker-references.ts";

export function validateMarkerName(b: BB, name: unknown): void {
  if (typeof name !== "string" || !name.trim())
    throw new Fault("MARKER_NAME", "Marker name cannot be empty");
  const id = name.toLowerCase().replace(/ /g, "_");
  if (
    ["__proto__", "constructor", "prototype"].includes(name) ||
    b.markerColors.some((c: any) => c.id === id)
  )
    throw new Fault(
      "MARKER_DUPLICATE",
      "Marker ID already exists or is reserved",
    );
}

// 5.1 uses the registered set_element_marker_color Action instead of the old
// inline Cube menu object. The pinned plugin only reads/restores that legacy
// object's children; resolve its lookup without modifying the modern Action.
export function installMarkerColorsLifecycle(b: BB): () => void {
  const proto = b.BBPlugin.prototype,
    load = proto.runOnLoad,
    unload = proto.unload;
  const active = new Set<any>();
  let unloading = 0,
    disposed = false;
  const colors = b.markerColors,
    splice = colors.splice;
  const patchedSplice = function (this: any, ...args: any[]) {
    if (
      this !== colors ||
      (!unloading &&
        (!active.size || b.Dialog.open?.id !== "edit_marker_colors_dialog"))
    )
      return splice.apply(this, args);
    const before = [...colors],
      materials = [...b.Canvas.coloredSolidMaterials];
    const removed = splice.apply(this, args);
    remapMarkerReferences(b.ModelProject.all, before, colors);
    const next = colors.map((color: any) => materials[before.indexOf(color)]);
    b.Canvas.coloredSolidMaterials.splice(0, Infinity, ...next);
    b.Vue.nextTick(() => {
      if (disposed) return;
      b.Canvas.updateMarkerColorMaterials();
      if (b.Project) b.Canvas.updateAll();
      for (const material of materials)
        if (material && !next.includes(material)) material.dispose();
    });
    return removed;
  };
  colors.splice = patchedSplice;
  const close = b.Dialog.prototype.close;
  const guardedClose = function (
    this: any,
    button: number = this.cancelIndex,
    event?: Event,
  ) {
    if (
      active.size &&
      this.id === "add_custom_marker" &&
      button === this.confirmIndex
    ) {
      try {
        validateMarkerName(b, this.getFormResult().name);
      } catch (error) {
        b.Blockbench.showQuickMessage(
          error instanceof Error ? error.message : "Invalid marker name",
        );
        return;
      }
    }
    return close.call(this, button, event);
  };
  const matches = (plugin: any) =>
    plugin.id === "custom_marker_colors" && plugin.version === "1.1.0";
  const legacyMenu = <T>(run: () => T): T => {
    const entries = b.Cube.prototype.menu.structure;
    const own = Object.getOwnPropertyDescriptor(entries, "find");
    const find = entries.find;
    const facade = {
      name: "menu.cube.color",
      children: b.BarItems.set_element_marker_color?.children,
    };
    entries.find = function (predicate: any, thisArg: any) {
      const result = find.call(this, predicate, thisArg);
      return (
        result ??
        (predicate.call(thisArg, facade, -1, this) ? facade : undefined)
      );
    };
    try {
      return run();
    } finally {
      if (own) Object.defineProperty(entries, "find", own);
      else delete entries.find;
    }
  };
  const patchedLoad = function (this: any, ...args: any[]) {
    if (!matches(this)) return load.apply(this, args);
    active.add(this);
    return legacyMenu(() => load.apply(this, args));
  };
  const patchedUnload = function (this: any, ...args: any[]) {
    if (!matches(this)) return unload.apply(this, args);
    active.delete(this);
    unloading++;
    try {
      return legacyMenu(() => unload.apply(this, args));
    } finally {
      unloading--;
      for (const id of ["add_marker_color", "edit_marker_colors"]) {
        const action = b.BarItems[id];
        if (action?.plugin === this.id) action.delete();
      }
    }
  };
  proto.runOnLoad = patchedLoad;
  proto.unload = patchedUnload;
  b.Dialog.prototype.close = guardedClose;
  return () => {
    disposed = true;
    if (colors.splice === patchedSplice) colors.splice = splice;
    if (proto.runOnLoad === patchedLoad) proto.runOnLoad = load;
    if (proto.unload === patchedUnload) proto.unload = unload;
    if (b.Dialog.prototype.close === guardedClose)
      b.Dialog.prototype.close = close;
    active.clear();
  };
}
