/** Correct the bitmap Undo aspects of the pinned core UV rotation slider. */
export function withUvRotationUndo(b:any,run:()=>any):any{
 if(!b.BarItems.move_texture_with_uv.value||!b.UVEditor.texture)return run();
 const textures=new Set<any>();
 for(const cube of b.Cube.selected)for(const key of b.UVEditor.getSelectedFaces(cube)){
  const face=cube.faces[key];
  if(!face||face.texture===null)continue;
  const texture=face.getTexture();
  if(texture?.ctx)textures.add(texture);
 }
 const temporary=['_originalRotations','_originalPixels'].map(key=>({key,descriptor:Object.getOwnPropertyDescriptor(b.UVEditor,key)}));
 const undo=b.Undo,original=undo.initEdit;
 undo.initEdit=function(aspects:any,...rest:any[]){
  return original.call(this,aspects?.bitmap?{...aspects,textures:[...new Set([...(aspects.textures??[]),...textures])]}:aspects,...rest);
 };
 try{return run();}catch(error){
  for(const {key,descriptor} of temporary){
   if(descriptor)Object.defineProperty(b.UVEditor,key,descriptor);
   else delete b.UVEditor[key];
  }
  throw error;
 }finally{undo.initEdit=original;}
}
