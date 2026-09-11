import {Fault} from '../shared/types.ts';
export function loopCutReference(mesh:any){
 const faceId=mesh.getSelectedFaces()[0];
 return (direction:number)=>{
  const face=faceId?mesh.faces[faceId]:null;
  if(faceId&&!face)throw new Fault('MESH_REFERENCE_EDGE','Reference face is missing');
  const keys:string[]=face?face.getSortedVertices():mesh.getSelectedVertices();
  const i=face?direction%keys.length:0,j=face?(direction+1)%keys.length:1;
  const a=mesh.vertices[keys[i]],c=mesh.vertices[keys[j]];
  if(!a||!c)throw new Fault('MESH_REFERENCE_EDGE','Reference edge needs two existing vertices');
  const length=Math.sqrt((c[0]-a[0])**2+(c[1]-a[1])**2+(c[2]-a[2])**2);
  if(!Number.isFinite(length)||length<=0)throw new Fault('MESH_REFERENCE_EDGE','Reference edge must have a finite positive length');
  return length;
 };
}
