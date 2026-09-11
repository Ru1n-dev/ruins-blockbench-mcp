import type { BB } from "./adapter.ts";
import { Fault } from "../shared/types.ts";

export function validateBake(b: BB, rate: unknown): void {
  const snapping = b.Animation.selected?.snapping;
  const step = Number(rate) / snapping;
  if (
    typeof rate !== "number" ||
    rate <= 0 ||
    !Number.isFinite(snapping) ||
    snapping <= 0 ||
    !Number.isFinite(step) ||
    step <= 0
  )
    throw new Fault(
      "FORM_RANGE",
      "Bake rate and animation snapping must be positive and finite",
    );
  let samples = 0;
  const selected = new Set<any>(b.Timeline.selected);
  for (const animator of new Set<any>([...selected].map((k) => k.animator))) {
    for (const channel of ["rotation", "position", "scale"]) {
      const keys = (animator[channel] ?? []).filter((k: any) =>
        selected.has(k),
      );
      if (keys.length < 2) continue;
      let min = Infinity,
        max = -Infinity;
      for (const key of keys) {
        min = Math.min(min, key.time);
        max = Math.max(max, key.time);
      }
      if (!Number.isFinite(min) || !Number.isFinite(max) || max + step === max)
        throw new Fault(
          "FORM_RANGE",
          "Bake interval cannot advance at this time and rate",
        );
      samples += Math.floor((max - min) / step) + 1;
      if (samples > 100000)
        throw new Fault(
          "BAKE_LIMIT",
          "Bake exceeds 100,000 samples; increase rate or select a shorter interval",
        );
    }
  }
}

export function installLegacyEditing(b: BB) {
  const restorers = new Map<string, () => void>();
  function sync(plugin: any, unloaded = false) {
    const versions: Record<string, string> = {
      duplicate_renamer: "1.0.0",
      bakery: "1.1.1",
      voxel_shape_generator: "0.2.0",
    };
    if (!plugin || versions[plugin.id] !== plugin.version) return;
    restorers.get(plugin.id)?.();
    restorers.delete(plugin.id);
    if (unloaded) return;
    const action =
      b.BarItems[
        plugin.id === "bakery"
          ? "bake_animations"
          : plugin.id === "voxel_shape_generator"
            ? "export_vs"
            : "rename_duplicates"
      ];
    if (!action) return;
    const original = action.click;
    const dialogs = new Map<any, any>();
    const fixed =
      plugin.id !== "duplicate_renamer"
        ? function (this: any, ...args: any[]) {
            const result = original.apply(this, args);
            const dialog = b.Dialog.open;
            if (
              dialog?.id ===
                (plugin.id === "bakery"
                  ? "bake_animations"
                  : "select_mappings") &&
              !dialogs.has(dialog)
            ) {
              for (const [previous, confirm] of dialogs)
                previous.onConfirm = confirm;
              dialogs.clear();
              const confirm = dialog.onConfirm;
              dialogs.set(dialog, confirm);
              dialog.onConfirm = function (values: any, event: any) {
                if (plugin.id === "voxel_shape_generator") {
                  if (values.mappings !== "mcp")
                    return confirm.call(this, values, event);
                  const originalExport = b.Blockbench.export;
                  const fixedExport = function (
                    this: any,
                    options: any,
                    ...rest: any[]
                  ) {
                    const content =
                      typeof options.content === "string"
                        ? options.content.replace(
                            /(shape = VoxelShapes\.combineAndSimplify\(shape, VoxelShapes\.create\([^\n)]*)\);/g,
                            "$1), IBooleanFunction.OR);",
                          )
                        : options.content;
                    return originalExport.call(
                      this,
                      { ...options, content },
                      ...rest,
                    );
                  };
                  b.Blockbench.export = fixedExport;
                  try {
                    return confirm.call(this, values, event);
                  } finally {
                    if (b.Blockbench.export === fixedExport)
                      b.Blockbench.export = originalExport;
                  }
                }
                try {
                  validateBake(b, values.rate);
                } catch (error) {
                  b.Blockbench.showQuickMessage((error as Error).message);
                  return false;
                }
                return confirm.call(this, values, event);
              };
            }
            return result;
          }
        : () => {
            const groups = [...b.Group.all],
              used = new Set(groups.map((g) => g.name));
            const seen = new Set<string>();
            const changes: Array<[any, string]> = [];
            for (const group of groups) {
              const name = group.name;
              if (!seen.has(name)) {
                seen.add(name);
                continue;
              }
              let suffix = 1;
              while (used.has(`${name}_${suffix}`)) suffix++;
              const replacement = `${name}_${suffix}`;
              used.add(replacement);
              changes.push([group, replacement]);
            }
            if (!changes.length) return;
            b.Undo.initEdit({ outliner: true, groups });
            try {
              for (const [group, name] of changes) group.name = name;
              b.Undo.finishEdit("rename duplicates");
            } catch (error) {
              b.Undo.cancelEdit(true);
              throw error;
            }
          };
    action.click = fixed;
    restorers.set(plugin.id, () => {
      if (action.click === fixed) action.click = original;
      for (const [dialog, confirm] of dialogs) dialog.onConfirm = confirm;
      dialogs.clear();
    });
  }
  return {
    sync,
    dispose() {
      for (const restore of restorers.values()) restore();
      restorers.clear();
    },
  };
}
