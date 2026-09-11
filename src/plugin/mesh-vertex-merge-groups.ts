/** Native 5.1.6 ordered, non-transitive distance grouping. */
export function vertexMergeGroups(mesh:any,selected:string[],distance:number|undefined){
  const groups:string[][]=[];
  if(distance===undefined){if(selected.length>1)groups.push(selected);}
  else {
   const remaining=selected.slice();
   for(let i=0;i<remaining.length;i++){
    const first=remaining[i],a=mesh.vertices[first],group=[first];
    for(let j=i+1;j<remaining.length;j++){
     const c=mesh.vertices[remaining[j]];
     if(Math.sqrt((c[0]-a[0])**2+(c[1]-a[1])**2+(c[2]-a[2])**2)<distance)group.push(remaining[j]);
    }
    if(group.length>1){groups.push(group);for(const key of group.slice(1))remaining.splice(remaining.indexOf(key),1);}
   }
  }
 return groups;
}
