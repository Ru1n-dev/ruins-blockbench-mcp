import type { BB } from './adapter.ts';
import { Fault } from '../shared/types.ts';
export function withMeshSplitWeights(b:BB,meshes:any[],policy:'preserve'|'native',run:()=>void){
 if(policy==='native'||meshes.every(mesh=>!mesh.getArmature())){run();return [];}
 const beforeIds=new Set(b.Mesh.all.map((mesh:any)=>mesh.uuid)),bones=new Set<any>();
 if(meshes.reduce((sum,mesh)=>sum+Object.keys(mesh.vertices).length,0)>20000)throw new Fault('WEIGHT_TARGET_LIMIT','Weight-preserving split supports at most 20000 selected vertices');
 const sources=meshes.map(mesh=>{
  const armature=mesh.getArmature(),available=armature?.getAllBones()??[],values=new Map<string,number[]>();
  if(armature&&b.Mesh.all.some((other:any)=>other!==mesh&&other.getArmature()===armature&&other.uuid.slice(0,6)===mesh.uuid.slice(0,6)))throw new Fault('WEIGHT_KEY_COLLISION','Native UUID prefix collides with another mesh in the armature');
  for(const vertex of Object.keys(mesh.vertices)){
   if(available.some((bone:any)=>Object.hasOwn(bone.vertex_weights,vertex)))throw new Fault('WEIGHT_LEGACY_KEY','Convert legacy vertex-only weights before a preserving split, or explicitly use native policy');
   const weights=available.map((bone:any)=>bone.getVertexWeight(mesh,vertex));
   if(weights.some((v:number)=>!Number.isFinite(v)||v<0||v>1))throw new Fault('WEIGHT_INVALID','Weights must be finite and between zero and one');
   values.set(vertex,weights);
  }
  available.forEach((bone:any)=>bones.add(bone));
  return {mesh,armature,available,values};
 });
 const undo=b.Undo,init=undo.initEdit,finish=undo.finishEdit,partition:any[]=[];let elements:any[]=[];
 undo.initEdit=function(aspects:any,...rest:any[]){elements=aspects.elements;for(const bone of bones)if(!elements.includes(bone))elements.push(bone);return init.call(this,aspects,...rest);};
 undo.finishEdit=function(label:any,aspects:any,...rest:any[]){
  const copies=elements.filter(mesh=>mesh.type==='mesh'&&!beforeIds.has(mesh.uuid));
  if(copies.length!==sources.length)throw new Fault('WEIGHT_SPLIT_MAPPING','Native split did not create one copy per source');
  for(const [i,source] of sources.entries()){
   const copy=copies[i],vertices=Object.keys(copy.vertices);
   if(copy.parent!==source.mesh.parent||vertices.some(key=>!source.values.has(key)))throw new Fault('WEIGHT_SPLIT_MAPPING','Native split copy does not match the source');
   if(!source.armature)continue;
   if(copy.getArmature()!==source.armature||b.Mesh.all.some((other:any)=>other!==copy&&other.getArmature()===source.armature&&other.uuid.slice(0,6)===copy.uuid.slice(0,6)))throw new Fault('WEIGHT_KEY_COLLISION','Split copy armature or UUID prefix is incompatible');
   for(const vertex of vertices)source.available.forEach((bone:any,j:number)=>{bone.vertex_weights[copy.uuid.slice(0,6)+':'+vertex]=source.values.get(vertex)![j];});
   const removed=[...source.values.keys()].filter(key=>!Object.hasOwn(source.mesh.vertices,key));
   for(const key of removed)for(const bone of source.available)delete bone.vertex_weights[source.mesh.uuid.slice(0,6)+':'+key];
   partition.push({source_mesh_id:source.mesh.uuid,copy_mesh_id:copy.uuid,armature_id:source.armature.uuid,weight_vertices_transferred:vertices.length,removed_source_vertices:removed});
  }
  return finish.call(this,label,{...(aspects??this.current_save?.aspects),elements:[...new Set([...elements,...bones])]},...rest);
 };
 try{run();return partition;}finally{undo.initEdit=init;undo.finishEdit=finish;}
}
