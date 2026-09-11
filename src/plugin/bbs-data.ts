import { z } from "zod";
import { Fault } from "../shared/types.ts";
import type { BB } from "./adapter.ts";
export const bbsSides: Record<string, string> = {
  north: "front",
  south: "back",
  west: "left",
  east: "right",
  up: "top",
  down: "bottom",
};
const vec = z.tuple([z.number(), z.number(), z.number()]);
const value = z.union([z.number(), z.string().max(4096)]);
const key = z.tuple([
  z.number().nonnegative(),
  z.enum(["linear", "step", "catmullrom", "bezier"]),
  value,
  value,
  value,
]);
const cube = z.object({
  origin: vec.optional(),
  from: vec,
  size: vec,
  rotate: vec.optional(),
  offset: z.number().optional(),
  uvs: z
    .partialRecord(
      z.enum(["front", "back", "left", "right", "top", "bottom"]),
      z.array(z.number()).min(4).max(5),
    )
    .optional(),
});
const mesh = z
  .object({
    origin: vec.optional(),
    rotate: vec.optional(),
    vertices: z.array(z.number()).max(900000),
    uvs: z.array(z.number()).max(600000),
  })
  .refine(
    (m) =>
      m.vertices.length % 9 === 0 &&
      m.uvs.length === (m.vertices.length / 3) * 2,
    "Triangle positions and UV counts must match",
  );
