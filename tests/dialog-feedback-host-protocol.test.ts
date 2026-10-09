import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {assertDialogBinding,assertDialogManifests,assertControlTone,assertCopyContract,assertNoStorageChanges,assertSingleCommit,assertSnapshotPair,EXACT_RUSH_SENTENCE,WILDCARD_LINES} from '../scripts/dialog-feedback-host-protocol.mjs';
import type {DialogBinding,Snapshot} from '../scripts/dialog-feedback-host-protocol.mjs';

const binding:DialogBinding={root:'/tmp/repo',ownerFrozen:true,aggregateChecksPassed:true,expectedCommit:'a'.repeat(40),expectedSourceSha256:'b'.repeat(64),expectedGameJsSha256:'c'.repeat(64),expectedBrowserJsSha256:'d'.repeat(64),expectedPaidGameJsSha256:'e'.repeat(64),expectedPaidBrowserJsSha256:'f'.repeat(64),freeBuildRoot:'/tmp/free',paidBuildRoot:'/tmp/paid',expectedVersion:'0.18.0-dev',expectedCatalogSize:28,artScope:{status:'unchanged',styles:[]}};
const manifest={version:binding.expectedVersion,commit:binding.expectedCommit,sourceSha256:binding.expectedSourceSha256,developerDiagnostics:false,shopPricingMode:'playtest-free',cosmetics:{catalogSize:28},modes:{rush:{maxToolTypes:2}}};
const snapshot:Snapshot={commit:binding.expectedCommit,sourceSha256:binding.expectedSourceSha256,gameJsSha256:binding.expectedGameJsSha256,browserJsSha256:binding.expectedBrowserJsSha256,paidGameJsSha256:binding.expectedPaidGameJsSha256,paidBrowserJsSha256:binding.expectedPaidBrowserJsSha256};

