import type { BB } from "./adapter.ts";

export function installBakedAO(b: BB) {
  let restore: (() => void) | undefined;
  function sync(plugin: any, unloaded = false) {
    if (plugin?.id !== "baked_ambient_occlusion" || plugin.version !== "1.0.0")
      return;
    restore?.();
    restore = undefined;
    if (unloaded || !b.BarItems.bake_ambient_occlusion) return;
    const proto = b.Texture.prototype,
      original = proto.edit;
    const edit = function (this: any, callback: any, ...args: any[]) {
      if (
        typeof callback !== "function" ||
        !new Error().stack?.includes("(Plugin):baked_ambient_occlusion.js")
      )
        return original.call(this, callback, ...args);
      let options: any;
      try {
        options = JSON.parse(
          b.localStorage.getItem("blockbench_baked_ao_settings") ?? "{}",
        );
      } catch {
        return original.call(this, callback, ...args);
      }
      if (!options.retainTextureTransparency)
        return original.call(this, callback, ...args);
      return original.call(
        this,
        function (this: any, canvas: HTMLCanvasElement, ...rest: any[]) {
          const ctx = canvas.getContext("2d")!;
          const before = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const result = callback.call(this, canvas, ...rest);
          const after = ctx.getImageData(0, 0, canvas.width, canvas.height);
          for (let i = 3; i < after.data.length; i += 4)
            after.data[i] = before.data[i]!;
          ctx.putImageData(after, 0, 0);
          return result;
        },
        ...args,
      );
    };
    proto.edit = edit;
    restore = () => {
      if (proto.edit === edit) proto.edit = original;
    };
  }
  return { sync, dispose: () => restore?.() };
}
