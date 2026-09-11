import {z} from 'zod';
const id=z.string().min(1);
export const knifeParameters=z.object({points:z.array(z.discriminatedUnion('type',[
  z.object({type:z.literal('vertex'),vertex:id}).strict(),
  z.object({type:z.literal('edge'),vertices:z.tuple([id,id]),fraction:z.number().finite().min(0).max(1)}).strict(),
  z.object({type:z.literal('face'),face:id,position:z.tuple([z.number().finite().min(-100000).max(100000),z.number().finite().min(-100000).max(100000),z.number().finite().min(-100000).max(100000)])}).strict(),
])).min(2).max(128)}).strict();
