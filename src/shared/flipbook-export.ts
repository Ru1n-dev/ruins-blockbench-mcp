import { z } from 'zod';
import { Fault } from './types.ts';

export const flipbookExportSchema = z.object({
  fps: z.number().finite().min(1).max(1000).optional(),
  model_identifier: z.string().min(1).max(200).optional(),
  texture_path: z.string().min(1).max(500).optional().describe('Bedrock block resource path beginning textures/, without file extension. Required for unsaved textures.'),
  atlas_tile: z.string().min(1).max(200).optional(),
  blend_frames: z.boolean().optional(),
}).strict();

export function compileFlipbookReference(input: {
  format: string; frame_count: number; fps: number; model_identifier: string;
  texture_path: string; texture_name: string;
}, options: z.infer<typeof flipbookExportSchema>) {
  if (!['bedrock','bedrock_block'].includes(input.format))
    throw new Fault('FORMAT_UNSUPPORTED','texture_animation requires bedrock or bedrock_block');
  if (!Number.isInteger(input.frame_count) || input.frame_count < 1)
    throw new Fault('TEXTURE_FRAME_GEOMETRY','A valid texture frame count is required');
  const fps = options.fps ?? input.fps;
  if (!Number.isFinite(fps) || fps < 1 || fps > 1000)
    throw new Fault('INPUT','Texture FPS must be 1..1000; supply flipbook.fps');
  if (input.format === 'bedrock') {
    if (options.texture_path !== undefined || options.atlas_tile !== undefined || options.blend_frames !== undefined)
      throw new Fault('INPUT','texture_path, atlas_tile and blend_frames require bedrock_block');
    const model = options.model_identifier ?? (input.model_identifier || 'entity');
    return {content:{format_version:'1.20.0',render_controllers:{[`controller.render.${model}`]:{
      geometry:'Geometry.default',textures:['Texture.default'],materials:[{'*':'Material.default'}],
      uv_anim:{scale:[1,`1 / ${input.frame_count}`],offset:[0,`Math.mod(Math.floor(query.life_time * ${fps}), ${input.frame_count}) / ${input.frame_count}`]},
    }}},details:{format:input.format,frame_count:input.frame_count,fps,
      notes:["Assign a material with USE_UV_ANIM enabled, such as conduit_wind. This file is a render-controller reference; it does not modify the entity or material definitions."]}};
  }
  if (options.model_identifier !== undefined)throw new Fault('INPUT','model_identifier requires bedrock');
  const texturePath = options.texture_path ?? input.texture_path.replace(/[\x07\\]+/g,'/').replace(/(^|.*\/)textures\//,'textures/').replace(/\.\w*$/,'');
  if (!/^textures\/(?:[^./\\:\s]+\/)*[^./\\:\s]+$/.test(texturePath))
    throw new Fault('INPUT','Provide flipbook.texture_path as a resource path under textures/ without extension');
  const tile = options.atlas_tile ?? input.texture_name.replace(/^.*[/\\]/,'').replace(/\.[^.]+$/,'');
  if (!tile)throw new Fault('INPUT','Provide flipbook.atlas_tile');
  const ticks = Math.round(20 / fps);
  return {content:[{flipbook_texture:texturePath,atlas_tile:tile,ticks_per_frame:ticks,blend_frames:options.blend_frames ?? false}],
    details:{format:input.format,frame_count:input.frame_count,fps,notes:ticks===0?['Native Math.round(20 / fps) yields zero ticks at this FPS; choose a lower FPS for positive ticks.']:[]}};
}
