import {vertexMergeGroups} from './mesh-vertex-merge-groups.ts';
import type {BB} from './adapter.ts';
import {Fault} from '../shared/types.ts';
/** 5.1.6 groups by distance to the first remaining vertex, not transitive connectivity. */
export function withVertexMergeWeights(b:BB,meshes:any[],policy:'first'|'average'|'native',distance:number|undefined,run:()=>void){
 if(policy==='native'){run();return [];}
 if(meshes.reduce((sum,mesh)=>sum+mesh.getSelectedVertices().length,0)>20000)throw new Fault('WEIGHT_TARGET_LIMIT','Vertex weight merging supports at most 20000 selected vertices');
 const bones=new Set<any>();
 const edits=meshes.map(mesh=>{
  const selected:string[]=[...mesh.getSelectedVertices()],armature=mesh.getArmature(),available:any[]=armature?.getAllBones()??[];
  if(selected.some(key=>!Object.hasOwn(mesh.vertices,key)))throw new Fault('MESH_COMPONENT_SELECTION','Selected vertex is missing');
  const groups=vertexMergeGroups(mesh,selected,distance);
  if(groups.length&&armature&&b.Mesh.all.some((other:any)=>other!==mesh&&other.getArmature()===armature&&other.uuid.slice(0,6)===mesh.uuid.slice(0,6)))throw new Fault('WEIGHT_KEY_COLLISION','Native UUID prefix collides with another mesh in the armature');
  const values=groups.map(group=>{
   const weights=group.map(key=>available.map(bone=>{
    if(Object.hasOwn(bone.vertex_weights,key))throw new Fault('WEIGHT_LEGACY_KEY','Convert legacy vertex-only weights before merging, or explicitly use native policy');
    const value=bone.getVertexWeight(mesh,key);
    if(!Number.isFinite(value)||value<0||value>1)throw new Fault('WEIGHT_INVALID','Weights must be finite and between zero and one');
    return value;
   }));
   return available.map((_,i)=>policy==='first'?weights[0][i]:weights.reduce((sum,row)=>sum+row[i],0)/group.length);
  });
  if(groups.length)available.forEach(bone=>bones.add(bone));
  return {mesh,available,groups,values};
 });
 const undo=b.Undo,init=undo.initEdit,finish=undo.finishEdit;let elements:any[]=[];
 undo.initEdit=function(aspects:any,...rest:any[]){elements=[...aspects.elements,...bones];return init.call(this,{...aspects,elements},...rest);};
 undo.finishEdit=function(label:any,aspects:any,...rest:any[]){
  for(const edit of edits)for(const [i,group] of edit.groups.entries()){
   if(!Object.hasOwn(edit.mesh.vertices,group[0])||group.slice(1).some(key=>Object.hasOwn(edit.mesh.vertices,key)))throw new Fault('WEIGHT_MERGE_MAPPING','Native vertex merge did not match the prepared groups');
   for(const [j,bone] of edit.available.entries()){
    bone.vertex_weights[edit.mesh.uuid.slice(0,6)+':'+group[0]]=edit.values[i][j];
    for(const key of group.slice(1))delete bone.vertex_weights[edit.mesh.uuid.slice(0,6)+':'+key];
   }
  }
  return finish.call(this,label,{...(aspects??this.current_save?.aspects),elements},...rest);
 };
 try {run();return edits.map(edit=>({mesh_id:edit.mesh.uuid,groups:edit.groups.map((group,i)=>({target_vertex:group[0],source_vertices:group,weights:Object.fromEntries(edit.available.map((bone,j)=>[bone.uuid,edit.values[i][j]]))}))}));}
 finally{undo.initEdit=init;undo.finishEdit=finish;}
}
