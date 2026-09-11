import type {PixelEdit} from './types.ts';
import {compositePixel} from './pixel-composite.ts';
export function fillPixels(data:Uint8ClampedArray,width:number,height:number,edit:PixelEdit,mask?:Uint8Array) {
  const start=edit.y*width+edit.x,seed=[...data.slice(start*4,start*4+4)],tolerance=edit.tolerance??0;
  const color=[0,1,2,3].map(i=>i===3&&edit.color.length===7?255:parseInt(edit.color.slice(1+i*2,3+i*2),16));
  const matches=(index:number)=>seed.every((v,c)=>c===3&&edit.match_alpha===false||Math.abs(data[index*4+c]-v)<=tolerance);
  const write=(index:number)=>compositePixel(data,index*4,color,edit.mode,edit.opacity);
  if(edit.contiguous===false) {
    for(let index=0;index<width*height;index++) if((!mask||mask[index])&&matches(index)) write(index);
    return;
  }
  const seen=new Uint8Array(width*height),queue=new Uint32Array(width*height);
  let read=0,length=0;
  const visit=(x:number,y:number)=>{
    if(x<0||y<0||x>=width||y>=height) return;
    const index=y*width+x;
    if(mask&&!mask[index]) return;
    if(seen[index]) return;
    seen[index]=1;
    if(matches(index)) queue[length++]=index;
  };
  visit(edit.x,edit.y);
  while(read<length) {
    const index=queue[read++],x=index%width,y=Math.floor(index/width);
    write(index);
    visit(x-1,y);visit(x+1,y);visit(x,y-1);visit(x,y+1);
    if(edit.diagonal) {visit(x-1,y-1);visit(x+1,y-1);visit(x-1,y+1);visit(x+1,y+1);}
  }
}
