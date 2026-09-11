import {Fault,type Vec3} from './types.ts';
// Column-major affine matrices, as returned by Three.js matrixWorld.elements.
export function splineCoordinateConverter(source:number[],target:number[]):(point:Vec3)=>Vec3 {
 for(const m of [source,target])if(m.length!==16||!m.every(Number.isFinite)||m[3]!==0||m[7]!==0||m[11]!==0||m[15]!==1)throw new Fault('SPLINE_TRANSFORM','Expected finite affine 4x4 matrices');
 const rows=Array.from({length:3},(_,r)=>[target[r],target[4+r],target[8+r],...Array.from({length:3},(_,c)=>r===c?1:0)]);
 for(let c=0;c<3;c++){
  let pivot=c;for(let r=c+1;r<3;r++)if(Math.abs(rows[r][c])>Math.abs(rows[pivot][c]))pivot=r;
  if(Math.abs(rows[pivot][c])<1e-12)throw new Fault('SPLINE_TRANSFORM','Target transform is singular');
  [rows[c],rows[pivot]]=[rows[pivot],rows[c]];
  const divisor=rows[c][c];rows[c]=rows[c].map(v=>v/divisor);
  for(let r=0;r<3;r++)if(r!==c){const factor=rows[r][c];rows[r]=rows[r].map((v,j)=>v-factor*rows[c][j]);}
 }
 const from=source.slice(),origin=target.slice(12,15);
 return point=>{
  if(point.length!==3||!point.every(Number.isFinite))throw new Fault('SPLINE_TRANSFORM','Expected finite XYZ');
  const relative=[0,1,2].map(r=>from[r]*point[0]+from[4+r]*point[1]+from[8+r]*point[2]+from[12+r]-origin[r]);
  return rows.map(row=>row.slice(3).reduce((v,x,i)=>v+x*relative[i],0)) as Vec3;
 };
}
