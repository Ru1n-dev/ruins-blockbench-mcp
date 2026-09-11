import type { BB } from "./adapter.ts";
import { Fault } from "../shared/types.ts";
import { validatePreviewScene } from "./preview-scene-import.ts";
import { installSceneStore } from "./preview-scene-store.ts";
import { sceneTextureControls } from "./preview-scene-texture.ts";

export function readSceneRecords(b: BB): any[] {
  const raw = b.localStorage.getItem("preview_scenes");
  if (raw && raw.length > 64000000)
    throw new Fault("SCENE_STORAGE", "Stored scenes exceed 64 MB");
  let records;
  try {
    records = JSON.parse(raw || "[]");
  } catch {
    throw new Fault(
      "SCENE_STORAGE",
      "Stored scenes contain invalid JSON; the original data was retained",
    );
  }
  if (
    !Array.isArray(records) ||
    records.length > 1000 ||
    records.some(
      (r) =>
        !r ||
        typeof r.id !== "string" ||
        typeof r.name !== "string" ||
        !r.model,
    )
  )
    throw new Fault("SCENE_STORAGE", "Invalid stored scene records");
  return records;
}

export function installSceneManager(
  b: BB,
  active: () => boolean,
  dialogs: Set<any>,
) {
  const owned = new Map<string, { scene: any; model: any }>();
  let menu: any;
  b.BarItems.preview_scene_customiser.click = (event: any) => {
    menu?.hide();
    menu = new b.Menu(
      "pbmc_preview_scene_menu",
      b.BarItems.preview_scene_customiser.children,
    );
    menu.open(event?.target);
  };
  const destroyModel = (model: any) => {
    model.disable();
    model.model_3d.traverse((object: any) => object.geometry?.dispose());
    model.material?.map?.dispose();
    model.material?.dispose();
    if (b.PreviewModel.models[model.id] === model)
      delete b.PreviewModel.models[model.id];
  };
  for (const record of readSceneRecords(b)) {
    const scene = b.PreviewScene.scenes[record.id],
      model = b.PreviewModel.models[record.id];
    if (scene && model) {
      owned.set(record.id, { scene, model });
      scene.require_minecraft_eula =
        record.eula === true || record.model.require_minecraft_eula === true;
      if (record.model.settings) {
        const settings = record.model.settings;
        if (settings.lightSide !== undefined)
          scene.light_side = settings.lightSide;
        if (settings.lightColour) {
          const c = b.tinycolor(settings.lightColour).toRgb();
          scene.light_color = { r: c.r / 255, g: c.g / 255, b: c.b / 255 };
        }
      }
    }
  }
  const ensure = () => {
    if (!active())
      throw new Fault("STALE_STATE", "Preview Scene Customiser was unloaded");
  };
  const form = (model: any) => ({
    name: { label: "Scene Name", type: "text", value: "Custom Scene" },
    category: { label: "Category", type: "text", value: "custom" },
    renderSide: {
      label: "Render Side",
      type: "select",
      options: { 0: "Front Side", 1: "Back Side", 2: "Double Side" },
      value: model.settings?.renderSide ?? 2,
    },
    lightSide: {
      label: "Light Side",
      type: "select",
      options: {
        0: "Up",
        1: "North",
        2: "East",
        3: "Down",
        4: "South",
        5: "West",
      },
      value: model.settings?.lightSide ?? 0,
    },
    lightColour: {
      label: "Light Color",
      type: "color",
      value: model.settings?.lightColour ?? "#ffffff",
    },
    tintColour: {
      label: "Tint Color",
      type: "color",
      value: model.settings?.tintColour ?? "#ffffff",
    },
    shading: {
      label: "Shading",
      type: "checkbox",
      value: model.settings?.shading ?? true,
    },
  });
  const install = (input: any, args: any = {}) => {
    ensure();
    const model = validatePreviewScene(b, input);
    if (!model.texture)
      throw new Fault("SCENE_TEXTURE", "The scene needs an embedded PNG");
    const fields = form(model);
    fields.name.value = args.name || fields.name.value;
    fields.category.value = args.category || fields.category.value;
    const textureControls = sceneTextureControls(b, model);
    const dialog = new b.Dialog("pbmc_install_preview_scene", {
      title: "Install Preview Scene",
      form: { ...fields, replacement: textureControls.field },
      lines: [textureControls.line],
      onConfirm(values: any) {
        ensure();
        const name = String(values.name).trim(),
          category = String(values.category)
            .trim()
            .toLowerCase()
            .replace(/\s+/g, "_");
        const id = name.toLowerCase().replace(/\s+/g, "_");
        if (
          !name ||
          name.length > 120 ||
          !/^[\p{L}\p{N}_-]{1,120}$/u.test(id) ||
          !/^[\p{L}\p{N}_-]{1,64}$/u.test(category) ||
          ["__proto__", "constructor", "prototype"].some(
            (k) => k === id || k === category,
          )
        )
          throw new Fault(
            "SCENE_NAME",
            "Use a unique scene name and category containing letters, numbers, spaces, underscores or hyphens",
          );
        if (b.PreviewScene.scenes[id] || b.PreviewModel.models[id])
          throw new Fault("SCENE_EXISTS", "That scene ID already exists");
        model.texture = textureControls.choose(values);
        model.settings = {
          renderSide: Number(values.renderSide),
          lightSide: Number(values.lightSide),
          lightColour: b.tinycolor(values.lightColour).toHexString(),
          tintColour: b.tinycolor(values.tintColour).toHexString(),
          shading: values.shading,
        };
        model.render_side = model.settings.renderSide;
        model.color = model.settings.tintColour;
        model.shading = model.settings.shading;
        const eula =
          args.eula === true || model.require_minecraft_eula === true;
        model.require_minecraft_eula = eula;
        const records = readSceneRecords(b),
          raw = b.localStorage.getItem("preview_scenes");
        const data = JSON.stringify([
          ...records,
          { id, name, category, model, eula },
        ]);
        if (data.length > 64000000)
          throw new Fault("SCENE_STORAGE", "Stored scenes exceed 64 MB");
        b.localStorage.setItem("preview_scenes", data);
        let preview: any, scene: any;
        const createdCategory = !b.PreviewScene.menu_categories[category];
        try {
          preview = new b.PreviewModel(id, model);
          b.PreviewScene.menu_categories[category] ??= { _label: category };
          const c = b.tinycolor(model.settings.lightColour).toRgb();
          scene = new b.PreviewScene(id, {
            name,
            category,
            preview_models: [id],
            require_minecraft_eula: eula,
            light_side: model.settings.lightSide,
            light_color: { r: c.r / 255, g: c.g / 255, b: c.b / 255 },
          });
          owned.set(id, { scene, model: preview });
        } catch (error) {
          scene?.delete();
          if (preview) destroyModel(preview);
          if (createdCategory) delete b.PreviewScene.menu_categories[category];
          if (raw === null) b.localStorage.removeItem("preview_scenes");
          else b.localStorage.setItem("preview_scenes", raw);
          throw error;
        }
      },
    });
    dialogs.add(dialog);
    textureControls.attach(dialog);
    dialog.show();
  };
  b.BarItems.install_preview_scene.click = () =>
    install(
      b.Codecs.preview_scene_codec.compile({
        raw: true,
        settings: {
          renderSide: b.Project.preview_scene_render_side,
          lightSide: b.Project.preview_scene_light_side,
          lightColour: b.Project.preview_scene_light_colour,
          tintColour: b.Project.preview_scene_tint_colour,
          shading: b.Project.preview_scene_shading,
        },
      }),
    );
  b.BarItems.import_preview_scene_model.click = () =>
    b.Blockbench.import(
      { extensions: ["bbscene"], readtype: "text", type: "Preview Scene" },
      (files: any[]) => {
        if (files?.length) return install(JSON.parse(files[0].content));
      },
    );
  const sceneData = (scene: any) => {
    if (scene.preview_models.length !== 1)
      throw new Fault(
        "SCENE_MODELS",
        "Select a scene with a single preview model",
      );
    const model = scene.preview_models[0];
    return validatePreviewScene(b, {
      ...model.build_data,
      require_minecraft_eula: scene.require_minecraft_eula,
      texture_size: model.texture_size,
      settings: {
        renderSide: model.render_side,
        lightSide: scene.light_side,
        lightColour: b.tinycolor.fromRatio(scene.light_color).toHexString(),
        tintColour:
          typeof model.color === "string"
            ? model.color
            : b.tinycolor.fromRatio(model.color).toHexString(),
        shading: model.shading,
      },
    });
  };
  b.BarItems.manage_preview_scene_models.click = () => {
    ensure();
    const scenes = Object.values(b.PreviewScene.scenes) as any[];
    const dialog = new b.Dialog("pbmc_manage_preview_scenes", {
      title: "Manage Preview Scenes",
      form: {
        scene: {
          label: "Scene",
          type: "select",
          options: Object.fromEntries(scenes.map((s) => [s.id, s.name])),
          value: scenes[0]?.id,
        },
      },
      buttons: ["Close", "Activate", "Edit", "Export", "Delete"],
      confirmIndex: 0,
      cancelIndex: 0,
      onButton(index: number) {
        if (index === 0) return;
        ensure();
        const id = dialog.getFormResult().scene,
          scene = b.PreviewScene.scenes[id];
        if (!scene)
          throw new Fault("STALE_STATE", "The scene no longer exists");
        if (index === 1) {
          return Promise.resolve(scene.select()).then(() => false);
        }
        if (index === 2) {
          const data = sceneData(scene);
          dialog.hide();
          const project = b.Codecs.preview_scene_codec.parse(data);
          project.name = scene.id;
          return false;
        }
        if (index === 3) {
          const data = sceneData(scene);
          b.Blockbench.export({
            type: "Preview Scene",
            extensions: ["bbscene"],
            savetype: "text",
            name: scene.id,
            content: JSON.stringify(data, null, 2),
          });
          return false;
        }
        if (index === 4) {
          const entry = owned.get(id);
          if (!entry || entry.scene !== scene)
            throw new Fault(
              "SCENE_BUILTIN",
              "Only custom scenes owned by this plugin can be deleted",
            );
          b.Blockbench.showMessageBox(
            {
              title: "Delete Preview Scene",
              message: `Delete ${scene.name}?`,
              buttons: ["Cancel", "Delete"],
              confirmIndex: 1,
              cancelIndex: 0,
            },
            (answer: number) => {
              if (answer !== 1) return;
              ensure();
              if (b.PreviewScene.scenes[id] !== scene)
                throw new Fault("STALE_STATE", "The scene changed");
              const records = readSceneRecords(b);
              b.localStorage.setItem(
                "preview_scenes",
                JSON.stringify(records.filter((r) => r.id !== id)),
              );
              if (b.PreviewScene.active === scene) scene.unselect();
              scene.delete();
              destroyModel(entry.model);
              owned.delete(id);
              dialog.hide();
            },
          );
          return false;
        }
      },
    });
    dialogs.add(dialog);
    dialog.show();
  };
  const releaseStore = installSceneStore(b, active, dialogs, install);
  return {
    owned,
    release() {
      menu?.hide();
      releaseStore();
      for (const [id, { scene, model }] of owned) {
        if (b.PreviewScene.active === scene) scene.unselect();
        if (b.PreviewScene.scenes[id] === scene) scene.delete();
        destroyModel(model);
      }
      owned.clear();
    },
  };
}
