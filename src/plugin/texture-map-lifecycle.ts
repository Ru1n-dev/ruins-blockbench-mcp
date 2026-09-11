import type { BB } from "./adapter.ts";

type Registry = {
  preferences: WeakMap<object, boolean>;
  lifetimes: WeakMap<object, () => void>;
  wrappers: WeakMap<Function, { original: any; active: () => boolean }>;
  materialObservers: Set<(material: any) => void>;
};
const registryKey = Symbol.for("perfect_blockbench_mcp.texture_map_lifecycle.v1");
function registry(b: BB): Registry {
  // A plugin's resources can outlive a bridge bundle reload. Share the state
  // with those existing callbacks, without putting IDs into public catalogs.
  if (!Object.hasOwn(b.Texture, registryKey))
    Object.defineProperty(b.Texture, registryKey, { value: {
      preferences: new WeakMap(), lifetimes: new WeakMap(), wrappers: new WeakMap(), materialObservers: new Set(),
    }, configurable: true });
  return b.Texture[registryKey];
}

/** Preview providers can bypass Texture.getMaterial's previous wrappers. */
export function applyTextureMapModes(b: BB, material: any) {
  for (const observer of registry(b).materialObservers) observer(material);
}

// The fixed source keeps a deferred cleanup array across onload calls and
// reverses (rather than consumes) it. Own each load's resources instead.
export function installTextureMapLifecycle(b: BB) {
  const { preferences, lifetimes, wrappers, materialObservers } = registry(b);
  const proto = b.BBPlugin.prototype, originalLoad = proto.runOnLoad;
  const definitions: Record<string, {
    version: string; name: string; description: string; toggle: string;
    icon: string; properties: string[]; on: number; off: number;
  }> = {
    texture_filtering: {
      version: "1.0.0", name: "Texture Filtering",
      description: "Toggles between Nearest (Blockbench default) and Linear texture filtering",
      toggle: "texture_filtering_toggle", icon: "deblur",
      properties: ["minFilter", "magFilter"], on: b.THREE.LinearFilter, off: b.THREE.NearestFilter,
    },
    repeating_textures: {
      version: "3.0.0", name: "Repeating Textures",
      description: "Wrap textures when UV is beyond the texture bounds",
      toggle: "toggle_repeating_textures", icon: "qr_code",
      properties: ["wrapS", "wrapT"], on: b.THREE.RepeatWrapping, off: b.THREE.ClampToEdgeWrapping,
    },
  };
  const load = function (this: any, ...args: any[]) {
    const definition = definitions[this.id];
    if (!definition || this.version !== definition.version)
      return originalLoad.apply(this, args);
    lifetimes.get(this)?.();
    const plugin = this, nativeLoad = this.onload, nativeUnload = this.onunload;
    let cleanup: (() => void) | undefined;
    this.onload = function () {
      let active = true;
      const touched = new Set<any>();
      const disposeListeners = new Map<any, () => void>();
      const originalMaterial = b.Texture.prototype.getMaterial;
      let setting: any;
      const apply = (map: any, enabled: boolean) => {
        if (!map || typeof map !== "object") return;
        if (!touched.has(map)) {
          touched.add(map);
          if (map.addEventListener) {
            const disposed = () => {
              touched.delete(map);
              map.removeEventListener("dispose", disposed);
              disposeListeners.delete(map);
            };
            map.addEventListener("dispose", disposed);
            disposeListeners.set(map, disposed);
          }
        }
        const value = enabled ? definition.on : definition.off;
        if (definition.properties.some(key => map[key] !== value)) {
          for (const key of definition.properties) map[key] = value;
          map.needsUpdate = true;
        }
      };
      const update = () => {
        for (const map of touched) apply(map, !!setting.value);
        for (const project of b.ModelProject.all)
          for (const texture of project.textures ?? []) {
            apply(texture.material?.map ?? texture.img?.tex, !!setting.value);
            materialChanged(project.materials?.[texture.uuid]);
          }
      };
      const materialChanged = (material: any) => {
        if (!active) return;
        for (const key of ["map", "aoMap", "normalMap", "bumpMap", "displacementMap", "metalnessMap", "roughnessMap", "emissiveMap", "alphaMap"])
          apply(material?.[key], !!setting.value);
      };
      const getMaterial = function (this: any, ...params: any[]) {
        const result = originalMaterial.apply(this, params);
        if (active) {
          apply(this.material?.map ?? this.img?.tex, !!setting.value);
          materialChanged(result);
        }
        return result;
      };
      wrappers.set(getMaterial, { original: originalMaterial, active: () => active });
      setting = new b.Setting(plugin.id, {
        name: definition.name,
        description: definition.description,
        category: "view", value: true, onChange: update,
      });
      if (preferences.has(plugin)) {
        setting.value = preferences.get(plugin);
        // Setting's constructor already saved its boot-time default. Persist
        // the restored master value too, so a following app restart keeps it.
        b.Settings?.saveLocalStorages?.();
      }
      const toggle = new b.Toggle(definition.toggle, {
        name: definition.name,
        description: definition.description,
        icon: definition.icon, category: "view", linked_setting: plugin.id,
      });
      const menu = b.MenuBar.menus.view.structure;
      menu.splice(menu.indexOf("toggle_shading") + 1, 0, toggle);
      b.Texture.prototype.getMaterial = getMaterial;
      materialObservers.add(materialChanged);
      cleanup = () => {
        if (!active) return;
        active = false;
        materialObservers.delete(materialChanged);
        preferences.set(plugin, !!(setting.master_value ?? setting.value));
        for (const project of b.ModelProject.all)
          for (const texture of project.textures ?? [])
            apply(texture.material?.map ?? texture.img?.tex, false);
        for (const map of touched) apply(map, false);
        touched.clear();
        for (const [map, listener] of disposeListeners) map.removeEventListener("dispose", listener);
        disposeListeners.clear();
        if (b.Texture.prototype.getMaterial === getMaterial) {
          let restore = originalMaterial;
          while (wrappers.has(restore) && !wrappers.get(restore)!.active())
            restore = wrappers.get(restore)!.original;
          b.Texture.prototype.getMaterial = restore;
        }
        const index = menu.indexOf(toggle);
        if (index >= 0) menu.splice(index, 1);
        toggle.delete();
        setting.delete();
        if (plugin.onunload === cleanup) plugin.onunload = nativeUnload;
        lifetimes.delete(plugin);
      };
      this.onunload = cleanup;
      lifetimes.set(plugin, cleanup);
      update();
    };
    try {
      return originalLoad.apply(this, args);
    } catch (error) {
      cleanup?.();
      throw error;
    } finally {
      this.onload = nativeLoad;
    }
  };
  proto.runOnLoad = load;
  // Loaded plugin resources belong to its own unload callback, even if the
  // MCP bridge is temporarily disconnected. No bridge listeners are retained.
  return () => {
    if (proto.runOnLoad === load) proto.runOnLoad = originalLoad;
  };
}
