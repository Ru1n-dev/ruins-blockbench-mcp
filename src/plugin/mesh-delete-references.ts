import type {BB} from './adapter.ts';
import {Fault} from '../shared/types.ts';
import {resolveSeamVertices} from './mesh-seam-reference.ts';
export function withDeletedMeshReferences(b:BB,meshes:any[],policy:'cleanup'|'native',run:()=>void,dissolving=false){
 if(policy==='native'){run();return [];}
 const bones=new Set<any>(),rows=meshes.map(mesh=>{
  const known=new Set<string>(Object.keys(mesh.vertices)),arm=mesh.getArmature(),available:any[]=arm?.getAllBones()??[];
  if(arm&&b.Mesh.all.some((other:any)=>other!==mesh&&other.getArmature()===arm&&other.uuid.slice(0,6)===mesh.uuid.slice(0,6)))throw new Fault('WEIGHT_KEY_COLLISION','Cannot remove shared mesh-prefix weight keys');
  const seams=Object.keys(mesh.seams).map(key=>({key,vertices:resolveSeamVertices(key,known,mesh.uuid)!}));
  const selectedEdges=new Set<string>(dissolving?mesh.getSelectedEdges(true).map((edge:string[])=>edge.slice().sort().join('_')):[]);
  available.forEach(bone=>bones.add(bone));return {mesh,known,available,seams,selectedEdges};
 });
 const undo=b.Undo,init=undo.initEdit,finish=undo.finishEdit,results:any[]=[];
 undo.initEdit=function(aspects:any,...rest:any[]){return init.call(this,{...aspects,elements:[...aspects.elements,...bones]},...rest);};
 undo.finishEdit=function(label:any,aspects:any,...rest:any[]){
  for(const row of rows){
   const exists=b.Mesh.all.includes(row.mesh),removed=[...row.known].filter(key=>!exists||!Object.hasOwn(row.mesh.vertices,key)),removedSet=new Set(removed),seams:string[]=[],weights:any[]=[];
   const liveEdges=new Set<string>(dissolving&&exists?Object.values(row.mesh.faces).flatMap((face:any)=>face.getEdges().map((edge:string[])=>edge.slice().sort().join('_'))):[]);
   for(const seam of row.seams)if(seam.vertices.some(key=>removedSet.has(key))||(row.selectedEdges.has(seam.key)&&!liveEdges.has(seam.key))){delete row.mesh.seams[seam.key];seams.push(seam.key);}
   const prefix=row.mesh.uuid.slice(0,6)+':';
   for(const bone of row.available)for(const key of Object.keys(bone.vertex_weights))if(key.startsWith(prefix)&&(!exists||removedSet.has(key.slice(prefix.length)))){
    delete bone.vertex_weights[key];weights.push({bone_id:bone.uuid,key});
   }
   results.push({mesh_id:row.mesh.uuid,removed_vertices:removed,removed_seams:seams,removed_weight_keys:weights,mesh_removed:!exists});
  }
  const entry=finish.call(this,label,{...(aspects??this.current_save?.aspects),elements:[...meshes.filter(mesh=>b.Mesh.all.includes(mesh)),...bones]},...rest);
  return entry;
 };
 try{run();return results;}finally{undo.initEdit=init;undo.finishEdit=finish;}
}
