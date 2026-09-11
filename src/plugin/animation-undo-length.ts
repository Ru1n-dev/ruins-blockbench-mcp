import type {BB} from './adapter.ts';
// Animation.extend clamps length against old keys before loading saved keys.
// It also retains animators absent from the saved blueprint. Restore both on
// our own records after the native load, without changing its prototype.
export function preserveAnimationUndoLengths(b:BB,save:any) {
  if(!save?.animations || Object.hasOwn(save,'load')) return;
  const load=save.load;
  Object.defineProperty(save,'load',{configurable:true,value:function(...args:any[]) {
    const result=load.apply(this,args);
    for(const [id,data] of Object.entries(this.animations) as [string,any][]) {
      const animation=b.Animation.all.find((a:any)=>a.uuid===id);
      if(animation) for(const animator of Object.keys(animation.animators))
        if(!Object.hasOwn(data.animators??{},animator)) animation.removeAnimator(animator);
      if(animation) animation.markers.splice(0,animation.markers.length,...(data.markers??[]).map((m:any)=>new b.Blockbench.TimelineMarker(m)));
      if(animation && Number.isFinite(data.length)) animation.length=data.length;
    }
    return result;
  }});
}
