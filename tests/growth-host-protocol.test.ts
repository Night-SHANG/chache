import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, readFile, writeFile, rm, mkdir, cp} from 'node:fs/promises';
import {join,dirname} from 'node:path';
import {build} from 'esbuild';
import {STATIC_ART_RESOURCES} from '../src/presentation/static-art-manifest.ts';
import {tmpdir} from 'node:os';
import {ACCOUNT_KEYS, encodeAccount} from '../src/application/account-store.ts';
import {makeAccountFixture} from './helpers/account-fixtures.ts';
import {verifyEvidenceBinding, validateResumeStorage, probeBuiltHost, createGrowthHost} from '../scripts/growth-host-support.mjs';

const ready=()=>{const account=makeAccountFixture({generation:1,lastOperation:{operationId:'fixture',expectedGeneration:0,requestDigest:'fixture',committedGeneration:1}}),raw=encodeAccount(account);return new Map([[ACCOUNT_KEYS.a,raw],[ACCOUNT_KEYS.b,raw]]);};

test('growth host requires both built-source and actual game byte hashes',()=>{
 const binding={sourceSha256:'a'.repeat(64),gameJsSha256:'b'.repeat(64),manifestSourceSha256:'a'.repeat(64)};
 assert.doesNotThrow(()=>verifyEvidenceBinding(binding));
 assert.throws(()=>verifyEvidenceBinding({...binding,manifestSourceSha256:'c'.repeat(64)}),/source/i);
 assert.throws(()=>verifyEvidenceBinding({...binding,gameJsSha256:'truncated'}),/hash/i);
 assert.throws(()=>verifyEvidenceBinding({...binding,expectedGameJsSha256:'d'.repeat(64)}),/game/i);
});

test('corrupt and disagreeing roots are rejected rather than declared valid fixtures',()=>{
 assert.equal(validateResumeStorage(ready()).status,'ready');
 const corrupt=ready();corrupt.set(ACCOUNT_KEYS.a,'{');corrupt.set(ACCOUNT_KEYS.b,'{');
 assert.throws(()=>validateResumeStorage(corrupt),/resume|fixture|account/i);
 const disagree=ready(),raw=JSON.parse(disagree.get(ACCOUNT_KEYS.a)!);raw.account.wallet=999;disagree.set(ACCOUNT_KEYS.a,JSON.stringify(raw));
 assert.throws(()=>validateResumeStorage(disagree),/resume|fixture|account/i);
});

test('actual VM exceptions and absent native callbacks are failing host evidence',async()=>{
 const folder=await mkdtemp(join(tmpdir(),'warehouse-growth-host-'));
 try{
  const file=join(folder,'failed-game.js');await writeFile(file,"throw new Error('intentional failed host fixture');");
  const failure=await probeBuiltHost({bundlePath:file});
  assert.equal(failure.status,'FAIL');assert.match(failure.error??'',/intentional failed host fixture/);assert.equal(failure.executedChecks,0);
  await writeFile(file,'globalThis.onlyAStub = true;');const stub=await probeBuiltHost({bundlePath:file});
  assert.equal(stub.status,'FAIL');assert.match(stub.error??'',/callback|canvas|frame/i);
 }finally{await rm(folder,{recursive:true,force:true});}
});

test('strict actual game host uses only its screen canvas and does not install compatibility globals',async()=>{
 const folder=await mkdtemp(join(tmpdir(),'warehouse-current-game-host-'));
 try{
  const bundlePath=join(folder,'game.js');
  await build({entryPoints:['src/wechat-main.ts'],outfile:bundlePath,bundle:true,format:'iife',platform:'neutral',target:'es2018',minify:true,define:{__DEV_DIAGNOSTICS__:'false',__PLAYTEST_FREE_SHOP__:'false',__APP_VERSION__:JSON.stringify('1.0.13')}});
  for(const resource of Object.values(STATIC_ART_RESOURCES)){const target=join(folder,resource.src);await mkdir(dirname(target),{recursive:true});await cp(resource.sourcePath,target);}
  const report=await probeBuiltHost({bundlePath});
  assert.equal(report.status,'PASS',report.error);assert.equal(report.canvasCount,1);
  const host=await createGrowthHost({bundlePath,deferImageLoads:true,rejectOffscreenCanvases:true}),screen=host.canvas;
  assert.equal(host.canvasCount,1,'screen is the first and only startup canvas');assert.equal(host.context,screen.getContext('2d'));assert.deepEqual(host.surfaceInfo,[]);
  host.frame(0);assert.equal(host.canvas,screen);assert.ok(host.labels.some(row=>row.text.includes('正在加载')));assert.equal(host.canvasCount,1);
  for(let n=0;n<5;n++)await host.settleImages();host.frame(16);
  assert.ok(host.imageTrace.length>0&&host.imageTrace.every(row=>row.status==='loaded'));
  assert.ok(!host.labels.some(row=>row.text.includes('正在加载')||row.text.includes('加载失败')));
  assert.deepEqual(host.surfaceInfo,[]);assert.equal(host.canvasCount,1,'ready frames never create a static offscreen layer');
  assert.deepEqual(report.extraGlobals,[]);assert.equal(report.executedChecks,1);
  const code=await readFile(bundlePath,'utf8');
  assert.equal(/\bstructuredClone\s*\(|new\s+TextEncoder\s*\(|\beval\s*\(|new\s+Function\s*\(/.test(code),false);
 }finally{await rm(folder,{recursive:true,force:true});}
});
