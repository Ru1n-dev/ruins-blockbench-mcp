import type { BB } from './adapter.ts';

// 5.1.6 dragToggle can visit a child twice (child, then parent), overwriting
// previous_values before initEdit. Capture the actual gesture-start flags.
export function withOutlinerFlagUndo<T>(b: BB, element: HTMLElement, args: any, run:()=>T): T {
  const panel=b.Panels?.outliner?.node;
  if(b.Blockbench.version!=='5.1.6'||!panel||!panel.contains(element)||!b.Undo)return run();
  const rect=element.getBoundingClientRect(),point=args.points[0];
  const target=args.dispatch_target==='hit'?document.elementFromPoint(rect.left+Math.min(point[0]*rect.width,rect.width-0.01),rect.top+Math.min(point[1]*rect.height,rect.height-0.01)):element;
  const key=target?.getAttribute('toggle'),row=target?.closest('.outliner_node');
  if(!target?.classList.contains('outliner_toggle')||!row||!panel.contains(row)||!['visibility','locked','export'].includes(key??''))return run();
  const nodes=[...b.Group.all,...b.Outliner.elements].filter((n:any)=>['group','cube','mesh','spline'].includes(n.type));
  if(!nodes.some((n:any)=>n.uuid===row.id))return run();
  const property=key!,before=new Map(nodes.map((n:any)=>[n,n[property]]));
  const undo=b.Undo,init=undo.initEdit;
  undo.initEdit=function(aspects:any,...rest:any[]){
    if(aspects?.mirror_modeling!==false||!Array.isArray(aspects.elements))return init.call(this,aspects,...rest);
    const affected=[...new Set([...aspects.elements,...(aspects.groups??[])])].filter(n=>before.has(n));
    const current=affected.map(n=>[n,n[property]]);
    try{
      for(const n of affected)n[property]=before.get(n);
      return init.call(this,aspects,...rest);
    }finally{for(const [n,value] of current)n[property]=value;}
  };
  try{return run();}finally{undo.initEdit=init;}
}
