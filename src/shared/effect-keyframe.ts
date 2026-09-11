import {z} from 'zod';
const text=z.string().max(10000);
export const effectKeyframeSchema=z.discriminatedUnion('channel',[
  z.object({channel:z.literal('sound'),data_points:z.array(z.object({effect:text,file:text.optional()}).strict()).min(1).max(1000)}).strict(),
  z.object({channel:z.literal('particle'),data_points:z.array(z.object({effect:text,locator:text.optional(),script:text.optional(),file:text.optional(),bind_to_actor:z.boolean().optional()}).strict()).min(1).max(1000)}).strict(),
  z.object({channel:z.literal('timeline'),data_points:z.tuple([z.object({script:text}).strict()])}).strict(),
]);