test('v18 acceptance needs a freeze, all six exact hashes, separate builds and an explicit art disposition',()=>{
 assertDialogBinding(binding);
 for(const patch of [{ownerFrozen:false},{aggregateChecksPassed:false},{expectedPaidBrowserJsSha256:''},{expectedCommit:'a'.repeat(7)},{paidBuildRoot:binding.freeBuildRoot},{artScope:{status:'pending',styles:[]}}])assert.throws(()=>assertDialogBinding({...binding,...patch}));
 assert.throws(()=>assertDialogBinding({...binding,artScope:{status:'approved',styles:[]}}));
});
test('v18 manifests bind version, source, policy and reviewed catalog count without inheriting v17 catalog assumptions',()=>{
 assertDialogManifests(manifest,structuredClone(manifest),binding,'free');
 for(const patch of [{version:'0.17.0-dev'},{shopPricingMode:'paid'},{sourceSha256:'0'.repeat(64)},{cosmetics:{catalogSize:29}}])assert.throws(()=>assertDialogManifests({...manifest,...patch},{...manifest,...patch},binding,'free'));
 assertDialogManifests({...manifest,shopPricingMode:'paid'},{...manifest,shopPricingMode:'paid'},binding,'paid');
});
test('independent control colors reject swapped confirmation, missing disabled state and gray masquerading as blue',()=>{
 const yellow=[[251,217,121,255],[248,211,116,255]],blue=[[59,80,104,255],[57,77,101,255]],neutral=[[51,63,75,255],[50,62,74,255]];
 assertControlTone(yellow,'primary');assertControlTone(blue,'secondary');assertControlTone(neutral,'disabled');
 assert.throws(()=>assertControlTone(blue,'primary'));assert.throws(()=>assertControlTone(yellow,'secondary'));assert.throws(()=>assertControlTone(blue,'disabled'));assert.throws(()=>assertControlTone(neutral,'secondary'));assert.throws(()=>assertControlTone([],'primary'));
});
test('copy contract joins wrapped paint, preserves both exact wildcard lines and rejects old visible waste terms',()=>{
 const lines=['废弃箱',EXACT_RUSH_SENTENCE,...WILDCARD_LINES];assertCopyContract(lines,{required:lines});
 assertCopyContract(['加急数字按后续成功放置次数倒数，','不是倒计时'],{required:[EXACT_RUSH_SENTENCE]});
 for(const obsolete of ['废物','废弃物','垃圾箱','垃圾'])assert.throws(()=>assertCopyContract([...lines,`清除${obsolete}`],{required:lines}));
 for(const missing of WILDCARD_LINES)assert.throws(()=>assertCopyContract(lines.filter(s=>s!==missing),{required:lines}));
 assert.throws(()=>assertCopyContract(['入库下次放置时检查出货；出库立即检查出货。'],{forbidden:['入库下次放置时检查出货；出库立即检查出货。']}));
});
test('cancel checks reject byte changes as well as writes which restore the original value',()=>{
 const before={entries:[['root','value']],writeCount:2};assertNoStorageChanges(before,{entries:[['root','value']],writeCount:2});
 assert.throws(()=>assertNoStorageChanges(before,{entries:[['root','value']],writeCount:3}));
 assert.throws(()=>assertNoStorageChanges(before,{entries:[['root','changed']],writeCount:2}));
});
test('confirmation observes exactly one account generation and a stable repeated pointer/frame result',()=>{
 const before={generation:4,wallet:80,inventory:{rotate:0}},after={generation:5,wallet:0,inventory:{rotate:1}};assertSingleCommit(before,after,structuredClone(after));
 assert.throws(()=>assertSingleCommit(before,{...after,generation:6},{...after,generation:6}));
 assert.throws(()=>assertSingleCommit(before,after,{...after,inventory:{rotate:2}}));
});
test('end evidence fails if current source, either package or HEAD changed after the first observation',()=>{
 assertSnapshotPair(snapshot,structuredClone(snapshot),binding);
 for(const key of Object.keys(snapshot) as (keyof Snapshot)[]){const changed={...snapshot,[key]:'0'.repeat(key==='commit'?40:64)};assert.throws(()=>assertSnapshotPair(snapshot,changed,binding));assert.throws(()=>assertSnapshotPair(changed,changed,binding));}
});
test('approved native atlas binds all four real PNG copies and exactly the reviewed ice identity',()=>{
 const approved={...binding,expectedAtlasSha256:'1'.repeat(64),expectedCatalogSize:29,artScope:{status:'approved',styles:['wood','reinforced','ice_crystal']}};assertDialogBinding(approved);
 assert.throws(()=>assertDialogBinding({...approved,artScope:{status:'approved',styles:['wood','reinforced','insulated']}}));assert.throws(()=>assertDialogBinding({...approved,expectedAtlasSha256:undefined}));
 const cargoAtlas={src:'assets/cargo-materials.png',sha256:approved.expectedAtlasSha256,bytes:10,width:1680,height:1008,tileSize:336,padding:3,bodySize:330,styles:['wood','reinforced','ice_crystal'],cargos:['cargo.food','cargo.machine','cargo.chem','cargo.electronic','cargo.cold']},actual={...manifest,cosmetics:{catalogSize:29},cargoAtlas};assertDialogManifests(actual,structuredClone(actual),approved,'free');
 const wrong={...actual,cargoAtlas:{...cargoAtlas,width:1}};assert.throws(()=>assertDialogManifests(wrong,structuredClone(wrong),approved,'free'));
 const hashes={...snapshot,freeWechatAtlasSha256:approved.expectedAtlasSha256,freeBrowserAtlasSha256:approved.expectedAtlasSha256,paidWechatAtlasSha256:approved.expectedAtlasSha256,paidBrowserAtlasSha256:approved.expectedAtlasSha256};assertSnapshotPair(hashes,structuredClone(hashes),approved);
 for(const field of ['freeWechatAtlasSha256','freeBrowserAtlasSha256','paidWechatAtlasSha256','paidBrowserAtlasSha256'])assert.throws(()=>assertSnapshotPair(hashes,{...hashes,[field]:'0'.repeat(64)},approved));
});
test('runner rejects a different checkout before importing product or looking for bundles',async()=>{
 const root=await mkdtemp(join(tmpdir(),'warehouse-wrong-root-'));
 try{const file=join(root,'binding.json');await writeFile(file,JSON.stringify({...binding,root}));const result=spawnSync(process.execPath,['scripts/host-dialog-feedback.mjs','--binding',file],{encoding:'utf8'});assert.equal(result.status,1);assert.match(result.stderr,/Owner root must be the checkout/);assert.doesNotMatch(result.stderr,/ENOENT|game\.js/);}
 finally{await rm(root,{recursive:true,force:true});}
});
