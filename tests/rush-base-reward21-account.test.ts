import test from 'node:test';
import assert from 'node:assert/strict';
const loaded=await import('../src/domain/v21/engine.ts').catch(()=>null);
function api(){assert.ok(loaded,'Base-only rush rules21 adapter must exist');return loaded;}
const createRunV21=(...args:Parameters<NonNullable<typeof loaded>['createRunV21']>)=>api().createRunV21(...args);
const applyCommandV21=(...args:Parameters<NonNullable<typeof loaded>['applyCommandV21']>)=>api().applyCommandV21(...args);
const findLegalMovesV21=(...args:Parameters<NonNullable<typeof loaded>['findLegalMovesV21']>)=>api().findLegalMovesV21(...args);
import type {RushRunV21} from '../src/domain/v21/types.ts';
type RushDifficultyV21='normal';
import {createRunV18} from '../src/domain/v18/engine.ts';
import {CARGO} from '../src/domain/rulesets/v1/content.ts';
import type {AccountRun,AccountSnapshot} from '../src/application/account-types.ts';
import {createAccountService,accountDisplayProfile} from '../src/application/account-service.ts';
import type {AccountService,AccountRequest,StartIntent,TransactionResult} from '../src/application/account-service.ts';
import {assertAccountSnapshot} from '../src/application/account-profile.ts';
import {assertGameRun,assertGameCommandShape,encodeGameRun,decodeGameRun} from '../src/application/game-codec.ts';
import {ACCOUNT_KEYS,encodeAccount,decodeAccount} from '../src/application/account-store.ts';
import {upgradeAccountGuides,guideTrackFor} from '../src/application/account-guides.ts';
import {retainAccountCosmetics,accountCosmeticState} from '../src/application/cosmetics.ts';
import {baseCoins} from '../src/application/economy.ts';
import {FaultStorage,makeAccountFixture} from './helpers/account-fixtures.ts';

const NOW=Date.parse('2026-10-07T08:00:00Z'),held=()=>({status:'held' as const,release(){}});
function send(service:AccountService,request:AccountRequest){return service.transact(request,service.getSnapshot()!.generation);}
function install(patch:Partial<AccountSnapshot>={}){
 const storage=new FaultStorage(),account=upgradeAccountGuides(retainAccountCosmetics(makeAccountFixture({formatVersion:2,economyVersion:2,dailyRewards:{},...patch})));
 const raw=encodeAccount(account);storage.values.set(ACCOUNT_KEYS.a,raw);storage.values.set(ACCOUNT_KEYS.b,raw);const service=createAccountService(storage,held(),()=>NOW);assert.ok(service.getSnapshot());storage.resetFault();return {storage,service,account};
}
function intent(tier:RushDifficultyV21='normal',items:StartIntent['items']=[]):StartIntent{return {spec:{family:'inbound',rulesetVersion:21,mode:'rush',inboundDifficulty:tier,seed:1,guided:false,toolCharges:{rotate:0,clear:0,wildcard:0}},items,guide:'direct'};}
function makeRun(state:RushRunV21,serial=1,creditedBase=0,earnedCoins=creditedBase):AccountRun{return {identity:{runId:`test.epoch.${serial}`,serial,rulesetVersion:21,runConfigId:state.runConfigId,mode:'rush',inboundDifficulty:state.inboundDifficulty,economyVersion:2},state,history:{seed:state.seed,runConfigId:state.runConfigId,head:null,totalCommands:state.commandIndex,tail:state.commands},lifecycle:'active',reserved:(['rotate','clear','wildcard'] as const).filter(item=>state.toolCharges[item]===1),creditedBase,earnedCoins,resultCursor:null};}
// Explicit 29-order boundary fixture. The final real shipment contributes raw400,
// producing exactly raw6000 => displayed6000 and base50.
function lastShipment(tier:RushDifficultyV21,tools=false){
 let state=createRunV21({seed:17,mode:'rush',inboundDifficulty:tier,toolCharges:{rotate:0,clear:0,wildcard:tools?1:0}});state=applyCommandV21(state,{type:'chooseCleanup',branch:'orders'}).state;
 if(tools)state=applyCommandV21(state,{type:'wildcard',pieceId:state.candidates[0].id}).state;
 state.completedOrders=29;state.shift=5;state.rawScore=5600;state.score=5600;state.candidates[0]={id:'boundary.last',shapeId:'shape.single',cargo:'cargo.food',quarterTurns:0};
 state.orders=['dock.north','dock.east','dock.south','dock.west'].map((dockId,index)=>({id:`boundary.order.${index}`,dockId,cargo:CARGO[index].id,amount:index===0?4:6,baseScore:200}));for(const cell of [8,9,10])state.board[cell]='cargo.food';return state;
}
const finalCommand={type:'place' as const,pieceId:'boundary.last',origin:{x:4,y:1}};

