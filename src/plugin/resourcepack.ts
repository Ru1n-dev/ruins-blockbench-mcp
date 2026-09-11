import { Adapter, type BB } from "./adapter.ts";
import { Fault } from "../shared/types.ts";

export function resourcepackFiles(model: any, textures: any[], options: any) {
  const namespace = String(options.namespace),
    id = String(options.modelId);
  if (
    !/^[a-z0-9_.-]+$/.test(namespace) ||
    namespace === "." ||
    namespace === ".." ||
    !/^[a-z0-9_./-]+$/.test(id) ||
    id.split("/").some((s) => !s || s === "." || s === "..")
  )
    throw new Fault(
      "RESOURCEPACK_PATH",
      "Use a valid lowercase namespace and model resource path",
    );
  if (!["block", "item"].includes(options.modelType))
    throw new Fault("RESOURCEPACK_TYPE", "Select block or item");
  const version = Number(options.resourcepackVersion),
    time = Number(options.frameTime),
    start = Number(options.frameStart);
  if (
    !Number.isInteger(version) ||
    version < 1 ||
    !Number.isInteger(time) ||
    time < 1 ||
    !Number.isInteger(start) ||
    start < 0
  )
    throw new Fault(
      "RESOURCEPACK_OPTIONS",
      "Pack format, frame time and starting frame must be valid integers",
    );
  const result = JSON.parse(JSON.stringify(model)),
    used = new Set<string>();
  const files: { path: string; content: string; base64?: boolean }[] = [];
  result.textures ??= {};
  for (const texture of textures) {
    const stem =
      String(texture.name)
        .replace(/\.png$/i, "")
        .toLowerCase()
        .replace(/[^a-z0-9_.-]/g, "_")
        .replace(/^\.+$/, "_") || "texture";
    let name = stem,
      n = 2;
    while (used.has(name)) name = `${stem}_${n++}`;
    used.add(name);
    const resource = `${options.modelType}/${id}/${name}`,
      file = `assets/${namespace}/textures/${resource}.png`;
    files.push({ path: file, content: texture.png, base64: true });
    result.textures[texture.id] = `${namespace}:${resource}`;
    if (texture.particle) result.textures.particle = `${namespace}:${resource}`;
    if (options.enableAnimation && texture.frames > 1) {
      if (!Number.isInteger(texture.frames) || start >= texture.frames)
        throw new Fault(
          "RESOURCEPACK_FRAME",
          "Starting frame must be below every animated texture's frame count",
        );
      files.push({
        path: `${file}.mcmeta`,
        content: JSON.stringify({
          animation: {
            frametime: time,
            frames: Array.from(
              { length: texture.frames },
              (_, i) => (i + start) % texture.frames,
            ),
            interpolate: !!options.interpolate,
          },
        }),
      });
    }
  }
  result.credit = options.enableResourcepackCredits
    ? String(options.resourcepackCredits)
    : "";
  files.push({
    path: `assets/${namespace}/models/${options.modelType}/${id}.json`,
    content: JSON.stringify(result),
  });
  files.push({
    path: "pack.mcmeta",
    content: JSON.stringify({
      pack: {
        description: String(options.resourcepackDescription),
        pack_format: version,
      },
    }),
  });
  if (files.reduce((sum, file) => sum + file.content.length * 2, 0) > 32000000)
    throw new Fault(
      "RESOURCEPACK_LIMIT",
      "Resource pack source data exceeds 32 MB",
    );
  return files;
}

export function installResourcepack(b: BB) {
  const proto = b.BBPlugin.prototype,
    load = proto.runOnLoad;
  const loaded = function (this: any, ...args: any[]) {
    if (this.id !== "resourcepack_packager" || this.version !== "1.0.1")
      return load.apply(this, args);
    const remove = b.Dialog.prototype.delete;
    let dialog: any;
    // The provider passes Dialog.delete to its emitter without binding the Dialog.
    b.Dialog.prototype.delete = function (this: any, ...values: any[]) {
      return remove.apply(this instanceof b.Dialog ? this : dialog, values);
    };
    let result;
    try {
      result = load.apply(this, args);
    } finally {
      b.Dialog.prototype.delete = remove;
    }
    const action = b.BarItems["export-resourcepack-menu-action"],
      unload = this.onunload;
    dialog = action.exportResourcepackFormDialog;
    const confirm = dialog.onConfirm;
    let active = true;
    dialog.onConfirm = function (data: any) {
      if (!active)
        throw new Fault(
          "PLUGIN_UNLOADED",
          "Resourcepack Packager was unloaded",
        );
      const project = b.Project,
        adapter = new Adapter(b),
        fingerprint = adapter.fingerprint(),
        send = b.Blockbench.export;
      const files = resourcepackFiles(
        b.Codecs.java_block.compile({ raw: true, prevent_dialog: true }),
        b.Texture.all.map((t: any) => ({
          id: t.id,
          name: t.name,
          particle: t.particle,
          frames: t.frameCount || 1,
          png: t.getBase64(),
        })),
        data,
      );
      const run = async () => {
        const zip = new b.JSZip();
        for (const file of files)
          zip.file(file.path, file.content, { base64: !!file.base64 });
        const icon = await new Promise<string>((resolve, reject) => {
          const timer = b.setTimeout(
            () =>
              reject(
                new Fault("RESOURCEPACK_ICON", "Pack icon capture timed out"),
              ),
            10000,
          );
          try {
            b.Screencam.cleanCanvas(
              { width: 100, height: 100 },
              (url: string) => {
                b.clearTimeout(timer);
                resolve(url);
              },
            );
          } catch (error) {
            b.clearTimeout(timer);
            reject(error);
          }
        });
        if (!icon.startsWith("data:image/png;base64,"))
          throw new Fault("RESOURCEPACK_ICON", "Expected PNG pack icon");
        zip.file("pack.png", icon.split(",")[1], { base64: true });
        const content = await zip.generateAsync({
          type: "uint8array",
          compression: "DEFLATE",
        });
        if (
          !active ||
          b.Project !== project ||
          adapter.fingerprint() !== fingerprint
        )
          throw new Fault(
            "RESOURCEPACK_CHANGED",
            "Project or plugin changed while generating resource pack",
          );
        send({
          type: "Zip Archive",
          extensions: ["zip"],
          name: data.resourcepackName,
          content,
          savetype: "zip",
        });
      };
      this.hide();
      const task = run();
      task.catch((error: any) =>
        b.Blockbench.showQuickMessage(error.message, 6000),
      );
      return task;
    };
    this.onunload = function (this: any, ...values: any[]) {
      if (!active) return;
      active = false;
      const next = this.onload;
      this.onload = function (this: any, ...args: any[]) {
        this.onunload = unload;
        this.onload = next;
        return next.apply(this, args);
      };
      try {
        return unload.apply(this, values);
      } finally {
        dialog.onConfirm = confirm;
        if (b.Dialog.open === dialog) dialog.hide();
      }
    };
    return result;
  };
  proto.runOnLoad = loaded;
  return () => {
    if (proto.runOnLoad === loaded) proto.runOnLoad = load;
  };
}
