import {cubeUvRotationSchema} from './cube-uv-rotation.ts';
import {uvRotateSchema} from './uv-rotate.ts';
import {uvSnapSchema} from './uv-snap.ts';
import {uvWeldSchema} from './uv-weld.ts';
import {uvAlignSchema} from './uv-align.ts';
import { z } from "zod";
import {textureSetDocument} from './texture-set.ts';
import {effectKeyframeSchema} from './effect-keyframe.ts';
import { uvProjectionSchema } from "./uv-projection.ts";
const num = z.number().finite();
const coordinate = num.min(-100000).max(100000);
export const v3 = z.tuple([coordinate, coordinate, coordinate]);
const v2 = z.tuple([coordinate, coordinate]);
export const id = z.string().min(1).max(160);
const name = z.string().min(1).max(160);
const color = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/, "Use #RRGGBB or #RRGGBBAA");
const ids = z.array(id).min(1).max(2000);
const textureCurve=z.array(z.tuple([z.number().min(0).max(1),z.number().min(0).max(1)])).min(2).max(256).refine(p=>p.length>=2&&p[0][0]===0&&p[p.length-1][0]===1&&p.every((v,i)=>i===0||v[0]>=p[i-1][0]),'Curve x coordinates must be ordered with endpoints 0 and 1');
const animationSettings={
  override:z.boolean().optional(),anim_time_update:z.string().max(10000).optional(),blend_weight:z.string().max(10000).optional(),
  start_delay:z.string().max(10000).optional(),loop_delay:z.string().max(10000).optional(),
  markers:z.array(z.object({time:num.min(0).max(1000),color:z.number().int().min(0).max(9).default(0),name:z.string().max(160).default('')}).strict()).max(2000)
    .refine(markers=>{const times=markers.map(m=>m.time).sort((a,b)=>a-b);return times.every((t,i)=>i===0||t-times[i-1]>=0.001);},'Markers must be at least 0.001 seconds apart').optional(),
};
const direction = z.enum(["north", "south", "east", "west", "up", "down"]);
const face = z
  .object({
    uv: z.union([
      z.tuple([coordinate, coordinate, coordinate, coordinate]),
      z.record(id, v2),
    ]),
    texture: id.nullable().or(z.literal(false)).optional(),
    rotation: z
      .union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)])
      .optional(),
    vertices: z.array(id).min(2).max(4).optional(),
  })
  .strict();
export const pixelEditSchema = z
  .object({
    shape: z.enum(["rect", "line", "pixel",'ellipse','gradient','fill']),
    x: z.number().int().min(0).max(4095),
    y: z.number().int().min(0).max(4095),
    x2: z.number().int().min(0).max(4095).optional(),
    y2: z.number().int().min(0).max(4095).optional(),
    width: z.number().int().min(1).max(4096).optional(),
    height: z.number().int().min(1).max(4096).optional(),
    color,
    color2:color.optional(),filled:z.boolean().optional(),stroke_width:z.number().int().min(1).max(4096).optional(),
    gradient_type:z.enum(['linear','radial']).optional(),gradient_from:v2.optional(),gradient_to:v2.optional(),
    tolerance:z.number().int().min(0).max(255).optional(),contiguous:z.boolean().optional(),diagonal:z.boolean().optional(),match_alpha:z.boolean().optional(),
    mode:z.enum(['replace','over','erase','atop','behind','multiply','screen','overlay','darken','lighten','difference','add']).optional(),opacity:num.min(0).max(1).optional(),
    clip:z.object({rects:z.array(z.object({x:z.number().int().min(0).max(4095),y:z.number().int().min(0).max(4095),width:z.number().int().min(1).max(4096),height:z.number().int().min(1).max(4096)}).strict()).max(2000),invert:z.boolean().default(false)}).strict().optional(),
  })
  .strict();
