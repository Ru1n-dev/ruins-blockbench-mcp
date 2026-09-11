import type {BB} from './adapter.ts';
import {Fault} from '../shared/types.ts';
import {vertexMergeGroups} from './mesh-vertex-merge-groups.ts';
import {resolveSeamVertices} from './mesh-seam-reference.ts';
export function withVertexMergeSeams(b:BB,meshes:any[],policy:'preserve'|'native',conflict:'reject'|'divide'|'join',distance:number|undefined,run:()=>void){
 if(policy==='native'){run();return [];}
 const edits=meshes.map(mesh=>{
  const groups=vertexMergeGroups(mesh,[...mesh.getSelectedVertices()],distance),map=new Map<string,string>();
  for(const group of groups)for(const key of group)map.set(key,group[0]);
  const known=new Set<string>(Object.keys(mesh.vertices)),seams:Record<string,string>={},collapsed:string[]=[],conflicts=new Set<string>();
  for(const [key,value] of Object.entries(mesh.seams)){
   if(value!=='divide'&&value!=='join')throw new Fault('MESH_SEAM_VALUE','Unsupported native seam value');
   const endpoints=resolveSeamVertices(key,known,mesh.uuid)!.map(id=>map.get(id)??id);
   if(endpoints[0]===endpoints[1]){collapsed.push(key);continue;}
   const target=endpoints.sort().join('_');
   if(seams[target]&&seams[target]!==value){
    conflicts.add(target);
    if(conflict==='reject')throw new Fault('MESH_SEAM_CONFLICT','Merged seams disagree; select divide or join explicitly',{mesh_id:mesh.uuid,seam:target});
   }
   seams[target]=conflicts.has(target)?conflict:value;
  }
  const survivors=new Set([...known].filter(key=>!map.has(key)||map.get(key)===key));
  for(const key of Object.keys(seams))resolveSeamVertices(key,survivors,mesh.uuid);
  return {mesh,seams,groups,collapsed,conflicts:[...conflicts]};
 });
 const undo=b.Undo,finish=undo.finishEdit;
 undo.finishEdit=function(label:any,aspects:any,...rest:any[]){
  for(const edit of edits){
   for(const group of edit.groups)if(!Object.hasOwn(edit.mesh.vertices,group[0])||group.slice(1).some(key=>Object.hasOwn(edit.mesh.vertices,key)))throw new Fault('MESH_SEAM_MAPPING','Native vertex merge did not match prepared seam groups');
   edit.mesh.seams={...edit.seams};
  }
  return finish.call(this,label,aspects,...rest);
 };
 try{run();return edits.map(edit=>({mesh_id:edit.mesh.uuid,seams:edit.seams,collapsed_seams:edit.collapsed,resolved_conflicts:edit.conflicts}));}
 finally{undo.finishEdit=finish;}
}
