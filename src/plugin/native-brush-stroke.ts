import type {BB} from './adapter.ts';
import {Fault} from '../shared/types.ts';
import {waitForImage} from './image-loading.ts';
import {shapeSurfaceClip} from './shape-surface-clip.ts';
import {paintSurface} from './paint-surface.ts';

export async function nativeBrushStroke(b:BB,args:any) {
  if(b.Blockbench.version!=='5.1.6')throw new Fault('VERSION_UNSUPPORTED','Brush strokes require Blockbench 5.1.6');
  if(!b.Modes.paint||b.Toolbox.selected?.id!==args.tool_id||b.Toolbox.selected.plugin)throw new Fault('BRUSH_CONTEXT_CHANGED','Select the declared core brush in paint mode first');
  if(b.Dialog.open||b.PointerTarget.active)throw new Fault('BRUSH_BUSY','Finish the current dialog or pointer operation first');
  if(Object.values(b.Pressing.overrides).some(Boolean))throw new Fault('BRUSH_MODIFIERS_ACTIVE','Release modifier overrides before starting a scripted stroke');
  if(args.tool_id==='fill_tool'&&!b.Condition(b.BarItems.fill_mode.options[b.BarItems.fill_mode.value]?.condition))throw new Fault('FILL_MODE_UNAVAILABLE','Current fill mode is unavailable in this format');
  const texture=b.Texture.selected;
  if(!texture||texture.uuid!==args.texture_id||texture.error)throw new Fault('BRUSH_TEXTURE_CHANGED','Select the declared loaded texture first');
  const layer=texture.layers_enabled?texture.getActiveLayer():null;
  if((layer?.uuid??null)!==args.layer_id)throw new Fault('BRUSH_LAYER_CHANGED','The active paint layer must match layer_id');
  if(!args.surface&&args.points.some((p:any)=>p.face_id!==undefined))throw new Fault('PAINT_SURFACE_REQUIRED','Per-point face_id requires surface');
  const surfaces=args.points.map((p:any)=>paintSurface(b,args.surface?{...args.surface,face_id:p.face_id??args.surface.face_id}:undefined,texture));
  const surface=surfaces[0];
  const clip=args.surface_clip==='face_selection'?shapeSurfaceClip(b,surface,texture):undefined;
  if(args.points.some((p:any)=>p.x>=texture.canvas.width||p.y>=texture.canvas.height))throw new Fault('BRUSH_COORDINATE_OUTSIDE','Stroke points must lie inside the full texture canvas');
  const source=args.copy_source&&b.Texture.all.find((t:any)=>t.uuid===args.copy_source.texture_id);
  if(args.tool_id==='copy_brush'&&(!source||source.error||args.copy_source.x>=source.width||args.copy_source.y>=source.height))throw new Fault('BRUSH_COPY_SOURCE_INVALID','Copy source must be a loaded texture and a point inside its dimensions');
  if(source&&b.settings.paint_with_stylus_only.value&&args.pointer_type!=='pen')throw new Fault('BRUSH_STROKE_CANCELED','Native brush requires pen input');
  const painter=b.Painter,undo=b.Undo,history=undo.history.slice(),index=undo.index,saved=b.Project.saved,textureSaved=texture.saved;
  const prior={startPixel:painter.startPixel,current:painter.current,currentPixel:painter.currentPixel,brushChanges:painter.brushChanges,editing_area:painter.editing_area,canceled:painter.paint_stroke_canceled};
  const init=undo.initEdit;let firstSave:any,firstSelection:any;
  const secondaryKey=b.Keybinds.extra.paint_secondary_color.keybind;
  const secondaryDescriptor=Object.getOwnPropertyDescriptor(secondaryKey,'isTriggered');
  const colorDescriptor=Object.getOwnPropertyDescriptor(b.ColorPanel,'get'),getColor=b.ColorPanel.get;
  const capture=function(this:any,aspects:any,...rest:any[]) {const result=init.call(this,{...aspects,textures:[texture],bitmap:true,selection:true},...rest);if(!firstSave){firstSave=this.current_save;firstSelection=this.current_selection_save;}return result;};
  const event=(p:any)=>new PointerEvent('pointermove',{shiftKey:args.constrain,pointerType:args.pointer_type,pressure:p.pressure,tiltX:p.tilt_x,tiltY:p.tilt_y,button:args.color_target==='secondary'?2:0,buttons:args.color_target==='secondary'?2:1});
  const floor=b.Condition(b.Toolbox.selected.brush?.floor_coordinates??true);
  const points=args.points.map((p:any)=>({...p,x:floor?Math.floor(p.x):p.x,y:floor?Math.floor(p.y):p.y}));
  try {
    undo.initEdit=capture;painter.current={};painter.currentPixel=[-1,-1];painter.brushChanges=false;
    Object.defineProperty(secondaryKey,'isTriggered',{configurable:true,value:()=>args.color_target==='secondary'});
    if(args.tool_id==='fill_tool')Object.defineProperty(b.ColorPanel,'get',{configurable:true,writable:true,value:()=>getColor.call(b.ColorPanel,args.color_target==='secondary')});
    if(source) {
      await waitForImage(source.img);
      const sourceEvent=event(points[0]);
      Object.defineProperty(sourceEvent,'ctrlOrCmd',{value:true});
      painter.startPaintTool(source,args.copy_source.x,args.copy_source.y,undefined,sourceEvent);
      painter.stopPaintTool();
      if(b.UVEditor.vue.copy_brush_source?.texture!==source.uuid)throw new Fault('BRUSH_COPY_SOURCE_REJECTED','Native copy brush rejected source sampling');
    }
    painter.startPaintTool(texture,points[0].x,points[0].y,surface?.uv,event(points[0]),surface);
    if(painter.paint_stroke_canceled)throw new Fault('BRUSH_STROKE_CANCELED','Native brush rejected the stroke; check stylus preferences');
    for(let i=1;i<points.length;i++) {
      const p=points[i],next=surfaces[i];let newFace=!args.connect;
      if(next) {
        const changed=painter.current.face!==next.face;
        const connected=changed&&next.element.faces[next.face] instanceof b.MeshFace&&painter.getMeshUVIsland(next.face,next.element.faces[next.face]).includes(painter.current.face);
        if(painter.current.element!==next.element||(changed&&!connected)) {
          painter.current.x=p.x;painter.current.y=p.y;newFace=true;
        } else if(changed&&(p.x-painter.current.x)**2+(p.y-painter.current.y)**2>36)newFace=true;
        painter.current.face=next.face;painter.current.element=next.element;
      }
      painter.movePaintTool(texture,p.x,p.y,event(p),newFace,clip?undefined:next?.uv);
    }
    clip?.();
    painter.stopPaintTool();
    if(undo.current_save||!firstSave||undo.history.slice(0,undo.index).filter((entry:any)=>!history.includes(entry)).length!==1)throw new Fault('BRUSH_STROKE_INCOMPLETE','Native stroke did not finish with one Undo entry');
    const shapeTool=args.tool_id==='draw_shape_tool',gradientTool=args.tool_id==='gradient_tool';
    const surfaceLimits=clip?{region:'face_pixel_centers',pixel_selection:'applied',mesh_polygon_mask:surface!.element instanceof b.Mesh}:surface&&(shapeTool||gradientTool)?{
      region:shapeTool&&String(b.BarItems.draw_shape_type.get()).startsWith('rectangle')?'unrestricted':'uv_bounds',
      pixel_selection:shapeTool&&String(b.BarItems.draw_shape_type.get()).startsWith('ellipse')?'applied':'ignored',
      mesh_polygon_mask:false
    }:undefined;
    return {...(surfaceLimits?{surface_limits:surfaceLimits}:{}),texture_id:texture.uuid,layer_id:args.layer_id,tool_id:args.tool_id,points:points.length,connect:args.connect,undo_entries:1,...(source?{copy_source:{...args.copy_source,width:source.width,height:source.height},copy_mode:b.BarItems.copy_brush_mode.value}: {})};
  } catch(error) {
    try {
      if(firstSave) {
        // An interrupted updateChangesAfterEdit can leave this flag pending.
        // Undo loads a different image, which must redraw the canvas on load.
        delete texture.img.update_from_canvas;
        undo.loadSave(firstSave,new firstSave.constructor(firstSave.aspects));firstSelection?.load();
        delete undo.current_save;delete undo.current_selection_save;
        undo.history.splice(0,undo.history.length,...history);undo.index=index;
        await waitForImage(texture.img);b.Project.saved=saved;texture.saved=textureSaved;b.Canvas.updateAll();
      }
    } catch(rollback){throw new Fault('BRUSH_ROLLBACK_FAILED','Brush stroke failed and restoration was incomplete',{original:String(error),rollback:String(rollback)});}
    throw error;
  } finally {
    if(args.tool_id==='fill_tool'){if(colorDescriptor)Object.defineProperty(b.ColorPanel,'get',colorDescriptor);else delete b.ColorPanel.get;}
    if(secondaryDescriptor)Object.defineProperty(secondaryKey,'isTriggered',secondaryDescriptor);else delete secondaryKey.isTriggered;
    if(undo.initEdit===capture)undo.initEdit=init;
    b.PointerTarget.endTarget(b.PointerTarget.types.paint);
    painter.startPixel=prior.startPixel;painter.current=prior.current;painter.currentPixel=prior.currentPixel;painter.brushChanges=prior.brushChanges;
    if(prior.editing_area===undefined)delete painter.editing_area;else painter.editing_area=prior.editing_area;
    if(prior.canceled===undefined)delete painter.paint_stroke_canceled;else painter.paint_stroke_canceled=prior.canceled;
  }
}
