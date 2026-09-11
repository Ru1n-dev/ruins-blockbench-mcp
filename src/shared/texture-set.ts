import {z} from 'zod';
import type {TextureGroupData} from './types.ts';
const byte=z.number().int().min(0).max(255),rgb=z.tuple([byte,byte,byte]),rgba=z.tuple([byte,byte,byte,byte]);
const reference=z.string().min(1).max(400).regex(/^[^#]/);
const hex=z.string().regex(/^#(?:[a-f\d]{3}|[a-f\d]{4}|[a-f\d]{6}|[a-f\d]{8})$/i);
export const textureSetAssets=z.array(z.object({reference:z.string().min(1).max(400),filename:z.string().min(1).max(400),extension:z.enum(['png','tga']),width:z.number().int().min(1).max(4096),height:z.number().int().min(1).max(4096),content:z.string().max(44000000)}).strict()).max(5).refine(assets=>assets.reduce((n,a)=>n+a.content.length,0)<=44000000,'Combined images exceed 32 MB');
export const textureSetDocument=z.object({format_version:z.enum(['1.16.100','1.21.30']),
  'minecraft:texture_set':z.object({color:z.union([reference,hex,rgb,rgba]),
    metalness_emissive_roughness:z.union([reference,hex,rgb]).optional(),
    metalness_emissive_roughness_subsurface:z.union([reference,hex,rgba]).optional(),
    normal:reference.optional(),heightmap:reference.optional(),
  }).strict().refine(s=>!(s.metalness_emissive_roughness!==undefined&&s.metalness_emissive_roughness_subsurface!==undefined),'Use only one MER representation'),
}).strict();
export function decodeTextureSet(document:z.infer<typeof textureSetDocument>) {
  const data=textureSetDocument.parse(document)['minecraft:texture_set'];
  const config:TextureGroupData['material_config']={color_value:[255,255,255,255],mer_value:[0,0,0],subsurface_value:0,saved:false};
  const references:{name:string;channel:'color'|'mer'|'normal'|'height'}[]=[];
  const channels={color:'color',metalness_emissive_roughness:'mer',metalness_emissive_roughness_subsurface:'mer',normal:'normal',heightmap:'height'} as const;
  for(const key of Object.keys(channels) as (keyof typeof channels)[]) {
    const value=data[key];if(value===undefined)continue;
    if(typeof value==='string'&&!value.startsWith('#')) {
      references.push({name:value,channel:channels[key]});
      if(key==='metalness_emissive_roughness_subsurface')config.subsurface_value=1;
    } else {
      let values:number[];
      if(typeof value==='string') {
        let digits=value.slice(1);if(digits.length<=4)digits=[...digits].map(s=>s+s).join('');
        values=digits.match(/../g)!.map(s=>parseInt(s,16));
      } else values=[...value];
      if(key==='color')config.color_value=[values[0],values[1],values[2],values[3]??255];
      else {config.mer_value=[values[0],values[1],values[2]];if(key==='metalness_emissive_roughness_subsurface')config.subsurface_value=values[3]??0;}
    }
  }
  return {config,references};
}
