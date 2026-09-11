import {z} from 'zod';
const dimension=z.number().finite().min(-100000).max(100000);
const base={diameter:dimension.default(16)};
const height={height:dimension.default(8)};
const round={align_edges:z.boolean().default(true),sides:z.number().int().min(3).max(48).default(12)};
export const meshPrimitiveSchema=z.discriminatedUnion('shape',[
  z.object({shape:z.enum(['cuboid','pyramid']),...base,...height}).strict(),
  z.object({shape:z.literal('beveled_cuboid'),...base,...height,edge_size:dimension.default(2)}).strict(),
  z.object({shape:z.literal('plane'),...base}).strict(),
  z.object({shape:z.enum(['circle','sphere']),...base,...round}).strict(),
  z.object({shape:z.enum(['cylinder','cone']),...base,...round,...height}).strict(),
  z.object({shape:z.literal('tube'),...base,...round,...height,minor_diameter:dimension.default(4)}).strict(),
  z.object({shape:z.literal('torus'),...base,...round,minor_diameter:dimension.default(4),minor_sides:z.number().int().min(2).max(32).default(8)}).strict(),
]);
