import {waitForImage} from './image-loading.ts';
import {preserveAnimationUndoLengths} from './animation-undo-length.ts';
import {preserveBoneUndoFlags,withBoneSaveFlags} from './bone-flags.ts';
import {refreshCoreMaterial,preserveTextureGroupUndo,guardCoreMaterial} from './core-texture-groups.ts';
import {rasterShape} from '../shared/raster-shape.ts';
import {fillPixels} from '../shared/fill-pixels.ts';
import {paintMask} from '../shared/paint-mask.ts';
import {captureTextureComposites,restoreTextureComposites} from './texture-composite-undo.ts';
import {
  clone,
  Fault,
  stable,
  type ModelState,
  type NodeData,
  type TextureData,
  type LayerData,
  type KeyData,
  type Plan,
  type PixelEdit,
  type Result,
} from "../shared/types.ts";

// Blockbench 5.1.x publishes mixed JS/TS globals; keep the untyped boundary here.
export type BB = Record<string, any>;
const vec = (v: any, fallback = [0, 0, 0]): any =>
  clone(Array.isArray(v) ? v : fallback);
export class Adapter {
  revision = 0;
  active = true;
  constructor(public b: BB) {}
  project(id?: string) {
    const p = this.b.Project;
    if (!p)
      throw new Fault("NO_PROJECT", "Open or create a Blockbench project");
    if (id && p.uuid !== id)
      throw new Fault(
        "PROJECT_CHANGED",
        "The active project does not match project_id",
        { active_project: p.uuid },
      );
    return p;
  }
  assertIdle(allowedUndoSave?: any) {
    if (!this.active) throw new Fault("UNLOADED", "Plugin was unloaded");
    const b = this.b;
    if (
      (b.Undo?.current_save && b.Undo.current_save !== allowedUndoSave) ||
      b.Painter?.painting ||
      b.Transformer?.dragging ||
      b.Project?.locked
    )
      throw new Fault(
        "BUSY",
        "Blockbench is editing or locked. Retry after the current operation finishes.",
      );
  }
  capabilities() {
    const f = this.b.Format;
    const keys = [
      "java_cube_shading_properties",
      "java_face_properties",
      "cullfaces",
      "edit_mode",
      "meshes",
      "bone_rig",
      "armature_rig",
      "per_texture_wrap_mode",
      "animated_textures",
      "texture_mcmeta",
      "animation_mode",
      "optional_box_uv",
      "box_uv",
      "single_texture",
      "per_texture_uv_size",
      "rotate_cubes",
      "rotation_limit",
      "rotation_snap",
      "uv_rotation",
    ];
    const c: any = Object.fromEntries(keys.map((k) => [k, !!f?.[k]]));
    if (f?.cube_size_limiter?.coordinate_limits) {
      const limits = f.cube_size_limiter.coordinate_limits;
      if (
        !Array.isArray(limits) ||
        limits.length !== 2 ||
        !limits.every(
          (v: unknown, i: number) =>
            typeof v === "number" &&
            (Number.isFinite(v) || v === (i === 0 ? -Infinity : Infinity)),
        ) ||
        limits[0] > limits[1]
      )
        throw new Fault(
          "FORMAT_LIMITS",
          "Format coordinate limits are invalid",
        );
      // Infinity has no JSON representation. Null explicitly means unbounded,
      // and must never be coerced to zero when validating planned geometry.
      c.cube_limits = limits.map((v: number) =>
        Number.isFinite(v) ? v : null,
      );
    }
    return c;
  }
  capture(includeImages = true): ModelState {
    const b = this.b,
      p = this.project();
    const nodes = [...(p.groups ?? []), ...(p.elements ?? [])].map(
      (n: any): NodeData => {
        const d: NodeData = {
          id: n.uuid,
          type: n.type ?? (n instanceof b.Group ? "group" : "unknown"),
          name: n.name ?? "",
          parent: n.parent?.uuid ?? null,
          origin: vec(n.origin),
          rotation: vec(n.rotation),
          visibility: n.visibility ?? true,
          scope: n.scope,
          animation_channels: Object.entries(
            n.constructor.animator?.prototype?.channels ?? {},
          )
            .filter(([, config]: any) => config.transform === true)
            .map(([id]) => id),
        };
        if(['group','cube','mesh','spline'].includes(n.type))Object.assign(d,{locked:n.locked,export:n.export});
        if(['cube','mesh','spline'].includes(n.type))d.render_order=n.render_order;
        if (n instanceof b.Cube)
          Object.assign(d, {
            from: vec(n.from),
            to: vec(n.to),
            inflate: n.inflate ?? 0,
            shade: n.shade ?? true,light_emission:n.light_emission??0,
            autouv: n.autouv,
            box_uv: !!n.box_uv,
            uv_offset: vec(n.uv_offset, [0, 0]),
            mirror_uv: !!n.mirror_uv,
          });
        if(['group','cube','mesh','armature','armature_bone','null_object','spline'].includes(n.type)) {
          d.native_copy=clone(n.getSaveCopy());
          delete d.native_copy!.uuid;delete d.native_copy!.children;
          // Selection state is transient UI data and is not persisted by .bbmodel.
          // Keep snapshots/save roundtrips deterministic across project reloads.
          delete d.native_copy!.primary_selected;
        }
        if (n instanceof b.Mesh) {
          d.vertices = clone(n.vertices);
          if (Object.keys(n.seams ?? {}).length) d.seams = clone(n.seams);
        }
        if (n.type === 'armature_bone') {
          d.vertex_weights = clone(n.vertex_weights ?? {});
          Object.assign(d,{length:n.length,width:n.width,connected:n.connected,color:n.color,locked:n.locked,export:n.export});
        }
        if (n.type === 'armature') Object.assign(d,{locked:n.locked,export:n.export});
        // Spline faces are regenerated paint helpers, not saved control geometry.
        if (n.faces && n.type!=='spline') {
          d.faces = {};
          for (const [key, face] of Object.entries(n.faces) as [
            string,
            any,
          ][]) {
            const resolved = face.getTexture?.();
            d.faces[key] = {
              uv: clone(face.uv ?? []),
              ...(n.type==='cube'?{enabled:face.enabled??true,material_name:face.material_name??'',cullface:face.cullface??'',tint:face.tint??-1}:{}),
              texture: face.texture,
              resolved_texture: resolved?.uuid,
              rotation: face.rotation,
              vertices: face.vertices ? clone(face.vertices) : undefined,
            };
          }
        }
        return d;
      },
    );
    const textures = (p.textures ?? []).map(
      (t: any): TextureData => ({
        id: t.uuid,
        name: t.name,
        width: t.width || t.canvas.width,
        height: t.height || t.canvas.height,
        uv_width: b.Format.per_texture_uv_size ? t.uv_width : p.texture_width,
        uv_height: b.Format.per_texture_uv_size
          ? t.uv_height
          : p.texture_height,
        png: includeImages ? t.canvas.toDataURL("image/png") : undefined,
        layers_enabled: !!t.layers_enabled,
        fps:t.fps,frame_time:t.frame_time,frame_order_type:t.frame_order_type,frame_order:t.frame_order,frame_interpolate:t.frame_interpolate,
        render_mode:t.render_mode,
        group:t.group,
        pbr_channel:t.pbr_channel,
        render_sides:t.render_sides,
        wrap_mode:t.wrap_mode,
        sync_to_project: t.sync_to_project || undefined,
        layers: (t.layers ?? []).map((l: any) => ({
          id: l.uuid,
          name: l.name,
          visible: l.visible,
          opacity: l.opacity,
          offset: vec(l.offset, [0, 0]),
          scale: vec(l.scale, [1, 1]),
          blend_mode: l.blend_mode,
          in_limbo: !!l.in_limbo,
          width: l.canvas.width,
          height: l.canvas.height,
          png: includeImages ? l.canvas.toDataURL("image/png") : undefined,
        })),
      }),
    );
    const animations = (p.animations ?? []).map((a: any) => ({
      id: a.uuid,
      name: a.name,
      length: a.length,
      loop: a.loop,
      snapping: a.snapping,
      override:!!a.override,blend_weight:a.blend_weight??'',start_delay:a.start_delay??'',loop_delay:a.loop_delay??'',
      markers:(a.markers??[]).map((m:any)=>m.getUndoCopy()),
      ...(a.anim_time_update ? { anim_time_update: a.anim_time_update } : {}),
      keys: Object.entries(a.animators ?? {}).flatMap(
        ([node, animator]: [string, any]) =>
          (animator.keyframes ?? []).map((k: any): KeyData => {
            const copy = k.getUndoCopy();
            return {
              id: k.uuid,
              node,
              channel: k.channel,
              time: k.time,
              interpolation: k.interpolation,
              color:copy.color,
              uniform:copy.uniform,
              bezier_linked:copy.bezier_linked,
              data_points: clone(copy.data_points ?? []),
              bezier_left_time: copy.bezier_left_time,
              bezier_right_time: copy.bezier_right_time,
              bezier_left_value: copy.bezier_left_value,
              bezier_right_value: copy.bezier_right_value,
              ...(typeof copy.easing === "string"
                ? { easing: copy.easing }
                : {}),
              ...(Array.isArray(copy.easingArgs)
                ? { easingArgs: clone(copy.easingArgs) }
                : {}),
            };
          }),
      ),
    }));
    const state: ModelState = {
      project_id: p.uuid,
      name: p.name,
      format: b.Format.id,
      revision: this.revision,
      project_uv: [p.texture_width, p.texture_height],
      capabilities: this.capabilities(),
      nodes,
      textures,
      texture_groups:(p.texture_groups??[]).map((g:any)=>({id:g.uuid,name:g.name,is_material:g.is_material,material_config:clone(g.material_config.getUndoCopy())})),
      animations,
    };
    if (includeImages && stable(state).length > 48000000)
      throw new Fault(
        "SIZE_LIMIT",
        "Model snapshot exceeds 48 MB; reduce embedded textures before editing",
      );
    return state;
  }
  fingerprint(s = this.capture()) {
    const copy = { ...s, revision: 0 };
    return stable(copy);
  }
  uiState() {
    const b = this.b;
    return {
      project: b.Project?.uuid,
      elements: (b.Outliner?.selected ?? []).map((n: any) => n.uuid),
      groups: (b.Group?.selected ?? []).map((n: any) => n.uuid),
      texture: b.Texture?.selected?.uuid,
      animation: b.Animation?.selected?.uuid,
      controller: b.AnimationController?.selected?.uuid,
      controllersPlaying: (b.AnimationController?.all ?? [])
        .filter((c: any) => c.playing)
        .map((c: any) => c.uuid),
      time: b.Timeline?.time ?? 0,
      mode: b.Modes?.selected?.id,
      timelinePlaying: !!b.Timeline?.playing,
      playing: (b.Animation?.all ?? [])
        .filter((a: any) => a.playing)
        .map((a: any) => a.uuid),
    };
  }
  restoreUI(s: ReturnType<Adapter["uiState"]>) {
    const b = this.b;
    if (b.Project?.uuid !== s.project) return;
    const selectedAnimation = b.Animation.all.find(
      (a: any) => a.uuid === s.animation,
    );
    if (selectedAnimation) selectedAnimation.select();
    else {
      for (const a of b.Animation.all) a.selected = false;
      b.Animation.selected = null;
    }
    if (s.mode && b.Modes.options[s.mode]) b.Modes.options[s.mode].select();
    const controller = b.AnimationController?.all.find(
      (c: any) => c.uuid === s.controller,
    );
    if (controller) controller.select();
    for (const n of [...(b.Outliner?.elements ?? []), ...(b.Group?.all ?? [])])
      n.selected = false;
    b.Project.selected_elements.splice(
      0,
      b.Project.selected_elements.length,
      ...b.Outliner.elements.filter((n: any) => s.elements.includes(n.uuid)),
    );
    b.Project.selected_groups.splice(
      0,
      b.Project.selected_groups.length,
      ...b.Group.all.filter((n: any) => s.groups.includes(n.uuid)),
    );
    for (const n of [
      ...b.Project.selected_elements,
      ...b.Project.selected_groups,
    ])
      n.selected = true;
    const t = b.Texture.all.find((t: any) => t.uuid === s.texture);
    if (t) t.select();
    b.Timeline?.setTime(s.time);
    for (const a of b.Animation.all) a.playing = s.playing.includes(a.uuid);
    for (const c of b.AnimationController?.all ?? [])
      c.playing = s.controllersPlaying.includes(c.uuid);
    b.updateSelection?.();
    if (b.Animator?.open) b.Animator.preview();
  }
  aspects() {
    const b = this.b;
    return {
      elements: [...b.Outliner.elements],
      groups: [...b.Group.all],
      outliner: true,
      textures: [...b.Texture.all],
      texture_groups:[...(b.TextureGroup?.all??[])],
      bitmap: true,
      texture_order: true,
      selected_texture: true,
      animations: [...b.Animation.all],
      selection: true,
      uv_mode: true,
    };
  }
  async prepareTextures(plan: Plan) {
    const prepared = new Map<string, Map<string, HTMLCanvasElement>>();
    for (const c of plan.changes.filter(
      (c) => c.kind === "texture" && c.action !== "delete",
    )) {
      const t = plan.state.textures.find((t) => t.id === c.id)!;
      const images = new Map<string, HTMLCanvasElement>();
      images.set(
        t.id,
        await this.renderRaster(t),
      );
      for (const l of t.layers)
        images.set(
          l.id,
          await this.renderRaster(l),
        );
      prepared.set(t.id, images);
    }
    return prepared;
  }
  async renderRaster(data: TextureData | LayerData): Promise<HTMLCanvasElement> {
    let base: HTMLCanvasElement | undefined;
    if(data.frame_source) {
      const source=data.frame_source,image=await this.renderRaster(source.image);
      const images=new Map<string,HTMLCanvasElement>();
      for(const [id,input] of Object.entries(source.sources??{}))images.set(id,await this.renderRaster(input.image));
      base=document.createElement('canvas');base.width=data.width;base.height=data.height;
      const ctx=base.getContext('2d')!;
      const frame=document.createElement('canvas');frame.width=source.image.width;frame.height=source.frame_height;
      const cut=document.createElement('canvas');cut.width=data.width;cut.height=source.resize?.height??source.frame_height;
      const frameCtx=frame.getContext('2d')!,cutCtx=cut.getContext('2d')!;
      source.indices.forEach((entry,index)=>{if(entry!==null){
        const imported=typeof entry==='object'?source.sources![entry.texture]:null;
        const number=typeof entry==='object'?entry.index:entry,input=typeof entry==='object'?images.get(entry.texture)!:image;
        frame.width=imported?.image.width??source.image.width;frame.height=imported?.frame_height??source.frame_height;
        frameCtx.drawImage(input,0,number*frame.height,frame.width,frame.height,0,0,frame.width,frame.height);
        if(source.opacity) {
          const {mode,value,include_transparent,rect:[x,y,w,h]}=source.opacity;
          const pixels=frameCtx.getImageData(x,y,w,h),p=pixels.data;
          for(let i=0;i<p.length;i+=4) {
            const a=p[i+3]/255;
            if(mode==='set'){if(include_transparent||p[i]||p[i+1]||p[i+2]||p[i+3])p[i+3]=value;}
            else p[i+3]=Math.round(255*(mode==='source_over'&&value>1?a+a*(value-1)*(1-a):Math.min(1,a*value)));
          }
          frameCtx.putImageData(pixels,x,y);
        }
        if(source.curves) {
          const {curves,rect:[x,y,w,h]}=source.curves;
          const tables:Record<string,number[]>={};
          for(const [key,points] of Object.entries(curves)) {
            if(points.length===2&&points[0][0]===0&&points[0][1]===0&&points[1][0]===1&&points[1][1]===1)continue;
            const curve=new this.b.THREE.SplineCurve(points.map(p=>new this.b.THREE.Vector2(...p)));
            tables[key]=Array.from({length:256},(_,i)=>curve.getPointAt(i/255).y*255);
          }
          const pixels=frameCtx.getImageData(x,y,w,h),p=pixels.data;
          for(let i=0;i<p.length;i+=4){
            const lum=Math.round(.2126*p[i]+.7152*p[i+1]+.0722*p[i+2]),div=Math.max(lum,1),rgb=tables.rgb?.[lum]??lum;
            for(let channel=0;channel<3;channel++)p[i+channel]=(p[i+channel]+1)*((tables[['r','g','b'][channel]]?.[lum]??div)/div)*(rgb/div)-1;
            if(tables.a)p[i+3]=tables.a[p[i+3]];
          }
          frameCtx.putImageData(pixels,x,y);
        }
        if(source.saturation_hue) {
          const {saturation,hue,brightness,rect:[x,y,w,h]}=source.saturation_hue;
          const filtered=document.createElement('canvas');filtered.width=w;filtered.height=h;
          const ctx=filtered.getContext('2d')!;
          ctx.filter=`saturate(${saturation}) hue-rotate(${hue}deg) brightness(${brightness})`;
          ctx.drawImage(frame,x,y,w,h,0,0,w,h);
          frameCtx.putImageData(ctx.getImageData(0,0,w,h),x,y);
        }
        if(source.brightness_contrast) {
          const {brightness,contrast,rect:[x,y,w,h]}=source.brightness_contrast;
          const pixels=frameCtx.getImageData(x,y,w,h),p=pixels.data;
          for(let i=0;i<p.length;i+=4)for(let channel=0;channel<3;channel++) {
            const bright=Math.min(255,p[i+channel]*brightness);
            p[i+channel]=Math.round(Math.max(0,Math.min(255,(bright-127.5)*contrast+127.5)));
          }
          frameCtx.putImageData(pixels,x,y);
        }
        if(source.invert) {
          const {channels,amount,rect:[x,y,w,h]}=source.invert;
          const indices=channels.map(channel=>['red','green','blue','alpha'].indexOf(channel));
          const pixels=frameCtx.getImageData(x,y,w,h),p=pixels.data;
          for(let i=0;i<p.length;i+=4)for(const channel of indices)p[i+channel]=Math.round(p[i+channel]+(255-2*p[i+channel])*amount);
          frameCtx.putImageData(pixels,x,y);
        }
        if(source.palette) {
          const {colors,alpha_min,rect:[x,y,w,h]}=source.palette;
          const palette=colors.map(hex=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)));
          const pixels=frameCtx.getImageData(x,y,w,h),p=pixels.data;
          for(let i=0;i<p.length;i+=4)if(p[i+3]>=alpha_min) {
            let best:number[]|undefined,distance=Infinity;
            for(const rgb of palette){const d=(rgb[0]-p[i])**2+(rgb[1]-p[i+1])**2+(rgb[2]-p[i+2])**2;if(d<distance){distance=d;best=rgb;}}
            if(best){p[i]=best[0];p[i+1]=best[1];p[i+2]=best[2];}
          }
          frameCtx.putImageData(pixels,x,y);
        }
        if(source.channel) {
          const pixels=frameCtx.getImageData(0,0,frame.width,frame.height);
          for(let i=0;i<pixels.data.length;i+=4) {
            const p=pixels.data;
            if(source.channel==='alpha')p[i]=p[i+1]=p[i+2]=p[i+3];
            else if(source.channel!=='color') {
              if(source.channel!=='red')p[i]=0;
              if(source.channel!=='green')p[i+1]=0;
              if(source.channel!=='blue')p[i+2]=0;
            }
            p[i+3]=255;
          }
          frameCtx.putImageData(pixels,0,0);
        }
        cutCtx.clearRect(0,0,cut.width,cut.height);cutCtx.imageSmoothingEnabled=false;
        const offset=source.resize?.offset??[0,0];
        if(source.transform) {
          cutCtx.save();
          switch(source.transform) {
            case 'flip_x':cutCtx.translate(frame.width,0);cutCtx.scale(-1,1);break;
            case 'flip_y':cutCtx.translate(0,frame.height);cutCtx.scale(1,-1);break;
            case 'rotate_cw':cutCtx.translate(frame.height,0);cutCtx.rotate(Math.PI/2);break;
            case 'rotate_ccw':cutCtx.translate(0,frame.width);cutCtx.rotate(-Math.PI/2);break;
            case 'rotate_180':cutCtx.translate(frame.width,frame.height);cutCtx.rotate(Math.PI);break;
          }
          cutCtx.drawImage(frame,0,0);cutCtx.restore();
        } else if(source.resize?.mode==='scale')cutCtx.drawImage(frame,...offset,cut.width,cut.height);
        else if(source.resize?.fill==='repeat') {
          for(let x=0;x<cut.width;x+=frame.width)for(let y=0;y<cut.height;y+=frame.height)cutCtx.drawImage(frame,x,y);
        } else {
          if(source.resize?.fill==='color') {
            cutCtx.fillStyle=source.resize.color!;cutCtx.fillRect(0,0,cut.width,cut.height);
            cutCtx.clearRect(offset[0],offset[1],frame.width,frame.height);
          }
          cutCtx.drawImage(frame,...offset);
        }
        ctx.drawImage(cut,0,index*cut.height);
      }});
    }
    if (data.merge_source) {
      const source = data.merge_source;
      const texture: any = {width:source.texture_size[0],height:source.texture_size[1],layers:[]};
      for (const layer of [source.lower,source.upper]) {
        const canvas = await this.renderRaster(layer);
        const detached = Object.create(this.b.TextureLayer.prototype);
        Object.assign(detached, {uuid:layer.id,name:layer.name,offset:clone(layer.offset),scale:clone(layer.scale??[1,1]),
          opacity:layer.opacity,visible:layer.visible,blend_mode:layer.blend_mode??'default',texture,canvas,ctx:canvas.getContext('2d')});
        texture.layers.push(detached);
      }
      texture.layers[1].mergeDown(false);
      base = texture.layers[0].canvas;
      if (base!.width !== data.width || base!.height !== data.height || stable(texture.layers[0].offset) !== stable((data as LayerData).offset))
        throw new Fault('LAYER_MERGE_MISMATCH','Native layer expansion differs from planned bounds');
    }
    if (data.baked_layers) {
      base = document.createElement('canvas');
      const layers = [];
      for (const layer of data.baked_layers) {
        const canvas = await this.renderRaster(layer);
        layers.push({...layer, canvas, ctx: canvas.getContext('2d'),
          scaled_width: layer.width * (layer.scale?.[0] ?? 1),
          scaled_height: layer.height * (layer.scale?.[1] ?? 1)});
      }
      // Invoke the pinned native compositor on detached canvases, without a
      // Texture constructor, registration, material update or nested Undo.
      this.b.Texture.prototype.updateLayerChanges.call({
        layers_enabled: true, width: data.width, height: data.height,
        canvas: base, ctx: base.getContext('2d'), layers, getMaterial: () => null,
      }, false);
    }
    return renderPixels(data.width, data.height, data.png, data.color, data.edits, base);
  }
  async apply(plan: Plan, label: string, expected: string) {
    this.project(plan.state.project_id);
    this.assertIdle();
    const prepared = await this.prepareTextures(plan);
    this.project(plan.state.project_id);
    this.assertIdle();
    if (this.fingerprint() !== expected)
      throw new Fault(
        "STALE_PLAN",
        "Model changed while preparing textures. Create a new plan.",
      );
    const b = this.b,
      ui = this.uiState(),
      aspects = this.aspects();
    const previousSaved = b.Project.saved;
    const textureSaved = new Map<string, boolean>(
      b.Texture.all.map((t: any) => [t.uuid, t.saved]),
    );
    const compositeIds=new Set(plan.changes.filter(c=>c.kind==='texture').map(c=>c.id));
    const compositeBefore=captureTextureComposites(b,compositeIds);
    const previousSelectionSave=b.Undo.current_selection_save;
    b.Undo.initEdit(aspects);
    const ownedSelectionSave=b.Undo.current_selection_save;
    b.Undo.current_save.__pbmc_texture_composites=compositeBefore;
    preserveAnimationUndoLengths(b,b.Undo.current_save);
    preserveBoneUndoFlags(b,b.Undo.current_save);
    preserveTextureGroupUndo(b,b.Undo.current_save);
    try {
      if(plan.state.project_uv){b.Project.texture_width=plan.state.project_uv[0];b.Project.texture_height=plan.state.project_uv[1];}
      for(const c of plan.changes.filter(c=>c.kind==='texture_group'&&c.action!=='delete')) {
        const d=plan.state.texture_groups!.find(g=>g.id===c.id)!;
        let group=b.TextureGroup.all.find((g:any)=>g.uuid===c.id);
        if(!group)group=new b.TextureGroup({},c.id).add();
        group.extend(d);
      }
      for(const group of b.TextureGroup.all)guardCoreMaterial(group);
      // Create all nodes before linking parents, preserving unknown existing types.
      const byId = () =>
        new Map<string, any>(
          [...b.Group.all, ...b.Outliner.elements].map((n: any) => [n.uuid, n]),
        );
      let lookup = byId();
      for (const c of plan.changes.filter(
        (c) => c.kind === "node" && c.action === "add",
      )) {
        const d = plan.state.nodes.find((n) => n.id === c.id)!;
        const C =
          d.type === "group" ? b.Group : d.type === "cube" ? b.Cube : d.type==='armature' ? b.Armature : d.type==='armature_bone' ? b.ArmatureBone : d.type==='spline' ? b.SplineMesh : b.Mesh;
        const n = new C({ ...clone(d.native_copy??{}),name: d.name }, d.id);
        if(d.type==='armature'||d.type==='armature_bone') n.addTo(d.parent?lookup.get(d.parent):'root');
        n.init();
        lookup.set(d.id, n);
      }
      for (const c of plan.changes.filter(
        (c) => c.kind === "node" && c.action !== "delete",
      )) {
        const d = plan.state.nodes.find((n) => n.id === c.id)!,
          n = lookup.get(c.id);
        const props: any = {
          name: d.name,
          origin: d.origin,
          rotation: d.rotation,
          visibility: d.visibility,
        };
        if (d.type === "cube")
          Object.assign(props, {
            from: d.from,
            to: d.to,
            inflate: d.inflate,
            shade:d.shade,light_emission:d.light_emission,
            autouv: d.autouv,
            box_uv: d.box_uv,
            uv_offset: d.uv_offset,
            mirror_uv: d.mirror_uv,
          });
        if (d.type === "mesh") props.vertices = d.vertices;
        if (d.type === 'armature_bone') Object.assign(props,{length:d.length,width:d.width,connected:d.connected,color:d.color,locked:d.locked,export:d.export,vertex_weights:clone(d.vertex_weights??{})});
        if (d.type === 'armature') Object.assign(props,{locked:d.locked,export:d.export});
        for(const key of ['locked','export'] as const)if(d[key]!==undefined)props[key]=d[key];
        if(d.render_order!==undefined)props.render_order=d.render_order;
        if(d.type==='spline')for(const key of ['radial_resolution','tubular_resolution','radius_multiplier','render_mode','uv_mode','shading','display_space','cyclic'])if(d.native_copy?.[key]!==undefined)props[key]=d.native_copy[key];
        if(d.type==='spline'){props.vertices=clone(d.native_copy?.vertices??{});props.texture=d.native_copy?.texture;}
        n.extend(props);
        if(d.type==='spline'){
          for(const [id,handle] of Object.entries(d.native_copy?.handles??{}) as [string,any][])n.handles[id]?.extend({size:handle.size,tilt:handle.tilt});
          n.refreshTubeFaces();
        }
        if(d.render_order!==undefined)n.preview_controller.updateRenderOrder(n);
        if (d.faces) {
          if (d.type === "mesh") {
            const nativeFaces=n.faces;
            n.faces = {};
            for (const [key, f] of Object.entries(d.faces))
              n.faces[key] = new b.MeshFace(n, {...clone(nativeFaces[key]?.getSaveCopy?.()??{}),...clone(f)});
          } else
            for (const [key, f] of Object.entries(d.faces))
              n.faces[key]?.extend(clone(f));
        }
        if ((n.parent?.uuid ?? null) !== d.parent)
          n.addTo(d.parent ? lookup.get(d.parent) : "root");
      }
      for (const c of plan.changes.filter(
        (c) => c.kind === "texture" && c.action !== "delete",
      )) {
        const d = plan.state.textures.find((t) => t.id === c.id)!;
        let t = b.Texture.all.find((t: any) => t.uuid === d.id);
        if (!t) t = new b.Texture({ name: d.name }, d.id).add(false);
        const playbackMetadataChanged=b.Format.texture_mcmeta&&(['frame_time','frame_order_type','frame_order','frame_interpolate'] as const).some(key=>d[key]!==undefined&&d[key]!==t[key]);
        t.name = d.name;
        for(const key of ['fps','frame_time','frame_order_type','frame_order','frame_interpolate'] as const)if(d[key]!==undefined)t[key]=d[key];
        if(d.group!==undefined)t.group=d.group;
        if(d.pbr_channel!==undefined)t.pbr_channel=d.pbr_channel;
        if(d.render_mode!==undefined) t.render_mode=d.render_mode;
        if(d.render_sides!==undefined) t.render_sides=d.render_sides;
        if(d.wrap_mode!==undefined) t.wrap_mode=d.wrap_mode;
        t.uv_width = d.uv_width;
        t.uv_height = d.uv_height;
        t.internal = true;
        t.source_overwritten = true;
        const imgs = prepared.get(d.id)!;
        copyCanvas(imgs.get(d.id)!, t.canvas);
        t.width = d.width;
        t.height = d.height;
        t.layers_enabled = d.layers_enabled;
        if (d.layers_enabled) {
          const existing = new Map(t.layers.map((l: any) => [l.uuid, l]));
          t.layers = d.layers.map((l) => {
            const target: any =
              existing.get(l.id) ?? new b.TextureLayer({}, t, l.id);
            target.name = l.name;
            target.visible = l.visible;
            target.opacity = l.opacity;
            target.offset = clone(l.offset);
            target.scale = clone(l.scale ?? [1, 1]);
            target.blend_mode = l.blend_mode ?? 'default';
            target.in_limbo = l.in_limbo ?? false;
            copyCanvas(imgs.get(l.id)!, target.canvas);
            return target;
          });
          if (!t.layers.includes(t.selected_layer))
            t.selected_layer = t.layers[0];
        } else t.layers = [];
        t.updateChangesAfterEdit();
        t.updateMaterial();
        if(playbackMetadataChanged)b.TextureAnimator.updateSpeed();
      }
      // Apply animation changes using explicit low-level key updates, avoiding nested Undo and selection-dependent time snapping.
      for (const c of plan.changes.filter(
        (c) => c.kind === "animation" && c.action !== "delete",
      )) {
        const d = plan.state.animations.find((a) => a.id === c.id)!;
        let a = b.Animation.all.find((a: any) => a.uuid === d.id);
        if (!a) {
          a = new b.Animation({ name: d.name });
          a.uuid = d.id;
          a.add(false);
        }
        a.name = d.name;
        a.length = d.length;
        a.loop = d.loop;
        a.snapping = d.snapping;
        if (d.anim_time_update !== undefined)
          a.anim_time_update = d.anim_time_update;
        for(const field of ['override','blend_weight','start_delay','loop_delay'] as const)
          if(d[field]!==undefined) a[field]=d[field];
        if(d.markers!==undefined) a.markers.splice(0,a.markers.length,...d.markers.map(m=>new b.Blockbench.TimelineMarker(m)));
        a.saved = false;
        const desired = new Map(d.keys.map((k) => [k.id, k]));
        for (const animator of Object.values(a.animators) as any[])
          for (const k of [...animator.keyframes])
            if (!desired.has(k.uuid))
              animator[k.channel].splice(animator[k.channel].indexOf(k), 1);
        for (const k of d.keys) {
          const n = lookup.get(k.node);
          if (!n && k.node!=='effects') continue;
          let animator = a.animators[k.node];
          if (!animator) animator = k.node==='effects'?(a.animators.effects=new b.Blockbench.EffectAnimator(a)):a.getBoneAnimator(n);
          if (!animator?.channels?.[k.channel])
            throw new Fault(
              "UNSUPPORTED_ANIMATOR",
              `Node does not support channel ${k.channel}`,
              { node: k.node },
            );
          const old = animator.keyframes.find((x: any) => x.uuid === k.id);
          const data = { ...clone(k), uuid: k.id };
          if (old) old.extend(data);
          else animator.addKeyframe(data, k.id);
        }
      }
      for (const c of plan.changes.filter(
        (c) => c.kind === "animation" && c.action === "delete",
      ))
        b.Animation.all.find((a: any) => a.uuid === c.id)?.remove(false, false);
      for (const c of plan.changes.filter(
        (c) => c.kind === "node" && c.action === "delete",
      ))
        lookup.get(c.id)?.remove(false);
      for (const c of plan.changes.filter(
        (c) => c.kind === "texture" && c.action === "delete",
      ))
        b.Texture.all.find((t: any) => t.uuid === c.id)?.remove(true);
      b.Canvas.updateAll();
      this.restoreUI(ui);
      for(const c of plan.changes.filter(c=>c.kind==='texture_group'&&c.action==='delete'))
        b.TextureGroup.all.find((g:any)=>g.uuid===c.id)?.remove();
      for(const group of b.TextureGroup.all)refreshCoreMaterial(group);
      b.Canvas.updateAll();
      b.Undo.finishEdit(label, this.aspects());
      const compositeEntry=b.Undo.history[b.Undo.index-1];
      if(compositeEntry?.post)compositeEntry.post.__pbmc_texture_composites=captureTextureComposites(b,compositeIds);
      preserveAnimationUndoLengths(b,b.Undo.history[b.Undo.index-1]?.post);
      preserveBoneUndoFlags(b,b.Undo.history[b.Undo.index-1]?.post);
      preserveTextureGroupUndo(b,b.Undo.history[b.Undo.index-1]?.post);
      this.revision++;
    } catch (error) {
      try {
        Object.assign(aspects, this.aspects());
        const textureIds=new Set(plan.changes.filter(c=>c.kind==='texture').map(c=>c.id));
        for(const t of b.Texture.all)if(textureIds.has(t.uuid))delete t.img.update_from_canvas;
        b.Undo.cancelEdit(true);
        for(const n of b.Outliner.elements)if(["cube","mesh","spline"].includes(n.type))n.preview_controller.updateRenderOrder(n);
        await Promise.all(b.Texture.all.filter((t:any)=>textureIds.has(t.uuid)&&textureSaved.has(t.uuid)).map((t:any)=>waitForImage(t.img)));
          this.restoreUI(ui);
          b.Canvas.updateAll();
          await restoreTextureComposites(b,compositeBefore);
          b.Project.saved = previousSaved;
        for (const t of b.Texture.all)
          if (textureSaved.has(t.uuid)) t.saved = textureSaved.get(t.uuid);
      } catch (rollback) {
        throw new Fault(
          "ROLLBACK_FAILED",
          "Edit failed and full rollback could not be confirmed",
          { error: String(error), rollback: String(rollback) },
        );
      }
      throw error;
    } finally {
      // Native finishEdit retains its selection snapshot. Do not let that
      // completed edit swallow the next independent selection operation.
      if(b.Undo.current_selection_save===ownedSelectionSave||b.Undo.current_selection_save===undefined){
        if(previousSelectionSave===undefined)delete b.Undo.current_selection_save;
        else b.Undo.current_selection_save=previousSelectionSave;
      }
    }
    return {
      project_id: b.Project.uuid,
      revision: this.revision,
      changes: plan.changes,
      created: plan.created,
      warnings: plan.warnings,
    };
  }
  compile(codecId: string, options: Record<string, unknown> = {}) {
    this.project();
    const b = this.b,
      c = b.Codecs[codecId];
    if (!c?.compile)
      throw new Fault("UNKNOWN_CODEC", `Codec ${codecId} cannot compile`);
    // 5.1.6's image codec loops over frameCount without a single-frame
    // fallback; static textures return undefined and otherwise yield only ';'.
    const texture = codecId === "image" ? b.Texture.getDefault() : undefined;
    if (
      b.Blockbench.version === "5.1.6" &&
      codecId === "image" &&
      (options.format ?? c.getExportOptions().format) === "gif" &&
      texture &&
      texture.frameCount === undefined
    ) {
      const previous = Object.getOwnPropertyDescriptor(texture, "frameCount");
      if (previous?.configurable === false)
        throw new Fault(
          "GIF_FRAME_COUNT",
          "Texture frame count cannot be normalized",
        );
      const get = () => 1;
      Object.defineProperty(texture, "frameCount", { get, configurable: true });
      return Promise.resolve()
        .then(() => c.compile(options))
        .finally(() => {
          if (
            Object.getOwnPropertyDescriptor(texture, "frameCount")?.get === get
          ) {
            if (previous)
              Object.defineProperty(texture, "frameCount", previous);
            else delete texture.frameCount;
          }
        });
    }
    const data = codecId==='project' ? withBoneSaveFlags(b,()=>c.compile(options)) : c.compile(options);
    return data;
  }
  async captureViews(
    views: string[],
    size = 512,
    animation?: string,
    times?: number[],
  ): Promise<Result> {
    const b = this.b;
    this.project();
    this.assertIdle();
    const project = b.Project,
      ui = this.uiState(),
      p = b.Preview.selected;
    if (!p) throw new Fault("NO_PREVIEW", "No preview viewport");
    const camera = {
      isOrtho: p.isOrtho,
      pers: p.camPers.position.clone(),
      ortho: p.camOrtho.position.clone(),
      upPers: p.camPers.up.clone(),
      upOrtho: p.camOrtho.up.clone(),
      target: p.controls.target.clone(),
      zoom: p.camOrtho.zoom,
      angle: p.angle,
      locked: p.locked_angle,
    };
    const images: NonNullable<Result["images"]> = [];
    const frames = times ?? [ui.time];
    const animatorIds = new Map<any, Set<string>>(
      b.Animation.all.map((a: any) => [a, new Set(Object.keys(a.animators))]),
    );
    try {
      b.Timeline.pause();
      if (animation) {
        const a = b.Animation.all.find((a: any) => a.uuid === animation);
        if (!a) throw new Fault("NOT_FOUND", "Animation not found");
        b.Modes.options.animate.select();
        for (const a of b.Animation.all) a.playing = false;
        a.select();
        a.playing = true;
      }
      // Keep one framing for the whole sequence so movement is visible.
      b.Canvas.updateAll();
      const union = new b.THREE.Box3();
      for (const time of frames) {
        if (animation) {
          b.Timeline.setTime(time);
          b.Animator.preview();
        }
        union.union(new b.THREE.Box3().setFromObject(project.model_3d));
      }
      const center = union.isEmpty()
        ? new b.THREE.Vector3(0, 8, 0)
        : union.getCenter(new b.THREE.Vector3());
      const dim = union.isEmpty()
        ? 16
        : Math.max(...union.getSize(new b.THREE.Vector3()).toArray(), 1);
      const distance = dim * 3;
      for (const time of frames) {
        if (b.Project !== project)
          throw new Fault("PROJECT_CHANGED", "Project switched during capture");
        b.Canvas.updateAll();
        if (animation) {
          b.Timeline.setTime(time);
          b.Animator.preview();
        }
        for (const view of views) {
          this.assertIdle();
          this.project(project.uuid);
          const dirs: Record<string, number[]> = {
            front: [0, 0, -1],
            back: [0, 0, 1],
            left: [-1, 0, 0],
            right: [1, 0, 0],
            top: [0, 1, 0.001],
            bottom: [0, -1, 0.001],
            isometric: [1, 1, -1],
          };
          const dir = dirs[view];
          if (!dir) throw new Fault("VIEW", "Unknown camera view");
          p.setProjectionMode(true);
          p.controls.target.copy(center);
          p.camOrtho.position
            .copy(center)
            .add(
              new b.THREE.Vector3(...dir).normalize().multiplyScalar(distance),
            );
          p.camOrtho.up.set(0, 1, 0);
          p.camOrtho.zoom = Math.min(p.width, p.height) / 40 / (dim * 1.5);
          p.camOrtho.updateProjectionMatrix();
          p.controls.update();
          p.camOrtho.lookAt(center);
          p.render();
          const url = await new Promise<string>((resolve, reject) => {
            const timeout = setTimeout(
              () =>
                reject(
                  new Fault("CAPTURE_TIMEOUT", "Screenshot callback timed out"),
                ),
              5000,
            );
            b.Screencam.screenshotPreview(
              p,
              { width: size, height: size, crop: false },
              (url: string) => {
                clearTimeout(timeout);
                resolve(url);
              },
            );
          });
          images.push({
            label: animation ? `${view} @ ${time}s` : view,
            data: url.split(",")[1],
            mimeType: "image/png",
          });
        }
      }
    } finally {
      if (b.Project === project) {
        this.restoreUI(ui);
        // Selecting animations can lazily create empty animators. Remove only
        // those created by this read-only capture operation.
        for (const [a, ids] of animatorIds)
          for (const [id, animator] of Object.entries(a.animators) as [
            string,
            any,
          ][]) {
            if (!ids.has(id) && animator.keyframes.length === 0)
              a.removeAnimator(id);
          }
        p.setProjectionMode(camera.isOrtho);
        p.camPers.position.copy(camera.pers);
        p.camOrtho.position.copy(camera.ortho);
        p.camPers.up.copy(camera.upPers);
        p.camOrtho.up.copy(camera.upOrtho);
        p.controls.target.copy(camera.target);
        p.camOrtho.zoom = camera.zoom;
        p.camOrtho.updateProjectionMatrix();
        p.setLockedAngle(camera.angle);
        p.controls.update();
        p.render();
        if (ui.timelinePlaying) b.Timeline.start();
      }
    }
    return {
      data: {
        project_id: project.uuid,
        frames: images.map((i) => i.label),
        animation_id: animation ?? null,
      },
      images,
    };
  }
}
function copyCanvas(source: HTMLCanvasElement, target: HTMLCanvasElement) {
  target.width = source.width;
  target.height = source.height;
  target.getContext("2d")!.drawImage(source, 0, 0);
}
async function renderPixels(
  width: number,
  height: number,
  png?: string,
  color?: string,
  edits?: PixelEdit[],
  base?: HTMLCanvasElement,
) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  if (base) {
    ctx.drawImage(base, 0, 0);
  } else if (png) {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image(),
        timer = setTimeout(
          () => reject(new Fault("IMAGE_TIMEOUT", "PNG decode timed out")),
          5000,
        );
      i.onload = () => {
        clearTimeout(timer);
        resolve(i);
      };
      i.onerror = () => {
        clearTimeout(timer);
        reject(new Fault("INVALID_PNG", "Unable to decode PNG"));
      };
      i.src = png;
    });
    if (image.naturalWidth !== width || image.naturalHeight !== height)
      throw new Fault(
        "IMAGE_SIZE",
        "PNG dimensions differ from requested texture dimensions",
      );
    ctx.drawImage(image, 0, 0);
  } else if (color) {
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, width, height);
  }
  for (const edit of edits ?? []) {
    const mask=edit.clip?paintMask(width,height,edit.clip):undefined;
    ctx.fillStyle = edit.color;
    ctx.globalAlpha=edit.opacity??1;
    const compositeModes:Record<string,GlobalCompositeOperation>={erase:'destination-out',atop:'source-atop',behind:'destination-over',multiply:'multiply',screen:'screen',overlay:'overlay',darken:'darken',lighten:'lighten',difference:'difference',add:'lighter'};
    ctx.globalCompositeOperation=compositeModes[edit.mode??'over']??'source-over';
    const pixel = (x: number, y: number, w = 1, h = 1) => {
      const span=(sx:number,sy:number,sw:number,sh:number)=>{
        if(!edit.mode||edit.mode==='replace') ctx.clearRect(sx,sy,sw,sh);
        ctx.fillRect(sx,sy,sw,sh);
      };
      if(!mask) {span(x,y,w,h);return;}
      for(let row=y;row<y+h;row++) {
        let start=-1;
        for(let col=x;col<=x+w;col++) {
          if(col<x+w&&mask[row*width+col]) {if(start<0) start=col;}
          else if(start>=0) {span(start,row,col-start,1);start=-1;}
        }
      }
    };
    if (edit.shape === "rect") pixel(edit.x, edit.y, edit.width, edit.height);
    else if (edit.shape === "pixel") pixel(edit.x, edit.y);
    else if(edit.shape==='fill') {
      const image=ctx.getImageData(0,0,width,height);
      fillPixels(image.data,width,height,edit,mask);
      ctx.putImageData(image,0,0);
    }
    else if(edit.shape==='ellipse'||edit.shape==='gradient') {
      const image=ctx.getImageData(edit.x,edit.y,edit.width!,edit.height!);
      rasterShape(image.data,edit.width!,edit.height!,edit,mask,width);
      ctx.putImageData(image,edit.x,edit.y);
    }
    else {
      let x = edit.x,
        y = edit.y;
      const x2 = edit.x2!,
        y2 = edit.y2!,
        dx = Math.abs(x2 - x),
        sx = x < x2 ? 1 : -1,
        dy = -Math.abs(y2 - y),
        sy = y < y2 ? 1 : -1;
      let err = dx + dy;
      for (;;) {
        pixel(x, y);
        if (x === x2 && y === y2) break;
        const e2 = err * 2;
        if (e2 >= dy) {
          err += dy;
          x += sx;
        }
        if (e2 <= dx) {
          err += dx;
          y += sy;
        }
      }
    }
  }
  return canvas;
}
