import { waitForImage } from './image-loading.ts';

// Native Undo restores layer pixels, then recomposites. Fractional transforms can
// sample differently after the layer canvas was round-tripped through ImageData.
// Retain the actual visible bitmap for edits made by this adapter.
export function captureTextureComposites(b:any, ids:Set<string>) {
  return Object.fromEntries(b.Texture.all.filter((t:any)=>ids.has(t.uuid)&&t.layers_enabled)
    .map((t:any)=>[t.uuid,t.canvas.toDataURL('image/png')]));
}

export async function restoreTextureComposites(b:any, saved:Record<string,string>|undefined) {
  if(!saved)return;
  for(const [id,png] of Object.entries(saved)) {
    const texture=b.Texture.all.find((t:any)=>t.uuid===id);
    if(!texture||!texture.layers_enabled||!png.startsWith('data:image/png;base64,'))continue;
    const image=new Image();image.src=png;await waitForImage(image);
    if(image.naturalWidth!==texture.width||image.naturalHeight!==texture.height)continue;
    texture.canvas.width=texture.width;texture.canvas.height=texture.height;
    texture.ctx.drawImage(image,0,0);
    texture.source=png;texture.updateImageFromCanvas();await waitForImage(texture.img);
  }
}
