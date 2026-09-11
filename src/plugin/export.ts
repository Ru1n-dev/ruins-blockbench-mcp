import { Fault } from "../shared/types.ts";
import type { Adapter } from "./adapter.ts";

export async function compileForExport(
  adapter: Adapter,
  codec: string,
  options: Record<string, any>,
) {
  if (!["obj", "stl", "collada", "fbx", "gltf"].includes(codec))
    return adapter.compile(codec, options);
  const b = adapter.b,
    project = adapter.project(),
    ui = adapter.uiState();
  const frames = new Map<any, number>(
    b.Texture.all.map((t: any) => [t, t.currentFrame]),
  );
  const viewMode = b.BarItems.view_mode.value;
  const animatorIds = new Map<any, Set<string>>(
    b.Animation.all.map((a: any) => [a, new Set(Object.keys(a.animators))]),
  );
  b.Timeline.pause();
  try {
    const content = await adapter.compile(codec, options);
    adapter.project(project.uuid);
    return content;
  } finally {
    if (b.Project === project) {
      if (b.BarItems.view_mode.value !== viewMode) {
        b.BarItems.view_mode.set(viewMode);
        b.BarItems.view_mode.onChange();
      }
      for (const [texture, frame] of frames) texture.currentFrame = frame;
      b.TextureAnimator.update(
        [...frames.keys()].filter((t) => t.frameCount > 1),
      );
      adapter.restoreUI(ui);
      for (const [animation, ids] of animatorIds)
        for (const [id, animator] of Object.entries(animation.animators) as [
          string,
          any,
        ][])
          if (!ids.has(id) && animator.keyframes.length === 0)
            animation.removeAnimator(id);
      if (ui.timelinePlaying) b.Timeline.start();
    }
  }
}

export async function compileObjBundle(
  adapter: Adapter,
  options: Record<string, any>,
) {
  const b = adapter.b;
  if (!b.JSZip)
    throw new Fault("ZIP_UNAVAILABLE", "Blockbench ZIP support is unavailable");
  const files = await compileForExport(adapter, "obj", {
    ...options,
    all_files: true,
    mtl_name: "materials.mtl",
  });
  const archive = new b.JSZip();
  const names = new Map<string, string>();
  const entries = ["model.obj", "materials.mtl"];
  let size = files.obj.length + files.mtl.length;
  for (const [id, texture] of Object.entries(files.images) as [string, any][]) {
    if (!texture || typeof texture !== "object") continue;
    if (texture.error)
      throw new Fault(
        "TEXTURE_UNAVAILABLE",
        `OBJ material ${id} has an unavailable texture`,
      );
    const name = `texture-${names.size}.png`;
    names.set(id, name);
    const png = texture.canvas.toDataURL("image/png").split(",")[1];
    size += png.length;
    if (size > 48000000)
      throw new Fault("SIZE_LIMIT", "OBJ bundle source exceeds 48 MB");
    archive.file(name, png, { base64: true });
    entries.push(name);
  }
  let material = "";
  const mtl = files.mtl
    .split(/\r?\n/)
    .map((line: string) => {
      if (line.startsWith("newmtl m_")) material = line.slice(9);
      if (line.startsWith("map_Kd ") && names.has(material))
        return `map_Kd ${names.get(material)}`;
      return line;
    })
    .join("\n");
  archive.file("model.obj", files.obj);
  archive.file("materials.mtl", mtl);
  return {
    content: await archive.generateAsync({
      type: "base64",
      compression: "DEFLATE",
    }),
    encoding: "base64",
    extension: "zip",
    archive_entries: entries,
  };
}
