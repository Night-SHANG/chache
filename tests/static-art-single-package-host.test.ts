import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm,mkdir,cp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname,resolve} from 'node:path';
import {build} from 'esbuild';
import {STATIC_ART_RESOURCES} from '../src/presentation/static-art-manifest.ts';
import {COSMETIC_CATALOG} from '../src/application/cosmetics.ts';
import {createCanvas} from '@napi-rs/canvas';
import {createGrowthHost,createPackagedImageLoader} from '../scripts/growth-host-support.mjs';
import {runV116PlatformTransitions} from '../scripts/v116-transition-trace.mjs';

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

test('active verification uses portable three-platform per-input and per-decode evidence',async()=>{
 const source=await readFile(new URL('../scripts/verify-static-art-host.mjs',import.meta.url),'utf8');
 const trace=await readFile(new URL('../scripts/v116-transition-trace.mjs',import.meta.url),'utf8');
 const host=await readFile(new URL('../scripts/v116-transition-host.mjs',import.meta.url),'utf8');
 assert.match(source,/runV116PlatformTransitions/);assert.match(source,/growthSourceHash/);
 assert.match(source,/\['browser','wechat','android'\]/);
 assert.match(trace,/main-image-failure-explicit-retry/);assert.match(trace,/target-scene-failure-retry/);
 assert.doesNotMatch(host,/\/workspace\/|__WAREHOUSE__|loadSubpackage|source\.replace/);
});

test('unchanged browser, WeChat and Android bundles render every active cold/hot selection and each PNG completion correctly',async()=>{
 const root=await mkdtemp(join(tmpdir(),'warehouse-v116-three-platform-'));
 try{
  const app=JSON.parse(await readFile('package.json','utf8'));
  for(const platform of ['browser','wechat','android']){
   const bundlePath=join(root,platform,platform==='wechat'?'game.js':'app.js');
   await build({entryPoints:[`src/${platform}-main.ts`],outfile:bundlePath,bundle:true,format:'iife',platform:platform==='wechat'?'neutral':'browser',target:'es2018',minify:true,nodePaths:[resolve('android-shell/node_modules')],define:{__DEV_DIAGNOSTICS__:'false',__PLAYTEST_FREE_SHOP__:'false',__APP_VERSION__:JSON.stringify(app.version)}});
   assert.doesNotMatch(await readFile(bundlePath,'utf8'),/\bloadSubpackage\b|\bensureAssetPackage\b/,platform);
   for(const resource of Object.values(STATIC_ART_RESOURCES)){const destination=join(root,platform,resource.src);await mkdir(dirname(destination),{recursive:true});await cp(resource.sourcePath,destination);}
   const result=await runV116PlatformTransitions({root,target:platform});
   assert.equal(result.visited.length,COSMETIC_CATALOG.length*2,platform);
   assert.equal(new Set(result.visited).size,58,platform);
   assert.ok(result.frames.some(frame=>frame.name.includes(':decode:')),platform);
   assert.ok(result.frames.some(frame=>frame.name.includes('equip:before-decode:up')),platform);
   assert.equal(result.cases.length,13,platform);
   assert.ok(result.cases.includes('second-page-equipped-first-entry-and-visit-reset'),platform);
   for(const kind of ['theme','cargo','forklift'])for(const state of ['cold','remembered-in-visit','reopened']){
    assert.ok(result.frames.some(frame=>frame.name===`first-page:${kind}:${state}:up`),`${platform} ${kind} ${state}`);
   }
   assert.ok(result.frames.length>=708,'Preserve all previous per-platform frame coverage');
  }
 }finally{await rm(root,{recursive:true,force:true});}
});
