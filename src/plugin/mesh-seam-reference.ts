import { Fault } from '../shared/types.ts';
export function resolveSeamVertices(key:string,known:Set<string>,meshId:string,allowMissing=false):string[]|null {
 const candidates:string[][]=[];
 for(let i=0;i<key.length;i++)if(key[i]==='_'){
  const a=key.slice(0,i),b=key.slice(i+1);
  if(a!==b&&known.has(a)&&known.has(b)&&[a,b].sort().join('_')===key)candidates.push([a,b]);
 }
 if(!candidates.length&&allowMissing)return null;
 if(candidates.length!==1)throw new Fault('MESH_SEAM_AMBIGUOUS','Seam has missing or ambiguous vertex references',{mesh_id:meshId,seam:key});
 return candidates[0];
}
