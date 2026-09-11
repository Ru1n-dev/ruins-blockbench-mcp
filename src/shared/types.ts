export type Vec3 = [number, number, number];
export type Vec2 = [number, number];
export type Domain = "geometry" | "uv" | "texture" | "animation" | "structure";
export interface FaceData {
  enabled?: boolean;
  tint?: number;
  cullface?: string;
  material_name?: string;
  uv: number[] | Record<string, Vec2>;
  texture?: string | null | false;
  resolved_texture?: string;
  rotation?: number;
  vertices?: string[];
}
export interface NodeData {
  render_order?: "default" | "behind" | "in_front";
  shade?: boolean;
  light_emission?: number;
  native_copy?: Record<string, any>;
  id: string;
  type: string;
  name: string;
  parent: string | null;
  origin: Vec3;
  rotation: Vec3;
  from?: Vec3;
  to?: Vec3;
  inflate?: number;
  autouv?: number;
  box_uv?: boolean;
  uv_offset?: Vec2;
  mirror_uv?: boolean;
  vertices?: Record<string, Vec3>;
  seams?: Record<string, string>;
  vertex_weights?: Record<string, number>;
  length?: number;
  width?: number;
  connected?: boolean;
  color?: number;
  locked?: boolean;
  export?: boolean;
  faces?: Record<string, FaceData>;
  visibility?: boolean;
  scope?: number;
  animation_channels?: string[];
}
export type PaintMode='replace'|'over'|'erase'|'atop'|'behind'|'multiply'|'screen'|'overlay'|'darken'|'lighten'|'difference'|'add';
export interface PaintClip {rects:{x:number;y:number;width:number;height:number}[];invert?:boolean;}
export interface PixelEdit {
  shape: "rect" | "line" | "pixel" | 'ellipse' | 'gradient' | 'fill';
  x: number;
  y: number;
  x2?: number;
  y2?: number;
  width?: number;
  height?: number;
  color: string;
  color2?: string;
  filled?: boolean;
  stroke_width?: number;
  gradient_type?: 'linear'|'radial';
  gradient_from?: Vec2;
  gradient_to?: Vec2;
  tolerance?: number;
  contiguous?: boolean;
  diagonal?: boolean;
  match_alpha?: boolean;
  mode?: PaintMode;
  opacity?: number;
  clip?: PaintClip;
}
export interface LayerData {
  frame_source?: {curves?: {curves:Partial<Record<'rgb'|'r'|'g'|'b'|'a',Array<[number,number]>>>;rect:[number,number,number,number]}; saturation_hue?: {saturation:number;hue:number;brightness:number;rect:[number,number,number,number]}; brightness_contrast?: {brightness:number;contrast:number;rect:[number,number,number,number]}; opacity?: {mode:'multiply'|'source_over'|'set';value:number;include_transparent:boolean;rect:[number,number,number,number]}; invert?: {channels:Array<'red'|'green'|'blue'|'alpha'>;amount:number;rect:[number,number,number,number]}; palette?: {colors:string[];alpha_min:number;rect:[number,number,number,number]}; channel?: 'red'|'green'|'blue'|'alpha'|'color'; transform?: 'flip_x'|'flip_y'|'rotate_cw'|'rotate_ccw'|'rotate_180'; image: TextureData | LayerData; frame_height:number; indices:Array<number|null|{texture:string;index:number}>; sources?:Record<string,{image:TextureData;frame_height:number}>; resize?:{width:number;height:number;mode:'crop'|'scale';offset:Vec2;fill?:'transparent'|'color'|'repeat';color?:string}};
  merge_source?: {upper: LayerData; lower: LayerData; texture_size: Vec2};
  baked_layers?: LayerData[];
  id: string;
  name: string;
  visible: boolean;
  opacity: number;
  offset: Vec2;
  scale?: Vec2;
  blend_mode?: 'default' | 'set_opacity' | 'color' | 'multiply' | 'add' | 'darken' | 'lighten' | 'screen' | 'overlay' | 'difference' | 'alpha_mask';
  in_limbo?: boolean;
  png?: string;
  color?: string;
  width: number;
  height: number;
  edits?: PixelEdit[];
}
export interface TextureData {
  frame_source?: {curves?: {curves:Partial<Record<'rgb'|'r'|'g'|'b'|'a',Array<[number,number]>>>;rect:[number,number,number,number]}; saturation_hue?: {saturation:number;hue:number;brightness:number;rect:[number,number,number,number]}; brightness_contrast?: {brightness:number;contrast:number;rect:[number,number,number,number]}; opacity?: {mode:'multiply'|'source_over'|'set';value:number;include_transparent:boolean;rect:[number,number,number,number]}; invert?: {channels:Array<'red'|'green'|'blue'|'alpha'>;amount:number;rect:[number,number,number,number]}; palette?: {colors:string[];alpha_min:number;rect:[number,number,number,number]}; channel?: 'red'|'green'|'blue'|'alpha'|'color'; transform?: 'flip_x'|'flip_y'|'rotate_cw'|'rotate_ccw'|'rotate_180'; image: TextureData | LayerData; frame_height:number; indices:Array<number|null|{texture:string;index:number}>; sources?:Record<string,{image:TextureData;frame_height:number}>; resize?:{width:number;height:number;mode:'crop'|'scale';offset:Vec2;fill?:'transparent'|'color'|'repeat';color?:string}};
  fps?: number;
  frame_time?: number;
  frame_order_type?: string;
  frame_order?: string;
  frame_interpolate?: boolean;
  group?: string;
  pbr_channel?: string;
  render_mode?: string;
  render_sides?: string;
  wrap_mode?: string;
  merge_source?: {upper: LayerData; lower: LayerData; texture_size: Vec2};
  baked_layers?: LayerData[];
  id: string;
  name: string;
  width: number;
  height: number;
  uv_width: number;
  uv_height: number;
  png?: string;
  color?: string;
  edits?: PixelEdit[];
  layers: LayerData[];
  layers_enabled: boolean;
  sync_to_project?: string;
}
export interface KeyData {
  id: string;
  node: string;
  channel: string;
  time: number;
  interpolation: string;
  color?: number;
  uniform?: boolean;
  bezier_linked?: boolean;
  data_points: Record<string, string | number | boolean>[];
  bezier_left_time?: Vec3;
  bezier_right_time?: Vec3;
  bezier_left_value?: Vec3;
  bezier_right_value?: Vec3;
  easing?: string;
  easingArgs?: number[];
}
export interface AnimationData {
  id: string;
  name: string;
  length: number;
  loop: "once" | "hold" | "loop";
  snapping: number;
  anim_time_update?: string;
  override?: boolean;
  blend_weight?: string;
  start_delay?: string;
  loop_delay?: string;
  markers?: {time:number;color:number;name:string|number}[];
  keys: KeyData[];
}
export interface Capabilities {
  java_cube_shading_properties?: boolean;
  java_face_properties?: boolean;
  cullfaces?: boolean;
  per_texture_wrap_mode?: boolean;
  animated_textures?: boolean;
  texture_mcmeta?: boolean;
  armature_rig?: boolean;
  edit_mode?: boolean;
  meshes: boolean;
  bone_rig: boolean;
  animation_mode: boolean;
  optional_box_uv: boolean;
  box_uv: boolean;
  single_texture: boolean;
  per_texture_uv_size: boolean;
  rotate_cubes: boolean;
  rotation_limit: boolean;
  rotation_snap: boolean;
  uv_rotation: boolean;
  cube_limits?: [number | null, number | null];
}
export interface ModelState {
  texture_groups?: TextureGroupData[];
  project_id: string;
  name: string;
  format: string;
  revision: number;
  project_uv?: [number, number];
  capabilities: Capabilities;
  nodes: NodeData[];
  textures: TextureData[];
  animations: AnimationData[];
}
export interface Protection {
  id: string;
  label: string;
  node_ids: string[];
  domains: Domain[];
  descendants: boolean;
}
export interface Change {
  kind: "node" | "texture" | "animation" | "texture_group";
  id: string;
  action: "add" | "update" | "delete";
  fields: string[];
}
export interface TextureGroupData {
  id:string;
  name:string;
  is_material:boolean;
  material_config:{color_value:[number,number,number,number];mer_value:Vec3;subsurface_value:number;saved:boolean};
}
export interface Issue {
  severity: "error" | "warning" | "info";
  code: string;
  message: string;
  ids: string[];
}
export interface Plan {
  state: ModelState;
  changes: Change[];
  warnings: Issue[];
  created: Record<string, string>;
}
export interface Result {
  data: Record<string, unknown>;
  images?: { label: string; data: string; mimeType: "image/png" }[];
}
export class Fault extends Error {
  constructor(
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}
export const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
export function stable(value: unknown): string {
  if (value === undefined) return "null";
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj)
    .sort()
    .filter((k) => obj[k] !== undefined)
    .map((k) => `${JSON.stringify(k)}:${stable(obj[k])}`)
    .join(",")}}`;
}
export const errorData = (e: unknown) =>
  e instanceof Fault
    ? { code: e.code, message: e.message, details: e.details }
    : {
        code: "INTERNAL_ERROR",
        message: e instanceof Error ? e.message : String(e),
      };
