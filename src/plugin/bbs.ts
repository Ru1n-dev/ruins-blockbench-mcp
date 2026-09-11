import { Adapter, type BB } from "./adapter.ts";
import { Fault } from "../shared/types.ts";
import { compileBBS, validateBBS } from "./bbs-data.ts";
import { importBBS } from "./bbs-import.ts";
export function installBBS(b: BB) {
  const proto = b.BBPlugin.prototype,
    load = proto.runOnLoad,
    unloads = new WeakMap<object, Function>(),
    codecs = new WeakMap<object, any>();
  const loaded = function (this: any, ...args: any[]) {
    if (this.id !== "bbs_exporter" || this.version !== "1.3.3")
      return load.apply(this, args);
    if (!unloads.has(this)) unloads.set(this, this.onunload);
    if (!codecs.has(this)) codecs.set(this, b.Codecs.bbs_model);
    const result = load.apply(this, args),
      codec = codecs.get(this),
      dialogs = new Set<any>();
    let active = true;
    b.Codecs.bbs_model = codec;
    codec.compile = (options: any = {}) =>
      JSON.stringify(
        compileBBS(b, {
          model: options.model !== false,
          animations: options.animations !== false,
        }),
        null,
        2,
      );
    codec.load = (data: any) => {
      data = validateBBS(typeof data === "string" ? JSON.parse(data) : data);
      if (!b.Project) b.newProject(b.Formats.free);
      return importBBS(b, data);
    };
    b.BarItems.bbs_importer.click = () => {
      const owner = b.Project;
      return b.Blockbench.import(
        {
          extensions: ["bbs.json", "json"],
          type: "BBS model",
          readtype: "text",
        },
        (files: any[]) => {
          if (!active || b.Project !== owner)
            throw new Fault("STALE_STATE", "The BBS import context changed");
          if (files?.[0]) return codec.load(JSON.parse(files[0].content));
        },
      );
    };
    b.BarItems.bbs_exporter.click = () => {
      const owner = b.Project,
        adapter = new Adapter(b),
        fingerprint = adapter.fingerprint();
      const dialog = new b.Dialog("pbmc_bbs_export", {
        title: "BBS model exporter",
        form: {
          exportModel: {
            type: "checkbox",
            label: "Export model data",
            value: true,
          },
          exportAnimations: {
            type: "checkbox",
            label: "Export animations",
            value: true,
          },
          copyToBuffer: {
            type: "checkbox",
            label: "Copy to buffer",
            value: false,
          },
          copyOnlyFirst: {
            type: "checkbox",
            label: "Copy first selected group",
            value: false,
            condition: (v: any) => v.copyToBuffer,
          },
          exportAsFolder: {
            type: "checkbox",
            label: "Export model and textures as ZIP",
            value: false,
            condition: (v: any) => !v.copyToBuffer,
          },
        },
        async onConfirm(values: any) {
          if (
            !active ||
            b.Project !== owner ||
            adapter.fingerprint() !== fingerprint
          )
            throw new Fault("STALE_STATE", "The BBS export context changed");
          const output = compileBBS(b, {
              model:
                values.exportModel ||
                (values.copyToBuffer && values.copyOnlyFirst),
              animations: values.exportAnimations,
            }),
            exportFile = b.Blockbench.export;
          if (values.copyToBuffer) {
            const group = b.Group.selected[0];
            if (values.copyOnlyFirst && !group)
              throw new Fault("BBS_SELECTION", "Select a group to copy");
            b.Clipbench.setText(
              JSON.stringify(
                values.copyOnlyFirst
                  ? output.model?.groups[group.name]?.cubes || []
                  : output,
                null,
                2,
              ),
            );
            return;
          }
          if (values.exportAsFolder) {
            const zip = new b.JSZip();
            zip.file("model.bbs.json", JSON.stringify(output, null, 2));
            const used = new Set<string>(["model.bbs.json"]);
            for (const t of b.Texture.all)
              if (!t.error) {
                const base = (
                  t.name
                    .replace(/\.png$/i, "")
                    .replace(/[^\p{L}\p{N}_-]/gu, "_") || "texture"
                ).slice(0, 100);
                let name = base + ".png",
                  i = 1;
                while (used.has(name.toLowerCase()))
                  name = base + "_" + i++ + ".png";
                used.add(name.toLowerCase());
                zip.file(name, t.getBase64(), { base64: true });
              }
            const content = await zip.generateAsync({ type: "uint8array" });
            if (
              !active ||
              b.Project !== owner ||
              adapter.fingerprint() !== fingerprint
            )
              throw new Fault("STALE_STATE", "The BBS export context changed");
            return exportFile({
              type: "BBS model archive",
              extensions: ["zip"],
              name: owner.name,
              content: content.buffer,
              savetype: "binary",
            });
          }
          return exportFile({
            type: "BBS model",
            extensions: ["bbs.json"],
            name: owner.name,
            content: JSON.stringify(output, null, 2),
            savetype: "text",
          });
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
        if (b.Codecs.bbs_model === codec) codec.delete();
      }
    };
    return result;
  };
  proto.runOnLoad = loaded;
  return () => {
    if (proto.runOnLoad === loaded) proto.runOnLoad = load;
  };
}
