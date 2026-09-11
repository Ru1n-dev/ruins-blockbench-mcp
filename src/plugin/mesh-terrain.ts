import type { BB } from "./adapter.ts";
import { Fault } from "../shared/types.ts";

// Pinned MTools 2.1.0 keeps original dimensions in a shared form, which resets
// a terrain to 32x32 when any amend field changes.
export function patchMeshTerrain(b: BB) {
  const action = b.BarItems["@mesh_tools/terrain_action"];
  const original = action.onClick;
  const dialogs = new Map<any, { original: any; patched: any }>();
  const restoreDialogs = () => {
    for (const [dialog, entry] of dialogs)
      if (dialog.onConfirm === entry.patched) dialog.onConfirm = entry.original;
    dialogs.clear();
  };
  const validate = (values: any) => {
    for (const key of ["width", "height"])
      if (
        !Number.isInteger(values[key]) ||
        values[key] < 1 ||
        values[key] > 255
      )
        throw new Fault(
          "TERRAIN_INPUT",
          "Terrain resolution must be an integer from 1 to 255",
        );
    if (
      !Number.isInteger(values.octaves) ||
      values.octaves < 1 ||
      values.octaves > 32
    )
      throw new Fault("TERRAIN_INPUT", "Use 1–32 whole noise octaves");
  };
  const click = function (this: any, ...args: any[]) {
    restoreDialogs();
    const result = original.apply(this, args),
      dialog = b.Dialog.open;
    if (!dialog || dialogs.has(dialog)) return result;
    const confirm = dialog.onConfirm;
    const patched = function (this: any, values: any, ...rest: any[]) {
      validate(values);
      const resolved = { ...values };
      if (
        resolved.style === "custom" &&
        !b.localStorage.getItem("mt_customStyle")
      ) {
        resolved.style = "Earth";
        b.Blockbench.showQuickMessage(
          "No custom terrain style found; using Earth",
        );
      }
      const amend = b.Undo.amendEdit;
      const adjust = function (this: any, form: any, callback: any) {
        const fields = Object.fromEntries(
          Object.entries(form).map(([key, field]) => [
            key,
            { ...(field as any), value: resolved[key] },
          ]),
        );
        return amend.call(this, fields, (data: any) => {
          validate(data);
          return callback(data);
        });
      };
      b.Undo.amendEdit = adjust;
      try {
        return confirm.call(this, resolved, ...rest);
      } finally {
        if (b.Undo.amendEdit === adjust) b.Undo.amendEdit = amend;
      }
    };
    dialog.onConfirm = patched;
    dialogs.set(dialog, { original: confirm, patched });
    return result;
  };
  action.onClick = click;
  return () => {
    if (action.onClick === click) action.onClick = original;
    restoreDialogs();
  };
}
