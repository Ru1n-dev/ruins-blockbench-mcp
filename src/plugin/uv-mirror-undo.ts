/** Include every bitmap modified by the pinned core Cube UV mirror handlers. */
export function withUvMirrorUndo(b:any,action:any,event:MouseEvent,run:()=>any):any{
 if(!b.BarItems.move_texture_with_uv.value||!b.UVEditor.texture)return run();
 const textures=new Set<any>();
 for(const element of b.UVEditor.getMappableElements()){
  if(!element.getTypeBehavior('cube_faces'))continue;
  for(const key of b.UVEditor.getFaces(element,event,action)){
   const face=element.faces[key];
   if(!face||face.texture===null)continue;
   const texture=face.getTexture();
   if(texture?.ctx)textures.add(texture);
  }
 }
 const undo=b.Undo,original=undo.initEdit;
 undo.initEdit=function(aspects:any,...rest:any[]){
  return original.call(this,aspects?.bitmap?{...aspects,textures:[...new Set([...(aspects.textures??[]),...textures])]}:aspects,...rest);
 };
 try{return run();}finally{undo.initEdit=original;}
}
