import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,symlink,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,join} from 'node:path';
import {spawnSync} from 'node:child_process';

test('formal v1.0.16 production artifacts are paid, non-debug and carry the release version',async()=>{
 const root=process.cwd(),dir=await mkdtemp(join(tmpdir(),'warehouse-formal-build-'));
 try{
  for(const path of ['src','scripts','assets','node_modules','package.json','package-lock.json','THIRD_PARTY_NOTICES.md'])await symlink(resolve(root,path),join(dir,path));
  const built=spawnSync(process.execPath,[resolve(root,'scripts/build.mjs'),'--production'],{cwd:dir,encoding:'utf8'});
  assert.equal(built.status,0,built.stdout+built.stderr);
  const manifest=JSON.parse(await readFile(join(dir,'build/browser/build-manifest.json'),'utf8'));
  assert.equal(manifest.version,'1.0.16');
  const html=await readFile(join(dir,'build/browser/index.html'),'utf8');
  assert.match(html,/<title>货箱最后一格<\/title>/);assert.match(html,/aria-label="货箱最后一格。/);
  assert.equal(manifest.uiClick.assetGain,1);assert.equal(manifest.uiClick.playbackGain,0.2428740327036814);assert.equal(manifest.uiClick.effectiveTargetPeak,0.24);
  assert.equal(manifest.shopPricingMode,'paid');assert.equal(manifest.developerDiagnostics,false);
  const wechat=JSON.parse(await readFile(join(dir,'build/wechat/build-manifest.json'),'utf8'));
  assert.deepEqual(manifest.soundEffects,{browserVolume:0.45,wechatVolume:1});
  assert.deepEqual(wechat.soundEffects,{browserVolume:0.45,wechatVolume:1,wechatAdditionalAssetGainDb:2,wechatBoostedCues:['place','route_ready','forklift','ship','chain2','chain3','chain4','shift']});
  assert.deepEqual(manifest.placeSound,{src:'assets/place.wav',assetGain:10**(2/20),gainDb:2});
  assert.deepEqual(wechat.placeSound,{src:'assets/place.wav',assetGain:10**(2/20)*10**(2/20),gainDb:4});
  assert.deepEqual({...wechat,placeSound:manifest.placeSound,soundEffects:manifest.soundEffects},manifest);
  for(const args of [['--production','--playtest-free-shop'],['--production','--diagnostics']]){
   const denied=spawnSync(process.execPath,[resolve(root,'scripts/build.mjs'),...args],{cwd:dir,encoding:'utf8'});
   assert.notEqual(denied.status,0);assert.match(denied.stderr,/Production builds cannot enable/);
  }
 }finally{await rm(dir,{recursive:true,force:true});}
});
