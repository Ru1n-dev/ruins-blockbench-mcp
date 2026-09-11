import { clone, Fault, type Vec3 } from './types.ts';
export interface SplineTopology {
 vertices:Record<string,Vec3>;
 handles:Record<string,{control1:string;joint:string;control2:string;size:number;tilt:number}>;
 curves:Record<string,{start_handle:string;end_handle:string;start:string;start_ctrl:string;end_ctrl:string;end:string}>;
 cyclic?:boolean;
}
// Coordinate conversion belongs to the caller: this routine never assumes that
// two node-local coordinate systems coincide. Original inputs remain untouched.
export function connectSplineChains(parts:Array<{data:SplineTopology;reverse:boolean;toTarget:(point:Vec3)=>Vec3}>):SplineTopology {
 if(parts.length<2)throw new Fault('SPLINE_TOPOLOGY','At least two chains are required');
 const result:SplineTopology={vertices:{},handles:{},curves:{},cyclic:false};
 let previous:string|undefined;
 for(const [index,part] of parts.entries()){
  const data=clone(part.data),prefix=`p${index}_`,keys=Object.keys(data.handles);
  if(data.cyclic||keys.length<2)throw new Fault('SPLINE_TOPOLOGY','Joining requires open chains with at least two handles');
  const curves=Object.values(data.curves);
  if(curves.length!==keys.length-1)throw new Fault('SPLINE_TOPOLOGY','Expected one continuous ordered chain');
  for(let j=0;j<keys.length-1;j++){
   const a=data.handles[keys[j]],b=data.handles[keys[j+1]];
   if(!curves.some(c=>c.start_handle===keys[j]&&c.end_handle===keys[j+1]&&c.start===a.joint&&c.start_ctrl===a.control2&&c.end_ctrl===b.control1&&c.end===b.joint))throw new Fault('SPLINE_TOPOLOGY','Curve references do not match the handle chain');
  }
  for(const h of Object.values(data.handles))for(const key of [h.control1,h.joint,h.control2])if(!Object.hasOwn(data.vertices,key))throw new Fault('SPLINE_TOPOLOGY','Missing control vertex');
  for(const [key,p] of Object.entries(data.vertices)){
   const transformed=part.toTarget([...p] as Vec3);
   if(transformed.length!==3||!transformed.every(Number.isFinite))throw new Fault('SPLINE_TOPOLOGY','Coordinate conversion must return finite XYZ');
   result.vertices[prefix+key]=[...transformed] as Vec3;
  }
  const ordered=part.reverse?keys.reverse():keys;
  for(const key of ordered){const h=data.handles[key];result.handles[prefix+key]={...h,control1:prefix+(part.reverse?h.control2:h.control1),joint:prefix+h.joint,control2:prefix+(part.reverse?h.control1:h.control2)};}
  const addCurve=(from:string,to:string,key:string)=>{const a=result.handles[from],b=result.handles[to];result.curves[key]={start_handle:from,end_handle:to,start:a.joint,start_ctrl:a.control2,end_ctrl:b.control1,end:b.joint};};
  if(previous)addCurve(previous,prefix+ordered[0],`bridge_${index}`);
  for(let j=0;j<ordered.length-1;j++)addCurve(prefix+ordered[j],prefix+ordered[j+1],`${prefix}curve_${j}`);
  previous=prefix+ordered.at(-1);
 }
 return result;
}