// Mutation target: treating rush as dated daily either rejects its identity or locks the second run.
test('fixed rush starts independent runs with independent serial seeds and ignores an already completed legacy daily date',()=>{
 const {service}=install({dailyRewards:{'2026-10-07':{completedRunId:'legacy.won',bonusPaid:90}},wallet:99});let previous:RushRunV21|undefined;
 for(const tier of ['normal','normal','normal'] as const){const start=send(service,{operationId:`start.${previous?.seed??0}`,type:'start',intent:intent(tier)});assert.equal(start.status,'acknowledged',start.message);const run=start.account!.run!;assert.equal(run.identity.rulesetVersion,21);assert.equal(run.identity.mode,'rush');assert.equal(run.identity.challengeDay,undefined);assert.equal(run.state.mode,'rush');assert.equal(run.identity.inboundDifficulty,tier);if(previous)assert.notEqual(run.state.seed,previous.seed);previous=run.state as RushRunV21;assert.equal(send(service,{operationId:`home.${run.identity.serial}`,type:'close',runId:run.identity.runId,reason:'home'}).status,'acknowledged');}
 assert.equal(service.getSnapshot()!.wallet,99);assert.deepEqual(service.getSnapshot()!.dailyRewards,{'2026-10-07':{completedRunId:'legacy.won',bonusPaid:90}});
});

test('rush codec round trips cleanup, legal two-tool states and actual tool use without weakening old daily18',()=>{
 for(const tier of ['normal'] as const){let state=createRunV21({seed:5,mode:'rush',inboundDifficulty:tier,toolCharges:{rotate:1,clear:0,wildcard:1}});assert.doesNotThrow(()=>assertGameRun(state));assert.deepEqual(decodeGameRun(encodeGameRun(state)),state);state=applyCommandV21(state,{type:'chooseCleanup',branch:'placements'}).state;state=applyCommandV21(state,{type:'wildcard',pieceId:state.candidates[0].id}).state;assert.deepEqual(decodeGameRun(encodeGameRun(state)),state);assert.doesNotThrow(()=>assertGameCommandShape({type:'clear',cells:[8]},21));}
 const daily=createRunV18({seed:5,mode:'daily'});daily.toolCharges.wildcard=1;assert.throws(()=>assertGameRun(daily));
});

test('rush strict codec and account identity reject wrong mode, tier, score equality, date, tool counts and cursor buckets',()=>{
 const state=createRunV21({seed:5,mode:'rush'});const {account,storage}=install({run:makeRun(state),nextRunSerial:2});assert.deepEqual(decodeAccount(storage,encodeAccount(account)),account);
 for(const patch of [{mode:'daily'},{rulesetVersion:'21'},{inboundDifficulty:'hard'},{inboundDifficulty:['hard']},{guided:true},{overtime:true},{score:1},{rawScore:undefined},{challengeDay:'2026-10-07'},{toolCharges:{rotate:1,clear:1,wildcard:1}},{toolCharges:{rotate:2,clear:0,wildcard:0}},{usedToolIds:['rotate','rotate']}])assert.throws(()=>assertGameRun({...state,...patch}));
 for(const patch of [{mode:'daily'},{challengeDay:'2026-10-07'},{economyVersion:1},{inboundDifficulty:'hard'},{runConfigId:'run.rush_v21.expert'},{difficultyId:'hard'}]){const invalid=structuredClone(account);Object.assign(invalid.run!.identity,patch);assert.throws(()=>assertAccountSnapshot(invalid));}
});

