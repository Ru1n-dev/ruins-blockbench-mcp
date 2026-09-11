import type { BB } from './adapter.ts';
import { withSplineSplitSelection } from './spline-selection-undo.ts';

// Accept only the known Blockbench 5.1.6 implementations before patching the
// shared handler; unrelated provider handlers are left untouched.
const pinnedRunHash='8523f8b213a984050bdb6beb025f8b53ebc833b5f2ef22b7e8452c896a10d755';
export async function coreSplineDeleteHandler(b:BB) {
  if(b.Blockbench.version!=='5.1.6')return;
  const handler=(b.Blockbench.SharedActions.actions.delete??[]).find((h:any)=>b.Condition(h.condition));
  if(!handler)return;
  const run=handler.run;
  const source=Function.prototype.toString.call(run).replace(/\r\n/g,'\n');
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(source));
  const hash=Array.from(new Uint8Array(digest),n=>n.toString(16).padStart(2,'0')).join('');
  if(handler.run!==run||(b.Blockbench.SharedActions.actions.delete??[]).find((h:any)=>b.Condition(h.condition))!==handler)return;
  return [pinnedRunHash,'2e4950a6397589a959b6712ecdd25df9bf7bf11a9e99f1284efaae924c9aff7e'].includes(hash)?handler:undefined;
}
export function withCoreSplineDelete<T>(b:BB,handler:any,run:()=>T,result:{opened_splines:string[]}):T {
  const original=handler.run;
  handler.run=function(){
    const targets=b.SplineMesh.selected.slice();
    const surviving=targets.slice();
    b.Undo.initEdit({elements:surviving,outliner:true,selection:true});
    for(const spline of targets){
      const selected=spline.getSelectedHandles(true);
      if(b.BarItems.spline_selection_mode.value==='handles'&&selected.length){
        for(const key of selected){
          const h=spline.handles[key];
          delete spline.handles[key];
          for(const role of ['control1','joint','control2'])delete spline.vertices[h[role]];
        }
        spline.curves={};
        const keys=Object.keys(spline.handles);
        if(spline.cyclic&&keys.length<2){spline.cyclic=false;result.opened_splines.push(spline.uuid);}
        for(let i=0;i<keys.length-1;i++)spline.addCurves(new b.SplineCurve(spline,{start_handle:keys[i],end_handle:keys[i+1]}));
        const selection=b.Project.spline_selection[spline.uuid];
        if(selection?.vertices)selection.vertices=selection.vertices.filter((id:string)=>Object.hasOwn(spline.vertices,id));
      }else {surviving.splice(surviving.indexOf(spline),1);spline.remove(false);}
    }
    b.Undo.finishEdit('Delete spline handle');
    b.Canvas.updateView({elements:surviving,selection:true,element_aspects:{geometry:true,faces:true,uv:surviving.length>0}});
  };
  try{return withSplineSplitSelection(b,run,true);}finally{handler.run=original;}
}
