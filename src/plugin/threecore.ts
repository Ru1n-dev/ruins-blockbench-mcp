import type { BB } from "./adapter.ts";
import { isNativeFileScope } from "./native-files.ts";
import { Fault } from "../shared/types.ts";
export function installThreeCore(b: BB) {
  let restore: (() => void) | undefined, codec: any;
  function sync(plugin: any, unloaded = false) {
    if (plugin?.id !== "threecore_exporter" || plugin.version !== "1.0.3")
      return;
    restore?.();
    restore = undefined;
    codec ??= b.Codecs.threecore_model;
    if (!codec) return;
    if (unloaded) {
      if (b.Codecs.threecore_model === codec) delete b.Codecs.threecore_model;
      if (
        ["threecore_dialog", "threecore_visible_overrides_dialog"].includes(
          b.Dialog.open?.id,
        )
      )
        b.Dialog.open.hide();
      return;
    }
    b.Codecs.threecore_model = codec;
    const originalCompile = codec.compile,
      originalExport = codec.export;
    const compile = function (this: any, ...args: any[]) {
      if (
        b.Outliner.elements.some((element: any) => !(element instanceof b.Cube))
      )
        throw new Fault(
          "THREECORE_ELEMENTS",
          "ThreeCore export supports Cube and Group hierarchies",
        );
      const data = JSON.parse(originalCompile.apply(this, args));
      return JSON.stringify(
        { type: "threecore:default", scale: 0, ...data },
        null,
        2,
      );
    };
    const exportModel = function (this: any, ...args: any[]) {
      if (!isNativeFileScope(b)) return originalExport.apply(this, args);
      return b.Blockbench.export(
        {
          type: this.name,
          extensions: [this.extension],
          name: this.fileName(),
          content: this.compile(args[0]),
        },
        (path: string) => this.afterDownload(path),
      );
    };
    codec.compile = compile;
    codec.export = exportModel;
    restore = () => {
      if (codec.compile === compile) codec.compile = originalCompile;
      if (codec.export === exportModel) codec.export = originalExport;
    };
  }
  return { sync, dispose: () => restore?.() };
}
