import type {BB} from './adapter.ts';
export function preserveBoneUndoFlags(b:BB,save:any) {
  for(const [id,data] of Object.entries(save?.elements??{}) as [string,any][]) {
    const node=b.OutlinerNode.uuids[id];
    if(['armature_bone','armature'].includes(node?.type)) Object.assign(data,{visibility:node.visibility,locked:node.locked,export:node.export});
  }
}
export function withBoneSaveFlags<T>(b:BB,compile:()=>T):T {
  const prior=new Map<any,PropertyDescriptor|undefined>();
  try {for(const node of [...(b.ArmatureBone?.all??[]),...(b.Armature?.all??[])]) {
    prior.set(node,Object.getOwnPropertyDescriptor(node,'getSaveCopy'));
    const original=node.getSaveCopy;
    Object.defineProperty(node,'getSaveCopy',{configurable:true,value:function(...args:any[]) {
      return {...original.apply(this,args),visibility:this.visibility,locked:this.locked,export:this.export};
    }});
  }
  return compile();}
  finally {for(const [node,descriptor] of prior) {if(descriptor) Object.defineProperty(node,'getSaveCopy',descriptor);else delete node.getSaveCopy;}}
}