test('invalid rush starts leave inventory wallet and both roots unchanged',()=>{
 for(const patch of [{mode:'daily'},{mode:'standard'},{inboundDifficulty:'hard'},{guided:true},{challengeDay:'2026-10-07'},{rulesetVersion:'21'}]){const {storage,service}=install({wallet:500,inventory:{rotate:1,clear:1,wildcard:1}}),before=service.getSnapshot(),start=intent();Object.assign(start.spec,patch);if(patch.guided)start.guide='guided';assert.equal(send(service,{operationId:'invalid',type:'start',intent:start}).status,'not_committed');assert.deepEqual(service.getSnapshot(),before);assert.equal(storage.operations.some(op=>op.kind==='set'),false);}
 for(const items of [['clear','clear'],['rotate','clear','wildcard']] as StartIntent['items'][]){const {service}=install({inventory:{rotate:1,clear:1,wildcard:1}});assert.equal(send(service,{operationId:'invalid.tools',type:'start',intent:intent('normal',items)}).status,'not_committed');}
});

test('rush start rejects invalid charge declarations and cannot count time before choosing cleanup',()=>{
 for(const toolCharges of [{rotate:2,clear:0,wildcard:0},{rotate:1,clear:1,wildcard:1},{rotate:0,clear:0,wildcard:0,extra:0}]){const {service}=install(),start=intent();Object.assign(start.spec,{toolCharges});assert.equal(send(service,{operationId:'invalid',type:'start',intent:start}).status,'not_committed');}
 const {service}=install(),start=send(service,{operationId:'start',type:'start',intent:intent()});assert.equal(start.status,'acknowledged');const runId=start.account!.run!.identity.runId;assert.equal(send(service,{operationId:'elapsed',type:'saveElapsed',runId,elapsedMs:1}).status,'not_committed');assert.equal(service.getSnapshot()!.run!.state.elapsedMs,0);
});

test('rush codec rejects impossible initial use, no-charge rescue and overtime history',()=>{
 const initial=createRunV21({seed:5,mode:'rush'});assert.throws(()=>assertGameRun({...initial,usedToolIds:['rotate']}));
 const active=applyCommandV21(initial,{type:'chooseCleanup',branch:'orders'}).state;assert.throws(()=>assertGameRun({...active,phase:'rescue'}));assert.throws(()=>assertGameCommandShape({type:'continueOvertime'},21));
});

test('each rush win awards only its own score-derived base once, including tools and two wins on the same day',()=>{
 for(const tier of ['normal'] as const)for(const tools of [false,true]){let cumulative=0;let saved:AccountSnapshot|undefined;
  for(const serial of [1,2]){const state=lastShipment(tier,tools),run=makeRun(state,serial),{service}=install({...saved,run,nextRunSerial:serial+1,closedThroughSerial:serial-1,wallet:cumulative});const before=service.getSnapshot()!,won=send(service,{operationId:`win.${serial}`,type:'command',runId:run.identity.runId,command:finalCommand});assert.equal(won.status,'acknowledged',won.message);const final=won.account!.run!.state as RushRunV21;assert.equal(final.rawScore,6000);assert.equal(final.score,6000);const base=50;assert.equal(won.account!.run!.creditedBase,base);assert.equal(won.account!.run!.earnedCoins,base);assert.equal(won.operation!.coinDelta,base);assert.equal(won.account!.wallet,cumulative+base);assert.deepEqual(won.account!.dailyPaid,before.dailyPaid);assert.deepEqual(won.account!.dailyRewards,before.dailyRewards);assert.equal(won.account!.profile.results[`inbound.rush.v20.fixed.${tools?'tools':'plain'}`].wins,serial);
   const closeRequest:AccountRequest={operationId:`close.${serial}`,type:'close',runId:run.identity.runId,reason:'decline_overtime'};const generation=won.account!.generation,closed=service.transact(closeRequest,generation);assert.equal(closed.status,'acknowledged',closed.message);assert.equal(closed.operation!.coinDelta,0);assert.equal(closed.account!.lastClosedResult!.earnedCoins,base);assert.equal(service.transact(closeRequest,generation).operation,undefined);saved=closed.account!;cumulative+=base;
  }
 }
});

