import { z } from "zod";
import type { BB } from "./adapter.ts";
import { Fault } from "../shared/types.ts";
const vector = z.tuple([z.number(), z.number(), z.number()]);
const schema = z.object({
  id: z.string().default("model"),
  texture_width: z.number().int().min(1).max(16384).default(16),
  texture_height: z.number().int().min(1).max(16384).default(16),
  textures: z.record(z.string(), z.string()).optional(),
  bones: z
    .array(
      z.object({
        name: z.string().min(1),
        parent: z.string().optional(),
        pivot: vector.default([0, 0, 0]),
        rotation: vector.optional(),
        cubes: z
          .array(
            z.object({
              origin: vector,
              size: vector,
              uv: z.tuple([z.number(), z.number()]),
              pivot: vector.optional(),
              rotation: vector.optional(),
              inflate: z.number().optional(),
            }),
          )
          .optional(),
      }),
    )
    .max(2000),
});
export function cosmicEntityData(input: any) {
  const result = schema.safeParse(
    typeof input === "string" ? JSON.parse(input) : input,
  );
  if (!result.success)
    throw new Fault(
      "COSMIC_ENTITY",
      result.error.issues
        .map((i) => i.path.join(".") + ": " + i.message)
        .slice(0, 4)
        .join("; "),
    );
  const data = result.data,
    bones = new Map(data.bones.map((b) => [b.name, b]));
  if (bones.size !== data.bones.length)
    throw new Fault("COSMIC_NAME", "Bone names must be unique");
  const done = new Set<string>();
  for (const bone of data.bones) {
    const chain = new Set<string>();
    let name: string | undefined = bone.name;
    while (name !== undefined && !done.has(name)) {
      if (chain.has(name) || !bones.has(name))
        throw new Fault("COSMIC_HIERARCHY", "Invalid parent bone hierarchy");
      chain.add(name);
      name = bones.get(name)!.parent;
    }
    for (const name of chain) done.add(name);
  }
  return data;
}
export function installCosmicEntity(
  b: BB,
  codec: any,
  format: any,
  isActive: () => boolean,
) {
  codec.compile = () => {
    const bones: any[] = [],
      seen = new Set<string>();
    const compile = (group: any, parent?: string) => {
      if (group.export === false) return;
      if (seen.has(group.name))
        throw new Fault("COSMIC_NAME", "Bone names must be unique");
      seen.add(group.name);
      const bone: any = { name: group.name, pivot: group.origin.slice() };
      bones.push(bone);
      if (parent !== undefined) bone.parent = parent;
      if (group.rotation.some((n: number) => n !== 0))
        bone.rotation = group.rotation.slice();
      for (const e of group.children) {
        if (e.export === false) continue;
        if (e.type === "group") {
          compile(e, group.name);
          continue;
        }
        if (e.type !== "cube")
          throw new Fault(
            "COSMIC_NODE",
            "Entity geometry currently supports Cube nodes",
          );
        if (!e.box_uv)
          throw new Fault(
            "COSMIC_UV",
            "Cosmic Reach entities require box UV mapping",
          );
        const cube: any = {
          origin: e.from.slice(),
          size: e.to.map((n: number, i: number) => n - e.from[i]),
          uv: e.uv_offset.slice(),
        };
        if (e.origin.some((n: number) => n !== 0))
          cube.pivot = e.origin.slice();
        if (e.rotation.some((n: number) => n !== 0))
          cube.rotation = e.rotation.slice();
        if (e.inflate) cube.inflate = e.inflate;
        (bone.cubes ??= []).push(cube);
      }
    };
    for (const root of b.Outliner.root)
      if (root.type === "group") compile(root);
    const loose = b.Outliner.root.filter(
      (n: any) => n.type !== "group" && n.export !== false,
    );
    if (loose.length) {
      let name = "anchor";
      while (seen.has(name)) name += "_";
      compile({
        name,
        origin: [0, 0, 0],
        rotation: [0, 0, 0],
        children: loose,
      });
    }
    const properties = b.Project.pbmc_cosmic_properties || {};
    const data = {
      id: properties.entityId || b.Project.name,
      texture_width: b.Project.texture_width,
      texture_height: b.Project.texture_height,
      bones,
      ...(properties.entityTextures
        ? { textures: properties.entityTextures }
        : {}),
    };
    cosmicEntityData(data);
    return JSON.stringify(data, null, 2);
  };
  codec.parse = (input: any) => {
    const data = cosmicEntityData(input);
    for (const bone of data.bones)
      if (b.Group.all.some((g: any) => g.name === bone.name))
        throw new Fault(
          "COSMIC_NAME",
          "Imported bones conflict with existing groups",
        );
    const elements: any[] = [],
      groups = new Map<string, any>();
    b.Undo.initEdit({
      elements,
      outliner: true,
      uv_mode: true,
      selection: true,
      pbmc_cosmic: true,
    });
    try {
      b.Project.texture_width = data.texture_width;
      b.Project.texture_height = data.texture_height;
      for (const bone of data.bones)
        groups.set(
          bone.name,
          new b.Group({
            name: bone.name,
            origin: bone.pivot,
            rotation: bone.rotation || [0, 0, 0],
          }).init(),
        );
      for (const bone of data.bones) {
        const group = groups.get(bone.name);
        if (bone.parent !== undefined) group.addTo(groups.get(bone.parent));
        for (const c of bone.cubes || []) {
          const cube = new b.Cube({
            from: c.origin,
            to: c.origin.map((n, i) => n + c.size[i]),
            origin: c.pivot || [0, 0, 0],
            rotation: c.rotation || [0, 0, 0],
            uv_offset: c.uv,
            box_uv: true,
            inflate: c.inflate || 0,
          })
            .init()
            .addTo(group);
          elements.push(cube);
        }
      }
      b.Project.pbmc_cosmic_properties = {
        ...b.Project.pbmc_cosmic_properties,
        entityId: data.id,
        entityTextures: data.textures,
      };
      if (!data.textures)
        delete b.Project.pbmc_cosmic_properties.entityTextures;
      b.Canvas.updateAll();
      b.updateSelection();
      b.Undo.finishEdit("Import Cosmic Reach entity");
    } catch (error) {
      b.Undo.cancelEdit(true);
      throw error;
    }
  };
  codec.load = (input: any, _file: any, options: any = {}) => {
    const data = cosmicEntityData(input);
    if (!options.import_to_current_project) b.newProject(format);
    return codec.parse(data);
  };
  codec.export = () =>
    b.Blockbench.export({
      type: "Cosmic Reach entity",
      extensions: ["json"],
      name: b.Project.name,
      content: codec.compile(),
      savetype: "text",
    });
  b.BarItems.export_cosmic_reach_entity_model.click = () => codec.export();
  b.BarItems.import_cosmic_reach_entity_model.click = () => {
    const owner = b.Project;
    return b.Blockbench.import(
      { extensions: ["json"], type: "Cosmic Reach entity", readtype: "text" },
      (files: any[]) => {
        if (!isActive() || b.Project !== owner)
          throw new Fault("STALE_STATE", "The entity import context changed");
        if (files?.[0]) return codec.parse(files[0].content);
      },
    );
  };
}
