import type {PaintMode} from './types.ts';
export function compositePixel(data:Uint8ClampedArray,index:number,color:number[],mode:PaintMode='replace',opacity=1) {
  const sourceAlpha=color[3]/255*opacity,destAlpha=data[index+3]/255;
  if(mode==='replace') {
    for(let c=0;c<3;c++) data[index+c]=color[c];
    data[index+3]=Math.round(sourceAlpha*255);
  } else if(mode==='erase') {
    data[index+3]=Math.round(destAlpha*(1-sourceAlpha)*255);
    if(data[index+3]===0) for(let c=0;c<3;c++) data[index+c]=0;
  } else {
    const alpha=mode==='atop'?destAlpha:mode==='add'?Math.min(1,sourceAlpha+destAlpha):sourceAlpha+destAlpha*(1-sourceAlpha);
    for(let c=0;c<3;c++) {
      const source=color[c],dest=data[index+c];
      let mixed=source;
      if(mode==='multiply') mixed=source*dest/255;
      if(mode==='screen') mixed=source+dest-source*dest/255;
      if(mode==='overlay') mixed=dest<128?2*source*dest/255:255-2*(255-source)*(255-dest)/255;
      if(mode==='darken') mixed=Math.min(source,dest);
      if(mode==='lighten') mixed=Math.max(source,dest);
      if(mode==='difference') mixed=Math.abs(source-dest);
      const value=mode==='atop'?(source*sourceAlpha+dest*(1-sourceAlpha))*destAlpha
        :mode==='behind'?dest*destAlpha+source*sourceAlpha*(1-destAlpha)
        :mode==='add'?source*sourceAlpha+dest*destAlpha
        :sourceAlpha*(1-destAlpha)*source+sourceAlpha*destAlpha*mixed+(1-sourceAlpha)*destAlpha*dest;
      data[index+c]=alpha?Math.round(value/alpha):0;
    }
    data[index+3]=Math.round(alpha*255);
  }
}
