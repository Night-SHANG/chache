import test from 'node:test';
import assert from 'node:assert/strict';
import { recordAccountResult, resetAccountResults, assertAccountSnapshot } from '../src/application/account-profile.ts';
import { makeAccountFixture, makeAccountRun } from './helpers/account-fixtures.ts';

test('one run checkpoints add only new units and score and preserve independent maximum units',()=>{
 const run=makeAccountRun();run.state={...run.state,phase:'result',result:'won',endReason:'completed',completedOrders:30,score:1000,maxChain:2,commandIndex:40};
 const before=makeAccountFixture({nextRunSerial:2,run});const first=recordAccountResult(before,run);
 const bucket=Object.values(first.profile.results)[0];assert.equal(bucket.runs,1);assert.equal(bucket.units,30);assert.equal(bucket.wins,1);
 assert.deepEqual(recordAccountResult(first,first.run!),first);
 const continued={...first.run!,state:{...run.state,completedOrders:40,score:1500,commandIndex:60}};
 const after=recordAccountResult(first,continued);const final=Object.values(after.profile.results)[0];
 assert.equal(final.runs,1);assert.equal(final.units,40);assert.equal(final.score,1500);assert.equal(final.wins,1);assert.equal(final.maxUnits,40);
 const other=makeAccountRun({identity:{...run.identity,runId:'next',serial:2},state:{...run.state,completedOrders:35,score:2000}});
 const highScore=recordAccountResult({...after,nextRunSerial:3,run:other},other);const high=Object.values(highScore.profile.results)[0];assert.equal(high.maxUnits,40);assert.equal(high.best?.units,35);
});
test('reset advances live result cursor while preserving economic proofs and guide records',()=>{
 const run=makeAccountRun();run.state={...run.state,phase:'result',result:'won',endReason:'completed',completedOrders:30,score:1000,commandIndex:40};run.creditedBase=55;
 const before=recordAccountResult(makeAccountFixture({nextRunSerial:5,closedThroughSerial:3,wallet:77,inventory:{rotate:1,clear:2,wildcard:0},dailyPaid:{'2026-10-06':{bestBase:55,paid:110}},run}),run);
 const reset=resetAccountResults(before);
 for(const key of ['wallet','inventory','dailyPaid','guides','nextRunSerial','closedThroughSerial','lastOperation','migration','epoch'] as const)assert.deepEqual(reset[key],before[key]);
 assert.deepEqual(reset.profile.results,{});assert.equal(reset.run?.creditedBase,55);assert.deepEqual(recordAccountResult(reset,reset.run!),reset);
 const later={...reset.run!,state:{...run.state,score:1200,completedOrders:31,commandIndex:41}};
 const next=recordAccountResult(reset,later);assert.equal(Object.values(next.profile.results)[0].units,1);assert.equal(Object.values(next.profile.results)[0].score,200);
});
test('difficulty and variant classify outbound results independently',()=>{
 const before=makeAccountFixture({nextRunSerial:2});
 const normal=makeAccountRun();normal.state={...normal.state,phase:'result',result:'failed',completedOrders:4,score:200,commandIndex:4};
 const a=recordAccountResult({...before,run:normal},normal);
 const harder={...normal,identity:{...normal.identity,runId:'hard',serial:2,difficultyId:'hard' as const},resultCursor:null};
 const b=recordAccountResult({...a,nextRunSerial:3,run:harder},harder);assert.equal(Object.keys(b.profile.results).length,2);
});

test('resetting an active run permits one later result with only post-reset progress',async()=>{
 const run=makeAccountRun();const before=makeAccountFixture({nextRunSerial:2,run});const reset=resetAccountResults(before);
 const ended={...reset.run!,state:{...run.state,phase:'result' as const,result:'won' as const,endReason:'completed' as const,completedOrders:30,score:1000,commandIndex:1},history:{...run.history,totalCommands:1,tail:[{type:'place' as const,pieceId:'piece.1',origin:{x:0,y:0}}]}};
 const recorded=recordAccountResult({...reset,run:ended},ended);assert.equal(Object.values(recorded.profile.results)[0].runs,1);assertAccountSnapshot(recorded);
});

