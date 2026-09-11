import type { BB } from "./adapter.ts";
export function installLegacyGecko(b: BB) {
  const proto = b.BBPlugin.prototype,
    installable = proto.isInstallable,
    alert = b.alert;
  const patched = function (this: any, ...args: any[]) {
    if (
      this.id === "animation_utils" &&
      this.version === "4.1.3" &&
      this.max_version === "5.0.0"
    ) {
      const maximum = this.max_version;
      this.max_version = "5.1.6";
      try {
        return installable.apply(this, args);
      } finally {
        this.max_version = maximum;
      }
    }
    return installable.apply(this, args);
  };
  const notify = function (this: any, message: any) {
    if (
      typeof message === "string" &&
      message.startsWith(
        "GeckoLib Animation Utils currently only supports Blockbench 4.12.0 - 5.0.0.",
      ) &&
      new Error().stack?.includes("(Plugin):animation_utils.js")
    ) {
      return b.Blockbench.showMessageBox({
        title: "GeckoLib Animation Utils compatibility",
        message,
      });
    }
    return alert.call(this, message);
  };
  proto.isInstallable = patched;
  b.alert = notify;
  return () => {
    if (proto.isInstallable === patched) proto.isInstallable = installable;
    if (b.alert === notify) b.alert = alert;
  };
}
