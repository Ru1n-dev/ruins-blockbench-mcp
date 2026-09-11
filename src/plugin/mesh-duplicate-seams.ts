import {Fault} from '../shared/types.ts';
import {resolveSeamVertices} from './mesh-seam-reference.ts';
/** Copy explicit seam intent only to actual edges made from corresponding
 * vertices. Side edges have no source edge and receive no invented seam. */
export function createDuplicatedSeams(meshes:any[]){
 let originals=new Map<any,{key:string;edge:string[];value:string}[]>(),records:any[]=[];
 return {
  begin(){
   originals=new Map();records=[];
   for(const mesh of meshes){
    const known=new Set<string>(Object.keys(mesh.vertices));
    originals.set(mesh,Object.entries(mesh.seams).map(([key,value])=>{
     const edge=resolveSeamVertices(key,known,mesh.uuid)!;
     if(value!=='divide'&&value!=='join')throw new Fault('MESH_SEAM_VALUE','Unsupported seam value');
     return {key,edge,value};
    }));
   }
  },
  finish(rows:any[]){
   for(const {mesh,mapping} of rows){
    const known=new Set<string>(Object.keys(mesh.vertices));
    const live=new Set<string>(Object.values(mesh.faces).flatMap((face:any)=>face.getEdges().map((edge:string[])=>edge.slice().sort().join('_'))));
    for(const {key,edge,value} of originals.get(mesh)??[]){
     const written=new Set<string>();
     const transfer=(mapped:string[],kind:'copy'|'replacement')=>{
      if(!mapped.every(Boolean))return;
      const target=mapped.slice().sort().join('_');
      if(live.has(target)&&!written.has(target)){
       resolveSeamVertices(target,known,mesh.uuid);
       if(mesh.seams[target]&&mesh.seams[target]!==value)throw new Fault('MESH_SEAM_CONFLICT','Copied seam conflicts with an existing seam');
       mesh.seams[target]=value;
       written.add(target);
       records.push({mesh_id:mesh.uuid,source_seam:key,target_seam:target,value,kind});
      }
     };
     transfer(edge.map(id=>mapping[id]),'copy');
     if(edge.some(id=>!known.has(id))){
      // Inset also replaces internal vertices in unselected faces. Preserve
      // those surviving edges, including ones with an unselected endpoint.
      transfer(edge.map(id=>known.has(id)?id:mapping[id]),'replacement');
      delete mesh.seams[key];
     }
    }
   }
  },
  get records(){return records;},
 };
}
