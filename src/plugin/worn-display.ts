import { Adapter, type BB } from "./adapter.ts";
import { Fault } from "../shared/types.ts";
import { installWornCenter } from "./worn-center.ts";

export const wornSlots = [
  "sophisticatedbackpacks:worn",
  "the_four_primitives_and_weapons:back",
  "the_four_primitives_and_weapons:belt",
  "backpack_arsenal:chestplate",
  "backpack_arsenal:placed",
];
const safeId = (key: string) =>
  "sbcd_" + key.replace(/[^a-z0-9]/gi, "_").toLowerCase();
export function installWornDisplay(b: BB) {
  const proto = b.BBPlugin.prototype,
    load = proto.runOnLoad,
    unloads = new WeakMap<object, Function>();
  const loaded = function (this: any, ...args: any[]) {
    if (this.id !== "sb_worn_display" || this.version !== "4.13.0")
      return load.apply(this, args);
    if (!unloads.has(this)) unloads.set(this, this.onunload);
    const dialogs = new Set<any>(),
      show = b.Dialog.prototype.show;
    let active = true;
    let importKeys: string[] = [];
    const nativeImport = b.Blockbench.import;
    const makeImport = (receiver: Function) =>
      function (this: any, options: any, callback: any, ...rest: any[]) {
        if (options?.resource_id !== "sb_import_display")
          return receiver.call(this, options, callback, ...rest);
        const owner = b.Project;
        return receiver.call(
          this,
          options,
          (files: any[]) => {
            if (!active || b.Project !== owner)
              throw new Fault(
                "STALE_STATE",
                "The display import context changed",
              );
            if (!files?.[0]) return callback(files);
            const parsed = JSON.parse(files[0].content),
              data = parsed.display || parsed.display_settings;
            if (!data || typeof data !== "object" || Array.isArray(data))
              throw new Fault(
                "DISPLAY_DATA",
                "Supply an object containing display slots",
              );
            const keys = Object.keys(data),
              seen = new Set<string>();
            for (const key of keys) {
              if (
                ["__proto__", "constructor", "prototype"].includes(key) ||
                seen.has(safeId(key))
              )
                throw new Fault("DISPLAY_DATA", "Ambiguous display slot name");
              seen.add(safeId(key));
              const slot = data[key];
              if (!slot || typeof slot !== "object" || Array.isArray(slot))
                throw new Fault(
                  "DISPLAY_DATA",
                  "Display slots must be objects",
                );
              for (const channel of ["rotation", "translation", "scale"])
                if (
                  slot[channel] !== undefined &&
                  (!Array.isArray(slot[channel]) ||
                    slot[channel].length !== 3 ||
                    !slot[channel].every(Number.isFinite))
                )
                  throw new Fault(
                    "DISPLAY_DATA",
                    "Display vectors must contain three finite numbers",
                  );
            }
            importKeys = keys;
            try {
              return callback(files);
            } finally {
              importKeys = [];
            }
          },
          ...rest,
        );
      };
    const imported = makeImport(nativeImport);
    b.Blockbench.import = imported;
    const wrapped = function (this: any, ...values: any[]) {
      const key = wornSlots.find((key) => this.id === "edit_" + safeId(key));
      const keys = key
        ? [key]
        : this.id === "sb_import_display_dialog"
          ? importKeys.slice()
          : [];
      if (keys.length && !dialogs.has(this)) {
        dialogs.add(this);
        const owner = b.Project,
          adapter = new Adapter(b),
          fingerprint = adapter.fingerprint(),
          confirm = this.onConfirm;
        this.onConfirm = function (result: any, ...rest: any[]) {
          if (
            !active ||
            b.Project !== owner ||
            adapter.fingerprint() !== fingerprint
          )
            throw new Fault("STALE_STATE", "The display edit context changed");
          if (key)
            for (const prefix of ["rot", "trans", "scale"])
              for (const axis of ["X", "Y", "Z"])
                if (!Number.isFinite(result[prefix + axis]))
                  throw new Fault(
                    "DISPLAY_VALUE",
                    "Display values must be finite numbers",
                  );
          b.Undo.initEdit({ display_slots: keys });
          try {
            const value = confirm.call(this, result, ...rest);
            b.Undo.finishEdit("Edit custom display slot");
            return value;
          } catch (error) {
            b.Undo.cancelEdit(true);
            throw error;
          }
        };
      }
      return show.apply(this, values);
    };
    b.Dialog.prototype.show = wrapped;
    const listeners: any[] = [],
      on = b.Blockbench.on,
      timers = new Set<any>();
    b.Blockbench.on = function (name: any, callback: any) {
      listeners.push([name, callback]);
      return on.call(this, name, callback);
    };
    let result;
    try {
      result = load.apply(this, args);
    } catch (error) {
      if (b.Dialog.prototype.show === wrapped) b.Dialog.prototype.show = show;
      if (b.Blockbench.import === imported) b.Blockbench.import = nativeImport;
      throw error;
    } finally {
      b.Blockbench.on = on;
    }
    const guardedListeners = listeners.map(([name, callback]) => {
      b.Blockbench.removeListener(name, callback);
      const guarded = (...args: any[]) => {
        if (!active) return;
        const timeout = b.setTimeout;
        b.setTimeout = (fn: Function, delay: number, ...rest: any[]) => {
          const timer = timeout(() => {
            timers.delete(timer);
            if (active) fn(...rest);
          }, delay);
          timers.add(timer);
          return timer;
        };
        try {
          return callback(...args);
        } finally {
          b.setTimeout = timeout;
        }
      };
      on.call(b.Blockbench, name, guarded);
      return [name, guarded];
    });
    installWornCenter(b);
    const importAction = b.BarItems.custom_disp_import,
      click = importAction.click;
    importAction.click = function (...args: any[]) {
      const previous = b.Blockbench.import;
      b.Blockbench.import = makeImport(
        previous === imported ? nativeImport : previous,
      );
      try {
        return click.apply(this, args);
      } finally {
        b.Blockbench.import = previous;
      }
    };
    const patched = new WeakSet<object>();
    const fixed = b.DisplayMode.loadFixed,
      visibility = new Map<any, boolean>(),
      scenes = new Set<any>();
    const fixedWrapped = function (this: any, ...args: any[]) {
      const result = fixed.apply(this, args),
        parent = b.DisplayMode.display_area?.parent;
      visibility.clear();
      if (parent) {
        scenes.add(parent);
        for (const child of parent.children)
          if (child !== b.DisplayMode.display_area)
            visibility.set(child, child.visible);
      }
      return result;
    };
    b.DisplayMode.loadFixed = fixedWrapped;
    const cleanGuides = () => {
      let found = false;
      for (const scene of scenes)
        for (const name of ["sb_custom_block_guide", "sb_custom_block_floor"]) {
          const root = scene.getObjectByName(name);
          if (!root) continue;
          found = true;
          const resources = new Set<any>();
          root.traverse((n: any) => {
            if (n.geometry) resources.add(n.geometry);
            for (const m of Array.isArray(n.material)
              ? n.material
              : [n.material])
              if (m) resources.add(m);
          });
          root.removeFromParent();
          for (const resource of resources) resource.dispose();
        }
      if (found)
        for (const [object, value] of visibility) object.visible = value;
      visibility.clear();
    };
    const leaveDisplay = () => {
      if (!b.Modes.display) cleanGuides();
    };
    b.Blockbench.on("select_mode", leaveDisplay);
    const labelUI = () => {
      if (!active) return;
      for (const key of wornSlots) {
        const label = b.document.querySelector(`label[for="${safeId(key)}"]`);
        if (label) label.setAttribute("aria-label", key);
      }
      const button = b.document.querySelector(
        '[data-sb-custom-slot="import-btn"]',
      );
      if (button && !patched.has(button)) {
        patched.add(button);
        button.setAttribute("aria-label", "Import display values");
        button.addEventListener(
          "click",
          (event: Event) => {
            event.preventDefault();
            event.stopImmediatePropagation();
            if (active) importAction.click();
          },
          true,
        );
      }
    };
    const observer = new b.MutationObserver(labelUI);
    observer.observe(b.document.body, { childList: true, subtree: true });
    labelUI();
    this.onunload = () => {
      active = false;
      cleanGuides();
      if (b.Modes.display && wornSlots.includes(b.DisplayMode.display_slot))
        b.DisplayMode.loadGUI();
      b.Blockbench.removeListener("select_mode", leaveDisplay);
      if (b.DisplayMode.loadFixed === fixedWrapped)
        b.DisplayMode.loadFixed = fixed;
      observer.disconnect();
      for (const timer of timers) b.clearTimeout(timer);
      timers.clear();
      for (const [name, listener] of guardedListeners)
        b.Blockbench.removeListener(name, listener);
      try {
        return unloads.get(this)!.call(this);
      } finally {
        for (const d of dialogs) {
          d.hide();
          d.delete();
        }
        dialogs.clear();
        if (b.Dialog.prototype.show === wrapped) b.Dialog.prototype.show = show;
        if (b.Blockbench.import === imported)
          b.Blockbench.import = nativeImport;
      }
    };
    return result;
  };
  proto.runOnLoad = loaded;
  return () => {
    if (proto.runOnLoad === loaded) proto.runOnLoad = load;
  };
}
