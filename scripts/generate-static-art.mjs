/** Offline-only deterministic texture generation from the frozen v1.0.12 painters. */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { cargoBox, forklift, roundedPath } from './static-art-authoring/src/presentation/assets.ts';
import { drawWarehouse } from './static-art-authoring/src/presentation/warehouse-art.ts';
import { drawThemedBoard } from './static-art-authoring/src/presentation/board-theme.ts';
import { boardGeometry } from './static-art-authoring/src/presentation/board-geometry.ts';
import { drawToolIcon, drawToolboxIcon } from './static-art-authoring/src/presentation/tool-art.ts';
import { loadBoardMaterialAtlas } from './static-art-authoring/src/presentation/board-material-atlas.ts';
import { loadSceneMaterialAtlas } from './static-art-authoring/src/presentation/scene-frame-atlas.ts';
import { HISTORICAL_COSMETIC_CATALOG } from './static-art-authoring/src/application/cosmetics.ts';
import { COSMETIC_CATALOG } from '../src/application/cosmetics.ts';
import { manifestSource } from './static-art-authoring/manifest-source.mjs';
import { decodePng, encodePng, optimizePng, copyPixels, sha256 } from './static-art-authoring/png.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const rect=(x,y,w,h)=>({x,y,w,h});
const sprite=(resource,source,destination)=>({resource,source,destination});
const cargoIds=['cargo.food','cargo.machine','cargo.chem','cargo.electronic','cargo.cold'];
const baseForklifts=['yellow','blue','red','white'];
export async function generateStaticArt({write=true,outputRoot=root}={}) {
 const resources={},scenes={},previews={},forklifts={},cargo={},tools={},frames={},buffers=new Map();
 const frozen=JSON.parse(await readFile(resolve(root,'scripts/static-art-authoring/sources.json'),'utf8'));
 for(const source of frozen.sources){if(sha256(await readFile(resolve(root,'scripts/static-art-authoring',source.path)))!==source.sha256)throw Error(`Frozen source changed: ${source.path}`);}
 for(const asset of frozen.sourceAssets){if(sha256(await readFile(resolve(root,asset.path)))!==asset.sha256)throw Error(`Original image changed: ${asset.path}`);}
 if(!await loadBoardMaterialAtlas(path=>loadImage(resolve(root,path)))||!await loadSceneMaterialAtlas(path=>loadImage(resolve(root,path))))throw Error('Authoring material atlas load failed');
 async function record(key,filename,raw,existing=false){
  const bytes=existing?raw:optimizePng(raw),decoded=decodePng(bytes);
  const sourcePath=existing?filename:`assets/static-art/${filename}`;
  const src=sourcePath;
  resources[key]={key,src,sourcePath,package:'main',width:decoded.width,height:decoded.height,bytes:bytes.length,sha256:sha256(bytes),pixelSha256:sha256(decoded.pixels)};
  buffers.set(key,bytes);
  if(write&&!existing){const path=resolve(outputRoot,sourcePath);await mkdir(dirname(path),{recursive:true});await writeFile(path,bytes);}
  return resources[key];
 }
 for(const {id:theme} of COSMETIC_CATALOG.filter(item=>item.kind==='theme')){
  const key=`scene.${theme}`,canvas=createCanvas(1205,1920),ctx=canvas.getContext('2d');ctx.translate(57,0);drawWarehouse(ctx,{profile:{cosmetics:{theme}}});
  await record(key,`scene-${theme}.png`,canvas.toBuffer('image/png'));
  scenes[theme]=sprite(key,rect(0,0,1205,1920),rect(-57,0,1205,1920));
  // Shop previews now paint synchronously from shared atlases; no separate PNG is packaged.
 }
 for(const [group,paints] of [['base',baseForklifts],['styled',HISTORICAL_COSMETIC_CATALOG.filter(item=>item.kind==='forklift'&&!baseForklifts.includes(item.id)).map(item=>item.id)]]){
  const key=`forklift.${group}`,canvas=createCanvas(1024,Math.ceil(paints.length/4)*192),ctx=canvas.getContext('2d');
  for(const [index,paint] of paints.entries()){const x=index%4*256,y=Math.floor(index/4)*192;forklift(ctx,x+120,y+88,220,0,paint);if(COSMETIC_CATALOG.some(item=>item.kind==='forklift'&&item.id===paint))forklifts[paint]=sprite(key,rect(x,y,256,192),rect(-60,-44,128,96));}
  await record(key,`forklift-${group}.png`,canvas.toBuffer('image/png'));
 }
 {
  const key='cargo.core',packed={width:1792,height:256,pixels:Buffer.alloc(1792*256*4)};
  for(const [index,id] of [...cargoIds,'waste','outline'].entries()){
   const canvas=createCanvas(256,256),ctx=canvas.getContext('2d');ctx.scale(2,2);
   if(id==='outline'){ctx.translate(6,6);roundedPath(ctx,3,3,104,104,8);ctx.strokeStyle='#172635';ctx.lineWidth=11;ctx.stroke();ctx.strokeStyle='#fff6d6';ctx.lineWidth=5;ctx.stroke();}
   else if(id==='waste'){ctx.fillText=()=>{};cargoBox(ctx,'cargo.food',6,6,110,1,{kind:'waste'});}
   else cargoBox(ctx,id,6,6,110);
   copyPixels(decodePng(canvas.toBuffer('image/png')),packed,rect(0,0,256,256),index*256,0);cargo[id]=sprite(key,rect(index*256,0,256,256),rect(-6,-6,128,128));
  }
  await record(key,'cargo-core.png',encodePng(packed));
 }
 {
  const key='tools.core',packed={width:1024,height:256,pixels:Buffer.alloc(1024*256*4)};
  for(const [index,id] of ['rotate','clear','repaint','toolbox'].entries()){
   const canvas=createCanvas(256,256),ctx=canvas.getContext('2d');if(id==='toolbox')drawToolboxIcon(ctx,0,0,256);else drawToolIcon(ctx,id,0,0,256);
   copyPixels(decodePng(canvas.toBuffer('image/png')),packed,rect(0,0,256,256),index*256,0);tools[id]=sprite(key,rect(index*256,0,256,256),rect(0,0,256,256));
  }
  await record(key,'tools-core.png',encodePng(packed));
 }
 {
  const key='frame.classic',packed={width:1024,height:272,pixels:Buffer.alloc(1024*272*4)};
  for(const [index,theme] of ['day','night'].entries()){
   const canvas=createCanvas(1080,1920),ctx=canvas.getContext('2d');drawThemedBoard(ctx,boardGeometry(),theme);ctx.clearRect(120,560,840,840);const original=decodePng(canvas.toBuffer('image/png'));frames[theme]=[];
   for(const [part,crop,y,destination,rotated90] of [
    ['top',rect(88,530,904,30),0,rect(88,530,904,30),false],['bottom',rect(88,1400,904,37),30,rect(88,1400,904,37),false],
    ['left',rect(88,560,32,840),67,rect(88,560,32,840),true],['right',rect(960,560,32,840),99,rect(960,560,32,840),true],
   ]){copyPixels(original,packed,crop,0,index*131+y,rotated90);frames[theme].push({...sprite(key,rect(0,index*131+y,rotated90?crop.h:crop.w,rotated90?crop.w:crop.h),destination),part,rotated90});}
  }
  await record(key,'frame-classic.png',encodePng(packed));
 }
 for(const name of ['board','cargo','scene'])await record(`material.${name}`,`assets/${name}-materials.png`,await readFile(resolve(root,`assets/${name}-materials.png`)),true);
 const generatorInputs=[];for(const path of ['scripts/generate-static-art.mjs','scripts/static-art-authoring/png.mjs','scripts/static-art-authoring/manifest-source.mjs','src/application/cosmetics.ts'])generatorInputs.push({path,sha256:sha256(await readFile(resolve(root,path)))});
 const source={generatorInputs,sourceCommit:frozen.sourceCommit,sourceManifestSha256:sha256(await readFile(resolve(root,'scripts/static-art-authoring/sources.json'))),canvasVersion:'1.0.10',generatorVersion:2};
 const result={source,resources,scenes,previews,forklifts,cargo,tools,frames};
 if(write){await writeFile(resolve(outputRoot,'src/presentation/static-art-manifest.ts'),manifestSource(result));await writeFile(resolve(outputRoot,'scripts/static-art-authoring/resources.json'),JSON.stringify(result,null,2)+'\n');}
 return {...result,buffers};
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const result=await generateStaticArt();console.log(JSON.stringify({resources:Object.keys(result.resources).length,mainBytes:Object.values(result.resources).filter(x=>x.package==='main').reduce((n,x)=>n+x.bytes,0),cosmeticsBytes:Object.values(result.resources).filter(x=>x.package==='cosmetics').reduce((n,x)=>n+x.bytes,0)}));
}
