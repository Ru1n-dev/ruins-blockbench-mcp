import {rotateCubeUV} from './cube-uv-rotation.ts';
import {rotateMeshUV} from './uv-rotate.ts';
import {snapMeshUV} from './uv-snap.ts';
import {weldMeshUV} from './uv-weld.ts';
import {alignMeshUV} from './uv-align.ts';
import { projectMeshUV } from './uv-projection.ts';
import {decodeTextureSet} from './texture-set.ts';
import {retimeKeys} from './keyframe-retime.ts';
import {
  clone,
  Fault,
  stable,
  type AnimationData,
  type Change,
  type Domain,
  type Issue,
  type ModelState,
  type NodeData,
  type Plan,
  type Protection,
  type TextureData,
  type Vec2,
  type Vec3,
} from "./types.ts";
import {
  operationSchema,
  querySchema,
  templateSchema,
  type Operation,
} from "./schema.ts";

export function descendants(state: ModelState, roots: string[]): NodeData[] {
  const set = new Set(roots);
  let progress = true;
  while (progress) {
    progress = false;
    for (const n of state.nodes)
      if (n.parent && set.has(n.parent) && !set.has(n.id)) {
        set.add(n.id);
        progress = true;
      }
  }
  return state.nodes.filter((n) => set.has(n.id));
}
export function bounds(n: NodeData): { min: Vec3; max: Vec3 } | undefined {
  const vertices =
    n.type === "cube" && n.from && n.to
      ? [n.from, n.to]
      : n.vertices
        ? Object.values(n.vertices).map(
            (v) => v.map((x, i) => x + n.origin[i]) as Vec3,
          )
        : [];
  if (!vertices.length) return;
  return {
    min: [0, 1, 2].map((i) => Math.min(...vertices.map((v) => v[i]))) as Vec3,
    max: [0, 1, 2].map((i) => Math.max(...vertices.map((v) => v[i]))) as Vec3,
  };
}
function axisIndex(axis: string) {
  return "xyz".indexOf(axis);
}
function getNode(s: ModelState, id: string): NodeData {
  const n = s.nodes.find((n) => n.id === id);
  if (!n) throw new Fault("NOT_FOUND", `Node ${id} does not exist`);
  return n;
}
function getTexture(s: ModelState, id: string): TextureData {
  const t = s.textures.find((t) => t.id === id);
  if (!t) throw new Fault("NOT_FOUND", `Texture ${id} does not exist`);
  return t;
}
function getAnimation(s: ModelState, id: string): AnimationData {
  const a = s.animations.find((a) => a.id === id);
  if (!a) throw new Fault("NOT_FOUND", `Animation ${id} does not exist`);
  return a;
}
function requireFeature(
  s: ModelState,
  feature: keyof ModelState["capabilities"],
) {
  if (!s.capabilities[feature])
    throw new Fault(
      "UNSUPPORTED_FORMAT",
      `${s.format} does not support ${feature}`,
    );
}
function denyNonEditable(n: NodeData) {
  if (!["cube", "mesh", "group"].includes(n.type))
    throw new Fault(
      "UNSUPPORTED_ELEMENT",
      `Editing ${n.type} is not supported; it is preserved`,
    );
}
export function assertUnlocked(
  state: ModelState,
  locks: Protection[],
  nodeIds: string[],
  domains: Domain[],
) {
  for (const p of locks) {
    const protectedIds = new Set(
      p.descendants
        ? descendants(state, p.node_ids).map((n) => n.id)
        : p.node_ids,
    );
    if (
      p.domains.some((d) => domains.includes(d)) &&
      nodeIds.some((id) => protectedIds.has(id))
    )
      throw new Fault("PROTECTED", `Protected part: ${p.label}`, {
        protection: p.id,
        node_ids: nodeIds.filter((id) => protectedIds.has(id)),
        domains,
      });
  }
}
function assertNoRotatedHierarchy(s: ModelState, nodes: NodeData[]) {
  for (const n of nodes) {
    let cursor: NodeData | undefined = n;
    const seen = new Set<string>();
    while (cursor) {
      if (seen.has(cursor.id)) throw new Fault("CYCLE", "Outliner cycle");
      seen.add(cursor.id);
      if (cursor.rotation.some((v) => Math.abs(v) > 1e-6))
        throw new Fault(
          "ROTATED_COORDINATES",
          "This model-space alignment/scale/mirror operation requires unrotated nodes and ancestors. Use explicit cube/mesh transforms for rotated parts.",
          { id: cursor.id },
        );
      cursor = cursor.parent
        ? s.nodes.find((p) => p.id === cursor!.parent)
        : undefined;
    }
  }
}
function shift(n: NodeData, offset: Vec3) {
  n.origin = n.origin.map((v, i) => v + offset[i]) as Vec3;
  if (n.from) n.from = n.from.map((v, i) => v + offset[i]) as Vec3;
  if (n.to) n.to = n.to.map((v, i) => v + offset[i]) as Vec3;
}
function transformUV(
  n: NodeData,
  scale: [number, number],
  offset: [number, number],
  rotation = 0,
) {
  if (n.box_uv) {
    if (rotation || scale.some((v) => v !== 1))
      throw new Fault(
        "BOX_UV",
        "Box UV supports offset here; use explicit per-face UV for scale/rotation",
      );
    n.uv_offset = [
      (n.uv_offset?.[0] ?? 0) + offset[0],
      (n.uv_offset?.[1] ?? 0) + offset[1],
    ];
    return;
  }
  const r = (rotation * Math.PI) / 180;
  const point = (p: number[]) => {
    const x = p[0] * scale[0],
      y = p[1] * scale[1];
    return [
      x * Math.cos(r) - y * Math.sin(r) + offset[0],
      x * Math.sin(r) + y * Math.cos(r) + offset[1],
    ] as [number, number];
  };
  for (const f of Object.values(n.faces ?? {})) {
    if (Array.isArray(f.uv)) {
      // Cube rectangles stay rectangular; orientation is a separate face field.
      f.uv = f.uv.map((v, i) => v * scale[i % 2] + offset[i % 2]);
      if (rotation) f.rotation = ((f.rotation ?? 0) + rotation) % 360;
    } else for (const k in f.uv) f.uv[k] = point(f.uv[k]);
  }
}
function faceArea(n: NodeData, key: string): number {
  if (n.from && n.to) {
    const d = n.to.map((v, i) => Math.abs(v - n.from![i]));
    return key === "up" || key === "down"
      ? d[0] * d[2]
      : key === "east" || key === "west"
        ? d[1] * d[2]
        : d[0] * d[1];
  }
  const points =
    n.faces?.[key]?.vertices
      ?.map((k) => n.vertices?.[k])
      .filter((v): v is Vec3 => !!v) ?? [];
  let a = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const u = points[i].map((v, j) => v - points[0][j]),
      v = points[i + 1].map((v, j) => v - points[0][j]);
    a +=
      Math.hypot(
        u[1] * v[2] - u[2] * v[1],
        u[2] * v[0] - u[0] * v[2],
        u[0] * v[1] - u[1] * v[0],
      ) / 2;
  }
  return a;
}
function uvArea(
  uv: number[] | Record<string, [number, number]>,
  order?: string[],
) {
  if (Array.isArray(uv)) return Math.abs((uv[2] - uv[0]) * (uv[3] - uv[1]));
  const p = (order ?? Object.keys(uv)).map((k) => uv[k]);
  if (p.some((v) => !v)) return 0;
  return (
    Math.abs(
      p.reduce(
        (a, v, i) =>
          a + v[0] * p[(i + 1) % p.length][1] - v[1] * p[(i + 1) % p.length][0],
        0,
      ),
    ) / 2
  );
}
export function diff(before: ModelState, after: ModelState): Change[] {
  const changes: Change[] = [];
  for (const [kind, key] of [
    ["node", "nodes"],
    ["texture", "textures"],
    ["animation", "animations"],
    ["texture_group", "texture_groups"],
  ] as const) {
    const old = new Map((before[key]??[]).map((x) => [x.id, x]));
    for (const item of after[key]??[]) {
      const prev = old.get(item.id);
      old.delete(item.id);
      if (!prev) {
        changes.push({
          kind,
          id: item.id,
          action: "add",
          fields: Object.keys(item),
        });
        continue;
      }
      const fields = Array.from(
        new Set([...Object.keys(prev), ...Object.keys(item)]),
      ).filter((k) => stable((prev as any)[k]) !== stable((item as any)[k]));
      if (fields.length)
        changes.push({ kind, id: item.id, action: "update", fields });
    }
    for (const item of old.values())
      changes.push({ kind, id: item.id, action: "delete", fields: [] });
  }
  return changes;
}
export function query(state: ModelState, input: unknown) {
  const q = querySchema.parse(input);
  let nodes = q.descendant_of
    ? descendants(state, [q.descendant_of])
    : state.nodes;
  if (q.ids) nodes = nodes.filter((n) => q.ids!.includes(n.id));
  if (q.type) nodes = nodes.filter((n) => n.type === q.type);
  if (q.name_contains)
    nodes = nodes.filter((n) =>
      n.name.toLowerCase().includes(q.name_contains!.toLowerCase()),
    );
  if (q.texture)
    nodes = nodes.filter((n) =>
      Object.values(n.faces ?? {}).some(
        (f) => (f.resolved_texture ?? f.texture) === q.texture,
      ),
    );
  return {
    total: nodes.length,
    nodes: nodes.slice(q.offset, q.offset + q.limit),
    next_offset: q.offset + q.limit < nodes.length ? q.offset + q.limit : null,
  };
}
export function diagnose(s: ModelState): Issue[] {
  const result: Issue[] = [];
  const issue = (
    severity: Issue["severity"],
    code: string,
    message: string,
    ids: string[],
  ) => result.push({ severity, code, message, ids });
  const nodeMap = new Map(s.nodes.map((n) => [n.id, n]));
  const texMap = new Map(s.textures.map((t) => [t.id, t]));
  const seen = new Set<string>();
  for (const n of s.nodes) {
    if (seen.has(n.id))
      issue("error", "DUPLICATE_ID", "Duplicate node UUID", [n.id]);
    seen.add(n.id);
    if (n.parent && !nodeMap.has(n.parent))
      issue("error", "MISSING_PARENT", "Parent reference is missing", [
        n.id,
        n.parent,
      ]);
    if (n.type === "mesh" && !s.capabilities.meshes)
      issue("error", "FORMAT_MESH", "Mesh is unsupported in current format", [
        n.id,
      ]);
    if (n.type === "cube" && n.from && n.to) {
      if (!s.capabilities.rotate_cubes && n.rotation.some((v) => v !== 0))
        issue(
          "error",
          "FORMAT_ROTATION",
          "Cube rotation is unsupported in this format",
          [n.id],
        );
      if (n.from.some((v, i) => v > n.to![i]))
        issue("error", "INVERTED_CUBE", "Cube from exceeds to", [n.id]);
      const limits = s.capabilities.cube_limits;
      if (
        limits &&
        n.from.some(
          (v, i) =>
            (limits[0] !== null && v - (n.inflate ?? 0) < limits[0]) ||
            (limits[1] !== null && n.to![i] + (n.inflate ?? 0) > limits[1]),
        )
      )
        issue("error", "CUBE_LIMIT", "Cube exceeds format coordinate limits", [
          n.id,
        ]);
      if (
        s.capabilities.rotation_limit &&
        n.rotation.filter((v) => v !== 0).length > 1
      )
        issue(
          "error",
          "ROTATION_LIMIT",
          "Format permits rotation about only one axis",
          [n.id],
        );
      if (
        s.capabilities.rotation_limit &&
        n.rotation.some((v) => Math.abs(v) > 45)
      )
        issue(
          "error",
          "ROTATION_LIMIT",
          "Format limits rotation to ﾂｱ45 degrees",
          [n.id],
        );
      if (
        s.capabilities.rotation_snap &&
        n.rotation.some((v) => Math.abs(v / 22.5 - Math.round(v / 22.5)) > 1e-6)
      )
        issue(
          "error",
          "ROTATION_SNAP",
          "Format requires 22.5 degree rotation increments",
          [n.id],
        );
    }
    for (const [key, f] of Object.entries(n.faces ?? {})) {
      if (f.rotation && !s.capabilities.uv_rotation)
        issue(
          "error",
          "FORMAT_UV_ROTATION",
          "Face UV rotation is unsupported in this format",
          [n.id],
        );
      if (typeof f.texture === "string" && !texMap.has(f.texture))
        issue(
          "error",
          "MISSING_TEXTURE",
          `Face ${key} references a missing texture`,
          [n.id, f.texture],
        );
      if (f.vertices?.some((k) => !n.vertices?.[k]))
        issue(
          "error",
          "MISSING_VERTEX",
          `Face ${key} references a missing vertex`,
          [n.id],
        );
      if (f.vertices && f.vertices.length >= 3 && faceArea(n, key) < 1e-10)
        issue("warning", "ZERO_AREA", `Face ${key} has zero geometric area`, [
          n.id,
        ]);
      if (!f.resolved_texture && !f.texture)
        issue("info", "UNTEXTURED", `Face ${key} has no explicit texture`, [
          n.id,
        ]);
      const t = texMap.get(String(f.resolved_texture ?? f.texture));
      const points = Array.isArray(f.uv)
        ? [f.uv.slice(0, 2), f.uv.slice(2, 4)]
        : Object.values(f.uv);
      if (
        t &&
        points.some(
          (p) =>
            p[0] < 0 || p[1] < 0 || p[0] > t.uv_width || p[1] > t.uv_height,
        )
      )
        issue(
          "warning",
          "UV_OUTSIDE",
          `Face ${key} extends beyond UV canvas; wrapping may be intentional`,
          [n.id, t.id],
        );
    }
    let p = n.parent;
    const chain = new Set([n.id]);
    while (p) {
      if (chain.has(p)) {
        issue("error", "HIERARCHY_CYCLE", "Outliner contains a cycle", [n.id]);
        break;
      }
      chain.add(p);
      p = nodeMap.get(p)?.parent ?? null;
    }
  }
  for (const a of s.animations) {
    if (!s.capabilities.animation_mode)
      issue("error", "FORMAT_ANIMATION", "Animation unsupported by format", [
        a.id,
      ]);
    const times = new Set<string>();
    for (const k of a.keys) {
      if (!nodeMap.has(k.node) && !(k.node==='effects' && ['sound','particle','timeline'].includes(k.channel)))
        issue("error", "MISSING_BONE", "Keyframe target is missing", [
          a.id,
          k.id,
          k.node,
        ]);
      const key = `${k.node}:${k.channel}:${k.time}`;
      if (times.has(key))
        issue(
          "warning",
          "DUPLICATE_KEY_TIME",
          "Multiple keys share node/channel/time",
          [a.id, k.id],
        );
      times.add(key);
      if (k.time > a.length)
        issue(
          "warning",
          "KEY_AFTER_END",
          "Keyframe lies after animation length",
          [a.id, k.id],
        );
    }
    if (a.loop === "loop" && a.length > 0) {
      for (const node of new Set(a.keys.map((k) => k.node)))
        for (const channel of ["position", "rotation", "scale"]) {
          const ks = a.keys
            .filter((k) => k.node === node && k.channel === channel)
            .sort((a, b) => a.time - b.time);
          if (
            ks.length > 1 &&
            ks[0].time === 0 &&
            ks.at(-1)!.time === a.length &&
            stable(ks[0].data_points) !== stable(ks.at(-1)!.data_points)
          )
            issue(
              "warning",
              "LOOP_BOUNDARY",
              "Loop endpoint values differ; inspect frame sequence",
              [a.id, node],
            );
        }
    }
  }
  return result.slice(0, 1000);
}
export function planEdit(
  original: ModelState,
  raw: unknown[],
  locks: Protection[],
  uuid: () => string,
): Plan {
  const operations = raw.map((op) => operationSchema.parse(op));
  const state = clone(original);
  const created: Record<string, string> = {};
  const warnings: Issue[] = [];
  let rasterPixelBudget=0, paletteComparisonBudget=0;
  const resolve = (id: string) => {
    if (id.startsWith("$")) {
      if (!created[id.slice(1)])
        throw new Fault("UNKNOWN_REFERENCE", `Unknown batch reference ${id}`);
      return created[id.slice(1)];
    }
    return id;
  };
  const newId = (ref?: string) => {
    const id = uuid();
    if (ref) {
      if (created[ref])
        throw new Fault("DUPLICATE_REFERENCE", `Duplicate ref ${ref}`);
      created[ref] = id;
    }
    return id;
  };
  const nodesFor = (ids: string[], domain: Domain[], expand = true) => {
    const resolved = ids.map(resolve);
    resolved.forEach((id) => getNode(state, id));
    const ns = expand
      ? descendants(state, resolved)
      : resolved.map((id) => getNode(state, id));
    ns.forEach(denyNonEditable);
    assertUnlocked(
      state,
      locks,
      ns.map((n) => n.id),
      domain,
    );
    return ns;
  };
  const textureAccess = (id: string, domains: Domain[] = ["texture"]) => {
    const t = getTexture(state, resolve(id));
    if (t.sync_to_project)
      throw new Fault(
        "SHARED_TEXTURE",
        "Texture is synchronized to another project. Detach it before editing.",
      );
    const users = state.nodes.filter((n) =>
      Object.values(n.faces ?? {}).some(
        (f) => (f.resolved_texture ?? f.texture) === t.id,
      ),
    );
    assertUnlocked(
      state,
      locks,
      users.map((n) => n.id),
      domains,
    );
    return t;
  };
  const checkParent = (parent: string | null | undefined, allowArmature = false) => {
    if (!parent) return null;
    const p = getNode(state, resolve(parent));
    if (p.type !== "group" && !(allowArmature && p.type==='armature'))
      throw new Fault("INVALID_PARENT", allowArmature ? "Parent must be a group or armature" : "Parent must be a group");
    assertUnlocked(state, locks, [p.id], ["structure"]);
    return p.id;
  };
  for (const op of operations) {
    if (
      state.capabilities.edit_mode === false &&
      /^(cube|mesh|group|node|uv|armature|armature_bone)\./.test(op.op)
    )
      throw new Fault(
        "FORMAT_EDIT_MODE",
        "This format disables model and UV geometry editing",
      );
    switch (op.op) {
      case 'texture_set.import': {
        const decoded=decodeTextureSet(op.document),assigned=new Map<string,string>();
        const textures=decoded.references.map(({name,channel})=>{
          if(!Object.hasOwn(op.texture_bindings,name))throw new Fault('TEXTURE_BINDING_MISSING',`Bind referenced texture ${name} to a texture ID`);
          const texture=textureAccess(op.texture_bindings[name]);
          if(assigned.has(texture.id)&&assigned.get(texture.id)!==channel)throw new Fault('TEXTURE_CHANNEL_CONFLICT','A texture cannot serve multiple PBR channels in one group');
          assigned.set(texture.id,channel);return {texture,channel};
        });
        const group={id:newId(op.ref),name:op.name,is_material:true,material_config:decoded.config};
        (state.texture_groups??=[]).push(group);
        for(const {texture,channel} of textures){texture.group=group.id;texture.pbr_channel=channel;}
        break;
      }
      case 'texture_group.add':
        (state.texture_groups??=[]).push({id:newId(op.ref),name:op.name,is_material:op.is_material,
          material_config:{color_value:[255,255,255,255],mer_value:[0,0,0],subsurface_value:0,saved:true}});
        break;
      case 'texture_group.update':
      case 'texture_group.delete': {
        const id=resolve(op.id),group=state.texture_groups?.find(g=>g.id===id);
        if(!group) throw new Fault('NOT_FOUND','Texture group not found');
        for(const t of state.textures.filter(t=>t.group===id)) textureAccess(t.id);
        if(op.op==='texture_group.delete') {
          for(const t of state.textures.filter(t=>t.group===id)) t.group='';
          state.texture_groups=state.texture_groups!.filter(g=>g.id!==id);
        } else {
          if(op.name!==undefined)group.name=op.name;
          if(op.is_material!==undefined)group.is_material=op.is_material;
          for(const key of ['color_value','mer_value','subsurface_value'] as const)if(op[key]!==undefined) {
            (group.material_config as any)[key]=clone(op[key]);group.material_config.saved=false;
          }
        }
        break;
      }
      case 'armature.add': {
        requireFeature(state,'armature_rig');
        const parent = checkParent(op.parent);
        state.nodes.push({id:newId(op.ref),type:'armature',name:op.name,parent,origin:[0,0,0],rotation:[0,0,0],visibility:op.visibility,locked:op.locked,export:op.export});
        break;
      }
      case 'armature_bone.add': {
        requireFeature(state,'armature_rig');
        const parent = getNode(state,resolve(op.parent));
        if(!['armature','armature_bone'].includes(parent.type)) throw new Fault('INVALID_PARENT','Bone parent must be an armature or armature bone');
        let root=parent;const seen=new Set<string>();
        while(root.type!=='armature' && root.parent) {
          if(seen.has(root.id)) throw new Fault('INVALID_HIERARCHY','Cyclic armature hierarchy');
          seen.add(root.id);root=getNode(state,root.parent);
        }
        if(root.type!=='armature') throw new Fault('INVALID_HIERARCHY','Bone parent has no owning armature');
        assertUnlocked(state,locks,descendants(state,[root.id]).map(n=>n.id),['geometry','structure']);
        state.nodes.push({id:newId(op.ref),type:'armature_bone',name:op.name,parent:parent.id,
          origin:clone(op.origin??(parent.type==='armature_bone'?[0,parent.length??8,0]:[0,0,0])),rotation:clone(op.rotation??[0,0,0]),
          length:op.length??parent.length??8,width:op.width??parent.width??2,connected:op.connected,color:op.color,
          visibility:op.visibility,locked:op.locked,export:op.export,vertex_weights:{},animation_channels:['position','rotation','scale']});
        break;
      }
      case "cube.add":
      case "mesh.add":
      case "group.add": {
        if (op.op === "mesh.add") requireFeature(state, "meshes");
        const parent = checkParent(op.parent,op.op==='mesh.add');
        const type = op.op.split(".")[0];
        const n: NodeData = {
          id: newId(op.ref),
          type,
          name: op.name,
          parent,
          origin: clone(op.origin ?? [0, 0, 0]),
          rotation: clone(op.rotation ?? [0, 0, 0]),
          visibility: true,
        };
        if (op.op === "cube.add") {
          n.from = clone(op.from);
          n.to = clone(op.to);
          n.inflate = 0;
          n.box_uv = op.box_uv ?? state.capabilities.box_uv;
          n.uv_offset = [0, 0];
          n.mirror_uv = false;
          n.faces = Object.fromEntries(
            ["north", "south", "east", "west", "up", "down"].map((f) => [
              f,
              {
                uv: [
                  0,
                  0,
                  Math.abs(op.to[0] - op.from[0]),
                  Math.abs(op.to[1] - op.from[1]),
                ],
                texture: false,
              },
            ]),
          );
        }
        if (op.op === "mesh.add") {
          if (
            Object.keys(op.vertices).length > 20000 ||
            Object.keys(op.faces).length > 20000
          )
            throw new Fault(
              "SIZE_LIMIT",
              "Maximum 20000 vertices/faces per mesh",
            );
          n.vertices = clone(op.vertices);
          n.faces = clone(op.faces);
          for (const f of Object.values(n.faces)) {
            if (Array.isArray(f.uv) || !f.vertices)
              throw new Fault(
                "MESH_FACE",
                "Mesh faces require vertices and per-vertex UV",
              );
            if (typeof f.texture === "string") f.texture = resolve(f.texture);
          }
        }
        state.nodes.push(n);
        break;
      }
      case "cube.update":
      case "mesh.update":
      case "group.update": {
        const n = getNode(state, resolve(op.id));
        if (n.type !== op.op.split(".")[0])
          throw new Fault("TYPE_MISMATCH", `Expected ${op.op.split(".")[0]}`);
        const domains: Domain[] = [];
        if (
          [
            "origin",
            "rotation",
            "from",
            "to",
            "inflate",
            "visibility",
            "vertices",
          ].some((k) => k in op)
        )
          domains.push("geometry");
        if ("name" in op) domains.push("structure");
        if ("box_uv" in op || "uv_offset" in op || "mirror_uv" in op)
          domains.push("uv");
        if ("faces" in op) domains.push("uv", "texture");
        nodesFor([n.id], domains, n.type === "group");
        for (const [k, v] of Object.entries(op))
          if (k !== "op" && k !== "id" && v !== undefined)
            (n as any)[k] = clone(v);
        if (n.faces)
          for (const f of Object.values(n.faces))
            if (typeof f.texture === "string") f.texture = resolve(f.texture);
        break;
      }
      case "mesh.weights": {
        const seen = new Set<string>();
        const rootArmature = (start: NodeData) => {
          let current: NodeData | undefined = start;
          const visited = new Set<string>();
          while (current?.parent) {
            if (visited.has(current.id))
              throw new Fault("INVALID_HIERARCHY", "Cyclic mesh armature hierarchy");
            visited.add(current.id);
            current = state.nodes.find((node) => node.id === current!.parent);
          }
          return current?.type === "armature" ? current : undefined;
        };
        for (const entry of op.vertices) {
          const mesh = getNode(state, resolve(entry.mesh_id));
          if (mesh.type !== "mesh")
            throw new Fault("TYPE_MISMATCH", "Weight targets must reference mesh nodes");
          if (!mesh.vertices || !Object.hasOwn(mesh.vertices, entry.vertex_id))
            throw new Fault("WEIGHT_TARGET_INVALID", "Weight target vertex does not exist", {
              mesh_id: mesh.id,
              vertex_id: entry.vertex_id,
            });
          const key = `${mesh.id.slice(0, 6)}:${entry.vertex_id}`;
          if (seen.has(key))
            throw new Fault("WEIGHT_TARGET_DUPLICATE", "Each weight target vertex may occur only once", {
              mesh_id: mesh.id,
              vertex_id: entry.vertex_id,
            });
          seen.add(key);
          const armature = rootArmature(mesh);
          if (!armature)
            throw new Fault("WEIGHT_ARMATURE_MISSING", "Each weighted mesh must belong to an armature", {
              mesh_id: mesh.id,
            });
          const bones = state.nodes.filter(
            (node) => node.type === "armature_bone" && rootArmature(node)?.id === armature.id,
          );
          if (!bones.length)
            throw new Fault("WEIGHT_ARMATURE_MISSING", "Armature has no bones", { armature_id: armature.id });
          assertUnlocked(
            state,
            locks,
            [mesh.id, armature.id, ...bones.map((bone) => bone.id)],
            ["geometry"],
          );
          const values = Object.fromEntries(
            bones.map((bone) => [
              bone.id,
              op.mode === "merge" ? Number(bone.vertex_weights?.[key] ?? 0) : 0,
            ]),
          ) as Record<string, number>;
          for (const [rawBoneId, value] of Object.entries(entry.weights)) {
            const boneId = resolve(rawBoneId);
            const bone = bones.find((candidate) => candidate.id === boneId);
            if (!bone)
              throw new Fault("WEIGHT_BONE_INVALID", "Weight bone must belong to the mesh armature", {
                bone_id: boneId,
                armature_id: armature.id,
              });
            values[bone.id] = Number(value);
          }
          const sum = Object.values(values).reduce((total, value) => total + value, 0);
          if (op.normalize) {
            if (!Number.isFinite(sum) || sum <= 0)
              throw new Fault("WEIGHT_NORMALIZATION_INVALID", "Normalization requires a positive finite weight sum");
            for (const bone of bones) values[bone.id] /= sum;
          }
          for (const bone of bones) {
            bone.vertex_weights ??= {};
            bone.vertex_weights[key] = values[bone.id];
          }
        }
        break;
      }
      case "node.rename": {
        const n = nodesFor([op.id], ["structure"], false)[0];
        n.name = op.name;
        break;
      }
      case 'armature_bone.update': {
        const node = getNode(state,resolve(op.id));
        if (node.type !== 'armature_bone') throw new Fault('TYPE_MISMATCH','Expected armature_bone');
        let root = node;
        const visited = new Set<string>();
        while(root.type !== 'armature' && root.parent) {
          if(visited.has(root.id)) throw new Fault('INVALID_HIERARCHY','Cyclic armature hierarchy');
          visited.add(root.id);root=getNode(state,root.parent);
        }
        if(root.type !== 'armature') throw new Fault('INVALID_HIERARCHY','Bone has no owning armature');
        assertUnlocked(state,locks,descendants(state,[root.id]).map(n=>n.id),['geometry','structure']);
        for(const [key,value] of Object.entries(op))
          if(key!=='op' && key!=='id' && value!==undefined) (node as any)[key]=clone(value);
        break;
      }
      case 'armature.update': {
        const node=getNode(state,resolve(op.id));
        if(node.type!=='armature') throw new Fault('TYPE_MISMATCH','Expected armature');
        assertUnlocked(state,locks,descendants(state,[node.id]).map(n=>n.id),['geometry','structure']);
        for(const [key,value] of Object.entries(op))
          if(key!=='op' && key!=='id' && value!==undefined) (node as any)[key]=clone(value);
        break;
      }
      case 'spline.vertices': {
        const n=getNode(state,resolve(op.id));
        if(n.type!=='spline')throw new Fault('TYPE_MISMATCH','Control vertices require a spline');
        assertUnlocked(state,locks,[n.id],['geometry','uv']);
        for(const [id,position] of Object.entries(op.vertices)){
          if(!Object.hasOwn(n.native_copy?.vertices??{},id))throw new Fault('NOT_FOUND',`Unknown spline vertex ${id}`);
          n.native_copy!.vertices[id]=clone(position);
        }
        if(op.handle_mode!=='free')for(const h of Object.values(n.native_copy?.handles??{}) as any[]){
          for(const [active,opposite] of [[h.control1,h.control2],[h.control2,h.control1]]){
            if(!Object.hasOwn(op.vertices,active)||Object.hasOwn(op.vertices,opposite))continue;
            const vertices=n.native_copy!.vertices,joint=vertices[h.joint],control=vertices[active],peer=vertices[opposite];
            if(!joint||!control||!peer)throw new Fault('SPLINE_TOPOLOGY','Handle references a missing vertex');
            const direction=control.map((v:number,i:number)=>v-joint[i]),length=Math.hypot(...direction);
            if(op.handle_mode==='aligned'&&length===0)throw new Fault('SPLINE_HANDLE_DIRECTION','Aligned control must differ from its joint');
            const scale=op.handle_mode==='mirrored'?1:Math.hypot(...peer.map((v:number,i:number)=>v-joint[i]))/length;
            const next=joint.map((v:number,i:number)=>v-direction[i]*scale);
            if(next.some((v:number)=>!Number.isFinite(v)||Math.abs(v)>100000))throw new Fault('SPLINE_COORDINATE_RANGE','Coupled control exceeds coordinate bounds');
            vertices[opposite]=next;
          }
        }
        break;
      }
      case 'spline.handles': {
        const n=getNode(state,resolve(op.id));
        if(n.type!=='spline')throw new Fault('TYPE_MISMATCH','Handle settings require a spline');
        assertUnlocked(state,locks,[n.id],['geometry','uv']);
        for(const [id,patch] of Object.entries(op.handles)){
          const handle=n.native_copy?.handles?.[id];
          if(!handle)throw new Fault('NOT_FOUND',`Unknown spline handle ${id}`);
          if(patch.size!==undefined)handle.size=patch.size;
          if(patch.tilt!==undefined)handle.tilt=patch.tilt;
        }
        break;
      }
      case 'spline.settings': {
        const ns=op.ids.map(id=>getNode(state,resolve(id)));
        assertUnlocked(state,locks,ns.map(n=>n.id),['geometry','uv']);
        let cost=0;
        for(const n of ns){
          if(n.type!=='spline')throw new Fault('TYPE_MISMATCH','Spline settings require spline meshes');
          const data=n.native_copy??(n.native_copy={});
          for(const [key,value] of Object.entries(op))if(key!=='op'&&key!=='ids'&&value!==undefined)data[key]=value;
          cost+=(data.radial_resolution??6)*(data.tubular_resolution??12)*Math.max(1,Object.keys(data.curves??{}).length);
        }
        if(cost>1048576)throw new Fault('SPLINE_BUDGET','Spline batch exceeds 1048576 radial/tubular curve samples');
        break;
      }
      case 'node.flags': {
        const domains: Domain[]=[];
        if(op.visibility!==undefined)domains.push('geometry');
        if(op.locked!==undefined||op.export!==undefined)domains.push('structure');
        const resolved=op.ids.map(id=>getNode(state,resolve(id)).id);
        const ns=op.descendants?descendants(state,resolved):resolved.map(id=>getNode(state,id));
        assertUnlocked(state,locks,ns.map(n=>n.id),domains);
        for(const n of ns){
          if(!['group','cube','mesh','spline'].includes(n.type))throw new Fault('TYPE_MISMATCH','Node flags currently require groups, cubes, meshes or splines');
          for(const key of ['visibility','locked','export'] as const)if(op[key]!==undefined&&n[key]!==op[key]){
            n[key]=op[key];
            if(n.native_copy)n.native_copy[key]=op[key];
          }
        }
        break;
      }
      case 'node.render_order': {
        const ns=op.ids.map(id=>getNode(state,resolve(id)));
        assertUnlocked(state,locks,ns.map(n=>n.id),['geometry']);
        for(const n of ns){
          if(!['cube','mesh','spline'].includes(n.type))throw new Fault('TYPE_MISMATCH','Render order requires cubes, meshes or spline meshes');
          n.render_order=op.value;
        }
        break;
      }
      case 'cube.shading': {
        requireFeature(state,'java_cube_shading_properties');
        for(const n of nodesFor(op.ids,['geometry'],false)){
          if(n.type!=='cube')throw new Fault('TYPE_MISMATCH','Shading requires cubes');
          if(op.shade!==undefined)n.shade=op.shade;
          if(op.light_emission!==undefined)n.light_emission=op.light_emission;
        }
        break;
      }
      case 'face.uv_export': {
        requireFeature(state,'java_face_properties');
        for(const n of nodesFor(op.ids,['geometry','uv'],false)){
          if(n.type!=='cube')throw new Fault('TYPE_MISMATCH','UV export requires cubes');
          if(n.box_uv)throw new Fault('BOX_UV','UV export requires per-face UV');
          for(const key of op.faces){
            const face=n.faces?.[key];
            if(!face)throw new Fault('NOT_FOUND',`Missing cube face ${key}`);
            face.enabled=op.enabled;
          }
        }
        break;
      }
      case 'face.tint': {
        requireFeature(state,'java_face_properties');
        for(const n of nodesFor(op.ids,['geometry','uv'],false)){
          if(n.type!=='cube')throw new Fault('TYPE_MISMATCH','Tint assignment requires cubes');
          for(const key of op.faces){
            const face=n.faces?.[key];
            if(!face)throw new Fault('NOT_FOUND',`Missing cube face ${key}`);
            if(face.texture===null&&!op.include_disabled)continue;
            face.tint=op.value;
          }
        }
        break;
      }
      case 'face.cullface': {
        requireFeature(state,'cullfaces');
        for(const n of nodesFor(op.ids,['geometry','uv'],false)){
          if(n.type!=='cube')throw new Fault('TYPE_MISMATCH','Cullface assignment requires cubes');
          for(const key of op.faces){
            const face=n.faces?.[key];
            if(!face)throw new Fault('NOT_FOUND',`Missing cube face ${key}`);
            if(face.texture===null&&!op.include_disabled)continue;
            face.cullface=op.value==='same'?key:op.value;
          }
        }
        break;
      }
      case 'face.remove_blank': {
        const ns=nodesFor(op.ids,['geometry','uv'],false),removed=new Set<string>();
        for(const n of ns){
          if(n.type!=='cube'&&n.type!=='mesh')throw new Fault('TYPE_MISMATCH','Blank face removal requires cubes or meshes');
          const entries=Object.entries(n.faces??{}),blank=entries.filter(([,f])=>f.texture===false);
          if(!blank.length)continue;
          const allBlank=blank.length===entries.length;
          if(allBlank&&op.empty==='skip')continue;
          if(allBlank&&op.empty==='delete'){
            nodesFor([n.id],['structure','geometry','uv','texture','animation'],false);
            if(n.parent)assertUnlocked(state,locks,[n.parent],['structure']);
            if(state.nodes.some(child=>child.parent===n.id))throw new Fault('INVALID_HIERARCHY','Cannot remove a face node with children');
            removed.add(n.id);continue;
          }
          if(n.type==='cube'&&n.box_uv)throw new Fault('BOX_UV','Convert box UV before removing individual blank faces');
          for(const [key,face] of blank){if(n.type==='cube'){face.texture=null;delete face.resolved_texture;}else delete n.faces![key];}
        }
        if(removed.size){state.nodes=state.nodes.filter(n=>!removed.has(n.id));for(const a of state.animations)a.keys=a.keys.filter(k=>!removed.has(k.node));}
        break;
      }
      case "node.delete": {
        const ns = nodesFor(op.ids, [
          "structure",
          "geometry",
          "uv",
          "texture",
          "animation",
        ]);
        const removed = new Set(ns.map((n) => n.id));
        for (const n of ns)
          if (n.parent && !removed.has(n.parent))
            assertUnlocked(state, locks, [n.parent], ["structure"]);
        state.nodes = state.nodes.filter((n) => !removed.has(n.id));
        for (const a of state.animations)
          a.keys = a.keys.filter((k) => !removed.has(k.node));
        break;
      }
      case 'armature.delete':
      case 'armature_bone.delete': {
        const node=getNode(state,resolve(op.id));
        if(node.type!==op.op.split('.')[0]) throw new Fault('TYPE_MISMATCH',`Expected ${op.op.split('.')[0]}`);
        let root=node;const seen=new Set<string>();
        while(root.type!=='armature' && root.parent) {
          if(seen.has(root.id)) throw new Fault('INVALID_HIERARCHY','Cyclic armature hierarchy');
          seen.add(root.id);root=getNode(state,root.parent);
        }
        if(root.type!=='armature') throw new Fault('INVALID_HIERARCHY','Bone has no owning armature');
        assertUnlocked(state,locks,descendants(state,[root.id]).map(n=>n.id),['structure','geometry','uv','texture','animation']);
        if(node.parent) assertUnlocked(state,locks,[node.parent],['structure']);
        const keepChildren=op.op==='armature_bone.delete' && !op.remove_children;
        if(keepChildren) for(const child of state.nodes.filter(n=>n.parent===node.id)) child.parent=node.parent;
        const removed=new Set((keepChildren?[node]:descendants(state,[node.id])).map(n=>n.id));
        state.nodes=state.nodes.filter(n=>!removed.has(n.id));
        for(const animation of state.animations) animation.keys=animation.keys.filter(k=>!removed.has(k.node));
        break;
      }
      case "node.reparent": {
        const ns = nodesFor(op.ids, ["structure", "geometry"]);
        const parent = checkParent(op.parent);
        if (parent && ns.some((n) => n.id === parent))
          throw new Fault("CYCLE", "Cannot parent a node under its descendant");
        for (const id of op.ids.map(resolve)) {
          const n = getNode(state, id);
          if (n.parent) assertUnlocked(state, locks, [n.parent], ["structure"]);
          n.parent = parent;
        }
        break;
      }
      case 'armature_bone.reparent': {
        const node=getNode(state,resolve(op.id)),parent=getNode(state,resolve(op.parent));
        if(node.type!=='armature_bone') throw new Fault('TYPE_MISMATCH','Expected armature_bone');
        if(!['armature','armature_bone'].includes(parent.type)) throw new Fault('INVALID_PARENT','Bone parent must be an armature or armature bone');
        if(descendants(state,[node.id]).some(n=>n.id===parent.id)) throw new Fault('CYCLE','Cannot parent a bone under itself or its descendant');
        for(const start of [node,parent]) {
          let root=start;const seen=new Set<string>();
          while(root.type!=='armature' && root.parent) {
            if(seen.has(root.id)) throw new Fault('INVALID_HIERARCHY','Cyclic armature hierarchy');
            seen.add(root.id);root=getNode(state,root.parent);
          }
          if(root.type!=='armature') throw new Fault('INVALID_HIERARCHY','Bone has no owning armature');
          assertUnlocked(state,locks,descendants(state,[root.id]).map(n=>n.id),['geometry','structure','animation']);
        }
        node.parent=parent.id;
        break;
      }
      case "node.translate": {
        const ns = nodesFor(op.ids, ["geometry"]);
        assertNoRotatedHierarchy(state, ns);
        ns.forEach((n) => shift(n, op.offset));
        break;
      }
      case "node.scale": {
        if (op.factors.some((v) => v <= 0))
          throw new Fault(
            "INVALID_SCALE",
            "Scale factors must be positive; use mirror for reflection",
          );
        const ns = nodesFor(op.ids, ["geometry"]);
        assertNoRotatedHierarchy(state, ns);
        for (const n of ns) {
          const tx = (v: Vec3) =>
            v.map(
              (x, i) => op.pivot[i] + (x - op.pivot[i]) * op.factors[i],
            ) as Vec3;
          n.origin = tx(n.origin);
          if (n.from) n.from = tx(n.from);
          if (n.to) n.to = tx(n.to);
          if (n.vertices)
            for (const k in n.vertices)
              n.vertices[k] = n.vertices[k].map(
                (v, i) => v * op.factors[i],
              ) as Vec3;
        }
        break;
      }
      case "node.align": {
        const idx = axisIndex(op.axis);
        const roots = op.ids.map(resolve);
        for (const rid of roots)
          if (
            roots.some(
              (other) =>
                other !== rid &&
                descendants(state, [other]).some((n) => n.id === rid),
            )
          )
            throw new Fault(
              "OVERLAPPING_TARGETS",
              "Align roots cannot contain each other",
            );
        for (const rid of roots) {
          const ns = nodesFor([rid], ["geometry"]);
          assertNoRotatedHierarchy(state, ns);
          const boxes = ns
            .map(bounds)
            .filter((b): b is NonNullable<typeof b> => !!b);
          if (!boxes.length)
            throw new Fault("EMPTY_BOUNDS", "No geometry to align");
          const min = Math.min(...boxes.map((b) => b.min[idx])),
            max = Math.max(...boxes.map((b) => b.max[idx]));
          const anchor =
            op.mode === "min" ? min : op.mode === "max" ? max : (min + max) / 2;
          const offset: Vec3 = [0, 0, 0];
          offset[idx] = op.position - anchor;
          ns.forEach((n) => shift(n, offset));
        }
        break;
      }
      case "node.mirror": {
        const ns = nodesFor(op.ids, [
          "geometry",
          "structure",
          ...(op.mirror_uv ? ["uv" as const] : []),
        ]);
        assertNoRotatedHierarchy(state, ns);
        let targets = ns;
        const idx = axisIndex(op.axis);
        if (op.duplicate) {
          const mapping = new Map(ns.map((n) => [n.id, newId()]));
          targets = ns.map((n) => ({
            ...clone(n),
            id: mapping.get(n.id)!,
            name: `${n.name}_mirror`,
            parent: n.parent ? (mapping.get(n.parent) ?? n.parent) : null,
          }));
          for (const n of targets)
            if (n.parent && !Array.from(mapping.values()).includes(n.parent))
              checkParent(n.parent);
          state.nodes.push(...targets);
        }
        for (const n of targets) {
          n.origin[idx] = 2 * op.center - n.origin[idx];
          if (n.from && n.to) {
            const from = n.from[idx];
            n.from[idx] = 2 * op.center - n.to[idx];
            n.to[idx] = 2 * op.center - from;
            const pairs = [
              ["east", "west"],
              ["up", "down"],
              ["north", "south"],
            ][idx];
            if (n.faces)
              [n.faces[pairs[0]], n.faces[pairs[1]]] = [
                n.faces[pairs[1]],
                n.faces[pairs[0]],
              ];
          }
          if (n.vertices) {
            for (const v of Object.values(n.vertices)) v[idx] *= -1;
            for (const f of Object.values(n.faces ?? {})) f.vertices?.reverse();
          }
          if (op.mirror_uv) {
            if (n.box_uv) n.mirror_uv = !n.mirror_uv;
            else
              for (const f of Object.values(n.faces ?? {})) {
                if (Array.isArray(f.uv))
                  [f.uv[0], f.uv[2]] = [f.uv[2], f.uv[0]];
                else {
                  const vals = Object.values(f.uv).map((v) => v[0]);
                  const sum = Math.min(...vals) + Math.max(...vals);
                  for (const v of Object.values(f.uv)) v[0] = sum - v[0];
                }
              }
          }
        }
        break;
      }
      case 'node.duplicate': {
        const root=getNode(state,resolve(op.id)),ns=descendants(state,[root.id]);
        assertUnlocked(state,locks,ns.map(n=>n.id),['structure']);
        if(ns.some(n=>!['group','cube','mesh','armature','armature_bone'].includes(n.type)))throw new Fault('TYPE_MISMATCH','Planned duplication requires supported core nodes');
        if(root.type==='armature_bone') {
          let owner=root;const visited=new Set<string>();
          while(owner.type!=='armature'&&owner.parent) {
            if(visited.has(owner.id))throw new Fault('INVALID_HIERARCHY','Cyclic armature hierarchy');
            visited.add(owner.id);owner=getNode(state,owner.parent);
          }
          if(owner.type!=='armature')throw new Fault('WEIGHT_ARMATURE_MISSING','A copied bone requires an owning armature');
          assertUnlocked(state,locks,descendants(state,[owner.id]).map(n=>n.id),['geometry','structure','animation']);
        } else if(root.parent)checkParent(root.parent);
        const mapping=new Map(ns.map(n=>[n.id,newId(n.id===root.id?op.ref:undefined)]));
        let copyName=op.name??`${root.name}_copy`,counter=2;
        if(!op.name)while(state.nodes.some(n=>n.name===copyName))copyName=`${root.name}_copy${counter++}`;
        const copies=ns.map(n=>({...clone(n),id:mapping.get(n.id)!,name:n.id===root.id?copyName:n.name,parent:n.parent?(mapping.get(n.parent)??n.parent):null}));
        const weightMaps=new Map<string,Map<string,string|null>>();
        for(let index=0;index<ns.length;index++)if(ns[index].type==='armature_bone') {
          const bone=ns[index],copy=copies[index];
          let owner=bone;
          while(owner.type!=='armature'&&owner.parent)owner=getNode(state,owner.parent);
          if(owner.type!=='armature')throw new Fault('WEIGHT_ARMATURE_MISSING','A copied bone requires an owning armature');
          // Native bone-only duplication retains weights to existing meshes.
          // Whole-armature duplication instead remaps them to the copied meshes.
          if(!mapping.has(owner.id))continue;
          let keys=weightMaps.get(owner.id);
          if(!keys) {
            keys=new Map();const destinations=new Set<string>();
            for(const mesh of ns.filter(n=>n.type==='mesh'&&n.parent===owner.id))for(const vertex of Object.keys(mesh.vertices??{})) {
              const target=`${mapping.get(mesh.id)!.slice(0,6)}:${vertex}`;
              if(destinations.has(target))throw new Fault('WEIGHT_KEY_COLLISION','Copied mesh UUID prefixes collide, including unweighted vertices');
              destinations.add(target);
              for(const alias of [`${mesh.id.slice(0,6)}:${vertex}`,vertex])keys.set(alias,keys.has(alias)?null:target);
            }
            weightMaps.set(owner.id,keys);
          }
          const weights:Record<string,number>={};
          for(const [key,value] of Object.entries(bone.vertex_weights??{})) {
            const next=keys.get(key);
            if(!next)throw new Fault('WEIGHT_KEY_COLLISION','Cannot uniquely remap a stored bone weight to a copied mesh vertex');
            if(Object.hasOwn(weights,next))throw new Fault('WEIGHT_KEY_COLLISION','Copied mesh UUID prefixes collide');
            weights[next]=value;
          }
          copy.vertex_weights=weights;
          if(copy.native_copy)copy.native_copy.vertex_weights=clone(weights);
        }
        for(const copy of copies) {
          if(['group','armature_bone'].includes(copy.type) && state.capabilities.bone_rig) {
            const others=state.nodes.filter(n=>n.type===copy.type&&(n.scope??0)===(copy.scope??0));
            const names=new Set(others.map(n=>n.name.toLowerCase()));
            const available=(name:string)=>!names.has(name.toLowerCase());
            if(!available(copy.name)) {
              const first=/[^\d]0$/.test(copy.name)?1:2;
              const base=copy.name.replace(/\d+$/,'').replace(/\s+/g,'_');
              let unique:string|undefined;
              for(let i=first;i<8000;i++)if(available(base+i)){unique=base+i;break;}
              if(!unique)throw new Fault('NAME_EXHAUSTED','No unique group name is available within the native naming limit');
              copy.name=unique;
            }
          }
          state.nodes.push(copy);
        }
        if(op.copy_animations) {
          requireFeature(state,'animation_mode');
          assertUnlocked(state,locks,ns.map(n=>n.id),['animation']);
          for(const animation of state.animations) {
            const keys=animation.keys.filter(key=>mapping.has(key.node)).map(key=>({...clone(key),id:newId(),node:mapping.get(key.node)!}));
            animation.keys.push(...keys);
          }
        }
        break;
      }
      case 'uv.copy': {
        const source=getNode(state,resolve(op.source_id));
        const target=nodesFor([op.target_id],op.texture==='source_face'?['uv','texture']:['uv'],false)[0];
        if(source.type!=='mesh'||target.type!=='mesh')throw new Fault('TYPE_MISMATCH','UV point copy requires source and target meshes');
        const seen=new Set<string>(),textures=new Map<string,string|null|false>(),patches:{face:string;vertex:string;uv:Vec2}[]=[];
        for(const mapping of op.mappings){
          const sf=source.faces?.[mapping.source.face],tf=target.faces?.[mapping.target.face];
          if(!sf||!tf||Array.isArray(sf.uv)||Array.isArray(tf.uv)
            ||!sf.vertices?.includes(mapping.source.vertex)||!tf.vertices?.includes(mapping.target.vertex)
            ||!source.vertices?.[mapping.source.vertex]||!target.vertices?.[mapping.target.vertex])
            throw new Fault('UV_COPY_CORNER','UV copy requires existing face vertices');
          const uv=sf.uv[mapping.source.vertex],previous=tf.uv[mapping.target.vertex];
          if(!uv||uv.length!==2||!uv.every(Number.isFinite)||!previous||previous.length!==2||!previous.every(Number.isFinite))
            throw new Fault('UV_COPY_RANGE','UV copy requires finite two-coordinate UV points');
          const key=JSON.stringify([mapping.target.face,mapping.target.vertex]);
          if(seen.has(key))throw new Fault('UV_COPY_DUPLICATE','Each target UV corner must appear once');
          seen.add(key);
          patches.push({face:mapping.target.face,vertex:mapping.target.vertex,uv:clone(uv)});
          if(op.texture==='source_face'){
            const texture=sf.texture===undefined?false:sf.texture;
            if(textures.has(mapping.target.face)&&textures.get(mapping.target.face)!==texture)
              throw new Fault('UV_COPY_TEXTURE_CONFLICT','Mapped source faces have conflicting texture assignments for a target face');
            textures.set(mapping.target.face,texture);
          }
        }
        // Capture every source before writing, so self-copy can swap corners.
        for(const p of patches)(target.faces![p.face].uv as Record<string,Vec2>)[p.vertex]=p.uv;
        for(const [face,texture] of textures){target.faces![face].texture=texture;delete target.faces![face].resolved_texture;}
        break;
      }
      case "uv.snap": {
        const n=nodesFor([op.id],["uv"],false)[0];
        const snapped=snapMeshUV(n,op.snap);
        for(const [key,uv] of Object.entries(snapped))n.faces![key].uv=uv;
        break;
      }
      case 'cube.face_copy': {
        const source=getNode(state,resolve(op.source.id));
        if(source.type!=='cube')throw new Fault('TYPE_MISMATCH','Face copy source must be a cube');
        if(source.box_uv)throw new Fault('BOX_UV','Face copy requires per-face UV');
        const face=source.faces?.[op.source.face];
        if(!face)throw new Fault('NOT_FOUND','Source face does not exist');
        // Capture before any target mutation, including when a target is the source cube.
        const defaults={rotation:0,texture:false,tint:-1,cullface:'',material_name:'',enabled:true};
        const patch:Record<string,unknown>={};
        for(const field of op.fields)patch[field]=clone(face[field]===undefined?defaults[field as keyof typeof defaults]:face[field]);
        const domains:Domain[]=['uv'];
        if(op.fields.includes('texture'))domains.push('texture');
        if(op.fields.some(f=>['tint','cullface','material_name','enabled'].includes(f)))domains.push('geometry');
        const seen=new Set<string>();
        for(const target of op.targets){
          const n=nodesFor([target.id],domains,false)[0];
          if(n.type!=='cube')throw new Fault('TYPE_MISMATCH','Face copy targets must be cubes');
          if(n.box_uv)throw new Fault('BOX_UV','Face copy requires per-face UV');
          for(const key of target.faces){
            const token=n.id+':'+key;
            if(seen.has(token))throw new Fault('UV_FACE_DUPLICATE','Target face appears more than once');
            seen.add(token);
            if(!n.faces?.[key])throw new Fault('NOT_FOUND',`Missing target face ${key}`);
            Object.assign(n.faces[key],clone(patch));
            if(op.fields.includes('texture'))delete n.faces[key].resolved_texture;
          }
          if(op.autouv==='disable')n.autouv=0;
        }
        break;
      }
      case "cube.uv_rotation": {
        const n=nodesFor([op.id],["uv"],false)[0];
        const result=rotateCubeUV(n,op.rotation);
        for(const [key,face] of Object.entries(result.faces))Object.assign(n.faces![key],face);
        if(result.turned)n.autouv=0;
        break;
      }
      case "uv.rotate": {
        const n=nodesFor([op.id],["uv"],false)[0];
        const rotated=rotateMeshUV(n,op.rotation);
        for(const [key,uv] of Object.entries(rotated))n.faces![key].uv=uv;
        break;
      }
      case "uv.weld": {
        const n=nodesFor([op.id],["uv"],false)[0];
        const welded=weldMeshUV(n,op.weld);
        for(const [key,uv] of Object.entries(welded))n.faces![key].uv=uv;
        break;
      }
      case "uv.align": {
        const n=nodesFor([op.id],["uv"],false)[0];
        const aligned=alignMeshUV(n,op.alignment);
        for(const [key,uv] of Object.entries(aligned))n.faces![key].uv=uv;
        break;
      }
      case "uv.project": {
        const n=nodesFor([op.id],["uv"],false)[0];
        const projected=projectMeshUV(n,op.faces,op.projection);
        for(const [key,uv] of Object.entries(projected)) n.faces![key].uv=uv;
        break;
      }
      case "uv.set": {
        const n = nodesFor([op.id], ["uv", "texture"], false)[0];
        if (n.type === "group")
          throw new Fault("TYPE_MISMATCH", "UV requires cube or mesh");
        if (n.box_uv) {
          if (op.box_uv !== false)
            throw new Fault(
              "BOX_UV",
              "Set box_uv:false explicitly to replace Box UV",
            );
          if (!state.capabilities.optional_box_uv)
            throw new Fault("UNSUPPORTED_FORMAT", "Format requires Box UV");
          n.box_uv = false;
        }
        for (const [key, f] of Object.entries(op.faces)) {
          if (!n.faces?.[key])
            throw new Fault("NOT_FOUND", `Face ${key} missing`);
          const next = { ...n.faces[key], ...clone(f) };
          if (typeof next.texture === "string")
            next.texture = resolve(next.texture);
          delete next.resolved_texture;
          n.faces[key] = next;
        }
        break;
      }
      case 'cube.material_instances': {
        if(state.format!=='bedrock_block')throw new Fault('UNSUPPORTED_FORMAT','Material instances require Bedrock Block format');
        for(const n of nodesFor(op.ids,['texture','uv'],false)) {
          if(n.type!=='cube')throw new Fault('TYPE_MISMATCH','Material instances require cubes');
          if(n.box_uv)throw new Fault('BOX_UV','Material instances require per-face UV; set box_uv:false explicitly first');
          for(const [key,value] of Object.entries(op.faces)) {
            if(!n.faces?.[key])throw new Fault('NOT_FOUND',`Face ${key} missing`);
            n.faces[key].material_name=value;
          }
        }
        break;
      }
      case "uv.transform": {
        nodesFor(op.ids, ["uv"])
          .filter((n) => n.type !== "group")
          .forEach((n) => transformUV(n, op.scale, op.offset, op.rotation));
        break;
      }
      case "uv.density": {
        for (const n of nodesFor(op.ids, ["uv"]).filter(
          (n) => n.type !== "group",
        )) {
          if (n.box_uv)
            throw new Fault(
              "BOX_UV",
              "Density normalization requires per-face UV",
            );
          for (const [key, f] of Object.entries(n.faces ?? {})) {
            const t = getTexture(
              state,
              String(f.resolved_texture ?? f.texture),
            );
            const area = faceArea(n, key),
              ua =
                (((uvArea(f.uv, f.vertices) * t.width) / t.uv_width) *
                  t.height) /
                t.uv_height;
            if (area <= 0 || ua <= 0)
              throw new Fault(
                "ZERO_AREA",
                "Density requires nonzero geometry and UV areas",
                { id: n.id, face: key },
              );
            const factor = op.pixels_per_unit * Math.sqrt(area / ua);
            const points = Array.isArray(f.uv)
              ? [f.uv.slice(0, 2), f.uv.slice(2)]
              : Object.values(f.uv);
            const origin = [
              Math.min(...points.map((v) => v[0])),
              Math.min(...points.map((v) => v[1])),
            ];
            if (Array.isArray(f.uv))
              f.uv = f.uv.map(
                (v, i) => origin[i % 2] + (v - origin[i % 2]) * factor,
              );
            else
              for (const v of Object.values(f.uv)) {
                v[0] = origin[0] + (v[0] - origin[0]) * factor;
                v[1] = origin[1] + (v[1] - origin[1]) * factor;
              }
          }
        }
        break;
      }
      case "texture.add": {
        if (state.capabilities.single_texture) {
          if (state.textures.length)
            throw new Fault(
              "SINGLE_TEXTURE",
              "MCP texture creation supports one texture in single-texture formats",
            );
          assertUnlocked(
            state,
            locks,
            state.nodes.map((n) => n.id),
            ["texture"],
          );
        }
        const uv = state.project_uv ?? [16, 16];
        if (
          !state.capabilities.per_texture_uv_size &&
          ((op.uv_width !== undefined && op.uv_width !== uv[0]) ||
            (op.uv_height !== undefined && op.uv_height !== uv[1]))
        )
          throw new Fault(
            "PROJECT_UV_SIZE",
            "This format uses project UV dimensions",
          );
        state.textures.push({
          id: newId(op.ref),
          name: op.name,
          width: op.width,
          height: op.height,
          uv_width: state.capabilities.per_texture_uv_size
            ? (op.uv_width ?? op.width)
            : uv[0],
          uv_height: state.capabilities.per_texture_uv_size
            ? (op.uv_height ?? op.height)
            : uv[1],
          png: op.png,
          color: op.color,
          layers: [],
          layers_enabled: false,
        });
        break;
      }
      case "texture.update": {
        if(op.render_sides!==undefined && state.format!=='free') throw new Fault('UNSUPPORTED_FORMAT','Per-texture render sides are exposed by the free format');
        if(op.wrap_mode!==undefined) requireFeature(state,'per_texture_wrap_mode');
        const t = textureAccess(
          op.id,
          op.uv_width !== undefined || op.uv_height !== undefined
            ? ["texture", "uv"]
            : ["texture"],
        );
        if (
          !state.capabilities.per_texture_uv_size &&
          (op.uv_width !== undefined || op.uv_height !== undefined)
        )
          throw new Fault(
            "PROJECT_UV_SIZE",
            "This format uses project UV size; texture-specific UV changes are unsupported",
          );
        const frameCount=state.capabilities.animated_textures?Math.max(1,Math.ceil(((op.uv_width??t.uv_width)/(op.uv_height??t.uv_height))/(t.width/t.height)-0.05)):1;
        if(op.fps!==undefined&&(state.capabilities.texture_mcmeta||frameCount<=1))throw new Fault('TEXTURE_ANIMATION_FORMAT','fps requires a non-mcmeta animated texture');
        const meta=['frame_time','frame_order_type','frame_order','frame_interpolate'] as const;
        if(meta.some(k=>op[k]!==undefined)&&!state.capabilities.texture_mcmeta)throw new Fault('TEXTURE_ANIMATION_FORMAT','Frame metadata requires a texture_mcmeta format');
        const orderType=op.frame_order_type??t.frame_order_type;
        const order=op.frame_order??t.frame_order??'';
        if(op.frame_order!==undefined&&orderType!=='custom')throw new Fault('TEXTURE_FRAME_ORDER','frame_order requires custom order type');
        if(meta.some(k=>op[k]!==undefined)&&orderType==='custom'&&(!/^\d+(?::[1-9]\d*)?(?:\s+\d+(?::[1-9]\d*)?)*$/.test(order.trim())||order.trim().split(/\s+/).some(v=>Number(v.split(':')[0])>=frameCount||(v.includes(':')&&Number(v.split(':')[1])>1000000))))throw new Fault('TEXTURE_FRAME_ORDER','Custom frame order must contain existing zero-based frame indices and optional :duration from 1 to 1000000');
        if(op.group!==undefined && op.group!==null && !state.texture_groups?.some(g=>g.id===resolve(op.group!)))throw new Fault('NOT_FOUND','Texture group not found');
        if(op.group!==undefined||op.pbr_channel!==undefined) {
          const groups=new Set([t.group,op.group?resolve(op.group):undefined].filter(Boolean));
          for(const related of state.textures.filter(t=>t.group && groups.has(t.group)))textureAccess(related.id);
        }
        for (const [k, v] of Object.entries(op))
          if (k !== "op" && k !== "id" && v !== undefined) (t as any)[k] = k==='group'?(v===null?'':resolve(v as string)):k==='frame_order'?(v as string).trim():v;
        break;
      }
      case 'texture.split_channels': {
        const t=textureAccess(op.id);
        if(t.layers.length&&!op.replace_layers)throw new Fault('TEXTURE_LAYERS','Channel split requires replace_layers=true when layers exist');
        const image=clone(t);
        if(image.layers_enabled){image.baked_layers=image.layers;image.layers=[];image.layers_enabled=false;delete image.png;delete image.color;delete image.edits;}
        const channels=op.mode==='rgb'?['blue','green','red','alpha'] as const:['color','alpha'] as const;
        rasterPixelBudget+=t.width*t.height*channels.length*2;
        if(rasterPixelBudget>67108864)throw new Fault('PIXEL_BUDGET','Channel split exceeds raster budget');
        t.layers=channels.map(channel=>({id:newId(op.ref_prefix?`${op.ref_prefix}_${channel}`:undefined),name:channel,width:t.width,height:t.height,offset:[0,0],scale:[1,1],opacity:100,visible:true,in_limbo:false,blend_mode:channel==='alpha'?'alpha_mask':channel==='color'?'default':'add',frame_source:{image,frame_height:t.height,indices:[0],channel}}));
        t.layers_enabled=true;delete t.png;delete t.color;delete t.edits;delete t.frame_source;delete t.baked_layers;delete t.merge_source;
        break;
      }
      case 'texture.opacity': {
        const t=textureAccess(op.id),layer=op.layer?t.layers.find(l=>l.id===resolve(op.layer!)):undefined;
        if(op.layer&&!layer)throw new Fault('NOT_FOUND','Layer not found in target texture');
        if(op.layer&&op.flatten_layers)throw new Fault('TEXTURE_OPACITY','Layer and flatten_layers cannot be combined');
        if(layer&&!t.layers_enabled)throw new Fault('TEXTURE_OPACITY','Enable layers before editing a layer');
        if(!layer&&t.layers_enabled&&!op.flatten_layers)throw new Fault('TEXTURE_OPACITY','Whole-image opacity adjustment requires flatten_layers=true for layered textures');
        const data=layer??t,rect=op.rect??[0,0,data.width,data.height];
        if(rect[0]+rect[2]>data.width||rect[1]+rect[3]>data.height)throw new Fault('PIXEL_BOUNDS','Opacity adjustment rectangle is outside target canvas');
        rasterPixelBudget+=data.width*data.height*2;
        if(rasterPixelBudget>67108864)throw new Fault('PIXEL_BUDGET','Opacity adjustment exceeds raster budget');
        const image=clone(data);
        if(!layer&&t.layers_enabled){const source=image as TextureData;source.baked_layers=source.layers;source.layers=[];source.layers_enabled=false;delete source.png;delete source.color;delete source.edits;}
        data.frame_source={image,frame_height:data.height,indices:[0],opacity:{mode:op.mode,value:op.value,include_transparent:op.include_transparent,rect}};
        delete data.png;delete data.color;delete data.edits;delete data.baked_layers;delete data.merge_source;
        if(!layer&&t.layers_enabled){t.layers=[];t.layers_enabled=false;}
        break;
      }
      case 'texture.saturation_hue': {
        const t=textureAccess(op.id),layer=op.layer?t.layers.find(l=>l.id===resolve(op.layer!)):undefined;
        if(op.layer&&!layer)throw new Fault('NOT_FOUND','Layer not found in target texture');
        if(op.layer&&op.flatten_layers)throw new Fault('TEXTURE_SATURATION_HUE','Layer and flatten_layers cannot be combined');
        if(layer&&!t.layers_enabled)throw new Fault('TEXTURE_SATURATION_HUE','Enable layers before editing a layer');
        if(!layer&&t.layers_enabled&&!op.flatten_layers)throw new Fault('TEXTURE_SATURATION_HUE','Whole-image saturation/hue adjustment requires flatten_layers=true for layered textures');
        const data=layer??t,rect=op.rect??[0,0,data.width,data.height];
        if(rect[0]+rect[2]>data.width||rect[1]+rect[3]>data.height)throw new Fault('PIXEL_BOUNDS','Saturation/hue adjustment rectangle is outside target canvas');
        rasterPixelBudget+=data.width*data.height*2+rect[2]*rect[3];
        if(rasterPixelBudget>67108864)throw new Fault('PIXEL_BUDGET','Saturation/hue adjustment exceeds raster budget');
        const image=clone(data);
        if(!layer&&t.layers_enabled){const source=image as TextureData;source.baked_layers=source.layers;source.layers=[];source.layers_enabled=false;delete source.png;delete source.color;delete source.edits;}
        data.frame_source={image,frame_height:data.height,indices:[0],saturation_hue:{saturation:op.saturation,hue:op.hue,brightness:op.brightness,rect}};
        delete data.png;delete data.color;delete data.edits;delete data.baked_layers;delete data.merge_source;
        if(!layer&&t.layers_enabled){t.layers=[];t.layers_enabled=false;}
        break;
      }
      case 'texture.curves': {
        const t=textureAccess(op.id),layer=op.layer?t.layers.find(l=>l.id===resolve(op.layer!)):undefined;
        if(op.layer&&!layer)throw new Fault('NOT_FOUND','Layer not found in target texture');
        if(op.layer&&op.flatten_layers)throw new Fault('TEXTURE_CURVES','Layer and flatten_layers cannot be combined');
        if(layer&&!t.layers_enabled)throw new Fault('TEXTURE_CURVES','Enable layers before editing a layer');
        if(!layer&&t.layers_enabled&&!op.flatten_layers)throw new Fault('TEXTURE_CURVES','Whole-image curve adjustment requires flatten_layers=true for layered textures');
        const data=layer??t,rect=op.rect??[0,0,data.width,data.height];
        if(rect[0]+rect[2]>data.width||rect[1]+rect[3]>data.height)throw new Fault('PIXEL_BOUNDS','Curve adjustment rectangle is outside target canvas');
        rasterPixelBudget+=data.width*data.height*2;
        if(rasterPixelBudget>67108864)throw new Fault('PIXEL_BUDGET','Curve adjustment exceeds raster budget');
        const image=clone(data);
        if(!layer&&t.layers_enabled){const source=image as TextureData;source.baked_layers=source.layers;source.layers=[];source.layers_enabled=false;delete source.png;delete source.color;delete source.edits;}
        data.frame_source={image,frame_height:data.height,indices:[0],curves:{curves:op.curves,rect}};
        delete data.png;delete data.color;delete data.edits;delete data.baked_layers;delete data.merge_source;
        if(!layer&&t.layers_enabled){t.layers=[];t.layers_enabled=false;}
        break;
      }
      case 'texture.brightness_contrast': {
        const t=textureAccess(op.id),layer=op.layer?t.layers.find(l=>l.id===resolve(op.layer!)):undefined;
        if(op.layer&&!layer)throw new Fault('NOT_FOUND','Layer not found in target texture');
        if(op.layer&&op.flatten_layers)throw new Fault('TEXTURE_BRIGHTNESS_CONTRAST','Layer and flatten_layers cannot be combined');
        if(layer&&!t.layers_enabled)throw new Fault('TEXTURE_BRIGHTNESS_CONTRAST','Enable layers before editing a layer');
        if(!layer&&t.layers_enabled&&!op.flatten_layers)throw new Fault('TEXTURE_BRIGHTNESS_CONTRAST','Whole-image brightness/contrast adjustment requires flatten_layers=true for layered textures');
        const data=layer??t,rect=op.rect??[0,0,data.width,data.height];
        if(rect[0]+rect[2]>data.width||rect[1]+rect[3]>data.height)throw new Fault('PIXEL_BOUNDS','Brightness/contrast adjustment rectangle is outside target canvas');
        rasterPixelBudget+=data.width*data.height*2;
        if(rasterPixelBudget>67108864)throw new Fault('PIXEL_BUDGET','Brightness/contrast adjustment exceeds raster budget');
        const image=clone(data);
        if(!layer&&t.layers_enabled){const source=image as TextureData;source.baked_layers=source.layers;source.layers=[];source.layers_enabled=false;delete source.png;delete source.color;delete source.edits;}
        data.frame_source={image,frame_height:data.height,indices:[0],brightness_contrast:{brightness:op.brightness,contrast:op.contrast,rect}};
        delete data.png;delete data.color;delete data.edits;delete data.baked_layers;delete data.merge_source;
        if(!layer&&t.layers_enabled){t.layers=[];t.layers_enabled=false;}
        break;
      }
      case 'texture.invert': {
        const t=textureAccess(op.id),layer=op.layer?t.layers.find(l=>l.id===resolve(op.layer!)):undefined;
        if(op.layer&&!layer)throw new Fault('NOT_FOUND','Layer not found in target texture');
        if(op.layer&&op.flatten_layers)throw new Fault('TEXTURE_INVERT','Layer and flatten_layers cannot be combined');
        if(layer&&!t.layers_enabled)throw new Fault('TEXTURE_INVERT','Enable layers before editing a layer');
        if(!layer&&t.layers_enabled&&!op.flatten_layers)throw new Fault('TEXTURE_INVERT','Whole-image inversion requires flatten_layers=true for layered textures');
        const data=layer??t,rect=op.rect??[0,0,data.width,data.height];
        if(rect[0]+rect[2]>data.width||rect[1]+rect[3]>data.height)throw new Fault('PIXEL_BOUNDS','Inversion rectangle is outside target canvas');
        rasterPixelBudget+=data.width*data.height*2;
        if(rasterPixelBudget>67108864)throw new Fault('PIXEL_BUDGET','Inversion exceeds raster budget');
        const image=clone(data);
        if(!layer&&t.layers_enabled){const source=image as TextureData;source.baked_layers=source.layers;source.layers=[];source.layers_enabled=false;delete source.png;delete source.color;delete source.edits;}
        data.frame_source={image,frame_height:data.height,indices:[0],invert:{channels:op.channels,amount:op.amount,rect}};
        delete data.png;delete data.color;delete data.edits;delete data.baked_layers;delete data.merge_source;
        if(!layer&&t.layers_enabled){t.layers=[];t.layers_enabled=false;}
        break;
      }
      case 'texture.palette': {
        const t=textureAccess(op.id),layer=op.layer?t.layers.find(l=>l.id===resolve(op.layer!)):undefined;
        if(op.layer&&!layer)throw new Fault('NOT_FOUND','Layer not found in target texture');
        if(op.layer&&op.flatten_layers)throw new Fault('TEXTURE_PALETTE','Layer and flatten_layers cannot be combined');
        if(layer&&!t.layers_enabled)throw new Fault('TEXTURE_PALETTE','Enable layers before editing a layer');
        if(!layer&&t.layers_enabled&&!op.flatten_layers)throw new Fault('TEXTURE_PALETTE','Whole-image palette requires flatten_layers=true for layered textures');
        const data=layer??t,rect=op.rect??[0,0,data.width,data.height];
        if(rect[0]+rect[2]>data.width||rect[1]+rect[3]>data.height)throw new Fault('PIXEL_BOUNDS','Palette rectangle is outside target canvas');
        rasterPixelBudget+=data.width*data.height*2;
        if(rasterPixelBudget>67108864)throw new Fault('PIXEL_BUDGET','Palette exceeds raster budget');
        paletteComparisonBudget+=rect[2]*rect[3]*op.colors.length;
        if(paletteComparisonBudget>67108864)throw new Fault('PALETTE_BUDGET','Palette comparisons exceed plan budget');
        const image=clone(data);
        if(!layer&&t.layers_enabled){const source=image as TextureData;source.baked_layers=source.layers;source.layers=[];source.layers_enabled=false;delete source.png;delete source.color;delete source.edits;}
        data.frame_source={image,frame_height:data.height,indices:[0],palette:{colors:op.colors,alpha_min:op.alpha_min,rect}};
        delete data.png;delete data.color;delete data.edits;delete data.baked_layers;delete data.merge_source;
        if(!layer&&t.layers_enabled){t.layers=[];t.layers_enabled=false;}
        break;
      }
      case 'texture.transform': {
        const t=textureAccess(op.id);
        if(op.layer&&op.flatten_layers)throw new Fault('TEXTURE_TRANSFORM','Layer targeting cannot be combined with flatten_layers');
        const layer=op.layer?t.layers.find(l=>l.id===resolve(op.layer!)):undefined;
        if(op.layer&&!layer)throw new Fault('NOT_FOUND','Layer not found in target texture');
        if(layer&&!t.layers_enabled)throw new Fault('TEXTURE_TRANSFORM','Enable layers before transforming a layer');
        if(!layer&&t.layers_enabled&&!op.flatten_layers)throw new Fault('TEXTURE_TRANSFORM','Whole-image transform requires flatten_layers=true for layered textures');
        const data=layer??t,image=clone(data);
        if(!layer&&t.layers_enabled){const source=image as TextureData;source.baked_layers=source.layers;source.layers=[];source.layers_enabled=false;delete source.png;delete source.color;delete source.edits;}
        const swap=op.size_mode==='expand'&&(op.transform==='rotate_cw'||op.transform==='rotate_ccw');
        const width=swap?data.height:data.width,height=swap?data.width:data.height;
        rasterPixelBudget+=data.width*data.height+width*height;
        if(rasterPixelBudget>67108864)throw new Fault('PIXEL_BUDGET','Transform exceeds raster budget');
        data.frame_source={image,frame_height:data.height,indices:[0],transform:op.transform,resize:{width,height,mode:'crop',offset:[0,0]}};
        data.width=width;data.height=height;delete data.png;delete data.color;delete data.edits;delete data.baked_layers;delete data.merge_source;
        if(!layer&&t.layers_enabled){t.layers=[];t.layers_enabled=false;}
        break;
      }
      case 'texture.crop': {
        const t=textureAccess(op.id),[x,y,width,height]=op.rect;
        if(x+width>t.width||y+height>t.height)throw new Fault('PIXEL_BOUNDS','Crop rectangle must fit inside the source image');
        const dx=x*t.uv_width/t.width,dy=y*t.uv_height/t.height;
        const uv:[number,number]=[width*t.uv_width/t.width,height*t.uv_height/t.height];
        if(op.uv_mode!=='preserve') {
          const targets=state.nodes.filter(n=>Object.values(n.faces??{}).some(f=>(f.resolved_texture??f.texture)===t.id));
          nodesFor(targets.map(n=>n.id),['uv'],false);textureAccess(t.id,['texture','uv']);
          if(op.uv_mode==='adjust'&&state.capabilities.per_texture_uv_size){t.uv_width=uv[0];t.uv_height=uv[1];}
          else if(op.uv_mode==='adjust'&&(uv[0]!==t.uv_width||uv[1]!==t.uv_height)) {
            if(!op.allow_shared_uv)throw new Fault('SHARED_UV_CHANGE','Crop adjustment requires allow_shared_uv=true to change project UV resolution');
            nodesFor(state.nodes.map(n=>n.id),['uv'],false);
            for(const other of state.textures){textureAccess(other.id,['texture','uv']);other.uv_width=uv[0];other.uv_height=uv[1];}
            state.project_uv=uv;
          }
          for(const n of targets) {
            const mixedBox=n.box_uv&&(op.uv_mode==='remap'||Object.values(n.faces??{}).some(f=>(f.resolved_texture??f.texture)!==t.id&&f.texture!==null));
            if(mixedBox) {
              if(op.mixed_box_uv!=='convert')throw new Fault('BOX_UV','Crop requires mixed_box_uv=convert for mixed textures or remapped Box UV');
              if(!state.capabilities.optional_box_uv)throw new Fault('UNSUPPORTED_FORMAT','Format requires Box UV and cannot convert mixed-material UV');
              n.box_uv=false;
            }
            if(n.box_uv) {
              n.uv_offset=[(n.uv_offset?.[0]??0)-dx,(n.uv_offset?.[1]??0)-dy];
            } else for(const f of Object.values(n.faces??{}))if((f.resolved_texture??f.texture)===t.id&&f.uv) {
              const sx=op.uv_mode==='remap'?t.width/width:1,sy=op.uv_mode==='remap'?t.height/height:1;
              if(Array.isArray(f.uv))f.uv=f.uv.map((v,i)=>(v-(i%2?dy:dx))*(i%2?sy:sx)) as typeof f.uv;
              else for(const point of Object.values(f.uv)){point[0]=(point[0]-dx)*sx;point[1]=(point[1]-dy)*sy;}
            }
          }
        }
        rasterPixelBudget+=t.width*t.height+width*height;
        if(rasterPixelBudget>67108864)throw new Fault('PIXEL_BUDGET','Crop exceeds raster budget');
        const image=clone(t);
        t.frame_source={image,frame_height:t.height,indices:[0],resize:{width,height,mode:'crop',offset:[-x,-y]}};
        if(t.layers_enabled)for(const layer of t.layers)layer.offset=[layer.offset[0]-x,layer.offset[1]-y];
        t.width=width;t.height=height;delete t.png;delete t.color;delete t.edits;delete t.baked_layers;delete t.merge_source;
        break;
      }
      case 'texture.resize': {
        const t=textureAccess(op.id),oldWidth=t.width,oldHeight=t.height;
        if(op.frames>1)requireFeature(state,'animated_textures');
        if(op.mode==='scale'&&(op.fill!=='transparent'||op.color!==undefined))throw new Fault('TEXTURE_RESIZE','Fill and color are only applicable to crop');
        if((op.fill==='color')!==(op.color!==undefined))throw new Fault('TEXTURE_RESIZE','Specify color exactly when fill=color');
        const width=op.size[0],height=op.size[1]*op.frames,sx=width/oldWidth,sy=height/oldHeight;
        if(height>4096)throw new Fault('PIXEL_BOUNDS','Resized texture height exceeds 4096');
        const resize=(data:TextureData|TextureData['layers'][number],w:number,h:number)=>{
          if(w<1||h<1||w>4096||h>4096)throw new Fault('PIXEL_BOUNDS','Resized layer dimensions must be 1..4096');
          rasterPixelBudget+=data.width*data.height+w*h;
          if(rasterPixelBudget>67108864)throw new Fault('PIXEL_BUDGET','Resize exceeds raster budget');
          const image=clone(data);
          data.frame_source={image,frame_height:data.height,indices:[0],resize:{width:w,height:h,mode:op.mode,offset:[0,0],fill:data===t&&t.layers_enabled?'transparent':op.fill,color:op.color}};
          data.width=w;data.height=h;delete data.png;delete data.color;delete data.edits;delete data.baked_layers;delete data.merge_source;
        };
        if(t.layers_enabled&&t.layers.length) {
          if(op.mode==='scale')for(const layer of t.layers) {
            resize(layer,Math.round(layer.width*sx),Math.round(layer.height*sy));
            layer.offset=[Math.round(layer.offset[0]*sx),Math.round(layer.offset[1]*sy)];
          }
          resize(t,width,height);
        } else resize(t,width,height);
        const nativeUV=op.uv_mode==='native'&&op.mode==='crop'&&!(op.fill==='repeat'&&state.capabilities.animated_textures&&width<height);
        if(op.uv_mode==='scale'||nativeUV) {
          const targetNodes=state.nodes.filter(n=>Object.values(n.faces??{}).some(f=>(f.resolved_texture??f.texture)===t.id));
          nodesFor(targetNodes.map(n=>n.id),['uv'],false);textureAccess(t.id,['texture','uv']);
          if(state.capabilities.per_texture_uv_size||state.capabilities.single_texture||state.textures.length===1||op.uv_mode==='scale') {
            const uv:[number,number]=[t.uv_width*sx,t.uv_height*sy];
            if(uv.some(v=>v<=0||v>4096))throw new Fault('PROJECT_UV_SIZE','Resulting UV dimensions must be positive and at most 4096');
            if(state.capabilities.per_texture_uv_size){t.uv_width=uv[0];t.uv_height=uv[1];}
            else {
              if(!op.allow_shared_uv)throw new Fault('SHARED_UV_CHANGE','Resize requires allow_shared_uv=true to change project UV');
              nodesFor(state.nodes.map(n=>n.id),['uv'],false);
              for(const other of state.textures){textureAccess(other.id,['texture','uv']);other.uv_width=uv[0];other.uv_height=uv[1];}
            }
            state.project_uv=uv;
          } else for(const n of targetNodes)for(const f of Object.values(n.faces??{}))if((f.resolved_texture??f.texture)===t.id&&f.uv) {
            if(Array.isArray(f.uv))f.uv=f.uv.map((v,i)=>v/(i%2?sy:sx)) as typeof f.uv;
            else for(const uv of Object.values(f.uv)){uv[0]/=sx;uv[1]/=sy;}
          }
        }
        break;
      }
      case 'texture.frames': {
        requireFeature(state,'animated_textures');
        const t=textureAccess(op.id);
          const stride=op.source_frame_height??t.width*t.uv_height/t.uv_width;
          if(op.source_frame_height!==undefined&&stride>t.height)throw new Fault('TEXTURE_FRAME_GEOMETRY','source_frame_height must not exceed source image height');
          const count=op.source_frame_height===undefined?t.height/stride:Math.ceil(t.height/stride);
        if(!Number.isInteger(stride)||stride<1||!Number.isInteger(count)||count<1)throw new Fault('TEXTURE_FRAME_GEOMETRY','Frame dimensions must divide the texture into complete integer rows');
        if(op.indices.some(i=>typeof i==='number'&&i>=count))throw new Fault('TEXTURE_FRAME_INDEX','Source frame index does not exist');
        const width=op.resize?.width??t.width,frameHeight=op.resize?.height??stride,height=frameHeight*op.indices.length;
        if(height>4096)throw new Fault('PIXEL_BOUNDS','Reordered texture height exceeds 4096 pixels');
        if(t.layers_enabled&&!op.flatten_layers)throw new Fault('TEXTURE_FRAME_LAYERS','Explicit flatten_layers=true is required to merge enabled layers');
        if(!op.reset_order&&t.frame_order_type==='custom'&&(t.frame_order??'').trim().split(/\s+/).some(v=>Number.parseInt(v,10)>=op.indices.length))throw new Fault('TEXTURE_FRAME_ORDER','Existing custom order exceeds new frame count; choose reset_order');
        rasterPixelBudget+=t.width*t.height+width*height;
        if(rasterPixelBudget>67108864)throw new Fault('PIXEL_BUDGET','Raster work exceeds the plan pixel budget');
        const sources:NonNullable<TextureData['frame_source']>['sources']={};
        const indices=op.indices.map(index=>{
          if(index===null||typeof index==='number')return index;
          const id=resolve(index.texture),other=getTexture(state,id),frameHeight=other.width*other.uv_height/other.uv_width,frames=other.height/frameHeight;
          if(!Number.isInteger(frameHeight)||frameHeight<1||!Number.isInteger(frames)||index.index>=frames)throw new Fault('TEXTURE_FRAME_INDEX','Imported frame index or dimensions are invalid');
          if(!op.resize&&(other.width!==t.width||frameHeight!==stride))throw new Fault('TEXTURE_FRAME_SIZE','Different source frame dimensions require explicit resize');
          if(!sources[id]) {
            const image=clone(other);
            if(image.layers_enabled){image.baked_layers=image.layers;image.layers=[];image.layers_enabled=false;delete image.png;delete image.color;delete image.edits;}
            sources[id]={image,frame_height:frameHeight};rasterPixelBudget+=other.width*other.height;
          }
          return {texture:id,index:index.index};
        });
        if(rasterPixelBudget>67108864)throw new Fault('PIXEL_BUDGET','Imported frames exceed the plan pixel budget');
        const image=clone(t);
        if(image.layers_enabled){image.baked_layers=image.layers;image.layers=[];image.layers_enabled=false;delete image.png;delete image.color;delete image.edits;}
        t.frame_source={image,frame_height:stride,indices,sources,...(op.resize?{resize:clone(op.resize)}:{})};
        const uvHeight=t.uv_width*frameHeight/width;
        if(uvHeight>4096)throw new Fault('PROJECT_UV_SIZE','Resulting UV height exceeds 4096');
        if(uvHeight!==t.uv_height) {
          if(state.capabilities.per_texture_uv_size){textureAccess(t.id,['texture','uv']);t.uv_height=uvHeight;}
          else {
            if(!op.allow_shared_uv)throw new Fault('SHARED_UV_CHANGE','Aspect change requires allow_shared_uv=true because project UV height affects every texture');
            nodesFor(state.nodes.map(n=>n.id),['uv'],false);
            for(const other of state.textures){textureAccess(other.id,['texture','uv']);other.uv_height=uvHeight;}
            state.project_uv=[t.uv_width,uvHeight];
            warnings.push({severity:'warning',code:'SHARED_UV_CHANGE',message:'Frame aspect ratio changes project UV height for all textures',ids:state.textures.map(t=>t.id)});
          }
        }
        t.width=width;t.height=height;t.layers_enabled=false;t.layers=[];
        delete t.png;delete t.color;delete t.edits;delete t.baked_layers;delete t.merge_source;
        if(op.reset_order){t.frame_order_type='loop';t.frame_order='';}
        break;
      }
      case "texture.delete": {
        const t = textureAccess(op.id);
        if (
          state.nodes.some((n) =>
            Object.values(n.faces ?? {}).some(
              (f) => (f.resolved_texture ?? f.texture) === t.id,
            ),
          )
        )
          throw new Fault(
            "TEXTURE_IN_USE",
            "Unassign texture before deleting it",
          );
        state.textures = state.textures.filter((x) => x.id !== t.id);
        break;
      }
      case "texture.assign": {
        const tid = op.texture ? resolve(op.texture) : null;
        if (tid) getTexture(state, tid);
        const ns = nodesFor(op.ids, ["texture"]);
        for (const n of ns)
          for (const [key, f] of Object.entries(n.faces ?? {})) {
            if (op.faces && !op.faces.includes(key as any)) continue;
            f.texture = tid ?? false;
            f.resolved_texture = tid ?? undefined;
          }
        break;
      }
      case "texture.paint": {
        const t = textureAccess(op.id);
        let target: TextureData | TextureData["layers"][number] = t;
        if (t.layers_enabled) {
          if (!op.layer)
            throw new Fault(
              "LAYER_REQUIRED",
              "Specify a layer UUID for layered textures",
            );
          const l = t.layers.find((l) => l.id === resolve(op.layer!));
          if (!l) throw new Fault("NOT_FOUND", "Layer not found");
          target = l;
        } else if (op.layer)
          throw new Fault("NOT_FOUND", "Texture has no layers");
        for (const e of op.edits) {
          if(e.clip) {
            for(const r of e.clip.rects) if(r.x+r.width>target.width||r.y+r.height>target.height) throw new Fault('PIXEL_BOUNDS','Clip rectangle is outside target canvas');
            rasterPixelBudget+=target.width*target.height+e.clip.rects.reduce((sum,r)=>sum+r.width*r.height,0);
            if(rasterPixelBudget>67108864) throw new Fault('RASTER_LIMIT','Paint clips exceed the plan raster budget');
          }
          if(e.shape!=='fill'&&(e.tolerance!==undefined||e.contiguous!==undefined||e.diagonal!==undefined||e.match_alpha!==undefined)) throw new Fault('PIXEL_SHAPE','Fill parameters require a fill shape');
          if(e.shape==='fill'&&(e.width!==undefined||e.height!==undefined||e.x2!==undefined||e.y2!==undefined)) throw new Fault('PIXEL_SHAPE','Fill takes a seed position, not an area or endpoint');
          if(e.shape!=='ellipse'&&(e.filled!==undefined||e.stroke_width!==undefined)) throw new Fault('PIXEL_SHAPE','filled and stroke_width are only valid for ellipses');
          if(e.shape!=='gradient'&&(e.color2!==undefined||e.gradient_type!==undefined||e.gradient_from!==undefined||e.gradient_to!==undefined)) throw new Fault('PIXEL_SHAPE','Gradient parameters require a gradient shape');
          if (['rect','ellipse','gradient'].includes(e.shape) && (!e.width || !e.height))
            throw new Fault(
              "PIXEL_SHAPE",
              "Area shapes require width and height",
            );
          if (e.shape === "line" && (e.x2 === undefined || e.y2 === undefined))
            throw new Fault("PIXEL_SHAPE", "Line requires x2 and y2");
          if(e.shape==='ellipse'||e.shape==='gradient'||e.shape==='fill') {
            rasterPixelBudget+=e.shape==='fill'?target.width*target.height:e.width!*e.height!;
            if(rasterPixelBudget>67108864) throw new Fault('RASTER_LIMIT','Raster shapes exceed 64 million evaluated pixels in one plan');
          }
          if(e.shape==='gradient' && (!e.color2 || !e.gradient_from || !e.gradient_to || (e.gradient_from[0]===e.gradient_to[0]&&e.gradient_from[1]===e.gradient_to[1])))
            throw new Fault('PIXEL_SHAPE','Gradient requires two colors and distinct gradient_from/gradient_to positions');
          if (
            e.x >= target.width ||
            e.y >= target.height ||
            (e.x2 ?? 0) >= target.width ||
            (e.y2 ?? 0) >= target.height ||
            e.x + (e.width ?? 1) > target.width ||
            e.y + (e.height ?? 1) > target.height
          )
            throw new Fault(
              "PIXEL_BOUNDS",
              "Paint operation is outside target canvas",
            );
        }
        target.edits = [...(target.edits ?? []), ...clone(op.edits)];
        break;
      }
      case "layer.add": {
        const t = textureAccess(op.texture);
        if (!t.layers_enabled) {
          t.layers.push({
            id: newId(),
            name: "Base",
            frame_source:t.frame_source,
            baked_layers: t.baked_layers,
            merge_source: t.merge_source,
            scale: [1, 1],
            blend_mode: 'default',
            in_limbo: false,
            width: t.width,
            height: t.height,
            offset: [0, 0],
            opacity: 100,
            visible: true,
            png: t.png,
            color: t.color,
            edits: t.edits,
          });
          delete t.edits;
          delete t.frame_source;
          delete t.baked_layers;
          delete t.merge_source;
          t.layers_enabled = true;
        }
        t.layers.push({
          id: newId(op.ref),
          name: op.name,
          width: t.width,
          height: t.height,
          offset: [0, 0],
          scale: [1, 1],
          blend_mode: 'default',
          in_limbo: false,
          opacity: 100,
          visible: true,
        });
        break;
      }
      case "layer.update":
      case "layer.delete": {
        const t = textureAccess(op.texture),
          lid = resolve(op.id),
          l = t.layers.find((l) => l.id === lid);
        if (!l) throw new Fault("NOT_FOUND", "Layer not found");
        if (op.op === "layer.delete") {
          if (t.layers.length === 1)
            throw new Fault("LAST_LAYER", "Cannot delete the last layer");
          t.layers = t.layers.filter((l) => l.id !== lid);
        } else
          for (const [k, v] of Object.entries(op))
            if (!["op", "texture", "id"].includes(k) && v !== undefined)
              (l as any)[k] = clone(v);
        break;
      }
      case "layer.reorder": {
        const t = textureAccess(op.texture);
        const ids = op.ids.map(resolve);
        if (!t.layers_enabled || ids.length !== t.layers.length || new Set(ids).size !== ids.length || ids.some(id => !t.layers.some(l => l.id === id)))
          throw new Fault("LAYER_ORDER", "Include every layer of the texture exactly once, in bottom-to-top order");
        const layers = new Map(t.layers.map(l => [l.id, l]));
        t.layers = ids.map(id => layers.get(id)!);
        break;
      }
      case "layer.duplicate": {
        const t = textureAccess(op.texture), lid = resolve(op.id);
        const index = t.layers.findIndex(l => l.id === lid);
        if (!t.layers_enabled || index < 0) throw new Fault("NOT_FOUND", "Layer not found");
        const copy = clone(t.layers[index]);
        copy.id = newId(op.ref);
        copy.name = op.name ?? copy.name;
        copy.in_limbo = false;
        t.layers.splice(index + 1, 0, copy);
        break;
      }
      case "texture.flatten": {
        const t = textureAccess(op.id);
        if (!t.layers_enabled) throw new Fault("LAYERS_DISABLED", "Texture has no enabled layers to flatten");
        rasterPixelBudget += t.width * t.height;
        if (rasterPixelBudget > 67108864) throw new Fault("PIXEL_BUDGET", "Raster work exceeds the plan pixel budget");
        t.baked_layers = t.layers;
        t.layers = [];
        t.layers_enabled = false;
        delete t.png;
        delete t.color;
        delete t.edits;
        delete t.merge_source;
        break;
      }
      case "layer.merge_down": {
        const t = textureAccess(op.texture), index = t.layers.findIndex(l => l.id === resolve(op.id));
        if (!t.layers_enabled || index < 0) throw new Fault("NOT_FOUND", "Layer not found");
        if (index === 0) throw new Fault("BOTTOM_LAYER", "Bottom layer has no layer below it");
        const upper = t.layers[index], lower = t.layers[index - 1];
        const min = [...lower.offset], max = lower.offset.map((v,i) => v + (i ? lower.height : lower.width));
        for (const point of [upper.offset, upper.offset.map((v,i)=>v+(i?upper.height:upper.width))])
          for (let i=0;i<2;i++) {
            const p = Math.max(0,Math.min(i?t.height:t.width,Math.round(point[i])));
            min[i] = Math.min(min[i],p);max[i] = Math.max(max[i],p);
          }
        const width = Math.trunc(max[0]-min[0]), height = Math.trunc(max[1]-min[1]);
        if (width < 1 || height < 1 || width > 4096 || height > 4096) throw new Fault("IMAGE_SIZE", "Merged layer dimensions must be 1..4096 pixels");
        rasterPixelBudget += width * height;
        if (rasterPixelBudget > 67108864) throw new Fault("PIXEL_BUDGET", "Raster work exceeds the plan pixel budget");
        const source = {upper:clone(upper),lower:clone(lower),texture_size:[t.width,t.height] as [number,number]};
        lower.merge_source = source;
        lower.offset = min as [number,number];lower.width = width;lower.height = height;
        delete lower.png;delete lower.color;delete lower.edits;delete lower.baked_layers;
        t.layers.splice(index,1);
        break;
      }
      case "animation.add":
        requireFeature(state, "animation_mode");
        state.animations.push({
          id: newId(op.ref),
          name: op.name,
          length: op.length,
          loop: op.loop,
          snapping: op.snapping,
          override:op.override??false,anim_time_update:op.anim_time_update??'',blend_weight:op.blend_weight??'',start_delay:op.start_delay??'',loop_delay:op.loop_delay??'',markers:clone(op.markers??[]),
          keys: [],
        });
        break;
      case "animation.update":
      case "animation.delete": {
        requireFeature(state, "animation_mode");
        const a = getAnimation(state, resolve(op.id));
        assertUnlocked(
          state,
          locks,
          a.keys.some(k=>k.node==='effects') || (op.op==='animation.update' && op.markers!==undefined)?state.nodes.map(n=>n.id):a.keys.map((k) => k.node),
          ["animation"],
        );
        if (op.op === "animation.delete")
          state.animations = state.animations.filter((x) => x.id !== a.id);
        else
          for (const [k, v] of Object.entries(op))
            if (k !== "op" && k !== "id" && v !== undefined) (a as any)[k] = v;
        break;
      }
      case "keyframe.set": {
        requireFeature(state, "animation_mode");
        const a = getAnimation(state, resolve(op.animation)),
          n = getNode(state, resolve(op.node));
        assertUnlocked(state, locks, [n.id], ["animation"]);
        if (
          !(
            n.animation_channels ??
            (n.type === "group" ? ["position", "rotation", "scale"] : [])
          ).includes(op.channel)
        )
          throw new Fault(
            "UNSUPPORTED_ANIMATOR",
            `Node does not advertise animation channel ${op.channel}`,
          );
        const time = op.snap
          ? Math.round(op.time * a.snapping) / a.snapping
          : op.time;
        const existing = a.keys.find(
          (k) =>
            k.node === n.id &&
            k.channel === op.channel &&
            Math.abs(k.time - time) < 1e-6,
        );
        if (existing && op.collision === "reject")
          throw new Fault(
            "KEY_COLLISION",
            "A key already exists at this time",
            { key_id: existing.id, time },
          );
        if (existing) a.keys = a.keys.filter((k) => k.id !== existing.id);
        a.keys.push({
          id: existing?.id ?? newId(),
          node: n.id,
          channel: op.channel,
          time,
          interpolation: op.interpolation,
          data_points: [{ x: op.values[0], y: op.values[1], z: op.values[2] }],
          bezier_left_time: op.bezier_left_time,
          bezier_right_time: op.bezier_right_time,
          bezier_left_value: op.bezier_left_value,
          bezier_right_value: op.bezier_right_value,
        });
        a.length = Math.max(a.length, time);
        if (time !== op.time)
          warnings.push({
            severity: "info",
            code: "TIME_SNAPPED",
            message: `Time snapped from ${op.time} to ${time}`,
            ids: [a.id],
          });
        break;
      }
      case 'keyframe.update': {
        requireFeature(state,'animation_mode');
        const a=getAnimation(state,resolve(op.animation)),ids=op.ids.map(resolve);
        if(new Set(ids).size!==ids.length) throw new Fault('KEY_SELECTION_DUPLICATE','Keyframe IDs must be unique');
        const keys=ids.map(id=>{
          const key=a.keys.find(k=>k.id===id);
          if(!key) throw new Fault('NOT_FOUND','Keyframe not found');
          return key;
        });
        assertUnlocked(state,locks,keys.some(k=>k.node==='effects')?state.nodes.map(n=>n.id):keys.map(k=>k.node),['animation']);
        for(const key of keys) {
          if(key.node==='effects' && Object.keys(op.patch).some(k=>k!=='color')) throw new Fault('KEY_PATCH_CHANNEL','Effect keys support only color in keyframe.update; use effect_set for effect data');
          if(op.patch.uniform!==undefined && key.channel!=='scale') throw new Fault('KEY_PATCH_CHANNEL','Uniform is only valid on scale keys');
          if(key.node!=='effects') {
            const n=getNode(state,key.node);
            if(!(n.animation_channels??(n.type==='group'?['position','rotation','scale']:[])).includes(key.channel)) throw new Fault('UNSUPPORTED_ANIMATOR','Unsupported keyframe channel');
          }
          Object.assign(key,clone(op.patch));
          if(key.channel==='scale' && key.uniform && key.data_points.some(p=>String(p.x)!==String(p.y)||String(p.x)!==String(p.z))) {
            if(op.patch.uniform===true) throw new Fault('KEY_UNIFORM_VALUES','Uniform scale requires equal X Y Z values in every data point');
            key.uniform=false;
          }
        }
        break;
      }
      case 'keyframe.copy': {
        requireFeature(state,'animation_mode');
        const source=getAnimation(state,resolve(op.animation)),target=getAnimation(state,resolve(op.target_animation));
        const ids=op.ids.map(resolve),selected=ids.map(id=>{
          const key=source.keys.find(k=>k.id===id);
          if(!key) throw new Fault('NOT_FOUND','Source keyframe not found');
          return key;
        });
        const mapping=new Map(Object.entries(op.node_map).map(([from,to])=>[resolve(from),resolve(to)]));
        for(const from of mapping.keys()) if(!selected.some(k=>k.node===from)) throw new Fault('KEY_MAPPING_UNUSED','Node mapping must refer to a selected source target');
        const copied=retimeKeys(selected,ids,op,target.snapping).map((key,i)=>{
          const node=mapping.get(key.node)??key.node;
          if(key.node==='effects' && node!=='effects') throw new Fault('UNSUPPORTED_ANIMATOR','Effects cannot be mapped to a node');
          if(node==='effects') {
            if(key.node!=='effects'||!['particle','sound','timeline'].includes(key.channel)) throw new Fault('UNSUPPORTED_ANIMATOR','Only effect keys may target effects');
          } else {
            const n=getNode(state,node);
            if(!(n.animation_channels??(n.type==='group'?['position','rotation','scale']:[])).includes(key.channel)) throw new Fault('UNSUPPORTED_ANIMATOR','Destination node does not support this animation channel');
          }
          return {...key,node,id:newId(op.ref_prefix?`${op.ref_prefix}_${i}`:undefined)};
        });
        assertUnlocked(state,locks,copied.some(k=>k.node==='effects')?state.nodes.map(n=>n.id):copied.map(k=>k.node),['animation']);
        target.keys=retimeKeys([...target.keys,...copied],copied.map(k=>k.id),{pivot:0,scale:1,offset:0,snap:false,collision:op.collision},target.snapping);
        target.length=Math.max(target.length,...copied.map(k=>k.time));
        if(op.scale<0) warnings.push({severity:'warning',code:'RETIME_REVERSED_KEYS',message:'Copied key times and Bezier handles reversed; complete playback reversal is not guaranteed',ids:[target.id]});
        break;
      }
      case 'keyframe.effect_set': {
        requireFeature(state,'animation_mode');
        const a=getAnimation(state,resolve(op.animation));
        assertUnlocked(state,locks,state.nodes.map(n=>n.id),['animation']);
        const time=op.snap?Math.round(op.time*a.snapping)/a.snapping:op.time;
        const existing=a.keys.find(k=>k.node==='effects'&&k.channel===op.effect.channel&&Math.abs(k.time-time)<1e-6);
        if(existing&&op.collision==='reject') throw new Fault('KEY_COLLISION','An effect key already exists at this time');
        if(existing) a.keys=a.keys.filter(k=>k!==existing);
        a.keys.push({id:existing?.id??newId(),node:'effects',channel:op.effect.channel,time,interpolation:'linear',data_points:clone(op.effect.data_points)});
        a.length=Math.max(a.length,time);
        break;
      }
      case 'keyframe.retime': {
        requireFeature(state,'animation_mode');
        const a=getAnimation(state,resolve(op.animation)),ids=op.ids.map(resolve);
        const keys=retimeKeys(a.keys,ids,op,a.snapping);
        for(const key of a.keys.filter(k=>ids.includes(k.id))) {
          if(key.node==='effects' && ['sound','particle','timeline'].includes(key.channel)) continue;
          const node=getNode(state,key.node);
          if(!(node.animation_channels??(node.type==='group'?['position','rotation','scale']:[])).includes(key.channel))
            throw new Fault('UNSUPPORTED_ANIMATOR','Retime requires a supported node animation channel');
        }
        const selectedKeys=a.keys.filter(k=>ids.includes(k.id));
        assertUnlocked(state,locks,selectedKeys.some(k=>k.node==='effects')?state.nodes.map(n=>n.id):selectedKeys.map(k=>k.node),['animation']);
        a.keys=keys;
        a.length=Math.max(a.length,...keys.map(k=>k.time));
        if(op.scale<0) warnings.push({severity:'warning',code:'RETIME_REVERSED_KEYS',message:'Key times and Bezier handles reversed; step/easing and multi-point discontinuities are retained, so continuous playback reversal is not guaranteed',ids:[a.id]});
        break;
      }
      case "keyframe.delete": {
        const a = getAnimation(state, resolve(op.animation));
        const ks = op.ids.map((id) => {
          const k = a.keys.find((k) => k.id === resolve(id));
          if (!k) throw new Fault("NOT_FOUND", "Keyframe not found");
          return k;
        });
        assertUnlocked(
          state,
          locks,
          ks.some(k=>k.node==='effects')?state.nodes.map(n=>n.id):ks.map((k) => k.node),
          ["animation"],
        );
        a.keys = a.keys.filter((k) => !ks.includes(k));
        break;
      }
    }
  }
  if (
    state.nodes.length > 20000 ||
    state.textures.length > 256 ||
    state.animations.length > 256
  )
    throw new Fault("SIZE_LIMIT", "Project exceeds edit limits");
  const changes = diff(original, state);
  for(const change of changes.filter(c=>c.kind==='texture'&&c.action!=='delete'&&c.fields.some(k=>['width','height','uv_width','uv_height','frame_order','frame_order_type'].includes(k)))) {
    const texture=state.textures.find(t=>t.id===change.id)!;
    if(texture.frame_order_type!=='custom')continue;
    const count=state.capabilities.animated_textures?Math.max(1,Math.ceil((texture.uv_width/texture.uv_height)/(texture.width/texture.height)-0.05)):1;
    const tokens=(texture.frame_order??'').trim().split(/\s+/);
    if(tokens.some(token=>!/^\d+(?::[1-9]\d*)?$/.test(token)||Number(token.split(':')[0])>=count||(token.includes(':')&&Number(token.split(':')[1])>1000000)))throw new Fault('TEXTURE_FRAME_ORDER','Final texture dimensions invalidate custom frame order; update the affected texture order in the same plan',{texture_id:texture.id,frame_count:count});
  }
  const changed = new Set(changes.map((c) => c.id));
  const issues = diagnose(state);
  const errors = issues.filter(
    (i) => i.severity === "error" && i.ids.some((id) => changed.has(id)),
  );
  if (errors.length)
    throw new Fault(
      "VALIDATION_FAILED",
      "Planned model violates constraints",
      errors,
    );
  for (const n of state.nodes.filter((n) => changed.has(n.id))) {
    if (
      n.box_uv &&
      !state.capabilities.box_uv &&
      !state.capabilities.optional_box_uv
    )
      throw new Fault("BOX_UV", "Format does not allow Box UV");
    if (n.faces)
      for (const f of Object.values(n.faces)) {
        if (
          n.type === "mesh" &&
          (Array.isArray(f.uv) ||
            !f.vertices ||
            f.vertices.some((v) => !n.vertices?.[v] || !(v in f.uv)))
        )
          throw new Fault(
            "MESH_FACE",
            "Mesh face must have existing vertices and UV for each vertex",
          );
        if (n.type === "cube" && (!Array.isArray(f.uv) || f.uv.length !== 4))
          throw new Fault("CUBE_FACE", "Cube UV must be a rectangle");
      }
  }
  return {
    state,
    changes,
    warnings: [
      ...warnings,
      ...issues.filter(
        (i) => i.severity !== "error" && i.ids.some((id) => changed.has(id)),
      ),
    ].slice(0, 200),
    created,
  };
}
export function templateOperations(raw: unknown): Operation[] {
  const t = templateSchema.parse(raw);
  if (t.size.some((v) => v <= 0))
    throw new Fault("INVALID_SIZE", "Template dimensions must be positive");
  const [x, y, z] = t.origin,
    [w, h, d] = t.size;
  const group: Operation = {
    op: "group.add",
    ref: "root",
    name: t.name,
    parent: t.parent,
    origin: [x, y, z],
  };
  const cube = (
    name: string,
    from: Vec3,
    to: Vec3,
    parent = "$root",
  ): Operation => ({
    op: "cube.add",
    name,
    from,
    to,
    parent,
    origin: [x, y, z],
  });
  if (t.template === "door")
    return [
      group,
      cube(`${t.name}_panel`, [x, y, z - d / 2], [x + w, y + h, z + d / 2]),
      cube(
        `${t.name}_handle`,
        [x + w * 0.8, y + h * 0.45, z + d / 2],
        [x + w * 0.9, y + h * 0.55, z + d],
      ),
    ];
  if (t.template === "joint")
    return [
      group,
      cube(
        `${t.name}_upper`,
        [x - w / 2, y, z - d / 2],
        [x + w / 2, y + h / 2, z + d / 2],
      ),
      {
        op: "group.add",
        ref: "hinge",
        name: `${t.name}_hinge`,
        parent: "$root",
        origin: [x, y + h / 2, z],
      },
      cube(
        `${t.name}_lower`,
        [x - w / 2, y + h / 2, z - d / 2],
        [x + w / 2, y + h, z + d / 2],
        "$hinge",
      ),
    ];
  if (t.template === "handle")
    return [
      group,
      cube(
        `${t.name}_grip`,
        [x - w * 0.3, y, z - d * 0.3],
        [x + w * 0.3, y + h, z + d * 0.3],
      ),
      cube(
        `${t.name}_cap_bottom`,
        [x - w / 2, y, z - d / 2],
        [x + w / 2, y + h * 0.1, z + d / 2],
      ),
      cube(
        `${t.name}_cap_top`,
        [x - w / 2, y + h * 0.9, z - d / 2],
        [x + w / 2, y + h, z + d / 2],
      ),
    ];
  return [
    group,
    cube(t.name, [x - w / 2, y, z - d / 2], [x + w / 2, y + h, z + d / 2]),
  ];
}
