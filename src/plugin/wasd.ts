import type { BB } from "./adapter.ts";
// Own resources registered by the pinned provider, including its anonymous
// listeners. Its original unload calls an out-of-scope setupWASDMovement.
export function installWasd(b: BB) {
  const proto = b.BBPlugin.prototype,
    load = proto.runOnLoad;
  const loaded = function (this: any, ...args: any[]) {
    if (this.id !== "wasd_controls" || this.version !== "1.2.2")
      return load.apply(this, args);
    const actions = new Set(b.Keybinds.actions),
      settings = new Set(Object.values(b.settings));
    const viewMenu = b.MenuBar.menus.view,
      addMenu = viewMenu.addAction;
    const separator = new b.MenuSeparator("perfect_wasd");
    viewMenu.addAction = function (action: any, ...values: any[]) {
      return addMenu.call(this, action === "_" ? separator : action, ...values);
    };
    const bindings: Array<{ event: string; callback: any; options: any }> = [],
      subscriptions: any[] = [],
      timers: any[] = [];
    const zoom = new Map<any, boolean>(),
      distance = new Map<any, number>();
    const remember = () => {
      for (const p of b.Preview.all)
        if (!zoom.has(p)) {
          zoom.set(p, p.controls.enableZoom);
          distance.set(p, p.camera.position.distanceTo(p.controls.target));
        }
    };
    remember();
    let active = true,
      rightHeld = false;
    const add = document.addEventListener,
      on = b.Blockbench.on,
      interval = b.setInterval;
    const enabled = () =>
      active &&
      !!b.settings.wasd_enabled?.value &&
      (!b.settings.wasd_requires_hold_right_mouse?.value || rightHeld) &&
      !b.Dialog.open &&
      !b.getFocusedTextInput();
    const release = () => {
      for (const binding of bindings) {
        if (binding.event === "keyup")
          for (const key of b.Keybinds.actions.filter((a: any) =>
            a.id.startsWith("navigate_"),
          ))
            binding.callback({ which: key.keybind.key });
        if (binding.event === "mouseup") binding.callback({ button: 2 });
      }
    };
    document.addEventListener = function (
      event: any,
      callback: any,
      options: any,
    ) {
      if (event === "mousedown" || event === "mouseup") {
        const native = callback;
        callback = function (this: any, e: any) {
          if (e.button === 2) rightHeld = event === "mousedown";
          return native.call(this, e);
        };
      }
      bindings.push({ event, callback, options });
      return add.call(this, event, callback, options);
    };
    b.Blockbench.on = function (event: string, callback: any) {
      const sub = on.call(
        this,
        event,
        event === "press_key"
          ? (data: any) => {
              if (enabled()) callback(data);
            }
          : callback,
      );
      subscriptions.push(sub);
      return sub;
    };
    b.setInterval = function (callback: any, delay: any, ...values: any[]) {
      const id = interval.call(
        b,
        () => {
          remember();
          if (enabled()) callback(...values);
          else {
            release();
            for (const [p, value] of zoom) p.controls.enableZoom = value;
          }
        },
        delay,
      );
      timers.push(id);
      return id;
    };
    let result;
    try {
      result = load.apply(this, args);
    } finally {
      document.addEventListener = add;
      b.Blockbench.on = on;
      b.setInterval = interval;
      viewMenu.addAction = addMenu;
    }
    const ownedActions = b.Keybinds.actions.filter((a: any) => !actions.has(a)),
      ownedSettings = Object.values(b.settings).filter(
        (s) => !settings.has(s),
      ) as any[];
    b.addEventListener("blur", release);
    this.onunload = function () {
      if (!active) return;
      active = false;
      release();
      for (const id of timers) b.clearInterval(id);
      for (const binding of bindings)
        document.removeEventListener(
          binding.event,
          binding.callback,
          binding.options,
        );
      for (const sub of subscriptions) sub.delete();
      b.removeEventListener("blur", release);
      for (const a of ownedActions) a.delete();
      for (const s of ownedSettings) s.delete();
      viewMenu.structure.remove(separator);
      for (const [p, value] of zoom) {
        p.controls.enableZoom = value;
        if (b.Preview.all.includes(p)) {
          const direction = p.camera.getWorldDirection(new b.THREE.Vector3());
          p.controls.target
            .copy(p.camera.position)
            .addScaledVector(direction, distance.get(p) || 16);
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
