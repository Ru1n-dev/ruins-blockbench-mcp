import type { BB } from "./adapter.ts";
import { withNativeFiles } from "./native-files.ts";
const augmentedSaves = new WeakSet<object>();
// In Blockbench 5, group data is no longer covered by outliner alone.
// Several pinned legacy plugins still use only outliner:true. Add groups at
// both ends of a synchronous native callback, preserving explicit aspects.
export function withOutlinerUndo<T>(
  b: BB,
  run: () => T,
  requireOutliner = false,
): T {
  return withNativeFiles(b, () => withUndo(b, run, requireOutliner));
}
function withUndo<T>(b: BB, run: () => T, requireOutliner: boolean): T {
  if (b.Blockbench.version !== "5.1.6" || !b.Undo) return run();
  const undo = b.Undo,
    init = undo.initEdit,
    finish = undo.finishEdit;
  const hasGroups = (aspects: any) =>
    aspects &&
    (Object.hasOwn(aspects, "groups") || Object.hasOwn(aspects, "group"));
  const amend = (aspects: any) => {
    const base =
      requireOutliner && aspects ? { ...aspects, outliner: true } : aspects;
    return base?.outliner && !hasGroups(base)
      ? { ...base, groups: [...b.Group.all] }
      : base;
  };
  const patchedInit = function (this: any, aspects: any, ...rest: any[]) {
    const updated = amend(aspects),
      result = init.call(this, updated, ...rest);
    if (updated !== aspects && this.current_save)
      augmentedSaves.add(this.current_save);
    return result;
  };
  const patchedFinish = function (
    this: any,
    label: any,
    aspects: any,
    ...rest: any[]
  ) {
    const updated =
      this.current_save &&
      augmentedSaves.has(this.current_save) &&
      !hasGroups(aspects)
        ? {
            ...(aspects ?? this.current_save.aspects),
            ...(requireOutliner ? { outliner: true } : {}),
            groups: [...b.Group.all],
          }
        : amend(aspects);
    return finish.call(this, label, updated, ...rest);
  };
  undo.initEdit = patchedInit;
  undo.finishEdit = patchedFinish;
  try {
    return run();
  } finally {
    if (undo.initEdit === patchedInit) undo.initEdit = init;
    if (undo.finishEdit === patchedFinish) undo.finishEdit = finish;
  }
}

// Core Spline creation and its retained amend callback both create child nodes.
export function withSplineCreationUndo<T>(b:BB,run:()=>T,shape?:string):T {
  const undo=b.Undo,amend=undo.amendEdit;
  let flush=()=>{};
  undo.amendEdit=function(form:any,callback:any,...rest:any[]){
    flush();
    if(shape&&['segment','square','circle'].includes(shape)&&form.width)form={...form,width:{...form.width,condition:shape==='square',label:b.tl('dialog.add_spline.width')}};
    const result=amend.call(this,form,function(this:any,...args:any[]){
      const index=undo.index,entry=undo.history[index];
      try{return withSplineCreationUndo(b,()=>callback.apply(this,args),shape);}
      catch(error){
        if(undo.index===index&&undo.history[index]===entry)undo.redo(null,true);
        throw error;
      }
    },...rest);
    const input=undo.amend_edit_menu.form,dispatch=input.dispatchEvent;
    input.dispatchEvent=function(event:string,...args:any[]){
      if(event!=='change')return dispatch.call(this,event,...args);
      const index=undo.index,entry=undo.history[index-1];
      try{return dispatch.call(this,event,...args);}
      catch(error){
        if(undo.index===index-1&&undo.history[undo.index]===entry)undo.redo(null,true);
        throw error;
      }
    };
    return result;
  };
  const execute=()=>{
    const finish=undo.finishEdit;
    let pending:any[]|undefined;
    flush=()=>{if(pending){const args=pending;pending=undefined;finish.apply(undo,args);}};
    undo.finishEdit=function(...args:any[]){pending=args;};
    try{const result=run();flush();return result;}catch(error){
      const selection=undo.current_selection_save;
      if(undo.current_save)undo.cancelEdit(true);
      selection?.load();
      throw error;
    }finally{undo.finishEdit=finish;}
  };
  try{return withOutlinerUndo(b,execute,true);}finally{undo.amendEdit=amend;}
}
