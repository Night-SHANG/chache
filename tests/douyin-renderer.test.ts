import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {mkdir,mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {build} from 'esbuild';
import {runInThisContext} from 'node:vm';
import {createCanvas,loadImage} from '@napi-rs/canvas';
import {createRun} from '../src/domain/engine.ts';
import {createProfile} from '../src/application/profile.ts';
import {STATIC_ART_RESOURCES} from '../src/presentation/static-art-manifest.ts';
import type {ViewState} from '../src/presentation/view-types.ts';
import type {Shipment} from '../src/domain/types.ts';
import type {Rect} from '../src/presentation/layout.ts';

const pluginUrl=new URL('../scripts/douyin-renderer-plugin.mjs',import.meta.url);
async function painters(douyin:boolean){
 if(douyin)assert.ok(existsSync(pluginUrl),'the isolated Douyin renderer build plugin must exist');
 const plugins=douyin?[(await import(pluginUrl.href)).douyinRendererPlugin()]:[];
 const result=await build({stdin:{contents:`export * from './src/presentation/assets.ts';export * from './src/presentation/board-entry-markers.ts';export * from './src/presentation/board-theme.ts';export * from './src/presentation/board-geometry.ts';export * from './src/presentation/cosmetic-art.ts';export * from './src/presentation/warehouse-art.ts';export * from './src/presentation/shop-art.ts';export * from './src/presentation/static-art-resources.ts';export * from './src/presentation/renderer.ts';export * from './src/presentation/color-exit-renderer.ts';export * from './src/presentation/outbound-transport.ts';${douyin?"export * from './src/presentation/douyin/bounded-painter.ts';export * from './src/presentation/douyin/primitives.ts';":''}`,resolveDir:process.cwd(),loader:'ts'},bundle:true,write:false,format:'cjs',platform:'neutral',target:'es2020',plugins,define:{__DEV_DIAGNOSTICS__:'false',__PLAYTEST_FREE_SHOP__:'false',__APP_VERSION__:'"test"'}});
 return runInThisContext(`(()=>{const module={exports:{}};const exports=module.exports;${result.outputFiles[0].text};return module.exports;})()`,{filename:douyin?'douyin-test-bundle.js':'original-test-bundle.js'});
}
const basePromise=painters(false);
let compatPromise:ReturnType<typeof painters>|undefined;
let scratchCreates=0;
const compat=()=>compatPromise??=(async()=>{const api=await painters(true);api.configureDouyinRendering(()=>{scratchCreates++;const canvas=createCanvas(1,1);canvas.getContext('2d').clip=()=>assert.fail('scratch used clip');return canvas;});return api;})();
function surface(w=400,h=300){const canvas=createCanvas(w,h),ctx=canvas.getContext('2d');return {canvas,ctx,context:ctx as unknown as CanvasRenderingContext2D};}
function difference(a:Uint8ClampedArray,b:Uint8ClampedArray){let total=0,max=0,changed=0;for(let i=0;i<a.length;i++){const d=Math.abs(a[i]-b[i]);total+=d;max=Math.max(max,d);if(d)changed++;}return {max,mean:total/a.length,changed};}
function assertBounded(pixels:Uint8ClampedArray,w:number,h:number,r:Rect){for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(x<Math.floor(r.x)||x>=Math.ceil(r.x+r.w)||y<Math.floor(r.y)||y>=Math.ceil(r.y+r.h))assert.equal(pixels[(y*w+x)*4+3],0,`spill at ${x},${y}`);}

test('bounded hazard polygons preserve the original horizontal and vertical stripes without clip',async()=>{
 const original=await basePromise,dy=await compat();
 for(const vertical of [false,true])for(const rect of [{x:23,y:27,w:320,h:15},{x:31,y:22,w:14,h:240},{x:22,y:35,w:112,h:87}]){
  const a=surface(),b=surface();b.ctx.clip=()=>{assert.fail('clip is unsupported');};
  original.hazard(a.context,rect,vertical);dy.hazard(b.context,rect,vertical);
  const p=a.ctx.getImageData(0,0,400,300).data,q=b.ctx.getImageData(0,0,400,300).data,d=difference(p,q);
  assert.ok(d.mean<.05&&d.max<=32,JSON.stringify(d));assertBounded(q,400,300,rect);
 }
});

test('cold material details on 7/8/9 boards are already inset inside their old clip',async()=>{
 const original=await basePromise,dy=await compat();
 for(const boardSize of [7,8,9])for(const theme of ['cold_chain','rail_freight','toy_workshop','paper_warehouse','space_cargo','steam_foundry','ocean_vault']){
  const a=surface(1080,1500),b=surface(1080,1500);b.ctx.clip=()=>assert.fail('cold board used clip');
  original.drawThemedBoard(a.context,original.boardGeometry({boardSize}),theme);dy.drawThemedBoard(b.context,dy.boardGeometry({boardSize}),theme);
  const d=difference(a.ctx.getImageData(0,0,1080,1500).data,b.ctx.getImageData(0,0,1080,1500).data);
  assert.ok(d.max<=2&&d.mean<.005,`${boardSize}/${theme}: ${JSON.stringify(d)}`);
 }
});

test('complex cold backgrounds and nested set previews use one explicit crop and never call clip',async()=>{
 const original=await basePromise,dy=await compat();
 for(const theme of ['harbor','cold_chain','rail_freight','toy_workshop','paper_warehouse','space_cargo','steam_foundry','ocean_vault']){
  for(const set of [false,true]){
   const a=surface(840,880),b=surface(840,880),rect={x:12,y:14,w:816,h:840};b.ctx.clip=()=>assert.fail('preview used clip');
   const options={category:'theme',theme,cargoStyle:'classic',forklift:'yellow'};
   if(set){original.drawCosmeticSetPreview(a.context,rect,options);dy.drawCosmeticSetPreview(b.context,rect,options);}
   else{original.drawLogisticsBackground(a.context,rect,theme);dy.drawLogisticsBackground(b.context,rect,theme);}
   const p=a.ctx.getImageData(0,0,840,880).data,q=b.ctx.getImageData(0,0,840,880).data,d=difference(p,q);
   assert.ok(d.mean<.15,`${theme}/${set}: ${JSON.stringify(d)}`);assertBounded(q,840,880,rect);
  }
 }
});

test('reserved entry stripes preserve all 7/8/9 markers without boundary spill',async()=>{
 const original=await basePromise,dy=await compat();
 for(const boardSize of [7,8,9]){
  const a=surface(1080,1500),b=surface(1080,1500);b.ctx.clip=()=>assert.fail('entry used clip');
  original.drawReservedEntryMarkers(a.context,original.boardGeometry({boardSize}),[0,4,14]);dy.drawReservedEntryMarkers(b.context,dy.boardGeometry({boardSize}),[0,4,14]);
  const d=difference(a.ctx.getImageData(0,0,1080,1500).data,b.ctx.getImageData(0,0,1080,1500).data);assert.ok(d.mean<.01,JSON.stringify(d));
 }
});

test('rounded press overlay keeps corners transparent and preserves the curved top band',async()=>{
 const original=await basePromise,dy=await compat();
 assert.equal(typeof dy.drawBoundedPressedOverlay,'function','bounded press painter must be implemented');
 for(const r of [{x:25,y:30,w:300,h:80},{x:25,y:30,w:140,h:48}]){
  const a=surface(),b=surface();a.ctx.save();original.roundedPath(a.context,r.x,r.y,r.w,r.h,Math.min(18,r.h/4));a.ctx.clip();
  a.ctx.fillStyle='rgba(5,12,20,.19)';a.ctx.fillRect(r.x,r.y,r.w,r.h);a.ctx.fillStyle='rgba(2,7,12,.25)';a.ctx.fillRect(r.x,r.y,r.w,6);a.ctx.fillStyle='rgba(255,244,208,.20)';a.ctx.fillRect(r.x+9,r.y+r.h-4,r.w-18,2);a.ctx.restore();
  dy.drawBoundedPressedOverlay(b.context,r,dy.roundedPath);
  const p=a.ctx.getImageData(0,0,400,300).data,q=b.ctx.getImageData(0,0,400,300).data,d=difference(p,q);
  assert.ok(d.mean<.03,JSON.stringify(d));assertBounded(q,400,300,r);assert.equal(q[(r.y*400+r.x)*4+3],0);
 }
});

test('cold warehouse finite frames preserve every active scene without clip',async()=>{
 const original=await basePromise,dy=await compat();
 for(const theme of ['day','night','cold_chain','rail_freight','toy_workshop','paper_warehouse','space_cargo','steam_foundry','ocean_vault']){
  const a=surface(1300,1920),b=surface(1300,1920),bounds={x:-20,y:0,w:1120,h:1920};
  a.ctx.translate(70,0);b.ctx.translate(70,0);b.ctx.clip=()=>assert.fail('warehouse used clip');
  original.drawWarehouse(a.context,{profile:{cosmetics:{theme}}},bounds);dy.drawWarehouse(b.context,{profile:{cosmetics:{theme}}},bounds);
  const d=difference(a.ctx.getImageData(0,0,1300,1920).data,b.ctx.getImageData(0,0,1300,1920).data);assert.ok(d.mean<.06,`${theme}: ${JSON.stringify(d)}`);
 }
});

test('the complete Douyin renderer bundle excludes unsupported clip and dash-offset paths',async()=>{
 const {douyinRendererPlugin}=await import(pluginUrl.href);
 const result=await build({entryPoints:['src/douyin-main.ts'],bundle:true,write:false,format:'iife',platform:'neutral',target:'es2018',plugins:[douyinRendererPlugin()],define:{__DEV_DIAGNOSTICS__:'false',__PLAYTEST_FREE_SHOP__:'false',__APP_VERSION__:'"test"'}});
 assert.equal(/\.clip\s*\(|\.lineDashOffset\s*=/.test(result.outputFiles[0].text),false,'bundle has no unsupported clipping path');
});

const evidence:Record<string,unknown>[]=[];
async function record(name:string,a:ReturnType<typeof surface>,b:ReturnType<typeof surface>,details:Record<string,unknown>={}){
 const p=a.ctx.getImageData(0,0,a.canvas.width,a.canvas.height).data,q=b.ctx.getImageData(0,0,b.canvas.width,b.canvas.height).data;
 const diff=difference(p,q);evidence.push({name,...diff,...details});
 const folder=process.env.DOUYIN_RENDER_EVIDENCE_DIR;
 if(folder){await mkdir(folder,{recursive:true});await writeFile(join(folder,`${name}-original.png`),a.canvas.toBuffer('image/png'));await writeFile(join(folder,`${name}-douyin.png`),b.canvas.toBuffer('image/png'));await writeFile(join(folder,'pixel-comparisons.json'),JSON.stringify({kind:'Node native Canvas contract only, not Douyin IDE/device',scratchCreates,evidence},null,2));}
 return diff;
}

test('decoded warm PNGs use exactly one direct image blit with no scratch work or allocation',async()=>{
 const original=await basePromise,dy=await compat();
 for(const api of [original,dy])api.configureStaticArt((path:string)=>loadImage(path));
 for(const theme of ['day','night','cold_chain','rail_freight','toy_workshop','paper_warehouse','space_cargo','steam_foundry','ocean_vault']){
  const requirements={scene:`scene.${theme}`,shared:[],previews:[]};
  for(const api of [original,dy])assert.equal((await api.prepareStaticArt(requirements)).status,'ready');
  for(const inset of [0,20]){
   const a=surface(1300,1920),b=surface(1300,1920),bounds={x:-inset,y:0,w:1080+inset*2,h:1920},creates=scratchCreates;
   a.ctx.translate(70,0);b.ctx.translate(70,0);const draw=b.ctx.drawImage.bind(b.ctx),images:unknown[]=[];
   b.ctx.drawImage=((...args:Parameters<typeof b.ctx.drawImage>)=>{images.push(args[0]);return draw(...args);}) as typeof b.ctx.drawImage;
   original.drawWarehouse(a.context,{profile:{cosmetics:{theme}}},bounds);dy.drawWarehouse(b.context,{profile:{cosmetics:{theme}}},bounds);
   assert.equal(images.length,1);assert.equal(images[0],dy.getStaticArtImage(`scene.${theme}`));assert.equal(scratchCreates,creates);
   const d=difference(a.ctx.getImageData(0,0,1300,1920).data,b.ctx.getImageData(0,0,1300,1920).data);assert.equal(d.changed,0,`${theme}/${inset}: direct source crop must be pixel-exact`);
   if(inset===20&&['day','cold_chain','paper_warehouse'].includes(theme))await record(`warm-warehouse-${theme}`,a,b,{directImageBlits:images.length});
  }
 }
});

const view=(patch:Partial<ViewState>={}):ViewState=>({selectedPieceId:null,hoverOrigin:null,preview:null,dragPoint:null,paused:false,message:'',saveStatus:'',elapsed:0,animation:null,debug:false,needsResume:false,profile:createProfile(),...patch});

test('rotated inbound/outbound transports retain doorway occlusion and unchanged gameplay state',async()=>{
 const original=await basePromise,dy=await compat();
 const shared=Object.keys(STATIC_ART_RESOURCES).filter(key=>!key.startsWith('scene.'));
 for(const api of [original,dy]){api.configureStaticArt((path:string)=>loadImage(path));assert.equal((await api.prepareStaticArt({scene:'scene.day',shared,previews:[]})).status,'ready');}
 for(const conveyor of [false,true])for(const side of ['north','east','west'] as const){
  const run=conveyor?createRun(7,'color_exit',8,'normal'):createRun(7,'standard',3);run.board.fill(null);
  const shipment:Shipment={type:'shipment',dockId:`dock.${side}`,orderId:'order.test',cargo:side==='east'?'cargo.chem':side==='west'?'cargo.machine':'cargo.food',cells:[11,18,25],path:side==='north'?[{x:3,y:0},{x:4,y:0}]:side==='east'?[{x:6,y:3},{x:5,y:3},{x:4,y:3}]:[{x:0,y:3},{x:1,y:3},{x:2,y:3}],score:300,chain:3,...(conveyor?{transport:'conveyor' as const}:{})};
  if(conveyor){
   const north=[{x:4,y:0},{x:4,y:1},{x:5,y:1},{x:5,y:2}],points=north.map(p=>side==='north'?p:side==='east'?{x:8-p.y,y:p.x}:{x:p.y,y:8-p.x});
   shipment.boardSize=9;shipment.cells=points.map(p=>p.y*9+p.x);shipment.cargoPaths=points.map((p,i)=>({cell:p.y*9+p.x,path:points.slice(0,i+1).reverse()}));
   const group=new Set(shipment.cells),queue=[76],parents=new Map([[76,-1]]);
   for(let cursor=0;cursor<queue.length;cursor++){
    const cell=queue[cursor],x=cell%9,y=Math.floor(cell/9),neighbors=[{x:x-1,y},{x:x+1,y},{x,y:y-1},{x,y:y+1}].filter(p=>p.x>=0&&p.x<9&&p.y>=0&&p.y<9).map(p=>p.y*9+p.x);
    if(neighbors.some(n=>group.has(n))){shipment.path=[];for(let at=cell;at!==-1;at=parents.get(at)!)shipment.path.push({x:at%9,y:Math.floor(at/9)});shipment.path.reverse();break;}
    for(const next of neighbors)if(!group.has(next)&&!parents.has(next)){parents.set(next,cell);queue.push(next);}
   }
  }
  for(const index of shipment.cells)run.board[index]=shipment.cargo;
  const plan=conveyor?original.buildOutboundTransport(shipment,run.board):undefined;
  if(conveyor)assert.ok(plan,'canonical test convoy has a transport plan');
  for(const progress of [.1,.105,.23,.36,.43,.5,.68,.85,.9,.97,1]){
   const current=view({animation:{shipment,progress,board:run.board.slice(),...(plan?{transportPlan:plan}:{})}}),before=JSON.stringify({run,current});
   const a=surface(1080,1920),b=surface(1080,1920);b.ctx.clip=()=>assert.fail('transport used clip');
   original.render(a.context,run,current);dy.render(b.context,run,current);
   assert.equal(JSON.stringify({run,current}),before,'compat cannot mutate game state or animation');
   const d=difference(a.ctx.getImageData(0,0,1080,1920).data,b.ctx.getImageData(0,0,1080,1920).data);
   assert.ok(d.mean<.10,`${conveyor}/${side}/${progress}: ${JSON.stringify(d)}`);
   const outsideTop=difference(a.ctx.getImageData(0,0,1080,510).data,b.ctx.getImageData(0,0,1080,510).data);
   assert.ok(outsideTop.mean<.01,'transport cannot leak over header/order UI');
   if(side==='north'&&[.105,.43,.9].includes(progress))await record(`${conveyor?'outbound':'inbound'}-${progress}`,a,b,{conveyor,side,progress});
  }
 }
});

test('source fingerprint rejects an upstream presentation edit before applying compat',async()=>{
 const {douyinRendererPlugin}=await import(pluginUrl.href),folder=await mkdtemp(join(tmpdir(),'douyin-source-guard-'));
 try{
  const source=await readFile('src/presentation/assets.ts','utf8'),path=join(folder,'assets.ts');await writeFile(path,source+'\n// upstream edit\n');
  let load:((args:{path:string})=>Promise<unknown>)|undefined;
  douyinRendererPlugin().setup({onLoad(_filter:unknown,callback:typeof load){load=callback;}});
  await assert.rejects(()=>load!({path}),/source fingerprint/);
 }finally{await rm(folder,{recursive:true,force:true});}
});