test('failed and home-abandoned rush earn base and reset display cannot award twice',()=>{
 for(const reason of ['failed','home'] as const){let state=createRunV21({seed:3,mode:'rush'});state=applyCommandV21(state,{type:'chooseCleanup',branch:'orders'}).state;state.rawScore=6000;state.score=6000;if(reason==='failed'){state.phase='result';state.result='failed';state.endReason='blocked';}
  const run=makeRun(state),{service}=install({run,nextRunSerial:2});const closed=send(service,{operationId:'close',type:'close',runId:run.identity.runId,reason});assert.equal(closed.status,'acknowledged',closed.message);assert.equal(closed.account!.wallet,50);assert.equal(closed.account!.lastClosedResult!.earnedCoins,50);
 }
 const state=lastShipment('normal'),run=makeRun(state),{service,storage}=install({run,nextRunSerial:2});const won=send(service,{operationId:'win',type:'command',runId:run.identity.runId,command:finalCommand});assert.equal(won.status,'acknowledged');assert.equal(send(service,{operationId:'reset',type:'resetResults'}).status,'acknowledged');const reboot=createAccountService(storage,held(),()=>NOW),closed=send(reboot,{operationId:'close',type:'close',runId:run.identity.runId,reason:'decline_overtime'});assert.equal(closed.status,'acknowledged');assert.equal(closed.account!.wallet,50);assert.deepEqual(closed.account!.profile.results,{});assert.equal(closed.operation!.coinDelta,0);
});

test('carried unused tools remain plain, actual use consumes once and the remaining reservation refunds once',()=>{
 for(const use of [false,true]){const {service}=install({inventory:{rotate:1,clear:0,wildcard:1}}),start=send(service,{operationId:'start',type:'start',intent:intent('normal',['rotate','wildcard'])});assert.equal(start.status,'acknowledged',start.message);const runId=start.account!.run!.identity.runId;assert.deepEqual(start.account!.run!.reserved,['rotate','wildcard']);assert.equal(send(service,{operationId:'cleanup',type:'command',runId,command:{type:'chooseCleanup',branch:'orders'}}).status,'acknowledged');
  if(use){const pieceId=service.getSnapshot()!.run!.state.candidates[0].id,request:AccountRequest={operationId:'use',type:'command',runId,command:{type:'wildcard',pieceId}},generation=service.getSnapshot()!.generation;assert.equal(service.transact(request,generation).status,'acknowledged');assert.equal(service.transact(request,generation).operation,undefined);}
  const closed=send(service,{operationId:'retire',type:'close',runId,reason:'retired'});assert.equal(closed.status,'acknowledged',closed.message);assert.deepEqual(closed.account!.inventory,{rotate:1,clear:0,wildcard:use?0:1});assert.ok(closed.account!.profile.results[`inbound.rush.v20.fixed.${use?'tools':'plain'}`]);
 }
});

test('rush uses the existing cleanup/timer guide and preserves prior achievement ownership',()=>{
 const {service}=install(),start=send(service,{operationId:'start',type:'start',intent:intent()});assert.equal(start.status,'acknowledged',start.message);const runId=start.account!.run!.identity.runId;assert.equal(guideTrackFor(start.account!.run!.state),'daily');const cleanup=send(service,{operationId:'cleanup',type:'command',runId,command:{type:'chooseCleanup',branch:'orders'}});assert.equal(cleanup.status,'acknowledged');assert.ok(cleanup.account!.guides.daily!.learned.includes('sweepChoice'));
 const state=lastShipment('normal'),run=makeRun(state),played=install({run,nextRunSerial:2}).service;const won=send(played,{operationId:'win',type:'command',runId:run.identity.runId,command:finalCommand});assert.equal(won.status,'acknowledged');assert.equal(accountDisplayProfile(won.account!).stats.orders,30);assert.ok(accountCosmeticState(won.account!).ownedCosmetics.includes('forklift.blue'));assert.equal(accountCosmeticState(won.account!).ownedCosmetics.includes('forklift.red'),false);
});

