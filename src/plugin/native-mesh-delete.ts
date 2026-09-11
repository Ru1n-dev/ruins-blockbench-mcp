import type {BB} from './adapter.ts';
import {Fault} from '../shared/types.ts';

/** Resolve native shared dispatch before allowing a component deletion. */
export function prepareMeshDelete(b:BB,meshes:any[],parameters:{selection_mode:string;keep_vertices:boolean}) {
  if(!b.Modes.edit || b.Prop.active_panel!=='preview' || b.BarItems.selection_mode.value!==parameters.selection_mode || b.Outliner.selected.some((n:any)=>!meshes.includes(n)))
    throw new Fault('MESH_DELETE_CONTEXT_CHANGED','Select the declared component mode and only meshes in the preview panel first');
  for(const mesh of meshes) {
    const components=parameters.selection_mode==='vertex'?mesh.getSelectedVertices():parameters.selection_mode==='edge'?mesh.getSelectedEdges():mesh.getSelectedFaces();
    if(!components.length)throw new Fault('MESH_COMPONENT_SELECTION','Every declared mesh requires selected components for deletion');
  }
  const first=(b.Blockbench.SharedActions.actions.delete||[]).find((handler:any)=>b.Condition(handler.condition));
  const source=first?.run?.toString()??'';
  if(!source.includes('Delete mesh part')||!source.includes('getSelectedEdges')||!source.includes('getSelectedFaces'))
    throw new Fault('MESH_DELETE_HANDLER_CHANGED','Native shared dispatch does not select the expected mesh component deletion handler');
  return (run:()=>void)=>{
    const keybind=b.BarItems.delete.keybind,original=keybind.additionalModifierTriggered;
    const descriptor=Object.getOwnPropertyDescriptor(keybind,'additionalModifierTriggered');
    try {
      // Named option is independent of user-customized shortcut modifiers.
      Object.defineProperty(keybind,'additionalModifierTriggered',{configurable:true,value:function(this:any,event:any,name:string,...rest:any[]) {
        return name==='keep_vertices'?parameters.keep_vertices:original.call(this,event,name,...rest);
      }});
      run();
    } finally {
      if(descriptor)Object.defineProperty(keybind,'additionalModifierTriggered',descriptor);else delete keybind.additionalModifierTriggered;
    }
  };
}
