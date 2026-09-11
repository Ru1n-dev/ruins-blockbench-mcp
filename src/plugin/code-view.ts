import type { BB } from "./adapter.ts";
import { Fault } from "../shared/types.ts";
export function installCodeView(b: BB) {
  let restore: (() => void) | undefined;
  function sync(plugin: any, unloaded = false) {
    if (plugin?.id !== "code_view" || plugin.version !== "1.0.1") return;
    restore?.();
    restore = undefined;
    if (unloaded) return;
    let active = true,
      generation = 0;
    const action = b.BarItems.open_code_view,
      original = action.onClick;
    const dialog = new b.Dialog("pbmc_code_view", {
      title: "Code View",
      resizable: true,
      width: 650,
      component: {
        components: { VuePrismEditor: b.VuePrismEditor },
        data: { text: "" },
        methods: {
          copyText() {
            return b.navigator.clipboard.writeText((this as any).text);
          },
        },
        template:
          '<div><vue-prism-editor id="code-view-output" v-model="text" language="json" style="height:25em" :line-numbers="true"/><button @click="copyText()" style="width:100%">Copy</button></div>',
      },
    });
    const click = async () => {
      const project = b.Project,
        token = ++generation,
        codec = b.Format?.codec;
      dialog.show();
      dialog.content_vue.text = "Loading…";
      try {
        let content = codec
          ? await codec.compile({ prevent_dialog: true })
          : "";
        if (content instanceof Blob) content = await content.arrayBuffer();
        if (content instanceof ArrayBuffer || ArrayBuffer.isView(content)) {
          const bytes =
            content instanceof ArrayBuffer
              ? new Uint8Array(content)
              : new Uint8Array(
                  content.buffer,
                  content.byteOffset,
                  content.byteLength,
                );
          if (bytes.length > 16000000)
            throw new Fault(
              "CODE_VIEW_SIZE",
              "Use bb_export for binary content larger than 16 MB",
            );
          let raw = "";
          for (let i = 0; i < bytes.length; i += 32768)
            raw += String.fromCharCode(...bytes.subarray(i, i + 32768));
          content = JSON.stringify(
            { encoding: "base64", extension: codec.extension, data: btoa(raw) },
            null,
            2,
          );
        } else if (typeof content !== "string")
          content = JSON.stringify(content ?? null, null, 2);
        if (content.length > 32000000)
          throw new Fault(
            "CODE_VIEW_SIZE",
            "Use bb_export for text larger than 32 million characters",
          );
        if (
          active &&
          token === generation &&
          b.Project === project &&
          b.Dialog.open === dialog
        )
          dialog.content_vue.text = content;
      } catch (error) {
        if (active && token === generation && b.Dialog.open === dialog)
          dialog.content_vue.text = `Unable to compile: ${error instanceof Error ? error.message : String(error)}`;
      }
    };
    action.onClick = click;
    restore = () => {
      active = false;
      generation++;
      if (b.Dialog.open === dialog) dialog.hide();
      dialog.delete();
      if (action.onClick === click) action.onClick = original;
    };
  }
  return { sync, dispose: () => restore?.() };
}
