import { Adapter, type BB } from "./adapter.ts";
import { Fault } from "../shared/types.ts";
export function installMultiLayer(b: BB) {
  const proto = b.BBPlugin.prototype,
    load = proto.runOnLoad;
  const loaded = function (this: any, ...args: any[]) {
    if (this.id !== "multi-layer" || this.version !== "1.0")
      return load.apply(this, args);
    const oldAction = Object.getOwnPropertyDescriptor(b, "action"),
      codec = b.Codecs.java_block;
    const result = load.apply(this, args),
      action = b.BarItems.export_multilayer,
      click = action.click,
      unload = this.onunload;
    if (oldAction) Object.defineProperty(b, "action", oldAction);
    else delete b.action;
    // This legacy listener is installed during script evaluation, outside onload.
    for (const callback of [...(codec.events.compile ?? [])])
      if (
        String(callback).includes("forge:multi-layer") &&
        String(callback).includes("layerGroups")
      )
        codec.removeListener("compile", callback);
    let active = true,
      dialog: any;
    action.click = function (this: any, ...values: any[]) {
      const old = Object.getOwnPropertyDescriptor(b, "layerRenders");
      let result;
      try {
        result = click.apply(this, values);
      } finally {
        if (old) Object.defineProperty(b, "layerRenders", old);
        else delete b.layerRenders;
      }
      dialog = b.Dialog.open;
      if (dialog?.id !== "multilayer-dialog") return result;
      dialog.onConfirm = function (data: any) {
        if (!active)
          throw new Fault("PLUGIN_UNLOADED", "Multi-Layer was unloaded");
        const chosen: Record<string, any> = {};
        for (const id of ["solid", "translucent"])
          if (data[id] && data[id] !== "None") {
            const matches = b.Outliner.root.filter(
              (node: any) => node instanceof b.Group && node.name === data[id],
            );
            if (matches.length !== 1)
              throw new Fault(
                "LAYER_GROUP",
                "Select one uniquely named root group per layer",
              );
            chosen[id] = matches[0];
          }
        const adapter = new Adapter(b),
          before = adapter.fingerprint(),
          model = codec.compile({ raw: true });
        model.loader = "forge:multi-layer";
        model.layers = {};
        delete model.elements;
        const flags = new Map<any, boolean>(
          b.Cube.all.map((cube: any) => [cube, cube.export]),
        );
        try {
          for (const [id, group] of Object.entries(chosen)) {
            const descendants = new Set<any>();
            group.forEachChild(
              (cube: any) => descendants.add(cube),
              b.Cube,
              false,
            );
            for (const [cube, enabled] of flags)
              cube.export = enabled && descendants.has(cube);
            const compiled = codec.compile({ raw: true });
            model.layers[id] = {
              ...(model.parent ? { parent: model.parent } : {}),
              textures: model.textures,
              elements: compiled.elements ?? [],
            };
          }
        } finally {
          for (const [cube, enabled] of flags) cube.export = enabled;
        }
        if (adapter.fingerprint() !== before)
          throw new Fault(
            "MODEL_CHANGED",
            "Model changed while compiling render layers",
          );
        this.hide();
        b.Blockbench.export({
          type: "Multi-Layer JSON Model",
          extensions: ["json"],
          savetype: "text",
          name: b.Project.name,
          content: JSON.stringify(
            model,
            null,
            b.Settings.get("minifiedout") ? 0 : 2,
          ),
        });
      };
      return result;
    };
    this.onunload = function (this: any, ...values: any[]) {
      if (!active) return;
      active = false;
      const next = this.onload;
      this.onload = function (this: any, ...args: any[]) {
        this.onunload = unload;
        this.onload = next;
        return next.apply(this, args);
      };
      const prior = Object.getOwnPropertyDescriptor(b, "action");
      b.action = action;
      try {
        return unload.apply(this, values);
      } finally {
        if (prior) Object.defineProperty(b, "action", prior);
        else delete b.action;
        action.click = click;
        if (dialog && b.Dialog.open === dialog) dialog.hide();
      }
    };
    return result;
  };
  proto.runOnLoad = loaded;
  return () => {
    if (proto.runOnLoad === loaded) proto.runOnLoad = load;
  };
}