test('rush final shipment failure before or after every root I/O retries one entitlement and one result',()=>{
 const state=lastShipment('normal'),run=makeRun(state),probe=install({run,nextRunSerial:2}),request:AccountRequest={operationId:'win',type:'command',runId:run.identity.runId,command:finalCommand};const ok=send(probe.service,request);assert.equal(ok.status,'acknowledged',ok.message);const rootWrites=probe.storage.operations.flatMap((op,index)=>op.kind==='set'&&(op.key===ACCOUNT_KEYS.a||op.key===ACCOUNT_KEYS.b)?[index+1]:[]);assert.ok(rootWrites.length>=2);
 for(const at of rootWrites)for(const timing of ['before','after'] as const){const {service,storage}=install({run:structuredClone(run),nextRunSerial:2});storage.resetFault({at,timing});const result=send(service,request);storage.resetFault();const retried:TransactionResult=result.status==='acknowledged'?service.transact(request,0):service.retryPending('win');assert.equal(retried.status,'acknowledged',`${at}/${timing}: ${retried.message}`);assert.equal(retried.account!.wallet,50);assert.equal(retried.account!.run!.earnedCoins,50);assert.equal(retried.account!.profile.results['inbound.rush.v20.fixed.plain'].runs,1);assert.equal(storage.values.get(ACCOUNT_KEYS.a),storage.values.get(ACCOUNT_KEYS.b));}
});

test('real accepted rush prefix pays displayed score deltas and restore retains one-times raw score',()=>{
 for(const tier of ['normal'] as const){const state=applyCommandV21(createRunV21({seed:17,mode:'rush',inboundDifficulty:tier}),{type:'chooseCleanup',branch:'orders'}).state,run=makeRun(state),{service,storage}=install({run,nextRunSerial:2});let count=0;
  while(service.getSnapshot()!.run!.state.phase==='input'&&count<25){const before=service.getSnapshot()!.run!.state as RushRunV21,move=findLegalMovesV21(before)[0];assert.ok(move);const step=send(service,{operationId:`place.${++count}`,type:'command',runId:run.identity.runId,command:{type:'place',...move}});assert.equal(step.status,'acknowledged',step.message);const current=step.account!.run!.state as RushRunV21;assert.equal(current.score,current.rawScore);assert.equal(step.account!.wallet,baseCoins('inbound',current.completedOrders,current.score,2));}
  const before=service.getSnapshot()!,restored=createAccountService(storage,held(),()=>NOW).getSnapshot();assert.ok(before.run!.state.completedOrders>0);assert.ok(before.wallet>0);assert.deepEqual(restored,before);
 }
});

test('a rush win pays only the difference from the base already credited during active play',()=>{
 for(const tier of ['normal'] as const){const state=lastShipment(tier),base=baseCoins('inbound',29,state.score,2),run=makeRun(state,1,base),{service}=install({run,nextRunSerial:2,wallet:base});const result=send(service,{operationId:'win',type:'command',runId:run.identity.runId,command:finalCommand});assert.equal(result.status,'acknowledged',result.message);const entitled=50;assert.equal(result.account!.wallet,entitled);assert.equal(result.operation!.coinDelta,entitled-base);assert.equal(result.account!.run!.earnedCoins,entitled);}
});

