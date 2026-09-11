import type {BB} from './adapter.ts';
import {Fault} from '../shared/types.ts';
import {withDuplicatedVertexWeights} from './mesh-duplicate-weights.ts';
export function withRetainedMeshAmend(b:BB,meshes:any[],operation:'extrude'|'inset'|'solidify'|'loop_cut',policy:'preserve'|'native',withUV:(run:()=>void)=>void,run:()=>void,recalculate?:(run:()=>void)=>void){
 const undo=b.Undo,amend=undo.amendEdit,project=b.Project;let active=true;
 undo.amendEdit=function(form:any,callback:any,...rest:any[]){
  const result=amend.call(this,form,function(this:any,...args:any[]){
   if(active)return callback.apply(this,args);
   if(recalculate)return recalculate(()=>callback.apply(this,args));
   if(operation==='loop_cut')throw new Fault('MESH_OPERATION_UNAVAILABLE','Loop cut amendment wrapper is missing');
   return withDuplicatedVertexWeights(b,meshes,operation,policy,()=>withUV(()=>callback.apply(this,args)));
  },...rest);
  const input=undo.amend_edit_menu.form,dispatch=input.dispatchEvent;let lastValues=input.getResult();
  input.dispatchEvent=function(event:string,...args:any[]){
   if(event!=='change'||active)return dispatch.call(this,event,...args);
   if(b.Project!==project||b.Mesh.selected.length!==meshes.length||meshes.some(mesh=>!b.Mesh.selected.includes(mesh)))throw new Fault('MESH_SELECTION_CHANGED','Amendment requires the original project and meshes');
   const history=undo.history.slice(),index=undo.index,saved=project.saved,entry=history[index-1];
   if(index!==history.length||!entry?.post)return dispatch.call(this,event,...args);
   const snapshot=new entry.post.constructor(entry.post.aspects),selection=entry.selection_post?new entry.selection_post.constructor(entry.selection_post.aspects):null;
   try{const value=dispatch.call(this,event,...args);lastValues=input.getResult();return value;}
   catch(error){
    try{
     const current=new snapshot.constructor(snapshot.aspects);
     undo.loadSave(snapshot,current);selection?.load();
     delete undo.current_save;delete undo.current_selection_save;
     undo.history.splice(0,undo.history.length,...history);undo.index=index;project.saved=saved;
     input.setValues(lastValues,false);b.Canvas.updateAll();
    }catch(rollback){throw new Fault('MESH_ROLLBACK_FAILED','Amendment failed and could not restore prior state',{original:String(error),rollback:String(rollback)});}
    throw error;
   }
  };
  // The initial typed setValues is inside the outer transaction. Remember its
  // successful values once that transaction returns, before later UI changes.
  inputs.push({input,remember:()=>{lastValues=input.getResult();}});
  return result;
 };
 const inputs:{input:any;remember:()=>void}[]=[];
 try{run();for(const entry of inputs)entry.remember();}
 finally{active=false;undo.amendEdit=amend;}
}
