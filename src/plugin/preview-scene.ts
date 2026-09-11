import { Adapter, type BB } from "./adapter.ts";
import { Fault } from "../shared/types.ts";
import { parsePreviewScene } from "./preview-scene-import.ts";
import { sceneTextureControls } from "./preview-scene-texture.ts";
import {
  installSceneManager,
  readSceneRecords,
} from "./preview-scene-manager.ts";

export function compilePreviewScene(b: BB, options: any = {}) {
  if (!b.Project) throw new Fault("PROJECT_REQUIRED", "Open a project");
  const texture = b.Texture.getDefault();
  const cubes: any[] = [];
  for (const cube of b.Cube.all) {
    let excluded = false;
    for (let node = cube; node && typeof node === "object"; node = node.parent)
      if (node.export === false) excluded = true;
    if (excluded) continue;
    const mesh = cube.mesh;
    mesh.updateWorldMatrix(true, false);
    const position = new b.THREE.Vector3(),
      quaternion = new b.THREE.Quaternion(),
      scale = new b.THREE.Vector3();
    mesh.matrixWorld.decompose(position, quaternion, scale);
    const rebuilt = new b.THREE.Matrix4().compose(position, quaternion, scale);
    if (
      scale.toArray().some((n: number) => !Number.isFinite(n) || n <= 0) ||
      rebuilt.elements.some(
        (n: number, i: number) =>
          Math.abs(n - mesh.matrixWorld.elements[i]) > 0.00001,
      )
    )
      throw new Fault(
        "SCENE_TRANSFORM",
        "Preview cubes require positive scales without shear",
      );
    mesh.geometry.computeBoundingBox();
    const box = mesh.geometry.boundingBox;
    const from = box.min.clone().multiply(scale).add(position),
      size = box.getSize(new b.THREE.Vector3()).multiply(scale);
    const rotation = new b.THREE.Euler().setFromQuaternion(quaternion, "XYZ");
    const faces: any = {};
    for (const key of b.Canvas.face_order) {
      const face = cube.faces[key];
      if (face.texture === null) continue;
      if (face.getTexture() && texture && face.getTexture() !== texture)
        throw new Fault(
          "SCENE_TEXTURE",
          "Preview scenes use a single texture; combine textures first",
        );
      faces[key] = { uv: [...face.uv], rotation: face.rotation || 0 };
    }
    if (Object.keys(faces).length)
      cubes.push({
        name: cube.name,
        position: from.toArray(),
        size: size.toArray(),
        origin: position.toArray(),
        rotation: [rotation.x, rotation.y, rotation.z].map(
          (n) => (n * 180) / Math.PI,
        ),
        faces,
      });
  }
  if (
    b.Outliner.elements.some(
      (n: any) =>
        n.type !== "cube" && n.export !== false && n.scene_object?.isMesh,
    )
  )
    throw new Fault(
      "SCENE_GEOMETRY",
      "The native preview scene format supports cubes only",
    );
  const result: any = {
    cubes,
    texture_size: texture
      ? [texture.getUVWidth(), texture.getUVHeight()]
      : [b.Project.texture_width, b.Project.texture_height],
  };
  if (texture) result.texture = texture.canvas.toDataURL("image/png");
  if (b.Project.credit) result.credit = b.Project.credit;
  if (options.settings) result.settings = options.settings;
  return options.raw ? result : JSON.stringify(result, null, 2);
}