test('rush start, consume and close recover every single I/O interruption with one seed, debit and refund',()=>{
 const prepare=(action:'start'|'consume'|'close')=>{
  const {service,storage}=install({inventory:{rotate:1,clear:0,wildcard:1}});
  if(action==='start')return {service,storage,request:{operationId:'subject',type:'start',intent:intent('normal',['rotate','wildcard'])} as AccountRequest};
  const start=send(service,{operationId:'start',type:'start',intent:intent('normal',['rotate','wildcard'])});assert.equal(start.status,'acknowledged',start.message);const runId=start.account!.run!.identity.runId;
  assert.equal(send(service,{operationId:'cleanup',type:'command',runId,command:{type:'chooseCleanup',branch:'orders'}}).status,'acknowledged');
  const command={type:'wildcard' as const,pieceId:service.getSnapshot()!.run!.state.candidates[0].id};
  if(action==='close')assert.equal(send(service,{operationId:'consume',type:'command',runId,command}).status,'acknowledged');
  storage.resetFault();return {service,storage,request:action==='consume'?{operationId:'subject',type:'command',runId,command} as AccountRequest:{operationId:'subject',type:'close',runId,reason:'home'} as AccountRequest};
 };
 for(const action of ['start','consume','close'] as const){const probe=prepare(action),ok=send(probe.service,probe.request);assert.equal(ok.status,'acknowledged',ok.message);const expected=ok.account!,count=probe.storage.operations.length;
  for(let at=1;at<=count;at++)for(const timing of ['before','after'] as const){const {service,storage,request}=prepare(action),generation=service.getSnapshot()!.generation;storage.resetFault({at,timing});const first=service.transact(request,generation);storage.resetFault();const retry:TransactionResult=first.status==='acknowledged'?service.transact(request,generation):service.retryPending('subject');assert.equal(retry.status,'acknowledged',`${action}/${at}/${timing}: ${retry.message}`);assert.deepEqual(retry.account,expected,`${action}/${at}/${timing}`);assert.equal(storage.values.get(ACCOUNT_KEYS.a),storage.values.get(ACCOUNT_KEYS.b));assert.equal(service.retryPending('subject').operation,undefined);}
 }
});

test('rush result cursor stays in the shared fixed bucket and rejects forged cumulative earnings',()=>{
 const state=lastShipment('normal'),run=makeRun(state),{service}=install({run,nextRunSerial:2});const result=send(service,{operationId:'win',type:'command',runId:run.identity.runId,command:finalCommand});assert.equal(result.status,'acknowledged');const account=result.account!;
 for(const key of ['inbound.rush.v19.hard.plain','inbound.rush.v21.normal.plain','inbound.daily.v18.hard.plain','inbound.standard.v18.expert.plain','inbound.endless.v18.expert.plain']){const invalid=structuredClone(account);invalid.run!.resultCursor!.bucketKey=key;assert.throws(()=>assertAccountSnapshot(invalid));}
 for(const earnedCoins of [49,51,150,Number.MAX_SAFE_INTEGER+1]){const invalid=structuredClone(account);invalid.run!.earnedCoins=earnedCoins;assert.throws(()=>assertAccountSnapshot(invalid));}
});

test('a rush payout exceeding safe wallet range rejects atomically before writing either root',()=>{
 const run=makeRun(lastShipment('normal')),{service,storage}=install({run,nextRunSerial:2,wallet:Number.MAX_SAFE_INTEGER}),before=service.getSnapshot(),roots=[storage.values.get(ACCOUNT_KEYS.a),storage.values.get(ACCOUNT_KEYS.b)];const result=send(service,{operationId:'overflow',type:'command',runId:run.identity.runId,command:finalCommand});assert.equal(result.status,'not_committed');assert.deepEqual(service.getSnapshot(),before);assert.deepEqual([storage.values.get(ACCOUNT_KEYS.a),storage.values.get(ACCOUNT_KEYS.b)],roots);assert.equal(storage.operations.some(op=>op.kind==='set'),false);
});

// Mutation target: resetting or rejecting a command modifies wallet, inventory, or earned appearance rights.
test('fixed rush reset rejected tools and restore preserve wallet inventory and purchased appearances',()=>{
 const base=makeAccountFixture(),profile:AccountSnapshot['profile']={...base.profile,cosmetics:{theme:'harbor',cargo:'wood',forklift:'red'},ownedCosmetics:['theme.harbor','cargo.wood','forklift.red'],cargoOutline:true};
 const run=makeRun(lastShipment('normal')),{service,storage}=install({profile,run,nextRunSerial:2,wallet:1000,inventory:{rotate:3,clear:2,wildcard:1}}),won=send(service,{operationId:'win.assets',type:'command',runId:run.identity.runId,command:finalCommand});assert.equal(won.status,'acknowledged',won.message);
 const original=won.account!,reset=send(service,{operationId:'reset.assets',type:'resetResults'});assert.equal(reset.status,'acknowledged');for(const field of ['wallet','inventory'] as const)assert.deepEqual(reset.account![field],original[field]);for(const field of ['cosmetics','ownedCosmetics','cargoOutline'] as const)assert.deepEqual(reset.account!.profile[field],original.profile[field]);
 const restored=createAccountService(storage,held(),()=>NOW);assert.deepEqual(restored.getSnapshot(),reset.account);const before=restored.getSnapshot(),roots=new Map(storage.values);storage.resetFault();const canceled=send(restored,{operationId:'cancel.assets',type:'command',runId:run.identity.runId,command:{type:'cancelTool'} as never});assert.equal(canceled.status,'not_committed');assert.deepEqual(restored.getSnapshot(),before);assert.deepEqual(storage.values,roots);assert.equal(storage.operations.some(op=>op.kind==='set'),false);
});

