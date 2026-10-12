// Historical v112 renderer evidence. Frozen painters preserve original pixel contracts; this is not v113 runtime validation.
import {build} from 'esbuild';
import {createCanvas,loadImage} from '@napi-rs/canvas';
import {writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url)),out=resolve(root,'artifacts/mobile-static-cache');await mkdir(out,{recursive:true});
// Bundle the real static painter and cache together for reproducible isolated measurements.
await build({stdin:{contents:`export {render} from './scripts/static-art-authoring/src/presentation/renderer.ts';export {drawWarehouse} from './scripts/static-art-authoring/src/presentation/warehouse-art.ts';export {configureWarehouseCache,drawCachedWarehouse} from './scripts/static-art-authoring/src/presentation/warehouse-cache.ts';export {createRunV18} from './src/domain/v18/engine.ts';export {createProfile} from './src/application/profile.ts';export {loadCargoAtlas} from './scripts/static-art-authoring/src/presentation/cargo-atlas.ts';export {loadSceneMaterialAtlas} from './scripts/static-art-authoring/src/presentation/scene-frame-atlas.ts';export {loadBoardMaterialAtlas} from './scripts/static-art-authoring/src/presentation/board-material-atlas.ts';export {loadThemedForkliftAtlas} from './scripts/static-art-authoring/src/presentation/themed-forklift-art.ts';`,loader:'ts',resolveDir:root},bundle:true,format:'esm',platform:'node',outfile:resolve(out,'benchmark-bundle.mjs')});
const api=await import(pathToFileURL(resolve(out,'benchmark-bundle.mjs')));
for(const name of ['loadCargoAtlas','loadSceneMaterialAtlas','loadBoardMaterialAtlas','loadThemedForkliftAtlas'])await api[name](path=>loadImage(resolve(root,path)));
const state=api.createRunV18({mode:'standard',seed:17,inboundDifficulty:'hard'}),view={screen:'game',selectedPieceId:null,hoverOrigin:null,preview:null,dragPoint:null,paused:false,message:'',saveStatus:'',elapsed:0,animation:null,debug:false,needsResume:false,profile:api.createProfile()};
const rows=[];
for(const width of [360,1080,1440])for(const target of ['warehouse','fullFrame']){
 const height=Math.round(width*800/360),scale=width/1080,y=(height-1920*scale)/2,canvas=createCanvas(width,height),raw=canvas.getContext('2d');
 for(const cached of [false,true]){
  let paints=0,allocations=0,methods=0,properties=0;
  const ctx=new Proxy(raw,{get(target,key){const value=Reflect.get(target,key,target);if(typeof value!=='function')return value;return(...args)=>{methods++;return value.apply(target,args);};},set(target,key,value){properties++;Reflect.set(target,key,value,target);return true;}});
  api.configureWarehouseCache(cached?()=>{allocations++;return createCanvas(1,1);}:undefined);
  const paint=c=>{paints++;api.drawWarehouse(c,view);};
  const frame=()=>{ctx.setTransform(1,0,0,1,0,0);ctx.fillStyle='#0c131c';ctx.fillRect(0,0,width,height);ctx.setTransform(scale,0,0,scale,0,y);
   if(target==='warehouse'){ctx.clearRect(0,0,1080,1920);if(!cached||!api.drawCachedWarehouse(ctx,'day',undefined,'#0c131c',paint))paint(ctx);}
   else api.render(ctx,state,view,undefined,undefined,cached?'#0c131c':undefined);
  };
  frame();const expected=raw.getImageData(0,0,width,height).data;
  if(cached&&width===1080&&target==='fullFrame')await writeFile(resolve(out,'native-cached.png'),canvas.toBuffer('image/png'));
  if(!cached&&width===1080&&target==='fullFrame')await writeFile(resolve(out,'native-original.png'),canvas.toBuffer('image/png'));
  for(let i=0;i<12;i++){frame();raw.getImageData(0,0,width,height);}
  methods=0;properties=0;const previousPaints=paints;frame();const calls={methods,properties,paints:paints-previousPaints};raw.getImageData(0,0,width,height);
  const timings=[];for(let i=0;i<60;i++){const start=performance.now();frame();raw.getImageData(0,0,width,height);timings.push(performance.now()-start);}
  timings.sort((a,b)=>a-b);const pixels=raw.getImageData(0,0,width,height).data;
  let changed=0;for(let i=0;i<pixels.length;i++)if(pixels[i]!==expected[i])changed++;
  const row={width,height,target,cached,allocations,nativeSurfaceBytes:cached?width*height*4:0,calls,p50ms:timings[Math.floor(timings.length*.5)],p95ms:timings[Math.floor(timings.length*.95)],coldWarmDifferentChannels:changed};rows.push(row);console.log(JSON.stringify(row));
  api.configureWarehouseCache();
 }
}
await writeFile(resolve(out,'benchmark.json'),JSON.stringify({engine:'@napi-rs/canvas 1.0.10',method:'60 warmed render + synchronous full-pixel readback samples; CPU/native backend only, not device frame timing',rows},null,2));
