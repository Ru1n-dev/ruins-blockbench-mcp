import type { BB } from "./adapter.ts";

// Only redirect listeners registered by this pinned plugin's synchronous load.
// Its projection must run before Undo captures the post-edit mesh UVs.
export function installUVLockerLifecycle(b: BB): () => void {
  const proto = b.BBPlugin.prototype,
    original = proto.runOnLoad;
  const registrations = new Set<{ restore(): void; delete(): void }>();
  const load = function (this: any, ...args: any[]) {
    if (this.id !== "uv_locker" || this.version !== "1.0.0")
      return original.apply(this, args);
    const on = b.Blockbench.on;
    const wrappedOn = function (this: any, event: string, callback: any) {
      if (event !== "finished_edit") return on.call(this, event, callback);
      let subscription = on.call(this, "finish_edit", callback);
      const registration = {
        delete() {
          subscription.delete();
          registrations.delete(registration);
        },
        restore() {
          subscription.delete();
          subscription = on.call(b.Blockbench, event, callback);
        },
      };
      registrations.add(registration);
      return { delete: () => registration.delete() };
    };
    b.Blockbench.on = wrappedOn;
    try {
      return original.apply(this, args);
    } finally {
      if (b.Blockbench.on === wrappedOn) b.Blockbench.on = on;
    }
  };
  proto.runOnLoad = load;
  return () => {
    if (proto.runOnLoad === load) proto.runOnLoad = original;
    for (const registration of registrations) registration.restore();
    registrations.clear();
  };
}
