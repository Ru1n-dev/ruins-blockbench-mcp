/** Core Mesh.getUndoCopy omits empty seams; Mesh.extend then retains stale data.
 * Only full mesh geometry saves represent absence as an explicit empty set. */
export function explicitMeshSeamSave(save:any){
 for(const data of Object.values(save?.elements??{}) as any[])
  if(data.type==='mesh'&&Object.hasOwn(data,'vertices')&&!Object.hasOwn(data,'seams'))data.seams={};
}
