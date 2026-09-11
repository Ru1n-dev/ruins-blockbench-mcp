import { Adapter, type BB } from "./adapter.ts";
import { Fault } from "../shared/types.ts";
import { labChannels } from "./pbr-lab-codec.ts";

export function installPbrMaterials(
  b: BB,
  channels: string[],
  scope: (run: () => any) => any,
  active: () => boolean,
) {
  const codec = b.Codecs.material;
  const allowed = [...channels, ...labChannels];
  const validate = (input: any) => {
    if (typeof input === "string") {
      if (input.length > 24000000)
        throw new Fault("PBR_SIZE", "Material JSON exceeds 24 MB");
      try {
        input = JSON.parse(input);
      } catch {
        throw new Fault("PBR_MATERIAL", "Invalid material JSON");
      }
    }
    if (
      input?.version !== "1.0.0" ||
      !input.channels ||
      typeof input.channels !== "object" ||
      Array.isArray(input.channels)
    )
      throw new Fault(
        "PBR_MATERIAL",
        "Expected a version 1.0.0 material with channels",
      );
    const values = Object.entries(input.channels).filter(
      ([key]) => key !== "preview",
    );
    if (
      !values.length ||
      values.length > allowed.length ||
      values.some(([key]) => !allowed.includes(key))
    )
      throw new Fault("PBR_CHANNEL", "Unknown or empty material channel set");
    let bytes = 0,
      pixels = 0;
    for (const [, url] of values) {
      if (
        typeof url !== "string" ||
        !/^data:image\/png;base64,[a-z\d+/]+={0,2}$/i.test(url)
      )
        throw new Fault(
          "PBR_IMAGE",
          "Material channels must be embedded PNG images",
        );
      bytes += url.length;
      let head: Uint8Array;
      try {
        head = Uint8Array.from(
          b.atob(url.slice(url.indexOf(",") + 1, url.indexOf(",") + 1 + 44)),
          (c: string) => c.charCodeAt(0),
        );
      } catch {
        throw new Fault("PBR_IMAGE", "Invalid PNG base64");
      }
      if (
        head.length < 24 ||
        [137, 80, 78, 71, 13, 10, 26, 10].some((v, i) => head[i] !== v) ||
        String.fromCharCode(...head.slice(12, 16)) !== "IHDR"
      )
        throw new Fault("PBR_IMAGE", "Invalid PNG header");
      const view = new DataView(head.buffer),
        w = view.getUint32(16),
        h = view.getUint32(20);
      pixels += w * h;
      if (
        !w ||
        !h ||
        w > 2048 ||
        h > 2048 ||
        pixels > 16777216 ||
        bytes > 24000000
      )
        throw new Fault(
          "PBR_SIZE",
          "Use PNGs up to 2048 pixels per side, 16 million total pixels and 24 MB",
        );
    }
    return values as [string, string][];
  };
  const importMaterial = async (input: any, file: any = {}) => {
    const values = validate(input),
      owner = b.Project,
      adapter = new Adapter(b),
      fingerprint = adapter.fingerprint();
    const images = await Promise.all(
      values.map(async ([channel, url]) => {
        const image = new b.Image();
        image.src = url;
        try {
          await image.decode();
        } catch {
          throw new Fault("PBR_IMAGE", `Cannot decode ${channel} PNG`);
        }
        return { channel, image, url };
      }),
    );
    if (
      !active() ||
      b.Project !== owner ||
      adapter.fingerprint() !== fingerprint
    )
      throw new Fault(
        "PBR_CHANGED",
        "Project or plugin changed while decoding material",
      );
    return scope(() => {
      const width = Math.max(...images.map((i) => i.image.naturalWidth)),
        height = Math.max(...images.map((i) => i.image.naturalHeight));
      const textures: any[] = [],
        aspects: any = {
          textures,
          bitmap: true,
          texture_order: true,
          selected_texture: true,
          pbmc_pbr: true,
        };
      b.Undo.initEdit(aspects);
      try {
        const name = String(file.name ?? "Material")
          .split(/[\\/]/)
          .pop()!
          .replace(/\.bbmat$/i, "");
        const texture = new b.Texture({
          name,
          pbr_material: true,
          layers_enabled: true,
          width,
          height,
          uv_width: width,
          uv_height: height,
        });
        textures.push(texture);
        texture.add(false);
        texture.width = width;
        texture.height = height;
        texture.layers_enabled = true;
        texture.internal = true;
        texture.source_overwritten = true;
        const ordered = images.sort(
          (a, c) =>
            Number(a.channel === "albedo") - Number(c.channel === "albedo"),
        );
        const map: any = {};
        texture.layers = ordered.map(({ channel, image }) => {
          const layer = new b.TextureLayer(
            { name: channel, channel, visible: true },
            texture,
          );
          layer.canvas.width = image.naturalWidth;
          layer.canvas.height = image.naturalHeight;
          layer.ctx.drawImage(image, 0, 0);
          layer.scale = [
            width / image.naturalWidth,
            height / image.naturalHeight,
          ];
          // Retain the native image-update callback for later edits, while
          // installing an already decoded image for this initial state.
          image.onload = layer.img.onload;
          layer.img = image;
          map[channel] = layer.uuid;
          return layer;
        });
        b.Project.pbr_materials[texture.uuid] = map;
        texture.selected_layer =
          texture.layers.find((l: any) => l.channel === "albedo") ??
          texture.layers[0];
        texture.updateChangesAfterEdit();
        texture.select();
        texture.selected_layer.select();
        b.Canvas.updateAll();
        b.Undo.finishEdit("Create PBR material", aspects);
        return texture;
      } catch (e) {
        if (b.Undo.current_save) b.Undo.cancelEdit(true);
        throw e;
      }
    });
  };
  codec.parse = (input: any) => Object.fromEntries(validate(input));
  codec.load = importMaterial;
  codec.compile = () => {
    const texture = b.Texture.selected;
    if (!texture?.pbr_material || !texture.layers_enabled)
      throw new Fault("PBR_SELECTION", "Select a layered PBR material");
    const output: any = {};
    for (const layer of texture.layers) {
      if (!allowed.includes(layer.channel)) continue;
      if (Object.hasOwn(output, layer.channel))
        throw new Fault(
          "PBR_CHANNEL",
          `Multiple layers assigned to ${layer.channel}`,
        );
      output[layer.channel] = layer.canvas.toDataURL("image/png");
    }
    const result = { version: "1.0.0", channels: output };
    validate(result);
    return JSON.stringify(result);
  };
  codec.export = () =>
    b.Blockbench.export({
      type: "Blockbench Material",
      extensions: ["bbmat"],
      name: b.Texture.selected?.name ?? "material",
      content: codec.compile(),
    });
  b.BarItems.export_bbmat.click = () => codec.export();
  b.BarItems.import_bbmat.click = () =>
    b.Blockbench.import(
      { extensions: ["bbmat"], type: "json", multiple: true },
      async (files: any[]) => {
        for (const file of files) await importMaterial(file.content, file);
      },
    );
  b.BarItems.create_material_texture.click = () => {
    const source = b.Texture.selected,
      width = source?.width ?? b.Project.texture_width,
      height = source?.height ?? b.Project.texture_height;
    if (width > 2048 || height > 2048)
      throw new Fault("PBR_SIZE", "Use a material up to 2048 pixels per side");
    const defaults: any = {
      albedo: "#808080",
      metalness: "#000000",
      emissive: "#000000",
      roughness: "#ffffff",
      height: "#808080",
      normal: "#8080ff",
      ao: "#ffffff",
    };
    const candidates = source?.layers_enabled
      ? source.layers
      : b.Texture.all.filter((t: any) => t.selected || t.multi_selected);
    const mapped = new Set(
      Object.values(b.Project.pbr_materials[source?.uuid] ?? {}),
    );
    if (!source?.layers_enabled)
      for (const texture of b.Texture.all)
        if (mapped.has(texture.uuid) && !candidates.includes(texture))
          candidates.push(texture);
    const output = Object.fromEntries(
      [
        ...channels,
        ...labChannels.filter((channel) =>
          candidates.some((t: any) => t.channel === channel),
        ),
      ].map((channel) => {
        const assigned =
          candidates.find((t: any) => t.channel === channel) ??
          (channel === "albedo" ? source : undefined);
        if (assigned) return [channel, assigned.canvas.toDataURL("image/png")];
        const canvas = b.document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = defaults[channel];
        ctx.fillRect(0, 0, width, height);
        return [channel, canvas.toDataURL("image/png")];
      }),
    );
    return importMaterial(
      { version: "1.0.0", channels: output },
      {
        name: source
          ? `${source.name.replace(/\.png$/i, "")} Material`
          : "Material",
      },
    );
  };
}
