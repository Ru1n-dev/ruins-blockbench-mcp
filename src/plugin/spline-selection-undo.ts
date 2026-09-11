import type { BB } from './adapter.ts';

// Keep the native selectionSave lifecycle, including callbacks retained by amendEdit.
export function withSplineSelectionUndo<T>(b:BB,run:()=>T):T {
  const undo=b.Undo,init=undo.initEdit,amend=undo.amendEdit;
  undo.initEdit=function(aspects:any,...rest:any[]){return init.call(this,{...aspects,selection:true},...rest);};
  undo.amendEdit=function(form:any,callback:any,...rest:any[]){
    return amend.call(this,form,function(this:any,...args:any[]){return withSplineSelectionUndo(b,()=>callback.apply(this,args));},...rest);
  };
  try{return run();}finally{undo.initEdit=init;undo.amendEdit=amend;}
}

// Core extrusion finishes before updateView. Defer that commit until rendering
// succeeds, but flush before native amendEdit reads the just-created history entry.
export function withSplineExtrusionUndo<T>(b:BB,run:()=>T):T {
  const undo=b.Undo,finish=undo.finishEdit,amend=undo.amendEdit;
  const selection=JSON.parse(JSON.stringify(b.Project.spline_selection));
  let pending:any[]|undefined;
  const flush=()=>{if(pending){const args=pending;pending=undefined;return finish.apply(undo,args);}};
  undo.finishEdit=function(...args:any[]){pending=args;};
  undo.amendEdit=function(form:any,callback:any,...rest:any[]){
    flush();
    const result=amend.call(this,form,function(this:any,...args:any[]){
      // Native amendEdit has already undone the previous result. Preserve its
      // redo entry while the replacement runs, and restore it on failure.
      const entry=undo.history[undo.index],index=undo.index;
      try{return withSplineExtrusionUndo(b,()=>callback.apply(this,args));}
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
        // loadSave may fail after native Undo has decremented its index,
        // before the amendment callback (and its protection) runs.
        if(undo.index===index-1&&undo.history[undo.index]===entry)undo.redo(null,true);
        throw error;
      }
    };
    return result;
  };
  try{const result=run();flush();return result;}
  catch(error){
    if(undo.current_save)undo.cancelEdit(true);
    b.Project.spline_selection=selection;
    b.updateSelection();
    throw error;
  }
  finally{undo.finishEdit=finish;undo.amendEdit=amend;}
}

export function withSplineSplitSelection<T>(b:BB,run:()=>T,clearGeometrySelection=false):T {
  const before=JSON.parse(JSON.stringify(b.Project.spline_selection));
  return withSplineSelectionUndo(b,()=>{
    const undo=b.Undo,finish=undo.finishEdit;
    let pending:any[]|undefined;
    undo.finishEdit=function(...args:any[]){pending=args;};
    const commit=(args:any[])=>{
      const live=new Set(b.SplineMesh.all.map((n:any)=>n.uuid));
      for(const id of Object.keys(b.Project.spline_selection))if(!live.has(id))delete b.Project.spline_selection[id];
      const after=JSON.parse(JSON.stringify(b.Project.spline_selection));
      const entry=finish.apply(undo,args);
      if(clearGeometrySelection)for(const [save,map] of [[entry?.before,before],[entry?.post,after]]){
        if(!save)continue;
        const load=save.load;
        save.load=function(...args:any[]){
          const previous=b.Project.spline_selection;
          b.Project.spline_selection={};
          try{
            const result=load.apply(this,args);
            b.Project.spline_selection=JSON.parse(JSON.stringify(map));
            return result;
          }catch(error){b.Project.spline_selection=previous;throw error;}
        };
      }
      for(const [save,map] of [[entry?.selection_before,before],[entry?.selection_post,after]]){
        if(!save)continue;
        const load=save.load;
        save.load=function(...args:any[]){
          const result=load.apply(this,args);
          b.Project.spline_selection=JSON.parse(JSON.stringify(map));
          b.updateSelection();
          return result;
        };
      }
      return entry;
    };
    try{const result=run();if(pending)commit(pending);return result;}
    catch(error){
      const selected=undo.current_selection_save;
      if(undo.current_save)undo.cancelEdit(true);
      selected?.load();
      b.Project.spline_selection=JSON.parse(JSON.stringify(before));
      b.updateSelection();
      throw error;
    }finally{undo.finishEdit=finish;}
  });
}
