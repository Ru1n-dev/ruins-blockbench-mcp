import type { BB } from "./adapter.ts";
import { isNativeFileScope } from "./native-files.ts";

export function installGroupExport(b: BB) {
  const proto = b.BBPlugin.prototype,
    load = proto.runOnLoad;
  let restore: (() => void) | undefined;
  const patchedLoad = function (this: any, ...args: any[]) {
    if (this.id !== "outliner_group_exporter" || this.version !== "1.0.0")
      return load.apply(this, args);
    restore?.();
    const base = b.Codec.prototype.export,
      result = load.apply(this, args),
      provider = b.Codec.prototype.export;
    const patched = function (this: any, ...values: any[]) {
      const group =
        b.Menu.open === b.Group.prototype.menu
          ? b.getCurrentGroup()
          : undefined;
      if (!group) return base.apply(this, values);
      const source = [...b.Cube.all],
        saved = new Map(source.map((c: any) => [c, c.export]));
      const restoreFlags = () => {
        for (const [cube, value] of saved) (cube as any).export = value;
      };
      for (const cube of source) {
        let parent = cube.parent,
          inside = false;
        while (parent && parent !== "root") {
          if (parent === group) {
            inside = true;
            break;
          }
          parent = parent.parent;
        }
        cube.export = inside && saved.get(cube) !== false;
      }
      if (this.id === "java_block" && isNativeFileScope(b)) {
        let content: any;
        try {
          content = this.compile(values[0]);
        } finally {
          restoreFlags();
        }
        // Capture after restoring model flags so the staged file keeps the source
        // project's fingerprint. A partial export must not mark the project saved.
        return b.Blockbench.export(
          {
            type: this.name,
            resource_id: "model",
            extensions: [this.extension],
            name: group.name,
            content,
          },
          () => b.Blockbench.showQuickMessage("Group model exported"),
        );
      }
      try {
        const output = base.apply(this, values);
        if (output && typeof output.then === "function")
          return Promise.resolve(output).finally(restoreFlags);
        restoreFlags();
        return output;
      } catch (error) {
        restoreFlags();
        throw error;
      }
    };
    b.Codec.prototype.export = patched;
    restore = () => {
      if (b.Codec.prototype.export === patched)
        b.Codec.prototype.export = provider;
    };
    return result;
  };
  proto.runOnLoad = patchedLoad;
  return () => {
    restore?.();
    if (proto.runOnLoad === patchedLoad) proto.runOnLoad = load;
  };
}
