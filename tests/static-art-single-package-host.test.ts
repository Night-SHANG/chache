import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm,mkdir,cp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname,resolve} from 'node:path';
import {build} from 'esbuild';
import {STATIC_ART_RESOURCES} from '../src/presentation/static-art-manifest.ts';
import {COSMETIC_CATALOG} from '../src/application/cosmetics.ts';
import {cosmeticAccountStorage} from '../scripts/cosmetic-stage15-host-support.mjs';
import {createCanvas} from '@napi-rs/canvas';
import {createGrowthHost,createPackagedImageLoader} from '../scripts/growth-host-support.mjs';

test('the strict native host never injects a retired package API, even from obsolete options',async()=>{
 const root=await mkdtemp(join(tmpdir(),'warehouse-main-only-host-'));
 try{
  const bundlePath=join(root,'game.js');await writeFile(bundlePath,`
   if ('loadSubpackage' in wx) throw Error('Retired package API was injected');
   const canvas=wx.createCanvas();
   for(const hook of ['onTouchStart','onTouchMove','onTouchEnd','onTouchCancel','onHide','onShow'])wx[hook](()=>{});
   const paint=()=>{canvas.getContext('2d').fillText('Main package only',20,30);requestAnimationFrame(paint);};requestAnimationFrame(paint);
  `);
  const host=await createGrowthHost({bundlePath,loadSubpackage:()=>{throw Error('obsolete hook');}});host.frame(0);
  assert.equal(host.canvasCount,1);assert.ok(host.labels.some(row=>row.text==='Main package only'));
 }finally{await rm(root,{recursive:true,force:true});}
});

test('controlled main-image failure can recover on a fresh decode while preserving hashed PNG evidence',async()=>{
 const root=await mkdtemp(join(tmpdir(),'warehouse-main-image-retry-'));
 try{
  await writeFile(join(root,'scene.png'),createCanvas(4,3).toBuffer('image/png'));
  let unavailable=true,failed=0,loaded=0;const attempts:string[]=[];
  const loader=createPackagedImageLoader(root,{defer:true,rejectLoads:(source:string)=>{attempts.push(source);return unavailable;}});
  const first=loader.create();first.onerror=()=>{failed++;};first.src='scene.png';await loader.settle();
  assert.equal(failed,1);assert.equal(loader.trace[0].status,'error');assert.equal(loader.trace[0].injectedFailure,true);assert.match(loader.trace[0].sha256??'',/^[a-f0-9]{64}$/);
  unavailable=false;const retry=loader.create();retry.onload=()=>{loaded++;};retry.src='scene.png';await loader.settle();await loader.settle();
  assert.equal(loaded,1);assert.equal(failed,1);assert.equal(retry.width,4);assert.equal(retry.height,3);assert.deepEqual(attempts,['scene.png','scene.png']);
  assert.equal(loader.trace[1].status,'loaded');assert.equal(loader.trace[1].sha256,loader.trace[0].sha256);
 }finally{await rm(root,{recursive:true,force:true});}
});

test('active static-art verification exercises main-image retry and inline categories without retired routes',async()=>{
 const source=await readFile(new URL('../scripts/verify-static-art-host.mjs',import.meta.url),'utf8');
 assert.doesNotMatch(source,/loadSubpackage|getCosmeticSet|经典套装|preview-.*-card|不支持外观分包|['"]harbor['"]/);
 assert.match(source,/main-image-failure-explicit-retry/);assert.match(source,/cold_chain/);
 assert.match(source,/single-item-previews-and-return/);assert.match(source,/growthSourceHash/);
});

test('all three current entry bundles omit package APIs and the real native core-image gate recovers only on explicit retry',async()=>{
 const root=await mkdtemp(join(tmpdir(),'warehouse-three-platform-main-'));
 try{
  const app=JSON.parse(await readFile('package.json','utf8'));
  for(const platform of ['browser','wechat','android']){
   const bundlePath=join(root,platform,platform==='wechat'?'game.js':'app.js');
   await build({entryPoints:[`src/${platform}-main.ts`],outfile:bundlePath,bundle:true,format:'iife',platform:platform==='wechat'?'neutral':'browser',target:'es2018',minify:true,nodePaths:[resolve('android-shell/node_modules')],define:{__DEV_DIAGNOSTICS__:'false',__PLAYTEST_FREE_SHOP__:'false',__APP_VERSION__:JSON.stringify(app.version)}});
   assert.doesNotMatch(await readFile(bundlePath,'utf8'),/\bloadSubpackage\b|\bensureAssetPackage\b/,platform);
  }
  for(const resource of Object.values(STATIC_ART_RESOURCES)){const destination=join(root,'wechat',resource.src);await mkdir(dirname(destination),{recursive:true});await cp(resource.sourcePath,destination);}
  const storage=cosmeticAccountStorage({label:'FUNDED: isolated main-image retry regression',wallet:244,owned:COSMETIC_CATALOG.map(item=>item.key),cosmetics:{theme:'cold_chain',cargo:'classic',forklift:'yellow'}}),before=[...storage];
  let failed=true,attempts=0;const path='assets/static-art/scene-cold_chain.png';
  const host=await createGrowthHost({bundlePath:join(root,'wechat/game.js'),storage,deferImageLoads:true,rejectOffscreenCanvases:true,rejectImageLoads:(source:string)=>{if(source!==path)return false;attempts++;return failed;}}) as Awaited<ReturnType<typeof createGrowthHost>>&{tap(x:number,y:number):void};
  let time=0;const settle=async()=>{for(let i=0;i<6;i++){await host.settleImages();await Promise.resolve();}host.frame(time+=16);};
  host.frame(0);assert.ok(host.labels.some(row=>row.text==='正在加载画面资源'));await settle();
  assert.equal(attempts,1);assert.ok(host.labels.some(row=>row.text==='画面资源加载失败'));assert.ok(host.labels.some(row=>row.text==='重试加载'));
  host.tap(540,840);await settle();assert.equal(attempts,1);assert.deepEqual([...storage],before);
  failed=false;host.tap(540,1160);await settle();assert.equal(attempts,2);assert.ok(host.labels.some(row=>row.text==='商店'));assert.ok(!host.labels.some(row=>row.text==='画面资源加载失败'));
  const traces=host.imageTrace.filter(row=>row.source===path);assert.deepEqual(traces.map(row=>row.status),['error','loaded']);assert.equal(traces[0].sha256,traces[1].sha256);assert.equal(traces[0].injectedFailure,true);
  assert.deepEqual([...storage],before);assert.equal(host.canvasCount,1);
 }finally{await rm(root,{recursive:true,force:true});}
});
