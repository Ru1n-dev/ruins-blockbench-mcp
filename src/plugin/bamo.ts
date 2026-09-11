import { Adapter, type BB } from "./adapter.ts";
import { Fault } from "../shared/types.ts";
import { generateBamoZip } from "./generated/bamo-generator.ts";
import { bamoProperties, bamoName } from "./bamo-data.ts";

export function installBamo(b: BB) {
  const proto = b.BBPlugin.prototype,
    load = proto.runOnLoad;
  const unloads = new WeakMap<object, Function>(),
    formats = new WeakMap<object, any>();
  let property: any;
  const loaded = function (this: any, ...args: any[]) {
    if (this.id !== "bamo" || this.version !== "0.5.1")
      return load.apply(this, args);
    if (!unloads.has(this)) unloads.set(this, this.onunload);
    property ??= new b.Property(
      b.ModelProject,
      "object",
      "pbmc_bamo_settings",
      { default: {} },
    );
    if (b.Formats.bamo_model) formats.set(this, b.Formats.bamo_model);
    else b.Formats.bamo_model = formats.get(this);
    const Dialog = b.Dialog,
      codec = b.Codecs.project,
      on = codec.on,
      listen = b.Blockbench.on,
      addCSS = b.Blockbench.addCSS;
    const styles: any[] = [];
    let dialog: any;
    b.Dialog = new Proxy(Dialog, {
      construct(target, params) {
        const d = Reflect.construct(target, params) as any;
        if (params[0] === "BAMOExportWindow") dialog = d;
        return d;
      },
    });
    codec.on = function (event: string, callback: Function) {
      if (event === "compile" || event === "parse") return this;
      return on.call(this, event, callback);
    };
    b.Blockbench.on = function (event: string, callback: Function) {
      if (event === "close_project") return { delete() {} };
      return listen.call(this, event, callback);
    };
    b.Blockbench.addCSS = function (...params: any[]) {
      const css = addCSS.apply(this, params);
      styles.push(css);
      return css;
    };
    let result;
    try {
      result = load.apply(this, args);
    } finally {
      b.Dialog = Dialog;
      codec.on = on;
      b.Blockbench.on = listen;
      b.Blockbench.addCSS = addCSS;
    }
    if (!dialog)
      throw new Fault("BAMO_DIALOG", "BAMO export dialog was not registered");
    let active = true;
    const compile = (event: any) => {
      if (b.Project?.format?.id === "bamo_model")
        event.model.bamoSettings = bamoProperties(b.Project.pbmc_bamo_settings);
    };
    const parse = (event: any) => {
      if (b.Project?.format?.id === "bamo_model")
        b.Project.pbmc_bamo_settings = bamoProperties(
          event.model?.bamoSettings ||
            event.model?.pbmc_bamo_settings || { displayName: b.Project.name },
        );
    };
    codec.on("compile", compile);
    codec.on("parse", parse);
    const action = b.BarItems.bamo;
    action.condition = () => b.Project?.format?.id === "bamo_model";
    const label = () => {
      for (const row of dialog.object?.querySelectorAll(".settingsList li") ||
        []) {
        const name = row.querySelector(".headerLabel")?.textContent?.trim();
        if (name)
          for (const [i, control] of [
            ...row.querySelectorAll("input,select"),
          ].entries())
            control.setAttribute("aria-label", i ? `${name} ${i + 1}` : name);
      }
    };
    const observer = new MutationObserver(label);
    action.click = () => {
      if (!b.Texture.all.length)
        throw new Fault(
          "BAMO_TEXTURE",
          "Create a texture before exporting a BAMO pack",
        );
      const owner = b.Project;
      const current = bamoProperties(owner.pbmc_bamo_settings);
      if (!current.displayName) current.displayName = owner.name;
      for (const variant of Object.values(current.variant) as any[])
        for (const key of Object.keys(variant))
          if (!variant[key]) variant[key] = b.Texture.all[0].name;
      owner.pbmc_bamo_settings = current;
      dialog.show();
      const vue = dialog.content_vue;
      vue.swap = true;
      vue.properties = current;
      vue.lastID = owner.uuid;
      vue.updateValues = () => {};
      vue.createJSON = async () => {
        if (!active || b.Project !== owner)
          throw new Fault("STALE_PROJECT", "BAMO project changed");
        const properties = bamoProperties(vue.properties),
          name = bamoName(properties.displayName);
        if (!properties.types.custom && !properties.types.block)
          throw new Fault("BAMO_TYPE", "Select a custom or regular base block");
        if (!b.Texture.all.some((t: any) => t.particle))
          throw new Fault(
            "BAMO_TEXTURE",
            "Select a particle texture before exporting",
          );
        const fingerprint = new Adapter(b).fingerprint(),
          exportFile = b.Blockbench.export;
        const paths = new Set<string>();
        class Zip extends b.JSZip {
          file(path: string, data: any, options: any) {
            if (
              !path ||
              path.startsWith("/") ||
              path.includes("\\") ||
              path.split("/").some((p) => p === ".." || p === ".") ||
              paths.has(path)
            )
              throw new Fault(
                "BAMO_PATH",
                `Invalid or duplicate archive path: ${path}`,
              );
            paths.add(path);
            return super.file(path, data, options);
          }
        }
        const content = await generateBamoZip(
          {
            Texture: b.Texture,
            Format: b.Format,
            JSZip: Zip,
            Blockbench: b.Blockbench,
          },
          properties,
        );
        if (
          !active ||
          b.Project !== owner ||
          new Adapter(b).fingerprint() !== fingerprint
        )
          throw new Fault(
            "STALE_PROJECT",
            "BAMO project changed during export",
          );
        if (!(content instanceof Uint8Array))
          throw new Fault("BAMO_EXPORT", "BAMO did not produce an archive");
        exportFile({
          type: "BAMO pack",
          extensions: ["zip"],
          name,
          content: content.buffer,
          savetype: "binary",
        });
        dialog.hide();
      };
      observer.disconnect();
      observer.observe(dialog.object, { childList: true, subtree: true });
      label();
    };
    this.onunload = () => {
      active = false;
      observer.disconnect();
      dialog.hide();
      dialog.content_vue?.$destroy();
      dialog.delete();
      codec.removeListener("compile", compile);
      codec.removeListener("parse", parse);
      for (const style of styles) style.delete();
      return unloads.get(this)!.call(this);
    };
    return result;
  };
  proto.runOnLoad = loaded;
  return () => {
    if (proto.runOnLoad === loaded) proto.runOnLoad = load;
    property?.delete();
  };
}
