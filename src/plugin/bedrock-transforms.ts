import type { BB } from "./adapter.ts";
import { Fault } from "../shared/types.ts";
export function installBedrockTransforms(b: BB) {
  let restore: (() => void) | undefined;
  function sync(plugin: any, unloaded = false) {
    if (plugin?.id !== "bedrock_block_transforms" || plugin.version !== "1.0.0")
      return;
    restore?.();
    restore = undefined;
    if (unloaded) return;
    const action = b.BarItems.bedrock_block_transforms;
    if (!action) return;
    const original = action.onClick;
    let current: any, dialog: any, restoreDialog: (() => void) | undefined;
    const clean = () => {
      const state = current;
      if (!state) return;
      current = undefined;
      const { object, wrapper } = state;
      if (wrapper) {
        for (const child of [...wrapper.children]) object.add(child);
        wrapper.removeFromParent();
      }
      object.position.copy(state.position);
      object.rotation.copy(state.rotation);
      object.scale.copy(state.scale);
      object.updateMatrixWorld(true);
    };
    const click = function (this: any, ...args: any[]) {
      clean();
      restoreDialog?.();
      const object = b.Project.model_3d,
        children = [...object.children];
      current = {
        project: b.Project,
        object,
        position: object.position.clone(),
        rotation: object.rotation.clone(),
        scale: object.scale.clone(),
      };
      const result = original.apply(this, args);
      dialog = b.Dialog.open;
      const state = current;
      state.wrapper = object.children.find(
        (child: any) => !children.includes(child),
      );
      const onChange = dialog.onFormChange,
        hide = dialog.hide;
      const change = function (this: any, data: any, ...rest: any[]) {
        if (current !== state || b.Project !== state.project) return;
        if (
          data.rotation.some((v: number) => !Number.isFinite(v) || v % 90 !== 0)
        )
          throw new Fault(
            "TRANSFORM_ROTATION",
            "Bedrock block rotations use multiples of 90 degrees",
          );
        const result = onChange.call(this, data, ...rest);
        if (state.wrapper) {
          state.wrapper.scale.fromArray(data.scale);
          state.wrapper.position.set(
            ...data.scale_pivot.map(
              (v: number, i: number) =>
                (v * 16 + (i === 1 ? 8 : 0)) * (1 - data.scale[i]),
            ),
          );
        }
        object.updateMatrixWorld(true);
        return result;
      };
      const close = function (this: any, ...rest: any[]) {
        clean();
        return hide.apply(this, rest);
      };
      dialog.onFormChange = change;
      dialog.hide = close;
      restoreDialog = () => {
        if (dialog.onFormChange === change) dialog.onFormChange = onChange;
        if (dialog.hide === close) dialog.hide = hide;
      };
      change.call(dialog, dialog.getFormResult());
      return result;
    };
    const switchProject = () => {
      if (current && b.Project !== current.project) {
        dialog?.hide();
        clean();
      }
    };
    action.onClick = click;
    b.Blockbench.on("select_project", switchProject);
    restore = () => {
      if (current) dialog?.hide();
      clean();
      restoreDialog?.();
      if (action.onClick === click) action.onClick = original;
      b.Blockbench.removeListener("select_project", switchProject);
    };
  }
  return { sync, dispose: () => restore?.() };
}