const group = z.object({
  origin: vec.optional(),
  rotate: vec.optional(),
  parent: z.string().optional(),
  cubes: z.array(cube).max(10000).optional(),
  meshes: z.array(mesh).max(10000).optional(),
});
const schema = z.object({
  version: z.string().optional(),
  model: z
    .object({
      texture: z.tuple([
        z.number().int().min(1).max(16384),
        z.number().int().min(1).max(16384),
      ]),
      groups: z.record(z.string(), group),
    })
    .optional(),
  animations: z
    .record(
      z.string(),
      z.object({
        duration: z.number().nonnegative(),
        groups: z.record(
          z.string(),
          z.object({
            translate: z.array(key).max(50000).optional(),
            rotate: z.array(key).max(50000).optional(),
            scale: z.array(key).max(50000).optional(),
          }),
        ),
      }),
    )
    .optional(),
});
export function validateBBS(input: any) {
  const parsed = schema.safeParse(input);
  if (!parsed.success)
    throw new Fault(
      "BBS_DATA",
      parsed.error.issues
        .map((i) => i.path.join(".") + ": " + i.message)
        .slice(0, 4)
        .join("; "),
    );
  const data = parsed.data;
  if (!data.model && !data.animations)
    throw new Fault("BBS_DATA", "Supply model or animation data");
  const groups = data.model?.groups || {},
    names = Object.keys(groups);
  if (names.length > 2000)
    throw new Fault("BBS_LIMIT", "At most 2000 groups are supported");
  const finished = new Set<string>();
  for (const name of names) {
    const chain = new Set<string>();
    let key: string | undefined = name;
    while (key !== undefined) {
      if (finished.has(key)) break;
      if (chain.has(key))
        throw new Fault("BBS_HIERARCHY", "Cyclic group hierarchy");
      if (!Object.hasOwn(groups, key))
        throw new Fault("BBS_HIERARCHY", "Missing parent group");
      chain.add(key);
      key = groups[key].parent;
    }
    for (const key of chain) finished.add(key);
  }
  return data;
}
export function bbsValue(b: BB, value: any, channel: string, axis: number) {
  let n =
    typeof value === "string" &&
    value.trim() !== "" &&
    Number.isFinite(Number(value))
      ? Number(value)
      : value;
  if (n === undefined || n === "") n = 0;
  if (
    (channel === "position" && axis === 0) ||
    (channel === "rotation" && axis < 2)
  )
    return typeof n === "number" ? -n : b.invertMolang(n);
  return n;
}
export function compileBBS(b: BB, options = { model: true, animations: true }) {
  const output: any = { version: "0.7.2", animations: {} };
  const textureIds = new Set<string>();
  const cube = (e: any) => {
    const data: any = {
      origin: e.origin.slice(),
      from: e.from.slice(),
      size: e.to.map((n: number, i: number) => n - e.from[i]),
      uvs: {},
    };
    if (e.inflate) data.offset = e.inflate;
    if (e.rotation.some((n: number) => n !== 0))
      data.rotate = e.rotation.slice();
    for (const [side, name] of Object.entries(bbsSides)) {
      const f = e.faces[side];
      if (f.texture !== null) {
        data.uvs[name] = [...f.uv, ...(f.rotation ? [f.rotation] : [])];
        if (typeof f.texture === "string") textureIds.add(f.texture);
      }
    }
    return data;
  };
  const mesh = (e: any) => {
    const data: any = { origin: e.origin.slice(), vertices: [], uvs: [] };
    if (e.rotation.some((n: number) => n !== 0))
      data.rotate = e.rotation.slice();
    for (const f of Object.values(e.faces) as any[]) {
      if (f.texture === null || f.vertices.length < 3) continue;
      const keys = f.getSortedVertices();
      if (keys.length > 4)
        throw new Fault(
          "BBS_FACE",
          "Only triangle and quad mesh faces are supported",
        );
      const triangles =
        keys.length === 4
          ? [keys[0], keys[1], keys[2], keys[0], keys[2], keys[3]]
          : keys;
      if (typeof f.texture === "string") textureIds.add(f.texture);
      for (const key of triangles) {
        data.vertices.push(...e.vertices[key]);
        data.uvs.push(...f.uv[key]);
      }
    }
    return data;
  };
  if (options.model) {
    const groups: any = Object.create(null),
      seen = new Set<string>();
    const add = (e: any, parent?: string) => {
      if (e.export === false) return;
      if (seen.has(e.name))
        throw new Fault("BBS_NAME", "Group names must be unique");
      seen.add(e.name);
      const data: any = { origin: e.origin.slice() };
      groups[e.name] = data;
      if (parent !== undefined) data.parent = parent;
      if (e.rotation.some((n: number) => n !== 0))
        data.rotate = e.rotation.slice();
      for (const child of e.children) {
        if (child.export === false) continue;
        if (child.type === "group") add(child, e.name);
        else if (child.type === "cube") (data.cubes ??= []).push(cube(child));
        else if (child.type === "mesh") (data.meshes ??= []).push(mesh(child));
        else throw new Fault("BBS_NODE", "BBS supports Cube and Mesh nodes");
      }
    };
    for (const root of b.Outliner.root) if (root.type === "group") add(root);
    const loose = b.Outliner.root.filter(
      (n: any) => n.type !== "group" && n.export !== false,
    );
    if (loose.length) {
      let name = "anchor";
      while (seen.has(name)) name += "_";
      add({ name, origin: [0, 0, 0], rotation: [0, 0, 0], children: loose });
    }
    const used = b.Texture.all.filter((t: any) => textureIds.has(t.uuid));
    const dimensions = used.map((t: any) => [t.getUVWidth(), t.getUVHeight()]);
    if (
      dimensions.some(
        (d: number[]) => d[0] !== dimensions[0][0] || d[1] !== dimensions[0][1],
      )
    )
      throw new Fault(
        "BBS_TEXTURE",
        "BBS requires matching texture UV dimensions",
      );
    output.model = {
      texture: dimensions[0] || [
        b.Project.texture_width,
        b.Project.texture_height,
      ],
      groups,
    };
  }
  if (options.animations)
    for (const animation of b.Animation.all) {
      if (Object.hasOwn(output.animations, animation.name))
        throw new Fault("BBS_NAME", "Animation names must be unique");
      const data: any = {
        duration: animation.length,
        groups: Object.create(null),
      };
      for (const animator of Object.values(animation.animators) as any[]) {
        if (animator.type !== "bone") continue;
        const g: any = {};
        for (const [channel, key] of Object.entries({
          position: "translate",
          rotation: "rotate",
          scale: "scale",
        }))
          if (animator[channel]?.length)
            g[key] = animator[channel]
              .slice()
              .sort((a: any, c: any) => a.time - c.time)
              .map((k: any) => [
                k.time,
                k.interpolation,
                ...["x", "y", "z"].map((axis, i) =>
                  bbsValue(b, k.data_points[0][axis], channel, i),
                ),
              ]);
        if (Object.keys(g).length) data.groups[animator.name] = g;
      }
      Object.defineProperty(output.animations, animation.name, {
        value: data,
        enumerable: true,
        configurable: true,
        writable: true,
      });
    }
  validateBBS(output);
  return output;
}
