import { Adapter, type BB } from "./adapter.ts";
import { Fault } from "../shared/types.ts";
import { skinPackFiles, type PackSkin } from "./skin-pack-files.ts";
import { waitForImage } from "./image-loading.ts";
export function installSkinPackager(b: BB) {
  const proto = b.BBPlugin.prototype,
    load = proto.runOnLoad,
    saved = new WeakMap<any, any>();
  const wrapped = function (this: any, ...args: any[]) {
    if (this.id !== "skin_packager" || this.version !== "0.3.2")
      return load.apply(this, args);
    let record = saved.get(this);
    if (!record) {
      record = {
        actions: [
          "export_minecraft_skin_pack",
          "load_minecraft_skin_pack_config",
        ]
          .map((id) => b.BarItems[id])
          .filter(Boolean),
        property: b.ModelProject.properties.skin_display_name,
        css: [...document.querySelectorAll("style")]
          .map((s) => s.textContent || "")
          .find((s) => s.includes(".skin_pack_export_list")),
      };
      saved.set(this, record);
    }
    for (const a of record.actions)
      if (!b.BarItems[a.id])
        new b.Action(a.id, { name: a.name, icon: a.icon, click: a.click });
    if (record.property)
      b.ModelProject.properties.skin_display_name = record.property;
    let css: any;
    if (
      record.css &&
      ![...document.querySelectorAll("style")].some(
        (s) => s.textContent === record.css,
      )
    )
      css = b.Blockbench.addCSS(record.css);
    const result = load.apply(this, args),
      unload = this.onunload,
      action = b.BarItems.export_minecraft_skin_pack,
      click = action.click;
    const dialogs = new Set<any>();
    const overrides = new Map<string, any>();
    let active = true,
      lastValues: any = record.lastValues;
    action.click = function (...values: any[]) {
      const result = click.apply(this, values),
        dialog = b.Dialog.open;
      if (dialog?.id !== "skin_pack_export") return result;
      dialogs.add(dialog);
      if (lastValues) dialog.setFormValues(lastValues);
      for (const row of dialog.content_vue.skins) {
        const owner = b.ModelProject.all.find((p: any) =>
          row.uuid.startsWith(p.uuid),
        );
        if (owner && overrides.has(owner.uuid))
          Object.assign(row, overrides.get(owner.uuid));
      }
      dialog.onConfirm = function (data: any) {
        if (!active)
          throw new Fault("PLUGIN_UNLOADED", "Skin Pack Packager was unloaded");
        const project = b.Project,
          adapter = new Adapter(b),
          send = b.Blockbench.export;
        const rows = dialog.content_vue.skins.filter((s: any) => s.export),
          skins: PackSkin[] = [];
        for (const row of rows) {
          const owner = b.ModelProject.all.find(
            (p: any) =>
              row.uuid === p.uuid || row.uuid.startsWith(p.uuid + "-"),
          );
          if (!owner)
            throw new Fault(
              "SKIN_PACK_INPUT",
              "A selected skin project was closed",
            );
          if (owner.format.id !== "skin")
            throw new Fault(
              "SKIN_PACK_FORMAT",
              "3D skin geometry requires a dedicated geometry codec adapter",
            );
          const texture =
            row.texture || owner.selected_texture || owner.textures[0];
          if (!texture)
            throw new Fault("SKIN_PACK_INPUT", "Skin has no texture");
          skins.push({
            id: row.id,
            name: row.name || owner.name,
            slim: !!row.slim,
            free: !!row.free,
            png: texture.getBase64(),
            texture_file: texture.path || undefined,
          });
        }
        const built = skinPackFiles(data, skins, b.guid()),
          fingerprint = adapter.fingerprint();
        record.lastValues = lastValues = { ...data };
        const run = async () => {
          const zip = new b.JSZip();
          for (const file of built.files)
            zip.file(file.path, file.content, { base64: !!file.base64 });
          if (data.type === "auger")
            for (const [key, suffix] of [
              ["key_art", "Store Art/" + data.id + "_Thumbnail_0.jpg"],
              ["partner_art", "Marketing Art/" + data.id + "_PartnerArt.jpg"],
              [
                "hd_key_art",
                "Marketing Art/" + data.id + "_MarketingKeyArt.jpg",
              ],
            ]) {
              if (!data[key]) continue;
              const image = await new Promise<string>((resolve, reject) => {
                const timer = setTimeout(
                  () =>
                    reject(
                      new Fault("SKIN_PACK_IMAGE", "Art image read timed out"),
                    ),
                  8000,
                );
                try {
                  b.Blockbench.read(
                    [data[key]],
                    { readtype: "image" },
                    (files: any[]) => {
                      clearTimeout(timer);
                      typeof files[0]?.content === "string"
                        ? resolve(files[0].content)
                        : reject(
                            new Fault(
                              "SKIN_PACK_IMAGE",
                              "Art image could not be read",
                            ),
                          );
                    },
                  );
                } catch (e) {
                  clearTimeout(timer);
                  reject(e);
                }
              });
              if (!image.startsWith("data:image/jpeg;base64,"))
                throw new Fault(
                  "SKIN_PACK_IMAGE",
                  "Store and marketing art must be JPEG",
                );
              zip.file(suffix, image.split(",")[1], { base64: true });
            }
          const content = await zip.generateAsync({
            type: "uint8array",
            compression: "DEFLATE",
          });
          if (
            !active ||
            b.Project !== project ||
            adapter.fingerprint() !== fingerprint
          )
            throw new Fault(
              "SKIN_PACK_CHANGED",
              "Project or plugin changed during export",
            );
          send({
            type: "Skin Pack",
            extensions: [data.type === "mcpack" ? "mcpack" : "zip"],
            name: data.id,
            content,
            savetype: "zip",
          });
          // Embedded image fallback makes unsaved native skin tabs portable. Legacy
          // path fields remain available for consumers of the provider's config format.
          const config = {
            ...built.config,
            pbmc_embedded_textures: Object.fromEntries(
              skins.map((s) => [s.id, s.png]),
            ),
          };
          send({
            type: "Skin Pack Config",
            extensions: ["bbskinpack"],
            name: data.id,
            content: JSON.stringify(config, null, 2),
            savetype: "text",
          });
        };
        this.hide();
        const task = run();
        task.catch((e: any) => b.Blockbench.showQuickMessage(e.message, 4000));
        return task;
      };
      return result;
    };
    const configAction = b.BarItems.load_minecraft_skin_pack_config,
      configClick = configAction.click;
    configAction.click = function (...args: any[]) {
      const receive = b.Blockbench.import;
      b.Blockbench.import = function (options: any, callback: any) {
        return receive.call(this, options, async (files: any[]) => {
          const config = JSON.parse(files[0]?.content || "null");
          if (!config?.pbmc_embedded_textures) return callback(files);
          const entries = Object.entries(config.skins || {});
          skinPackFiles(
            config,
            entries.map(([id, s]: any) => ({
              id,
              name: s.name,
              slim: !!s.slim,
              free: !!s.free,
              png: config.pbmc_embedded_textures[id] || "",
            })),
            b.guid(),
          );
          if (!active)
            throw new Fault(
              "PLUGIN_UNLOADED",
              "Skin Pack Packager was unloaded",
            );
          let importImages: any;
          const currentImport = b.Blockbench.import;
          b.Blockbench.import = (_options: any, handler: any) => {
            importImages = handler;
          };
          try {
            b.BarItems.import_minecraft_skins.click();
          } finally {
            b.Blockbench.import = currentImport;
          }
          if (!importImages)
            throw new Fault(
              "SKIN_PACK_IMPORT",
              "Native skin image importer unavailable",
            );
          lastValues = {
            id: config.id,
            name: config.name,
            version: config.version,
            uuid: config.uuid,
            type: config.type,
          };
          const sourceProject = b.Project;
          for (const [id, skin] of entries as [string, any][]) {
            const png = config.pbmc_embedded_textures[id];
            if (typeof png !== "string" || !png.startsWith("iVBORw0KGgo"))
              throw new Fault(
                "SKIN_PACK_IMPORT",
                "Embedded texture is not a PNG",
              );
            const image = new Image();
            image.src = "data:image/png;base64," + png;
            await waitForImage(image);
            if (image.naturalWidth * image.naturalHeight > 4194304)
              throw new Fault(
                "SKIN_PACK_IMPORT",
                "Skin image exceeds four million pixels",
              );
          }
          if (!active || b.Project !== sourceProject)
            throw new Fault(
              "SKIN_PACK_CHANGED",
              "Project or plugin changed while validating images",
            );
          record.lastValues = lastValues;
          for (const [id, skin] of entries as [string, any][]) {
            importImages([
              {
                name: (skin.slim ? "slim-" : "") + id + ".png",
                content:
                  "data:image/png;base64," + config.pbmc_embedded_textures[id],
              },
            ]);
            b.Project.name = skin.name;
            b.Project.skin_display_name = skin.name;
            b.Project.geometry_name = id;
            overrides.set(b.Project.uuid, {
              id,
              name: skin.name,
              slim: !!skin.slim,
              free: !!skin.free,
              export: skin.export !== false,
            });
          }
        });
      };
      try {
        return configClick.apply(this, args);
      } finally {
        b.Blockbench.import = receive;
      }
    };
    this.onunload = function (this: any, ...values: any[]) {
      if (!active) return;
      active = false;
      const next = this.onload;
      this.onload = function (this: any, ...args: any[]) {
        this.onunload = unload;
        this.onload = next;
        return next.apply(this, args);
      };
      try {
        return unload.apply(this, values);
      } finally {
        for (const d of dialogs) {
          if (b.Dialog.stack.includes(d)) d.hide();
          d.delete();
        }
        action.click = click;
        configAction.click = configClick;
        for (const a of record.actions) b.BarItems[a.id]?.delete();
        css?.delete();
      }
    };
    return result;
  };
  proto.runOnLoad = wrapped;
  return () => {
    if (proto.runOnLoad === wrapped) proto.runOnLoad = load;
  };
}
