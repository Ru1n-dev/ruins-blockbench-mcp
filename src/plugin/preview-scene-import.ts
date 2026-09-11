import type { BB } from "./adapter.ts";
import { Fault } from "../shared/types.ts";
import { readPackedPng } from "./pbr-lab-codec.ts";

export function validatePreviewScene(b: BB, input: any) {
  const fail = () => {
    throw new Fault(
      "SCENE_DATA",
      "Invalid preview scene geometry, image or settings",
    );
  };
  if (!input || !Array.isArray(input.cubes) || input.cubes.length > 2000)
    fail();
  const vector = (value: any, size = 3) =>
    Array.isArray(value) &&
    value.length === size &&
    value.every(
      (n) =>
        typeof n === "number" && Number.isFinite(n) && Math.abs(n) <= 100000,
    );
  const model = JSON.parse(JSON.stringify(input));
  const textureSize = model.texture_size ?? [16, 16];
  if (
    !vector(textureSize, 2) ||
    textureSize.some((n: number) => !Number.isInteger(n) || n < 1 || n > 4096)
  )
    fail();
  for (const cube of model.cubes) {
    if (!cube || typeof cube !== "object" || Array.isArray(cube)) fail();
    if (
      !vector(cube.position) ||
      !vector(cube.size) ||
      cube.size.some((n: number) => n < 0) ||
      (cube.origin !== undefined && !vector(cube.origin)) ||
      (cube.rotation !== undefined && !vector(cube.rotation)) ||
      !cube.faces ||
      typeof cube.faces !== "object" ||
      Array.isArray(cube.faces)
    )
      fail();
    if (
      cube.name !== undefined &&
      (typeof cube.name !== "string" || cube.name.length > 160)
    )
      fail();
    for (const [key, face] of Object.entries(cube.faces) as [string, any][]) {
      if (
        !b.Canvas.face_order.includes(key) ||
        !face ||
        !vector(face.uv, 4) ||
        ![undefined, 0, 90, 180, 270].includes(face.rotation)
      )
        fail();
    }
  }
  if (model.texture !== undefined) {
    if (
      typeof model.texture !== "string" ||
      model.texture.length > 32000000 ||
      !/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(model.texture)
    )
      fail();
    readPackedPng(
      Uint8Array.from(b.atob(model.texture.split(",")[1]), (c: any) =>
        c.charCodeAt(0),
      ),
    );
  }
  const settings = model.settings ?? {};
  if (typeof settings !== "object" || Array.isArray(settings)) fail();
  for (const [key, allowed] of [
    ["renderSide", [0, 1, 2]],
    ["lightSide", [0, 1, 2, 3, 4, 5]],
  ] as const)
    if (
      settings[key] !== undefined &&
      !allowed.includes(settings[key] as never)
    )
      fail();
  for (const key of ["lightColour", "tintColour"])
    if (
      settings[key] !== undefined &&
      (typeof settings[key] !== "string" ||
        !/^#[a-fA-F0-9]{6}$/.test(settings[key]))
    )
      fail();
  if (settings.shading !== undefined && typeof settings.shading !== "boolean")
    fail();
  return model;
}

export function parsePreviewScene(b: BB, input: any) {
  const model = validatePreviewScene(b, input);
  const textureSize = model.texture_size ?? [16, 16],
    settings = model.settings ?? {};
  // Validate before creating a tab; parse is synchronous so legacy edit callbacks
  // operate on the newly created project instead of modifying the old tab.
  b.setupProject(b.Formats.preview_scene_model);
  const project = b.Project;
  project.texture_width = textureSize[0];
  project.texture_height = textureSize[1];
  if (typeof model.credit === "string") project.credit = model.credit;
  const fields = {
    renderSide: "render_side",
    lightSide: "light_side",
    lightColour: "light_colour",
    tintColour: "tint_colour",
    shading: "shading",
  };
  for (const [key, field] of Object.entries(fields))
    if (settings[key] !== undefined)
      project[`preview_scene_${field}`] = settings[key];
  const texture = model.texture
    ? new b.Texture({ name: "texture.png" })
        .fromDataURL(model.texture)
        .add(false)
    : undefined;
  for (const data of model.cubes) {
    // PreviewModel rotates XYZ; editor Cube rotates ZYX.
    const xyz = new b.THREE.Euler(
      ...(data.rotation ?? [0, 0, 0]).map((n: number) => (n * Math.PI) / 180),
      "XYZ",
    );
    const zyx = new b.THREE.Euler().setFromQuaternion(
      new b.THREE.Quaternion().setFromEuler(xyz),
      "ZYX",
    );
    const cube = new b.Cube({
      name: data.name || "cube",
      from: data.position,
      to: data.position.map((n: number, i: number) => n + data.size[i]),
      origin: data.origin ?? [0, 0, 0],
      rotation: [zyx.x, zyx.y, zyx.z].map((n) => (n * 180) / Math.PI),
      box_uv: false,
    });
    for (const key of b.Canvas.face_order)
      cube.faces[key].extend(
        data.faces[key]
          ? { ...data.faces[key], texture: texture?.uuid ?? false }
          : { texture: null, uv: [0, 0, 0, 0] },
      );
    cube.init();
  }
  b.Canvas.updateAll();
  b.updateSelection();
  return project;
}
