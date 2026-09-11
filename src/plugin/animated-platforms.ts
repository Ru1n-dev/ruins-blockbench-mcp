import type { BB } from "./adapter.ts";
import { Fault } from "../shared/types.ts";

export function installAnimatedPlatforms(b: BB) {
  const proto = b.BBPlugin.prototype,
    load = proto.runOnLoad;
  const unloads = new WeakMap<object, Function>();
  const loaded = function (this: any, ...args: any[]) {
    if (this.id !== "animated_platforms" || this.version !== "1.0.0")
      return load.apply(this, args);
    if (!unloads.has(this)) unloads.set(this, this.onunload);
    const result = load.apply(this, args),
      dialogs = new Set<any>();
    let active = true;
    const dp = b.Dialog.prototype,
      show = dp.show;
    const shown = function (this: any, ...args: any[]) {
      const result = show.apply(this, args);
      if (this.id === "animated_platforms_panel") {
        const vue = this.content_vue;
        if (!dialogs.has(this) && vue?.chooseTexture) {
          const choose = vue.chooseTexture;
          vue.chooseTexture = () => {
            const inputProto = b.HTMLInputElement.prototype,
              click = inputProto.click,
              owner = b.Project;
            inputProto.click = function (...args: any[]) {
              if (this.type !== "file") return click.apply(this, args);
              const input = this;
              return b.Blockbench.import(
                {
                  type: "Platform texture",
                  extensions: ["png", "jpg", "jpeg", "webp", "gif", "bmp"],
                  readtype: "image",
                },
                (files: any[]) => {
                  if (!active || b.Project !== owner)
                    throw new Fault(
                      "STALE_STATE",
                      "The platform texture context changed",
                    );
                  const file = files?.[0];
                  if (!file) return;
                  const match = /^data:([^;]+);base64,(.+)$/.exec(file.content);
                  if (!match)
                    throw new Fault("IMAGE_DATA", "Import an embedded image");
                  const data = Uint8Array.from(atob(match[2]), (c) =>
                    c.charCodeAt(0),
                  );
                  const transfer = new b.DataTransfer();
                  transfer.items.add(
                    new b.File([data], file.name || "texture.png", {
                      type: match[1],
                    }),
                  );
                  input.files = transfer.files;
                  input.dispatchEvent(new b.Event("change", { bubbles: true }));
                },
              );
            };
            try {
              return choose();
            } finally {
              inputProto.click = click;
            }
          };
        }
        dialogs.add(this);
        for (const row of this.object.querySelectorAll(".mgp-row")) {
          const label = row.querySelector("label")?.textContent?.trim();
          if (label)
            for (const [index, input] of [
              ...row.querySelectorAll("input,select"),
            ].entries()) {
              const own = input.closest("label")?.textContent?.trim();
              input.setAttribute(
                "aria-label",
                label === "Flip"
                  ? `Flip ${index ? "Y" : "X"}`
                  : own || (index ? `${label} ${index + 1}` : label),
              );
            }
        }
      } else if (this.id?.includes("animated_platforms")) dialogs.add(this);
      return result;
    };
    dp.show = shown;
    this.onunload = () => {
      active = false;
      try {
        return unloads.get(this)!.call(this);
      } finally {
        if (dp.show === shown) dp.show = show;
        for (const dialog of dialogs) {
          dialog.hide();
          dialog.content_vue?.$destroy();
          dialog.delete();
        }
        dialogs.clear();
      }
    };
    return result;
  };
  proto.runOnLoad = loaded;
  return () => {
    if (proto.runOnLoad === loaded) proto.runOnLoad = load;
  };
}
