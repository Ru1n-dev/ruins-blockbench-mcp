import type { BB } from "./adapter.ts";

export function installPbrBrush(b: BB) {
  const tool = b.BarItems.material_brush,
    initEdit = b.Undo.initEdit;
  let pending: any = null,
    stroke: any = null;
  const originals = new Map<string, { color: any; opacity: number }>();
  const init = function (this: any, aspects: any, ...args: any[]) {
    if (pending && b.Toolbox.selected === tool) {
      aspects = { ...aspects, textures: [pending], bitmap: true };
      delete aspects.layers;
      pending = null;
    }
    return initEdit.call(this, aspects, ...args);
  };
  b.Undo.initEdit = init;
  tool.brush.onStrokeStart = ({ texture }: any) => {
    originals.clear();
    pending = texture;
    stroke = { texture, project: b.Project };
    // Painter itself starts and finishes Undo. Expand its next save to all
    // texture layers instead of opening another edit inside this callback.
    return true;
  };
  tool.brush.onStrokeEnd = () => {
    pending = null;
    stroke = null;
    originals.clear();
    return true;
  };
  const scalar = (id: string, fallback: number) => {
    const n = Number(b.BarItems[id].get());
    const byte = Math.round(
      Math.max(0, Math.min(1, Number.isFinite(n) ? n : fallback)) * 255,
    );
    return { r: byte, g: byte, b: byte, a: 1 };
  };
  tool.brush.changePixel = (
    px: number,
    py: number,
    selectedPixel: any,
    local: number,
    args: any,
  ) => {
    const { texture, opacity, color } = args;
    if (!stroke || stroke.project !== b.Project) return selectedPixel;
    const colors: any = {
      albedo: color,
      metalness: scalar("slider_brush_metalness", 0),
      roughness: scalar("slider_brush_roughness", 1),
      height: scalar("slider_brush_height", 0.5),
      emissive: b
        .tinycolor(b.BarItems.brush_emissive_color.get().toString())
        .toRgb(),
      normal: { r: 128, g: 128, b: 255, a: 1 },
      ao: { r: 255, g: 255, b: 255, a: 1 },
    };
    let selected = selectedPixel;
    for (const layer of texture.layers) {
      const color = colors[layer.channel];
      if (!layer.visible || !color) continue;
      const x = Math.floor((px - layer.offset[0]) / layer.scale[0]),
        y = Math.floor((py - layer.offset[1]) / layer.scale[1]);
      if (x < 0 || y < 0 || x >= layer.width || y >= layer.height) continue;
      const pixel = layer.ctx.getImageData(x, y, 1, 1);
      let base = layer.selected
        ? selectedPixel
        : {
            r: pixel.data[0],
            g: pixel.data[1],
            b: pixel.data[2],
            a: pixel.data[3] / 255,
          };
      let amount = Math.max(0, Math.min(1, opacity * local));
      if (!amount || (b.Painter.lock_alpha && !base.a)) continue;
      if (b.settings.limit_brush_opacity_per_stroke.value) {
        const key = `${layer.uuid}:${x}:${y}`;
        let original = originals.get(key);
        if (!original) {
          original = { color: { ...base }, opacity: 0 };
          originals.set(key, original);
        }
        amount = Math.max(
          original.opacity,
          original.opacity + (opacity - original.opacity) * local,
        );
        original.opacity = amount;
        base = original.color;
      }
      const result = b.Painter.combineColors(base, { ...color }, amount);
      if (b.Painter.lock_alpha) result.a = base.a;
      if (layer.selected) selected = result;
      else {
        pixel.data.set([result.r, result.g, result.b, result.a * 255]);
        layer.ctx.putImageData(pixel, x, y);
      }
    }
    return selected;
  };
  return () => {
    if (b.Undo.initEdit === init) b.Undo.initEdit = initEdit;
    if (stroke?.project === b.Project && b.Undo.current_save) {
      b.Undo.cancelEdit(true);
      b.Painter.brushChanges = false;
      b.Painter.paint_stroke_canceled = true;
      b.PointerTarget?.endTarget();
    }
    pending = null;
    stroke = null;
    originals.clear();
  };
}
