import type { BB } from './adapter.ts';
import { prepareMergeWeights } from './mesh-merge-weights.ts';
import { resolveSeamVertices } from './mesh-seam-reference.ts';
import { Fault } from '../shared/types.ts';

export function withMeshMergeSeams(b:BB,meshes:any[],policy:'preserve'|'native'|'remap',run:()=>void,boneMap?:Record<string,string>){
 const target=meshes[0],sources=meshes.slice(1).map(mesh=>{
  const keys=Object.keys(mesh.vertices),known=new Set(keys);
  const seams=Object.entries(mesh.seams).map(([key,value])=>{
   return {vertices:resolveSeamVertices(key,known,mesh.uuid)!,value};
  });
  return {id:mesh.uuid,keys,seams};
 });
 const weights=prepareMergeWeights(b,meshes,policy,boneMap);
 const descriptor=Object.getOwnPropertyDescriptor(target,'addVertices'),add=target.addVertices;
 const mappings:any[]=[];let cursor=0;
 Object.defineProperty(target,'addVertices',{configurable:true,value:function(...vertices:any[]){
  const source=sources[cursor++];
  if(!source||vertices.length!==source.keys.length)throw new Fault('MESH_MERGE_MAPPING','Native merge vertex calls did not match the selected sources');
  const result=add.apply(this,vertices);
  if(result.length!==source.keys.length||new Set(result).size!==result.length)throw new Fault('MESH_MERGE_MAPPING','Native merge returned an invalid vertex mapping');
  const map=Object.fromEntries(source.keys.map((key,i)=>[key,result[i]]));
  for(const seam of source.seams)this.setSeam(seam.vertices.map(key=>map[key]),seam.value);
  mappings.push({source_mesh_id:source.id,target_mesh_id:target.uuid,vertices:map,seams_transferred:source.seams.length,...(weights?.transfer(source.id,map)??{})});
  return result;
 }});
 try{if(weights)weights.run(run);else run();if(cursor!==sources.length)throw new Fault('MESH_MERGE_MAPPING','Native merge did not process every source');return mappings;}
 finally{if(descriptor)Object.defineProperty(target,'addVertices',descriptor);else delete target.addVertices;}
}