test('an outbound endless retirement records retirement without a finite-mode win',async()=>{
 const {createRunV10,applyCommandV10}=await import('../src/domain/v10/engine.ts');const state=applyCommandV10(createRunV10(42,'normal'),{type:'finishOutboundEndless'}).state;
 const run=makeAccountRun({identity:{runId:'retire',serial:1,rulesetVersion:10,runConfigId:state.runConfigId,mode:'outboundEndless',difficultyId:'normal',economyVersion:1},state,history:{seed:state.seed,runConfigId:state.runConfigId,head:null,totalCommands:state.commandIndex,tail:state.commands}});
 const result=recordAccountResult(makeAccountFixture({nextRunSerial:2,run}),run);const bucket=Object.values(result.profile.results)[0];assert.equal(bucket.wins,0);assert.equal(bucket.retirements,1);assert.equal(result.run?.resultCursor?.countedWin,false);
});
test('using a reserved tool during overtime transfers the entire run contribution and restores prior plain best',async()=>{
 const {createRunV9,applyCommandV9}=await import('../src/domain/v9/engine.ts');
 const initial=applyCommandV9(createRunV9({seed:42,mode:'standard',toolCharges:{rotate:1,clear:0,wildcard:0}}),{type:'chooseCleanup',branch:'orders'}).state;
 const state={...initial,phase:'result' as const,result:'won' as const,endReason:'completed' as const,shift:5 as const,completedOrders:30,score:1000,maxChain:2};
 const run=makeAccountRun({identity:{runId:'growth',serial:1,rulesetVersion:9,runConfigId:state.runConfigId,mode:'standard',economyVersion:1},state,history:{seed:42,runConfigId:state.runConfigId,head:null,totalCommands:initial.commandIndex,tail:initial.commands},reserved:['rotate']});
 const old={runs:1,units:25,maxUnits:25,score:1200,wins:0,retirements:0,maxChain:2,best:{score:1200,units:25,chain:2}};const before=makeAccountFixture({nextRunSerial:2,run});before.profile.results['inbound.standard.v9.plain']=old;
 const first=recordAccountResult(before,run);assert.equal(first.profile.results['inbound.standard.v9.plain'].runs,2);
 const toolCommand={type:'rotate' as const,pieceId:state.candidates[0].id,quarterTurns:1 as const};
 const later={...first.run!,state:{...state,usedToolIds:['rotate' as const],toolCharges:{rotate:0 as const,clear:0 as const,wildcard:0 as const},overtime:true,completedOrders:40,score:1600,commandIndex:2,commands:[...initial.commands,toolCommand],endReason:'retired' as const},history:{...run.history,totalCommands:2,tail:[...initial.commands,toolCommand]}};
 const final=recordAccountResult({...first,run:later},later);assert.deepEqual(final.profile.results['inbound.standard.v9.plain'],old);assert.equal(final.profile.results['inbound.standard.v9.tools'].runs,1);assert.equal(final.profile.results['inbound.standard.v9.tools'].units,40);assert.equal(final.profile.results['inbound.standard.v9.tools'].score,1600);assert.equal(final.profile.results['inbound.standard.v9.tools'].wins,1);assert.equal(final.profile.results['inbound.standard.v9.tools'].retirements,1);assertAccountSnapshot(final);
});

