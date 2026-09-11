import type { BB } from './adapter.ts';
import { Fault } from '../shared/types.ts';
export function prepareMergeWeights(b:BB,meshes:any[],policy:'preserve'|'native'|'remap',boneMap?:Record<string,string>){
 const target=meshes[0],armature=target.getArmature();
 if(policy==='native')return null;
 if(policy==='preserve'&&meshes.some(mesh=>mesh.getArmature()!==armature))throw new Fault('WEIGHT_ARMATURE_MISMATCH','Preserving merge weights requires the same armature; use remap with explicit bone IDs for different armatures');
 if(!armature){if(policy==='remap')throw new Fault('WEIGHT_ARMATURE_MISSING','Remapping requires a target armature');return null;}
 const targetBones:any[]=armature.getAllBones(),allBones=new Set<any>(targetBones);
 const sources=new Map<string,{values:Map<string,number[]>;bones:any[];armature:any;mapping:Record<string,string>}>();
 const targetIndices=new Map<string,number>(targetBones.map((bone,i)=>[bone.uuid,i]));
 const sourceBoneIds=new Set<string>(meshes.slice(1).flatMap(mesh=>(mesh.getArmature()?.getAllBones()??[]).map((bone:any)=>bone.uuid)));
 if(policy==='remap'){
  if(Object.keys(boneMap??{}).some(id=>!sourceBoneIds.has(id)))throw new Fault('WEIGHT_BONE_MAP','Mapping key is not a bone of a declared source mesh');
  for(const id of sourceBoneIds)if(!boneMap?.[id]||!targetIndices.has(boneMap[id]))throw new Fault('WEIGHT_BONE_MAP','Every source bone must map to a bone in the target armature');
 }
 if(meshes.reduce((sum,mesh)=>sum+Object.keys(mesh.vertices).length,0)>20000)throw new Fault('WEIGHT_TARGET_LIMIT','Weight-preserving merge supports at most 20000 selected vertices');
 for(const mesh of meshes){
  const sourceArmature=mesh.getArmature(),bones:any[]=sourceArmature?.getAllBones()??[],prefix=mesh.uuid.slice(0,6);
  if(sourceArmature&&b.Mesh.all.some((other:any)=>other!==mesh&&other.getArmature()===sourceArmature&&other.uuid.slice(0,6)===prefix))throw new Fault('WEIGHT_KEY_COLLISION','Native UUID prefix collides with another mesh in the armature');
  bones.forEach(bone=>allBones.add(bone));
  const mapping:Record<string,string>=Object.fromEntries(bones.map(bone=>[bone.uuid,policy==='remap'&&mesh!==target?boneMap![bone.uuid]:bone.uuid]));
  const values=new Map<string,number[]>();
  for(const vertex of Object.keys(mesh.vertices)){
   if(bones.some(bone=>Object.hasOwn(bone.vertex_weights,vertex)))throw new Fault('WEIGHT_LEGACY_KEY','Convert legacy vertex-only weights before a preserving merge, or explicitly use native policy');
   const weights=targetBones.map(()=>0);
   for(const bone of bones){
    const weight=bone.getVertexWeight(mesh,vertex);
    if(!Number.isFinite(weight)||weight<0||weight>1)throw new Fault('WEIGHT_INVALID','Weights must be finite and between zero and one');
    const index=targetIndices.get(mapping[bone.uuid]);
    if(index===undefined)throw new Fault('WEIGHT_BONE_MAP','Mapped target bone is unavailable');
    weights[index]+=weight;
   }
   if(weights.some(weight=>weight>1||!Number.isFinite(weight)))throw new Fault('WEIGHT_SUM_RANGE','Merged weights exceed one; use an explicit normalized weight edit first');
   values.set(vertex,weights);
  }
  sources.set(mesh.uuid,{values,bones,armature:sourceArmature,mapping});
 }
 const bones=[...allBones];
 return {
  transfer(sourceId:string,map:Record<string,string>){
   const source=sources.get(sourceId)!;
   for(const [oldId,newId] of Object.entries(map)){
    const weights=source.values.get(oldId)!;
    targetBones.forEach((bone,i)=>{bone.vertex_weights[target.uuid.slice(0,6)+':'+newId]=weights[i];});
   }
   for(const bone of source.bones)for(const key of Object.keys(bone.vertex_weights))if(key.startsWith(sourceId.slice(0,6)+':'))delete bone.vertex_weights[key];
   return {armature_id:armature.uuid,source_armature_id:source.armature?.uuid??null,bone_mapping:source.mapping,weight_vertices_transferred:Object.keys(map).length};
  },
  run<T>(run:()=>T):T {
   const undo=b.Undo,init=undo.initEdit,finish=undo.finishEdit;let nativeElements:any[]|undefined;
   undo.initEdit=function(aspects:any,...rest:any[]){nativeElements=aspects.elements;return init.call(this,{...aspects,elements:[...nativeElements!,...bones]},...rest);};
   undo.finishEdit=function(label:any,aspects:any,...rest:any[]){return finish.call(this,label,{...(aspects??this.current_save?.aspects),elements:[...(nativeElements??[]),...bones]},...rest);};
   try{return run();}finally{undo.initEdit=init;undo.finishEdit=finish;}
  }
 };
}
