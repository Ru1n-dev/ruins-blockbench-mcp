import {z} from 'zod';
import {Fault,type NodeData,type Vec2} from './types.ts';
const id=z.string().min(1);
export const uvWeldSchema=z.object({
 mode:z.enum(['first','average']).default('first').describe('Use the first corner UV of each group, or its arithmetic mean. Geometry vertices are not merged.'),
 groups:z.array(z.array(z.object({face:id,vertex:id}).strict()).min(2).max(20000)).min(1).max(10000)
  .refine(groups=>groups.reduce((n,g)=>n+g.length,0)<=20000,'At most 20000 total corners')
  .describe('Disjoint ordered groups of explicit face/vertex UV corners, within one mesh.'),
}).strict();
export function weldMeshUV(node:NodeData,raw:unknown):Record<string,Record<string,Vec2>>{
 const p=uvWeldSchema.parse(raw);
 if(node.type!=='mesh')throw new Fault('TYPE_MISMATCH','UV welding requires a mesh');
 const seen=new Set<string>(),result:Record<string,Record<string,Vec2>>=Object.create(null);
 for(const group of p.groups){
  const values=group.map(({face,vertex})=>{
   const key=JSON.stringify([face,vertex]);if(seen.has(key))throw new Fault('UV_WELD_OVERLAP','Each UV corner may occur only once');seen.add(key);
   const f=node.faces?.[face],uv=f?.uv as Record<string,Vec2>|undefined;
   if(!f?.vertices?.includes(vertex)||!node.vertices?.[vertex]||!uv?.[vertex]||uv[vertex].length!==2||!uv[vertex].every(Number.isFinite))throw new Fault('UV_WELD_CORNER','Each corner requires an existing face vertex with finite UV coordinates',{face,vertex});
   return uv[vertex];
  });
  const target:Vec2=p.mode==='first'?[...values[0]]:[0,1].map(axis=>values.reduce((sum,v)=>sum+v[axis]/values.length,0)) as Vec2;
  if(!target.every(Number.isFinite))throw new Fault('UV_WELD_RANGE','UV welding produced non-finite coordinates');
  for(const {face,vertex} of group){
   if(!Object.hasOwn(result,face))result[face]=Object.fromEntries(Object.entries(node.faces![face].uv).map(([key,uv])=>[key,Array.isArray(uv)?[...uv]:uv])) as Record<string,Vec2>;
   result[face][vertex]=[...target];
  }
 }
 return result;
}
