import type { BB } from "./adapter.ts";

export function installMissingTextureFlash(b: BB) {
  let restore: (() => void) | undefined;
  function sync(plugin: any, unloaded = false) {
    if (
      plugin?.id !== "missing_texture_highlighter" ||
      plugin.version !== "0.1.1"
    )
      return;
    restore?.();
    restore = undefined;
    if (unloaded) return;
    const action = b.BarItems.flash_missing_textures;
    if (!action) return;
    const original = action.click;
    let timer: ReturnType<typeof setInterval> | undefined;
    const touched = new Map<any, { before: number; last: number }>();
    const stop = () => {
      clearInterval(timer);
      timer = undefined;
      for (const [uniform, state] of touched)
        if (uniform.value === state.last) uniform.value = state.before;
      touched.clear();
    };
    const fixed = () => {
      stop();
      let frame = 0;
      const flash = () => {
        if (frame >= 17) {
          stop();
          return;
        }
        for (const material of b.Canvas.emptyMaterials) {
          const uniform = material.uniforms?.BRIGHTNESS;
          if (!uniform) continue;
          const previous = touched.get(uniform);
          const before =
            previous && uniform.value === previous.last
              ? previous.before
              : uniform.value;
          const value = frame % 2 ? before : 2.5;
          touched.set(uniform, { before, last: value });
          uniform.value = value;
        }
        frame++;
      };
      timer = setInterval(flash, 200);
      flash();
    };
    action.click = fixed;
    restore = () => {
      stop();
      if (action.click === fixed) action.click = original;
    };
  }
  return { sync, dispose: () => restore?.() };
}
