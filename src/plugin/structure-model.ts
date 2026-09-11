import { Adapter, type BB } from "./adapter.ts";
import { Fault } from "../shared/types.ts";
import { readStructureNbt } from "./structure-nbt.ts";
import { structureAlgorithms } from "./generated/structure-model.ts";
import { structureTextureExport } from "./structure-textures.ts";
import { validateStructureModel } from "./structure-model-data.ts";

export function structureAsset(
  root: string,
  id: string,
  kind: string,
  extension: string,
) {
  if (typeof id !== "string" || !/^(?:[a-z0-9_.-]+:)?[a-z0-9_./-]+$/.test(id))
    throw new Fault("STM_ASSET", "Invalid resource identifier");
  const [namespace, name] = id.includes(":")
    ? id.split(":")
    : ["minecraft", id];
  if (
    [namespace, ...name.split("/")].some((p) => !p || p === "." || p === "..")
  )
    throw new Fault("STM_ASSET", "Resource identifier escapes its asset root");
  return `${root.replace(/[\\/]+$/, "")}/${namespace}/${kind}/${name}.${extension}`;
}

export function installStructureModel(b: BB) {
  const proto = b.BBPlugin.prototype,
    load = proto.runOnLoad;
  const cleanups = new Set<() => void>();
  let textureProperty: any;
  const loaded = function (this: any, ...args: any[]) {
    if (this.id !== "structure_to_model" || this.version !== "1.0.0")
      return load.apply(this, args);
    const Dialog = b.Dialog;
    let settingsDialog: any;
    b.Dialog = new Proxy(Dialog, {
      construct(target, params) {
        if (params[0]?.id === "stm_settings") {
          const config = params[0];
          params = [
            {
              ...config,
              form: {
                ...config.form,
                asset_root: {
                  ...config.form.asset_root,
                  type: "text",
                  description:
                    "Asset directory containing namespace folders such as minecraft/blockstates, minecraft/models, and minecraft/textures",
                },
              },
            },
            ...params.slice(1),
          ];
        }
        const d = Reflect.construct(target, params) as object;
        if (params[0]?.id === "stm_settings") settingsDialog = d;
        return d;
      },
    });
    let result;
    try {
      result = load.apply(this, args);
    } finally {
      b.Dialog = Dialog;
    }
    const action = b.BarItems.stm_import,
      originalClick = action.onClick,
      originalCondition = action.condition,
      originalUnload = this.onunload;
    let active = true,
      busy = false;
    textureProperty ??= new b.Property(b.Texture, "object", "pbmc_stm", {
      default: {},
    });
    const disposeExport = structureTextureExport(b, () => active);
    // Desktop Filesystem.readFile is synchronous. Its error path does not invoke
    // the callback, so reject explicitly instead of leaving an import pending.
    const read = (filename: string, readtype: string): any => {
      let output: any;
      b.Filesystem.readFile(
        [filename],
        { readtype, errorbox: false },
        (files: any[]) => {
          output = files[0]?.content;
        },
      );
      if (output === undefined)
        throw new Fault("STM_ASSET_MISSING", `Cannot read asset: ${filename}`);
      if ((output.byteLength ?? output.length) > 16 * 1024 * 1024)
        throw new Fault("STM_LIMIT", "Asset exceeds 16 MiB");
      return output;
    };
    action.condition = () => !!b.Project && !!b.Format?.meshes && !busy;
    action.onClick = () => {
      const owner = b.Project,
        adapter = new Adapter(b),
        fingerprint = adapter.fingerprint();
      const root = localStorage.getItem("stm_asset_root") || "";
      const scale = Number(localStorage.getItem("stm_scale") || 16);
      const colors: Record<string, string> = {
        plains: "#79C05A",
        jungle: "#59C93C",
        swamp: "#6A7039",
        desert: "#BFB755",
        snowy: "#80B497",
      };
      const preset = localStorage.getItem("stm_tint_preset") || "none";
      const tint =
        preset === "custom"
          ? localStorage.getItem("stm_tint_color") || "#ffffff"
          : colors[preset];
      if (
        !root ||
        !Number.isFinite(scale) ||
        scale < 1 ||
        (tint && !/^#[0-9a-f]{6}$/i.test(tint))
      )
        throw new Fault(
          "STM_SETTINGS",
          "Set an asset root, positive scale, and valid tint in STM Settings",
        );
      const guard = () => {
        if (
          !active ||
          b.Project !== owner ||
          adapter.fingerprint() !== fingerprint
        )
          throw new Fault(
            "STM_CHANGED",
            "Project or plugin changed while preparing the structure",
          );
      };
      b.Filesystem.importFile(
        {
          type: "Minecraft Structure",
          extensions: ["nbt"],
          readtype: "buffer",
        },
        async (files: any[]) => {
          if (!files.length) return;
          if (busy)
            throw new Fault("STM_BUSY", "Another structure is being prepared");
          busy = true;
          try {
            guard();
            const data = await readStructureNbt(files[0].content);
            const json = (filename: string) =>
              JSON.parse(read(filename, "text"));
            const algorithms = structureAlgorithms(
              async (assetRoot: string, id: string) =>
                validateStructureModel(
                  json(structureAsset(assetRoot, id, "models", "json")),
                ),
            );
            const cache = new Map(),
              models: any[] = [];
            for (const entry of data.palette) {
              if (
                [
                  "minecraft:air",
                  "minecraft:cave_air",
                  "minecraft:void_air",
                ].includes(entry.name)
              ) {
                models.push([]);
                continue;
              }
              const state = json(
                structureAsset(root, entry.name, "blockstates", "json"),
              );
              const variants = algorithms.variants(state, entry.properties),
                elements: any[] = [];
              if (!variants.length)
                throw new Fault(
                  "STM_VARIANT",
                  `No model matches ${entry.name}`,
                );
              for (const variant of variants) {
                const model = await algorithms.model(
                  root,
                  variant.model,
                  cache,
                );
                elements.push(
                  ...algorithms.rotate(model.elements, variant, entry.name),
                );
              }
              if (elements.length > 4096)
                throw new Fault(
                  "STM_LIMIT",
                  "Palette model exceeds 4096 elements",
                );
              models.push(elements);
              guard();
            }
            const neighbours = algorithms.neighbours(
              data.blocks,
              models,
              data.palette,
            );
            const prepared: any[] = [],
              images = new Map<string, any>();
            let imagePixels = 0;
            for (const block of data.blocks) {
              const elements = algorithms
                .cull(models[block.state], block.pos, neighbours)
                .filter((e: any) => Object.keys(e.faces).length);
              for (const element of elements) {
                for (const field of [
                  element.from,
                  element.to,
                  element.rotation?.origin,
                ].filter(Boolean))
                  if (
                    !Array.isArray(field) ||
                    field.length !== 3 ||
                    !field.every(
                      (n: any) => typeof n === "number" && Number.isFinite(n),
                    )
                  )
                    throw new Fault("STM_MODEL", "Invalid model coordinates");
                const faces: Record<string, any> = {};
                for (const [side, f] of Object.entries(element.faces) as [
                  string,
                  any,
                ][]) {
                  const color = f.tintindex !== undefined ? tint : undefined;
                  const key = `${f.texture}|${color || ""}`;
                  if (!images.has(key)) {
                    if (images.size >= 256)
                      throw new Fault(
                        "STM_LIMIT",
                        "Structure exceeds 256 textures",
                      );
                    const bytes = read(
                      structureAsset(root, f.texture, "textures", "png"),
                      "buffer",
                    );
                    const header = new DataView(bytes);
                    if (
                      bytes.byteLength < 24 ||
                      header.getUint32(0) !== 0x89504e47 ||
                      header.getUint32(4) !== 0x0d0a1a0a ||
                      header.getUint32(12) !== 0x49484452 ||
                      !header.getUint32(16) ||
                      !header.getUint32(20) ||
                      header.getUint32(16) > 2048 ||
                      header.getUint32(20) > 2048
                    )
                      throw new Fault(
                        "STM_LIMIT",
                        "Expected a PNG within 2048×2048 pixels",
                      );
                    const blob = URL.createObjectURL(
                      new Blob([bytes], { type: "image/png" }),
                    );
                    imagePixels += header.getUint32(16) * header.getUint32(20);
                    if (imagePixels > 16 * 1024 * 1024) {
                      URL.revokeObjectURL(blob);
                      throw new Fault(
                        "STM_LIMIT",
                        "Combined decoded textures exceed 16 million pixels",
                      );
                    }
                    const image = new b.Image();
                    try {
                      image.src = blob;
                      await image.decode();
                    } finally {
                      URL.revokeObjectURL(blob);
                    }
                    if (
                      image.width > 2048 ||
                      image.height > 2048 ||
                      !image.width ||
                      !image.height
                    )
                      throw new Fault(
                        "STM_LIMIT",
                        "Textures must fit within 2048×2048",
                      );
                    const canvas = document.createElement("canvas");
                    canvas.width = image.width;
                    canvas.height = image.height;
                    const ctx = canvas.getContext("2d")!;
                    ctx.drawImage(image, 0, 0);
                    if (color) {
                      const pixels = ctx.getImageData(
                        0,
                        0,
                        canvas.width,
                        canvas.height,
                      );
                      const rgb = [1, 3, 5].map(
                        (i) => parseInt(color.slice(i, i + 2), 16) / 255,
                      );
                      for (let i = 0; i < pixels.data.length; i += 4)
                        for (let j = 0; j < 3; j++)
                          pixels.data[i + j] = Math.round(
                            pixels.data[i + j] * rgb[j],
                          );
                      ctx.putImageData(pixels, 0, 0);
                    }
                    images.set(key, {
                      canvas,
                      id: f.texture,
                      tinted: !!color,
                      color,
                    });
                    guard();
                  }
                  faces[side] = { ...f, key };
                }
                prepared.push({
                  name: data.palette[block.state].name.split(":").at(-1),
                  element,
                  faces,
                  pos: block.pos,
                });
                if (prepared.length > 100000)
                  throw new Fault(
                    "STM_LIMIT",
                    "Structure exceeds 100000 cubes",
                  );
              }
            }
            guard();
            const elements: any[] = [],
              textures: any[] = [],
              groups: any[] = [];
            const aspects = {
              outliner: true,
              elements,
              textures,
              groups,
              bitmap: true,
              selection: true,
              texture_order: true,
            };
            b.Undo.initEdit(aspects);
            try {
              for (const output of images.values()) {
                const canvas = output.canvas;
                const texture = new b.Texture({
                  name:
                    output.id.split("/").at(-1) +
                    (output.tinted ? "_tinted" : "") +
                    ".png",
                  width: canvas.width,
                  height: canvas.height,
                  uv_width: 16,
                  uv_height: 16,
                  pbmc_stm: output.tinted
                    ? { source: output.id, color: output.color }
                    : {},
                });
                textures.push(texture);
                output.texture = texture;
                texture.canvas.width = canvas.width;
                texture.canvas.height = canvas.height;
                texture.ctx.drawImage(canvas, 0, 0);
                texture.source = canvas.toDataURL();
                texture.internal = true;
                texture.source_overwritten = true;
                texture.add(false);
                texture.updateChangesAfterEdit();
              }
              const group = new b.Group({
                name: files[0].name.replace(/\.nbt$/i, ""),
                origin: [0, 0, 0],
              });
              groups.push(group);
              group.addTo().init();
              const counts = new Map<string, number>(),
                blockGroups = new Map<string, any>();
              for (const p of prepared) {
                const key = p.pos.join(",");
                counts.set(key, (counts.get(key) || 0) + 1);
              }
              for (const p of prepared) {
                const key = p.pos.join(",");
                let parent = group;
                if (counts.get(key)! > 1) {
                  parent = blockGroups.get(key);
                  if (!parent) {
                    parent = new b.Group({ name: p.name, origin: [0, 0, 0] });
                    groups.push(parent);
                    parent.addTo(group).init();
                    blockGroups.set(key, parent);
                  }
                }
                const faces = Object.fromEntries(
                  Object.entries(p.faces).map(([side, f]: [string, any]) => [
                    side,
                    {
                      uv: f.uv,
                      rotation: f.rotation || 0,
                      texture: images.get(f.key).texture.uuid,
                    },
                  ]),
                );
                const e = p.element;
                const cube = new b.Cube({
                  name: p.name,
                  from: algorithms.position(p.pos, e.from, scale),
                  to: algorithms.position(p.pos, e.to, scale),
                  box_uv: false,
                  autouv: 0,
                  faces,
                });
                if (e.rotation) {
                  cube.origin = algorithms.position(
                    p.pos,
                    e.rotation.origin,
                    scale,
                  );
                  cube.rotation = ["x", "y", "z"].map((axis) =>
                    axis === e.rotation.axis ? e.rotation.angle : 0,
                  );
                }
                for (const side of Object.keys(cube.faces))
                  if (!faces[side]) cube.faces[side].texture = null;
                elements.push(cube);
                cube.addTo(parent).init();
              }
              b.Canvas.updateAll();
              b.updateInterface();
              b.Undo.finishEdit(`Import structure: ${group.name}`, aspects);
              return {
                blocks: data.blocks.length,
                cubes: elements.length,
                textures: textures.length,
              };
            } catch (error) {
              if (b.Undo.current_save) b.Undo.cancelEdit(true);
              throw error;
            }
          } finally {
            busy = false;
          }
        },
      );
    };
    const cleanup = () => {
      active = false;
      disposeExport();
      action.onClick = originalClick;
      action.condition = originalCondition;
      settingsDialog?.hide();
      settingsDialog?.delete();
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
    textureProperty?.delete();
  };
}
