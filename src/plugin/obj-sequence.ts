import { Adapter, type BB } from "./adapter.ts";
import { Fault } from "../shared/types.ts";
import { isNativeFileScope } from "./native-files.ts";
export function installObjSequence(b: BB) {
  let restore: (() => void) | undefined,
    generation = 0;
  function sync(plugin: any, unloaded = false) {
    if (plugin?.id !== "obj_animation_export" || plugin.version !== "0.1.0")
      return;
    generation++;
    restore?.();
    restore = undefined;
    if (unloaded) {
      if (b.Dialog.open?.id === "export_obj_sequence") b.Dialog.open.hide();
      return;
    }
    const action = b.BarItems.export_obj_sequence;
    if (!action) return;
    const original = action.click;
    let dialog: any, confirm: any;
    const fixed = function (this: any, ...args: any[]) {
      const result = original.apply(this, args);
      dialog = b.Dialog.open;
      if (dialog?.id !== "export_obj_sequence") return result;
      confirm = dialog.onConfirm;
      dialog.onConfirm = function (this: any, values: any) {
        if (!isNativeFileScope(b)) return confirm.call(this, values);
        const { length, fps } = values,
          count = Math.floor(length * fps) + 1;
        if (
          !Number.isFinite(length) ||
          length < 0 ||
          !Number.isFinite(fps) ||
          fps < 1 ||
          !Number.isInteger(fps) ||
          count > 1000
        )
          throw new Fault(
            "SEQUENCE_LIMIT",
            "OBJ sequence requires finite length, integer FPS and at most 1000 frames",
          );
        const adapter = new Adapter(b),
          project = adapter.project(),
          ui = adapter.uiState(),
          runGeneration = generation,
          send = b.Blockbench.export;
        const run = async () => {
          const archive = new b.JSZip(),
            name = (project.name || "model").replace(
              /[<>:"/\\|?*\u0000-\u001f]/g,
              "_",
            );
          const frames = new Map<any, any>(
            b.Texture.all.map((t: any) => [t, t.currentFrame]),
          );
          const animatorIds = new Map<any, Set<string>>(
            b.Animation.all.map((a: any) => [
              a,
              new Set(Object.keys(a.animators)),
            ]),
          );
          let files: any,
            size = 0;
          const scenePosition = b.scene.position.clone();
          b.Timeline.pause();
          try {
            for (let frame = 0; frame < count; frame++) {
              b.Timeline.setTime(frame / fps);
              b.Animator.preview();
              files = b.Codecs.obj.compile({
                all_files: true,
                mtl_name: "materials.mtl",
              });
              size += files.obj.length * 2;
              if (size > 32000000)
                throw new Fault(
                  "SEQUENCE_LIMIT",
                  "OBJ sequence source exceeds 32 MB",
                );
              archive.file(
                `${name}_${String(frame).padStart(String(count - 1).length, "0")}.obj`,
                files.obj,
              );
            }
            const names = new Map<string, string>();
            for (const [id, texture] of Object.entries(files.images) as [
              string,
              any,
            ][]) {
              if (!texture || texture.error)
                throw new Fault(
                  "TEXTURE_UNAVAILABLE",
                  "OBJ sequence contains an unavailable texture",
                );
              const name = `texture-${names.size}.png`,
                png = texture.getBase64();
              size += png.length * 2;
              if (size > 32000000)
                throw new Fault(
                  "SEQUENCE_LIMIT",
                  "OBJ sequence source exceeds 32 MB",
                );
              names.set(id, name);
              archive.file(name, png, { base64: true });
            }
            let material = "";
            archive.file(
              "materials.mtl",
              files.mtl
                .split(/\r?\n/)
                .map((line: string) => {
                  if (line.startsWith("newmtl m_")) material = line.slice(9);
                  return line.startsWith("map_Kd ") && names.has(material)
                    ? `map_Kd ${names.get(material)}`
                    : line;
                })
                .join("\n"),
            );
          } finally {
            b.scene.position.copy(scenePosition);
            if (b.Project === project) {
              for (const [t, frame] of frames) t.currentFrame = frame;
              b.TextureAnimator.update(
                [...frames.keys()].filter((t) => t.frameCount > 1),
              );
              adapter.restoreUI(ui);
              for (const [a, ids] of animatorIds)
                for (const [id, animator] of Object.entries(a.animators) as [
                  string,
                  any,
                ][])
                  if (!ids.has(id) && animator.keyframes.length === 0)
                    a.removeAnimator(id);
              if (ui.timelinePlaying) b.Timeline.start();
            }
          }
          const fingerprint = adapter.fingerprint(),
            content = await archive.generateAsync({
              type: "uint8array",
              compression: "DEFLATE",
            });
          if (
            generation !== runGeneration ||
            b.Project !== project ||
            adapter.fingerprint() !== fingerprint
          )
            throw new Fault(
              "SEQUENCE_CHANGED",
              "Model or plugin changed while generating the OBJ archive",
            );
          send({
            resource_id: "obj",
            type: "Zip Archive",
            extensions: ["zip"],
            name: "animation",
            content,
            savetype: "zip",
          });
        };
        const task = run();
        task.catch((error: any) =>
          b.Blockbench.showQuickMessage(error.message, 6000),
        );
        return task;
      };
      return result;
    };
    action.click = fixed;
    restore = () => {
      if (action.click === fixed) action.click = original;
      if (dialog && confirm) dialog.onConfirm = confirm;
    };
  }
  return {
    sync,
    dispose: () => {
      generation++;
      restore?.();
    },
  };
}
