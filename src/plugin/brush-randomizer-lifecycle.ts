import type { BB } from "./adapter.ts";

export function installBrushRandomizerLifecycle(b: BB): () => void {
  const proto = b.BBPlugin.prototype,
    load = proto.runOnLoad,
    unload = proto.unload;
  const handlers = new Map<
    any,
    Array<{ elements: any; event: string; callback: any }>
  >();
  const matches = (elements: any) =>
    elements.length &&
    [...elements].every((element: Element) =>
      element.matches?.(".preview, .sp-val"),
    );
  const patchedLoad = function (this: any, ...args: any[]) {
    if (this.id !== "brush_randomizer" || this.version !== "1.0.0")
      return load.apply(this, args);
    const entries: Array<{ elements: any; event: string; callback: any }> = [];
    const on = b.$.fn.on;
    const record = function (
      this: any,
      event: any,
      callback: any,
      ...rest: any[]
    ) {
      if (event === "click" && typeof callback === "function" && matches(this))
        entries.push({ elements: this, event, callback });
      return on.call(this, event, callback, ...rest);
    };
    b.$.fn.on = record;
    try {
      const result = load.apply(this, args);
      handlers.set(this, [...(handlers.get(this) ?? []), ...entries]);
      return result;
    } catch (error) {
      for (const entry of entries)
        b.$.fn.off.call(entry.elements, entry.event, entry.callback);
      throw error;
    } finally {
      if (b.$.fn.on === record) b.$.fn.on = on;
    }
  };
  const patchedUnload = function (this: any, ...args: any[]) {
    const entries = handlers.get(this);
    if (!entries) return unload.apply(this, args);
    const off = b.$.fn.off;
    const scopedOff = function (this: any, event: any, ...rest: any[]) {
      // This pinned unload calls off('click') on shared surfaces. Remove only
      // callbacks captured from its own load, never other plugins' listeners.
      if (event === "click" && !rest.length && matches(this)) return this;
      return off.call(this, event, ...rest);
    };
    b.$.fn.off = scopedOff;
    try {
      return unload.apply(this, args);
    } finally {
      if (b.$.fn.off === scopedOff) b.$.fn.off = off;
      for (const entry of entries)
        off.call(entry.elements, entry.event, entry.callback);
      handlers.delete(this);
    }
  };
  proto.runOnLoad = patchedLoad;
  proto.unload = patchedUnload;
  return () => {
    if (proto.runOnLoad === patchedLoad) proto.runOnLoad = load;
    if (proto.unload === patchedUnload) proto.unload = unload;
    handlers.clear();
  };
}