const ref = { ref: name.optional() };
const parent = { parent: id.nullable().optional() };
const nodePatch = {
  name: name.optional(),
  origin: v3.optional(),
  rotation: v3.optional(),
  visibility: z.boolean().optional(),
};
const cubePatch = {
  ...nodePatch,
  from: v3.optional(),
  to: v3.optional(),
  inflate: num.min(-1000).max(1000).optional(),
  box_uv: z.boolean().optional(),
  uv_offset: v2.optional(),
  mirror_uv: z.boolean().optional(),
};
export const operationSchema = z.discriminatedUnion("op", [
  z.object({op:z.literal('node.duplicate'),id,...ref,name:name.optional(),copy_animations:z.boolean().default(false)}).strict(),
  z.object({op:z.literal('cube.material_instances'),ids,faces:z.partialRecord(direction,z.string().max(1000)).refine(faces=>Object.keys(faces).length>0,'At least one face is required')}).strict(),
  z.object({op:z.literal('texture_set.import'),...ref,name,document:textureSetDocument,texture_bindings:z.record(z.string().min(1).max(400),id).default({})}).strict(),
  z.object({op:z.literal('texture_group.add'),...ref,name,is_material:z.boolean().default(false)}).strict(),
  z.object({op:z.literal('texture_group.update'),id,name:name.optional(),is_material:z.boolean().optional(),
    color_value:z.tuple([num.min(0).max(255),num.min(0).max(255),num.min(0).max(255),num.min(0).max(255)]).optional(),
    mer_value:z.tuple([num.min(0).max(255),num.min(0).max(255),num.min(0).max(255)]).optional(),subsurface_value:num.min(0).max(255).optional()}).strict(),
  z.object({op:z.literal('texture_group.delete'),id}).strict(),
  z
    .object({
      op: z.literal("mesh.weights"),
      mode: z.enum(["replace", "merge"]).default("replace"),
      normalize: z.boolean().default(false),
      vertices: z
        .array(
          z
            .object({
              mesh_id: id,
              vertex_id: id,
              weights: z.record(id, num.min(0).max(1)).refine((weights) => Object.keys(weights).length <= 256, "A vertex may reference at most 256 bones"),
            })
            .strict(),
        )
        .min(1)
        .max(20000),
    })
    .strict(),
  z
    .object({
      op: z.literal("cube.add"),
      ...ref,
      ...parent,
      name,
      from: v3,
      to: v3,
      origin: v3.optional(),
      rotation: v3.optional(),
      box_uv: z.boolean().optional(),
    })
    .strict(),
  z.object({ op: z.literal("cube.update"), id, ...cubePatch }).strict(),
  z
    .object({
      op: z.literal("group.add"),
      ...ref,
      ...parent,
      name,
      origin: v3.optional(),
      rotation: v3.optional(),
    })
    .strict(),
  z.object({ op: z.literal("group.update"), id, ...nodePatch }).strict(),
  z.object({op:z.literal('armature.add'),...ref,name,...parent,
    visibility:z.boolean().default(true),locked:z.boolean().default(false),export:z.boolean().default(true)}).strict(),
  z.object({op:z.literal('armature.update'),id,name:name.optional(),
    visibility:z.boolean().optional(),locked:z.boolean().optional(),export:z.boolean().optional()}).strict(),
  z.object({op:z.literal('armature.delete'),id}).strict(),
  z.object({op:z.literal('armature_bone.delete'),id,remove_children:z.boolean().default(true)}).strict(),
  z.object({op:z.literal('armature_bone.reparent'),id,parent:id}).strict(),
  z.object({op:z.literal('armature_bone.add'),...ref,name,parent:id,origin:v3.optional(),rotation:v3.optional(),
    length:num.min(0).max(100000).optional(),width:num.min(0).max(100000).optional(),
    connected:z.boolean().default(true),color:z.number().int().min(0).max(9).default(0),
    visibility:z.boolean().default(true),locked:z.boolean().default(false),export:z.boolean().default(true)}).strict(),
  z.object({op:z.literal('armature_bone.update'),id,...nodePatch,
    length:num.min(0).max(100000).optional(),width:num.min(0).max(100000).optional(),
    connected:z.boolean().optional(),color:z.number().int().min(0).max(9).optional(),
    locked:z.boolean().optional(),export:z.boolean().optional(),
  }).strict(),
  z
    .object({
      op: z.literal("mesh.add"),
      ...ref,
      ...parent,
      name,
      origin: v3.optional(),
      rotation: v3.optional(),
      vertices: z.record(id, v3),
      faces: z.record(id, face),
    })
    .strict(),
  z
    .object({
      op: z.literal("mesh.update"),
      id,
      ...nodePatch,
      vertices: z.record(id, v3).optional(),
      faces: z.record(id, face).optional(),
    })
    .strict(),
  z.object({op:z.literal('uv.copy'),source_id:id,target_id:id,mappings:z.array(z.object({source:z.object({face:id,vertex:id}).strict(),target:z.object({face:id,vertex:id}).strict()}).strict()).min(1).max(20000),texture:z.enum(['preserve','source_face']).default('preserve').describe('Optionally copy each mapped source face texture assignment to its target face. Conflicting assignments to the same target face are rejected.')}).strict(),
  z.object({op:z.literal('uv.snap'),id,snap:uvSnapSchema}).strict(),
  z.object({op:z.literal('cube.face_copy'),source:z.object({id,face:direction}).strict(),targets:z.array(z.object({id,faces:z.array(direction).min(1).max(6).refine(v=>new Set(v).size===v.length,'Faces must be unique')}).strict()).min(1).max(2000),fields:z.array(z.enum(['uv','rotation','texture','tint','cullface','material_name','enabled'])).min(1).max(7).refine(v=>new Set(v).size===v.length,'Fields must be unique'),autouv:z.enum(['preserve','disable']).default('preserve')}).strict(),
  z.object({op:z.literal('cube.uv_rotation'),id,rotation:cubeUvRotationSchema}).strict(),
  z.object({op:z.literal('uv.rotate'),id,rotation:uvRotateSchema}).strict(),
  z.object({op:z.literal('uv.weld'),id,weld:uvWeldSchema}).strict(),
  z.object({op:z.literal('uv.align'),id,alignment:uvAlignSchema}).strict(),
  z.object({op:z.literal('uv.project'),id,faces:z.array(id).min(1).max(20000),projection:uvProjectionSchema}).strict(),
  z.object({op:z.literal('spline.vertices'),id,handle_mode:z.enum(['free','aligned','mirrored']).default('free').describe('Explicit control coupling, independent of toolbar and UI selection. Unspecified opposite controls mirror the supplied control, or align while preserving their length. Both controls explicitly supplied are unchanged by coupling; joint-only updates do not move controls.'),vertices:z.record(id,v3).refine(v=>Object.keys(v).length>0&&Object.keys(v).length<=20000,'Specify 1 to 20000 vertices')}).strict(),
  z.object({op:z.literal('spline.handles'),id,handles:z.record(id,z.object({size:num.min(0).max(100000).optional(),tilt:coordinate.optional()}).strict().refine(v=>v.size!==undefined||v.tilt!==undefined,'Specify size or tilt')).refine(v=>Object.keys(v).length>0&&Object.keys(v).length<=20000,'Specify 1 to 20000 handles')}).strict(),
  z.object({op:z.literal('spline.settings'),ids,radial_resolution:z.number().int().min(3).max(512).optional(),tubular_resolution:z.number().int().min(1).max(512).optional(),radius_multiplier:num.min(0).max(100000).optional(),render_mode:z.enum(['mesh','path']).optional(),uv_mode:z.enum(['length_accurate','uniform','per_segment']).optional(),shading:z.enum(['flat','smooth']).optional(),display_space:z.boolean().optional(),cyclic:z.boolean().optional()}).strict().refine(v=>Object.keys(v).some(k=>!['op','ids'].includes(k)),'Specify at least one spline setting'),
  z.object({op:z.literal('node.flags').describe('Set explicit visibility/locked/export flags on group, cube, mesh and spline IDs independently of native selection. UI locked does not block this operation; bb_protection rules do.'),ids,descendants:z.boolean().default(false).describe('Also apply to every descendant of the requested IDs; reject unsupported descendant types'),visibility:z.boolean().optional(),locked:z.boolean().optional(),export:z.boolean().optional()}).strict().refine(o=>o.visibility!==undefined||o.locked!==undefined||o.export!==undefined,'At least one flag is required'),
  z.object({op:z.literal('node.render_order'),ids,value:z.enum(['default','behind','in_front'])}).strict(),
  z.object({op:z.literal('cube.shading'),ids,shade:z.boolean().optional(),light_emission:z.number().int().min(0).max(15).optional()}).strict().refine(v=>v.shade!==undefined||v.light_emission!==undefined,'Specify shade or light_emission'),
  z.object({op:z.literal('face.uv_export'),ids,faces:z.array(direction).min(1).max(6).refine(v=>new Set(v).size===v.length,'Faces must be unique'),enabled:z.boolean()}).strict(),
  z.object({op:z.literal('face.tint'),ids,faces:z.array(direction).min(1).max(6).refine(v=>new Set(v).size===v.length,'Faces must be unique'),value:z.number().int().min(-1),include_disabled:z.boolean().default(false)}).strict(),
  z.object({op:z.literal('face.cullface'),ids,faces:z.array(direction).min(1).max(6).refine(v=>new Set(v).size===v.length,'Faces must be unique'),value:z.union([direction,z.literal(''),z.literal('same')]),include_disabled:z.boolean().default(false)}).strict(),
  z.object({op:z.literal("face.remove_blank"),ids,empty:z.enum(["keep","skip","delete"])}).strict(),
  z.object({ op: z.literal("node.delete"), ids }).strict(),
  z
    .object({ op: z.literal("node.reparent"), ids, parent: id.nullable() })
    .strict(),
  z.object({ op: z.literal("node.rename"), id, name }).strict(),
  z.object({ op: z.literal("node.translate"), ids, offset: v3 }).strict(),
  z
    .object({ op: z.literal("node.scale"), ids, factors: v3, pivot: v3 })
    .strict(),
  z
    .object({
      op: z.literal("node.mirror"),
      ids,
      axis: z.enum(["x", "y", "z"]),
      center: num.default(0),
      duplicate: z.boolean().default(true),
      mirror_uv: z.boolean().default(false),
    })
    .strict(),
  z
    .object({
      op: z.literal("node.align"),
      ids,
      axis: z.enum(["x", "y", "z"]),
      mode: z.enum(["min", "center", "max"]),
      position: num,
    })
    .strict(),
  z
    .object({
      op: z.literal("uv.set"),
      id,
      faces: z.record(id, face),
      box_uv: z.literal(false).optional(),
    })
    .strict(),
  z
    .object({
      op: z.literal("uv.transform"),
      ids,
      scale: v2.default([1, 1]),
      offset: v2.default([0, 0]),
      rotation: z
        .union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)])
        .default(0),
    })
    .strict(),
  z
    .object({
      op: z.literal("uv.density"),
      ids,
      pixels_per_unit: num.positive().max(1024),
    })
    .strict(),
  z
    .object({
      op: z.literal("texture.add"),
      ...ref,
      name,
      width: z.number().int().min(1).max(4096),
      height: z.number().int().min(1).max(4096),
      uv_width: num.positive().max(4096).optional(),
      uv_height: num.positive().max(4096).optional(),
      color: color.default("#00000000"),
      png: z
        .string()
        .max(24000000)
        .startsWith("data:image/png;base64,")
        .optional(),
    })
    .strict(),
  z
    .object({
      op: z.literal("texture.update"),
      id,
      name: name.optional(),
      fps:z.number().int().min(1).max(1000).optional(),
      frame_time:z.number().int().min(1).max(1000000).optional(),
      frame_order_type:z.enum(['custom','loop','backwards','back_and_forth']).optional(),
      frame_order:z.string().max(20000).optional(),
      frame_interpolate:z.boolean().optional(),
      group:id.nullable().optional(),
      pbr_channel:z.enum(['color','normal','height','mer']).optional(),
      render_mode:z.enum(['default','emissive','additive']).optional(),
      render_sides:z.enum(['auto','front','double']).optional(),
      wrap_mode:z.enum(['limited','repeat','clamp']).optional(),
      uv_width: num.positive().max(4096).optional(),
      uv_height: num.positive().max(4096).optional(),
    })
    .strict(),
  z.object({op:z.literal('texture.frames'),id,source_frame_height:z.number().int().min(1).max(4096).optional().describe('Re-split the source image into rows of this pixel height (at most source height), padding the final partial frame with transparency. Indices refer to this new partition. Omit to require complete existing frames.'),resize:z.object({width:z.number().int().min(1).max(4096),height:z.number().int().min(1).max(4096),mode:z.enum(['crop','scale']).default('crop'),offset:z.tuple([z.number().int().min(-4096).max(4096),z.number().int().min(-4096).max(4096)]).default([0,0])}).strict().optional(),allow_shared_uv:z.boolean().default(false),indices:z.array(z.union([z.number().int().min(0).max(4095),z.object({texture:id,index:z.number().int().min(0).max(4095)}).strict()]).nullable()).min(1).max(4096),flatten_layers:z.boolean().default(false),reset_order:z.boolean().default(false)}).strict(),
  z.object({op:z.literal('texture.split_channels'),id,mode:z.enum(['rgb','alpha']),replace_layers:z.boolean().default(false),ref_prefix:id.optional()}).strict(),
  z.object({op:z.literal('texture.opacity'),id,layer:id.optional(),mode:z.enum(['multiply','source_over','set']),value:z.number().min(0).max(255),include_transparent:z.boolean().default(false),rect:z.tuple([z.number().int().min(0),z.number().int().min(0),z.number().int().min(1),z.number().int().min(1)]).optional(),flatten_layers:z.boolean().default(false)}).strict().refine(v=>v.mode==='set'?Number.isInteger(v.value):v.value<=2,'Set value must be an integer; multiplier must be at most 2').refine(v=>v.mode==='set'||!v.include_transparent,'include_transparent requires set mode'),
  z.object({op:z.literal('texture.curves'),id,layer:id.optional(),curves:z.object({rgb:textureCurve.optional(),r:textureCurve.optional(),g:textureCurve.optional(),b:textureCurve.optional(),a:textureCurve.optional()}).strict(),rect:z.tuple([z.number().int().min(0),z.number().int().min(0),z.number().int().min(1),z.number().int().min(1)]).optional(),flatten_layers:z.boolean().default(false)}).strict(),
  z.object({op:z.literal('texture.saturation_hue'),id,layer:id.optional(),saturation:z.number().min(0).max(2).default(1),hue:z.number().min(-180).max(180).default(0),brightness:z.number().min(0).max(2).default(1),rect:z.tuple([z.number().int().min(0),z.number().int().min(0),z.number().int().min(1),z.number().int().min(1)]).optional(),flatten_layers:z.boolean().default(false)}).strict(),
  z.object({op:z.literal('texture.brightness_contrast'),id,layer:id.optional(),brightness:z.number().min(0).max(2).default(1),contrast:z.number().min(0).max(2).default(1),rect:z.tuple([z.number().int().min(0),z.number().int().min(0),z.number().int().min(1),z.number().int().min(1)]).optional(),flatten_layers:z.boolean().default(false)}).strict(),
  z.object({op:z.literal('texture.invert'),id,layer:id.optional(),channels:z.array(z.enum(['red','green','blue','alpha'])).min(1).max(4).refine(v=>new Set(v).size===v.length,'Channels must be unique').default(['red','green','blue']),amount:z.number().min(0).max(1).default(1),rect:z.tuple([z.number().int().min(0),z.number().int().min(0),z.number().int().min(1),z.number().int().min(1)]).optional(),flatten_layers:z.boolean().default(false)}).strict(),
  z.object({op:z.literal('texture.palette'),id,layer:id.optional(),colors:z.array(z.string().regex(/^#[0-9a-fA-F]{6}$/)).max(256),alpha_min:z.number().int().min(0).max(255).default(4),rect:z.tuple([z.number().int().min(0),z.number().int().min(0),z.number().int().min(1),z.number().int().min(1)]).optional(),flatten_layers:z.boolean().default(false)}).strict(),
  z.object({op:z.literal('texture.transform'),id,layer:id.optional(),transform:z.enum(['flip_x','flip_y','rotate_cw','rotate_ccw','rotate_180']),size_mode:z.enum(['keep','expand']).default('keep'),flatten_layers:z.boolean().default(false)}).strict(),
  z.object({op:z.literal('texture.crop'),id,rect:z.tuple([z.number().int().min(0),z.number().int().min(0),z.number().int().min(1).max(4096),z.number().int().min(1).max(4096)]),uv_mode:z.enum(['adjust','remap','preserve']).default('adjust').describe('adjust retains UV units per pixel and changes resolution; remap keeps resolution and rescales assigned face UVs; preserve leaves both unchanged.'),mixed_box_uv:z.enum(['reject','convert']).default('reject').describe('Explicitly convert Box UV to per-face UV for mixed materials or remap scaling when the format allows it.'),allow_shared_uv:z.boolean().default(false)}).strict(),
  z.object({op:z.literal('texture.resize'),id,size:z.tuple([z.number().int().min(1).max(4096),z.number().int().min(1).max(4096)]),frames:z.number().int().min(1).max(2048).default(1).describe('Output height multiplier for size[1], not a guaranteed playback frame count. Native crop UV adjustment can keep one frame; preserve UV or repeat fill when extending a flipbook.'),mode:z.enum(['crop','scale']),fill:z.enum(['transparent','color','repeat']).default('transparent'),color:color.optional(),uv_mode:z.enum(['native','preserve','scale']).default('native'),allow_shared_uv:z.boolean().default(false)}).strict(),
  z.object({ op: z.literal("texture.delete"), id }).strict(),
  z
    .object({
      op: z.literal("texture.assign"),
      ids,
      texture: id.nullable(),
      faces: z.array(direction).optional(),
    })
    .strict(),
  z
    .object({
      op: z.literal("texture.paint"),
      id,
      layer: id.optional(),
      edits: z.array(pixelEditSchema).min(1).max(20000),
    })
    .strict(),
  z.object({ op: z.literal("layer.add"), texture: id, ...ref, name }).strict(),
  z
    .object({
      op: z.literal("layer.update"),
      texture: id,
      id,
      name: name.optional(),
      visible: z.boolean().optional(),
      opacity: num.min(0).max(100).optional(),
      offset: v2.optional(),
      scale: z.tuple([num.gt(0).max(100), num.gt(0).max(100)]).optional(),
      blend_mode: z.enum(['default','set_opacity','color','multiply','add','darken','lighten','screen','overlay','difference','alpha_mask']).optional(),
    })
    .strict(),
  z.object({ op: z.literal("layer.delete"), texture: id, id }).strict(),
  z.object({ op: z.literal("layer.reorder"), texture: id, ids: z.array(id).min(1).max(2000) }).strict(),
  z.object({ op: z.literal("layer.duplicate"), texture: id, id, ...ref, name: name.optional() }).strict(),
  z.object({ op: z.literal("texture.flatten"), id }).strict(),
  z.object({ op: z.literal("layer.merge_down"), texture: id, id }).strict(),
  z
    .object({
      op: z.literal("animation.add"),
      ...animationSettings,
      ...ref,
      name,
      length: num.min(0).max(1000).default(1),
      loop: z.enum(["once", "hold", "loop"]).default("loop"),
      snapping: z.number().int().min(1).max(500).default(24),
    })
    .strict(),
  z
    .object({
      op: z.literal("animation.update"),
      ...animationSettings,
      id,
      name: name.optional(),
      length: num.min(0).max(1000).optional(),
      loop: z.enum(["once", "hold", "loop"]).optional(),
      snapping: z.number().int().min(1).max(500).optional(),
    })
    .strict(),
  z.object({ op: z.literal("animation.delete"), id }).strict(),
  z
    .object({
      op: z.literal("keyframe.set"),
      animation: id,
      node: id,
      channel: id,
      time: num.min(0).max(1000),
      values: z.tuple([
        z.union([num, z.string().max(1000)]),
        z.union([num, z.string().max(1000)]),
        z.union([num, z.string().max(1000)]),
      ]),
      interpolation: z
        .enum(["linear", "catmullrom", "bezier", "step"])
        .default("linear"),
      collision: z.enum(["reject", "replace"]).default("reject"),
      snap: z.boolean().default(true),
      bezier_left_time: v3.optional(),
      bezier_right_time: v3.optional(),
      bezier_left_value: v3.optional(),
      bezier_right_value: v3.optional(),
    })
    .strict(),
  z.object({ op: z.literal("keyframe.delete"), animation: id, ids }).strict(),
  z.object({op:z.literal('keyframe.update'),animation:id,ids,patch:z.object({
    color:z.number().int().min(-1).max(9).optional(),uniform:z.boolean().optional(),bezier_linked:z.boolean().optional(),
    interpolation:z.enum(['linear','catmullrom','bezier','step']).optional(),
    bezier_left_time:v3.optional(),bezier_right_time:v3.optional(),bezier_left_value:v3.optional(),bezier_right_value:v3.optional(),
    data_points:z.array(z.object({x:z.union([num,z.string().max(1000)]),y:z.union([num,z.string().max(1000)]),z:z.union([num,z.string().max(1000)])}).strict()).min(1).max(2).optional(),
  }).strict().refine(p=>Object.keys(p).length>0,'Patch must have at least one field')}).strict(),
  z.object({op:z.literal('keyframe.effect_set'),animation:id,time:num.min(0).max(1000),effect:effectKeyframeSchema,snap:z.boolean().default(true),collision:z.enum(['reject','replace']).default('reject')}).strict(),
  z.object({op:z.literal('keyframe.retime'),animation:id,ids,
    pivot:num.min(0).max(1000).default(0),offset:num.min(-1000).max(1000).default(0),
    scale:num.min(-1000).max(1000).refine(v=>v!==0,'Scale cannot be zero').default(1),
    snap:z.boolean().default(false),collision:z.enum(['reject','replace']).default('reject'),
  }).strict(),
  z.object({op:z.literal('keyframe.copy'),animation:id,target_animation:id,ids,node_map:z.record(id,id).default({}),
    pivot:num.min(0).max(1000).default(0),offset:num.min(-1000).max(1000).default(0),
    scale:num.min(-1000).max(1000).refine(v=>v!==0,'Scale cannot be zero').default(1),
    snap:z.boolean().default(false),collision:z.enum(['reject','replace']).default('reject'),
    ref_prefix:z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]{0,63}$/).optional(),
  }).strict(),
]);
export type Operation = z.infer<typeof operationSchema>;
export const editSchema = z
  .object({
    project_id: id,
    snapshot_id: id,
    label: name.default("MCP edit"),
    operations: z.array(operationSchema).min(1).max(500),
  })
  .strict();
export const protectionSchema = z
  .object({
    id,
    label: name,
    node_ids: ids,
    domains: z
      .array(z.enum(["geometry", "uv", "texture", "animation", "structure"]))
      .min(1),
    descendants: z.boolean().default(true),
  })
  .strict();
export const querySchema = z
  .object({
    ids: ids.optional(),
    descendant_of: id.optional(),
    name_contains: z.string().max(160).optional(),
    type: z.string().max(50).optional(),
    texture: id.optional(),
    offset: z.number().int().min(0).default(0),
    limit: z.number().int().min(1).max(500).default(100),
  })
  .strict();
export const templateSchema = z
  .object({
    template: z.enum(["handle", "door", "joint", "box"]),
    name: name.default("Part"),
    origin: v3.default([0, 0, 0]),
    size: v3.default([4, 8, 2]),
    parent: id.nullable().optional(),
  })
  .strict();
