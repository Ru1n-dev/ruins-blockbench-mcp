import {z} from 'zod';
import {Fault, type NodeData, type Vec2} from './types.ts';
const finite=z.number().finite();
const positive=finite.positive().max(100000);
const vector=z.tuple([finite,finite,finite]);
const projectionBasis=z.object({x:vector,y:vector,z:vector}).strict().refine(b=>{
  const axes=[b.x,b.y,b.z],dot=(a:number[],c:number[])=>a.reduce((n,v,i)=>n+v*c[i],0);
  if(axes.some(a=>Math.abs(dot(a,a)-1)>1e-8))return false;
  if(Math.abs(dot(b.x,b.y))>1e-8||Math.abs(dot(b.x,b.z))>1e-8||Math.abs(dot(b.y,b.z))>1e-8)return false;
  const cross=[b.x[1]*b.y[2]-b.x[2]*b.y[1],b.x[2]*b.y[0]-b.x[0]*b.y[2],b.x[0]*b.y[1]-b.x[1]*b.y[0]];
  return Math.abs(dot(cross,b.z)-1)<=1e-8;
},'Projection basis must contain right-handed orthonormal unit axes (tolerance 1e-8)');
const common={axis:z.enum(['x','y','z']).default('y').describe('Projection axis in basis coordinates; defaults to the mesh local Y axis when basis is omitted.'),center:z.tuple([finite,finite,finite]).default([0,0,0]).describe('Projection center in mesh local coordinates, before applying basis.'),
  basis:projectionBasis.optional().describe('Optional right-handed orthonormal unit axes expressed in mesh local coordinates; tolerance 1e-8. Projects by dot products without modifying geometry. Does not include parent or animation world transforms.'),
  uv_size:z.tuple([positive,positive]).describe('Projection width and height in UV units, not necessarily image pixels.'),offset:z.tuple([finite,finite]).default([0,0]).describe('UV-unit translation applied after projection and flips.'),
  flip_u:z.boolean().default(false),flip_v:z.boolean().default(false)};
export const uvProjectionSchema=z.discriminatedUnion('mode',[
  z.object({...common,mode:z.literal('planar'),model_size:z.tuple([positive,positive])}).strict(),
  z.object({...common,mode:z.literal('cylinder'),height:positive,seam_angle:finite.default(0),wrap_faces:z.boolean().default(true)}).strict(),
  z.object({...common,mode:z.literal('sphere'),seam_angle:finite.default(0),wrap_faces:z.boolean().default(true)}).strict(),
]);

export function projectMeshUV(node:NodeData,faceKeys:string[],raw:unknown):Record<string,Record<string,Vec2>> {
  const p=uvProjectionSchema.parse(raw);
  if(node.type!=='mesh' || !node.vertices) throw new Fault('TYPE_MISMATCH','UV projection requires a mesh');
  if(new Set(faceKeys).size!==faceKeys.length) throw new Fault('UV_FACE_DUPLICATE','Each projected face must be listed once');
  const axes=p.axis==='x'?[2,0,1]:p.axis==='y'?[0,1,2]:[0,2,1];
  const result:Record<string,Record<string,Vec2>>={};
  for(const key of faceKeys) {
    const face=node.faces?.[key];
    if(!face?.vertices?.length) throw new Fault('NOT_FOUND',`Mesh face ${key} is missing`);
    const points=face.vertices.map(v=>{
      const point=node.vertices![v];
      if(!point) throw new Fault('MISSING_VERTEX',`Face ${key} references ${v}`);
      const relative=point.map((n,i)=>n-p.center[i]);
      const delta=p.basis?[p.basis.x,p.basis.y,p.basis.z].map(b=>b.reduce((sum,v,i)=>sum+v*relative[i],0)):relative;
      const [x,y,z]=axes.map(i=>delta[i]);
      if(p.mode==='planar') return [0.5+x/p.model_size[0],0.5-z/p.model_size[1]] as Vec2;
      const radius=Math.hypot(x,y,z);
      if(p.mode==='sphere' && radius<1e-12) throw new Fault('UV_PROJECTION_CENTER',`Vertex ${v} is at the spherical projection center`);
      const angle=Math.atan2(x,z)-p.seam_angle*Math.PI/180;
      const u=((angle/(2*Math.PI)+0.5)%1+1)%1;
      const vertical=p.mode==='cylinder'?0.5-y/p.height:Math.acos(Math.max(-1,Math.min(1,y/radius)))/Math.PI;
      return [u,vertical] as Vec2;
    });
    if(p.mode!=='planar' && p.wrap_faces && points.length>1) {
      // Cut the circle at its largest empty gap, avoiding a full-width seam stretch.
      const values=[...new Set(points.map(v=>v[0]))].sort((a,b)=>a-b);
      let gap=-1,start=values[0];
      for(let i=0;i<values.length;i++) {
        const next=i+1<values.length?values[i+1]:values[0]+1;
        if(next-values[i]>gap) {gap=next-values[i];start=next%1;}
      }
      for(const uv of points) if(uv[0]<start-1e-12) uv[0]+=1;
    }
    result[key]=Object.fromEntries(face.vertices.map((v,i)=>{
      const uv=points[i];
      const output:Vec2=[(p.flip_u?1-uv[0]:uv[0])*p.uv_size[0]+p.offset[0],(p.flip_v?1-uv[1]:uv[1])*p.uv_size[1]+p.offset[1]];
      if(!output.every(Number.isFinite)) throw new Fault('UV_PROJECTION_RANGE','Projection produced non-finite UV coordinates');
      return [v,output];
    }));
  }
  return result;
}
