const mime: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  bmp: "image/bmp",
  json: "application/json",
  bbmodel: "application/json",
  gltf: "model/gltf+json",
  glb: "model/gltf-binary",
  zip: "application/zip",
  mcpack: "application/zip",
  txt: "text/plain",
  js: "text/javascript",
  css: "text/css",
  mp4: "video/mp4",
  webm: "video/webm",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  ogg: "audio/ogg",
};
export function uiFileType(name: string) {
  return (
    mime[name.split(".").pop()!.toLowerCase()] ?? "application/octet-stream"
  );
}
export function acceptsUiFile(name: string, type: string, accept: string) {
  const tokens = accept
    .toLowerCase()
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return (
    !tokens.length ||
    tokens.some((token) =>
      token.startsWith(".")
        ? name.toLowerCase().endsWith(token)
        : token.endsWith("/*")
          ? type.startsWith(token.slice(0, -1))
          : type === token,
    )
  );
}
