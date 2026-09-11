import type {PixelEdit} from './types.ts';
import {compositePixel} from './pixel-composite.ts';
const rgba=(hex:string)=>[0,1,2,3].map(i=>i===3&&hex.length===7?255:parseInt(hex.slice(1+i*2,3+i*2),16));
/** Pixel centers and straight RGBA interpolation, independent of canvas AA. */
export function rasterShape(data:Uint8ClampedArray,width:number,height:number,edit:PixelEdit,mask?:Uint8Array,targetWidth=width) {
  const color=rgba(edit.color),other=edit.color2?rgba(edit.color2):color;
  const from=edit.gradient_from??[0,0],to=edit.gradient_to??[1,0],dx=to[0]-from[0],dy=to[1]-from[1],length2=dx*dx+dy*dy;
  const rx=width/2,ry=height/2,stroke=edit.stroke_width??1;
  const source=[0,0,0,0];
  for(let y=0;y<height;y++) for(let x=0;x<width;x++) {
    if(mask&&!mask[(y+edit.y)*targetWidth+x+edit.x]) continue;
    const px=x+0.5,py=y+0.5;
    let amount=0;
    if(edit.shape==='ellipse') {
      if(((px-rx)/rx)**2+((py-ry)/ry)**2>1) continue;
      if(edit.filled===false && rx>stroke && ry>stroke && ((px-rx)/(rx-stroke))**2+((py-ry)/(ry-stroke))**2<1) continue;
    } else {
      const fx=px-from[0],fy=py-from[1];
      amount=Math.max(0,Math.min(1,edit.gradient_type==='radial'?Math.sqrt((fx*fx+fy*fy)/length2):(fx*dx+fy*dy)/length2));
    }
    const index=(y*width+x)*4;
    for(let c=0;c<4;c++) source[c]=Math.round(color[c]+(other[c]-color[c])*amount);
    compositePixel(data,index,source,edit.mode,edit.opacity);
  }
}
