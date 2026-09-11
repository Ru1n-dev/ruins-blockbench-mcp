import {z} from 'zod';
import {Fault,type NodeData,type Vec2} from './types.ts';
const id=z.string().min(1),anchor=z.object({face:id,vertices:z.tuple([id,id])}).strict();
export const uvAlignSchema=z.object({
 fixed:anchor.describe('Fixed UV anchor: first vertex is the destination origin, second defines direction.'),
 moving:anchor.describe('Moving UV anchor, with ordered vertices corresponding to the fixed pair.'),
 faces:z.array(id).min(1).max(20000).describe('Faces transformed together; includes moving.face and excludes fixed.face.'),
 scale:z.enum(['none','uniform']).default('none').describe('none preserves UV distances; uniform matches both anchor endpoints.'),
}).strict();
export function alignMeshUV(node:NodeData,raw:unknown):Record<string,Record<string,Vec2>>{
 const p=uvAlignSchema.parse(raw);
 if(node.type!=='mesh')throw new Fault('TYPE_MISMATCH','UV alignment requires a mesh');
 if(new Set(p.faces).size!==p.faces.length)throw new Fault('UV_FACE_DUPLICATE','List each moving face once');
 if(!p.faces.includes(p.moving.face)||p.faces.includes(p.fixed.face))throw new Fault('UV_ALIGN_FACES','Moving faces must include the moving anchor and exclude the fixed anchor');
 const get=(key:string)=>{const face=node.faces?.[key];if(!face?.vertices?.length)throw new Fault('NOT_FOUND',`Mesh face ${key} is missing`);return face;};
 const pair=(a:z.infer<typeof anchor>)=>{
  const face=get(a.face);if(a.vertices[0]===a.vertices[1])throw new Fault('UV_ALIGN_ANCHOR','Anchor vertices must be distinct');
  return a.vertices.map(key=>{const uv=(face.uv as Record<string,Vec2>)[key];if(!face.vertices!.includes(key)||!node.vertices?.[key]||!uv||uv.length!==2||!uv.every(Number.isFinite))throw new Fault('UV_ALIGN_ANCHOR','Anchor requires existing vertices with finite UVs');return uv;});
 };
 const [a,b]=pair(p.fixed),[c,d]=pair(p.moving),dx=b[0]-a[0],dy=b[1]-a[1],ex=d[0]-c[0],ey=d[1]-c[1],target=Math.hypot(dx,dy),source=Math.hypot(ex,ey);
 if(!Number.isFinite(target)||!Number.isFinite(source)||target<1e-12||source<1e-12)throw new Fault('UV_ALIGN_LENGTH','Anchor UV spans must have finite positive length');
 const angle=Math.atan2(dy,dx)-Math.atan2(ey,ex),cos=Math.cos(angle),sin=Math.sin(angle),scale=p.scale==='uniform'?target/source:1;
 const result:Record<string,Record<string,Vec2>>={};
 for(const key of p.faces){const face=get(key),uvs:Record<string,Vec2>={};for(const vertex of face.vertices!){
  const uv=(face.uv as Record<string,Vec2>)[vertex];if(!node.vertices?.[vertex]||!uv||uv.length!==2||!uv.every(Number.isFinite))throw new Fault('UV_ALIGN_COORDINATE','Moving faces require complete finite UV coordinates');
  const x=uv[0]-c[0],y=uv[1]-c[1],out:Vec2=[a[0]+scale*(x*cos-y*sin),a[1]+scale*(x*sin+y*cos)];
  if(!out.every(Number.isFinite))throw new Fault('UV_ALIGN_RANGE','Alignment produced non-finite UV coordinates');uvs[vertex]=out;
 }result[key]=uvs;}
 return result;
}
