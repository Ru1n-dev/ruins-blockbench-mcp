import type { BB } from "./adapter.ts";
import { Fault } from "../shared/types.ts";
import { bbsSides, bbsValue, validateBBS } from "./bbs-data.ts";

export function importBBS(b: BB, input: any) {
  const data = validateBBS(input),
    existing = new Map<string, any>();
  for (const g of b.Group.all) {
    if (existing.has(g.name))
      throw new Fault("BBS_NAME", "Existing group names must be unique");
    existing.set(g.name, g);
  }
  const modelGroups = data.model?.groups || {};
  for (const name of Object.keys(modelGroups))
    if (existing.has(name))
      throw new Fault(
        "BBS_NAME",
        "Imported groups conflict with existing group names",
      );
  for (const animation of Object.values(data.animations || {}))
    for (const name of Object.keys(animation.groups))
      if (!Object.hasOwn(modelGroups, name) && !existing.has(name))
        throw new Fault(
          "BBS_ANIMATION",
          "An animation refers to a missing group",
        );
  if (
    !b.Format.meshes &&
    Object.values(modelGroups).some((g) => g.meshes?.length)
  )
    throw new Fault("BBS_FORMAT", "Use a format that supports meshes");
  const elements: any[] = [],
    animations: any[] = [],
    groups = new Map(existing);
  b.Undo.initEdit({
    outliner: true,
    elements,
    animations,
    uv_mode: true,
    selection: true,
  });
  try {
    if (data.model) {
      [b.Project.texture_width, b.Project.texture_height] = data.model.texture;
      for (const [name, g] of Object.entries(modelGroups))
        groups.set(
          name,
          new b.Group({
            name,
            origin: g.origin || [0, 0, 0],
            rotation: g.rotate || [0, 0, 0],
          }).init(),
        );
      for (const [name, g] of Object.entries(modelGroups)) {
        const group = groups.get(name);
        if (g.parent !== undefined) group.addTo(groups.get(g.parent));
        for (const c of g.cubes || []) {
          const cube = new b.Cube({
            origin: c.origin || [0, 0, 0],
            from: c.from,
            to: c.from.map((n, i) => n + c.size[i]),
            rotation: c.rotate || [0, 0, 0],
            inflate: c.offset || 0,
            box_uv: false,
          });
          for (const [side, key] of Object.entries(bbsSides)) {
            const uv = c.uvs?.[key as keyof typeof c.uvs],
              face = cube.faces[side];
            face.texture = uv ? false : null;
            if (uv) {
              face.uv = uv.slice(0, 4);
              face.rotation = uv[4] || 0;
            }
          }
          cube.init().addTo(group);
          elements.push(cube);
        }
        for (const m of g.meshes || []) {
          const vertices: any = {},
            faces: any = {};
          for (let i = 0; i < m.vertices.length / 9; i++) {
            const keys = [0, 1, 2].map((j) => `${i}_${j}`),
              uv: any = {};
            keys.forEach((key, j) => {
              vertices[key] = m.vertices.slice(
                i * 9 + j * 3,
                i * 9 + j * 3 + 3,
              );
              uv[key] = m.uvs.slice(i * 6 + j * 2, i * 6 + j * 2 + 2);
            });
            faces["f" + i] = { vertices: keys, uv, texture: false };
          }
          const mesh = new b.Mesh({
            origin: m.origin || [0, 0, 0],
            rotation: m.rotate || [0, 0, 0],
            vertices,
            faces,
          })
            .init()
            .addTo(group);
          elements.push(mesh);
        }
      }
    }
    for (const [name, a] of Object.entries(data.animations || {})) {
      const animation = new b.Animation({ name, length: a.duration }).add();
      animations.push(animation);
      for (const [name, g] of Object.entries(a.groups)) {
        const group = groups.get(name),
          animator = animation.getBoneAnimator(group);
        for (const [key, channel] of Object.entries({
          translate: "position",
          rotate: "rotation",
          scale: "scale",
        }))
          for (const k of (g as any)[key] || []) {
            const values = k
              .slice(2)
              .map((v: any, i: number) => bbsValue(b, v, channel, i));
            animator.addKeyframe({
              channel,
              time: k[0],
              interpolation: k[1],
              data_points: [{ x: values[0], y: values[1], z: values[2] }],
            });
          }
      }
    }
    b.Canvas.updateAll();
    b.updateSelection();
    b.Undo.finishEdit("Import BBS model");
    return { elements: elements.length, animations: animations.length };
  } catch (error) {
    b.Undo.cancelEdit(true);
    throw error;
  }
}
