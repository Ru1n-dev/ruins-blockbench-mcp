import path from 'node:path';
import {createHash} from 'node:crypto';
import {realpath,stat,readFile} from 'node:fs/promises';
import {textureSetDocument,decodeTextureSet} from '../shared/texture-set.ts';
import {Fault} from '../shared/types.ts';
import type {OutputFiles} from './files.ts';

export async function readTextureSetInput(files:OutputFiles,filename:string) {
  if(!filename.endsWith('.texture_set.json'))throw new Fault('TEXTURE_SET_FILENAME','Filename must end in .texture_set.json');
  const input=await files.readInput(filename);
  const documentBytes=Buffer.from(input.content,'base64');
  const document=textureSetDocument.parse(JSON.parse(documentBytes.toString('utf8').replace(/^\uFEFF/,'')));
  const source_hashes={document_sha256:createHash('sha256').update(documentBytes).digest('hex'),images:[] as {reference:string;sha256:string}[]};
  const root=await realpath(files.root),assets=[];
  let bytes=0;
  for(const name of new Set(decodeTextureSet(document).references.map(r=>r.name))) {
    // Native import appends PNG, then TGA, to the reference name.
    const relative=name.replace(/\\/g,'/');
    if(path.isAbsolute(relative)||/[:\x00-\x1f]/.test(relative))throw new Fault('PATH_ESCAPE','Texture references must stay inside the configured folder');
    let found=false;
    for(const extension of ['png','tga'] as const) {
      const candidate=path.resolve(path.dirname(input.path),relative+'.'+extension);
      const contained=(file:string)=>{const rel=path.relative(root,file);return rel!==''&&!rel.startsWith('..'+path.sep)&&rel!=='..'&&!path.isAbsolute(rel);};
      if(!contained(candidate))throw new Fault('PATH_ESCAPE','Texture reference escapes the configured folder');
      let resolved:string;
      try{resolved=await realpath(candidate);}catch(error:any){if(error.code==='ENOENT')continue;throw error;}
      if(!contained(resolved))throw new Fault('PATH_ESCAPE','Texture reference link escapes the configured folder');
      const info=await stat(resolved);
      if(!info.isFile()||info.size>32000000)throw new Fault('SIZE_LIMIT','Texture input must be a file under 32 MB');
      const data=await readFile(resolved);bytes+=data.length;
      if(bytes>32000000)throw new Fault('SIZE_LIMIT','Combined texture inputs exceed 32 MB');
      let width:number,height:number;
      if(extension==='png') {
        if(data.length<24||data.subarray(0,8).toString('hex')!=='89504e470d0a1a0a')throw new Fault('TEXTURE_IMAGE_INVALID','Invalid PNG header');
        width=data.readUInt32BE(16);height=data.readUInt32BE(20);
      } else {
        if(data.length<18)throw new Fault('TEXTURE_IMAGE_INVALID','Invalid TGA header');
        width=data.readUInt16LE(12);height=data.readUInt16LE(14);
      }
      if(width<1||height<1||width>4096||height>4096)throw new Fault('TEXTURE_DIMENSIONS','Texture dimensions must be 1..4096');
      assets.push({reference:name,filename:path.basename(candidate),extension,width,height,content:data.toString('base64')});
      source_hashes.images.push({reference:name,sha256:createHash('sha256').update(data).digest('hex')});found=true;break;
    }
    if(!found)throw new Fault('TEXTURE_REFERENCE_MISSING',`No PNG or TGA found for ${name}`);
  }
  return {document,assets,source_hashes};
}
