import type { BB } from "./adapter.ts";
import { Fault } from "../shared/types.ts";
import { addPbrImages, pbrCanvas } from "./pbr-images.ts";
import { heightNormal, heightOcclusion } from "./pbr-height-maps.ts";

export function installPbrNormals(
  b: BB,
  scope: (run: () => any) => any,
  active: () => boolean,
) {
  for (const [id, channel] of [
    ["generate_dx_normal", "normal"],
    ["generate_opengl_normal", "normal"],
    ["generate_ao", "ao"],
  ]) {
    const action = b.BarItems[id];
    action.condition = () => !!b.Project && !!b.Texture.selected;
    action.click = () => {
      const texture = b.Texture.selected;
      const source = texture?.layers_enabled
        ? texture.getActiveLayer()
        : texture;
      if (!source)
        throw new Fault("PBR_SELECTION", "Select a height image or layer");
      const c = pbrCanvas(b, source.width, source.height),
        ctx = c.getContext("2d");
      const data = source.canvas
        .getContext("2d")
        .getImageData(0, 0, c.width, c.height).data;
      const result =
        channel === "ao"
          ? heightOcclusion(data, c.width, c.height)
          : heightNormal(data, c.width, c.height, id === "generate_dx_normal");
      const image = ctx.createImageData(c.width, c.height);
      image.data.set(result);
      ctx.putImageData(image, 0, 0);
      return addPbrImages(
        b,
        source,
        [{ channel, c }],
        !!texture.layers_enabled,
        action.name,
        scope,
        active,
      );
    };
  }
  b.BarItems.generate_ao.description =
    "Generate local height-field AO (8 directions, 4-pixel radius) from the selected height image";
  b.BarItems.generate_normal.condition = () =>
    !!b.Project && !!b.Texture.selected;
  let menu: any;
  b.BarItems.generate_normal.click = (event: any) => {
    menu?.hide();
    menu = new b.Menu(
      "pbmc_generate_normal",
      b.BarItems.generate_normal.children,
    );
    menu.open(event?.target);
  };
  return () => menu?.hide();
}
