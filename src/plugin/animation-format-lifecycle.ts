import type { BB } from "./adapter.ts";
import { Fault } from "../shared/types.ts";

export function validateLegacyJavaAnimations(b: BB): void {
  const names = new Set<string>();
  const validFloat = (value: any) =>
    Number.isFinite(Number(value)) && Math.abs(Number(value)) <= 3.4028235e38;
  for (const animation of b.Animation.all) {
    const name = animation.name
      .replaceAll(".", "_")
      .replace("animation_", "")
      .toUpperCase();
    if (!/^[\p{L}_$][\p{L}\p{N}_$]*$/u.test(name) || names.has(name))
      throw new Fault(
        "JAVA_ANIMATION_NAME",
        "Animation names must produce unique Java identifiers",
      );
    names.add(name);
    if (!validFloat(animation.length))
      throw new Fault(
        "JAVA_ANIMATION_NUMBER",
        "Animation length exceeds Java float range",
      );
    for (const animator of Object.values(animation.animators) as any[]) {
      if (!(animator instanceof b.BoneAnimator)) continue;
      if (/["\\\r\n]/.test(animator.name))
        throw new Fault(
          "JAVA_BONE_NAME",
          "This legacy exporter cannot escape quotes or line breaks in bone names",
        );
      for (const channel of ["position", "rotation", "scale"])
        for (const key of animator[channel]) {
          if (
            !["linear", "catmullrom"].includes(key.interpolation) ||
            key.data_points.length !== 1
          )
            throw new Fault(
              "JAVA_ANIMATION_INTERPOLATION",
              "Bake unsupported interpolation or split data points before Java export",
            );
          if (
            !validFloat(key.time) ||
            !["x", "y", "z"].every((axis) =>
              validFloat(key.data_points[0][axis] ?? 0),
            )
          )
            throw new Fault(
              "JAVA_ANIMATION_NUMBER",
              "Bake Molang to finite numeric keys before Java export",
            );
        }
    }
  }
}

export function installAnimationFormatLifecycle(b: BB): () => void {
  const proto = b.BBPlugin.prototype,
    load = proto.runOnLoad,
    unload = proto.unload;
  const installable = proto.isInstallable;
  const patchedInstallable = function (this: any, ...args: any[]) {
    // The official converter is deprecated because 5.x includes Java export.
    // This exact legacy build is enabled only while the 5.1.6 adapter restores
    // its format lifecycle. Other version/platform/dependency checks stay native.
    if (
      b.Blockbench.version === "5.1.6" &&
      this.id === "animation_to_java" &&
      this.version === "1.2.0" &&
      this.max_version === "4.12.9" &&
      this.variant === "both" &&
      !this.min_version
    )
      return true;
    return installable.apply(this, args);
  };
  const owners = new Map<any, any>();
  const actionRestorers = new Map<any, () => void>();
  const baseline = new Map<any, boolean>();
  const matches = (p: any) =>
    (p.id === "animation_to_java" && p.version === "1.2.0") ||
    (p.id === "animation_to_json" && p.version === "1.0.1");
  const release = (plugin: any) => {
    actionRestorers.get(plugin)?.();
    actionRestorers.delete(plugin);
    const format = owners.get(plugin);
    if (!format) return;
    owners.delete(plugin);
    const stillRequired = [...owners.values()].includes(format);
    format.animation_mode = stillRequired ? true : baseline.get(format);
    if (!stillRequired) baseline.delete(format);
  };
  const patchedLoad = function (this: any, ...args: any[]) {
    if (!matches(this)) return load.apply(this, args);
    const format = b.Formats.modded_entity;
    if (!baseline.has(format)) baseline.set(format, format.animation_mode);
    owners.set(this, format);
    try {
      const result = load.apply(this, args);
      if (this.id === "animation_to_java") {
        actionRestorers.get(this)?.();
        const action = b.BarItems.export_animation_to_java;
        if (action) {
          const original = action.click;
          const guarded = function (this: any, ...args: any[]) {
            validateLegacyJavaAnimations(b);
            return original.apply(this, args);
          };
          action.click = guarded;
          actionRestorers.set(this, () => {
            if (action.click === guarded) action.click = original;
          });
        }
      }
      return result;
    } catch (error) {
      release(this);
      throw error;
    }
  };
  const patchedUnload = function (this: any, ...args: any[]) {
    try {
      return unload.apply(this, args);
    } finally {
      release(this);
    }
  };
  proto.runOnLoad = patchedLoad;
  proto.unload = patchedUnload;
  proto.isInstallable = patchedInstallable;
  return () => {
    if (proto.runOnLoad === patchedLoad) proto.runOnLoad = load;
    if (proto.unload === patchedUnload) proto.unload = unload;
    if (proto.isInstallable === patchedInstallable)
      proto.isInstallable = installable;
    for (const restore of actionRestorers.values()) restore();
    actionRestorers.clear();
    owners.clear();
    baseline.clear();
  };
}
