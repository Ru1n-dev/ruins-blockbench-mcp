import type {PaintClip} from './types.ts';
export function paintMask(width:number,height:number,clip:PaintClip) {
  const data=new Uint8Array(width*height);
  if(clip.invert) data.fill(1);
  for(const rect of clip.rects) for(let y=rect.y;y<rect.y+rect.height;y++)
    data.fill(clip.invert?0:1,y*width+rect.x,y*width+rect.x+rect.width);
  return data;
}
