import type { BB } from "./adapter.ts";
import { addPbrImages, pbrCanvas } from "./pbr-images.ts";
import { Fault } from "../shared/types.ts";

export function resolvePbrChannel(b: BB, t: any, channel: string) {
  const candidates = t.layers_enabled ? t.layers : b.Texture.all;
  const id = b.Project.pbr_materials?.[t.uuid]?.[channel];
  if (id) {
    const result = [...candidates, ...b.Texture.all].find(
      (n: any) => n.uuid === id,
    );
    if (!result)
      throw new Fault("PBR_CHANNEL", `Missing assigned ${channel} image`);
    return result;
  }
  const matches = candidates.filter((n: any) => n.channel === channel);
  if (matches.length > 1)
    throw new Fault(
      "PBR_CHANNEL",
      `Multiple ${channel} images; select a layered material or assign a unique channel`,
    );
  return matches[0];
}

export function createMerCanvas(b: BB, t: any) {
  const sources = ["metalness", "emissive", "roughness"].map((c) =>
    resolvePbrChannel(b, t, c),
  );
  const width = t.layers_enabled
    ? t.width
    : Math.max(t.width, ...sources.map((s) => s?.width ?? 0));
  const height = t.layers_enabled
    ? t.height
    : Math.max(t.height, ...sources.map((s) => s?.height ?? 0));
  const out = pbrCanvas(b, width, height),
    ctx = out.getContext("2d"),
    data = ctx.createImageData(width, height);
  const maps = sources.map((s, index) => {
    const c = pbrCanvas(b, width, height),
      context = c.getContext("2d");
    context.fillStyle = index === 2 ? "#ffffff" : "#000000";
    context.fillRect(0, 0, width, height);
    context.imageSmoothingEnabled = false;
    if (s) {
      if (s instanceof b.TextureLayer)
        context.drawImage(
          s.canvas,
          s.offset[0],
          s.offset[1],
          s.scaled_width,
          s.scaled_height,
        );
      else context.drawImage(s.canvas, 0, 0, width, height);
    }
    return context.getImageData(0, 0, width, height).data;
  });
  for (let i = 0; i < data.data.length; i += 4) {
    for (let c = 0; c < 3; c++) data.data[i + c] = maps[c][i + c];
    data.data[i + 3] = 255;
  }
  ctx.putImageData(data, 0, 0);
  return out;
}

// MER stores linear scalar maps, without sRGB conversion: metalness R,
// emission G and roughness B. Alpha is opaque; this is MER, not MERS.
export function installPbrMer(
  b: BB,
  scope: (run: () => any) => any,
  active: () => boolean,
) {
  const channels = ["metalness", "emissive", "roughness"];
  const canvas = (width: number, height: number) => pbrCanvas(b, width, height);
  const texture = () => {
    const t = b.Texture.selected;
    if (!b.Project || !t) throw new Fault("PBR_SELECTION", "Select a texture");
    return t;
  };
  b.BarItems.create_mer.condition = () => !!b.Project && !!b.Texture.selected;
  b.BarItems.create_mer.click = () => {
    const t = texture(),
      out = createMerCanvas(b, t);
    return b.Blockbench.export({
      type: "MER PNG",
      extensions: ["png"],
      savetype: "image",
      resource_id: "mer",
      name: `${t.name.replace(/\.png$/i, "")}_mer`,
      content: out.toDataURL("image/png"),
    });
  };
  const decode = async (layers: boolean) => {
    const t = texture(),
      source = t.layers_enabled ? t.getActiveLayer() : t;
    if (!source)
      throw new Fault("PBR_SELECTION", "Select the packed MER image or layer");
    canvas(source.width, source.height);
    if (layers && !t.layers_enabled)
      throw new Fault(
        "PBR_SELECTION",
        "Enable layers before decoding to layers",
      );
    const pixels = source.canvas
      .getContext("2d")
      .getImageData(0, 0, source.width, source.height);
    const outputs = channels.map((channel, index) => {
      const c = canvas(source.width, source.height),
        ctx = c.getContext("2d"),
        data = ctx.createImageData(c.width, c.height);
      for (let i = 0; i < data.data.length; i += 4) {
        data.data[i] =
          data.data[i + 1] =
          data.data[i + 2] =
            pixels.data[i + index];
        data.data[i + 3] = 255;
      }
      ctx.putImageData(data, 0, 0);
      return { channel, c };
    });
    return addPbrImages(
      b,
      source,
      outputs,
      layers,
      layers ? "Decode MER to layers" : "Decode MER to textures",
      scope,
      active,
    );
  };
  b.BarItems.decode_mer.condition = () => !!b.Project && !!b.Texture.selected;
  b.BarItems.decode_mer.children = [
    {
      name: "Decode MER to Textures",
      icon: "move_item",
      click: () => decode(false),
    },
    {
      name: "Decode MER to Layers",
      icon: "move_group",
      condition: () => !!b.Texture.selected?.layers_enabled,
      click: () => decode(true),
    },
  ];
  let menu: any;
  b.BarItems.decode_mer.click = (event: any) => {
    menu?.hide();
    menu = new b.Menu("pbmc_decode_mer", b.BarItems.decode_mer.children);
    menu.open(event?.target);
  };
  return () => menu?.hide();
}
