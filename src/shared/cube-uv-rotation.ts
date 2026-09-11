import {z} from 'zod';
import {Fault,type NodeData} from './types.ts';
const angle=z.union([z.literal(0),z.literal(90),z.literal(180),z.literal(270)]);
export const cubeUvRotationSchema=z.object({
 faces:z.array(z.string().min(1)).min(1).max(6),
 angle,
 rectangle:z.enum(['per_face','reference','preserve']).default('per_face').describe('Swap signed width/height for odd quarter-turn differences per face, relative to reference_angle, or preserve rectangles.'),
 reference_angle:angle.optional(),
 upper_bound:z.tuple([z.number().finite().positive(),z.number().finite().positive()]).optional().describe('After a width/height swap, translate excess U/V down to these upper limits. Does not clamp lower bounds or resize rectangles.'),
}).strict().refine(p=>(p.rectangle==='reference')===(p.reference_angle!==undefined),'reference_angle is required only for reference mode');
export function rotateCubeUV(node:NodeData,raw:unknown){
 const p=cubeUvRotationSchema.parse(raw);
 if(node.type!=='cube')throw new Fault('TYPE_MISMATCH','Cube UV rotation requires a cube');
 if(node.box_uv)throw new Fault('BOX_UV','Cube UV rotation requires face UV');
 if(new Set(p.faces).size!==p.faces.length)throw new Fault('UV_FACE_DUPLICATE','Each face must be listed once');
 const faces:Record<string,{uv:number[],rotation:number}>=Object.create(null);let turned=false;
 for(const key of p.faces){
  const f=node.faces?.[key],uv=f?.uv,old=f?.rotation??0;
  if(!Array.isArray(uv)||uv.length!==4||!uv.every(Number.isFinite)||![0,90,180,270].includes(old))throw new Fault('UV_CUBE_FACE','Expected an existing cube face with finite UV rectangle and quarter-turn rotation',{face:key});
  let result=[...uv];
  const source=p.rectangle==='reference'?p.reference_angle!:old;
  if(p.rectangle!=='preserve'&&Math.abs(p.angle-source)%180===90){
   turned=true;
   const width=uv[2]-uv[0],height=uv[3]-uv[1];
   const u=uv[0]+Math.min(width,0)-Math.min(height,0),v=uv[1]-Math.min(width,0)+Math.min(height,0);
   result=[u,v,u+height,v+width];
   if(!result.every(Number.isFinite))throw new Fault('UV_CUBE_RANGE','Rectangle turn exceeded finite UV range');
   if(p.upper_bound){
    const du=Math.max(0,Math.max(result[0],result[2])-p.upper_bound[0]),dv=Math.max(0,Math.max(result[1],result[3])-p.upper_bound[1]);
    result=[result[0]-du,result[1]-dv,result[2]-du,result[3]-dv];
   }
  }
  if(!result.every(Number.isFinite))throw new Fault('UV_CUBE_RANGE','Rectangle adjustment exceeded finite UV range');
  faces[key]={uv:result,rotation:p.angle};
 }
 return {faces,turned};
}
