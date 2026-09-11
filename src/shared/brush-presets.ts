import {z} from 'zod';
const nullable=<T extends z.ZodType>(schema:T)=>schema.nullable();
const brushPresetFields=z.object({
  name:z.string().min(1).max(160),
  size:nullable(z.number().int().min(1).max(1024)),opacity:nullable(z.number().finite().min(0).max(255)),softness:nullable(z.number().finite().min(0).max(100)),
  color:nullable(z.string().regex(/^#[0-9a-fA-F]{6}$/)),shape:nullable(z.enum(['square','circle'])),
  blend_mode:nullable(z.enum(['default','set_opacity','color','behind','multiply','add','lighten','darken','screen','overlay','difference'])),pixel_perfect:nullable(z.boolean()),
}).strict();
export const brushPresetSchema=brushPresetFields.extend({
  size:brushPresetFields.shape.size.default(null),opacity:brushPresetFields.shape.opacity.default(null),
  softness:brushPresetFields.shape.softness.default(null),color:brushPresetFields.shape.color.default(null),
  shape:brushPresetFields.shape.shape.default(null),blend_mode:brushPresetFields.shape.blend_mode.default(null),
  pixel_perfect:brushPresetFields.shape.pixel_perfect.default(null),
});
export const brushPresetCommand=z.discriminatedUnion('action',[
  z.object({action:z.literal('list')}).strict(),
  z.object({action:z.literal('create'),preset:brushPresetSchema}).strict(),
  z.object({action:z.literal('update'),name:z.string().min(1).max(160),patch:brushPresetFields.partial()}).strict(),
  z.object({action:z.literal('delete'),name:z.string().min(1).max(160)}).strict(),
  z.object({action:z.literal('load'),name:z.string().min(1).max(160),source:z.enum(['custom','built_in']).default('custom'),tool_id:z.enum(['brush_tool','eraser','copy_brush','fill_tool','draw_shape_tool','gradient_tool','color_picker'])}).strict(),
]);
