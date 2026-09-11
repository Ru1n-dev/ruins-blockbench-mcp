import type {BB} from './adapter.ts';
import {Fault} from '../shared/types.ts';
export function configureIK(b:BB,args:any) {
  if(b.Blockbench.version!=='5.1.6'||!b.Format.animation_mode)throw new Fault('IK_FORMAT_UNSUPPORTED','IK requires Blockbench 5.1.6 and an animation-capable format');
  if(b.Dialog.open)throw new Fault('DIALOG_OPEN','Finish the current dialog first');
  const bones=[...b.Group.all,...b.ArmatureBone.all],targets=[...bones,...b.Locator.all];
  const prepared=args.bindings.map((binding:any)=>{
    const controller=b.NullObject.all.find((n:any)=>n.uuid===binding.controller_id);
    if(!controller)throw new Fault('IK_CONTROLLER_MISSING','controller_id must identify a Null Object');
    const target=binding.target_id===null?null:targets.find((n:any)=>n.uuid===binding.target_id);
    if(binding.target_id!==null&&!target)throw new Fault('IK_TARGET_MISSING','IK target must be a Group, Armature Bone or Locator');
    const source=binding.source_id===null?controller.parent:bones.find((n:any)=>n.uuid===binding.source_id);
    if(!source)throw new Fault('IK_SOURCE_MISSING','Explicit IK source must be a Group or Armature Bone');
    const chain:any[]=[];
    if(target) {
      let current=target.parent;const visited=new Set();
      while(current!==source) {
        if(!bones.includes(current)||visited.has(current))throw new Fault('IK_CHAIN_INVALID','The source must be an ancestor of the target with a continuous bone chain');
        visited.add(current);chain.push(current);current=current.parent;
      }
      if(binding.source_id!==null)chain.push(source);
      if(!chain.length)throw new Fault('IK_CHAIN_EMPTY','The native solver would have no bones to rotate');
      chain.reverse();
    }
    return {binding,controller,chain,source};
  });
  const undo=b.Undo,history=undo.history.slice(),index=undo.index,saved=b.Project.saved;
  const elements=prepared.map((p:any)=>p.controller);let before:any;
  try {
    undo.initEdit({elements});before=undo.current_save;
    for(const {binding,controller} of prepared)controller.extend({ik_target:binding.target_id??'',ik_source:binding.source_id??'',lock_ik_target_rotation:binding.lock_target_rotation});
    b.Canvas.updateAll();undo.finishEdit('Configure inverse kinematics');
    return {bindings:prepared.map(({binding,chain,source}:any)=>({...binding,effective_source_id:source==='root'?null:source.uuid,chain_ids:chain.map((n:any)=>n.uuid)})),undo_entries:1};
  }catch(error) {
    if(before) {
      try {
        undo.loadSave(before,new before.constructor(before.aspects));delete undo.current_save;delete undo.current_selection_save;
        undo.history.splice(0,undo.history.length,...history);undo.index=index;b.Project.saved=saved;
      }catch(rollback){throw new Fault('IK_ROLLBACK_FAILED','IK failed and restoration was incomplete',{original:String(error),rollback:String(rollback)});}
    }
    throw error;
  }
}
