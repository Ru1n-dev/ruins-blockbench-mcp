import type { BB } from "./adapter.ts";
import { Fault } from "../shared/types.ts";
import { readPackedPng } from "./pbr-lab-codec.ts";

export function sceneTextureControls(b: BB, model: any) {
  const dimensions = (source: any) => {
    if (
      typeof source !== "string" ||
      source.length > 32000000 ||
      !/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(source)
    )
      throw new Fault("SCENE_TEXTURE", "Choose an embedded PNG");
    return readPackedPng(
      Uint8Array.from(b.atob(source.split(",")[1]), (c: any) =>
        c.charCodeAt(0),
      ),
    );
  };
  const original = dimensions(model.texture);
  const choose = (values: any) => {
    const source = values.replacement?.content || model.texture;
    if (source !== model.texture) {
      const size = dimensions(source);
      if (size.width !== original.width || size.height !== original.height)
        throw new Fault(
          "SCENE_TEXTURE_SIZE",
          `Replacement PNG must be ${original.width} × ${original.height} pixels`,
        );
    }
    return source;
  };
  const line = b.document.createElement("div"),
    image = b.document.createElement("img"),
    button = b.document.createElement("button");
  image.src = model.texture;
  image.alt = "Preview scene texture";
  image.style.cssText =
    "max-width:100%;height:128px;object-fit:contain;image-rendering:pixelated";
  button.textContent = "Save Texture";
  button.type = "button";
  line.append(image, button);
  return {
    field: {
      label: "Replacement PNG (optional)",
      type: "file",
      extensions: ["png"],
      readtype: "image",
      return_as: "file",
    },
    line,
    choose,
    attach(dialog: any) {
      dialog.onFormChange = (values: any) => {
        try {
          image.src = choose(values);
        } catch {
          /* Validation is reported on confirm/save, preserving the last valid preview. */
        }
      };
      button.onclick = () =>
        b.Blockbench.export({
          type: "PNG Texture",
          extensions: ["png"],
          savetype: "image",
          name: "scene_texture",
          content: choose(dialog.getFormResult()),
        });
    },
  };
}
