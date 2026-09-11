import type {BB} from './adapter.ts';
import {Fault} from '../shared/types.ts';

export function pickNativeColor(b:BB,args:any) {
  if(b.Blockbench.version!=='5.1.6')throw new Fault('VERSION_UNSUPPORTED','Color picking requires Blockbench 5.1.6');
  if(!b.Modes.paint||b.Toolbox.selected?.id!=='color_picker')throw new Fault('PICKER_CONTEXT_CHANGED','Select color_picker in paint mode first');
  if(b.Dialog.open)throw new Fault('DIALOG_OPEN','Close the current dialog before picking a color');
  const texture=b.Texture.selected;
  if(!texture||texture.uuid!==args.texture_id)throw new Fault('PICKER_TEXTURE_CHANGED','Select the declared texture first');
  if(!texture.canvas?.width||!texture.canvas?.height||texture.error)throw new Fault('PICKER_TEXTURE_UNAVAILABLE','The selected texture must be loaded without an error');
  if(args.x>=texture.canvas.width||args.y>=texture.canvas.height)throw new Fault('PICKER_COORDINATE_OUTSIDE','Pixel coordinates must be inside the full texture canvas');
  const panel=b.ColorPanel.panel.vue,history=panel._data.history;
  const colors={primary:panel.main_color,secondary:panel.second_color},stored=localStorage.getItem('colors'),historyBefore=[...history];
  const opacities=Object.values(b.BarItems).filter((tool:any)=>tool.tool_settings&&tool.tool_settings.brush_opacity>=0).map((tool:any)=>({tool,value:tool.tool_settings.brush_opacity}));
  const originalTool=b.Toolbox.original;
  const preferences=Object.fromEntries(['pick_combined_color','pick_color_opacity','color_picker_tool_switch'].map(id=>[id,b.settings[id].value]));
  const overrides:Record<string,boolean>={};
  if(args.options?.source!==undefined)overrides.pick_combined_color=args.options.source==='combined';
  if(args.options?.pick_opacity!==undefined)overrides.pick_color_opacity=args.options.pick_opacity;
  if(args.options?.switch_tool!==undefined)overrides.color_picker_tool_switch=args.options.switch_tool;
  const preferenceDescriptors=new Map<string,PropertyDescriptor|undefined>();
  const getPixel=b.Painter.getPixelColor,descriptor=Object.getOwnPropertyDescriptor(b.Painter,'getPixelColor'),samples:any[]=[];
  try {
    for(const [id,value] of Object.entries(overrides)) {
      preferenceDescriptors.set(id,Object.getOwnPropertyDescriptor(b.settings[id],'value'));
      Object.defineProperty(b.settings[id],'value',{configurable:true,get:()=>value});
      preferences[id]=value;
    }
    Object.defineProperty(b.Painter,'getPixelColor',{configurable:true,value:function(this:any,ctx:any,x:number,y:number) {
      const color=getPixel.call(this,ctx,x,y);
      samples.push({source:ctx===texture.ctx?'combined':'active_layer',x,y,rgba:color.toRgb(),hex:color.toHex8String()});
      return color;
    }});
    b.Painter.colorPicker(texture,args.x,args.y,new MouseEvent('click',{button:args.target==='secondary'?2:0}));
    return {texture_id:texture.uuid,x:args.x,y:args.y,target:args.target,effective_preferences:preferences,samples,
      colors:{primary:panel.main_color,secondary:panel.second_color},
      brush_opacities:Object.fromEntries(opacities.map(({tool}:any)=>[tool.id,tool.tool_settings.brush_opacity])),
      original_tool:b.Toolbox.original?.id??null,model_undo:false};
  } catch(error) {
    const failures:string[]=[];
    for(const {tool,value} of opacities)tool.tool_settings.brush_opacity=value;
    b.Toolbox.original=originalTool;
    for(const [key,value] of Object.entries(colors))try{b.ColorPanel.change(value,key==='secondary');}catch(e){failures.push(String(e));}
    try{history.splice(0,history.length,...historyBefore);if(stored===null)localStorage.removeItem('colors');else localStorage.setItem('colors',stored);}catch(e){failures.push(String(e));}
    try{b.BarItems.slider_brush_opacity.update();}catch(e){failures.push(String(e));}
    if(failures.length)throw new Fault('PICKER_ROLLBACK_FAILED','Color picking failed and restoration was incomplete',{original:String(error),failures});
    throw new Fault('PICKER_FAILED','Color picking failed; colors, opacity and history restored',{original:String(error)});
  } finally {
    for(const [id,descriptor] of preferenceDescriptors) {
      if(descriptor)Object.defineProperty(b.settings[id],'value',descriptor);else delete b.settings[id].value;
    }
    if(descriptor)Object.defineProperty(b.Painter,'getPixelColor',descriptor);else delete b.Painter.getPixelColor;
  }
}
