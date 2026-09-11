import { Adapter, type BB } from "./adapter.ts";
import { Fault } from "../shared/types.ts";
import { installCosmicAnimation } from "./cosmic-animation.ts";
import { installCosmicEntity } from "./cosmic-entity.ts";
import {
  compileCosmicBlock,
  cosmicBlockData,
  importCosmicBlock,
} from "./cosmic-block.ts";
export function installCosmic(b: BB) {
  const proto = b.BBPlugin.prototype,
    load = proto.runOnLoad,
    unloads = new WeakMap<object, Function>();
  let projectProperty: any, faceProperty: any;
  const save = ({ save, aspects }: any) => {
    if (aspects.pbmc_cosmic)
      save.pbmc_cosmic = JSON.parse(
        JSON.stringify(b.Project.pbmc_cosmic_properties || {}),
      );
  };
  const restore = ({ save }: any) => {
    if (save.pbmc_cosmic)
      b.Project.pbmc_cosmic_properties = JSON.parse(
        JSON.stringify(save.pbmc_cosmic),
      );
  };
  b.Blockbench.on("create_undo_save", save);
  b.Blockbench.on("load_undo_save", restore);
  const loaded = function (this: any, ...args: any[]) {
    if (this.id !== "cosmic_reach_model_editor" || this.version !== "2.2.0")
      return load.apply(this, args);
    if (!unloads.has(this)) unloads.set(this, this.onunload);
    const names = [
      "codec_animation",
      "codec_entity",
      "export_action_block",
      "export_action_block_aschild",
      "import_action_entity",
      "export_action_entity",
      "import_action_entity_animation",
      "export_action_entity_animation",
      "show_properties_dialog",
      "vectorFromArrayToObject",
      "vectorIsEqualToVector",
    ];
    const previous = new Map(
      names.map((name) => [name, Object.getOwnPropertyDescriptor(b, name)]),
    );
    const result = load.apply(this, args),
      globals = new Map(names.map((name) => [name, b[name]])),
      dialogs = new Set<any>();
    let active = true;
    const codecs = [
      "cosmic_reach_block_model_codec",
      "cosmic_reach_entity_model_codec",
      "cosmic_reach_entity_animation_codec",
    ].map((id) => b.Codecs[id]);
    const formats = ["cosmic_reach_model", "cosmic_reach_entity_model"].map(
      (id) => b.Formats[id],
    );
    projectProperty ??= new b.Property(
      b.ModelProject,
      "object",
      "pbmc_cosmic_properties",
      {
        default: () => ({ isTransparent: false, cullsSelf: true }),
        exposed: false,
      },
    );
    faceProperty ??= new b.Property(
      b.CubeFace,
      "string",
      "pbmc_cosmic_texture",
      { default: "", exposed: false },
    );
    for (const p of b.ModelProject.all)
      if (!p.pbmc_cosmic_properties)
        p.pbmc_cosmic_properties = {
          isTransparent: p.properties?.isTransparent ?? false,
          cullsSelf: p.properties?.cullsSelf ?? true,
        };
    const codec = codecs[0];
    installCosmicAnimation(b, codecs[2], () => active);
    installCosmicEntity(b, codecs[1], formats[1], () => active);
    codec.compile = (options: any = {}) =>
      JSON.stringify(compileCosmicBlock(b, options), null, 2);
    codec.export = (options: any = {}) =>
      b.Blockbench.export({
        type: "Cosmic Reach block model",
        extensions: ["json"],
        name: codec.fileName(),
        content: codec.compile(options),
        savetype: "text",
      });
    codec.parse = (data: any) => importCosmicBlock(b, data);
    codec.load = (input: any, _file: any, options: any = {}) => {
      const data = cosmicBlockData(input);
      if (!data.cuboids)
        throw new Fault(
          "COSMIC_PARENT",
          "Resolve the parent model before importing its cuboids",
        );
      if (!options.import_to_current_project) b.newProject(formats[0]);
      return importCosmicBlock(b, data);
    };
    b.BarItems.import_cosmic_reach_model.click = () => {
      const owner = b.Project;
      return b.Blockbench.import(
        {
          extensions: ["json"],
          type: "Cosmic Reach block model",
          readtype: "text",
        },
        (files: any[]) => {
          if (!active || b.Project !== owner)
            throw new Fault(
              "STALE_STATE",
              "The Cosmic Reach import context changed",
            );
          if (files?.[0]) return importCosmicBlock(b, files[0].content);
        },
      );
    };
    b.BarItems.export_cosmic_reach_model.click = () => codec.export();
    const guard = () => {
      const owner = b.Project,
        adapter = new Adapter(b),
        fingerprint = adapter.fingerprint();
      return () => {
        if (
          !active ||
          b.Project !== owner ||
          adapter.fingerprint() !== fingerprint
        )
          throw new Fault("STALE_STATE", "The Cosmic Reach context changed");
      };
    };
    b.BarItems.cosmic_reach_show_properties_dialog.condition = () =>
      b.Project?.format.id === "cosmic_reach_model";
    b.BarItems.cosmic_reach_show_properties_dialog.click = () => {
      const check = guard(),
        values = b.Project.pbmc_cosmic_properties;
      const dialog = new b.Dialog("pbmc_cosmic_properties", {
        title: "Cosmic Reach model properties",
        form: {
          isTransparent: {
            type: "checkbox",
            label: "Is transparent",
            value: values.isTransparent,
          },
          cullsSelf: {
            type: "checkbox",
            label: "Culls self",
            value: values.cullsSelf,
          },
        },
        onConfirm(values: any) {
          check();
          b.Undo.initEdit({ pbmc_cosmic: true });
          try {
            b.Project.pbmc_cosmic_properties = {
              isTransparent: values.isTransparent,
              cullsSelf: values.cullsSelf,
            };
            b.Undo.finishEdit("Edit Cosmic Reach properties");
          } catch (error) {
            b.Undo.cancelEdit(true);
            throw error;
          }
        },
      });
      dialogs.add(dialog);
      dialog.show();
    };
    b.BarItems.export_cosmic_reach_model_aschild.click = () => {
      const check = guard();
      const dialog = new b.Dialog("pbmc_cosmic_parent", {
        title: "Export Cosmic Reach child model",
        form: {
          name: { type: "text", label: "Parent model", value: b.Project.name },
        },
        onConfirm(values: any) {
          check();
          if (!values.name.trim())
            throw new Fault("COSMIC_PARENT", "Supply a parent model name");
          return codec.export({ parent: values.name });
        },
      });
      dialogs.add(dialog);
      dialog.show();
    };
    this.onunload = () => {
      active = false;
      for (const d of dialogs) {
        d.hide();
        d.delete();
      }
      dialogs.clear();
      try {
        return unloads.get(this)!.call(this);
      } finally {
        for (const c of codecs) if (b.Codecs[c.id] === c) c.delete();
        for (const f of formats) if (b.Formats[f.id] === f) f.delete();
        for (const name of names)
          if (b[name] === globals.get(name)) {
            const descriptor = previous.get(name);
            if (descriptor) Object.defineProperty(b, name, descriptor);
            else delete b[name];
          }
      }
    };
    return result;
  };
  proto.runOnLoad = loaded;
  return () => {
    if (proto.runOnLoad === loaded) proto.runOnLoad = load;
    b.Blockbench.removeListener("create_undo_save", save);
    b.Blockbench.removeListener("load_undo_save", restore);
    projectProperty?.delete();
    faceProperty?.delete();
  };
}
