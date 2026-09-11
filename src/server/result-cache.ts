// FIFO replay cache with incremental size accounting. The caller supplies the
// same serialized-size metric used by its protocol limits.
export class ResultCache<T> {
 private entries=new Map<string,{value:T;size:number}>();
 private used=0;
 constructor(private measure:(value:T)=>number,private maxEntries=128,private maxSize=64000000){}
 get(key:string):T|undefined{return this.entries.get(key)?.value;}
 get size(){return this.entries.size;}
 get retainedSize(){return this.used;}
 set(key:string,value:T){
  const size=this.measure(value),old=this.entries.get(key);
  if(old)this.used-=old.size;
  this.entries.set(key,{value,size});this.used+=size;
  while(this.entries.size>this.maxEntries||this.used>this.maxSize){
   const key=this.entries.keys().next().value!;
   this.used-=this.entries.get(key)!.size;this.entries.delete(key);
  }
 }
}
