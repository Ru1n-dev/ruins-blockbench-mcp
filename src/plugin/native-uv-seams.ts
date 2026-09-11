import type {BB} from './adapter.ts';
import {Fault} from '../shared/types.ts';

export function editUvSeams(b:BB, targets:Array<{mesh_id:string;edges:[string,string][];mode:'auto'|'divide'|'join'}>) {
  if (!b.Format?.meshes || !b.Modes.edit) throw new Fault('UV_SEAM_UNAVAILABLE','Mesh seam editing requires an editable mesh format and edit mode');
  if (b.Dialog.open) throw new Fault('DIALOG_OPEN','Resolve the current dialog first');
  const edits = targets.map(target=>{
    const mesh = b.OutlinerNode.uuids[target.mesh_id];
    if (!(mesh instanceof b.Mesh)) throw new Fault('TYPE_MISMATCH',`${target.mesh_id} is not a mesh`);
    const edgeMap = new Map<string,string>();
    const ambiguous = new Set<string>();
    for (const face of Object.values(mesh.faces) as any[]) {
      const vertices:string[] = face.getSortedVertices();
      for (let i=0;i<vertices.length;i++) {
        const pair = [vertices[i],vertices[(i+1)%vertices.length]].sort();
        const key = pair.join('_'), identity = JSON.stringify(pair);
        if (edgeMap.has(key) && edgeMap.get(key)!==identity) ambiguous.add(key);
        edgeMap.set(key,identity);
      }
    }
    const edges = target.edges.map(pair=>{
      const sorted = [...pair].sort(), key = sorted.join('_');
      if (pair[0]===pair[1] || !pair.every(v=>Object.hasOwn(mesh.vertices,v)) || edgeMap.get(key)!==JSON.stringify(sorted))
        throw new Fault('MESH_EDGE_NOT_FOUND','A seam must reference a real mesh boundary edge',{mesh_id:target.mesh_id,edge:pair});
      if (ambiguous.has(key)) throw new Fault('MESH_EDGE_AMBIGUOUS','Native seam key collides with another edge',{mesh_id:target.mesh_id,edge:pair});
      return {pair,key};
    });
    return {mesh,mode:target.mode,edges};
  });
  const seen = new Map<any,Map<string,string>>();
  for (const edit of edits) {
    if (!seen.has(edit.mesh)) seen.set(edit.mesh,new Map());
    const keys = seen.get(edit.mesh)!;
    for (const {key} of edit.edges) {
      if (keys.has(key) && keys.get(key)!==edit.mode) throw new Fault('UV_SEAM_CONFLICT','One batch cannot assign different modes to the same edge');
      keys.set(key,edit.mode);
    }
  }
  const changed = [...seen].filter(([mesh,edges])=>[...edges].some(([key,mode])=>(mesh.seams[key] || 'auto')!==mode));
  if (!changed.length) return {changed_meshes:[],changed_edges:0,undo_entries:0};
  const elements = changed.map(([mesh])=>mesh);
  let changedEdges = 0;
  // Native Mesh.getUndoCopy omits empty seams; extend then retains the old map.
  // Keep explicit empty maps in both ends of this operation's native Undo save.
  const originals = elements.map(mesh=>({mesh,copy:mesh.getUndoCopy,own:Object.getOwnPropertyDescriptor(mesh,'getUndoCopy'),wrapped:null as any}));
  try {
    for (const item of originals) {
      item.wrapped = function(this:any,...args:any[]) {
        const value = item.copy.apply(this,args);
        value.seams = {...this.seams};
        return value;
      };
      item.mesh.getUndoCopy = item.wrapped;
    }
    b.Undo.initEdit({elements});
    for (const edit of edits) for (const {pair,key} of edit.edges) {
      if ((edit.mesh.seams[key] || 'auto')!==edit.mode) {
        edit.mesh.setSeam(pair,edit.mode==='auto' ? null : edit.mode);
        changedEdges++;
      }
    }
    b.Canvas.updateView({elements,selection:true});
    b.Undo.finishEdit('MCP UV seams');
  } catch(error) { if (b.Undo.current_save) b.Undo.cancelEdit(true); b.Canvas.updateAll(); throw error; }
  finally {
    for (const item of originals) if (item.mesh.getUndoCopy===item.wrapped) {
      if (item.own) Object.defineProperty(item.mesh,'getUndoCopy',item.own);
      else delete item.mesh.getUndoCopy;
    }
  }
  return {changed_meshes:elements.map(mesh=>({id:mesh.uuid,seams:{...mesh.seams}})),changed_edges:changedEdges,undo_entries:1};
}