// Mutation target: a future/unknown root falls back to an older funded account and permits new writes.
test('unknown fixed-rush roots block mutation and preserve both roots and cosmetics',()=>{
 const run=makeRun(lastShipment('normal')),{storage}=install({run,nextRunSerial:2,wallet:111,inventory:{rotate:1,clear:1,wildcard:1}});storage.values.set(ACCOUNT_KEYS.b,'{"formatVersion":999}');const roots=new Map(storage.values),service=createAccountService(storage,held(),()=>NOW);assert.equal(service.getSnapshot(),null);assert.equal(service.getStatus(),'unknown');storage.resetFault();const result=service.transact({operationId:'blocked.new',type:'start',intent:intent()},0);assert.notEqual(result.status,'acknowledged');assert.deepEqual(storage.values,roots);assert.equal(storage.operations.some(op=>op.kind==='set'||op.kind==='remove'),false);
});

// Mutation target: relaxed fixed20 validation permits tier/date/tool/history corruption.
test('fixed-rush strict boundaries reject expert scores dates malformed clocks and forged history',()=>{
 const state=applyCommandV21(createRunV21({seed:5,mode:'rush'}),{type:'chooseCleanup',branch:'orders'}).state;
 for(const patch of [{inboundDifficulty:'expert'},{inboundDifficulty:['normal']},{mode:['rush']},{rawScore:'0'},{rawScore:Number.MAX_SAFE_INTEGER+1},{score:2,rawScore:1},{date:'2026-10-08'},{dailyKey:'2026-10-08'},{cleanup:{branch:'orders',progress:2}},{cleanup:{branch:'placements',progress:6}},{elapsedMs:-1},{phase:'cleanup'},{toolCharges:{rotate:0,clear:0,wildcard:0,extra:0}}])assert.throws(()=>assertGameRun({...state,...patch}));
 const {account}=install({run:makeRun(state),nextRunSerial:2});for(const patch of [{rulesetVersion:'21'},{inboundDifficulty:'expert'},{challengeDay:'2026-10-08'},{runConfigId:'run.rush_v21.normal'}]){const invalid=structuredClone(account);Object.assign(invalid.run!.identity,patch);assert.throws(()=>assertAccountSnapshot(invalid));}
 const invalid=structuredClone(account);invalid.run!.history.runConfigId='run.rush_v19.hard';assert.throws(()=>assertAccountSnapshot(invalid));const badCommand=structuredClone(account);badCommand.run!.history.tail=[{type:'continueOvertime'}];assert.throws(()=>assertAccountSnapshot(badCommand));
});

