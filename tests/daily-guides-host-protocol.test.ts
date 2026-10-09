import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import * as support from '../scripts/daily-guides-host-support.mjs';
import {createPractice,applyPracticeCommand,practiceOverlay} from '../src/application/tutorial-practice.ts';
import {createPlayableRun,applyPlayableCommand,playableChecksum} from '../src/domain/playable.ts';
import type {GameCommand} from '../src/domain/playable.ts';
import {validateResumeStorage} from '../scripts/growth-host-support.mjs';
import {runDailyGuidesHostQA,hostControlPaintLabels,practiceAnimationExitTarget,hostGuidePaintText,chooseHostClearablePlacement,hostRecoveryView} from '../scripts/host-daily-guides.mjs';
import {getUiControls} from '../src/presentation/ui.ts';

const binding=()=>({commit:'a'.repeat(40),expectedCommit:'a'.repeat(40),sourceSha256:'b'.repeat(64),expectedSourceSha256:'b'.repeat(64),manifestSourceSha256:'b'.repeat(64),gameJsSha256:'c'.repeat(64),expectedGameJsSha256:'c'.repeat(64)});
test('daily guide host rejects every incomplete or mismatched owner binding',()=>{
 assert.doesNotThrow(()=>support.verifyDailyGuidesBinding(binding()));
 for(const key of Object.keys(binding()) as (keyof ReturnType<typeof binding>)[]){
  assert.throws(()=>support.verifyDailyGuidesBinding({...binding(),[key]:''}),/hash|commit|source|game/i);
  assert.throws(()=>support.verifyDailyGuidesBinding({...binding(),[key]:'d'.repeat(key.toLowerCase().includes('commit')?40:64)}),/commit|source|game/i);
 }
});
test('zero-write evidence rejects identical-byte rewrites and mutations of any storage key',()=>{
 const host={storage:new Map([['root','unchanged'],['history','old']]),operations:[] as {kind:string;key:string}[]},before=support.snapshotStorage(host);
 assert.doesNotThrow(()=>support.assertZeroWrites(host,before));host.operations.push({kind:'set',key:'root'});
 assert.throws(()=>support.assertZeroWrites(host,before),/write/i);host.operations.length=0;host.storage.set('history','changed');
 assert.throws(()=>support.assertZeroWrites(host,before),/byte/i);
});
test('pre-tier daily trace rebinds current normal metadata and validates commands and terminal gameplay',async()=>{
 const raw=JSON.parse(await readFile('artifacts/v0120-host-scenarios/daily-real-date.json','utf8'));
 const current=support.rebindDailyScenario(raw);assert.equal(current.state.inboundDifficulty,'normal');assert.equal(current.state.result,'won');assert.equal(current.commands.length,63);
 assert.equal(current.expectedModelChecksum,playableChecksum(current.state));assert.equal(current.firstRush,27);assert.equal(current.firstTick,28);
 assert.throws(()=>support.rebindDailyScenario({...raw,seed:1}),/seed|date|command/i);
 assert.throws(()=>support.rebindDailyScenario({...raw,score:raw.score+1}),/score/i);
 assert.throws(()=>support.rebindDailyScenario({...raw,commands:raw.commands.slice(0,-1)}),/terminal|result|orders/i);
});
test('practice evidence labels pure checksums expected only and requires observed pixel witnesses',()=>{
 const p=createPractice('daily'),evidence=support.practiceEvidence(p,{labels:['教学练习 · 不计金币和成绩'],cellPixels:[{cell:0,sha256:'a'.repeat(64)}],byteWrites:0});
 assert.equal(evidence.expectedModel.checksum,playableChecksum(p.state));assert.equal(evidence.observed.source,'unmodified-bundle-canvas-and-storage');
 assert.equal('checksum' in evidence.observed,false);assert.equal('internalState' in evidence.observed,false);
 assert.throws(()=>support.practiceEvidence(p,{labels:[],cellPixels:[],byteWrites:0}),/label|pixel/i);
 assert.throws(()=>support.practiceEvidence(p,{labels:['教学练习 · 不计金币和成绩'],cellPixels:[{cell:0,sha256:'a'.repeat(64)}],byteWrites:1}),/write/i);
});
test('both daily practice branches yield exact expected-model countdown, cleanup and completion',()=>{
 for(const branch of ['orders','placements'] as const){let p=createPractice('daily');const clock:number[]=[];p=applyPracticeCommand(p,{type:'chooseCleanup',branch}).practice;
  for(let step=0;step<6;step++){const command=practiceOverlay(p)?.expectedCommand;assert.ok(command);const result=applyPracticeCommand(p,command);assert.equal(result.error,undefined);p=result.practice;const trait='cellTraits' in p.state?p.state.cellTraits?.[0]:null;if(trait?.kind==='rush'&&trait.remaining!==undefined)clock.push(trait.remaining);}
  assert.deepEqual(clock,[3,2,1]);assert.equal(p.completed,true);assert.equal(p.state.score,215);assert.equal(p.state.board[0],null);assert.equal('cellTraits' in p.state&&p.state.cellTraits?.[1]?.kind,'waste');
 }
});
test('actual-host new controls stay 44 CSS pixels and reject overlaps with tray or modal controls',()=>{
 const viewport={w:360,h:800,safe:24,dpr:2},controls=[{rect:{x:210,y:1420,w:660,h:144},action:{type:'skipTutorial'}}];
 assert.doesNotThrow(()=>support.assertNewControlGeometry(controls,viewport,[]));
 assert.throws(()=>support.assertNewControlGeometry([{rect:{x:210,y:1420,w:660,h:60},action:{type:'skipTutorial'}}],viewport,[]),/44/);
 assert.throws(()=>support.assertNewControlGeometry(controls,viewport,[{x:210,y:1420,w:100,h:100}]),/overlap/i);
});
test('first failed report is preserved while later diagnostics stay separately reviewable',async()=>{
 const out=await mkdtemp(join(tmpdir(),'daily-guides-protocol-'));try{await support.writeHostReport(out,{status:'FAIL',error:'first root cause'});await support.writeHostReport(out,{status:'FAIL',error:'second root cause'});assert.equal(JSON.parse(await readFile(join(out,'first-failure.json'),'utf8')).error,'first root cause');assert.equal(JSON.parse(await readFile(join(out,'report.json'),'utf8')).error,'second root cause');}finally{await rm(out,{recursive:true,force:true});}
});
test('tier trace rebinding validates approved gameplay paths before native resume fixture use',async()=>{
 for(const [id,tier] of [['A-greedy-s1','normal'],['C-greedy-s15','hard'],['B-greedy-s21','expert']] as const){const raw=JSON.parse(await readFile(`artifacts/v0120-order-quantity-study/cases/${id}.json`,'utf8')),r=support.rebindTierScenario(raw,tier);let state=createPlayableRun(r.spec);for(const command of r.commands){const result=applyPlayableCommand(state,command as GameCommand);assert.equal(result.error,undefined);state=result.state;}assert.equal(state.result,'won');assert.equal(playableChecksum(state),r.expectedModelChecksum);assert.throws(()=>support.rebindTierScenario({...raw,experimentalState:{...raw.experimentalState,score:-1}},tier),/state|gameplay/i);}
});
test('strict current-tier resume fixtures retain formal identity and cannot forge daily start or unlabeled geometry',()=>{
 const spec={family:'inbound' as const,mode:'standard' as const,rulesetVersion:16 as const,seed:15,guided:false,inboundDifficulty:'hard' as const,toolCharges:{rotate:0 as const,clear:0 as const,wildcard:0 as const}};
 const storage=support.dailyGuidesResumeStorage(spec),account=validateResumeStorage(storage).account!;assert.equal(account.run?.identity.inboundDifficulty,'hard');assert.equal(account.formatVersion,4);
 assert.throws(()=>support.dailyGuidesResumeStorage({...spec,mode:'daily'}),/Daily.*real/i);
 assert.throws(()=>support.dailyGuidesResumeStorage(spec,[],{constructedState:createPlayableRun(spec)}),/CONSTRUCTED/);
});
test('actual daily host entry refuses missing binding before any bundle execution',async()=>{
 const out=await mkdtemp(join(tmpdir(),'daily-guides-entry-'));try{await assert.rejects(runDailyGuidesHostQA({out}),/hash|commit/);const report=JSON.parse(await readFile(join(out,'first-failure.json'),'utf8'));assert.equal(report.executedScenarios,0);assert.equal(report.status,'FAIL');}finally{await rm(out,{recursive:true,force:true});}
});
test('host cleanup oracle checks individual painted lines rather than its combined accessible label',()=>{
 const control={label:'定期清扫 · 每成功放置6次，清除1格废弃箱',action:{type:'chooseCleanup',branch:'placements'}};
 assert.deepEqual(hostControlPaintLabels(control,16),['定期清扫','每成功放置6次，','清除1格废弃箱']);
 assert.deepEqual(hostControlPaintLabels(control,15),['定期清扫','每放置6次，','清除1格废弃箱']);
 assert.deepEqual(hostControlPaintLabels({...control,action:{type:'chooseCleanup',branch:'orders'}},16),['按单清扫','每完成2单，','清除1格废弃箱']);
 assert.deepEqual(hostControlPaintLabels({label:'300金币 · 购买',action:{type:'purchaseCosmetic'}},16),['300金币','购买']);
});
test('historical practice animation probe cannot target removed current practice exits',()=>{
 for(const kind of ['outbound','daily'] as const){let p=createPractice(kind);if(kind==='daily')p=applyPracticeCommand(p,{type:'chooseCleanup',branch:'orders'}).practice;while(!p.completed){const command=practiceOverlay(p)?.expectedCommand;assert.ok(command);const result=applyPracticeCommand(p,command);p=result.practice;if(result.events.some(e=>e.type==='shipment'))break;}
  assert.equal(p.completed,kind==='outbound');assert.deepEqual(practiceAnimationExitTarget(p,true),null);assert.deepEqual(practiceAnimationExitTarget(p,false),null);
 }
});
test('transient animation capture excludes the next settled guide while preserving its later paint check',()=>{
 let p=createPractice('daily');p=applyPracticeCommand(p,{type:'chooseCleanup',branch:'orders'}).practice;for(let n=0;n<5;n++){const command=practiceOverlay(p)?.expectedCommand;assert.ok(command);p=applyPracticeCommand(p,command).practice;}
 const view={guide:practiceOverlay(p),screen:'game',paused:false};assert.equal(hostGuidePaintText(view,p.state,false),'再出一单，按单清扫旧废物');assert.equal(hostGuidePaintText(view,p.state,true),null);
});
test('tool witness selection skips a first legal move that immediately ships all cargo',()=>{
 let state=createPlayableRun({family:'inbound',mode:'endless',rulesetVersion:16,seed:2643966282,guided:false,inboundDifficulty:'normal',toolCharges:{rotate:1,clear:1,wildcard:0}});const piece=state.candidates.find(p=>!applyPlayableCommand(state,{type:'rotate',pieceId:p.id,quarterTurns:1}).error);assert.ok(piece);state=applyPlayableCommand(state,{type:'rotate',pieceId:piece.id,quarterTurns:1}).state;const before=structuredClone(state),move=chooseHostClearablePlacement(state);assert.ok(move);const placed=applyPlayableCommand(state,{type:'place',...move});assert.equal(placed.error,undefined);assert.ok(placed.state.board.some(cell=>cell!==null));assert.deepEqual(state,before);
});
test('unknown-account host projection uses normal save-retry UI without inventing a writer-lease reason',()=>{
 const projected=hostRecoveryView('unknown');assert.equal(projected.accountBlocked,true);assert.equal('readOnlyReason' in projected,false);const state=createPractice('inbound').state,controls=getUiControls(state,{...projected,selectedPieceId:null,hoverOrigin:null,preview:null,dragPoint:null,paused:false,message:'',saveStatus:'',elapsed:0,animation:null,debug:false,needsResume:false});assert.equal(controls[0].label,'重试');assert.equal(hostRecoveryView('ready').accountBlocked,false);
});
