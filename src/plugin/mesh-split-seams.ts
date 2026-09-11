import type { BB } from './adapter.ts';
import { resolveSeamVertices } from './mesh-seam-reference.ts';
export function withMeshSplitSeams(b:BB,meshes:any[],run:()=>void){
 for(const mesh of meshes){const known=new Set<string>(Object.keys(mesh.vertices));for(const key of Object.keys(mesh.seams))resolveSeamVertices(key,known,mesh.uuid);}
 const undo=b.Undo,finish=undo.finishEdit,partition:any[]=[];
 undo.finishEdit=function(label:any,aspects:any,...rest:any[]){
  const affected=aspects?.elements??this.current_save?.aspects?.elements??[];
  for(const mesh of new Set<any>(affected))if(mesh.type==='mesh'){
   const known=new Set<string>(Object.keys(mesh.vertices)),removed:string[]=[];
   for(const key of Object.keys(mesh.seams))if(!resolveSeamVertices(key,known,mesh.uuid,true)){delete mesh.seams[key];removed.push(key);}
   partition.push({mesh_id:mesh.uuid,removed_seams:removed,retained_seams:Object.keys(mesh.seams).length});
  }
  return finish.call(this,label,aspects,...rest);
 };
 try{run();return partition;}finally{undo.finishEdit=finish;}
}
