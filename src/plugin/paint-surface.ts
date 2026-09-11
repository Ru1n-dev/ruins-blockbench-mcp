import type {BB} from './adapter.ts';
import {Fault} from '../shared/types.ts';
export function paintSurface(b:BB,surface:any,texture:any) {
  if(!surface)return;
  const element=b.Outliner.elements.find((n:any)=>n.uuid===surface.node_id);
  if(!element||!(element instanceof b.Cube||element instanceof b.Mesh)||element.locked)throw new Fault('PAINT_SURFACE_INVALID','Surface must be an unlocked core Cube or Mesh');
  if(b.Outliner.selected.length!==1||b.Outliner.selected[0]!==element)throw new Fault('PAINT_SURFACE_SELECTION','Select only the declared surface element');
  const face=element.faces[surface.face_id];
  if(!face||b.Painter.getTextureToEdit(face.getTexture())!==texture)throw new Fault('PAINT_SURFACE_TEXTURE','Surface face must resolve to the declared paint texture');
  const valid=(f:any)=>Array.isArray(f.uv)?f.uv.length===4&&f.uv.every(Number.isFinite):Array.isArray(f.vertices)&&f.vertices.length>=3&&f.vertices.every((id:string)=>Array.isArray(f.uv?.[id])&&f.uv[id].length===2&&f.uv[id].every(Number.isFinite));
  if(!valid(face))throw new Fault('PAINT_SURFACE_UV','Surface face requires complete finite UV coordinates');
  for(const f of Object.values(element.faces) as any[]) {
    if(b.Painter.getTextureToEdit(f.getTexture())!==texture)continue;
    if(!Array.isArray(f.uv)&&f.vertices?.length<3)continue;
    if(!valid(f))throw new Fault('PAINT_SURFACE_UV','Painted surface faces require complete finite UV coordinates');
  }
  return {element,face:surface.face_id,uv:face.uv};
}
