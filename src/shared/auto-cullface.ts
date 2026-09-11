import { z } from 'zod';
import { id } from './schema.ts';
import { Fault } from './types.ts';
const vector=z.tuple([z.number().finite().min(-100000).max(100000),z.number().finite().min(-100000).max(100000),z.number().finite().min(-100000).max(100000)]);
export const cullDirections=['east','up','south','west','down','north'] as const;
export const autoCullfaceSchema=z.object({project_id:id,snapshot_id:id,ids:z.array(id).min(1).max(2000).refine(v=>new Set(v).size===v.length,'IDs must be unique'),faces:z.array(z.enum(cullDirections)).min(1).max(6).refine(v=>new Set(v).size===v.length,'Faces must be unique').default([...cullDirections]),min:vector.default([0,0,0]),max:vector.default([16,16,16]),tolerance:z.number().finite().positive().max(1000).default(0.02),outer_distance:z.number().finite().positive().max(100000).default(16),include_disabled:z.boolean().default(false)}).strict().refine(v=>v.min.every((x,i)=>x<v.max[i]),'Every minimum must be below its maximum').refine(v=>v.tolerance<v.outer_distance,'Tolerance must be below outer_distance');
export function classifyCullface(face:typeof cullDirections[number], corners:number[][], options:{min:number[];max:number[];tolerance:number;outer_distance:number}){
  if(corners.length!==4||corners.some(c=>c.length!==3||c.some(v=>!Number.isFinite(v))))throw new Fault('CULLFACE_GEOMETRY','Expected four finite global face vertices');
  const index=cullDirections.indexOf(face),axis=index%3,positive=index<3;
  const low=positive?options.max[axis]-options.tolerance:options.min[axis]-options.outer_distance;
  const high=positive?options.max[axis]+options.outer_distance:options.min[axis]+options.tolerance;
  return corners.every(c=>c[axis]>low&&c[axis]<high&&c.every((v,i)=>i===axis||(v>=options.min[i]&&v<=options.max[i])))?face:'';
}