export function installPreviewScene(b: BB) {
  const proto = b.BBPlugin.prototype,
    load = proto.runOnLoad;
  const unloads = new WeakMap<object, Function>(),
    legacyIDs = new WeakMap<object, Set<string>>();
  const loaded = function (this: any, ...args: any[]) {
    if (this.id !== "preview_scene_customiser" || this.version !== "1.2.0")
      return load.apply(this, args);
    if (!unloads.has(this)) unloads.set(this, this.onunload);
    const records = readSceneRecords(b),
      ids = legacyIDs.get(this) ?? new Set<string>();
    for (const record of records) ids.add(record.id);
    legacyIDs.set(this, ids);
    const oldCondition = b.BarItems.preview_scene.condition;
    const result = load.apply(this, args),
      codec = b.Codecs.preview_scene_codec;
    const nativeCondition = b.BarItems.preview_scene.condition;
    // PreviewModel supports quarter-turn face UVs; the legacy format omitted this flag.
    b.Formats.preview_scene_model.uv_rotation = true;
    codec.parse = (model: any) => parsePreviewScene(b, model);
    codec.load = (model: any, file: any) => {
      const project = codec.parse(model);
      project.name = (file?.name || "scene").replace(/\.bbscene$/i, "");
      return project;
    };
    const dialogs = new Set<any>();
    let active = true;
    codec.compile = (options: any = {}) => compilePreviewScene(b, options);
    codec.export = () => {
      const owner = b.Project,
        adapter = new Adapter(b),
        fingerprint = adapter.fingerprint();
      const model = compilePreviewScene(b, { raw: true });
      if (!model.texture)
        throw new Fault(
          "SCENE_TEXTURE",
          "Add a texture before exporting a preview scene",
        );
      const textureControls = sceneTextureControls(b, model);
      const dialog = new b.Dialog("pbmc_preview_scene_export", {
        title: "Export Preview Scene",
        lines: [textureControls.line],
        form: {
          replacement: textureControls.field,
          renderSide: {
            label: "Render Side",
            type: "select",
            options: { 0: "Front Side", 1: "Back Side", 2: "Double Side" },
            value: owner.preview_scene_render_side ?? 2,
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
            value: owner.preview_scene_light_side ?? 0,
          },
          lightColour: {
            label: "Light Color",
            type: "color",
            value: owner.preview_scene_light_colour || "#ffffff",
          },
          tintColour: {
            label: "Tint Color",
            type: "color",
            value: owner.preview_scene_tint_colour || "#ffffff",
          },
          shading: {
            label: "Shading",
            type: "checkbox",
            value: owner.preview_scene_shading ?? true,
          },
        },
        onConfirm(values: any) {
          if (
            !active ||
            b.Project !== owner ||
            adapter.fingerprint() !== fingerprint
          )
            throw new Fault("STALE_STATE", "The preview model changed");
          model.texture = textureControls.choose(values);
          model.settings = {
            renderSide: Number(values.renderSide),
            lightSide: Number(values.lightSide),
            lightColour: b.tinycolor(values.lightColour).toHexString(),
            tintColour: b.tinycolor(values.tintColour).toHexString(),
            shading: values.shading,
          };
          return b.Blockbench.export({
            resource_id: "model",
            type: "Preview Scene",
            extensions: ["bbscene"],
            name: owner.name || "scene",
            content: JSON.stringify(model, null, 2),
            savetype: "text",
          });
        },
      });
      dialogs.add(dialog);
      textureControls.attach(dialog);
      dialog.show();
    };
    const manager = installSceneManager(b, () => active, dialogs);
    this.onunload = () => {
      const scenes = b.PreviewScene.scenes;
      const current = b.PreviewScene.active;
      const retained =
        current && manager.owned.get(current.id)?.scene !== current
          ? current
          : undefined;
      // The pinned provider retains its loaded IDs across reloads and can delete
      // the same ID twice. A previously removed owned ID is already cleaned up.
      b.PreviewScene.scenes = new Proxy(scenes, {
        get(target, key) {
          const value = Reflect.get(target, key);
          return value === undefined && typeof key === "string" && ids.has(key)
            ? { delete() {} }
            : value;
        },
      });
      try {
        return unloads.get(this)!.call(this);
      } finally {
        b.PreviewScene.scenes = scenes;
        active = false;
        manager.release();
        if (b.BarItems.preview_scene.condition === nativeCondition)
          b.BarItems.preview_scene.condition = oldCondition;
        for (const dialog of dialogs) {
          dialog.hide();
          dialog.delete();
        }
        dialogs.clear();
        if (retained && b.PreviewScene.scenes[retained.id] === retained)
          void retained.select();
      }
    };
    return result;
  };
  proto.runOnLoad = loaded;
  return () => {
    if (proto.runOnLoad === loaded) proto.runOnLoad = load;
  };
}
