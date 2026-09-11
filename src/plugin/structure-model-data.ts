import { Fault } from "../shared/types.ts";
export function validateStructureModel(model: any) {
  const fail = (): never => {
    throw new Fault(
      "STM_MODEL",
      "Malformed block model coordinates, faces, textures, or rotation",
    );
  };
  const object = (v: any) => v && typeof v === "object" && !Array.isArray(v);
  const vector = (v: any, n: number) =>
    Array.isArray(v) &&
    v.length === n &&
    v.every(
      (x) =>
        typeof x === "number" && Number.isFinite(x) && Math.abs(x) <= 1_000_000,
    );
  if (
    !object(model) ||
    (model.parent !== undefined && typeof model.parent !== "string")
  )
    fail();
  if (
    model.textures !== undefined &&
    (!object(model.textures) ||
      !Object.values(model.textures).every((v) => typeof v === "string"))
  )
    fail();
  if (model.elements !== undefined) {
    if (!Array.isArray(model.elements) || model.elements.length > 4096) fail();
    for (const e of model.elements) {
      if (
        !object(e) ||
        !vector(e.from, 3) ||
        !vector(e.to, 3) ||
        e.from.some((n: number, i: number) => n > e.to[i])
      )
        fail();
      if (
        e.rotation &&
        (!object(e.rotation) ||
          !vector(e.rotation.origin, 3) ||
          !["x", "y", "z"].includes(e.rotation.axis) ||
          !Number.isFinite(e.rotation.angle))
      )
        fail();
      if (e.faces !== undefined) {
        if (!object(e.faces)) fail();
        for (const [side, f] of Object.entries(e.faces) as [string, any][]) {
          if (
            !["north", "south", "east", "west", "up", "down"].includes(side) ||
            !object(f) ||
            typeof f.texture !== "string" ||
            (f.uv !== undefined && !vector(f.uv, 4)) ||
            (f.rotation !== undefined &&
              ![0, 90, 180, 270].includes(f.rotation))
          )
            fail();
        }
      }
    }
  }
  return model;
}
