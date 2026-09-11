import type {BB} from './adapter.ts';
import {Fault} from '../shared/types.ts';
// Prepare every vertex before opening Undo: native weight keys truncate UUIDs.
export function prepareVertexWeights(b:BB,parameters:any,meshIds:string[]) {
  const seen=new Set<string>(),bones=new Set<any>();
  const edits=parameters.vertices.map((entry:any)=>{
    const mesh=b.Mesh.all.find((m:any)=>m.uuid===entry.mesh_id);
    if(!mesh || !meshIds.includes(mesh.uuid) || !Object.hasOwn(mesh.vertices,entry.vertex_id))
      throw new Fault('WEIGHT_TARGET_INVALID','Weight targets must be existing vertices of declared meshes');
    const key=mesh.uuid+':'+entry.vertex_id;
    if(seen.has(key)) throw new Fault('WEIGHT_TARGET_DUPLICATE','Each vertex may occur only once');
    seen.add(key);
    const armature=mesh.getArmature();
    if(!armature) throw new Fault('WEIGHT_ARMATURE_MISSING','Each mesh must be parented directly to an armature');
    const available=armature.getAllBones();
    if(Object.keys(entry.weights).some(id=>!available.some((bone:any)=>bone.uuid===id)))
      throw new Fault('WEIGHT_BONE_INVALID','All bones must belong to the target mesh armature');
    const peers=b.Mesh.all.filter((m:any)=>m!==mesh && m.getArmature()===armature && Object.hasOwn(m.vertices,entry.vertex_id));
    if(peers.some((m:any)=>m.uuid.slice(0,6)===mesh.uuid.slice(0,6)) || (peers.length && available.some((bone:any)=>bone.vertex_weights[entry.vertex_id])))
      throw new Fault('WEIGHT_KEY_COLLISION','Native truncated UUID or legacy vertex-only weights are ambiguous for this target');
    const values=Object.fromEntries(available.map((bone:any)=>[bone.uuid,parameters.mode==='merge'?bone.getVertexWeight(mesh,entry.vertex_id):0]));
    Object.assign(values,entry.weights);
    const sum=Object.values(values).reduce((n:number,v:any)=>n+v,0);
    if(parameters.normalize) {
      if(!Number.isFinite(sum)||sum<=0) throw new Fault('WEIGHT_NORMALIZATION_INVALID','Normalization requires a positive finite weight sum');
      for(const id of Object.keys(values)) values[id]=Number(values[id])/sum;
    }
    available.forEach((bone:any)=>bones.add(bone));
    return {mesh,vertex_id:entry.vertex_id,available,values};
  });
  return {apply() {
    b.Undo.initEdit({elements:[...bones],selection:true});
    for(const edit of edits) for(const bone of edit.available)
      bone.setVertexWeight(edit.mesh,edit.vertex_id,edit.values[bone.uuid]);
    b.updateSelection();
    b.Undo.finishEdit('Set vertex weights');
    return edits.map((edit:any)=>({mesh_id:edit.mesh.uuid,vertex_id:edit.vertex_id,weights:edit.values}));
  }};
}
