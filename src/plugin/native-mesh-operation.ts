import {createDuplicatedSeams} from './mesh-duplicate-seams.ts';
import {withInsetFaceVertices} from './mesh-inset-selection.ts';
import {explicitMeshSeamSave} from './mesh-seam-undo.ts';
import {withDeletedMeshReferences} from './mesh-delete-references.ts';
import {createLoopCutWeights} from './mesh-loop-cut-weights.ts';
import { withRetainedMeshAmend } from './mesh-retained-amend.ts';
import { withDuplicatedVertexWeights } from './mesh-duplicate-weights.ts';
import { withVertexMergeSeams } from './mesh-vertex-merge-seams.ts';
import { withVertexMergeWeights } from './mesh-vertex-merge-weights.ts';
import { withMeshSplitWeights } from './mesh-split-weights.ts';
import { withMeshSplitSeams } from './mesh-split-seams.ts';
import { withMeshMergeSeams } from './mesh-merge-seams.ts';
import type { BB } from './adapter.ts';
import { Fault } from '../shared/types.ts';
import { meshActionIds, meshOperationSchema } from '../shared/mesh-operation.ts';
import { withOutlinerUndo } from './native-undo.ts';
import {prepareVertexWeights} from './native-vertex-weights.ts';
import {prepareMeshDelete} from './native-mesh-delete.ts';
import {prepareKnife} from './native-knife.ts';

// 5.1.6 passes one combined face-key list to every selected mesh.
// Partition only this action's auto-UV call and restore both native methods.
function withFaceAutoUV(b:BB,run:()=>void) {
  const uv=b.UVEditor,auto=uv.setAutoSize,get=uv.getMappableElements;
  const autoDescriptor=Object.getOwnPropertyDescriptor(uv,'setAutoSize');
  const getDescriptor=Object.getOwnPropertyDescriptor(uv,'getMappableElements');
  try {
    Object.defineProperty(uv,'setAutoSize',{configurable:true,value:function(this:any,event:any,silent:any,keys:any) {
      if(!Array.isArray(keys))return auto.call(this,event,silent,keys);
      try {
        for(const mesh of get.call(this)) {
          Object.defineProperty(this,'getMappableElements',{configurable:true,value:()=>[mesh]});
          auto.call(this,event,silent,keys.filter((key:string)=>Object.hasOwn(mesh.faces,key)));
        }
      } finally {
        if(getDescriptor)Object.defineProperty(this,'getMappableElements',getDescriptor);else delete this.getMappableElements;
      }
    }});
    run();
  } finally {
    if(autoDescriptor)Object.defineProperty(uv,'setAutoSize',autoDescriptor);else delete uv.setAutoSize;
    if(getDescriptor)Object.defineProperty(uv,'getMappableElements',getDescriptor);else delete uv.getMappableElements;
  }
}

