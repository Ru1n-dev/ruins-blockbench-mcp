import type {BB} from './adapter.ts';
import {Fault,stable} from '../shared/types.ts';

export class SharedActionContext {
  private tokens=new Map<string,{action:string;handler:any;run:any;context:string}>();
  constructor(private b:BB) {}
  private context() {
    const b=this.b,p=b.Project;
    const selection=b.UVEditor?.texture?.selection;
    let mask:string|undefined;
    if(selection && selection.override==null && selection.array) {
      // Preserve the exact byte mask, including non-binary values, without hashing collisions.
      const values=selection.array;
      const chunks:string[]=[];
      for(let i=0;i<values.length;i+=4096)chunks.push(String.fromCharCode(...Array.from(values.subarray(i,i+4096) as Int8Array,n=>n&255)));
      mask=chunks.join('');
    }
    return stable({project:p?.uuid,mode:b.Modes?.selected?.id,panel:b.Prop?.active_panel,
      tool:b.Toolbox?.selected?.id,nodes:[...(p?.selected_elements||[]),...(p?.selected_groups||[])].map(n=>n.uuid),
      texture:b.Texture?.selected?.uuid,layer:b.TextureLayer?.selected?.uuid,
      animation:b.Animation?.selected?.uuid,controller:b.AnimationController?.selected?.uuid,
      keys:(b.Timeline?.selected||[]).map((k:any)=>k.uuid),mesh_selection:p?.mesh_selection,
      mesh_mode:b.BarItems?.selection_mode?.value,spline_mode:b.BarItems?.spline_selection_mode?.value,spline_selection:p?.spline_selection,
      controller_state:b.AnimationController?.selected?.selected_state?.uuid,
      collections:(b.Collection?.selected||[]).map((c:any)=>c.uuid),
      reference_image:b.ReferenceImage?.selected?.uuid,reference_image_mode:b.ReferenceImageMode?.active,
      texture_group:b.TextureGroup?.active_menu_group?.uuid,
      palette_color:b.ColorPanel?.panel?.vue?.selected_color,
      uv_texture:b.UVEditor?.texture?.uuid,pixels:selection?{width:selection.width,height:selection.height,override:selection.override,mask}:undefined,
      faces:(b.Outliner?.selected||[]).filter((n:any)=>n.faces).map((n:any)=>[n.uuid,b.UVEditor.getSelectedFaces(n)]),
    });
  }
  read() {
    const shared=this.b.Blockbench.SharedActions;
    if(!shared?.actions)return [];
    const context=this.context();
    if(context.length>1000000)return [{unavailable_reason:'selection_context_too_large'}];
    return Object.entries(shared.actions).map(([action,raw])=>{
      let first=true;
      const handlers=(raw as any[]).map(handler=>{
        let available=false,condition_error=false;
        try {available=!!this.b.Condition(handler.condition);} catch {condition_error=true;}
        const would_run=first && available;
        if(would_run)first=false;
        let handler_token:string|undefined;
        if(would_run) {
          handler_token=crypto.randomUUID();
          this.tokens.set(handler_token,{action,handler,run:handler.run,context});
          while(this.tokens.size>128)this.tokens.delete(this.tokens.keys().next().value!);
        }
        return {subject:handler.subject??null,priority:handler.priority??0,available,would_run,condition_error,handler_token};
      });
      return {action_id:action,handlers};
    });
  }
  assert(action:string,token:string) {
    const saved=this.tokens.get(token);
    this.tokens.delete(token);
    if(!saved || saved.action!==action || saved.context!==this.context())
      throw new Fault('SHARED_ACTION_CONTEXT_CHANGED','Selection, active panel or inspected shared action changed; inspect bb_editor_state again');
    const actual=(this.b.Blockbench.SharedActions.actions[action]||[]).find((handler:any)=>this.b.Condition(handler.condition));
    if(actual!==saved.handler || actual.run!==saved.run)throw new Fault('SHARED_ACTION_HANDLER_CHANGED','Native dispatch would choose a different or replaced handler; inspect bb_editor_state again');
    return {subject:actual.subject??null,priority:actual.priority??0};
  }
}
