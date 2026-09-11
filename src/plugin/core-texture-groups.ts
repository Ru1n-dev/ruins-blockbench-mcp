import type {BB} from './adapter.ts';
const pendingRefresh=new Map<HTMLImageElement,()=>void>();
const materialHooks=new Map<any,{descriptor:PropertyDescriptor|undefined,original:Function,wrapper:Function}>();
const undoHooks=new Map<any,{descriptor:PropertyDescriptor|undefined,wrapper:Function}>();
export function guardCoreMaterial(group:any) {
  if(materialHooks.has(group))return;
  const descriptor=Object.getOwnPropertyDescriptor(group,'updateMaterial'),original=group.updateMaterial;
  const wrapper=function(this:any,...args:any[]){return this.is_material?refreshCoreMaterial(this,args):original.apply(this,args);};
  Object.defineProperty(group,'updateMaterial',{configurable:true,writable:true,value:wrapper});
  materialHooks.set(group,{descriptor,original,wrapper});
}
export function disposeCoreMaterials() {
  for(const cleanup of pendingRefresh.values())cleanup();
  for(const [target,hook] of [...materialHooks,...undoHooks] as [any,{descriptor:PropertyDescriptor|undefined,wrapper:Function}][]) {
    const key=materialHooks.has(target)?'updateMaterial':'load';
    if(target[key]!==hook.wrapper)continue;
    if(hook.descriptor)Object.defineProperty(target,key,hook.descriptor);else delete target[key];
  }
  materialHooks.clear();undoHooks.clear();
}
export function refreshCoreMaterial(group:any,args:any[]=[]) {
  guardCoreMaterial(group);
  const original=materialHooks.get(group)!.original;
  if(!group.is_material)return;
  const textures=group.getTextures(),mer=textures.find((t:any)=>t.pbr_channel==='mer');
  let temporaryMap:any;
  const descriptor=Object.getOwnPropertyDescriptor(group,'getTextures');
  try {
    if(mer?.canvas?.width) {
      const materialTextures=textures.map((t:any)=>{
        if(t!==mer)return t;
        const facade=Object.create(t);
        Object.defineProperty(facade,'img',{value:{naturalWidth:t.canvas.width}});
        return facade;
      });
      if(!textures.some((t:any)=>t.pbr_channel==='color')) {
        const canvas=document.createElement('canvas');canvas.width=mer.width;canvas.height=mer.height;
        const context=canvas.getContext('2d')!,color=group.material_config.color_value;
        context.fillStyle=`rgb(${color[0]},${color[1]},${color[2]})`;context.fillRect(0,0,canvas.width,canvas.height);
        temporaryMap=mer.getOwnMaterial().map.clone();temporaryMap.image=canvas;
        const synthetic=Object.create(mer);
        Object.defineProperties(synthetic,{canvas:{value:canvas},pbr_channel:{value:'color'},getOwnMaterial:{value:()=>({map:temporaryMap})}});
        materialTextures.push(synthetic);
      }
      Object.defineProperty(group,'getTextures',{configurable:true,value:()=>materialTextures});
    }
    original.apply(group,args);
    if(temporaryMap) {
      group.material.map=null;
      const color=group.material_config.color_value;
      group.material.color.set({r:color[0]/255,g:color[1]/255,b:color[2]/255});
    }
  } finally {
    if(descriptor)Object.defineProperty(group,'getTextures',descriptor);else delete group.getTextures;
    temporaryMap?.dispose();
  }
  // 5.1.6 reads color_value[4] for an RGBA vector. Correct the alpha only
  // for enrolled group instances; do not replace the native prototype.
  if(!group.getTextures().some((t:any)=>t.pbr_channel==='color') && group.material)
    group.material.opacity=group.material_config.color_value[3]/255;
}
export function preserveTextureGroupUndo(b:BB,save:any) {
  if(!save?.texture_groups)return;
  if(undoHooks.has(save))return;
  const load=save.load;
  const descriptor=Object.getOwnPropertyDescriptor(save,'load');
  const wrapper=function(this:any,...args:any[]) {
    const result=load.apply(this,args);
    for(const id of Object.keys(this.texture_groups)) {
      const group=b.TextureGroup.all.find((g:any)=>g.uuid===id);
      if(group) {
        refreshCoreMaterial(group);
        for(const texture of group.getTextures()) {
          if(texture.img?.src) {
            const image=texture.img as HTMLImageElement;
            pendingRefresh.get(image)?.();
            const cleanup=()=>{image.removeEventListener('load',loaded);image.removeEventListener('error',cleanup);pendingRefresh.delete(image);};
            const loaded=()=>{cleanup();if(b.TextureGroup.all.includes(group))refreshCoreMaterial(group);};
            pendingRefresh.set(image,cleanup);
            image.addEventListener('load',loaded,{once:true});
            image.addEventListener('error',cleanup,{once:true});
          }
        }
      }
    }
    b.Canvas.updateAll();
    return result;
  };
  Object.defineProperty(save,'load',{configurable:true,value:wrapper});
  undoHooks.set(save,{descriptor,wrapper});
}
