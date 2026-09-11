import { Adapter, type BB } from "./adapter.ts";
import { Fault } from "../shared/types.ts";
import { resolvePbrChannel } from "./pbr-mer.ts";
import { pbrCanvas } from "./pbr-images.ts";

export function installPbrBake(
  b: BB,
  scope: (run: () => any) => any,
  active: () => boolean,
) {
  const dialogs = new Set<any>();
  b.BarItems.bake_textures.condition = () =>
    !!b.Project && !!b.Texture.selected;
  b.BarItems.bake_textures.click = () => {
    const source = b.Texture.selected,
      owner = b.Project;
    const adapter = new Adapter(b),
      fingerprint = adapter.fingerprint();
    const dialog = new b.Dialog("pbmc_bake_textures", {
      title: "Bake Textures",
      form: {
        ambientLight: {
          type: "color",
          label: "Ambient Light",
          value: "#1f1f1f",
        },
        lightDiffuse: {
          type: "color",
          label: "Light Diffuse",
          value: "#ffffff",
        },
        lightHeight: {
          type: "number",
          label: "Light Height",
          value: 0.66,
          min: 0,
          max: 1,
          step: 0.01,
        },
        minLightIntensity: {
          type: "number",
          label: "Minimum Light Intensity",
          value: 0,
          min: 0,
          max: 1,
          step: 0.01,
        },
        directions: {
          type: "number",
          label: "Directions",
          value: 8,
          min: 1,
          max: 360,
          step: 1,
        },
        blendEmissive: {
          type: "checkbox",
          label: "Blend Emissive",
          value: false,
        },
        normal_type: {
          type: "select",
          label: "Source Normal Convention",
          options: { opengl: "OpenGL", directx: "DirectX" },
          value: "opengl",
        },
      },
      onConfirm: async (form: any) => {
        const unchanged = () =>
          active() &&
          b.Project === owner &&
          adapter.fingerprint() === fingerprint;
        if (!unchanged())
          throw new Fault(
            "PBR_CHANGED",
            "Material changed while the bake dialog was open",
          );
        if (
          !Number.isInteger(form.directions) ||
          form.directions < 1 ||
          form.directions > 360 ||
          ![form.lightHeight, form.minLightIntensity].every(
            (n) => Number.isFinite(n) && n >= 0 && n <= 1,
          ) ||
          !["opengl", "directx"].includes(form.normal_type)
        )
          throw new Fault("PBR_BAKE", "Invalid lighting or direction count");
        const width = source.width,
          height = source.height;
        if (width * height * form.directions > 16000000)
          throw new Fault(
            "PBR_SIZE",
            "Use at most 16 million total baked pixels",
          );
        const read = (channel: string) => {
          const map = resolvePbrChannel(b, source, channel);
          if (!map)
            throw new Fault(
              "PBR_CHANNEL",
              `Assign the ${channel} image before baking`,
            );
          const c = pbrCanvas(b, width, height),
            ctx = c.getContext("2d");
          ctx.imageSmoothingEnabled = false;
          if (map instanceof b.TextureLayer)
            ctx.drawImage(
              map.canvas,
              map.offset[0],
              map.offset[1],
              map.scaled_width,
              map.scaled_height,
            );
          else ctx.drawImage(map.canvas, 0, 0, width, height);
          return ctx.getImageData(0, 0, width, height).data;
        };
        const albedo = read("albedo"),
          normal = read("normal"),
          emissive = form.blendEmissive ? read("emissive") : null;
        const rgb = (value: any) => {
          const c = b.tinycolor(value.toString());
          if (!c.isValid()) throw new Fault("PBR_COLOR", "Invalid light color");
          const v = c.toRgb();
          return [v.r / 255, v.g / 255, v.b / 255];
        };
        const ambient = rgb(form.ambientLight),
          diffuse = rgb(form.lightDiffuse);
        const images: any[] = [];
        for (let direction = 0; direction < form.directions; direction++) {
          const c = pbrCanvas(b, width, height),
            ctx = c.getContext("2d"),
            data = ctx.createImageData(width, height);
          const angle = (direction * Math.PI * 2) / form.directions,
            light = [Math.cos(angle), Math.sin(angle), form.lightHeight];
          for (let i = 0; i < normal.length; i += 4) {
            const n = [
              normal[i] / 127.5 - 1,
              (normal[i + 1] / 127.5 - 1) *
                (form.normal_type === "directx" ? -1 : 1),
              normal[i + 2] / 127.5 - 1,
            ];
            const length = Math.hypot(...n);
            const dot = length
              ? n.reduce((sum, v, j) => sum + v * light[j], 0) / length
              : light[2];
            const intensity = Math.max(
              form.minLightIntensity,
              Math.min(1, dot),
            );
            for (let channel = 0; channel < 3; channel++) {
              let value = Math.min(
                1,
                Math.max(
                  0,
                  intensity * (albedo[i + channel] / 255) * diffuse[channel] +
                    ambient[channel],
                ),
              );
              if (emissive)
                value =
                  1 -
                  (1 - value) *
                    (1 -
                      ((emissive[i + channel] / 255) * emissive[i + 3]) / 255);
              data.data[i + channel] = Math.floor(value * 255);
            }
            data.data[i + 3] = albedo[i + 3];
          }
          ctx.putImageData(data, 0, 0);
          const image = new b.Image();
          image.src = c.toDataURL("image/png");
          await image.decode();
          images.push(image);
          if (!unchanged())
            throw new Fault("PBR_CHANGED", "Material changed while baking");
        }
        return scope(() => {
          const textures: any[] = [],
            aspects: any = {
              textures,
              bitmap: true,
              texture_order: true,
              selected_texture: true,
            };
          b.Undo.initEdit(aspects);
          try {
            const result = new b.Texture({
              name: `${source.name.replace(/\.png$/i, "")}_baked`,
              width,
              height,
              uv_width: source.getUVWidth(),
              uv_height: source.getUVHeight(),
            });
            textures.push(result);
            result.add(false);
            result.layers_enabled = true;
            result.internal = true;
            result.source_overwritten = true;
            result.layers = images.map((image, index) => {
              const layer = new b.TextureLayer(
                { name: `baked_${index + 1}`, visible: index === 0 },
                result,
              );
              layer.canvas.width = width;
              layer.canvas.height = height;
              layer.ctx.drawImage(image, 0, 0);
              image.onload = layer.img.onload;
              layer.img = image;
              return layer;
            });
            result.selected_layer = result.layers[0];
            result.updateChangesAfterEdit();
            result.select();
            result.selected_layer.select();
            b.Canvas.updateAll();
            b.Undo.finishEdit("Bake PBR textures", aspects);
            dialog.hide();
          } catch (e) {
            if (b.Undo.current_save) b.Undo.cancelEdit(true);
            throw e;
          }
        });
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
