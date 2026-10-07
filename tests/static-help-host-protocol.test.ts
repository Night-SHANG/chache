import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {verifyStaticHelpBinding,staticHelpPaintLabels,assertStaticHelpGeometry,assertStaticHelpUnchanged,chooseNonAuthoredPlacement,replayUnlockPrefixes,writeStaticHelpReport,runStaticHelpHostQA,staticHelpResumeStorage,rebindWinningTier18Trace,constructedDaily18Boundary,isStaticHelpGridFill,staticHelpDiagramPaintLabels,selectHostRetirementControl} from '../scripts/host-static-help.mjs';
import {snapshotStorage} from '../scripts/daily-guides-host-support.mjs';
import {createPlayableRun,applyPlayableCommand} from '../src/domain/playable.ts';
import {INBOUND_GUIDE_V16} from '../src/application/inbound-guide-v16.ts';
import {validateResumeStorage} from '../scripts/growth-host-support.mjs';
import {localDailyChallenge} from '../src/application/profile.ts';
import {getUiControls} from '../src/presentation/ui.ts';
import {createCanvas} from '@napi-rs/canvas';
import {attachPixelWitness,assertTextPaint} from '../scripts/refinement-host-support.mjs';

const pausedView={screen:'game' as const,paused:true,selectedPieceId:null,hoverOrigin:null,preview:null,dragPoint:null,message:'',saveStatus:'',elapsed:0,animation:null,debug:false,needsResume:false};
const binding=()=>({commit:'a'.repeat(40),expectedCommit:'a'.repeat(40),sourceSha256:'b'.repeat(64),expectedSourceSha256:'b'.repeat(64),manifestSourceSha256:'b'.repeat(64),gameJsSha256:'c'.repeat(64),expectedGameJsSha256:'c'.repeat(64)});
test('diagram witness accepts actual grid colors and ignores gradient/pattern fill objects',()=>{assert.equal(isStaticHelpGridFill('#56636a'),true);assert.equal(isStaticHelpGridFill('#56636A'),true);for(const fill of ['#ffffff',{addColorStop(){}},{setTransform(){}},null,undefined])assert.equal(isStaticHelpGridFill(fill),false);});
test('current inbound hardC diagram requires four items and outbound retains its four-food two-machine witness',()=>{assert.equal(staticHelpDiagramPaintLabels('inbound')[0],'食品 4/4件');assert.ok(staticHelpDiagramPaintLabels('outbound').includes('食品4件出货'));assert.ok(staticHelpDiagramPaintLabels('outbound').includes('机械2件留下'));});
test('host retirement follows the actual current18 overtime/endless action rather than an inherited fixed action',async()=>{for(const [id,tier] of [['C-greedy-s15','hard'],['B-greedy-s21','expert']] as const){const p=rebindWinningTier18Trace(JSON.parse(await readFile(`artifacts/v0120-order-quantity-study/cases/${id}.json`,'utf8')),tier),overtime=applyPlayableCommand(p.state,{type:'continueOvertime'}).state;assert.equal(selectHostRetirementControl(getUiControls(overtime,pausedView)).action.type,'finishOvertime');const endless=createPlayableRun({...p.spec,mode:'endless'});assert.equal(selectHostRetirementControl(getUiControls(endless,pausedView)).action.type,'finishEndless');}assert.throws(()=>selectHostRetirementControl([{action:{type:'home'}}]),/settlement/i);});
test('pixel witness requires a fresh enabled observation after any disabled action frame',()=>{const canvas=createCanvas(80,40),context=canvas.getContext('2d'),host=attachPixelWitness({canvas,context,pixelWitness:{enabled:true,glyphs:[]},frame:()=>{context.fillStyle='#000';context.fillRect(0,0,80,40);context.fillStyle='#fff';context.font='16px sans-serif';context.fillText('locked',2,25);}});host.frame();assert.doesNotThrow(()=>assertTextPaint(host,'locked'));host.pixelWitness.enabled=false;host.frame();assert.throws(()=>assertTextPaint(host,'locked'),/Missing painted/);host.pixelWitness.enabled=true;host.frame();assert.doesNotThrow(()=>assertTextPaint(host,'locked'));});
test('static help main run requires the exact complete owner commit, source and bundle binding',()=>{
 assert.doesNotThrow(()=>verifyStaticHelpBinding(binding()));
 for(const key of Object.keys(binding()) as (keyof ReturnType<typeof binding>)[]){assert.throws(()=>verifyStaticHelpBinding({...binding(),[key]:''}),/hash|commit|source|game/i);assert.throws(()=>verifyStaticHelpBinding({...binding(),[key]:'d'.repeat(key.toLowerCase().includes('commit')?40:64)}),/commit|source|game/i);}
});
test('help controls use printed lines, including current successful-placement cleanup text',()=>{
 assert.deepEqual(staticHelpPaintLabels({label:'入库模式\n按订单配货',action:{type:'chooseInbound'}},16),['入库模式','按订单配货']);
 for(const rules of [16,18])assert.deepEqual(staticHelpPaintLabels({label:'定期清扫 · 每成功放置6次，清除1格废弃物',action:{type:'chooseCleanup',branch:'placements'}},rules),['定期清扫','每成功放置6次，','清除1格废弃物']);
 assert.deepEqual(staticHelpPaintLabels({label:'特殊货物与工具',action:{type:'helpDetails'}},16),['特殊货物与工具']);
});
test('new home help controls meet 44 CSS pixels and have no overlapping touch regions at every target size',()=>{
 const controls=[{rect:{x:210,y:752,w:660,h:144},action:{type:'selectHelp'}},{rect:{x:210,y:990,w:660,h:144},action:{type:'selectHelp'}}];
 for(const viewport of [{w:360,h:800,safe:24,dpr:2},{w:540,h:960},{w:1200,h:900}])assert.doesNotThrow(()=>assertStaticHelpGeometry(controls,viewport,true));
 assert.throws(()=>assertStaticHelpGeometry([{...controls[0],rect:{...controls[0].rect,h:60}}],{w:360,h:800,safe:24},true),/44/);
 assert.throws(()=>assertStaticHelpGeometry([controls[0],{...controls[1],rect:controls[0].rect}],{w:540,h:960},true),/overlap/i);
});
test('read-only help evidence rejects changed gameplay, any key mutation and identical-byte rewrites',()=>{
 const host={storage:new Map([['root','same'],['history','retained']]),operations:[] as {kind:string;key:string}[]},before=snapshotStorage(host),state={rngState:[1,2],wallet:0};
 assert.doesNotThrow(()=>assertStaticHelpUnchanged(host,before,state,state));
 assert.throws(()=>assertStaticHelpUnchanged(host,before,state,{...state,rngState:[2,3]}),/state|gameplay/i);
 host.operations.push({kind:'set',key:'root'});assert.throws(()=>assertStaticHelpUnchanged(host,before,state,state),/write/i);
 host.operations.length=0;host.storage.set('history','changed');assert.throws(()=>assertStaticHelpUnchanged(host,before,state,state),/byte/i);
});
test('restored guided16 witness selects a legal nonauthored placement and validates it before touch',()=>{
 const state=createPlayableRun({family:'inbound',mode:'standard',rulesetVersion:16,seed:1,guided:true,inboundDifficulty:'normal',toolCharges:{rotate:0,clear:0,wildcard:0}}),before=structuredClone(state),move=chooseNonAuthoredPlacement(state);
 assert.ok(move);assert.notDeepEqual({type:'place',...move},INBOUND_GUIDE_V16.commands[0]);assert.equal(applyPlayableCommand(state,{type:'place',...move}).error,undefined);assert.deepEqual(state,before);
});
test('third and fourth door fixtures use validated existing replay commands and genuine unlock crossings',async()=>{
 const raw=JSON.parse(await readFile('artifacts/v0120-order-quantity-study/cases/C-greedy-s15.json','utf8')),proof=replayUnlockPrefixes(raw);
 assert.equal(proof.initial.orders.length,2);assert.equal(proof.crossings.length,2);
 assert.deepEqual(proof.crossings.map(c=>c.after.orders.length),[3,4]);
 for(const row of proof.crossings){assert.equal(row.before.orders.length,row.after.orders.length-1);assert.equal(row.commands.length,row.before.commandIndex);assert.equal(applyPlayableCommand(row.before,row.next).error,undefined);}
 assert.throws(()=>replayUnlockPrefixes({...raw,commands:[{type:'place',pieceId:'missing',origin:{x:0,y:0}}]}),/replay|command|unlock/i);
});
test('strict18 resume fixture preserves hard/expert identity and raw/display scoring while historical16 stays16',()=>{
 for(const tier of ['hard','expert'] as const){const storage=staticHelpResumeStorage({family:'inbound',mode:'endless',rulesetVersion:18,seed:15,inboundDifficulty:tier,guided:false,toolCharges:{rotate:0,clear:0,wildcard:0}}),a=validateResumeStorage(storage).account!;assert.equal(a.run?.identity.rulesetVersion,18);assert.equal(a.run?.identity.inboundDifficulty,tier);assert.equal(a.run?.identity.runConfigId,`run.inbound_v18.${tier}`);assert.equal('rawScore' in a.run!.state,true);}
 const old=validateResumeStorage(staticHelpResumeStorage({family:'inbound',mode:'standard',rulesetVersion:16,seed:1,inboundDifficulty:'normal',guided:true,toolCharges:{rotate:0,clear:0,wildcard:0}})).account!;assert.equal(old.run?.identity.mode,'guided');assert.equal(old.run?.identity.rulesetVersion,16);assert.equal('rawScore' in old.run!.state,false);
});
test('approved C/B wins rebind to18 using every original gameplay command and cumulative score once',async()=>{
 for(const [id,tier] of [['C-greedy-s15','hard'],['B-greedy-s21','expert']] as const){const proof=rebindWinningTier18Trace(JSON.parse(await readFile(`artifacts/v0120-order-quantity-study/cases/${id}.json`,'utf8')),tier);assert.equal(proof.state.result,'won');assert.equal(proof.state.completedOrders,30);assert.equal(proof.state.rulesetVersion,18);assert.equal(proof.state.score,Math.floor(proof.state.rawScore*(tier==='hard'?1.5:2)));assert.equal(proof.commands.length,proof.state.commandIndex);assert.ok(proof.states.some(s=>s.shift===5&&s.phase==='input'));}
});
test('daily18 constructed boundary is visibly labeled and strictly bound to the production date hard tier',()=>{
 const epoch=Date.parse('2026-10-07T12:00:00Z'),fixture=constructedDaily18Boundary(epoch),day=localDailyChallenge(epoch,18);assert.match(fixture.label,/^CONSTRUCTED:/);assert.equal(fixture.state.rawScore,1201);assert.equal(fixture.state.score,1801);assert.equal(fixture.spec.seed,day.seed);assert.equal(fixture.state.inboundDifficulty,'hard');
 const storage=staticHelpResumeStorage(fixture.spec,[],{constructedState:fixture.state,label:fixture.label,epoch}),a=validateResumeStorage(storage).account!;assert.equal(a.run?.identity.challengeDay,day.day);assert.equal(a.run?.identity.inboundDifficulty,'hard');assert.equal(applyPlayableCommand(a.run!.state,fixture.next).state.result,'won');
 assert.throws(()=>staticHelpResumeStorage(fixture.spec,[],{constructedState:fixture.state,epoch}),/CONSTRUCTED/);assert.throws(()=>staticHelpResumeStorage(fixture.spec,[],{constructedState:fixture.state,label:fixture.label,epoch:epoch+86400000}),/date|seed/i);
});
test('first actual failure remains preserved while diagnostic reruns write separate current reports',async()=>{
 const out=await mkdtemp(join(tmpdir(),'static-help-report-'));try{await writeStaticHelpReport(out,{status:'FAIL',error:'first root cause'});await writeStaticHelpReport(out,{status:'FAIL',error:'later root cause'});assert.equal(JSON.parse(await readFile(join(out,'first-failure.json'),'utf8')).error,'first root cause');assert.equal(JSON.parse(await readFile(join(out,'report.json'),'utf8')).error,'later root cause');}finally{await rm(out,{recursive:true,force:true});}
});
test('unbound main run fails before any game.js native-host execution',async()=>{
 const out=await mkdtemp(join(tmpdir(),'static-help-unbound-'));try{await assert.rejects(runStaticHelpHostQA({out}),/hash|commit/);const report=JSON.parse(await readFile(join(out,'first-failure.json'),'utf8'));assert.equal(report.executedScenarios,0);assert.equal(report.status,'FAIL');}finally{await rm(out,{recursive:true,force:true});}
});
