import type {BB} from './adapter.ts';
import {Fault} from '../shared/types.ts';
import {sampleIKFrames} from './ik-sample-frames.ts';

export function withIKBakeUndo<T>(b:BB,run:()=>T,onSamples?:(samples:any)=>void):T {
  const animation=b.Animation.selected;
  if(b.Blockbench.version!=='5.1.6'||!animation)throw new Fault('IK_BAKE_CONTEXT','IK bake requires Blockbench 5.1.6 and a selected animation');
  const undo=b.Undo,init=undo.initEdit;
  const casualties=Object.getOwnPropertyDescriptor(undo,'addKeyframeCasualties');
  const backup=new undo.constructor.save({animations:[...b.Animation.all]});
  const history=undo.history.slice(),index=undo.index,time=b.Timeline.time,saved=b.Project.saved;
  const timeline=b.Timeline.animators.slice(),selectedKeys=b.Timeline.selected.map((k:any)=>k.uuid);
  const playing=b.Animation.all.map((a:any)=>[a,a.playing]);
  const animatorIds=b.Animation.all.map((a:any)=>[a,new Set(Object.keys(a.animators))]);
  const sampleDescriptor=Object.getOwnPropertyDescriptor(animation,'sampleIK'),sampleIK=animation.sampleIK;
  const snapTime=b.Timeline.snapTime,snapDescriptor=Object.getOwnPropertyDescriptor(b.Timeline,'snapTime');
  let sampledRate=animation.snapping;
  const capture=function(this:any,aspects:any,...rest:any[]) {
    // The native empty-keyframe snapshot is skipped when Timeline.animators
    // is empty. Capture the animation, including all keys, at both ends.
    const {keyframes,...remaining}=aspects;
    return init.call(this,{...remaining,animations:[animation]},...rest);
  };
  undo.initEdit=capture;
  try{
    // Animation snapshots already preserve replaced keys. A keyframe casualty
    // snapshot would incorrectly restore keys created earlier in this bake.
    Object.defineProperty(undo,'addKeyframeCasualties',{configurable:true,writable:true,value:()=>{}});
    if(animation.snapping>144||onSamples||b.NullObject.all.filter((n:any)=>n.ik_target).length>1) {
      Object.defineProperty(animation,'sampleIK',{configurable:true,writable:true,value:function(this:any,rate:number){
        const samples=sampleIKFrames(b,this,sampleIK,rate);
        sampledRate=Math.min(144,Math.max(1,rate));
        onSamples?.(samples);
        return samples;
      }});
      if(animation.snapping>144)Object.defineProperty(b.Timeline,'snapTime',{configurable:true,writable:true,value:function(this:any,time:number,selected:any){
        // The bake supplies its animation explicitly; createKeyframe's second
        // snap omits it, so the sample-time correction is applied only once.
        return snapTime.call(this,selected===animation?Math.round(time*animation.snapping)/sampledRate:time,selected);
      }});
    }
    return run();
  }catch(error) {
    try {
      undo.loadSave(backup,new undo.constructor.save(backup.aspects));
      for(const [a,ids] of animatorIds)for(const id of Object.keys(a.animators))if(!ids.has(id))delete a.animators[id];
      delete undo.current_save;delete undo.current_selection_save;
      undo.history.splice(0,undo.history.length,...history);undo.index=index;
      for(const [a,value] of playing)a.playing=value;
      b.Timeline.animators.splice(0,b.Timeline.animators.length,...timeline);
      b.Timeline.selected.splice(0,b.Timeline.selected.length,...Object.values(animation.animators).flatMap((a:any)=>a.keyframes).filter((k:any)=>selectedKeys.includes(k.uuid)));
      b.Timeline.setTime(time);b.Animator.resetLastValues();
      if(b.Animator.open)b.Animator.preview();else b.Canvas.updateAllBones();
      b.Project.saved=saved;
    }catch(rollback){throw new Fault('IK_BAKE_ROLLBACK_FAILED','IK bake failed and restoration was incomplete',{original:String(error),rollback:String(rollback)});}
    throw error;
  }finally{
    if(casualties)Object.defineProperty(undo,'addKeyframeCasualties',casualties);else delete undo.addKeyframeCasualties;
    if(snapDescriptor)Object.defineProperty(b.Timeline,'snapTime',snapDescriptor);else delete b.Timeline.snapTime;
    if(sampleDescriptor)Object.defineProperty(animation,'sampleIK',sampleDescriptor);else delete animation.sampleIK;
    if(undo.initEdit===capture)undo.initEdit=init;
  }
}

export function bakeIK(b:BB,args:any) {
  const animation=b.Animation.selected,action=b.BarItems.bake_ik_animation;
  if(!animation||animation.uuid!==args.animation_id||!b.Modes.animate||b.Timeline.playing||b.Dialog.open)throw new Fault('IK_BAKE_CONTEXT','Select the declared animation in animate mode, stop playback and close dialogs');
  if(!action||action.plugin||!b.Condition(action.condition))throw new Fault('IK_BAKE_UNAVAILABLE','The core IK bake action is unavailable');
  if(!Number.isFinite(animation.snapping)||animation.snapping<10||animation.snapping>500||!Number.isFinite(animation.length)||animation.length<0)throw new Fault('IK_BAKE_RANGE','Animation snapping must be 10..500 and length must be finite and nonnegative');
  const requestedLength=animation.length;
  let generated=0;const replaced=new Set<string>();
  const result=withIKBakeUndo(b,()=>action.trigger(new MouseEvent('click')),samples=>{
    const rate=Math.min(144,animation.snapping),fps=Math.min(120,animation.snapping);
    for(const [id,frames] of Object.entries(samples) as [string,any[]][]) {
      const values=frames.map(f=>f.array.map((v:number)=>Math.round(v*10000)/10000));
      const same=(a:any,b:any)=>JSON.stringify(a)===JSON.stringify(b);
      const times=new Set<number>();
      for(let i=0;i<values.length;i++) {
        if(!values[i].every(Number.isFinite))throw new Fault('IK_BAKE_NONFINITE','Native solver produced a nonfinite rotation');
        if((!values[i-1]||same(values[i-1],values[i]))&&(!values[i+1]||same(values[i+1],values[i])))continue;
        times.add(Math.round(i/rate*fps)/fps);
      }
      generated+=times.size;
      const ordered=[...times].sort((a,b)=>a-b);
      for(const key of animation.animators[id]?.rotation??[]) {
        let lo=0,hi=ordered.length;
        while(lo<hi){const mid=(lo+hi)>>>1;if(ordered[mid]<key.time)lo=mid+1;else hi=mid;}
        if([ordered[lo-1],ordered[lo]].some(t=>Math.abs(t-key.time)<0.0001))replaced.add(key.uuid);
      }
    }
    if(args.conflict_policy==='error'&&replaced.size)throw new Fault('IK_BAKE_KEY_CONFLICT','Baked rotations would replace existing keys',{key_ids:[...replaced]});
  });
  return {animation_id:animation.uuid,dispatched:result!==false,conflict_policy:args.conflict_policy,generated_rotation_keys:generated,replaced_key_ids:[...replaced],configured_rate:animation.snapping,sample_rate:Math.min(144,animation.snapping),timeline_rate:Math.min(120,animation.snapping),requested_length:requestedLength,native_duration_limit:200,truncated:requestedLength>200,undo_entries:1};
}