// Mutation target: new wins retain the old triple bonus, or historical wins get repriced.
test('new21 and legacy20 share score buckets while active and closed20 retain their issued triple reward',()=>{
 const oldState={...lastShipment('normal'),rulesetVersion:20 as const,runConfigId:'run.rush_v20.fixed' as const};
 const oldRun:AccountRun={...makeRun(lastShipment('normal')),identity:{...makeRun(lastShipment('normal')).identity,rulesetVersion:20,runConfigId:oldState.runConfigId},state:oldState,history:{seed:oldState.seed,runConfigId:oldState.runConfigId,head:null,totalCommands:oldState.commandIndex,tail:oldState.commands}};
 const old=install({run:oldRun,nextRunSerial:2,wallet:700});const won=send(old.service,{operationId:'old.win',type:'command',runId:oldRun.identity.runId,command:finalCommand});assert.equal(won.status,'acknowledged',won.message);assert.equal(won.account!.wallet,850);assert.equal(won.account!.run!.earnedCoins,150);
 const closed=send(old.service,{operationId:'old.close',type:'close',runId:oldRun.identity.runId,reason:'decline_overtime'});assert.equal(closed.status,'acknowledged');assert.equal(closed.account!.lastClosedResult!.earnedCoins,150);assert.equal(closed.operation!.coinDelta,0);assert.deepEqual(createAccountService(old.storage,held(),()=>NOW).getSnapshot(),closed.account);
 const oldFacts=structuredClone(closed.account!.lastClosedResult),nextRun=makeRun(lastShipment('normal'),2),fresh=install({...closed.account!,run:nextRun,nextRunSerial:3});const next=send(fresh.service,{operationId:'new.win',type:'command',runId:nextRun.identity.runId,command:finalCommand});assert.equal(next.status,'acknowledged',next.message);assert.equal(next.account!.wallet,900);assert.equal(next.account!.run!.earnedCoins,50);assert.deepEqual(next.account!.lastClosedResult,oldFacts);assert.equal(next.account!.profile.results['inbound.rush.v20.fixed.plain'].runs,2);assert.equal(next.account!.profile.results['inbound.rush.v20.fixed.plain'].score,12000);assert.equal(next.account!.profile.results['inbound.rush.v21.base.plain'],undefined);assert.equal(next.account!.profile.results['inbound.rush.v19.hard.plain'],undefined);
});
// Mutation target: failure payout rounds up or uses order count rather than displayed score.
test('failed21 score301 pays exactly two coins and reload cannot credit it twice',()=>{
 let state=applyCommandV21(createRunV21({seed:3,mode:'rush'}),{type:'chooseCleanup',branch:'orders'}).state;state={...state,rawScore:301,score:301,phase:'result',result:'failed',endReason:'blocked'};
 const run=makeRun(state),{service,storage}=install({run,nextRunSerial:2,wallet:11}),request:AccountRequest={operationId:'failed.close',type:'close',runId:run.identity.runId,reason:'failed'},generation=service.getSnapshot()!.generation,closed=service.transact(request,generation);assert.equal(closed.status,'acknowledged',closed.message);assert.equal(closed.operation!.coinDelta,2);assert.equal(closed.account!.wallet,13);assert.equal(closed.account!.lastClosedResult!.earnedCoins,2);
 const reboot=createAccountService(storage,held(),()=>NOW);assert.equal(reboot.transact(request,generation).status,'acknowledged');assert.equal(reboot.getSnapshot()!.wallet,13);assert.doesNotThrow(()=>assertAccountSnapshot(reboot.getSnapshot()));
});
// Mutation target: music resets an existing wallet, forces migration, or admits unrelated settings.
test('optional music restores old settings and persists both boolean values without resetting any account assets',()=>{
 const profile={...makeAccountFixture().profile,settings:{sound:true,reducedMotion:false}},
  {service,storage}=install({profile,wallet:555,inventory:{rotate:2,clear:1,wildcard:0}}),original=service.getSnapshot()!;
 assert.deepEqual(original.profile.settings,{sound:true,reducedMotion:false});assert.equal(Object.prototype.hasOwnProperty.call(original.profile.settings,'music'),false);assert.equal(original.formatVersion,4);assert.equal(original.wallet,555);assert.deepEqual(createAccountService(storage,held(),()=>NOW).getSnapshot(),original);
 for(const music of [false,true]){const saved=send(service,{operationId:`music.${music}`,type:'setSettings',patch:{music}});assert.equal(saved.status,'acknowledged',saved.message);assert.equal(saved.account!.profile.settings.music,music);assert.equal(saved.account!.wallet,555);assert.deepEqual(saved.account!.inventory,original.inventory);assert.equal(saved.account!.formatVersion,4);assert.equal(saved.account!.economyVersion,2);assert.deepEqual(createAccountService(storage,held(),()=>NOW).getSnapshot(),saved.account);}
 for(const patch of [{music:'false'},{music:undefined},{extra:true}]){const invalid=structuredClone(service.getSnapshot()!);Object.assign(invalid.profile.settings,patch);assert.throws(()=>assertAccountSnapshot(invalid));}
});
