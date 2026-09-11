import type { BB } from "./adapter.ts";
import { Fault } from "../shared/types.ts";

export function installTweaks(b: BB) {
  const proto = b.BBPlugin.prototype,
    load = proto.runOnLoad;
  const nativeUnload = new WeakMap<object, Function>();
  const loaded = function (this: any, ...args: any[]) {
    if (this.id !== "tweaks_n_stuff" || this.version !== "1.1.0")
      return load.apply(this, args);
    if (!nativeUnload.has(this)) nativeUnload.set(this, this.onunload);
    const close = b.ModelProject.prototype.close;
    const methods = [
      [b.Dialog.prototype, "hide"],
      [b.Dialog.prototype, "show"],
      [b.SettingsProfile.prototype, "select"],
      [b.SettingsProfile, "unselect"],
    ] as [any, string][];
    const originals = methods.map(([o, k]) => o[k]);
    const pinned = new Map<any, PropertyDescriptor | undefined>(
      b.ModelProject.all.map((p: any) => [
        p,
        Object.getOwnPropertyDescriptor(p, "pinned"),
      ]),
    );
    const scope = (run: () => any): any => {
      const css = b.Blockbench.addCSS,
        on = b.Blockbench.on;
      b.Blockbench.addCSS = function (text: string, ...args: any[]) {
        // Theme variables live on body in 5.1; resolving them on :root
        // produces an invalid inherited header background.
        if (text.startsWith(":root{--color-header-bg:"))
          text = text.replace(":root{", "body{");
        return css.call(this, text, ...args);
      };
      b.Blockbench.on = function (event: any, callback: any, ...args: any[]) {
        return on.call(
          this,
          event,
          function (this: any, ...values: any[]) {
            return scope(() => callback.apply(this, values));
          },
          ...args,
        );
      };
      try {
        return run();
      } finally {
        b.Blockbench.addCSS = css;
        b.Blockbench.on = on;
      }
    };
    const result = scope(() => load.apply(this, args));
    let active = true,
      closing = false;
    const updatePinIcons = () => {
      const tabs = b.document.querySelectorAll("#tab_bar_list > .project_tab");
      for (const [index, p] of b.Interface.tab_bar.tabs.entries()) {
        const tab = tabs[index];
        const icon = tab?.querySelector(".close_icon");
        if (icon)
          icon.textContent =
            b.settings.pin_tab?.value && p.pinned ? "push_pin" : "clear";
      }
    };
    const refreshIcons = () =>
      b.Vue.nextTick(() => {
        if (active) updatePinIcons();
      });
    const iconEvents = b.Blockbench.on(
      "select_project new_project close_project",
      refreshIcons,
    );
    const wrappedClose = function (this: any, force?: boolean, unpin = true) {
      if (
        active &&
        b.settings.pin_tab?.value &&
        !force &&
        unpin &&
        this.pinned
      ) {
        this.pinned = false;
        updatePinIcons();
        return Promise.resolve(false);
      }
      return close.call(this, force);
    };
    const refreshActions = () => {
      if (b.settings.pin_tab?.value)
        b.ModelProject.prototype.close = wrappedClose;
      else if (b.ModelProject.prototype.close === wrappedClose)
        b.ModelProject.prototype.close = close;
      for (const id of ["pin_tab", "unpin_tab"]) {
        const action = b.BarItems[id];
        if (!action) continue;
        action.click = () => {
          if (!b.Project) return;
          b.Project.pinned = id === "pin_tab";
          b.ModelProject.all.sort(
            (a: any, c: any) => Number(!!c.pinned) - Number(!!a.pinned),
          );
          b.Vue.nextTick(updatePinIcons);
        };
      }
      for (const id of [
        "close_all",
        "close_saved",
        "close_right",
        "close_others",
      ]) {
        const action = b.BarItems[id];
        if (!action) continue;
        action.click = () => {
          if (closing)
            throw new Fault(
              "TWEAKS_BUSY",
              "A project close sequence is already running",
            );
          const current = b.Project,
            all = [...b.ModelProject.all],
            index = all.indexOf(current);
          const targets = all.filter(
            (p: any, i: number) =>
              !p.pinned &&
              (id === "close_all" ||
                (id === "close_saved" && p.saved) ||
                (id === "close_right" && i > index) ||
                (id === "close_others" && p !== current)),
          );
          closing = true;
          const run = async () => {
            try {
              for (const p of targets) {
                if (!active || !b.settings.close_actions?.value) break;
                if (!b.ModelProject.all.includes(p) || p.pinned) continue;
                if ((await p.close(false, false)) === false) break;
              }
            } finally {
              closing = false;
            }
          };
          const pending = run();
          pending.catch((e: any) =>
            b.Blockbench.showQuickMessage(e.message, 6000),
          );
          return pending;
        };
      }
    };
    // The provider's hide hook dispatches Dialog.open, which may refer to
    // another dialog or be undefined. Dispatch the actual receiver instead.
    const installed = methods.map(([object, key], i) => {
      const wrapped = function (this: any, ...args: any[]) {
        if (!active) return originals[i].apply(this, args);
        if (i === 0) b.Blockbench.dispatchEvent("hide_dialog", this);
        const result = originals[i].apply(this, args);
        if (i === 1) b.Blockbench.dispatchEvent("show_dialog", this);
        if (i >= 2)
          b.Blockbench.dispatchEvent("profile_changed", {
            profile: b.SettingsProfile.selected,
          });
        return result;
      };
      object[key] = wrapped;
      return wrapped;
    });
    for (const id of [
      "pin_tab",
      "close_actions",
      "header_color",
      "wrap_tabs",
    ]) {
      const setting = b.settings[id],
        change = setting.onChange;
      setting.onChange = function (...args: any[]) {
        const result = scope(() => change.apply(this, args));
        refreshActions();
        return result;
      };
    }
    refreshActions();
    this.onunload = () => {
      if (!active) return;
      for (const id of [
        "pin_tab",
        "close_actions",
        "header_color",
        "wrap_tabs",
      ])
        if (b.settings[id])
          b.Settings.stored[id] = { value: b.settings[id].master_value };
      const current = methods.map(([o, k]) => o[k]),
        currentClose = b.ModelProject.prototype.close;
      nativeUnload.get(this)!.call(this);
      active = false;
      iconEvents.delete();
      methods.forEach(
        ([o, k], i) =>
          (o[k] = current[i] === installed[i] ? originals[i] : current[i]),
      );
      b.ModelProject.prototype.close =
        currentClose === wrappedClose ? close : currentClose;
      for (const p of b.ModelProject.all) {
        const d = pinned.get(p);
        if (d) Object.defineProperty(p, "pinned", d);
        else delete p.pinned;
      }
      updatePinIcons();
    };
    return result;
  };
  proto.runOnLoad = loaded;
  return () => {
    if (proto.runOnLoad === loaded) proto.runOnLoad = load;
  };
}