/** Fixed native mesh actions; no arbitrary callback or script is accepted. */
export function runMeshOperation(b: BB, input: unknown, meshIds: string[]) {
  const spec = meshOperationSchema.parse(input);
  if (b.Blockbench.version !== '5.1.6') throw new Fault('VERSION_UNSUPPORTED','Dedicated mesh operations require Blockbench 5.1.6');
  if (b.Dialog.open) throw new Fault('DIALOG_OPEN','Resolve the current dialog first');
  const meshes = [...b.Mesh.selected];
  const creating=spec.operation==='create_primitive';
  const converting=spec.operation==='convert_to_mesh';
  const sources=converting?[...b.Cube.selected,...b.SplineMesh.selected]:[];
  if(converting && (meshIds.length || meshes.length || new Set(spec.parameters.source_ids).size!==spec.parameters.source_ids.length || sources.length!==spec.parameters.source_ids.length || sources.some(n=>!spec.parameters.source_ids.includes(n.uuid)) || b.Outliner.selected.some((n:any)=>!sources.includes(n))))
    throw new Fault('MESH_SOURCE_SELECTION_CHANGED','Select exactly the declared cube or spline source_ids; mesh_ids must be empty for conversion');
  if ((!creating && !converting && !meshes.length) || new Set(meshIds).size !== meshIds.length || meshes.length !== meshIds.length || meshes.some(m=>!meshIds.includes(m.uuid)))
    throw new Fault('MESH_SELECTION_CHANGED','Select exactly the declared mesh_ids and their components before editing');
  if(creating && ((b.getCurrentGroup()??b.Armature.selected[0])?.uuid??null)!==spec.parent_id)
    throw new Fault('MESH_PARENT_CHANGED','The native creation parent must match parent_id; use bb_select first');
  if(spec.operation==='merge_meshes' && meshes[0].uuid!==spec.parameters.target_mesh_id)
    throw new Fault('MESH_TARGET_CHANGED','The declared target_mesh_id must be the first selected native mesh');
  const beforeIds=new Set(b.Mesh.all.map((m:any)=>m.uuid));
  if(spec.operation==='calculate_vertex_weights') {
    const vertices=meshes.flatMap(mesh=>Object.keys(mesh.vertices).map(vertex_id=>({mesh_id:mesh.uuid,vertex_id,weights:{}})));
    if(vertices.length>20000)throw new Fault('WEIGHT_TARGET_LIMIT','Automatic weighting supports at most 20000 vertices per call');
    for(const mesh of meshes)if(!mesh.getArmature()?.getAllBones().length)
      throw new Fault('WEIGHT_ARMATURE_MISSING','Every declared mesh requires an armature containing bones');
    // Reuse the native-key collision checks without applying explicit weights.
    prepareVertexWeights(b,{vertices,mode:'merge',normalize:false},meshIds);
  }
  if(spec.operation==='create_faces')for(const mesh of meshes) {
    const vertices=mesh.getSelectedVertices();
    if(vertices.length<2)throw new Fault('MESH_COMPONENT_SELECTION','Face creation requires at least two selected vertices on every declared mesh');
    if(vertices.length>4 && !Object.values(mesh.faces).some((face:any)=>face.vertices.some((id:string)=>vertices.includes(id))))
      throw new Fault('MESH_REFERENCE_FACE_REQUIRED','Blockbench 5.1.6 requires an existing face sharing a selected vertex when creating faces from more than four vertices');
  }
  const weightEdit=spec.operation==='set_vertex_weights'?prepareVertexWeights(b,spec.parameters,meshIds):null;
  const deleteEdit=spec.operation==='delete_components'?prepareMeshDelete(b,meshes,spec.parameters):null;
  const knifeEdit=spec.operation==='knife'?prepareKnife(b,meshes,spec.parameters):null;
  const hierarchyEdit=creating||converting||!!deleteEdit||spec.operation==='merge_meshes'||spec.operation==='split_mesh';
  const affected=()=>b.Mesh.all.filter((m:any)=>meshIds.includes(m.uuid)||!beforeIds.has(m.uuid));
  const id = meshActionIds[spec.operation], action = b.BarItems[id];
  let actionAvailable=false;
  if(action&&!action.plugin){
    if(spec.operation==='inset')withInsetFaceVertices(b,meshes,()=>{actionAvailable=b.Condition(action.condition);});
    else actionAvailable=b.Condition(action.condition);
  }
  if (!actionAvailable) throw new Fault('ACTION_UNAVAILABLE',`${id} is unavailable for the current selection and format`);
  const splineSelectionMode = converting ? b.BarItems.spline_selection_mode : null;
  const previousSplineSelectionMode = splineSelectionMode?.value;
  if (converting) {
    // Blockbench's convert_to_mesh path reads the spline preview after it
    // has left handle selection mode. Refreshing the preview in object mode
    // avoids a stale handle selection from a prior project/case while keeping
    // the caller's UI mode intact after the operation.
    if (splineSelectionMode?.set && previousSplineSelectionMode !== 'object')
      splineSelectionMode.set('object');
    b.Canvas.updateAll();
  }
  const undo = b.Undo, history = undo.history.slice(), index = undo.index, saved = b.Project.saved;
  const beforeCounts = meshes.map(m=>({id:m.uuid,vertices:Object.keys(m.vertices).length,faces:Object.keys(m.faces).length}));
  let firstSave: any, firstSelection: any;
  // Native save.load refreshes transforms before selectionSave.load. Splitting
  // can leave the old component selection referencing vertices just removed.
  // Scope the workaround to these saves, including native toolbar Undo/Redo.
  const protectHierarchyLoad=(save:any)=>{
    if(!hierarchyEdit || Object.hasOwn(save,'load')) return;
    const nativeLoad=save.load;
    Object.defineProperty(save,'load',{configurable:true,value:function(reference:any,...rest:any[]) {
      const selection=b.Project.mesh_selection;
      const keys=new Set([...Object.keys(this.elements??{}),...Object.keys(reference?.elements??{})]);
      const prior=new Map([...keys].filter(key=>Object.hasOwn(selection,key)).map(key=>[key,selection[key]]));
      for(const key of keys) delete selection[key];
      try {return nativeLoad.call(this,reference,...rest);}
      finally {for(const [key,value] of prior) selection[key]=value;}
    }});
  };
  const init = undo.initEdit;
  const capture = function(this: any, ...args: any[]) {
    const result = init.apply(this,[{...args[0],selection:true},...args.slice(1)]);
    explicitMeshSeamSave(this.current_save);
    if (!firstSave) { firstSave = this.current_save; firstSelection = this.current_selection_save; protectHierarchyLoad(firstSave); }
    return result;
  };
  undo.initEdit = capture;
  const finish=undo.finishEdit;
  const finishCapture=function(this:any,message:any,aspects:any,...rest:any[]) {
    const entry=finish.call(this,message,converting?{...(aspects??this.current_save?.aspects),selection:true}:aspects,...rest);
    explicitMeshSeamSave(entry?.post);return entry;
  };
  undo.finishEdit=finishCapture;
  let appliedParameters:any={...spec.parameters};
  let vertexWeights:any;
  let mergeMappings:any;
  let seamPartition:any;
  let weightPartition:any;
  let vertexMergeWeights:any;
  let vertexMergeSeams:any;
  let copiedVertexWeights:any,copiedSeams:any;
  let interpolatedVertexWeights:any;
  let deletedReferences:any;
  const loopWeights=spec.operation==='loop_cut'?createLoopCutWeights(b,meshes,spec.parameters.weight_policy,spec.parameters.seam_policy,spec.parameters.length_reference):null;
  try {
    const execute=()=>withOutlinerUndo(b, () => {
      const distanceMerge=spec.operation==='merge_vertices_distance_first'||spec.operation==='merge_vertices_distance_center';
      const childId=spec.operation==='merge_vertices_first'?'merge_all':spec.operation==='merge_vertices_center'?'merge_all_in_center':spec.operation==='merge_vertices_distance_first'?'merge_by_distance':spec.operation==='merge_vertices_distance_center'?'merge_by_distance_in_center':null;
      if(weightEdit) vertexWeights=weightEdit.apply();
      else if(knifeEdit)knifeEdit();
      else if(deleteEdit&&spec.operation==='delete_components')deletedReferences=withDeletedMeshReferences(b,meshes,spec.parameters.reference_policy,()=>deleteEdit(()=>action.trigger(new MouseEvent('click'))));
      else if(childId) {
        const child=action.children?.find((c:any)=>c.id===childId);
        if(!child?.click || !b.Condition(child.condition)) throw new Fault('MESH_OPERATION_UNAVAILABLE','Native merge variant is unavailable');
        const mergeWithWeights=()=>{
        if(distanceMerge && 'distance' in spec.parameters) {
          const setting=b.settings.vertex_merge_distance;
          if(!setting || typeof setting.value!=='number') throw new Fault('MESH_PARAMETER_UNAVAILABLE','Native vertex merge distance is unavailable');
          const previous=setting.value;
          try {
            setting.value=spec.parameters.distance;
            child.click.call(child,new MouseEvent('click'));
            appliedParameters={...spec.parameters};
          } finally { setting.value=previous; }
        } else child.click.call(child,new MouseEvent('click'));
        };
        vertexMergeSeams=withVertexMergeSeams(b,meshes,'seam_policy' in spec.parameters?spec.parameters.seam_policy:'preserve','seam_conflict' in spec.parameters?spec.parameters.seam_conflict:'reject','distance' in spec.parameters?spec.parameters.distance:undefined,()=>{
          vertexMergeWeights=withVertexMergeWeights(b,meshes,'weight_policy' in spec.parameters?spec.parameters.weight_policy as 'first'|'average'|'native':'first','distance' in spec.parameters?spec.parameters.distance:undefined,mergeWithWeights);
        });
      } else {
        if(spec.operation==='merge_meshes')mergeMappings=withMeshMergeSeams(b,meshes,spec.parameters.weight_policy,()=>action.trigger(new MouseEvent('click')),spec.parameters.bone_map);
        else if(spec.operation==='split_mesh')seamPartition=withMeshSplitSeams(b,meshes,()=>{weightPartition=withMeshSplitWeights(b,meshes,spec.parameters.weight_policy,()=>action.trigger(new MouseEvent('click')));});
        else if(spec.operation==='create_faces')withFaceAutoUV(b,()=>action.trigger(new MouseEvent('click')));
        else if(spec.operation==='dissolve_edges')deletedReferences=withDeletedMeshReferences(b,meshes,spec.parameters.reference_policy,()=>action.trigger(new MouseEvent('click')),true);
        else if(loopWeights)loopWeights.trigger(action,()=>action.trigger(new MouseEvent('click')));
        else action.trigger(new MouseEvent('click'));
        if(creating) {
          const dialog=b.Dialog.open;
          if(dialog?.id!=='add_primitive') throw new Fault('MESH_OPERATION_UNAVAILABLE','Expected the native primitive dialog');
          dialog.setFormValues({...spec.parameters});
          dialog.confirm();
        }
      }
      const form = undo.amend_edit_menu?.form;
      const amend=['extrude','inset','solidify','loop_cut'].includes(spec.operation);
      if (!firstSave || (amend && !form)) throw new Fault('MESH_OPERATION_INCOMPLETE','Native operation did not produce its expected edit and parameter form');
      const parameters: any = {...spec.parameters};
      if(['extrude','inset','solidify','loop_cut'].includes(spec.operation)){delete parameters.weight_policy;delete parameters.seam_policy;}
      if(spec.operation==='loop_cut'){delete parameters.seam_policy;delete parameters.length_reference;}
      if (spec.operation === 'loop_cut' && parameters.offset === undefined) {
        // Native default is half the selected edge length, independent of cuts.
        if (parameters.unit === 'percent') parameters.offset = 50;
      }
      if(amend) {
        for (const key of Object.keys(parameters))
          if (!Object.hasOwn(form.form_config,key)) throw new Fault('MESH_PARAMETER_UNAVAILABLE',`Native form has no ${key} parameter`);
        // Native loop cut resets offset when its direction changes. Settle that
        // reset first so an explicit offset in this request is not discarded.
        if(spec.operation==='loop_cut'&&form.getResult().direction!==parameters.direction)
          form.setValues({direction:parameters.direction});
        form.setValues(parameters);
        appliedParameters=form.getResult();
        if('weight_policy' in spec.parameters)appliedParameters.weight_policy=spec.parameters.weight_policy;
        if('seam_policy' in spec.parameters)appliedParameters.seam_policy=spec.parameters.seam_policy;
        if(spec.operation==='loop_cut'){appliedParameters.seam_policy=spec.parameters.seam_policy;appliedParameters.length_reference=spec.parameters.length_reference;}
      }
      if (undo.current_save) throw new Fault('MESH_OPERATION_INCOMPLETE','Native edit did not finish');
      if (undo.history.slice(0,undo.index).filter((entry:any)=>!history.includes(entry)).length !== 1)
        throw new Fault('MESH_UNDO_MISMATCH','Native operation did not create exactly one applied Undo entry');
      if(hierarchyEdit) protectHierarchyLoad(undo.history[undo.index-1].post);
      if(deleteEdit) {
        // Native deletion cleans invalid selected vertices during updateView,
        // after finishEdit has already compared its selection snapshots.
        const entry=undo.history[undo.index-1];
        entry.selection_before=firstSelection;
        entry.selection_post=new firstSelection.constructor(firstSelection.aspects);
      }
      if(spec.operation==='calculate_vertex_weights') {
        vertexWeights=meshes.flatMap(mesh=>Object.keys(mesh.vertices).map(vertex_id=>({mesh_id:mesh.uuid,vertex_id,
          weights:Object.fromEntries(mesh.getArmature().getAllBones().map((bone:any)=>[bone.uuid,bone.getVertexWeight(mesh,vertex_id)]))})));
        if(vertexWeights.some((entry:any)=>Object.values(entry.weights).some((weight:any)=>!Number.isFinite(weight)||weight<0||weight>1)))
          throw new Fault('WEIGHT_INVALID_RESULT','Native automatic weighting produced an invalid weight');
      }
      for (const mesh of affected()) {
        for (const point of Object.values(mesh.vertices) as number[][])
          if (!point.every(Number.isFinite)) throw new Fault('MESH_INVALID_RESULT','Native operation produced non-finite vertices');
        for (const face of Object.values(mesh.faces) as any[])
          {
            if (face.vertices.some((key:string)=>!Object.hasOwn(mesh.vertices,key))) throw new Fault('MESH_INVALID_RESULT','Native operation produced a missing vertex reference');
            if(face.vertices.some((key:string)=>!Array.isArray(face.uv[key]) || face.uv[key].length!==2 || !face.uv[key].every(Number.isFinite)))
              throw new Fault('MESH_INVALID_RESULT','Native operation produced invalid face UV coordinates');
          }
      }
    },hierarchyEdit);
    if(spec.operation==='extrude'||spec.operation==='inset'||spec.operation==='solidify'){
      const operation=spec.operation,policy=spec.parameters.weight_policy;
      const withSurface=(run:()=>void)=>withFaceAutoUV(b,()=>operation==='inset'?withInsetFaceVertices(b,meshes,run):run());
      const seams=spec.parameters.seam_policy==='preserve'?createDuplicatedSeams(meshes):undefined;
      const recalculate=(run:()=>void)=>{const weights=withDuplicatedVertexWeights(b,meshes,operation,policy,()=>withSurface(run),seams);copiedSeams=seams?.records??[];return weights;};
      withRetainedMeshAmend(b,meshes,operation,policy,withSurface,()=>{copiedVertexWeights=recalculate(execute);},run=>{recalculate(run);});
    }
    else if(spec.operation==='loop_cut'&&loopWeights){
      withRetainedMeshAmend(b,meshes,'loop_cut',spec.parameters.weight_policy,run=>run(),()=>{interpolatedVertexWeights=loopWeights.run(execute);},run=>{loopWeights.run(run);});
    }else execute();
    return {operation:spec.operation,action_id:id,parameters:appliedParameters,
      ...(copiedSeams?{copied_seams:copiedSeams}:{}),
      ...(copiedVertexWeights?{copied_vertex_weights:copiedVertexWeights}:{}),
      ...(interpolatedVertexWeights?{interpolated_vertex_weights:interpolatedVertexWeights}:{}),
      ...(deletedReferences?{deleted_references:deletedReferences}:{}),
      ...(loopWeights?{split_seams:loopWeights.seams}:{}),
      ...(converting?{converted_source_ids:sources.map(n=>n.uuid)}:{}),
      ...(vertexWeights?{vertex_weights:vertexWeights}:{}),
      ...(vertexMergeWeights?{vertex_merge_weights:vertexMergeWeights}:{}),
      ...(vertexMergeSeams?{vertex_merge_seams:vertexMergeSeams}:{}),
      ...(weightPartition?{weight_partition:weightPartition}:{}),
      ...(seamPartition?{seam_partition:seamPartition}:{}),
      ...(mergeMappings?{merged_vertex_maps:mergeMappings}:{}),
      meshes:[...new Set([...meshIds,...affected().map((m:any)=>m.uuid)])].map(id=>{
        const m=b.Mesh.all.find((node:any)=>node.uuid===id);
        return {id,before:beforeCounts.find(entry=>entry.id===id)??null,after:m?{vertices:Object.keys(m.vertices).length,faces:Object.keys(m.faces).length}:null};
      }),
      created_mesh_ids:affected().filter((m:any)=>!beforeIds.has(m.uuid)).map((m:any)=>m.uuid),
      removed_mesh_ids:meshIds.filter(id=>!b.Mesh.all.some((m:any)=>m.uuid===id)),
      selected_mesh_ids:b.Mesh.selected.map((m:any)=>m.uuid),
      undo_entries:1};
  } catch(error) {
    try {
      if(creating && b.Dialog.open?.id==='add_primitive') b.Dialog.open.hide();
      if (firstSave) {
        const current = new firstSave.constructor(converting?{...firstSave.aspects,elements:[...sources,...affected()]}:firstSave.aspects);
        undo.loadSave(firstSave,current);
        firstSelection?.load();
        delete undo.current_save;
        delete undo.current_selection_save;
        undo.history.splice(0,undo.history.length,...history);
        undo.index = index;
        b.Project.saved = saved;
        undo.closeAmendEditMenu();
        b.Canvas.updateAll();
      }
    } catch(rollback) {
      throw new Fault('MESH_ROLLBACK_FAILED','Native mesh edit failed and rollback could not complete',{original:String(error),rollback:String(rollback)});
    }
    throw error;
  } finally {
    if (converting && splineSelectionMode?.set && previousSplineSelectionMode !== undefined && splineSelectionMode.value !== previousSplineSelectionMode)
      splineSelectionMode.set(previousSplineSelectionMode);
    if (undo.initEdit === capture) undo.initEdit = init;
    if (undo.finishEdit === finishCapture) undo.finishEdit = finish;
  }
}
