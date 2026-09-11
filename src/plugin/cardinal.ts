import type { BB } from "./adapter.ts";
export function installCardinal(b: BB) {
  const proto = b.BBPlugin.prototype,
    load = proto.runOnLoad,
    unload = proto.unload;
  const states = new Map<any, any>();
  const release = (state: any) => {
    for (const mark of state.marks) {
      mark.removeFromParent();
      mark.geometry.dispose();
      mark.material.map.image.onload = null;
      mark.material.map.dispose();
      mark.material.dispose();
    }
    state.marks.clear();
  };
  const loaded = function (this: any, ...args: any[]) {
    if (this.id !== "cardinal" || this.version !== "1.1.0")
      return load.apply(this, args);
    const result = load.apply(this, args),
      state: any = {
        marks: new Set(),
        build: b.Canvas.buildGrid,
        setting: b.settings.cardinal_scale,
      };
    const adopt = () => {
      for (const mark of b.three_grid.children)
        if (
          mark.renderOrder === 10 &&
          String(mark.onBeforeRender).includes("main_preview.camera")
        ) {
          state.marks.add(mark);
          mark.onBeforeRender = function (
            _renderer: any,
            _scene: any,
            camera: any,
          ) {
            camera.getWorldQuaternion(this.quaternion);
            this.updateMatrixWorld();
          };
        }
    };
    const wrap = () => {
      state.build = b.Canvas.buildGrid;
      state.wrapped = function (this: any, ...values: any[]) {
        release(state);
        const result = state.build.apply(this, values);
        adopt();
        return result;
      };
      b.Canvas.buildGrid = state.wrapped;
      b.buildGrid = state.wrapped;
    };
    adopt();
    wrap();
    state.change = state.setting.onChange;
    state.changed = function (this: any, ...values: any[]) {
      release(state);
      const result = state.change.apply(this, values);
      adopt();
      wrap();
      return result;
    };
    state.setting.onChange = state.changed;
    states.set(this, state);
    return result;
  };
  const unloaded = function (this: any, ...args: any[]) {
    const state = states.get(this);
    try {
      return unload.apply(this, args);
    } finally {
      if (state) {
        release(state);
        if (b.settings.cardinal_scale === state.setting) state.setting.delete();
        states.delete(this);
        b.Canvas.buildGrid();
      }
    }
  };
  proto.runOnLoad = loaded;
  proto.unload = unloaded;
  return () => {
    if (proto.runOnLoad === loaded) proto.runOnLoad = load;
    if (proto.unload === unloaded) proto.unload = unload;
    for (const state of states.values()) {
      if (b.Canvas.buildGrid === state.wrapped) {
        b.Canvas.buildGrid = state.build;
        b.buildGrid = state.build;
      }
      if (state.setting.onChange === state.changed)
        state.setting.onChange = state.change;
    }
    states.clear();
  };
}
