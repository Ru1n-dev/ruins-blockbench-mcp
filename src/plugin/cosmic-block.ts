import { z } from "zod";
import type { BB } from "./adapter.ts";
import { Fault } from "../shared/types.ts";
export const cosmicFaces: Record<string, string> = {
  up: "localPosY",
  down: "localNegY",
  north: "localNegZ",
  south: "localPosZ",
  east: "localPosX",
  west: "localNegX",
};
const faces = z.enum([
  "localPosY",
  "localNegY",
  "localNegZ",
  "localPosZ",
  "localPosX",
  "localNegX",
]);
const face = z.object({
  uv: z.tuple([z.number(), z.number(), z.number(), z.number()]),
  ambientocclusion: z.boolean().optional(),
  cullFace: z.boolean().optional(),
  texture: z.string().optional(),
  uvRotation: z
    .union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)])
    .optional(),
});
const schema = z.object({
  textures: z
    .record(z.string(), z.object({ fileName: z.string().min(1) }))
    .default({}),
  cuboids: z
    .array(
      z.object({
        localBounds: z.tuple([
          z.number(),
          z.number(),
          z.number(),
          z.number(),
          z.number(),
          z.number(),
        ]),
        faces: z.partialRecord(faces, face),
      }),
    )
    .max(10000)
    .optional(),
  parent: z.string().min(1).optional(),
  isTransparent: z.boolean().optional(),
  cullsSelf: z.boolean().optional(),
});
export function cosmicBlockData(input: any) {
  const result = schema.safeParse(
    typeof input === "string" ? JSON.parse(input) : input,
  );
  if (!result.success)
    throw new Fault(
      "COSMIC_DATA",
      result.error.issues
        .map((i) => i.path.join(".") + ": " + i.message)
        .slice(0, 4)
        .join("; "),
    );
  return result.data;
}
export function compileCosmicBlock(b: BB, options: any = {}) {
  const textures: any = Object.create(null),
    cuboids: any[] = [],
    settings = b.Project.pbmc_cosmic_properties || {};
  for (const node of b.Outliner.elements) {
    let excluded = false;
    for (let p: any = node; p && p !== "root"; p = p.parent)
      if (p.export === false) excluded = true;
    if (excluded) continue;
    if (node.type !== "cube")
      throw new Fault("COSMIC_NODE", "Cosmic Reach block models support cubes");
    for (let p: any = node; p && p !== "root"; p = p.parent)
      if (p.rotation?.some((v: number) => v !== 0))
        throw new Fault(
          "COSMIC_ROTATION",
          "Block cuboids must be axis aligned",
        );
    const faces: any = Object.create(null);
    for (const [side, key] of Object.entries(cosmicFaces)) {
      const face = node.faces[side];
      if (face.texture === null) continue;
      const texture = face.getTexture?.(),
        name = texture?.name || face.pbmc_cosmic_texture;
      faces[key] = {
        uv: face.uv.slice(),
        ambientocclusion: face.tint === 0,
        cullFace: !!face.cullface,
        uvRotation: face.rotation,
      };
      if (name) {
        textures[name] = { fileName: name };
        faces[key].texture = name;
      }
    }
    cuboids.push({
      localBounds: [
        ...node.from.map((n: number) => n - node.inflate),
        ...node.to.map((n: number) => n + node.inflate),
      ],
      faces,
    });
  }
  const result: any = {
    textures,
    cuboids,
    isTransparent: settings.isTransparent ?? false,
    cullsSelf: settings.cullsSelf ?? true,
  };
  if (options.parent) {
    delete result.cuboids;
    result.parent = options.parent;
  }
  cosmicBlockData(result);
  return result;
}
export function importCosmicBlock(b: BB, input: any) {
  const data = cosmicBlockData(input);
  if (!data.cuboids)
    throw new Fault(
      "COSMIC_PARENT",
      "Resolve the parent model before importing its cuboids",
    );
  const elements: any[] = [];
  b.Undo.initEdit({
    elements,
    outliner: true,
    selection: true,
    pbmc_cosmic: true,
  });
  try {
    for (const c of data.cuboids) {
      const cube = new b.Cube({
        from: c.localBounds.slice(0, 3),
        to: c.localBounds.slice(3, 6),
        box_uv: false,
      });
      for (const [side, key] of Object.entries(cosmicFaces)) {
        const f = (c.faces as any)[key],
          face = cube.faces[side];
        if (!f) {
          face.texture = null;
          continue;
        }
        face.uv = f.uv.slice();
        face.rotation = f.uvRotation || 0;
        face.tint = f.ambientocclusion ? 0 : -1;
        face.cullface = f.cullFace ? side : "";
        const texture =
          data.textures.all ||
          (f.texture === undefined ? undefined : data.textures[f.texture]);
        const name = texture?.fileName || f.texture || "";
        face.pbmc_cosmic_texture = name;
        face.texture =
          b.Texture.all.find((t: any) => t.name === name)?.uuid || false;
      }
      cube.init().addTo(b.getCurrentGroup());
      elements.push(cube);
    }
    b.Project.pbmc_cosmic_properties = {
      isTransparent: data.isTransparent ?? false,
      cullsSelf: data.cullsSelf ?? true,
    };
    b.Canvas.updateAll();
    b.updateSelection();
    b.Undo.finishEdit("Import Cosmic Reach block model");
  } catch (error) {
    b.Undo.cancelEdit(true);
    throw error;
  }
}
