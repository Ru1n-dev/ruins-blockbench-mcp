import { Adapter, type BB } from "./adapter.ts";
import { Fault } from "../shared/types.ts";
import { readStructureNbt } from "./structure-nbt.ts";

function oldStructure(data: Awaited<ReturnType<typeof readStructureNbt>>) {
  const list = (values: any[]) => ({ value: { value: values } });
  return {
    value: {
      size: list(data.size),
      palette: list(
        data.palette.map((p: any) => ({
          Name: { value: p.name },
          Properties: {
            value: Object.fromEntries(
              Object.entries({
                ...p.properties,
                // The native function's var half carries the preceding slab's
                // value when absent. Also accept modern Java's type property.
                ...(p.name.includes("slab")
                  ? { half: p.properties.half ?? p.properties.type ?? "double" }
                  : {}),
              }).map(([k, v]) => [k, { value: v }]),
            ),
          },
        })),
      ),
      blocks: list(
        data.blocks.map((p: any) => ({
          pos: list(p.pos),
          state: { value: p.state },
        })),
      ),
    },
  };
}

export function installLegacyStructure(b: BB) {
  const proto = b.BBPlugin.prototype,
    load = proto.runOnLoad;
  const keys = [
    "structure_importer_selectResourcePath",
    "structure_importer_addResourcePack",
    "structure_importer_run",
    "pathSetting",
    "buttonNumber",
  ];
  const previousGlobals = new Map(
    keys.map((key) => [key, Object.getOwnPropertyDescriptor(b, key)]),
  );
  const previousNbt = Object.getOwnPropertyDescriptor(b.Blockbench, "nbt_lib"),
    libraries = new WeakMap<object, any>(),
    globals = new WeakMap<object, Map<string, any>>(),
    cleanups = new Set<() => void>();
  const loaded = function (this: any, ...args: any[]) {
    if (this.id !== "structure_importer" || this.version !== "2.1.7")
      return load.apply(this, args);
    if (!libraries.has(this)) {
      libraries.set(this, b.Blockbench.nbt_lib);
      globals.set(this, new Map(keys.slice(0, 3).map((key) => [key, b[key]])));
    }
    const nbt = libraries.get(this);
    b.Blockbench.nbt_lib = nbt;
    for (const [key, value] of globals.get(this)!) b[key] = value;
    const Action = b.Action,
      add = b.MenuBar.addAction;
    let action: any, dialog: any;
    b.Action = new Proxy(Action, {
      construct(target, params) {
        if (params[0]?.id === "structure_importer" && action) return action;
        const result = Reflect.construct(target, params) as object;
        if (params[0]?.id === "structure_importer") action = result;
        return result;
      },
    });
    b.MenuBar.addAction = function (item: any, location: string) {
      return add.call(this, item, location === "filter" ? "tools" : location);
    };
    let result;
    try {
      result = load.apply(this, args);
    } finally {
      b.Action = Action;
      b.MenuBar.addAction = add;
    }
    const click = action.onClick,
      originalUnload = this.onunload;
    let active = true;
    action.onClick = function (...params: any[]) {
      const Dialog = b.Dialog;
      b.Dialog = new Proxy(Dialog, {
        construct(target, inputs) {
          const config = inputs[0];
          if (config?.id !== "structure_importer_options")
            return Reflect.construct(target, inputs) as object;
          const confirm = config.onConfirm;
          const d = Reflect.construct(target, [
            {
              ...config,
              onConfirm(values: any) {
                if (
                  !d.object.querySelector("#structure_importer_legacy")?.checked
                )
                  throw new Fault(
                    "STRUCTURE_ASSET_ADAPTER_REQUIRED",
                    "The 2.1.7 asset-based importer is not yet ported; legacy mode is available",
                  );
                const Group = b.Group,
                  receive = b.Blockbench.import,
                  owner = b.Project,
                  adapter = new Adapter(b),
                  fingerprint = adapter.fingerprint();
                b.Group = new Proxy(Group, {
                  construct(target, inputs) {
                    // Native StructureBuilder allocates an unused Group before showing
                    // its file picker, even for legacy mode. Keep cancellation empty.
                    if (inputs[0] === "structure")
                      return {
                        init() {
                          return this;
                        },
                        addTo() {
                          return this;
                        },
                      };
                    return Reflect.construct(target, inputs) as object;
                  },
                });
                b.Blockbench.import = (options: any, callback: Function) =>
                  receive(options, async (files: any[]) => {
                    const parse = nbt.parse;
                    let pending: Promise<any> | undefined;
                    nbt.parse = (bytes: ArrayBuffer, done: Function) => {
                      pending = readStructureNbt(bytes).then((data) => {
                        if (
                          !active ||
                          owner !== b.Project ||
                          adapter.fingerprint() !== fingerprint
                        )
                          throw new Fault(
                            "STRUCTURE_CHANGED",
                            "Project or plugin changed before structure import",
                          );
                        const aspects = () => ({
                          outliner: true,
                          groups: [...b.Group.all],
                          elements: [...b.Outliner.elements],
                          selection: true,
                        });
                        const globals = new Map(
                          ["si", "saveSettings"].map((key) => [
                            key,
                            Object.getOwnPropertyDescriptor(b, key),
                          ]),
                        );
                        const grid = b.settings.edit_size.value;
                        // The old auto-fit code calls a removed global and changes a
                        // global grid setting. Preserve that preference during import.
                        b.saveSettings = () => {};
                        b.Undo.initEdit(aspects());
                        try {
                          done(null, oldStructure(data));
                          b.Canvas.updateAll();
                          b.Undo.finishEdit(
                            "Import legacy structure",
                            aspects(),
                          );
                        } catch (error) {
                          if (b.Undo.current_save) b.Undo.cancelEdit(true);
                          throw error;
                        } finally {
                          b.settings.edit_size.value = grid;
                          for (const [key, descriptor] of globals) {
                            if (descriptor)
                              Object.defineProperty(b, key, descriptor);
                            else delete b[key];
                          }
                        }
                      });
                      return pending;
                    };
                    try {
                      callback(files);
                    } finally {
                      nbt.parse = parse;
                    }
                    return pending;
                  });
                try {
                  return confirm.call(this, values);
                } finally {
                  b.Group = Group;
                  b.Blockbench.import = receive;
                }
              },
            },
          ]) as any;
          dialog = d;
          return d;
        },
      });
      try {
        return click.apply(this, params);
      } finally {
        b.Dialog = Dialog;
      }
    };
    const cleanup = () => {
      active = false;
      dialog?.hide();
      dialog?.delete();
      action.delete();
      b.MenuBar.removeAction("tools.structure_importer");
      if (b.Blockbench.nbt_lib === nbt) {
        if (previousNbt)
          Object.defineProperty(b.Blockbench, "nbt_lib", previousNbt);
        else delete b.Blockbench.nbt_lib;
      }
      for (const [key, descriptor] of previousGlobals) {
        if (descriptor) Object.defineProperty(b, key, descriptor);
        else delete b[key];
      }
      cleanups.delete(cleanup);
    };
    cleanups.add(cleanup);
    this.onunload = () => {
      cleanup();
      this.onunload = originalUnload;
      return originalUnload?.call(this);
    };
    return result;
  };
  proto.runOnLoad = loaded;
  return () => {
    for (const cleanup of [...cleanups]) cleanup();
    if (proto.runOnLoad === loaded) proto.runOnLoad = load;
  };
}
