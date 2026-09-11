import type {BB} from './adapter.ts';
import {Fault} from '../shared/types.ts';
// Clip the final native preview without changing its blend/erase calculations.
export function shapeSurfaceClip(b:BB,surface:any,texture:any) {
  const {canvas,ctx,offset}=texture.getActiveCanvas();
  const origin=[...offset];
  if(!origin.every(Number.isInteger))throw new Fault('SURFACE_CLIP_LAYER_OFFSET','Surface clipping requires integer layer offsets');
  const before=ctx.getImageData(0,0,canvas.width,canvas.height);
  const face=surface.element.faces[surface.face];
  const factorX=texture.width/texture.getUVWidth(),factorY=texture.display_height/texture.getUVHeight();
  const frame=texture.display_height*texture.currentFrame;
  const uv=surface.uv;
  const polygon=Array.isArray(uv)?[[uv[0],uv[1]],[uv[2],uv[1]],[uv[2],uv[3]],[uv[0],uv[3]]]:(face.vertices.length>4?face.vertices:face.getSortedVertices()).map((id:string)=>uv[id]);
  const vertices=polygon.map(([x,y]:number[])=>[x*factorX,y*factorY+frame]);
  const inside=(x:number,y:number)=>{
    let hit=false;
    for(let i=0,j=vertices.length-1;i<vertices.length;j=i++) {
      const [ax,ay]=vertices[j],[bx,by]=vertices[i];
      if(Math.abs((x-ax)*(by-ay)-(y-ay)*(bx-ax))<1e-8&&x>=Math.min(ax,bx)&&x<=Math.max(ax,bx)&&y>=Math.min(ay,by)&&y<=Math.max(ay,by))return true;
      if((ay>y)!==(by>y)&&x<(bx-ax)*(y-ay)/(by-ay)+ax)hit=!hit;
    }
    return hit;
  };
  const allowed=new Uint8Array(canvas.width*canvas.height);
  for(let y=0;y<canvas.height;y++)for(let x=0;x<canvas.width;x++) {
    const px=x+origin[0],py=y+origin[1];
    allowed[y*canvas.width+x]=Number(px>=0&&py>=0&&px<texture.width&&py<texture.height&&texture.selection.allow(px,py)&&inside(px+0.5,py+0.5));
  }
  return ()=>{
    const active=texture.getActiveCanvas();
    if(active.canvas!==canvas||canvas.width!==before.width||canvas.height!==before.height||active.offset.some((v:number,i:number)=>v!==origin[i]))throw new Fault('SURFACE_CLIP_CANVAS_CHANGED','Native preview changed the active canvas geometry');
    const painted=ctx.getImageData(0,0,canvas.width,canvas.height);
    for(let i=0;i<allowed.length;i++)if(!allowed[i])painted.data.set(before.data.subarray(i*4,i*4+4),i*4);
    ctx.putImageData(painted,0,0);
  };
}
