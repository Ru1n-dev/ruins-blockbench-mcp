import {z} from 'zod';
import {Fault,type NodeData,type Vec2} from './types.ts';
const pair=z.tuple([z.number().finite(),z.number().finite()]);
export const uvSnapSchema=z.object({
 corners:z.array(z.object({face:z.string().min(1),vertex:z.string().min(1)}).strict()).min(1).max(20000).optional(),
 faces:z.array(z.string().min(1)).min(1).max(6).optional().describe('Cube face IDs; mutually exclusive with mesh corners. Requires face UV, not box UV.'),
 step:z.tuple([z.number().finite().positive(),z.number().finite().positive()]).describe('Positive U/V grid spacing in UV units; texture dimensions are not inferred.'),
 origin:pair.default([0,0]).describe('Grid origin in UV units.'),
 axes:z.enum(['u','v','both']).default('both'),
 rounding:z.enum(['nearest','floor','ceil']).default('nearest').describe('Nearest uses Math.round, including ties toward positive infinity.'),
 bounds:z.object({min:pair,max:pair}).strict().refine(b=>b.min.every((v,i)=>v<=b.max[i]),'Minimum must not exceed maximum').optional().describe('Optional post-snap clamp on selected axes only; bounds need not lie on the grid.'),
}).strict().refine(p=>!!p.corners!==!!p.faces,'Specify exactly one of corners or faces');
export function snapMeshUV(node:NodeData,raw:unknown):Record<string,Record<string,Vec2>|number[]>{
 const p=uvSnapSchema.parse(raw);
 if(p.faces){
  if(node.type!=='cube')throw new Fault('TYPE_MISMATCH','Face rectangle snapping requires a cube');
  if(node.box_uv)throw new Fault('UV_SNAP_BOX_UV','Cube snapping requires face UV');
  if(new Set(p.faces).size!==p.faces.length)throw new Fault('UV_SNAP_DUPLICATE','Each face must be listed once');
  const result:Record<string,number[]>=Object.create(null);
  for(const face of p.faces){
   const uv=node.faces?.[face]?.uv;
   if(!Array.isArray(uv)||uv.length!==4||!uv.every(Number.isFinite))throw new Fault('UV_SNAP_FACE','Expected an existing cube face with a finite UV rectangle',{face});
   result[face]=uv.map((v,i)=>snapCoordinate(v,i%2,p));
  }
  return result;
 }
 if(node.type!=='mesh')throw new Fault('TYPE_MISMATCH','UV corner snapping requires a mesh');
 const seen=new Set<string>(),result:Record<string,Record<string,Vec2>>=Object.create(null);
 for(const {face,vertex} of p.corners!){
  const key=JSON.stringify([face,vertex]);
  if(seen.has(key))throw new Fault('UV_SNAP_DUPLICATE','Each corner must be listed once');seen.add(key);
  const f=node.faces?.[face],uv=(f?.uv as Record<string,Vec2>|undefined)?.[vertex];
  if(!f?.vertices?.includes(vertex)||!node.vertices?.[vertex]||!Array.isArray(uv)||uv.length!==2||!uv.every(Number.isFinite))throw new Fault('UV_SNAP_CORNER','Expected an existing face vertex with finite UV coordinates',{face,vertex});
  const target:Vec2=[...uv];
  for(let axis=0;axis<2;axis++)target[axis]=snapCoordinate(uv[axis],axis,p);
  if(!Object.hasOwn(result,face))result[face]=Object.fromEntries(Object.entries(f.uv).map(([k,v])=>[k,Array.isArray(v)?[...v]:v])) as Record<string,Vec2>;
  result[face][vertex]=target;
 }
 return result;
}

function snapCoordinate(value:number,axis:number,p:z.infer<typeof uvSnapSchema>):number{
 if((p.axes==='u'&&axis===1)||(p.axes==='v'&&axis===0))return value;
 const units=(value-p.origin[axis])/p.step[axis];
 const rounded=p.rounding==='nearest'?Math.round(units):p.rounding==='floor'?Math.floor(units):Math.ceil(units);
 let result=p.origin[axis]+rounded*p.step[axis];
 if(!Number.isFinite(units)||!Number.isFinite(result))throw new Fault('UV_SNAP_RANGE','UV grid calculation exceeded finite range');
 if(p.bounds)result=Math.max(p.bounds.min[axis],Math.min(p.bounds.max[axis],result));
 return Object.is(result,-0)?0:result;
}
