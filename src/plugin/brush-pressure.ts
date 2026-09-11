import type { BB } from "./adapter.ts";

export function pressureCurve(pressure: number, curve: unknown): number {
  if (
    !Array.isArray(curve) ||
    curve.length !== 8 ||
    !curve.every(Number.isFinite)
  )
    throw new Error("Brush pressure curve requires eight finite coordinates");
  const [x0, y0, x1, y1, x2, y2, x3, y3] = curve;
  if (
    !Number.isFinite(pressure) ||
    x0 >= x3 ||
    x1 < x0 ||
    x1 > x3 ||
    x2 < x0 ||
    x2 > x3
  )
    throw new Error(
      "Brush pressure curve requires ordered endpoints and bounded handles",
    );
  if (pressure <= x0) return Math.max(0, Math.min(1, y0));
  if (pressure >= x3) return Math.max(0, Math.min(1, y3));
  const bezier = (t: number, a: number, b: number, c: number, d: number) =>
    (1 - t) ** 3 * a +
    3 * (1 - t) ** 2 * t * b +
    3 * (1 - t) * t * t * c +
    t ** 3 * d;
  let low = 0,
    high = 1;
  for (let i = 0; i < 48; i++) {
    const t = (low + high) / 2;
    if (bezier(t, x0, x1, x2, x3) < pressure) low = t;
    else high = t;
  }
  return Math.max(0, Math.min(1, bezier((low + high) / 2, y0, y1, y2, y3)));
}

export function pressureBrush(b: BB, base: Function) {
  return function (this: any, ...args: any[]) {
    const event = args[4],
      preset = b.BrushTuna?.brushPreset;
    const touch = event?.touches?.[0];
    const pressure =
      touch?.touchType === "stylus"
        ? touch.force
        : event?.pointerType === "pen"
          ? event.pressure
          : undefined;
    if (!preset || !Number.isFinite(pressure) || pressure < 0 || pressure > 1)
      return base.apply(this, args);
    const changed: [any, number][] = [],
      modifiers: [any, any][] = [];
    try {
      for (const channel of ["size", "softness", "opacity"]) {
        const curve = preset[`${channel}_pressure_curve`];
        if (!curve) continue;
        const factor = pressureCurve(pressure, curve);
        const slider = b.BarItems[`slider_brush_${channel}`],
          value = slider.get();
        changed.push([slider, value]);
        slider.setValue(value * factor);
        const setting = b.settings[`brush_${channel}_modifier`];
        if (setting) {
          modifiers.push([setting, setting.value]);
          setting.value = "none";
        }
      }
      return base.apply(this, args);
    } finally {
      for (const [slider, value] of changed.reverse()) slider.setValue(value);
      for (const [setting, value] of modifiers.reverse()) setting.value = value;
    }
  };
}

// Replace this patch's implementation so the native manager can still rebuild
// its ordered stack when any other plugin loads or unloads.
export function repairPressurePatch(b: BB) {
  const manager = b.BlockbenchPatchManager;
  const patch = manager?.registered?.get("brush_tuna:painter/useBrush");
  if (!patch) throw new Error("Brush Tuna painter patch was not registered");
  const original = {
    apply: patch.apply,
    revert: patch.revert,
    isApplied: patch.isApplied,
  };
  let applied = false,
    restoring = false,
    descriptor: PropertyDescriptor | undefined;
  patch.isApplied = () => applied || original.isApplied.call(patch);
  patch.revert = function () {
    if (!applied) return original.revert.call(this);
    if (descriptor) Object.defineProperty(b.Painter, "useBrush", descriptor);
    else delete b.Painter.useBrush;
    applied = false;
  };
  patch.apply = function () {
    if (restoring) return original.apply.call(this);
    if (!this.enabled) return;
    if (applied) throw new Error("Brush pressure patch is already active");
    descriptor = Object.getOwnPropertyDescriptor(b.Painter, "useBrush");
    Object.defineProperty(b.Painter, "useBrush", {
      configurable: true,
      enumerable: descriptor?.enumerable ?? true,
      writable: true,
      value: pressureBrush(b, b.Painter.useBrush),
    });
    applied = true;
  };
  manager.updatePatches();
  return () => {
    restoring = true;
    manager.updatePatches();
    Object.assign(patch, original);
  };
}
