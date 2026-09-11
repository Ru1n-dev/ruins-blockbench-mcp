import type {BB} from './adapter.ts';

export function sampleIKFrames(b:BB,animation:any,sample:Function,rate:number) {
  const controllers=b.NullObject.all.filter((n:any)=>n.ik_target);
  if(controllers.length<2)return sample.call(animation,rate);
  const bones=[...b.Group.all,...b.ArmatureBone.all];
  const frames=new Map<number,{base:Map<string,number[]>,values:Map<string,number[]>,counts:Map<string,number>}>();
  const restore:Array<()=>void>=[];
  try {
    for(const controller of controllers) {
      const animator=animation.getBoneAnimator(controller);
      if(!animator?.displayIK)continue;
      const descriptor=Object.getOwnPropertyDescriptor(animator,'displayIK'),original=animator.displayIK;
      const wrapped=function(this:any,getSamples:boolean){
        if(!getSamples)return original.call(this,getSamples);
        let frame=frames.get(b.Timeline.time);
        if(!frame){frame={base:new Map(bones.map((n:any)=>[n.uuid,[n.mesh.rotation.x,n.mesh.rotation.y,n.mesh.rotation.z]])),values:new Map(),counts:new Map()};frames.set(b.Timeline.time,frame);}
        const result=original.call(this,getSamples);
        for(const id of Object.keys(result??{})) {
          const bone=bones.find((n:any)=>n.uuid===id),base=frame.base.get(id);
          if(!bone||!base)continue;
          frame.counts.set(id,(frame.counts.get(id)??0)+1);
          frame.values.set(id,[bone.mesh.rotation.x,bone.mesh.rotation.y,bone.mesh.rotation.z].map((v,i)=>(v-base[i])*180/Math.PI));
        }
        return result;
      };
      Object.defineProperty(animator,'displayIK',{configurable:true,writable:true,value:wrapped});
      restore.push(()=>{if(animator.displayIK!==wrapped)return;if(descriptor)Object.defineProperty(animator,'displayIK',descriptor);else delete animator.displayIK;});
    }
    const samples=sample.call(animation,rate);
    const overlapping=new Set<string>();
    for(const frame of frames.values())for(const [id,count] of frame.counts)if(count>1)overlapping.add(id);
    for(const id of overlapping)samples[id]=[...frames.values()].map(frame=>({array:frame.values.get(id)??[0,0,0]}));
    return samples;
  }finally{for(const reset of restore.reverse())reset();}
}
