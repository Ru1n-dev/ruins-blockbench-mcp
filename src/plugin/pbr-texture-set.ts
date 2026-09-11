import { Adapter, type BB } from "./adapter.ts";
import { Fault } from "../shared/types.ts";
import { createMerCanvas, resolvePbrChannel } from "./pbr-mer.ts";
import { pbrCanvas } from "./pbr-images.ts";

export function installPbrTextureSet(b: BB, active: () => boolean) {
  const dialogs = new Set<any>();
  b.BarItems.create_texture_set.condition = () =>
    !!b.Project && !!b.Texture.selected;
  b.BarItems.create_texture_set.click = () => {
    const owner = b.Project,
      texture = b.Texture.selected;
    if (!owner || !texture)
      throw new Fault("PBR_SELECTION", "Select a material or texture");
    const adapter = new Adapter(b),
      initial = adapter.fingerprint();
    const dialog = new b.Dialog("texture_set", {
      title: "Export Texture Set Bundle",
      form: {
        name: {
          label: "Asset Name",
          type: "text",
          value:
            texture.name
              .replace(/\.png$/i, "")
              .toLowerCase()
              .replace(/[^a-z0-9_-]+/g, "_")
              .slice(0, 100) || "material",
        },
        colorMode: {
          label: "Base Color",
          type: "select",
          options: { texture: "Albedo Image", constant: "Constant Color" },
          value: "texture",
        },
        baseColor: {
          label: "Color",
          type: "color",
          value: "#808080",
          condition: (f: any) => f.colorMode === "constant",
        },
        merMode: {
          label: "MER",
          type: "select",
          options: {
            texture: "Packed Channel Images",
            constant: "Constant Values",
          },
          value: "texture",
        },
        metalness: {
          label: "Metalness",
          type: "number",
          min: 0,
          max: 255,
          step: 1,
          value: 0,
          condition: (f: any) => f.merMode === "constant",
        },
        emissive: {
          label: "Emissive",
          type: "number",
          min: 0,
          max: 255,
          step: 1,
          value: 0,
          condition: (f: any) => f.merMode === "constant",
        },
        roughness: {
          label: "Roughness",
          type: "number",
          min: 0,
          max: 255,
          step: 1,
          value: 255,
          condition: (f: any) => f.merMode === "constant",
        },
        depthMap: {
          label: "Depth Map",
          type: "select",
          options: { none: "None", normal: "Normal", heightmap: "Height" },
          value: "none",
        },
        normalConvention: {
          label: "Source Normal Convention",
          type: "select",
          options: {
            directx: "DirectX",
            opengl: "OpenGL (convert green channel)",
          },
          value: "directx",
          condition: (f: any) => f.depthMap === "normal",
        },
      },
      onConfirm: async (form: any) => {
        const send = b.Blockbench.export;
        if (
          !active() ||
          b.Project !== owner ||
          !owner.textures.includes(texture) ||
          adapter.fingerprint() !== initial
        )
          throw new Fault(
            "PBR_CHANGED",
            "Material changed while the texture set dialog was open",
          );
        if (!/^[a-z0-9][a-z0-9_-]{0,99}$/.test(form.name))
          throw new Fault(
            "PBR_ASSET",
            "Use an asset name with lowercase letters, digits, underscores or hyphens",
          );
        if (
          !["texture", "constant"].includes(form.colorMode) ||
          !["texture", "constant"].includes(form.merMode) ||
          !["none", "normal", "heightmap"].includes(form.depthMap)
        )
          throw new Fault("PBR_FORM", "Invalid texture set options");
        const pngs: [string, string][] = [],
          set: any = {};
        const image = (source: any, fallback: string) => {
          const c = pbrCanvas(b, texture.width, texture.height),
            ctx = c.getContext("2d");
          ctx.fillStyle = fallback;
          ctx.fillRect(0, 0, c.width, c.height);
          ctx.imageSmoothingEnabled = false;
          if (source instanceof b.TextureLayer)
            ctx.drawImage(
              source.canvas,
              source.offset[0],
              source.offset[1],
              source.scaled_width,
              source.scaled_height,
            );
          else ctx.drawImage(source.canvas, 0, 0, c.width, c.height);
          return c;
        };
        const add = (name: string, c: HTMLCanvasElement) =>
          pngs.push([`${name}.png`, c.toDataURL("image/png").split(",")[1]]);
        if (form.colorMode === "constant") {
          const color =
            form.baseColor?.toHexString?.() ?? String(form.baseColor);
          if (!/^#[a-f0-9]{6}$/i.test(color))
            throw new Fault("PBR_COLOR", "Use a six-digit RGB color");
          set.color = color;
        } else {
          const source = resolvePbrChannel(b, texture, "albedo") ?? texture;
          add(form.name, image(source, "#00000000"));
          set.color = form.name;
        }
        if (form.merMode === "constant") {
          const values = [form.metalness, form.emissive, form.roughness];
          if (!values.every((n) => Number.isInteger(n) && n >= 0 && n <= 255))
            throw new Fault(
              "PBR_VALUE",
              "MER values must be integers from 0 to 255",
            );
          set.metalness_emissive_roughness = values;
        } else {
          const name = `${form.name}_mer`;
          add(name, createMerCanvas(b, texture));
          set.metalness_emissive_roughness = name;
        }
        if (form.depthMap !== "none") {
          const source = resolvePbrChannel(
            b,
            texture,
            form.depthMap === "normal" ? "normal" : "height",
          );
          if (!source)
            throw new Fault(
              "PBR_CHANNEL",
              `Assign the ${form.depthMap} channel before export`,
            );
          const c = image(
            source,
            form.depthMap === "normal" ? "#8080ff" : "#808080",
          );
          if (form.depthMap === "normal") {
            if (!["directx", "opengl"].includes(form.normalConvention))
              throw new Fault(
                "PBR_FORM",
                "Select the source normal convention",
              );
            if (form.normalConvention === "opengl") {
              const ctx = c.getContext("2d"),
                data = ctx.getImageData(0, 0, c.width, c.height);
              for (let i = 1; i < data.data.length; i += 4)
                data.data[i] = 255 - data.data[i];
              ctx.putImageData(data, 0, 0);
            }
          }
          const name = `${form.name}_${form.depthMap}`;
          add(name, c);
          set[form.depthMap] = name;
        }
        if (pngs.reduce((n, [, png]) => n + png.length, 0) > 32000000)
          throw new Fault("PBR_SIZE", "Texture set images exceed 32 MB");
        const zip = new b.JSZip();
        zip.file(
          `${form.name}.texture_set.json`,
          JSON.stringify(
            { format_version: "1.16.100", "minecraft:texture_set": set },
            null,
            2,
          ),
        );
        for (const [file, png] of pngs) zip.file(file, png, { base64: true });
        const content = await zip.generateAsync({
          type: "uint8array",
          compression: "DEFLATE",
        });
        if (
          !active() ||
          b.Project !== owner ||
          adapter.fingerprint() !== initial
        )
          throw new Fault(
            "PBR_CHANGED",
            "Material changed while preparing texture set export",
          );
        send({
          type: "Texture Set Bundle",
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
  return () => {
    for (const d of dialogs) {
      d.hide();
      d.delete();
    }
    dialogs.clear();
  };
}
