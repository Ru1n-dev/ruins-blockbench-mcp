import { Adapter, type BB } from "./adapter.ts";
import { Fault } from "../shared/types.ts";
import { addPbrImages, pbrCanvas } from "./pbr-images.ts";
import { resolvePbrChannel } from "./pbr-mer.ts";
import {
  labChannels,
  packLab,
  unpackLab,
  readPackedPng,
  writePackedPng,
} from "./pbr-lab-codec.ts";

export function installPbrLab(
  b: BB,
  scope: (run: () => any) => any,
  active: () => boolean,
) {
  const dialogs = new Set<any>();
  const can = () => !!b.Project && !!b.Texture.selected;
  for (const id of ["generate_lab_pbr", "decode_lab_pbr"])
    b.BarItems[id].condition = can;
  b.BarItems.generate_lab_pbr.click = () => {
    const texture = b.Texture.selected,
      owner = b.Project,
      adapter = new Adapter(b),
      fingerprint = adapter.fingerprint();
    const dialog = new b.Dialog("pbmc_export_lab", {
      title: "Export labPBR PNG Pair",
      form: {
        name: {
          type: "text",
          label: "Asset Name",
          value:
            texture.name
              .replace(/(?:_[ns])?\.png$/i, "")
              .replace(/[^a-z0-9_-]+/gi, "_")
              .slice(0, 100) || "material",
        },
        f0: {
          type: "number",
          label: "Default Dielectric F0 (0–229)",
          value: 10,
          min: 0,
          max: 229,
          step: 1,
        },
        metal: {
          type: "select",
          label: "Default Metal",
          value: "255",
          options: {
            230: "Iron",
            231: "Gold",
            232: "Aluminum",
            233: "Chrome",
            234: "Copper",
            235: "Lead",
            236: "Platinum",
            237: "Silver",
            255: "Albedo F0",
          },
        },
        normal_type: {
          type: "select",
          label: "Source Normal Convention",
          value: "opengl",
          options: { opengl: "OpenGL", directx: "DirectX" },
        },
      },
      onConfirm: async (form: any) => {
        const send = b.Blockbench.export;
        const unchanged = () =>
          active() &&
          b.Project === owner &&
          adapter.fingerprint() === fingerprint;
        if (!unchanged())
          throw new Fault(
            "PBR_CHANGED",
            "Material changed while the labPBR dialog was open",
          );
        if (
          !/^[a-z0-9][a-z0-9_-]{0,99}$/i.test(form.name) ||
          !Number.isInteger(form.f0) ||
          form.f0 < 0 ||
          form.f0 > 229 ||
          ![230, 231, 232, 233, 234, 235, 236, 237, 255].includes(
            Number(form.metal),
          ) ||
          !["opengl", "directx"].includes(form.normal_type)
        )
          throw new Fault("PBR_LAB", "Invalid labPBR export options");
        const width = texture.width,
          height = texture.height,
          maps: Record<string, Uint8ClampedArray> = {};
        const sources = [
          "normal",
          "ao",
          "height",
          "roughness",
          "metalness",
          "emissive",
          ...labChannels,
        ]
          .map((channel) => ({
            channel,
            source: resolvePbrChannel(b, texture, channel),
          }))
          .filter((entry) => entry.source);
        if (width * height * sources.length > 16000000)
          throw new Fault(
            "PBR_SIZE",
            "Use at most 16 million assigned channel pixels",
          );
        for (const { channel, source } of sources) {
          const c = pbrCanvas(b, width, height),
            ctx = c.getContext("2d");
          ctx.imageSmoothingEnabled = false;
          ctx.fillStyle =
            channel === "normal"
              ? "#8080ff"
              : ["ao", "height", "roughness"].includes(channel)
                ? "#ffffff"
                : "#000000";
          ctx.fillRect(0, 0, width, height);
          if (source instanceof b.TextureLayer)
            ctx.drawImage(
              source.canvas,
              source.offset[0],
              source.offset[1],
              source.scaled_width,
              source.scaled_height,
            );
          else ctx.drawImage(source.canvas, 0, 0, width, height);
          maps[channel] = ctx.getImageData(0, 0, width, height).data;
        }
        const packed = packLab(maps, width * height, {
          f0: form.f0,
          metal: Number(form.metal),
          directX: form.normal_type === "directx",
        });
        const zip = new b.JSZip();
        zip.file(
          `${form.name}_s.png`,
          writePackedPng(width, height, packed.specular),
        );
        zip.file(
          `${form.name}_n.png`,
          writePackedPng(width, height, packed.normal),
        );
        const content = await zip.generateAsync({
          type: "uint8array",
          compression: "DEFLATE",
        });
        if (!unchanged())
          throw new Fault(
            "PBR_CHANGED",
            "Material changed while preparing labPBR output",
          );
        send({
          type: "labPBR PNG Pair",
          extensions: ["zip"],
          name: form.name,
          savetype: "zip",
          content,
        });
        dialog.hide();
      },
    });
    dialogs.add(dialog);
    dialog.show();
  };
  b.BarItems.decode_lab_pbr.click = () => {
    const texture = b.Texture.selected,
      source = texture.layers_enabled ? texture.getActiveLayer() : texture;
    if (!source)
      throw new Fault(
        "PBR_SELECTION",
        "Select a packed labPBR image or a target texture",
      );
    const owner = b.Project,
      adapter = new Adapter(b),
      fingerprint = adapter.fingerprint();
    const dialog = new b.Dialog("pbmc_decode_lab", {
      title: "Decode labPBR PNG",
      form: {
        kind: {
          type: "select",
          label: "Packed Map",
          options: {
            specular: "Specular (_s)",
            normal: "Normal / AO / Height (_n)",
          },
          value: /_n(?:\.png)?$/i.test(source.name) ? "normal" : "specular",
        },
        input: {
          type: "select",
          label: "Input",
          options: {
            selected: "Selected Embedded PNG",
            file: "Choose PNG File",
          },
          value: "selected",
        },
        destination: {
          type: "select",
          label: "Output",
          options: texture.layers_enabled
            ? { textures: "New Textures", layers: "Material Layers" }
            : { textures: "New Textures" },
          value: "textures",
        },
      },
      onConfirm: (form: any) => {
        if (
          !active() ||
          b.Project !== owner ||
          adapter.fingerprint() !== fingerprint
        )
          throw new Fault(
            "PBR_CHANGED",
            "Selection changed while the decoder was open",
          );
        if (
          !["normal", "specular"].includes(form.kind) ||
          !["selected", "file"].includes(form.input) ||
          !["textures", "layers"].includes(form.destination) ||
          (form.destination === "layers" && !texture.layers_enabled)
        )
          throw new Fault("PBR_LAB", "Invalid decoder options");
        const process = (bytes: Uint8Array) => {
          const image = readPackedPng(bytes),
            decoded = unpackLab(image.data, form.kind);
          if (
            image.width * image.height * Object.keys(decoded).length >
            16000000
          )
            throw new Fault(
              "PBR_SIZE",
              "Use at most 16 million decoded channel pixels",
            );
          const outputs = Object.entries(decoded).map(([channel, data]) => {
            const c = pbrCanvas(b, image.width, image.height),
              ctx = c.getContext("2d"),
              pixels = ctx.createImageData(image.width, image.height);
            pixels.data.set(data);
            ctx.putImageData(pixels, 0, 0);
            return { channel, c };
          });
          return addPbrImages(
            b,
            source,
            outputs,
            form.destination === "layers",
            `Decode labPBR ${form.kind}`,
            scope,
            active,
          );
        };
        if (form.input === "file")
          return b.Blockbench.import(
            {
              type: "labPBR PNG",
              extensions: ["png"],
              readtype: "binary",
              multiple: false,
            },
            (files: any[]) =>
              files[0] ? process(new Uint8Array(files[0].content)) : undefined,
          );
        let url =
          source instanceof b.TextureLayer ? source.img.src : source.source;
        if (source instanceof b.TextureLayer) {
          const c = pbrCanvas(b, source.width, source.height),
            ctx = c.getContext("2d");
          ctx.drawImage(source.img, 0, 0);
          const original = ctx.getImageData(0, 0, c.width, c.height).data,
            current = source.ctx.getImageData(0, 0, c.width, c.height).data;
          if (original.some((v: number, i: number) => v !== current[i]))
            url = source.canvas.toDataURL("image/png");
        }
        if (typeof url !== "string" || !/^data:image\/png;base64,/i.test(url))
          throw new Fault(
            "PBR_PNG",
            "Choose the PNG file to decode a linked image without losing packed alpha data",
          );
        return process(
          Uint8Array.from(b.atob(url.split(",")[1]), (c: string) =>
            c.charCodeAt(0),
          ),
        );
      },
    });
    dialogs.add(dialog);
    dialog.show();
  };
  return () => {
    for (const dialog of dialogs) {
      dialog.hide();
      dialog.delete();
    }
    dialogs.clear();
  };
}
