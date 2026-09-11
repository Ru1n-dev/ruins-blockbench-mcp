import type { BB } from "./adapter.ts";
export function installActivityTracker(b: BB) {
  const unloaders = new WeakMap<object, any>();
  const proto = b.BBPlugin.prototype,
    load = proto.runOnLoad;
  const states = new Map<any, () => void>();
  const loaded = function (this: any, ...args: any[]) {
    if (this.id !== "activity_tracker" || this.version !== "1.1.1")
      return load.apply(this, args);
    if (unloaders.has(this)) this.onunload = unloaders.get(this);
    states.get(this)?.();
    const prior = new Map(
      b.ModelProject.all.map((p: any) => [
        p,
        { clock: p.activity_tracker, session: p.activity_tracker_session },
      ]),
    );
    const NativeDialog = b.Dialog,
      on = b.Blockbench.on,
      add = b.addEventListener,
      interval = b.setInterval,
      timeout = b.setTimeout;
    let activity: any;
    const priorProperty = Object.getOwnPropertyDescriptor(b, "property");
    let ownedProperty: any;
    const DialogProxy = new Proxy(NativeDialog, {
      construct(target, args, newTarget) {
        const options = args[0];
        if (options?.id === "activity_tracker")
          activity = options.component.data().activity;
        if (options?.id === "activity_tracker_export")
          options.onOpen = function (this: any) {
            this.content_vue.clock = activity.clock;
          };
        if (options?.id === "activity_tracker_import") {
          const confirm = options.component.methods.confirm;
          options.component.methods.confirm = function (this: any) {
            this.seconds = Math.max(
              0,
              Math.min(9999999999, Math.floor(Number(this.seconds) || 0)),
            );
            const result = confirm.call(this);
            b.localStorage.setItem(
              "activity_tracker",
              JSON.stringify(activity),
            );
            return result;
          };
        }
        return Reflect.construct(target, args, newTarget);
      },
    });
    b.Dialog = DialogProxy;
    b.Blockbench.on = function (this: any, event: string, callback: any) {
      if (event === "select_project" && callback.name === "selectProject")
        return { delete() {} };
      return on.call(this, event, callback);
    };
    b.addEventListener = function (
      this: any,
      event: string,
      callback: any,
      ...rest: any[]
    ) {
      if (
        (event === "focus" && callback.name === "focus") ||
        (event === "blur" && callback.name === "blur")
      )
        return;
      return add.call(this, event, callback, ...rest);
    };
    b.setInterval = function (callback: any, ...rest: any[]) {
      if (String(callback).includes("activity.clock")) return 0;
      return interval.call(b, callback, ...rest);
    };
    b.setTimeout = function (callback: any, ...rest: any[]) {
      if (String(callback).includes("Project.activity_tracker_session"))
        return 0;
      return timeout.call(b, callback, ...rest);
    };
    let result;
    try {
      result = load.apply(this, args);
      ownedProperty = b.property;
    } finally {
      if (priorProperty) Object.defineProperty(b, "property", priorProperty);
      else delete b.property;
      b.Dialog = NativeDialog;
      b.Blockbench.on = on;
      b.addEventListener = add;
      b.setInterval = interval;
      b.setTimeout = timeout;
      for (const [p, values] of prior as Map<any, any>) {
        p.activity_tracker = Number.isFinite(values.clock) ? values.clock : 0;
        p.activity_tracker_session = Number.isFinite(values.session)
          ? values.session
          : p.activity_tracker;
      }
    }
    if (!activity) return result;
    let ticking: any,
      pause: any,
      focused = false;
    const initialized = new WeakSet<object>(b.ModelProject.all);
    const select = () => {
      const p = b.Project;
      if (p && !initialized.has(p)) {
        if (!Number.isFinite(p.activity_tracker)) p.activity_tracker = 0;
        p.activity_tracker_session = p.activity_tracker;
        initialized.add(p);
      }
    };
    const stop = () => {
      b.clearInterval(ticking);
      ticking = undefined;
    };
    const focus = () => {
      focused = true;
      b.clearTimeout(pause);
      if (ticking !== undefined) return;
      select();
      ticking = interval.call(
        b,
        () => {
          activity.clock += 1;
          select();
          if (b.Project) b.Project.activity_tracker += 1;
          b.localStorage.setItem("activity_tracker", JSON.stringify(activity));
        },
        1000,
      );
    };
    const blur = () => {
      focused = false;
      b.clearTimeout(pause);
      const policy =
        b.localStorage.getItem("activity_tracker_pause_lost_focus") ?? "0";
      if (policy === "never") return;
      const seconds = Math.max(0, Math.min(3600, Number(policy) || 0));
      pause = timeout.call(
        b,
        () => {
          if (!focused) stop();
        },
        seconds * 1000,
      );
    };
    const subscription = on.call(b.Blockbench, "select_project", select);
    add.call(b, "focus", focus);
    add.call(b, "blur", blur);
    focus();
    const cleanup = () => {
      stop();
      b.clearTimeout(pause);
      b.removeEventListener("focus", focus);
      b.removeEventListener("blur", blur);
      subscription.delete();
    };
    states.set(this, cleanup);
    const plugin = this,
      originalUnload = this.onunload;
    unloaders.set(this, originalUnload);
    let cleaned = false;
    this.onunload = function (this: any, ...values: any[]) {
      if (cleaned) return;
      cleaned = true;
      const nextLoad = this.onload;
      this.onload = function (this: any, ...nextArgs: any[]) {
        this.onunload = originalUnload;
        this.onload = nextLoad;
        return nextLoad.apply(this, nextArgs);
      };
      cleanup();
      states.delete(plugin);
      const previous = Object.getOwnPropertyDescriptor(b, "property");
      b.property = ownedProperty;
      try {
        return originalUnload.apply(this, values);
      } finally {
        if (previous) Object.defineProperty(b, "property", previous);
        else delete b.property;
      }
    };
    return result;
  };
  proto.runOnLoad = loaded;
  // A still-enabled provider retains its clock and owns the cleanup callback.
  return () => {
    if (proto.runOnLoad === loaded) proto.runOnLoad = load;
    states.clear();
  };
}
