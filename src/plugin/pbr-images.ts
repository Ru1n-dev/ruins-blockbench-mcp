import { Adapter, type BB } from "./adapter.ts";
import { Fault } from "../shared/types.ts";

export function pbrCanvas(b: BB, width: number, height: number) {
  if (![width, height].every((n) => Number.isInteger(n) && n > 0 && n <= 2048))
    throw new Fault("PBR_SIZE", "Use images from 1 to 2048 pixels per side");
  const c = b.document.createElement("canvas");
  c.width = width;
  c.height = height;
  return c;
}

/** Decode all images first, then add them in one native Undo transaction. */
export async function addPbrImages(
  b: BB,
  source: any,
  outputs: { channel: string; c: HTMLCanvasElement }[],
  layers: boolean,
  label: string,
  scope: (run: () => any) => any,
  active: () => boolean,
) {
  const t = source instanceof b.TextureLayer ? source.texture : source;
  const owner = b.Project,
    adapter = new Adapter(b),
    fingerprint = adapter.fingerprint();
  const prepared = await Promise.all(
    outputs.map(async (output) => {
      const image = new b.Image(),
        url = output.c.toDataURL("image/png");
      image.src = url;
      await image.decode();
      return { ...output, image, url };
    }),
  );
  if (!active() || owner !== b.Project || adapter.fingerprint() !== fingerprint)
    throw new Fault(
      "PBR_CHANGED",
      "Project or plugin changed while preparing PBR images",
    );
  return scope(() => {
    const textures = layers ? [t] : [],
      created: any[] = [];
    const aspects: any = {
      textures,
      bitmap: true,
      texture_order: true,
      selected_texture: true,
      pbmc_pbr: true,
    };
    b.Undo.initEdit(aspects);
    try {
      const mapping = (b.Project.pbr_materials[t.uuid] ??= {});
      for (const { channel, c, image, url } of prepared) {
        if (layers) {
          for (const l of t.layers)
            if (l.channel === channel) l.channel = "_NONE_";
          const l = new b.TextureLayer(
            { name: `${source.name}_${channel}`, channel, visible: false },
            t,
          );
          l.canvas.width = c.width;
          l.canvas.height = c.height;
          l.ctx.drawImage(c, 0, 0);
          l.offset = [...(source.offset ?? [0, 0])];
          l.scale = [...(source.scale ?? [1, 1])];
          image.onload = l.img.onload;
          l.img = image;
          t.layers.push(l);
          mapping[channel] = l.uuid;
          created.push(l);
        } else {
          const result = new b.Texture({
            name: `${source.name.replace(/\.png$/i, "")}_${channel}`,
            channel,
            width: c.width,
            height: c.height,
            uv_width: t.getUVWidth(),
            uv_height: t.getUVHeight(),
          });
          textures.push(result);
          // The native callback closes over Texture's original Image. Retain
          // it and let updateChangesAfterEdit refresh from our prepared canvas.
          result.canvas.width = c.width;
          result.canvas.height = c.height;
          result.ctx.drawImage(c, 0, 0);
          result.source = url;
          result.internal = true;
          result.source_overwritten = true;
          result.add(false);
          result.updateChangesAfterEdit();
          mapping[channel] = result.uuid;
          created.push(result);
        }
      }
      if (layers) t.updateChangesAfterEdit();
      b.Canvas.updateAll();
      b.Undo.finishEdit(label, aspects);
      return created;
    } catch (e) {
      if (b.Undo.current_save) b.Undo.cancelEdit(true);
      throw e;
    }
  });
}
