import type { BB } from "./adapter.ts";
import { Fault } from "../shared/types.ts";
const keywords = new Set(
  "and break do else elseif end false for function if in local nil not or repeat return then true until while".split(
    " ",
  ),
);
export function luaIndex(value: string) {
  if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(value) && !keywords.has(value))
    return "." + value;
  return (
    '["' +
    value.replace(/[\\"\x00-\x1f\x7f]/g, (c) =>
      c === "\\"
        ? "\\\\"
        : c === '"'
          ? '\\"'
          : "\\" + c.charCodeAt(0).toString().padStart(3, "0"),
    ) +
    '"]'
  );
}
export function installFigura(b: BB) {
  const proto = b.BBPlugin.prototype,
    load = proto.runOnLoad;
  const loaded = function (this: any, ...args: any[]) {
    if (this.id !== "figura_format" || this.version !== "0.1.5")
      return load.apply(this, args);
    const fields: [any, string][] = [
      [b.ModelProject.properties.name, "condition"],
      [b.BarItems.element_render_order, "condition"],
      [b.BarItems.add_animation, "click"],
      [b.BarItems.export_animation_file, "click"],
      [b.Group.prototype, "name_regex"],
      [b.Group.prototype, "needsUniqueName"],
      [b.Blockbench, "showMessageBox"],
      [b.Dialog.prototype, "build"],
      [b.EffectAnimator.prototype, "displayFrame"],
      [
        b.Texture.prototype.menu.structure.find(
          (v: any) => v.name === "menu.texture.render_mode",
        ),
        "condition",
      ],
      [
        b.Validator.checks.find((v: any) => v.id === "molang_syntax")
          ?.condition,
        "method",
      ],
    ];
    const previous = fields
      .filter(([o]) => o)
      .map(([o, k]) => {
        const descriptor = Object.getOwnPropertyDescriptor(o, k);
        // Blockbench's Action click hooks can be accessor-backed after a
        // keymap import. Saving the getter/setter descriptor alone does not
        // restore the value held by its closure after a provider assignment.
        let value: any;
        try { value = (o as any)[k]; } catch { value = undefined; }
        return { o, k, descriptor, value };
      });
    const channels = b.EffectAnimator.prototype.channels,
      priorChannels = { ...channels },
      timelineName = channels.timeline.name;
    const result = load.apply(this, args),
      unload = this.onunload,
      format = b.Formats.figura;
    const dialogs = new Set<any>(),
      clicks = new Map<any, any>();
    let active = true;
    const replace = (id: string, fn: any) => {
      const a = b.BarItems[id];
      clicks.set(a, a.click);
      a.click = fn;
    };
    const write = (text: string) => b.navigator.clipboard.writeText(text);
    replace("figura_copy_path_modelpart", () => {
      let node = b.Group.first_selected ?? b.Outliner.selected[0];
      if (!node) throw new Fault("FIGURA_SELECTION", "Select one model part");
      const names: string[] = [];
      for (; node && node !== "root"; node = node.parent)
        names.unshift(node.name);
      return write(
        "models" +
          [b.Project.name || "modelName", ...names].map(luaIndex).join(""),
      );
    });
    b.BarItems.figura_copy_path_modelpart.condition = () =>
      b.Format === format &&
      (b.Group.multi_selected.length === 1 || b.Outliner.selected.length === 1);
    replace("figura_copy_path_animation", () =>
      write(
        "animations" +
          [b.Project.name || "modelName", b.Animation.selected.name]
            .map(luaIndex)
            .join(""),
      ),
    );
    replace("figura_copy_path_texture", () => {
      const t = b.Texture.selected,
        p = b.Project;
      let name = p.name + "." + t.name.replace(/\.png$/i, "");
      if (b.isApp && t.path) {
        const texture = b.PathModule.parse(t.path),
          project = b.PathModule.parse(p.save_path || ""),
          relative = b.PathModule.relative(project.dir, texture.dir);
        if (
          texture.dir &&
          !relative.split(/[\\/]/).includes("..") &&
          !b.PathModule.isAbsolute(relative)
        )
          name = [
            ...relative.split(/[\\/]/).filter(Boolean),
            texture.name,
          ].join(".");
      }
      return write("textures" + luaIndex(name));
    });
    replace("figura_import_animations", () =>
      b.Blockbench.import(
        {
          resource_id: "model",
          extensions: ["bbmodel"],
          type: "Model",
          readtype: "text",
          multiple: false,
        },
        (files: any[]) => {
          if (!active)
            throw new Fault(
              "PLUGIN_UNLOADED",
              "Figura was unloaded before animation import",
            );
          if (!files?.length) return;
          const data = JSON.parse(files[0].content),
            animations = data.animations;
          if (!Array.isArray(animations) || !animations.length) {
            b.Blockbench.showQuickMessage("No animations in bbmodel");
            return;
          }
          if (animations.length > 1000)
            throw new Fault(
              "FIGURA_IMPORT_LIMIT",
              "At most 1000 animations can be imported together",
            );
          const project = b.Project,
            form: any = {};
          animations.forEach((a: any, i: number) => {
            form["animation_" + i] = {
              label: String(a.name || "Animation " + i),
              type: "checkbox",
              value: true,
            };
          });
          let dialog: any;
          form.select_all_none = {
            type: "buttons",
            buttons: ["Select all", "Select none"],
            click: (index: number) =>
              dialog.setFormValues(
                Object.fromEntries(
                  animations.map((_: any, i: number) => [
                    "animation_" + i,
                    index === 0,
                  ]),
                ),
              ),
          };
          form.replace_animations = {
            label: "Replace Animations?",
            type: "checkbox",
            value: true,
          };
          dialog = new b.Dialog({
            id: "figura_animation_import",
            title: "Import Animations",
            form,
            onConfirm(values: any) {
              if (!active || b.Project !== project)
                throw new Fault(
                  "FIGURA_IMPORT_CHANGED",
                  "Target project or plugin changed",
                );
              const chosen = animations.filter(
                (_: any, i: number) => values["animation_" + i],
              );
              if (!chosen.length) {
                this.hide();
                return;
              }
              let keyCount = 0;
              const prepared = chosen.map((source: any) => {
                const a = JSON.parse(JSON.stringify(source));
                delete a.uuid;
                a.selected = false;
                a.animators = Object.fromEntries(
                  Object.entries(a.animators ?? {}).map(
                    ([id, value]: [string, any]) => {
                      keyCount += (value.keyframes ?? []).length;
                      for (const key of value.keyframes ?? []) delete key.uuid;
                      if (id === "effects") return [id, value];
                      const nodes =
                        value.type && value.type !== "bone"
                          ? b.Outliner.elements.filter(
                              (n: any) => n.constructor.animator,
                            )
                          : b.Group.all;
                      const exact = nodes.find((n: any) => n.uuid === id),
                        matches = exact
                          ? [exact]
                          : nodes.filter(
                              (n: any) =>
                                n.name.toLowerCase() ===
                                String(value.name ?? id).toLowerCase(),
                            );
                      if (matches.length !== 1)
                        throw new Fault(
                          "FIGURA_IMPORT_NODE",
                          "Animation needs one matching target node: " +
                            String(value.name ?? id),
                        );
                      return [matches[0].uuid, value];
                    },
                  ),
                );
                return a;
              });
              if (keyCount > 20000)
                throw new Fault(
                  "FIGURA_IMPORT_LIMIT",
                  "At most 20000 keyframes can be imported together",
                );
              const replaced = values.replace_animations
                  ? b.Animation.all.filter((a: any) =>
                      chosen.some((s: any) => s.name === a.name),
                    )
                  : [],
                created: any[] = [];
              const aspects = { animations: [...replaced] };
              b.Undo.initEdit(aspects);
              try {
                for (const a of replaced) a.remove(false);
                for (const a of prepared)
                  created.push(new b.Animation(a).add(false));
                b.Undo.finishEdit("Figura Import animations", {
                  animations: created,
                });
                this.hide();
              } catch (error) {
                aspects.animations.splice(0, Infinity, ...created);
                b.Undo.cancelEdit(true);
                throw error;
              }
            },
          });
          dialogs.add(dialog);
          dialog.show();
        },
      ),
    );
    for (const id of ["figura_recalculate_uv", "figura_optimize_model"]) {
      const action = b.BarItems[id],
        click = action.click;
      replace(id, function (this: any, ...args: any[]) {
        const result = click.apply(this, args),
          dialog = b.Dialog.open;
        if (!dialog) return result;
        dialogs.add(dialog);
        if (id === "figura_recalculate_uv")
          dialog.onFormChange(dialog.getFormResult());
        if (id === "figura_recalculate_uv")
          dialog.onConfirm = function (data: any) {
            const tex = b.Texture.all.find((t: any) => t.uuid === data.texture);
            if (!tex)
              throw new Fault(
                "FIGURA_TEXTURE",
                "Selected texture is unavailable",
              );
            const sizes = [
              data.prev_width,
              data.prev_height,
              data.new_width,
              data.new_height,
            ];
            if (!sizes.every((n) => Number.isFinite(n) && n > 0 && n <= 65536))
              throw new Fault(
                "FIGURA_UV_SIZE",
                "UV dimensions must be positive and at most 65536",
              );
            const elements = [
              ...b.Cube.all.filter((c: any) => !c.box_uv),
              ...b.Mesh.all,
            ];
            b.Undo.initEdit({ elements, uv_only: true });
            try {
              for (const element of elements)
                for (const face of Object.values(element.faces) as any[])
                  if (face.texture === tex.uuid) {
                    if (element instanceof b.Cube)
                      face.uv = face.uv.map(
                        (v: number, i: number) =>
                          v *
                          (i % 2
                            ? data.new_height / data.prev_height
                            : data.new_width / data.prev_width),
                      );
                    else
                      for (const key of Object.keys(face.uv))
                        face.uv[key] = face.uv[key].map(
                          (v: number, i: number) =>
                            v *
                            (i
                              ? data.new_height / data.prev_height
                              : data.new_width / data.prev_width),
                        );
                  }
              b.Canvas.updateAllUVs();
              b.Undo.finishEdit("Recalculated UVs");
              this.hide();
            } catch (error) {
              b.Undo.cancelEdit(true);
              throw error;
            }
          };
        return result;
      });
    }
    // Provider wrappers assume every saved condition is a zero-argument function.
    for (const key of ["name_regex", "needsUniqueName"]) {
      const old = previous.find((v) => v.o === b.Group.prototype && v.k === key)
        ?.descriptor?.value;
      b.Group.prototype[key] = function (this: any, ...args: any[]) {
        return b.Format === format &&
          b.settings.figura_allow_duplicate_names.value
          ? false
          : typeof old === "function"
            ? old.apply(this, args)
            : old;
      };
    }
    const condition = previous.find(
      (v) => v.o === b.BarItems.element_render_order,
    )?.descriptor?.value;
    b.BarItems.element_render_order.condition = (context: any) =>
      b.Format !== format && b.Condition(condition, context);
    this.onunload = function (this: any, ...args: any[]) {
      if (!active) return;
      active = false;
      const next = this.onload;
      this.onload = function (this: any, ...args: any[]) {
        this.onload = next;
        this.onunload = unload;
        return next.apply(this, args);
      };
      try {
        return unload.apply(this, args);
      } finally {
        for (const [action, click] of clicks) action.click = click;
        for (const dialog of dialogs)
          if (b.Dialog.open === dialog) dialog.hide();
        for (const { o, k, descriptor, value } of previous) {
          if (descriptor?.get && descriptor?.set) {
            try { descriptor.set.call(o, value); } catch { /* native setter may be guarded */ }
          }
          if (descriptor) Object.defineProperty(o, k, descriptor);
          else delete o[k];
        }
        Object.assign(channels, priorChannels);
        channels.timeline.name = timelineName;
      }
    };
    return result;
  };
  proto.runOnLoad = loaded;
  return () => {
    if (proto.runOnLoad === loaded) proto.runOnLoad = load;
  };
}
