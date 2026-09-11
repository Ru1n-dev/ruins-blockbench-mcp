import {z} from 'zod';
import {Fault,type NodeData,type Vec2} from './types.ts';
const pair=z.tuple([z.number().finite(),z.number().finite()]);
export const uvRotateSchema=z.object({
 corners:z.array(z.object({face:z.string().min(1),vertex:z.string().min(1)}).strict()).min(1).max(20000).describe('Explicit, unique mesh face/vertex UV corners.'),
 angle:z.number().finite().describe('Degrees in UV coordinates. Positive rotates +U toward +V. Normalized modulo 360.'),
 bounds:z.object({min:pair,max:pair}).strict().refine(b=>b.min.every((v,i)=>v<=b.max[i]),'Minimum must not exceed maximum').optional().describe('Optional UV bounds applied after rotation. Omit to preserve unrestricted UVs.'),
 center:z.tuple([z.number().finite(),z.number().finite()]).describe('Required pivot in UV units; never inferred from current selection.'),
}).strict();
export function rotateMeshUV(node:NodeData,raw:unknown):Record<string,Record<string,Vec2>>{
 const p=uvRotateSchema.parse(raw);
 if(node.type!=='mesh')throw new Fault('TYPE_MISMATCH','Corner rotation requires a mesh');
 const degrees=p.angle%360,radians=degrees*(Math.PI/180);
 const quadrant=((degrees/90)%4+4)%4;
 const cos=degrees%90===0?[1,0,-1,0][quadrant]:Math.cos(radians);
 const sin=degrees%90===0?[0,1,0,-1][quadrant]:Math.sin(radians);
 const seen=new Set<string>(),result:Record<string,Record<string,Vec2>>=Object.create(null);
 for(const {face,vertex} of p.corners){
  const key=JSON.stringify([face,vertex]);
  if(seen.has(key))throw new Fault('UV_ROTATE_DUPLICATE','Each corner must occur once');seen.add(key);
  const f=node.faces?.[face],uv=(f?.uv as Record<string,Vec2>|undefined)?.[vertex];
  if(!f?.vertices?.includes(vertex)||!node.vertices?.[vertex]||!Array.isArray(uv)||uv.length!==2||!uv.every(Number.isFinite))throw new Fault('UV_ROTATE_CORNER','Expected an existing face vertex with finite UV coordinates',{face,vertex});
  const x=uv[0]-p.center[0],y=uv[1]-p.center[1];
  const value:Vec2=degrees===0?[...uv]:[p.center[0]+x*cos-y*sin,p.center[1]+x*sin+y*cos];
  if(!value.every(Number.isFinite))throw new Fault('UV_ROTATE_RANGE','Rotation produced non-finite UV coordinates');
  if(p.bounds)for(let axis=0;axis<2;axis++)value[axis]=Math.max(p.bounds.min[axis],Math.min(p.bounds.max[axis],value[axis]));
  if(!Object.hasOwn(result,face))result[face]=Object.fromEntries(Object.entries(f.uv).map(([k,v])=>[k,Array.isArray(v)?[...v]:v])) as Record<string,Vec2>;
  result[face][vertex]=value.map(v=>Object.is(v,-0)?0:v) as Vec2;
 }
 return result;
}
