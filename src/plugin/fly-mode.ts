import type { BB } from "./adapter.ts";
import { Fault } from "../shared/types.ts";
export function installFlyMode(b: BB) {
  const unloads = new WeakMap<object, any>();
  const proto = b.BBPlugin.prototype,
    load = proto.runOnLoad;
  const loaded = function (this: any, ...args: any[]) {
    if (this.id !== "fly_mode" || this.version !== "1.0.0")
      return load.apply(this, args);
    if (!unloads.has(this)) unloads.set(this, this.onunload);
    const events: any[] = [],
      renders: any[] = [],
      doc = b.document,
      add = doc.addEventListener,
      listen = b.Blockbench.addListener;
    doc.addEventListener = function (
      type: string,
      callback: any,
      options: any,
    ) {
      events.push({ type, callback, options });
      return add.call(this, type, callback, options);
    };
    b.Blockbench.addListener = function (
      type: string,
      callback: any,
      ...args: any[]
    ) {
      if (type === "render_frame") renders.push(callback);
      return listen.call(this, type, callback, ...args);
    };
    let result;
    try {
      result = load.apply(this, args);
    } finally {
      doc.addEventListener = add;
      b.Blockbench.addListener = listen;
    }
    const unload = unloads.get(this),
      enabled = b.settings.fly_mode_enabled;
    let active = true,
      virtual = false,
      owner: any,
      project: any,
      controlsEnabled = true,
      previousEnabled: any,
      last = b.performance.now();
    const down = events.find((e) => e.type === "mousedown")?.callback,
      up = events.find((e) => e.type === "mouseup")?.callback;
    const remember = () => {
      if (owner) return;
      owner = b.Preview.selected;
      project = b.Project;
      controlsEnabled = owner.controls.enabled;
      last = b.performance.now();
    };
    const release = () => {
      const selected = b.Preview.selected;
      if (owner) b.Preview.selected = owner;
      try {
        up?.({ buttons: 0 });
        if (owner) owner.controls.enabled = controlsEnabled;
      } finally {
        b.Preview.selected = selected;
        owner = undefined;
        project = undefined;
        virtual = false;
        if (previousEnabled !== undefined) {
          enabled.value = previousEnabled;
          previousEnabled = undefined;
        }
      }
    };
    const inside = (event: any) => {
      const r = b.Preview.selected?.canvas.getBoundingClientRect();
      return (
        r &&
        event.clientX >= r.left &&
        event.clientX <= r.right &&
        event.clientY >= r.top &&
        event.clientY <= r.bottom
      );
    };
    for (const event of events) {
      if (!["mousedown", "mouseup", "mousemove", "wheel"].includes(event.type))
        continue;
      doc.removeEventListener(event.type, event.callback, event.options);
      event.wrapped = (e: any) => {
        if (!active) return;
        if (event.type === "mousedown") {
          if (
            virtual ||
            !(e.buttons & 2) ||
            !inside(e) ||
            !enabled.value ||
            b.Preview.selected.isOrtho ||
            b.Dialog.open
          )
            return;
          remember();
        }
        if (event.type === "mouseup") {
          if (!virtual) release();
          return;
        }
        if (
          (event.type === "mousemove" || event.type === "wheel") &&
          virtual &&
          !inside(e)
        )
          return;
        return event.callback(e);
      };
      add.call(doc, event.type, event.wrapped, event.options);
    }
    const render = () => {
      const now = b.performance.now(),
        dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
      last = now;
      if (!active || !owner) return;
      if (
        b.Project !== project ||
        b.Preview.selected !== owner ||
        !enabled.value ||
        b.Dialog.open ||
        b.getFocusedTextInput()
      ) {
        release();
        return;
      }
      const speed = b.settings.fly_mode_base_speed,
        value = speed.value;
      speed.value = (value * dt) / 0.01;
      try {
        for (const callback of renders) callback();
      } finally {
        speed.value = value;
      }
    };
    for (const callback of renders)
      b.Blockbench.removeListener("render_frame", callback);
    b.Blockbench.addListener("render_frame", render);
    const start = new b.Action("pbmc_fly_start", {
      name: "Start Fly Navigation",
      icon: "sports_esports",
      condition: () => !!b.Project && !b.Preview.selected?.isOrtho,
      click: async () => {
        release();
        remember();
        previousEnabled = enabled.value;
        enabled.value = true;
        virtual = true;
        const timer = b.setTimeout,
          lock = doc.body.requestPointerLock;
        let activate: any;
        b.setTimeout = function (callback: any, ms: number, ...args: any[]) {
          if (ms === 200) {
            activate = callback;
            return 0;
          }
          return timer.call(b, callback, ms, ...args);
        };
        try {
          down({ buttons: 2 });
        } finally {
          b.setTimeout = timer;
        }
        // Explicit MCP navigation uses the native math without acquiring an OS pointer lock.
        doc.body.requestPointerLock = () => Promise.resolve();
        try {
          if (!activate)
            throw new Fault(
              "FLY_ACTIVATION",
              "Fly activation callback unavailable",
            );
          activate();
        } finally {
          doc.body.requestPointerLock = lock;
        }
        await Promise.resolve();
        if (!active || !owner || owner.controls.enabled) {
          release();
          throw new Fault("FLY_ACTIVATION", "Fly navigation did not activate");
        }
        return { virtual_navigation: true, pointer_lock: false };
      },
    });
    const stop = new b.Action("pbmc_fly_stop", {
      name: "Stop Fly Navigation",
      icon: "stop",
      click: release,
    });
    const switched = b.Blockbench.on("select_project", release);
    const lockChanged = () => {
      if (!virtual && !doc.pointerLockElement) release();
    };
    b.addEventListener("blur", release);
    doc.addEventListener("pointerlockchange", lockChanged);
    this.onunload = function (...args: any[]) {
      if (!active) return;
      release();
      active = false;
      enabled.value = false;
      try {
        return unload.apply(this, args);
      } finally {
        for (const e of events)
          if (e.wrapped) doc.removeEventListener(e.type, e.wrapped, e.options);
        b.Blockbench.removeListener("render_frame", render);
        switched.delete();
        b.removeEventListener("blur", release);
        doc.removeEventListener("pointerlockchange", lockChanged);
        start.delete();
        stop.delete();
      }
    };
    return result;
  };
  proto.runOnLoad = loaded;
  return () => {
    if (proto.runOnLoad === loaded) proto.runOnLoad = load;
  };
}
