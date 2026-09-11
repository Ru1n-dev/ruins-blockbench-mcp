import type { BB } from "./adapter.ts";
import { Fault } from "../shared/types.ts";
export function noisePixels(
  source: Uint8ClampedArray,
  width: number,
  height: number,
  data: any,
  allow = (x: number, y: number) => true,
) {
  if (source.length !== width * height * 4 || width * height > 4194304)
    throw new Fault(
      "NOISE_LIMIT",
      "Noise supports up to 4194304 canvas pixels",
    );
  const amount = Number(data.amount),
    coverage = Number(data.coverage) / 100;
  if (
    !Number.isFinite(amount) ||
    amount < 0 ||
    amount > 100 ||
    !Number.isFinite(coverage) ||
    coverage < 0 ||
    coverage > 1 ||
    !Number.isFinite(Number(data.seed))
  )
    throw new Fault(
      "NOISE_INPUT",
      "Noise amount, coverage and seed must be finite and within their ranges",
    );
  let seed = Number(data.seed) >>> 0;
  const random = () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const output = new Uint8ClampedArray(source),
    individual = data.channel_mode === "individual";
  const channels = individual
    ? [
        data.red_channel,
        data.green_channel,
        data.blue_channel,
        data.alpha_channel,
      ]
    : [true, true, true, false];
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const covered = random() < coverage,
        values = [random(), random(), random(), random()].map(
          (v) => (v * 2 - 1) * amount,
        );
      if (!covered || !allow(x, y)) continue;
      const pixel = (y * width + x) * 4;
      for (let c = 0; c < 4; c++)
        if (channels[c])
          output[pixel + c] = source[pixel + c] + values[individual ? c : 0];
    }
  return output;
}
export function installNoise(b: BB) {
  const proto = b.BBPlugin.prototype,
    load = proto.runOnLoad;
  const loaded = function (this: any, ...args: any[]) {
    if (this.id !== "let_there_be_noise" || this.version !== "1.0.0")
      return load.apply(this, args);
    const result = load.apply(this, args),
      action = b.BarItems["add_noise.apply"],
      click = action.click,
      unload = this.onunload;
    let active = true,
      dialog: any;
    action.click = function (this: any, ...values: any[]) {
      const tex = b.Texture.getDefault() || b.Texture.all[0];
      if (!tex) return click.apply(this, values);
      const layer = tex.getActiveCanvas(),
        canvas = layer.canvas,
        width = canvas.width,
        height = canvas.height;
      if (width * height > 4194304)
        throw new Fault(
          "NOISE_LIMIT",
          "Noise supports up to 4194304 canvas pixels",
        );
      const ctx = canvas.getContext("2d"),
        original = ctx.getImageData(0, 0, width, height),
        project = b.Project,
        offset = [...(layer.offset ?? [0, 0])];
      const timeout = b.setTimeout;
      b.setTimeout = function (callback: any, delay: any, ...values: any[]) {
        if (
          typeof callback === "function" &&
          String(callback).includes("getElementById('add_noise_preview')")
        )
          return 0;
        return timeout.call(b, callback, delay, ...values);
      };
      let result;
      try {
        result = click.apply(this, values);
      } finally {
        b.setTimeout = timeout;
      }
      dialog = b.Dialog.open;
      const current = dialog;
      if (current?.id !== "add_noise.dialog") return result;
      const calculate = (source: Uint8ClampedArray, data: any) =>
        noisePixels(
          source,
          width,
          height,
          data,
          (x, y) =>
            tex.selection.override !== null ||
            !!tex.selection.get(x + offset[0], y + offset[1]),
        );
      const refresh = (data: any) => {
        if (!active || b.Dialog.open !== current) return;
        const preview = document.getElementById(
          "add_noise_preview",
        ) as HTMLCanvasElement | null;
        if (!preview) return;
        preview.width = width;
        preview.height = height;
        preview
          .getContext("2d")!
          .putImageData(
            new ImageData(calculate(original.data, data), width, height),
            0,
            0,
          );
      };
      current.onFormChange = refresh;
      current.onConfirm = function (data: any) {
        if (
          !active ||
          b.Project !== project ||
          tex.getActiveCanvas() !== layer ||
          canvas.width !== width ||
          canvas.height !== height ||
          offset.some((v, i) => v !== (layer.offset ?? [0, 0])[i])
        )
          throw new Fault(
            "NOISE_CHANGED",
            "Noise target changed; reopen the dialog",
          );
        const source = ctx.getImageData(0, 0, width, height),
          out = calculate(source.data, data);
        if (out.some((v, i) => v !== source.data[i])) {
          b.Undo.initEdit({ textures: [tex], bitmap: true });
          try {
            ctx.putImageData(new ImageData(out, width, height), 0, 0);
            tex.updateChangesAfterEdit();
            b.Undo.finishEdit("Add noise");
          } catch (error) {
            b.Undo.cancelEdit(true);
            throw error;
          }
        }
        this.hide();
      };
      b.Vue.nextTick(() => refresh(current.getFormResult()));
      return result;
    };
    this.onunload = function (this: any, ...values: any[]) {
      if (!active) return;
      active = false;
      const next = this.onload;
      this.onload = function (this: any, ...args: any[]) {
        this.onunload = unload;
        this.onload = next;
        return next.apply(this, args);
      };
      try {
        return unload.apply(this, values);
      } finally {
        action.click = click;
        if (dialog && b.Dialog.open === dialog) dialog.hide();
      }
    };
    return result;
  };
  proto.runOnLoad = loaded;
  return () => {
    if (proto.runOnLoad === loaded) proto.runOnLoad = load;
  };
}
