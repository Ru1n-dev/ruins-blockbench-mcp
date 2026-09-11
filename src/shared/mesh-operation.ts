import { z } from 'zod';
import {meshPrimitiveSchema} from './mesh-primitive.ts';
import {knifeParameters} from './knife-operation.ts';
const distance = z.number().finite().min(-100000).max(100000);
export const meshOperationSchema = z.discriminatedUnion('operation', [
  z.object({operation:z.literal('knife'),parameters:knifeParameters}).strict(),
  z.object({operation:z.literal('delete_components'),parameters:z.object({selection_mode:z.enum(['vertex','edge','face','cluster']),keep_vertices:z.boolean().default(false),reference_policy:z.enum(['cleanup','native']).default('cleanup')}).strict()}).strict(),
  z.object({operation:z.literal('convert_to_mesh'),parameters:z.object({source_ids:z.array(z.string().min(1)).min(1).max(1000)}).strict()}).strict(),
  z.object({operation:z.literal('calculate_vertex_weights'),parameters:z.object({}).strict().default({})}).strict(),
  z.object({operation:z.literal('set_vertex_weights'),parameters:z.object({
    mode:z.enum(['replace','merge']).default('replace'),normalize:z.boolean().default(false),
    vertices:z.array(z.object({mesh_id:z.string().min(1),vertex_id:z.string().min(1),weights:z.record(z.string().min(1),z.number().finite().min(0).max(1))}).strict()).min(1).max(20000),
  }).strict()}).strict(),
  z.object({operation:z.literal('create_primitive'),parent_id:z.string().min(1).nullable().default(null),parameters:meshPrimitiveSchema}).strict(),
  z.object({operation:z.literal('merge_meshes'),parameters:z.object({target_mesh_id:z.string().min(1),weight_policy:z.enum(['preserve','native','remap']).default('preserve'),bone_map:z.record(z.string().min(1),z.string().min(1)).optional()}).strict().refine(p=>(p.weight_policy==='remap')===(p.bone_map!==undefined),'bone_map is required only for remap policy')}).strict(),
  z.object({operation:z.literal('split_mesh'),parameters:z.object({weight_policy:z.enum(['preserve','native']).default('preserve')}).strict().default({weight_policy:'preserve'})}).strict(),
  z.object({operation:z.enum(['merge_vertices_distance_first','merge_vertices_distance_center']),parameters:z.object({distance:z.number().finite().min(0).max(100000),weight_policy:z.enum(['first','average','native']).default('first'),seam_policy:z.enum(['preserve','native']).default('preserve'),seam_conflict:z.enum(['reject','divide','join']).default('reject')}).strict()}).strict(),
  z.object({operation:z.enum(['merge_vertices_first','merge_vertices_center']),parameters:z.object({weight_policy:z.enum(['first','average','native']).default('first'),seam_policy:z.enum(['preserve','native']).default('preserve'),seam_conflict:z.enum(['reject','divide','join']).default('reject')}).strict().default({weight_policy:'first',seam_policy:'preserve',seam_conflict:'reject'})}).strict(),
  z.object({operation:z.literal('dissolve_edges'),parameters:z.object({reference_policy:z.enum(['cleanup','native']).default('cleanup')}).strict().default({reference_policy:'cleanup'})}).strict(),
  z.object({operation:z.enum(['create_faces','apply_rotation','invert_faces','switch_crease']),parameters:z.object({}).strict().default({})}).strict(),
  z.object({operation:z.literal('extrude'),parameters:z.object({
    seam_policy:z.enum(['preserve','native']).default('preserve'),weight_policy:z.enum(['preserve','native']).default('preserve'),
    extend:distance.default(1),
    direction_mode:z.enum(['outwards','average','x+','x-','y+','y-','z+','z-']).default('outwards'),
    even_extend:z.boolean().default(false),
  }).strict().default({extend:1,direction_mode:'outwards',even_extend:false,weight_policy:'preserve',seam_policy:'preserve'})}).strict(),
  z.object({operation:z.literal('inset'),parameters:z.object({offset:z.number().finite().min(0).max(100).default(50),seam_policy:z.enum(['preserve','native']).default('preserve'),weight_policy:z.enum(['preserve','native']).default('preserve')}).strict().default({offset:50,weight_policy:'preserve',seam_policy:'preserve'})}).strict(),
  z.object({operation:z.literal('solidify'),parameters:z.object({thickness:distance.default(1),seam_policy:z.enum(['preserve','native']).default('preserve'),weight_policy:z.enum(['preserve','native']).default('preserve')}).strict().default({thickness:1,weight_policy:'preserve',seam_policy:'preserve'})}).strict(),
  z.object({operation:z.literal('loop_cut'),parameters:z.object({
    length_reference:z.enum(['first_mesh','each_mesh','native']).default('first_mesh'),
    seam_policy:z.enum(['preserve','native']).default('preserve'),
    weight_policy:z.enum(['preserve','native']).default('preserve'),
    direction:z.number().int().min(0).max(3).default(0),
    cuts:z.number().int().min(1).max(16).default(1),
    offset:z.number().finite().min(0).max(100000).optional(),
    unit:z.enum(['size','percent']).default('size'),
  }).strict().default({direction:0,cuts:1,unit:'size',weight_policy:'preserve',seam_policy:'preserve',length_reference:'first_mesh'})}).strict(),
]);
export const meshActionIds = {
  knife:'knife_tool',
  delete_components:'delete',
  convert_to_mesh:'convert_to_mesh',
  calculate_vertex_weights:'calculate_vertex_weights',
  set_vertex_weights:'set_vertex_weights',
  create_primitive:'add_mesh',
  create_faces:'create_face',
  merge_meshes:'merge_meshes',split_mesh:'split_mesh',
  apply_rotation:'apply_mesh_rotation',invert_faces:'invert_face',switch_crease:'switch_face_crease',dissolve_edges:'dissolve_edges',
  merge_vertices_first:'merge_vertices',merge_vertices_center:'merge_vertices',
  merge_vertices_distance_first:'merge_vertices',merge_vertices_distance_center:'merge_vertices',
  extrude:'extrude_mesh_selection',inset:'inset_mesh_selection',
  solidify:'solidify_mesh_selection',loop_cut:'loop_cut',
} as const;