test('guided outbound results stay separate and a cursor cannot be reused by another run',()=>{
 const normal=makeAccountRun();normal.state={...normal.state,phase:'result',result:'failed',endReason:'blocked',commandIndex:1,commands:[{type:'place',pieceId:'piece.1',origin:{x:0,y:0}}]};normal.history={...normal.history,totalCommands:1,tail:normal.state.commands};normal.identity={...normal.identity,difficultyId:'easy',runConfigId:'run.outbound9_v8.easy'};normal.state={...normal.state,difficultyId:'easy',runConfigId:normal.identity.runConfigId};normal.history={...normal.history,runConfigId:normal.identity.runConfigId};
 const first=recordAccountResult(makeAccountFixture({nextRunSerial:2,run:normal}),normal);
 const borrowed={...first.run!,identity:{...normal.identity,runId:'different',serial:2}};assert.throws(()=>recordAccountResult({...first,nextRunSerial:3,run:borrowed},borrowed),/不属于/);
 const guided={...normal,identity:{...normal.identity,runId:'guided',serial:2,mode:'outboundGuided' as const}};const after=recordAccountResult({...first,nextRunSerial:3,run:guided},guided);assert.deepEqual(Object.keys(after.profile.results).sort(),['outbound.v8.easy','outboundGuided.v8.easy']);assertAccountSnapshot(after);
});
test('resetting legacy display keeps each old reset and recorded-run boundary',()=>{
 const before=makeAccountFixture({nextRunSerial:10});before.profile.legacyResults.resetCursor={serial:7,commandIndex:99};before.profile.legacyResults.lastRecordedRun={serial:7,orders:4,score:100};before.profile.legacyResults.outboundV8={normal:{stats:{runs:2,batches:5,wins:0,maxChain:1},bestScores:{v8:{score:100,chain:1}},lastRecordedRun:{serial:8,batches:5,score:100},resetCursor:{serial:8,commandIndex:50}}};
 const reset=resetAccountResults(before);assert.deepEqual(reset.profile.legacyResults.resetCursor,before.profile.legacyResults.resetCursor);assert.deepEqual(reset.profile.legacyResults.lastRecordedRun,{...before.profile.legacyResults.lastRecordedRun,ignored:true});assert.deepEqual(reset.profile.legacyResults.outboundV8?.normal?.resetCursor,{serial:8,commandIndex:50});assert.deepEqual(reset.profile.legacyResults.outboundV8?.normal?.stats,{runs:0,batches:0,wins:0,maxChain:0});assertAccountSnapshot(reset);
});

test('an already selected cosmetic remains a valid account setting after results reset',()=>{
 const account=makeAccountFixture();account.profile.cosmetics.forklift='blue';account.profile.legacyResults.stats.orders=1;account.profile.legacyResults.achievements=['first_shipment'];const reset=resetAccountResults(account);assert.equal(reset.profile.cosmetics.forklift,'blue');assertAccountSnapshot(reset);
});

test('selected blue and red forklifts round trip after reset while invalid account ids are rejected',async()=>{
 const {encodeAccount,decodeAccount}=await import('../src/application/account-store.ts');const {FaultStorage}=await import('./helpers/account-fixtures.ts');
 for(const forklift of ['blue','red'] as const){const account=makeAccountFixture({nextRunSerial:2});account.profile.cosmetics.forklift=forklift;account.profile.legacyResults.stats={runs:1,orders:30,wins:1,maxChain:1};account.profile.legacyResults.achievements=['first_shipment','five_shifts'];const reset=resetAccountResults(account);assert.equal(decodeAccount(new FaultStorage(),encodeAccount(reset)).profile.cosmetics.forklift,forklift);}
 const invalid=makeAccountFixture();invalid.profile.cosmetics.forklift='unknown' as never;assert.throws(()=>assertAccountSnapshot(invalid));
});
test('account profile does not admit excluded legacy schema fields or crossed run identities',()=>{
 const account=makeAccountFixture();Object.assign(account.profile.legacyResults,{schemaVersion:99});assert.throws(()=>assertAccountSnapshot(account));
 const run=makeAccountRun();const bound=makeAccountFixture({nextRunSerial:2,run});run.identity.difficultyId='hard';assert.throws(()=>assertAccountSnapshot(bound));
});
