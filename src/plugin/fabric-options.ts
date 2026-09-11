import type { BB } from "./adapter.ts";
export function installFabricOptions(b: BB) {
  const proto = b.BBPlugin.prototype,
    load = proto.runOnLoad;
  const defaults = {
    header: "package com.example.mod;",
    entity: "Entity",
    render: "",
    members: "",
  };
  const options = new WeakMap<object, any>();
  const loaded = function (this: any, ...args: any[]) {
    if (this.id !== "modded_entity_fabric" || this.version !== "0.4.0")
      return load.apply(this, args);
    const codec = b.Codecs.modded_entity,
      projectCodec = b.Codecs.project;
    const templateIds = ["Fabric 1.14", "Fabric 1.15+", "Fabric 1.17+"];
    const priorTemplates = new Map(
      templateIds.map((id) => [id, codec.templates[id]]),
    );
    const before = new Set(projectCodec.events.parse ?? []);
    const result = load.apply(this, args);
    const parser = projectCodec.events.parse.find(
      (callback: any) => !before.has(callback),
    );
    const nativeCompile = codec.compile,
      nativeUnload = this.onunload,
      action = b.BarItems.fabric_info,
      nativeClick = action.click;
    let active = true,
      dialog: any;
    const fallback = { ...defaults };
    const get = () => {
      if (!b.Project) return fallback;
      if (!options.has(b.Project)) options.set(b.Project, { ...defaults });
      return options.get(b.Project);
    };
    const descriptor = Object.getOwnPropertyDescriptor(b, "fabricOptions");
    Object.defineProperty(b, "fabricOptions", {
      configurable: true,
      enumerable: true,
      get,
      set(value) {
        const data = { ...defaults };
        for (const key of Object.keys(data) as (keyof typeof data)[])
          if (typeof value?.[key] === "string") data[key] = value[key];
        if (b.Project) options.set(b.Project, data);
        else Object.assign(fallback, data);
      },
    });
    const refresh = () => {
      parser({ model: { fabricOptions: { ...get() } } });
      const template = codec.templates["Fabric 1.17+"],
        data = get();
      template.file = template.file
        .replace("%(renderers)", `${data.render}\n%(renderers)`)
        .replace(/}\s*$/, `${data.members}\n}`);
    };
    refresh();
    const compile = function (this: any, ...values: any[]) {
      if (active && b.Format?.id === "modded_entity") refresh();
      return nativeCompile.apply(this, values);
    };
    codec.compile = compile;
    action.click = function (this: any, ...values: any[]) {
      const result = nativeClick.apply(this, values);
      dialog = b.Dialog.open;
      return result;
    };
    this.onunload = function (this: any, ...values: any[]) {
      if (!active) return;
      active = false;
      const next = this.onload;
      this.onload = function (this: any, ...args: any[]) {
        this.onunload = nativeUnload;
        this.onload = next;
        return next.apply(this, args);
      };
      try {
        return nativeUnload.apply(this, values);
      } finally {
        if (codec.compile === compile) codec.compile = nativeCompile;
        for (const [id, template] of priorTemplates)
          if (template) codec.templates[id] = template;
        if (dialog && b.Dialog.open === dialog) dialog.hide();
        action.click = nativeClick;
        if (Object.getOwnPropertyDescriptor(b, "fabricOptions")?.get === get) {
          if (descriptor) Object.defineProperty(b, "fabricOptions", descriptor);
          else delete b.fabricOptions;
        }
      }
    };
    return result;
  };
  proto.runOnLoad = loaded;
  return () => {
    if (proto.runOnLoad === loaded) proto.runOnLoad = load;
  };
}
