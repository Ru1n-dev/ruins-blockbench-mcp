import type {BB} from './adapter.ts';
import {Fault} from '../shared/types.ts';
import {loopCutRuntime,runCoreLoopCut} from './core-loop-cut-generated.ts';
import {createLoopCutSeams} from './mesh-loop-cut-seams.ts';
import {loopCutReference} from './mesh-loop-cut-reference.ts';
export function createLoopCutWeights(b:BB,meshes:any[],policy:'preserve'|'native',seamPolicy:'preserve'|'native',lengthReference:'first_mesh'|'each_mesh'|'native'){
 const seams=createLoopCutSeams(meshes,seamPolicy),native=policy==='native'&&seamPolicy==='native'&&lengthReference==='native';
 let records:any[]=[],available=new Map<any,any[]>();
 const hook=(mesh:any,edge:string[],ratio:number,vertex:string)=>{
  if(!Number.isFinite(ratio)||ratio<0||ratio>1)throw new Fault('WEIGHT_INTERPOLATION_RANGE','Native cut ratio is outside zero to one');
  if(records.length>=20000)throw new Fault('WEIGHT_TARGET_LIMIT','Interpolation supports at most 20000 new vertices per edit');
  const bones=available.get(mesh);if(!bones)throw new Fault('WEIGHT_TARGET_INVALID','Cut mesh is not declared');
  const weights:Record<string,number>={};
  for(const bone of bones){
   if(Object.hasOwn(bone.vertex_weights,vertex))throw new Fault('WEIGHT_LEGACY_KEY','New vertex collides with legacy weights');
   const a=bone.getVertexWeight(mesh,edge[0]),c=bone.getVertexWeight(mesh,edge[1]),value=a+(c-a)*ratio;
   if(!Number.isFinite(value)||value<0||value>1)throw new Fault('WEIGHT_INVALID','Interpolated weight is invalid');
   bone.vertex_weights[mesh.uuid.slice(0,6)+':'+vertex]=value;weights[bone.uuid]=value;
  }
  records.push({mesh_id:mesh.uuid,vertex_id:vertex,edge:[...edge],ratio,weights});
  seams.split(mesh,edge,vertex);
 };
 return {
  run(run:()=>void){
   if(native){run();return [];}
   const undo=b.Undo,init=undo.initEdit,finish=undo.finishEdit;let bones:any[]=[];
   undo.initEdit=function(aspects:any,...rest:any[]){
    records=[];available=new Map();const all=new Set<any>();seams.begin();
    if(meshes.reduce((n,m)=>n+Object.keys(m.vertices).length,0)>20000)throw new Fault('WEIGHT_TARGET_LIMIT','Interpolation supports at most 20000 input vertices');
    for(const mesh of meshes){
     const arm=policy==='native'?null:mesh.getArmature(),list:any[]=arm?.getAllBones()??[];
     if(arm&&b.Mesh.all.some((other:any)=>other!==mesh&&other.getArmature()===arm&&other.uuid.slice(0,6)===mesh.uuid.slice(0,6)))throw new Fault('WEIGHT_KEY_COLLISION','Mesh UUID weight prefixes collide');
     for(const bone of list)for(const key of Object.keys(mesh.vertices)){
      if(Object.hasOwn(bone.vertex_weights,key))throw new Fault('WEIGHT_LEGACY_KEY','Migrate legacy vertex weights first');
      const value=bone.getVertexWeight(mesh,key);if(!Number.isFinite(value)||value<0||value>1)throw new Fault('WEIGHT_INVALID','Source weight is invalid');
     }
     list.forEach(bone=>all.add(bone));available.set(mesh,list);
    }
    bones=[...all];return init.call(this,{...aspects,elements:[...aspects.elements,...bones]},...rest);
   };
   undo.finishEdit=function(label:any,aspects:any,...rest:any[]){seams.finish();return finish.call(this,label,{...(aspects??this.current_save?.aspects),elements:[...meshes,...bones]},...rest);};
   try{run();return policy==='native'?[]:records;}finally{undo.initEdit=init;undo.finishEdit=finish;}
  },
  get seams(){return seams.records;},
  trigger(action:any,run:()=>void){
   if(native){run();return;}
   const original=action.onClick;
   if(Function.prototype.toString.call(original)!==loopCutRuntime)throw new Fault('NATIVE_IMPLEMENTATION_CHANGED','Loop cut callback differs from pinned Desktop 5.1.6');
   const resolveLength=lengthReference!=='native'?loopCutReference(meshes[0]):undefined;
   const references=lengthReference==='each_mesh'?new Map(meshes.map(mesh=>[mesh,loopCutReference(mesh)])):null;
   action.onClick=()=>runCoreLoopCut(b,hook,resolveLength,references?(mesh:any,direction:number)=>references.get(mesh)!(direction):undefined);
   try{run();}finally{action.onClick=original;}
  }
 };
}
