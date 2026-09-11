import type {BB} from './adapter.ts';
import {Fault} from '../shared/types.ts';

export function prepareKnife(b:BB,meshes:any[],parameters:any) {
  if(!b.Modes.edit||meshes.length!==1||b.Outliner.selected.length!==1)throw new Fault('KNIFE_SELECTION','Knife requires exactly one mesh in edit mode');
  if(b.KnifeToolContext.current)throw new Fault('KNIFE_IN_PROGRESS','Finish or cancel the current interactive knife operation first');
  const mesh=meshes[0],T=b.THREE;
  if(Object.keys(mesh.vertices).length>20000||Object.keys(mesh.faces).length>10000)throw new Fault('KNIFE_TARGET_LIMIT','Knife supports at most 20000 vertices and 10000 faces');
  const vector=(id:string)=>{if(!Object.hasOwn(mesh.vertices,id))throw new Fault('KNIFE_VERTEX_MISSING','Knife vertex does not exist');return new T.Vector3().fromArray(mesh.vertices[id]);};
  const edgeInFace=(face:any,ids:string[])=>face.getEdges().some((edge:string[])=>edge.includes(ids[0])&&edge.includes(ids[1]));
  const points=parameters.points.map((p:any)=>{
    if(p.type==='vertex')return {type:'vertex',attached_vertex:p.vertex,position:vector(p.vertex),snapped:true};
    if(p.type==='edge') {
      const [a,c]=p.vertices;
      if(a===c||!Object.values(mesh.faces).some((f:any)=>edgeInFace(f,p.vertices)))throw new Fault('KNIFE_EDGE_MISSING','Knife endpoints must describe an existing face edge');
      if(p.fraction===0||p.fraction===1) {const id=p.vertices[p.fraction];return {type:'vertex',attached_vertex:id,position:vector(id),snapped:true};}
      return {type:'line',attached_line:p.vertices,position:vector(a).lerp(vector(c),p.fraction),snapped:true};
    }
    const face=mesh.faces[p.face];
    if(!face||face.vertices.length<3)throw new Fault('KNIFE_FACE_MISSING','Knife face must be a polygon');
    const position=new T.Vector3().fromArray(p.position),vertices=face.getSortedVertices().map(vector);
    const plane=new T.Plane().setFromCoplanarPoints(vertices[0],vertices[1],vertices[2]);
    let inside=false;
    for(let i=1;i<vertices.length-1;i++)if(new T.Triangle(vertices[0],vertices[i],vertices[i+1]).containsPoint(position))inside=true;
    if(!inside||Math.abs(plane.distanceToPoint(position))>1e-5)throw new Fault('KNIFE_POINT_OUTSIDE','Face knife point must lie within the face plane and polygon');
    for(const edge of face.getEdges())if(new T.Line3(vector(edge[0]),vector(edge[1])).closestPointToPoint(position,true,new T.Vector3()).distanceTo(position)<1e-6)
      throw new Fault('KNIFE_POINT_ON_EDGE','Use an edge or vertex point for a face boundary');
    return {type:'face',fkey:p.face,position,snapped:false};
  });
  const belongs=(p:any,key:string,face:any)=>p.type==='face'?p.fkey===key:p.type==='vertex'?face.vertices.includes(p.attached_vertex):edgeInFace(face,p.attached_line);
  for(let i=1;i<points.length;i++) {
    if(points[i].position.distanceTo(points[i-1].position)<1e-6)throw new Fault('KNIFE_DUPLICATE_POINT','Consecutive knife points must be distinct');
    if(!Object.entries(mesh.faces).some(([key,face])=>belongs(points[i-1],key,face)&&belongs(points[i],key,face)))throw new Fault('KNIFE_PATH_DISCONNECTED','Consecutive knife points must share an existing face');
  }
  points.forEach((p:any,i:number)=>{const previous=points.slice(0,i).find((q:any)=>p.position.distanceTo(q.position)<1e-6);if(previous)p.reuse_of=previous;});
  return ()=>{
    const context=new b.KnifeToolContext(mesh);
    b.KnifeToolContext.current=context;
    try {
      context.points=points;
      context.apply();
      for(let i=1;i<points.length;i++)if(!Object.values(mesh.faces).some((face:any)=>edgeInFace(face,[points[i-1].vkey,points[i].vkey])))
        throw new Fault('KNIFE_CUT_INCOMPLETE','Native knife did not generate every requested cut segment');
    } finally {
      if(context.mesh)context.remove();
      context.points_geo.dispose();context.points_mesh.material.dispose();
    }
  };
}
