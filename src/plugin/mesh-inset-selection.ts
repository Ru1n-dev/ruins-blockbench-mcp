import {Fault} from '../shared/types.ts';
export function insetFaceVertices(mesh:any,selected:string[]):string[]{
 const faceIds:string[]=mesh.getSelectedFaces();
 const faces=faceIds.map((id:string)=>mesh.faces[id]);
 if(faces.some((face:any)=>!face))throw new Fault('MESH_COMPONENT_SELECTION','Selected inset face does not exist');
 const result=selected.filter(key=>faces.some((face:any)=>face.vertices.includes(key)));
 for(const face of faces)for(const key of face.vertices){
  if(!Object.hasOwn(mesh.vertices,key))throw new Fault('MESH_COMPONENT_SELECTION','Inset face references a missing vertex');
  if(!result.includes(key))result.push(key);
 }
 for(const vertex of result){
  const incident=faces.flatMap((face:any,index:number)=>face.vertices.includes(vertex)?[index]:[]);
  // Core 5.1.6's two-face branch dereferences a second common vertex.
  // A corner-only junction has no such vertex; detect it before opening Undo.
  if(incident.length===2&&!faces[incident[0]].vertices.some((key:string)=>key!==vertex&&faces[incident[1]].vertices.includes(key))){
   throw new Fault('MESH_INSET_REGION','Core inset cannot process two selected faces sharing only a vertex; inset each region separately',{
    mesh_id:mesh.uuid,vertex_id:vertex,face_ids:incident.map(index=>faceIds[index]),
   });
  }
 }
 return result;
}
/** Core inset filters unmapped positions but then indexes the unfiltered keys.
 * Scope its vertex view to selected faces so the two arrays stay aligned. */
export function withInsetFaceVertices(b:any,meshes:any[],run:()=>void){
 for(const mesh of meshes)insetFaceVertices(mesh,mesh.getSelectedVertices());
 const handles=meshes.map(mesh=>({mesh,get:mesh.getSelectedVertices,descriptor:Object.getOwnPropertyDescriptor(mesh,'getSelectedVertices')}));
 const undo=b.Undo,init=undo.initEdit,finish=undo.finishEdit;let enabled=true;
 undo.initEdit=function(...args:any[]){enabled=false;const result=init.apply(this,args);enabled=true;return result;};
 undo.finishEdit=function(...args:any[]){enabled=false;return finish.apply(this,args);};
 try{
  for(const h of handles)Object.defineProperty(h.mesh,'getSelectedVertices',{configurable:true,value:function(...args:any[]){
   const selected:string[]=h.get.apply(this,args);
   if(!enabled||args[0])return selected;
   return insetFaceVertices(this,selected);
  }});
  run();
 }finally{undo.initEdit=init;undo.finishEdit=finish;for(const h of handles)if(h.descriptor)Object.defineProperty(h.mesh,'getSelectedVertices',h.descriptor);else delete h.mesh.getSelectedVertices;}
}
