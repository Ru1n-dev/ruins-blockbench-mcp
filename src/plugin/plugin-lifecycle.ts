import type { BB } from "./adapter.ts";

// The pinned Transparency Fix leaves anonymous listeners and delayed work
// registered on unload. Own only resources created synchronously by its onload
// and those listeners; unrelated plugin callbacks are never wrapped.
export function installTransparencyLifecycle(
  b: BB,
  timers: any = window,
): () => void {
  const proto = b.BBPlugin.prototype;
  const originalLoad = proto.runOnLoad,
    originalUnload = proto.unload;
  const scopes = new Map<any, ReturnType<typeof createScope>>();
  function load(this: any, ...args: any[]) {
    if (
      !(this.id === "transparency_fix" && this.version === "2.1.0") &&
      !(this.id === "bone_view" && this.version === "1.0.0") &&
      !(this.id === "farsight" && this.version === "1.0.1") &&
      !(
        this.id === "collapsible_start_screen_categories" &&
        this.version === "1.1.0"
      )
    )
      return originalLoad.apply(this, args);
    scopes.get(this)?.stop();
    const scope = createScope(b, timers);
    scopes.set(this, scope);
    const original = this.onload;
    const wrapped = function (this: any, ...args: any[]) {
      return scope.run(() => original.apply(this, args));
    };
    this.onload = wrapped;
    try {
      return originalLoad.apply(this, args);
    } catch (error) {
      scope.stop();
      scopes.delete(this);
      throw error;
    } finally {
      if (this.onload === wrapped) this.onload = original;
    }
  }
  function unload(this: any, ...args: any[]) {
    scopes.get(this)?.stop();
    scopes.delete(this);
    return originalUnload.apply(this, args);
  }
  proto.runOnLoad = load;
  proto.unload = unload;
  return () => {
    if (proto.runOnLoad === load) proto.runOnLoad = originalLoad;
    if (proto.unload === unload) proto.unload = originalUnload;
    for (const scope of scopes.values()) scope.detach();
    scopes.clear();
  };
}

function createScope(b: BB, timers: any) {
  let active = true,
    detached = false;
  const pending = new Set<any>();
  const listeners: {
    event: string;
    callback: (...args: any[]) => any;
    wrapped: (...args: any[]) => any;
    remove: () => void;
  }[] = [];
  const clear = timers.clearTimeout.bind(timers);
  function run<T>(fn: () => T): T | undefined {
    if (!active) return;
    if (detached) return fn();
    const originalTimeout = timers.setTimeout;
    const originalOn = b.Blockbench.on;
    function schedule(callback: any, delay?: number, ...args: any[]) {
      if (typeof callback !== "function")
        return originalTimeout.call(timers, callback, delay, ...args);
      const id = originalTimeout.call(
        timers,
        () => {
          pending.delete(id);
          run(() => callback(...args));
        },
        delay,
      );
      pending.add(id);
      return id;
    }
    function on(this: any, event: string, callback: (...args: any[]) => any) {
      const wrapped = (...args: any[]) => run(() => callback(...args));
      const subscription = originalOn.call(this, event, wrapped);
      listeners.push({
        event,
        callback,
        wrapped,
        remove: () => subscription.delete(),
      });
      return subscription;
    }
    timers.setTimeout = schedule;
    b.Blockbench.on = on;
    try {
      return fn();
    } finally {
      if (timers.setTimeout === schedule) timers.setTimeout = originalTimeout;
      if (b.Blockbench.on === on) b.Blockbench.on = originalOn;
    }
  }
  return {
    run,
    stop() {
      active = false;
      for (const id of pending) clear(id);
      pending.clear();
      for (const listener of listeners) listener.remove();
      listeners.length = 0;
    },
    detach() {
      // Removing MCP must not silently disable another still-loaded plugin.
      detached = true;
      for (const listener of listeners) {
        listener.remove();
        b.Blockbench.on(listener.event, listener.callback);
      }
      listeners.length = 0;
      pending.clear();
    },
  };
}
