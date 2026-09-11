import { Adapter, type BB } from "./adapter.ts";
import { Fault } from "../shared/types.ts";
import { armorStandFiles, type ArmorFrame } from "./armor-stand-files.ts";

export function installArmorStand(b: BB) {
  const proto = b.BBPlugin.prototype,
    load = proto.runOnLoad;
  const loaded = function (this: any, ...args: any[]) {
    if (this.id !== "armor_stand_animator" || this.version !== "1.1.0")
      return load.apply(this, args);
    const globals = Object.fromEntries(
      ["createArmorStandAction", "exportAnimationAction"].map((k) => [
        k,
        Object.getOwnPropertyDescriptor(b, k),
      ]),
    );
    const result = load.apply(this, args),
      create = b.BarItems.create_armor_stand,
      output = b.BarItems.export_animation,
      original = create.click;
    for (const [key, d] of Object.entries(globals)) {
      if (d) Object.defineProperty(b, key, d);
      else delete b[key];
    }
    let active = true;
    const dialogs = new Set<any>();
    create.condition = () => !!b.Project && !!b.Format.bone_rig;
    create.click = function (...args: any[]) {
      const result = original.apply(this, args),
        dialog = b.Dialog.open,
        confirm = dialog.onConfirm,
        owner = b.Project;
      dialogs.add(dialog);
      dialog.onConfirm = function (data: any) {
        if (!active || owner !== b.Project)
          throw new Fault("ARMOR_CHANGED", "Project or plugin changed");
        if (
          typeof data.armorStandName !== "string" ||
          !data.armorStandName.trim() ||
          data.armorStandName.length > 128
        )
          throw new Fault(
            "ARMOR_NAME",
            "Enter a model name (1–128 characters)",
          );
        const nodes = new Set(b.Outliner.elements),
          textures = new Set(b.Texture.all);
        const aspects: any = {
          elements: [],
          textures: [],
          groups: [...b.Group.all],
          outliner: true,
          selection: true,
          uv_mode: true,
        };
        const collect = () => {
          aspects.elements.splice(
            0,
            Infinity,
            ...b.Outliner.elements.filter((n: any) => !nodes.has(n)),
          );
          aspects.textures.splice(
            0,
            Infinity,
            ...b.Texture.all.filter((t: any) => !textures.has(t)),
          );
          aspects.groups.splice(0, Infinity, ...b.Group.all);
        };
        b.Undo.initEdit(aspects);
        try {
          const value = confirm.call(this, data);
          collect();
          b.Canvas.updateAll();
          b.Undo.finishEdit("Create armor stand", aspects);
          return value;
        } catch (e) {
          collect();
          if (b.Undo.current_save) b.Undo.cancelEdit(true);
          throw e;
        }
      };
      return result;
    };
    output.condition = () => !!b.Project && !!b.Format.animation_mode;
    output.click = function () {
      const owner = b.Project,
        animation = b.Animation.selected;
      if (!animation)
        throw new Fault("ARMOR_ANIMATION", "Select an animation to export");
      const names: Record<string, string> = {
        head_bone: "Head",
        body_bone: "Body",
        left_arm_bone: "LeftArm",
        right_arm_bone: "RightArm",
        left_leg_bone: "LeftLeg",
        right_leg_bone: "RightLeg",
      };
      const roots = b.Group.all.filter((g: any) =>
        Object.keys(names).every((name) =>
          g.children.some((n: any) => n instanceof b.Group && n.name === name),
        ),
      );
      if (roots.length !== 1)
        throw new Fault(
          "ARMOR_ROOT",
          "Export a project with exactly one complete armor stand rig",
        );
      const root = roots[0],
        bones = [
          root,
          ...Object.keys(names).map((name) =>
            root.children.find((n: any) => n.name === name),
          ),
        ];
      const dialog = new b.Dialog("exportAnimationOptions", {
        title: "Export Armor Stand Animation",
        form: {
          blockUnitScale: {
            type: "number",
            label: "Block/Unit Ratio",
            value: 0.0625,
            min: 0.015625,
            max: 16,
          },
          timeScale: {
            type: "number",
            label: "Time Scale (duration multiplier)",
            value: 1,
            min: 0.1,
            max: 100,
          },
          packName: {
            type: "text",
            label: "Pack Namespace",
            value: "armor_animation",
          },
          entityTag: {
            type: "text",
            label: "Entity Tag",
            value: "armor_animation",
          },
          playbackControl: {
            type: "checkbox",
            label: "Enable Pause/Play Control",
            value: true,
          },
          generationMode: {
            type: "select",
            label: "Generation Mode",
            value: "data_pack",
            options: {
              data_pack: "Complete Data Pack",
              namespace: "Data Pack Namespace",
            },
          },
        },
        onConfirm: function (config: any) {
          if (
            !active ||
            b.Project !== owner ||
            b.Animation.selected !== animation
          )
            throw new Fault(
              "ARMOR_CHANGED",
              "Project, animation, or plugin changed",
            );
          const scale = config.timeScale,
            delaySeconds = Number(animation.start_delay || 0),
            duration = Math.max(
              animation.length,
              ...Object.values(animation.animators).flatMap((a: any) =>
                (a.keyframes ?? []).map((k: any) => k.time),
              ),
            );
          if (
            !Number.isFinite(scale) ||
            scale < 0.1 ||
            scale > 100 ||
            !Number.isFinite(duration) ||
            duration < 0 ||
            !Number.isFinite(delaySeconds) ||
            delaySeconds < 0
          )
            throw new Fault(
              "ARMOR_TIMING",
              "Use finite nonnegative animation timing and a duration multiplier from 0.1 to 100",
            );
          const count = Math.ceil(duration * 20 * scale) + 1,
            delay = Math.ceil(delaySeconds * 20 * scale);
          if (count > 1000)
            throw new Fault(
              "ARMOR_LIMIT",
              "At most 1000 sampled frames per export",
            );
          const frames: ArmorFrame[] = [],
            time = b.Timeline.time,
            last = b.Animator._last_values,
            adapter = new Adapter(b),
            send = b.Blockbench.export;
          const vec = (a: any, channel: string, fallback: number[]) => {
            const value = a?.[channel]?.length
              ? a.interpolate(channel)
              : fallback;
            if (
              !Array.isArray(value) ||
              value.length !== 3 ||
              value.some((n: any) => !Number.isFinite(n))
            )
              throw new Fault(
                "ARMOR_VALUE",
                "Animation must evaluate to finite vectors",
              );
            return value;
          };
          try {
            for (let tick = 0; tick < count; tick++) {
              b.Timeline.time = Math.min(duration, tick / (20 * scale));
              b.Animator._last_values = {};
              const frame: ArmorFrame = { position: [0, 0, 0], rotation: {} };
              for (const bone of bones) {
                const a = animation.animators[bone.uuid],
                  position = vec(a, "position", [0, 0, 0]),
                  rotation = vec(a, "rotation", [0, 0, 0]),
                  size = vec(a, "scale", [1, 1, 1]);
                if (
                  size.some((v: number) => Math.abs(v - 1) > 1e-8) ||
                  (bone !== root &&
                    position.some((v: number) => Math.abs(v) > 1e-8)) ||
                  (bone === root &&
                    (Math.abs(rotation[0]) > 1e-8 ||
                      Math.abs(rotation[2]) > 1e-8))
                )
                  throw new Fault(
                    "ARMOR_UNSUPPORTED",
                    "Armor stands support root translation/yaw and limb rotation; remove scale, limb translation, and root pitch/roll",
                  );
                if (bone === root) {
                  frame.position = [...position];
                  frame.rotation.main = [...rotation];
                } else
                  frame.rotation[names[bone.name]] = [
                    -rotation[0],
                    rotation[1],
                    -rotation[2],
                  ];
              }
              frames.push(frame);
            }
          } finally {
            b.Timeline.time = time;
            b.Animator._last_values = last;
          }
          const files = armorStandFiles(config, frames, animation.loop, delay),
            zip = new b.JSZip();
          for (const [name, text] of Object.entries(files))
            zip.file(name, text);
          const fingerprint = adapter.fingerprint();
          this.hide();
          const task = zip
            .generateAsync({ type: "uint8array", compression: "DEFLATE" })
            .then((content: Uint8Array) => {
              if (
                !active ||
                b.Project !== owner ||
                adapter.fingerprint() !== fingerprint
              )
                throw new Fault(
                  "ARMOR_CHANGED",
                  "Project or plugin changed during ZIP generation",
                );
              send({
                resource_id: "model",
                type: "Zip Archive",
                extensions: ["zip"],
                name: config.packName,
                content,
                savetype: "zip",
              });
            });
          task.catch((e: any) =>
            b.Blockbench.showQuickMessage(e.message, 6000),
          );
          return task;
        },
      });
      dialogs.add(dialog);
      dialog.show();
    };
    this.onunload = function () {
      if (!active) return;
      active = false;
      create.delete();
      output.delete();
      for (const d of dialogs) {
        if (b.Dialog.stack.includes(d)) d.hide();
        d.delete();
      }
    };
    return result;
  };
  proto.runOnLoad = loaded;
  return () => {
    if (proto.runOnLoad === loaded) proto.runOnLoad = load;
  };
}
