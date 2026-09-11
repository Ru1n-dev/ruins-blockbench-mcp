import type { BB } from "./adapter.ts";
export function installScreencastKeys(b: BB) {
  const unloaders = new WeakMap<object, any>();
  const proto = b.BBPlugin.prototype,
    load = proto.runOnLoad;
  const loaded = function (this: any, ...args: any[]) {
    if (this.id !== "screencast_keys" || this.version !== "0.2.0")
      return load.apply(this, args);
    if (unloaders.has(this)) this.onunload = unloaders.get(this);
    const bindings: {
        target: any;
        event: string;
        callback: any;
        options: any;
      }[] = [],
      timers = new Set<any>();
    const oldScale = document.body.style.getPropertyValue(
        "--screencast-keys-scale",
      ),
      oldPriority = document.body.style.getPropertyPriority(
        "--screencast-keys-scale",
      );
    const oldAlias = Object.getOwnPropertyDescriptor(
      b.Keybind.prototype,
      "screencastOldIsTriggered",
    );
    const windowAdd = b.addEventListener,
      documentAdd = document.addEventListener;
    b.addEventListener = function (
      this: any,
      event: string,
      callback: any,
      options: any,
    ) {
      bindings.push({ target: b, event, callback, options });
      return windowAdd.call(this, event, callback, options);
    };
    document.addEventListener = function (
      this: any,
      event: string,
      callback: any,
      options: any,
    ) {
      bindings.push({ target: document, event, callback, options });
      return documentAdd.call(this, event, callback, options);
    };
    let result;
    try {
      result = load.apply(this, args);
    } finally {
      b.addEventListener = windowAdd;
      document.addEventListener = documentAdd;
    }
    const provider = b.Keybind.prototype.isTriggered,
      base = b.Keybind.prototype.screencastOldIsTriggered,
      nativeTimeout = b.setTimeout;
    let active = true;
    const patched = function (this: any, ...values: any[]) {
      if (!active) return base.apply(this, values);
      const previous = b.setTimeout,
        previousClear = b.clearTimeout;
      b.clearTimeout = function (id: any) {
        timers.delete(id);
        return previousClear.call(b, id);
      };
      b.setTimeout = function (callback: any, delay: any, ...values: any[]) {
        let id: any;
        id = nativeTimeout.call(
          b,
          () => {
            timers.delete(id);
            if (active) callback(...values);
          },
          delay,
        );
        timers.add(id);
        return id;
      };
      try {
        return provider.apply(this, values);
      } finally {
        b.setTimeout = previous;
        b.clearTimeout = previousClear;
      }
    };
    b.Keybind.prototype.isTriggered = patched;
    const nativeUnload = this.onunload,
      scale = b.settings.screencast_keys_scale;
    unloaders.set(this, nativeUnload);
    this.onunload = function (this: any, ...values: any[]) {
      if (!active) return;
      const nextLoad = this.onload;
      this.onload = function (this: any, ...nextArgs: any[]) {
        this.onunload = nativeUnload;
        this.onload = nextLoad;
        return nextLoad.apply(this, nextArgs);
      };
      active = false;
      for (const id of timers) b.clearTimeout(id);
      timers.clear();
      for (const binding of bindings)
        binding.target.removeEventListener(
          binding.event,
          binding.callback,
          binding.options,
        );
      const current = b.Keybind.prototype.isTriggered;
      try {
        return nativeUnload.apply(this, values);
      } finally {
        if (current !== patched) b.Keybind.prototype.isTriggered = current;
        if (oldAlias)
          Object.defineProperty(
            b.Keybind.prototype,
            "screencastOldIsTriggered",
            oldAlias,
          );
        else delete b.Keybind.prototype.screencastOldIsTriggered;
        if (b.settings.screencast_keys_scale === scale) scale.delete();
        if (oldScale)
          document.body.style.setProperty(
            "--screencast-keys-scale",
            oldScale,
            oldPriority,
          );
        else document.body.style.removeProperty("--screencast-keys-scale");
      }
    };
    return result;
  };
  proto.runOnLoad = loaded;
  return () => {
    if (proto.runOnLoad === loaded) proto.runOnLoad = load;
  };
}
