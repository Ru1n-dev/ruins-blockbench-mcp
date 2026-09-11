import type { BB } from "./adapter.ts";

export function installFarsight(b: BB) {
  const proto = b.BBPlugin.prototype,
    load = proto.runOnLoad,
    unload = proto.unload;
  const states = new Map<
    any,
    { cameras: Map<any, any>; original: any; patched: any }
  >();
  const capture = (cameras: Map<any, any>) => {
    for (const p of b.Preview.all)
      if (!cameras.has(p))
        cameras.set(p, {
          pers: p.camPers.far,
          ortho: p.camOrtho.far,
          max: p.controls?.maxDistance,
        });
  };
  const patchedLoad = function (this: any, ...args: any[]) {
    if (this.id !== "farsight" || this.version !== "1.0.1")
      return load.apply(this, args);
    const cameras = new Map();
    capture(cameras);
    const result = load.apply(this, args),
      original = this.applySettings;
    const patched = function (this: any, ...values: any[]) {
      capture(cameras);
      return original.apply(this, values);
    };
    this.applySettings = patched;
    states.set(this, { cameras, original, patched });
    return result;
  };
  const patchedUnload = function (this: any, ...args: any[]) {
    const state = states.get(this);
    try {
      return unload.apply(this, args);
    } finally {
      if (state) {
        states.delete(this);
        if (this.applySettings === state.patched)
          this.applySettings = state.original;
        for (const [p, values] of state.cameras)
          if (b.Preview.all.includes(p)) {
            p.camPers.far = values.pers;
            p.camOrtho.far = values.ortho;
            if (p.controls) p.controls.maxDistance = values.max;
            p.camPers.updateProjectionMatrix();
            p.camOrtho.updateProjectionMatrix();
            p.render();
          }
      }
    }
  };
  proto.runOnLoad = patchedLoad;
  proto.unload = patchedUnload;
  return () => {
    if (proto.runOnLoad === patchedLoad) proto.runOnLoad = load;
    if (proto.unload === patchedUnload) proto.unload = unload;
    for (const [plugin, state] of states)
      if (plugin.applySettings === state.patched)
        plugin.applySettings = state.original;
    states.clear();
  };
}
