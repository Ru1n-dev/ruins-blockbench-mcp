import type { BB } from "./adapter.ts";
import { Fault } from "../shared/types.ts";
import { installPbrMaterials } from "./pbr-materials.ts";
import { installPbrMer } from "./pbr-mer.ts";
import { installPbrNormals } from "./pbr-normals.ts";
import { installPbrTextureSet } from "./pbr-texture-set.ts";
import { installPbrBrush } from "./pbr-brush.ts";
import { patchPbrPresets } from "./pbr-presets.ts";
import { installPbrBake } from "./pbr-bake.ts";
import { labChannels } from "./pbr-lab-codec.ts";
import { installPbrLab } from "./pbr-lab.ts";
import { installPbrUsdz } from "./pbr-usdz.ts";
import { applyTextureMapModes } from "./texture-map-lifecycle.ts";

export function installPbrPreview(b: BB) {
  const proto = b.BBPlugin.prototype,
    load = proto.runOnLoad,
    installable = proto.isInstallable;
  const unloads = new WeakMap<object, Function>();
  const supported = function (this: any, ...args: any[]) {
    if (this.id !== "pbr_preview" || this.version !== "1.2.2")
      return installable.apply(this, args);
    const max = this.max_version;
    this.max_version = "5.1.6";
    try {
      return installable.apply(this, args);
    } finally {
      this.max_version = max;
    }
  };
  proto.isInstallable = supported;
  const loaded = function (this: any, ...args: any[]) {
    if (this.id !== "pbr_preview" || this.version !== "1.2.2")
      return load.apply(this, args);
    if (!unloads.has(this)) unloads.set(this, this.onunload);
    let active = true,
      depth = 0;
    const originalMaterials = new WeakMap<object, any>(),
      materials = new Set<any>();
    const rendererState = new Map<any, any>(
      b.Preview.all.map((p: any) => [
        p.renderer,
        {
          toneMapping: p.renderer.toneMapping,
          toneMappingExposure: p.renderer.toneMappingExposure,
          physicallyCorrectLights: p.renderer.physicallyCorrectLights,
        },
      ]),
    );
    const cache = new WeakMap<object, any>();
    const previews = new WeakMap<object, Map<any, any>>(),
      owners = new WeakMap<object, any>();
    const disposeMaterial = (material: any) => {
      for (const key of [
        "map",
        "aoMap",
        "normalMap",
        "bumpMap",
        "metalnessMap",
        "roughnessMap",
        "emissiveMap",
      ])
        if (material[key]?.isCanvasTexture) material[key].dispose();
      material.dispose?.();
    };
    const retireMaterials = () => {
      const current = new Set(
        b.ModelProject.all.flatMap((p: any) => [
          ...(previews.get(p)?.values() ?? []),
        ]),
      );
      for (const material of materials)
        if (!current.has(material)) {
          disposeMaterial(material);
          materials.delete(material);
        }
    };
    const getMaterial = b.Texture.prototype.getMaterial;
    const getPreviewMaterial = function (this: any, ...args: any[]) {
      const owner = owners.get(this);
      const material = (
        (active && owner?.pbr_active && previews.get(owner)?.get(this.uuid)) ||
        getMaterial.apply(this, args)
      );
      applyTextureMapModes(b, material);
      return material;
    };
    b.Texture.prototype.getMaterial = getPreviewMaterial;
    const descriptors = ["materials", "bb_materials"].map(
      (key) =>
        [
          key,
          Object.getOwnPropertyDescriptor(b.ModelProject.prototype, key),
        ] as const,
    );
    const ensure = () => {
      for (const p of b.ModelProject.all) {
        p.pbr_materials ??= {};
        p.pbr_active ??= false;
        for (const t of p.textures) {
          owners.set(t, p);
          t.channel ??= "_NONE_";
          t.pbr_material ??= false;
          for (const layer of t.layers) layer.channel ??= "_NONE_";
          if (!originalMaterials.has(t)) originalMaterials.set(t, t.material);
          if (t.material && t.material !== originalMaterials.get(t))
            materials.add(t.material);
        }
      }
    };
    Object.defineProperty(b.ModelProject.prototype, "materials", {
      configurable: true,
      get: function () {
        const project = this;
        return new Proxy(
          {},
          {
            get: (_, key) =>
              previews.get(project)?.get(key) ??
              project.textures.find((t: any) => t.uuid === key)?.material,
            set: (_, key, value) => {
              const t = project.textures.find((t: any) => t.uuid === key);
              if (t) {
                if (!previews.has(project)) previews.set(project, new Map());
                previews.get(project)!.set(key, value);
                applyTextureMapModes(b, value);
                if (value?.isMeshStandardMaterial) materials.add(value);
              }
              return true;
            },
          },
        );
      },
    });
    Object.defineProperty(b.ModelProject.prototype, "bb_materials", {
      configurable: true,
      get: function () {
        if (!cache.has(this)) cache.set(this, {});
        return cache.get(this);
      },
      set: function (v: any) {
        cache.set(this, v);
      },
    });
    const listeners: any[] = [];
    const ownedDialogs = new Set<any>();
    const callbacks = new WeakMap<Function, Function>();
    const wrap = (fn: Function): any => {
      if (!callbacks.has(fn))
        callbacks.set(fn, function (this: any, ...args: any[]) {
          if (!active) return;
          return scope(() => fn.apply(this, args));
        });
      return callbacks.get(fn);
    };
    const scope = (run: () => any): any => {
      if (depth) return run();
      ensure();
      depth++;
      const copy = b.THREE.ShaderMaterial.prototype.copy,
        Dialog = b.Dialog,
        on = b.Blockbench.on,
        remove = b.Blockbench.removeListener,
        extend = b.Texture.prototype.extend;
      b.Dialog = new Proxy(Dialog, {
        construct(target: any, args: any[]) {
          const index = typeof args[0] === "string" ? 1 : 0;
          const component = args[index]?.component;
          if (typeof component === "function" && component.options) {
            args = [...args];
            args[index] = {
              ...args[index],
              component: { ...component.options },
            };
          }
          const dialog: any = Reflect.construct(target, args);
          ownedDialogs.add(dialog);
          if (args[0] === "user_brush_presets")
            patchPbrPresets(b, dialog, () => active);
          return dialog;
        },
      });
      b.THREE.ShaderMaterial.prototype.copy = function (source: any) {
        return this.isMeshStandardMaterial ? this : copy.call(this, source);
      };
      b.Texture.prototype.extend = function (data: any, ...args: any[]) {
        if (typeof data?.material === "boolean") {
          data = { ...data, pbr_material: data.material };
          delete data.material;
        }
        return extend.call(this, data, ...args);
      };
      b.Blockbench.on = function (events: any, fn: Function, ...args: any[]) {
        const result = on.call(this, events, wrap(fn), ...args);
        listeners.push(result);
        return result;
      };
      b.Blockbench.removeListener = function (
        event: any,
        fn: Function,
        ...args: any[]
      ) {
        return remove.call(this, event, callbacks.get(fn) ?? fn, ...args);
      };
      try {
        return run();
      } finally {
        b.THREE.ShaderMaterial.prototype.copy = copy;
        b.Dialog = Dialog;
        b.Blockbench.on = on;
        b.Blockbench.removeListener = remove;
        b.Texture.prototype.extend = extend;
        try {
          ensure();
          if (b.Project?.pbr_active) b.Canvas.updateAllFaces();
          retireMaterials();
        } finally {
          depth--;
        }
      }
    };
    const Property = b.Property;
    b.Property = new Proxy(Property, {
      construct(target: any, args: any[]) {
        if (
          (args[0] === b.Texture || args[0] === b.TextureLayer) &&
          args[2] === "channel"
        )
          args = [
            ...args.slice(0, 3),
            { ...args[3], values: [...args[3].values, ...labChannels] },
          ];
        if (args[0] === b.Texture && args[2] === "material")
          args = [args[0], args[1], "pbr_material", ...args.slice(3)];
        if (args[0] === b.ModelProject && args[2] === "bb_materials")
          return { delete() {} };
        return Reflect.construct(target, args);
      },
    });
    const existing = new Set(Object.values(b.BarItems));
    let result;
    try {
      result = scope(() => load.apply(this, args));
    } finally {
      b.Property = Property;
    }
    const owned = Object.values(b.BarItems).filter(
      (a: any) => !existing.has(a),
    ) as any[];
    for (const a of owned)
      for (const method of [
        "click",
        "onChange",
        "onSelect",
        "onAfter",
        "onBefore",
      ]) {
        if (typeof a[method] === "function") a[method] = wrap(a[method]);
      }
    const channels = [
      "albedo",
      "metalness",
      "emissive",
      "roughness",
      "height",
      "normal",
      "ao",
    ];
    const selected = () =>
      b.TextureLayer.selected ??
      b.Texture.selected?.selected_layer ??
      b.Texture.selected;
    const textureOf = (n: any) => (n instanceof b.TextureLayer ? n.texture : n);
    const canAssign = () =>
      !!b.Project && !!selected() && (b.Modes.edit || b.Modes.paint);
    const saveListener = b.Blockbench.on(
      "create_undo_save",
      ({ save, aspects }: any) => {
        if (aspects.pbmc_pbr)
          save.pbmc_pbr = JSON.parse(JSON.stringify(b.Project.pbr_materials));
      },
    );
    const restoreListener = b.Blockbench.on(
      "load_undo_save",
      ({ save }: any) => {
        if (save.pbmc_pbr)
          b.Project.pbr_materials = JSON.parse(JSON.stringify(save.pbmc_pbr));
      },
    );
    const extraActions = labChannels.map(
      (channel) =>
        new b.Action(`assign_channel_${channel}`, {
          name: `Assign ${channel}`,
          icon: "texture",
        }),
    );
    for (const channel of [...channels, ...labChannels, null]) {
      const action =
        b.BarItems[channel ? `assign_channel_${channel}` : "unassign_channel"];
      action.condition = canAssign;
      action.click = () =>
        scope(() => {
          const n = selected();
          if (!n) throw new Fault("PBR_SELECTION", "Select a texture or layer");
          const texture = textureOf(n),
            aspects: any = {
              textures: [texture],
              bitmap: true,
              pbmc_pbr: true,
            };
          b.Undo.initEdit(aspects);
          try {
            const mapping = (b.Project.pbr_materials[texture.uuid] ??= {});
            for (const [key, id] of Object.entries(mapping))
              if (id === n.uuid || key === channel) delete mapping[key];
            if (channel && texture.layers_enabled)
              for (const layer of texture.layers)
                if (layer !== n && layer.channel === channel)
                  layer.channel = "_NONE_";
            n.channel = channel ?? "_NONE_";
            if (channel) mapping[channel] = n.uuid;
            texture.updateChangesAfterEdit();
            b.Undo.finishEdit(
              channel ? "Assign PBR channel" : "Unassign PBR channel",
              aspects,
            );
          } catch (e) {
            if (b.Undo.current_save) b.Undo.cancelEdit(true);
            throw e;
          }
        });
    }
    for (const id of ["pbr_channel_menu", "show_channel_menu"])
      if (b.BarItems[id]) b.BarItems[id].condition = canAssign;
    const channelEntries = [
      ...channels.map((c) => b.BarItems[`assign_channel_${c}`]),
      { name: "labPBR Metadata", icon: "experiment", children: extraActions },
      b.BarItems.unassign_channel,
    ];
    b.BarItems.pbr_channel_menu.children = channelEntries;
    let channelMenu: any;
    for (const id of ["pbr_channel_menu", "show_channel_menu"])
      b.BarItems[id].click = (event: any) => {
        channelMenu?.hide();
        channelMenu = new b.Menu("pbmc_pbr_channels", channelEntries);
        channelMenu.open(event?.target);
      };
    const panel = b.Panels.channels_panel?.inside_vue;
    if (panel)
      panel.channels = {
        ...panel.channels,
        ...Object.fromEntries(
          labChannels.map((id) => [id, { id, label: id, icon: "experiment" }]),
        ),
      };
    if (b.BarItems.export_bbmat)
      b.BarItems.export_bbmat.condition = () =>
        !!b.Texture.selected?.pbr_material && b.Texture.selected.layers_enabled;
    installPbrMaterials(b, channels, scope, () => active);
    const releaseMer = installPbrMer(b, scope, () => active);
    const releaseNormals = installPbrNormals(b, scope, () => active);
    const releaseTextureSet = installPbrTextureSet(b, () => active);
    const releaseBrush = installPbrBrush(b);
    const releaseBake = installPbrBake(b, scope, () => active);
    const releaseLab = installPbrLab(b, scope, () => active);
    const releaseUsdz = installPbrUsdz(b, () => active);
    const finish = () => {
      if (b.Texture.prototype.getMaterial === getPreviewMaterial)
        b.Texture.prototype.getMaterial = getMaterial;
      for (const p of b.ModelProject.all) {
        p.pbr_active = false;
        for (const t of p.textures) {
          const material = originalMaterials.get(t);
          if (material) t.material = material;
        }
      }
      for (const [renderer, state] of rendererState)
        Object.assign(renderer, state);
      for (const material of materials) {
        disposeMaterial(material);
      }
      for (const [key, d] of descriptors) {
        if (d) Object.defineProperty(b.ModelProject.prototype, key, d);
        else delete b.ModelProject.prototype[key];
      }
      if (b.Project) b.Canvas.updateAll();
    };
    this.onunload = () => {
      if (!active) return;
      releaseBrush();
      try {
        scope(() => unloads.get(this)!.call(this));
      } finally {
        active = false;
        channelMenu?.hide();
        for (const action of extraActions) action.delete();
        for (const dialog of ownedDialogs) {
          dialog.hide();
          dialog.delete();
        }
        ownedDialogs.clear();
        releaseMer();
        releaseNormals();
        releaseTextureSet();
        releaseBake();
        releaseLab();
        releaseUsdz();
        for (const listener of listeners) listener.delete();
        saveListener.delete();
        restoreListener.delete();
        finish();
      }
    };
    return result;
  };
  proto.runOnLoad = loaded;
  return () => {
    if (proto.runOnLoad === loaded) proto.runOnLoad = load;
    if (proto.isInstallable === supported) proto.isInstallable = installable;
  };
}
