import {Fault} from '../shared/types.ts';
import {resolveSeamVertices} from './mesh-seam-reference.ts';
export function createLoopCutSeams(meshes:any[],policy:'preserve'|'native'){
 let records:any[]=[],parents=new Map<any,Set<string>>();
 return {
  begin(){
   records=[];parents=new Map();if(policy==='native')return;
   for(const mesh of meshes){
    const known=new Set<string>(Object.keys(mesh.vertices));
    for(const [key,value] of Object.entries(mesh.seams)){
     resolveSeamVertices(key,known,mesh.uuid);
     if(value!=='divide'&&value!=='join')throw new Fault('MESH_SEAM_VALUE','Unsupported seam value');
    }
    parents.set(mesh,new Set());
   }
  },
  split(mesh:any,edge:string[],vertex:string){
   if(policy==='native')return;
   const parent=edge.slice().sort().join('_'),value=mesh.seams[parent];if(!value)return;
   const children=edge.map(id=>[id,vertex].sort().join('_'));
   const known=new Set<string>(Object.keys(mesh.vertices));
   for(const key of children){
    resolveSeamVertices(key,known,mesh.uuid);
    if(mesh.seams[key]&&mesh.seams[key]!==value)throw new Fault('MESH_SEAM_CONFLICT','Subdivided seam conflicts with an existing seam');
    mesh.seams[key]=value;
   }
   parents.get(mesh)!.add(parent);
   records.push({mesh_id:mesh.uuid,source_seam:parent,vertex_id:vertex,child_seams:children,value});
  },
  finish(){
   if(policy==='native')return;
   for(const [mesh,keys] of parents){
    const live=new Set<string>(Object.values(mesh.faces).flatMap((face:any)=>face.getEdges().map((edge:string[])=>edge.slice().sort().join('_'))));
    for(const key of keys)if(!live.has(key))delete mesh.seams[key];
   }
  },
  get records(){return records;}
 };
}
