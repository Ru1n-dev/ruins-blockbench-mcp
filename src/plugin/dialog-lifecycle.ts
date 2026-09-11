import type { BB } from "./adapter.ts";
// 5.1.6 schedules dimensions after show(), but hide() may already destroy object.
export function installDialogLifecycle(b: BB) {
  const proto = b.Dialog.prototype,
    show = proto.show;
  const wrapped = function (this: any, ...args: any[]) {
    const dialog = this,
      timeout = b.setTimeout;
    b.setTimeout = function (callback: any, delay: any, ...values: any[]) {
      const source = typeof callback === "function" ? String(callback) : "";
      if (
        source.includes("--dialog-height") &&
        source.includes("--dialog-width")
      ) {
        const node = dialog.object;
        return timeout.call(
          b,
          () => {
            if (node?.isConnected && dialog.object === node)
              callback(...values);
          },
          delay,
        );
      }
      return timeout.call(b, callback, delay, ...values);
    };
    try {
      return show.apply(this, args);
    } finally {
      b.setTimeout = timeout;
    }
  };
  proto.show = wrapped;
  return () => {
    if (proto.show === wrapped) proto.show = show;
  };
}
