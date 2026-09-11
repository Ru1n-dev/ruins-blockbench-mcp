import type { BB } from "./adapter.ts";
import { Fault } from "../shared/types.ts";

const root =
  "https://raw.githubusercontent.com/ewanhowell5195/previewSceneCustomiser/main";
export function installSceneStore(
  b: BB,
  active: () => boolean,
  dialogs: Set<any>,
  install: (model: any, args?: any) => void,
) {
  const requests = new Set<AbortController>();
  const fetchJSON = async (url: string, limit: number) => {
    const controller = new AbortController();
    requests.add(controller);
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await b.fetch(url, { signal: controller.signal });
      if (!response.ok || !response.body)
        throw new Fault(
          "SCENE_NETWORK",
          `Scene download failed (${response.status})`,
        );
      const reader = response.body.getReader(),
        chunks: Uint8Array[] = [];
      let size = 0;
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          size += value.length;
          if (size > limit) {
            await reader.cancel();
            throw new Fault(
              "SCENE_SIZE",
              "Downloaded scene data exceeds the size limit",
            );
          }
          chunks.push(value);
        }
      } finally {
        reader.releaseLock();
      }
      if (!active())
        throw new Fault("STALE_STATE", "Preview Scene Customiser was unloaded");
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.length;
      }
      return JSON.parse(new TextDecoder().decode(bytes));
    } finally {
      clearTimeout(timeout);
      requests.delete(controller);
    }
  };
  b.BarItems.download_preview_scene_models.click = async () => {
    const categories = await fetchJSON(`${root}/scenes.json`, 1000000);
    if (!Array.isArray(categories) || categories.length > 100)
      throw new Fault("SCENE_CATALOG", "Invalid scene catalog");
    const scenes: any[] = [];
    for (const category of categories) {
      if (
        !category ||
        typeof category.id !== "string" ||
        !/^[a-z0-9_-]{1,64}$/.test(category.id) ||
        !Array.isArray(category.scenes)
      )
        throw new Fault("SCENE_CATALOG", "Invalid scene category");
      for (const item of category.scenes) {
        if (
          !item ||
          typeof item.id !== "string" ||
          (item.eula !== undefined && typeof item.eula !== "boolean") ||
          !/^[a-z0-9_-]{1,120}$/.test(item.id) ||
          scenes.some((s) => s.id === item.id) ||
          scenes.length >= 1000
        )
          throw new Fault("SCENE_CATALOG", "Invalid or duplicate scene ID");
        scenes.push({
          ...item,
          name:
            typeof item.name === "string"
              ? item.name
              : item.id.replace(/_/g, " "),
          category: category.id,
        });
      }
    }
    if (!scenes.length)
      throw new Fault("SCENE_CATALOG", "The scene catalog is empty");
    const dialog = new b.Dialog("pbmc_preview_scene_store", {
      title: "Preview Scene Store",
      form: {
        scene: {
          label: "Scene",
          type: "select",
          options: Object.fromEntries(
            scenes.map((s) => [
              s.id,
              `${s.category}: ${s.name}${typeof s.author === "string" ? ` (${s.author})` : ""}`,
            ]),
          ),
          value: scenes[0].id,
        },
      },
      onConfirm: async (values: any) => {
        const item = scenes.find((s) => s.id === values.scene);
        if (!item)
          throw new Fault("SCENE_CATALOG", "Select a scene from this catalog");
        const model = await fetchJSON(
          `${root}/scenes/${item.id}/scene.bbscene`,
          32000000,
        );
        install(model, {
          name: item.name,
          category: item.category,
          eula: item.eula === true,
        });
      },
    });
    dialogs.add(dialog);
    dialog.show();
  };
  return () => {
    for (const request of requests) request.abort();
    requests.clear();
  };
}
