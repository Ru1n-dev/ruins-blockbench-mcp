import type {BB} from './adapter.ts';
import {Fault} from '../shared/types.ts';
import {insetFaceVertices} from './mesh-inset-selection.ts';
/** Scope covers both the initial native edit and its typed parameter amendment. */
export function withDuplicatedVertexWeights(b:BB,meshes:any[],operation:'extrude'|'inset'|'solidify',policy:'preserve'|'native',run:()=>void,seams?:{begin:()=>void;finish:(rows:any[])=>void}){
 if(policy==='native'&&!seams){run();return [];}
 const undo=b.Undo,init=undo.initEdit,finish=undo.finishEdit,bones=new Set<any>();
 let rows:any[]=[];
 const handles=meshes.map(mesh=>({mesh,descriptor:Object.getOwnPropertyDescriptor(mesh,'addVertices'),add:mesh.addVertices}));
 undo.initEdit=function(aspects:any,...rest:any[]){
  bones.clear();seams?.begin();
  rows=meshes.map(mesh=>{
   const armature=policy==='native'?null:mesh.getArmature(),available:any[]=armature?.getAllBones()??[];
   let keys:string[]=operation==='solidify'?[]:[...mesh.getSelectedVertices()];
   let faces=mesh.getSelectedFaces(operation==='solidify').map((key:string)=>mesh.faces[key]);
   const append=(key:string)=>{if(!keys.includes(key))keys.push(key);};
   if(operation==='extrude'){
    if(keys.length&&['vertex','edge'].includes(b.BarItems.selection_mode.value))faces=[];
    for(const face of faces)face.vertices.forEach(append);
    for(const edge of mesh.getSelectedEdges(true))edge.forEach(append);
   }else if(operation==='solidify')for(const face of faces)face.vertices.forEach(append);
   else keys=insetFaceVertices(mesh,keys);
   if(keys.some(key=>!Object.hasOwn(mesh.vertices,key)))throw new Fault('WEIGHT_TARGET_INVALID','Selected source vertex is missing');
   if(armature&&b.Mesh.all.some((other:any)=>other!==mesh&&other.getArmature()===armature&&other.uuid.slice(0,6)===mesh.uuid.slice(0,6)))throw new Fault('WEIGHT_KEY_COLLISION','Native UUID prefix collides within the armature');
   const values=keys.map(key=>available.map(bone=>{
    if(Object.hasOwn(bone.vertex_weights,key))throw new Fault('WEIGHT_LEGACY_KEY','Convert legacy vertex-only weights before preserving this edit');
    const value=bone.getVertexWeight(mesh,key);
    if(!Number.isFinite(value)||value<0||value>1)throw new Fault('WEIGHT_INVALID','Source weights must be finite and between zero and one');
    return value;
   }));
   available.forEach(bone=>bones.add(bone));
   return {mesh,available,keys,values,mapping:{},called:false};
  });
  if(rows.reduce((n,row)=>n+row.keys.length,0)>20000)throw new Fault('WEIGHT_TARGET_LIMIT','Weight copying supports at most 20000 source vertices');
  return init.call(this,{...aspects,elements:[...aspects.elements,...bones]},...rest);
 };
 undo.finishEdit=function(label:any,aspects:any,...rest:any[]){
  seams?.finish(rows);
  for(const row of rows){
   if(row.keys.length&&!row.called)throw new Fault('WEIGHT_COPY_MAPPING','Native edit did not create expected source copies');
   for(const key of row.keys)if(!Object.hasOwn(row.mesh.vertices,key))for(const bone of row.available)delete bone.vertex_weights[row.mesh.uuid.slice(0,6)+':'+key];
  }
  return finish.call(this,label,{...(aspects??this.current_save?.aspects),elements:[...meshes,...bones]},...rest);
 };
 try{
  for(const handle of handles)Object.defineProperty(handle.mesh,'addVertices',{configurable:true,value:function(...points:any[]){
   const row=rows.find(row=>row.mesh===this);
   if(!row||row.called||points.length!==row.keys.length)throw new Fault('WEIGHT_COPY_MAPPING','Native new-vertex order differs from the source correspondence');
   const ids=handle.add.apply(this,points);row.called=true;
   if(ids.length!==row.keys.length||new Set(ids).size!==ids.length)throw new Fault('WEIGHT_COPY_MAPPING','Native vertex creation returned unexpected IDs');
   ids.forEach((id:string,i:number)=>{
    row.mapping[row.keys[i]]=id;
    row.available.forEach((bone:any,j:number)=>{if(Object.hasOwn(bone.vertex_weights,id))throw new Fault('WEIGHT_LEGACY_KEY','New ID collides with a legacy vertex weight');bone.vertex_weights[this.uuid.slice(0,6)+':'+id]=row.values[i][j];});
   });return ids;
  }});
  run();return policy==='native'?[]:rows.map(row=>({mesh_id:row.mesh.uuid,vertices:row.mapping,bone_ids:row.available.map((bone:any)=>bone.uuid)}));
 }finally{
  undo.initEdit=init;undo.finishEdit=finish;
  for(const handle of handles)if(handle.descriptor)Object.defineProperty(handle.mesh,'addVertices',handle.descriptor);else delete handle.mesh.addVertices;
 }
}
