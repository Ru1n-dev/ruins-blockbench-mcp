import {Fault,clone,type KeyData} from './types.ts';
export function retimeKeys(keys:KeyData[],ids:string[],options:{pivot:number;offset:number;scale:number;snap:boolean;collision:'reject'|'replace'},snapping:number) {
  const wanted=new Set(ids);
  if(wanted.size!==ids.length) throw new Fault('KEY_SELECTION_DUPLICATE','Keyframe IDs must be unique');
  const selected=ids.map(id=>{
    const key=keys.find(k=>k.id===id);
    if(!key) throw new Fault('NOT_FOUND','Keyframe not found');
    return key;
  });
  const changed=selected.map(source=>{
    const key=clone(source);
    let time=options.pivot+(key.time-options.pivot)*options.scale+options.offset;
    if(options.snap) time=Math.round(time*snapping)/snapping;
    if(!Number.isFinite(time)||time<0||time>1000) throw new Fault('KEY_TIME_RANGE','Transformed keyframe time must be between 0 and 1000 seconds');
    key.time=time;
    const left=source.bezier_left_time,right=source.bezier_right_time;
    if(key.interpolation==='bezier' && options.scale<0) {
      key.bezier_left_time=right?.map(t=>t*options.scale) as KeyData['bezier_left_time'];
      key.bezier_right_time=left?.map(t=>t*options.scale) as KeyData['bezier_right_time'];
      key.bezier_left_value=source.bezier_right_value?.slice() as KeyData['bezier_left_value'];
      key.bezier_right_value=source.bezier_left_value?.slice() as KeyData['bezier_right_value'];
    } else if(key.interpolation==='bezier') {
      key.bezier_left_time=left?.map(t=>t*options.scale) as KeyData['bezier_left_time'];
      key.bezier_right_time=right?.map(t=>t*options.scale) as KeyData['bezier_right_time'];
    }
    return key;
  });
  const collides=(a:KeyData,b:KeyData)=>a.node===b.node&&a.channel===b.channel&&Math.abs(a.time-b.time)<1e-6;
  for(let i=0;i<changed.length;i++) if(changed.slice(0,i).some(k=>collides(k,changed[i])))
    throw new Fault('KEY_COLLISION','Transformed keys collide with each other');
  const retained=keys.filter(k=>!wanted.has(k.id));
  const removed=retained.filter(k=>changed.some(c=>collides(k,c)));
  if(removed.length&&options.collision==='reject') throw new Fault('KEY_COLLISION','Transformed keys collide with unchanged keys',{key_ids:removed.map(k=>k.id)});
  const replacements=new Map(changed.map(k=>[k.id,k]));
  return keys.filter(k=>!removed.includes(k)).map(k=>replacements.get(k.id)??k);
}
