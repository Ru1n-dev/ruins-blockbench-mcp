import { Fault } from "../shared/types.ts";
export interface PackSkin {
  id: string;
  name: string;
  slim: boolean;
  free: boolean;
  png: string;
  geometry?: any;
  model_file?: string;
  texture_file?: string;
}
export function skinPackFiles(
  options: any,
  skins: PackSkin[],
  moduleUUID: string,
) {
  const fail = (message: string): never => {
    throw new Fault("SKIN_PACK_INPUT", message);
  };
  const identifier = (value: any) =>
    typeof value === "string" && /^[a-zA-Z0-9_-]+$/.test(value);
  const singleLine = (value: any) =>
    typeof value === "string" &&
    !/[\r\n\0]/.test(value) &&
    value.length <= 1000;
  const uuid = (value: any) =>
    typeof value === "string" &&
    /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(value);
  if (!identifier(options.id) || !singleLine(options.name))
    fail(
      "Use a pack identifier with letters, digits, underscores or hyphens and a single-line name",
    );
  if (
    !uuid(options.uuid) ||
    !uuid(moduleUUID) ||
    options.uuid.toLowerCase() === moduleUUID.toLowerCase()
  )
    fail("Header and module require different UUIDs");
  if (!["mcpack", "auger"].includes(options.type))
    fail("Unknown skin pack type");
  if (
    typeof options.version !== "string" ||
    !/^\d+(?:\.\d+){0,2}$/.test(options.version)
  )
    fail("Version must contain one to three nonnegative integers");
  const version = options.version.split(".").map(Number);
  while (version.length < 3) version.push(0);
  if (version.some((v: number) => !Number.isSafeInteger(v) || v > 2147483647))
    fail("Version component exceeds supported range");
  if (!skins.length || skins.length > 1000)
    fail("Select between 1 and 1000 skins");
  const ids = new Set<string>();
  let bytes = 0;
  for (const skin of skins) {
    if (
      typeof skin.png !== "string" ||
      !skin.png.length ||
      !/^[a-z\d+/]*={0,2}$/i.test(skin.png)
    )
      fail("Skin texture must contain base64 image data");
    if (
      !identifier(skin.id) ||
      ids.has(skin.id.toLowerCase()) ||
      !singleLine(skin.name)
    )
      fail(
        "Skin identifiers must be unique ignoring case and names must be single-line",
      );
    ids.add(skin.id.toLowerCase());
    bytes += skin.png.length;
  }
  if (bytes > 44000000) fail("Skin textures exceed approximately 32 MB");
  const prefix = options.type === "mcpack" ? "" : "Content/skin_pack/";
  const files: { path: string; content: string; base64?: boolean }[] = [];
  const add = (name: string, data: any) =>
    files.push({ path: prefix + name, content: JSON.stringify(data, null, 2) });
  const geometries: Record<string, any> = {},
    entries: any[] = [],
    config: any = {
      id: options.id,
      name: options.name,
      uuid: options.uuid,
      version: options.version,
      type: options.type,
      skins: {},
    };
  const translations = [`skinpack.${options.id}=${options.name}`];
  for (const skin of skins) {
    const geometry = skin.geometry
      ? `geometry.${options.id}.${skin.id}`
      : `geometry.humanoid.${skin.slim ? "customSlim" : "custom"}`;
    if (skin.geometry) geometries[geometry] = skin.geometry;
    entries.push({
      localization_name: skin.id,
      geometry,
      texture: skin.id + ".png",
      type: skin.free ? "free" : "paid",
    });
    files.push({
      path: prefix + skin.id + ".png",
      content: skin.png,
      base64: true,
    });
    translations.push(`skin.${options.id}.${skin.id}=${skin.name}`);
    config.skins[skin.id] = {
      export: true,
      slim: skin.slim,
      free: skin.free,
      name: skin.name,
      model_file: skin.model_file,
      texture_file: skin.texture_file,
    };
  }
  if (Object.keys(geometries).length) add("geometry.json", geometries);
  add("skins.json", {
    serialize_name: options.id,
    localization_name: options.id,
    skins: entries,
  });
  add("manifest.json", {
    format_version: 1,
    header: { name: options.name || "pack.name", version, uuid: options.uuid },
    modules: [{ version, type: "skin_pack", uuid: moduleUUID }],
  });
  add("texts/languages.json", ["en_US"]);
  files.push({
    path: prefix + "texts/en_US.lang",
    content: translations.join("\n"),
  });
  return { files, config };
}
