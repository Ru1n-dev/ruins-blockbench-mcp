import { Adapter, type BB } from "./adapter.ts";
import { Fault } from "../shared/types.ts";

export function installGeenium(b: BB) {
  const proto = b.BBPlugin.prototype,
    loadFile = proto.loadFromFile,
    loadStore = proto.load;
  const id = "geenium_bedrock_entity_helper";
  const save = ({ save, aspects }: any) => {
    if (aspects.pbmc_geenium)
      save.pbmc_geenium = {
        name: b.Project.name,
        geometry_name: b.Project.geometry_name,
      };
  };
  const restore = ({ save }: any) => {
    if (save.pbmc_geenium) Object.assign(b.Project, save.pbmc_geenium);
  };
  b.Blockbench.on("create_undo_save", save);
  b.Blockbench.on("load_undo_save", restore);
  const withLegacy = async function (this: any, run: () => Promise<any>) {
    const globals = [
      "addEntityCube",
      "getEntityName",
      "changeTextureSizes",
      "createBones",
      "onUninstall",
    ];
    const descriptors = new Map(
      globals.map((key) => [key, Object.getOwnPropertyDescriptor(b, key)]),
    );
    const Dialog = b.Dialog,
      addMenu = b.Blockbench.addMenuEntry;
    let legacyDialog: any, form: any;
    b.Dialog = new Proxy(Dialog, {
      construct(target, params) {
        const instance = Reflect.construct(target, params) as object;
        if (params[0]?.id === "entity_selector") {
          legacyDialog = instance;
          form = params[0];
        }
        return instance;
      },
    });
    b.Blockbench.addMenuEntry = (
      name: string,
      icon: string,
      callback: Function,
    ) => {
      if (name !== "Bedrock Entity Generator") {
        if (addMenu) return addMenu.call(b.Blockbench, name, icon, callback);
        throw new Error("Unrecognized legacy menu registration");
      }
      const createBones = b.createBones,
        changeSize = b.changeTextureSizes,
        getName = b.getEntityName;
      const document = new DOMParser().parseFromString(
        form.lines.join("\n"),
        "text/html",
      );
      const options = Object.fromEntries(
        [...document.querySelectorAll("option")].map((option) => [
          option.value,
          option.textContent,
        ]),
      );
      if (Object.keys(options).length !== 67)
        throw new Error("Unexpected legacy entity preset catalog");
      legacyDialog.delete();
      let action: any, dialog: any;
      b.BBPlugin.register(id, {
        title: "Bedrock Entity Model Presets",
        author: "Geenium",
        version: "0.3.0",
        variant: "both",
        icon: "pets",
        description:
          "Official legacy presets adapted to Blockbench 5.1.6 by Ruin's BlockBenchMCP",
        onload() {
          action = new b.Action("geenium_entity_generator", {
            name: "Bedrock Entity Generator",
            icon: "pets",
            condition: () => ["bedrock", "bedrock_old"].includes(b.Format?.id),
            click() {
              const project = b.Project,
                fingerprint = new Adapter(b).fingerprint();
              dialog = new Dialog("pbmc_geenium_entity", {
                title: "Entity Selector",
                form: {
                  entity: {
                    label: "Entity",
                    type: "select",
                    options,
                    value: "humanoid",
                  },
                  model: {
                    label: "Create entity model",
                    type: "checkbox",
                    value: true,
                  },
                  inherit: {
                    label: "Add default entity parent",
                    type: "checkbox",
                    value: false,
                    condition: () => b.Format.id === "bedrock_old",
                  },
                },
                onConfirm(values: any) {
                  if (
                    b.Project !== project ||
                    new Adapter(b).fingerprint() !== fingerprint
                  )
                    throw new Fault(
                      "STALE_PROJECT",
                      "Project changed while selecting an entity preset",
                    );
                  if (!Object.hasOwn(options, values.entity))
                    throw new Fault("INVALID_PRESET", "Unknown entity preset");
                  if (values.inherit && b.Format.id !== "bedrock_old")
                    throw new Fault(
                      "FORMAT_UNSUPPORTED",
                      "Parent geometry syntax requires the legacy Bedrock format",
                    );
                  const groups = new Set(b.Group.all),
                    cubes = new Set(b.Cube.all),
                    elements: any[] = [];
                  const leaked = [
                    "addEntityCube",
                    "cubeValues",
                    "rotationValues",
                    "bone_group",
                    "selected_group",
                  ];
                  const prior = new Map(
                    leaked.map((key) => [
                      key,
                      Object.getOwnPropertyDescriptor(b, key),
                    ]),
                  );
                  b.Undo.initEdit({
                    outliner: true,
                    elements,
                    uv_mode: true,
                    selection: true,
                    pbmc_geenium: true,
                  });
                  try {
                    b.addEntityCube = (
                      name: string,
                      from: number[],
                      to: number[],
                      uv: number[],
                      inflate = 0,
                      mirror?: boolean,
                    ) => {
                      const cube = new b.Cube({
                        name,
                        from: from.slice(),
                        to: to.slice(),
                        uv_offset: uv.slice(),
                        inflate,
                        mirror_uv: mirror !== undefined,
                        box_uv: true,
                      })
                        .addTo(b.Group.all[b.Group.all.length - 1])
                        .init();
                      elements.push(cube);
                    };
                    changeSize(values.entity);
                    createBones(values.entity, values.model);
                    for (const group of b.Group.all)
                      if (!groups.has(group)) {
                        group.origin = group.origin.slice();
                        group.rotation = group.rotation.slice();
                      }
                    b.Project.geometry_name = getName(
                      values.entity,
                      values.inherit,
                    ).replace(/^geometry\./, "");
                    if (!b.Project.name) b.Project.name = "mobs";
                    b.Canvas.updateAll();
                    b.updateSelection();
                    b.Undo.finishEdit("Generate legacy Bedrock entity");
                  } catch (error) {
                    for (const cube of b.Cube.all)
                      if (!cubes.has(cube) && !elements.includes(cube))
                        elements.push(cube);
                    b.Undo.cancelEdit(true);
                    throw error;
                  } finally {
                    for (const [key, descriptor] of prior) {
                      if (descriptor) Object.defineProperty(b, key, descriptor);
                      else delete b[key];
                    }
                  }
                  dialog.hide();
                },
              }).show();
            },
          });
          b.MenuBar.addAction(action, "tools");
        },
        onunload() {
          action?.delete();
          dialog?.hide();
          dialog?.delete();
        },
      });
    };
    try {
      return await run();
    } finally {
      b.Dialog = Dialog;
      b.Blockbench.addMenuEntry = addMenu;
      if (!addMenu) delete b.Blockbench.addMenuEntry;
      for (const [key, descriptor] of descriptors) {
        if (descriptor) Object.defineProperty(b, key, descriptor);
        else delete b[key];
      }
    }
  };
  const loaded = function (this: any, file: any, ...args: any[]) {
    if (!file.path?.replaceAll("\\", "/").endsWith(`/${id}.js`))
      return loadFile.call(this, file, ...args);
    return withLegacy.call(this, () => loadFile.call(this, file, ...args));
  };
  const stored = function (this: any, ...args: any[]) {
    if (this.id !== id || this.version !== "0.3.0")
      return loadStore.apply(this, args);
    return withLegacy.call(this, () => loadStore.apply(this, args));
  };
  proto.loadFromFile = loaded;
  proto.load = stored;
  return () => {
    if (proto.load === stored) proto.load = loadStore;
    if (proto.loadFromFile === loaded) proto.loadFromFile = loadFile;
    b.Blockbench.removeListener("create_undo_save", save);
    b.Blockbench.removeListener("load_undo_save", restore);
  };
}
