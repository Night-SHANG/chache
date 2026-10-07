import test from 'node:test';
import assert from 'node:assert/strict';
import {createRunV18,applyCommandV18,findLegalMovesV18,asV16,fromV16} from '../src/domain/v18/engine.ts';
import {CARGO} from '../src/domain/rulesets/v1/content.ts';
import {scaledScoreV18} from '../src/domain/v18/content.ts';
import {checksumV18,replayV18} from '../src/domain/v18/replay.ts';
import type {InboundCommandV18} from '../src/domain/v18/types.ts';
import {createRunV16,applyCommandV16} from '../src/domain/v16/engine.ts';
import {refreshOrdersV16} from '../src/domain/v16/generation.ts';
import type {InboundDifficultyV18,InboundRunV18} from '../src/domain/v18/types.ts';
import type {AccountRun,AccountSnapshot} from '../src/application/account-types.ts';
import {assertGameRun,assertGameCommandShape,encodeGameRun,decodeGameRun} from '../src/application/game-codec.ts';
import {createAccountService,accountDailyAvailability,accountDisplayProfile} from '../src/application/account-service.ts';
import type {AccountRequest,StartIntent,AccountService} from '../src/application/account-service.ts';
import {assertAccountSnapshot} from '../src/application/account-profile.ts';
import {ACCOUNT_KEYS,encodeAccount,decodeAccount} from '../src/application/account-store.ts';
import {upgradeAccountGuides,guideTrackFor,freshGuideProgress} from '../src/application/account-guides.ts';
import {retainAccountCosmetics,accountCosmeticState} from '../src/application/cosmetics.ts';
import {advanceGuide,isGuideComplete} from '../src/application/tutorials.ts';
import {localDailyChallenge} from '../src/application/profile.ts';
import {accountDigest,canonicalStringify,readHistory,stageHistory} from '../src/application/history-store.ts';
import {FaultStorage,makeAccountFixture} from './helpers/account-fixtures.ts';

const DAY='2026-10-06',BEFORE=Date.parse(`${DAY}T15:59:59Z`);
const held=()=>({status:'held' as const,release(){}});
function install(patch:Partial<AccountSnapshot>={},clock=()=>BEFORE){
 const storage=new FaultStorage(),account=upgradeAccountGuides(retainAccountCosmetics(makeAccountFixture({formatVersion:2,economyVersion:2,dailyRewards:{},...patch})));
 const raw=encodeAccount(account);storage.values.set(ACCOUNT_KEYS.a,raw);storage.values.set(ACCOUNT_KEYS.b,raw);
 const service=createAccountService(storage,held(),clock);assert.ok(service.getSnapshot());storage.resetFault();return {storage,service,account};
}
function intent(mode:'standard'|'daily'|'endless'='standard',inboundDifficulty:InboundDifficultyV18='hard'):StartIntent{
 return {spec:{family:'inbound',rulesetVersion:18,mode,seed:1,guided:false,inboundDifficulty,toolCharges:{rotate:0,clear:0,wildcard:0}},items:[],guide:'direct'};
}
function send(service:AccountService,request:AccountRequest){return service.transact(request,service.getSnapshot()?.generation??0);}
function accountRun(state:InboundRunV18):AccountRun{
 return {identity:{runId:'test.epoch.1',serial:1,rulesetVersion:18,runConfigId:state.runConfigId,mode:state.mode,inboundDifficulty:state.inboundDifficulty,economyVersion:2,...(state.mode==='daily'?{challengeDay:DAY}:{})},state,
  history:{seed:state.seed,runConfigId:state.runConfigId,head:null,totalCommands:state.commandIndex,tail:state.commands},lifecycle:'active',reserved:[],creditedBase:0,earnedCoins:0,resultCursor:null} as AccountRun;
}
function enveloped(account:unknown){return canonicalStringify({formatVersion:1,generation:(account as AccountSnapshot).generation,digest:accountDigest(canonicalStringify(account)),account});}
// Explicit near-final boundary. Only the finishing shipment is played naturally.
function nearFinalShipment(inboundDifficulty:InboundDifficultyV18,mode:'standard'|'daily'='standard',rawScore=1201){
 let state=createRunV18({seed:mode==='daily'?localDailyChallenge(BEFORE,18).seed:17,mode,inboundDifficulty});
 if(mode==='daily')state=applyCommandV18(state,{type:'chooseCleanup',branch:'orders'}).state;
 state.completedOrders=29;state.shift=5;state.rawScore=rawScore;state.score=scaledScoreV18(rawScore,inboundDifficulty);
 state.candidates[0]={id:'boundary.last',shapeId:'shape.single',cargo:'cargo.food',quarterTurns:0};
 state.orders=['dock.north','dock.east','dock.south','dock.west'].map((dockId,index)=>({id:`boundary.order.${index}`,dockId,cargo:CARGO[index].id,amount:index===0?4:6,baseScore:200}));
 for(const cell of [8,9,10])state.board[cell]='cargo.food';
 return state;
}
const lastPlacement={type:'place' as const,pieceId:'boundary.last',origin:{x:4,y:1}};

test('rules18 codec accepts both formal modes and fixed hard daily with required raw score',()=>{
 for(const inboundDifficulty of ['hard','expert'] as const)for(const mode of ['standard','endless'] as const){const state=createRunV18({seed:4,mode,inboundDifficulty});assert.doesNotThrow(()=>assertGameRun(state));assert.deepEqual(decodeGameRun(encodeGameRun(state)),state);}
 const daily=createRunV18({seed:localDailyChallenge(BEFORE,18).seed,mode:'daily'});assert.deepEqual(decodeGameRun(encodeGameRun(daily)),daily);
});

test('rules18 command validator accepts real frozen command vocabulary and rejects invalid shape',()=>{
 assert.doesNotThrow(()=>assertGameCommandShape({type:'finish'},18));
 assert.doesNotThrow(()=>assertGameCommandShape({type:'place',pieceId:'piece.1',origin:{x:1,y:1}},18));
 for(const command of [{type:'upgrade',upgradeId:'warehouse_expand'},{type:'place',pieceId:'piece.1',origin:{x:7,y:1}},{type:['finish']},{type:'finish',extra:true}])assert.throws(()=>assertGameCommandShape(command,18));
});

test('new rules18 starts bind both tiers and modes with account4 economy2 while preserving owned assets',()=>{
 for(const inboundDifficulty of ['hard','expert'] as const)for(const mode of ['standard','endless'] as const){const {service}=install({wallet:555,inventory:{rotate:1,clear:1,wildcard:1}}),before=service.getSnapshot()!;const result=send(service,{operationId:'start',type:'start',intent:intent(mode,inboundDifficulty)});assert.equal(result.status,'acknowledged',result.message);assert.equal(result.account?.run?.identity.inboundDifficulty,inboundDifficulty);assert.equal(result.account?.run?.identity.rulesetVersion,18);assert.equal(result.account?.run?.state.mode,mode);assert.equal(result.account?.formatVersion,4);assert.equal(result.account?.economyVersion,2);assert.equal(result.account?.wallet,555);assert.deepEqual(result.account?.inventory,before.inventory);assert.deepEqual(result.account?.profile.ownedCosmetics,before.profile.ownedCosmetics);}
});

test('default daily availability and new daily identity use independent version18 date seed and hard tier',()=>{
 const {service}=install(),daily=localDailyChallenge(BEFORE,18);assert.equal(accountDailyAvailability(service.getSnapshot(),BEFORE).seed,daily.seed);
 const start=send(service,{operationId:'daily',type:'start',intent:intent('daily')});assert.equal(start.status,'acknowledged',start.message);assert.equal(start.account?.run?.identity.challengeDay,DAY);assert.equal(start.account?.run?.identity.inboundDifficulty,'hard');assert.equal(start.account?.run?.state.seed,daily.seed);
});

test('rules18 strict account envelope rejects missing raw score, score mismatch, coerced identity and wrong date',()=>{
 const state=createRunV18({seed:localDailyChallenge(BEFORE,18).seed,mode:'daily'}),run=accountRun(state),account=upgradeAccountGuides(retainAccountCosmetics(makeAccountFixture({formatVersion:2,economyVersion:2,dailyRewards:{},nextRunSerial:2,run})));
 assert.doesNotThrow(()=>assertAccountSnapshot(account));const {storage}=install();assert.deepEqual(decodeAccount(storage,encodeAccount(account)),account);
 for(const mutate of [(a:AccountSnapshot)=>{delete (a.run!.state as unknown as Record<string,unknown>).rawScore;},(a:AccountSnapshot)=>{a.run!.state.score=1;},(a:AccountSnapshot)=>{Object.assign(a.run!.identity,{rulesetVersion:'18'});},(a:AccountSnapshot)=>{Object.assign(a.run!.identity,{mode:['daily']});},(a:AccountSnapshot)=>{Object.assign(a.run!.identity,{inboundDifficulty:['hard']});},(a:AccountSnapshot)=>{a.run!.identity.challengeDay='2026-10-07';},(a:AccountSnapshot)=>{Object.assign(a.run!.identity,{difficultyId:'hard'}); }]){const bad=structuredClone(account);mutate(bad);assert.throws(()=>assertAccountSnapshot(bad));assert.throws(()=>decodeAccount(storage,enveloped(bad)));}
});

test('rules18 invalid mode tier guided starts and three tools cannot write or consume account assets',()=>{
 const invalid=[{mode:'guided'},{mode:['standard']},{inboundDifficulty:'normal'},{inboundDifficulty:['hard']},{inboundDifficulty:null},{mode:'daily',inboundDifficulty:'expert'},{guided:true}];
 for(const patch of invalid){const {service,storage}=install({wallet:800,inventory:{rotate:1,clear:1,wildcard:1}}),before=service.getSnapshot(),start=intent();Object.assign(start.spec,patch);if(patch.guided)start.guide='guided';const result=send(service,{operationId:'invalid',type:'start',intent:start});assert.equal(result.status,'not_committed');assert.deepEqual(service.getSnapshot(),before);assert.equal(storage.operations.filter(op=>op.kind==='set'||op.kind==='remove').length,0);}
 const {service,storage}=install({inventory:{rotate:1,clear:1,wildcard:1}}),start=intent();start.items=['rotate','clear','wildcard'];const before=service.getSnapshot();assert.equal(send(service,{operationId:'three',type:'start',intent:start}).status,'not_committed');assert.deepEqual(service.getSnapshot(),before);assert.equal(storage.operations.filter(op=>op.kind==='set').length,0);
});

test('omitted rules18 tier defaults to hard through the public account start',()=>{
 const {service}=install(),start=intent();if(start.spec.family==='inbound')delete start.spec.inboundDifficulty;const result=send(service,{operationId:'default',type:'start',intent:start});assert.equal(result.status,'acknowledged',result.message);assert.equal(result.account?.run?.identity.inboundDifficulty,'hard');
});

test('rules18 results use each mode tier and tool bucket without mixing existing16 keys',()=>{
 const {service}=install({inventory:{rotate:0,clear:0,wildcard:5}});let serial=0;
 for(const inboundDifficulty of ['hard','expert'] as const)for(const mode of ['standard','endless'] as const)for(const tools of [false,true]){
  const tx=(body:Omit<AccountRequest,'operationId'>)=>{const result=send(service,{...body,operationId:`bucket.${++serial}`} as AccountRequest);assert.equal(result.status,'acknowledged',result.message);return result;};
  const start=intent(mode,inboundDifficulty);start.items=tools?['wildcard']:[];tx({type:'start',intent:start} as Omit<AccountRequest,'operationId'>);const run=service.getSnapshot()!.run!;
  if(tools)tx({type:'command',runId:run.identity.runId,command:{type:'wildcard',pieceId:run.state.candidates[0].id}} as Omit<AccountRequest,'operationId'>);
  tx({type:'command',runId:run.identity.runId,command:{type:'finish'}} as Omit<AccountRequest,'operationId'>);assert.ok(service.getSnapshot()?.profile.results[`inbound.${mode}.v18.${inboundDifficulty}.${tools?'tools':'plain'}`]);tx({type:'close',runId:run.identity.runId,reason:'retired'} as Omit<AccountRequest,'operationId'>);
 }
 const daily=intent('daily');send(service,{operationId:'daily.start',type:'start',intent:daily});const id=service.getSnapshot()!.run!.identity.runId;
 assert.equal(send(service,{operationId:'daily.cleanup',type:'command',runId:id,command:{type:'chooseCleanup',branch:'orders'}}).status,'acknowledged');assert.equal(send(service,{operationId:'daily.finish',type:'command',runId:id,command:{type:'finish'}}).status,'acknowledged');assert.ok(service.getSnapshot()?.profile.results['inbound.daily.v18.hard.plain']);
 const account=service.getSnapshot()!;assert.equal(Object.keys(account.profile.results).length,9);assert.doesNotThrow(()=>assertAccountSnapshot(account));
 const bucket=account.profile.results['inbound.standard.v18.hard.plain'];for(const key of ['inbound.standard.v18.normal.plain','inbound.daily.v18.expert.plain','inbound.daily.v18.hard.tools','inbound.endless.v18.plain','inbound.guided.v18.hard.plain'])assert.throws(()=>assertAccountSnapshot({...account,profile:{...account.profile,results:{...account.profile.results,[key]:bucket}}}));
});

test('rules18 score and enum validation rejects corrupt snapshots without weakening16',()=>{
 const state=createRunV18({seed:4,mode:'standard',inboundDifficulty:'hard'});state.rawScore=3;state.score=4;assert.doesNotThrow(()=>assertGameRun(state));
 for(const patch of [{rawScore:undefined},{rawScore:NaN},{rawScore:'3'},{rawScore:-1},{score:5},{score:NaN},{inboundDifficulty:'normal'},{inboundDifficulty:['hard']},{mode:['standard']},{phase:['input']},{rulesetVersion:'18'},{extraIdentity:true},{guided:true},{runConfigId:'run.inbound_v18.expert'},{candidates:state.candidates.map((piece,index)=>index?piece:{...piece,trait:['hazard']})}])assert.throws(()=>assertGameRun({...state,...patch}));
 for(const inboundDifficulty of ['hard','expert'] as const){const old=createRunV16({seed:4,mode:'standard',inboundDifficulty});assert.throws(()=>assertGameRun({...old,rawScore:0}));assert.throws(()=>assertGameRun({...old,overtime:true,completedOrders:30,shift:5}));}
 for(const version of [17,'18',['18']]){const envelope=JSON.parse(encodeGameRun(state));envelope.schemaVersion=version;assert.throws(()=>decodeGameRun(JSON.stringify(envelope)));}
});

test('rules18 expert stage5 eight-unit orders survive both modes roundtrip and accepted account history',()=>{
 for(const mode of ['standard','endless'] as const){let state=createRunV18({seed:1,mode,inboundDifficulty:'expert'});const projected=asV16(state);projected.completedOrders=24;projected.shift=5;projected.orders=[];state=fromV16(refreshOrdersV16(projected));assert.ok(state.orders.some(order=>order.amount===8));assert.deepEqual(decodeGameRun(encodeGameRun(state)),state);
  const {service,storage}=install({nextRunSerial:2,run:accountRun(state)}),command={type:'place' as const,...findLegalMovesV18(state)[0]};const result=send(service,{operationId:'place',type:'command',runId:'test.epoch.1',command});assert.equal(result.status,'acknowledged',result.message);assert.deepEqual([...readHistory(storage,result.account!.run!.identity,result.account!.run!.history,result.account!.run!.history.tail)],[command]);assert.deepEqual(createAccountService(storage,held(),()=>BEFORE).getSnapshot()?.run,result.account?.run);
 }
});

test('rules18 daily uses the shared daily guide track and cleanup facts while formal guide completion stays short',()=>{
 const before=createRunV18({seed:4,mode:'daily'}),command={type:'chooseCleanup' as const,branch:'orders' as const},result=applyCommandV18(before,command);
 assert.equal(guideTrackFor(before),'daily');assert.deepEqual(advanceGuide('daily',freshGuideProgress(),before,command,result).learned,['sweepChoice']);assert.equal(isGuideComplete('inbound',{learned:['place','order','route'],skipped:false,authoredStartConsumed:false},18),true);
});

test('rules18 five shift and daily display achievements retain owned cosmetics through result reset',()=>{
 const bucket={runs:1,units:30,maxUnits:30,score:5000,wins:1,retirements:0,maxChain:3,best:{score:5000,units:30,chain:3}},account=install().account;
 for(const key of ['inbound.standard.v18.hard.plain','inbound.standard.v18.expert.tools','inbound.daily.v18.hard.plain']){const updated={...account,profile:{...account.profile,results:{[key]:bucket}}},display=accountDisplayProfile(updated);assert.equal(display.stats.orders,30);assert.ok(display.achievements.includes('first_shipment'));assert.equal(display.achievements.includes('five_shifts'),key.includes('.standard.'));assert.ok(accountCosmeticState(updated).ownedCosmetics.includes('forklift.blue'));assert.equal(accountCosmeticState(updated).ownedCosmetics.includes('forklift.red'),key.includes('.standard.'));}
 const earned=retainAccountCosmetics({...account,profile:{...account.profile,results:{'inbound.standard.v18.expert.tools':bucket}}}),{service}=install(earned);const owned=service.getSnapshot()!.profile.ownedCosmetics;assert.equal(send(service,{operationId:'reset',type:'resetResults'}).status,'acknowledged');assert.deepEqual(service.getSnapshot()?.profile.ownedCosmetics,owned);assert.deepEqual(service.getSnapshot()?.profile.results,{});
});

test('same tier rules18 overtime preserves raw score and pays cumulative final score once with idempotent close',()=>{
 for(const inboundDifficulty of ['hard','expert'] as const){const state=nearFinalShipment(inboundDifficulty),run=accountRun(state),{service,storage}=install({nextRunSerial:2,run}),placed=send(service,{operationId:'win',type:'command',runId:run.identity.runId,command:lastPlacement});assert.equal(placed.status,'acknowledged',placed.message);const won=placed.account!.run!.state as InboundRunV18;assert.equal(won.result,'won');assert.equal(won.score,scaledScoreV18(won.rawScore,inboundDifficulty));const base=Math.floor(won.score/120);assert.equal(placed.account?.wallet,base);
  const continued=send(service,{operationId:'overtime',type:'command',runId:run.identity.runId,command:{type:'continueOvertime'}});assert.equal(continued.status,'acknowledged',continued.message);const ongoing=continued.account!.run!.state as InboundRunV18;assert.equal(ongoing.rawScore,won.rawScore);assert.equal(ongoing.score,won.score);assert.equal(continued.operation?.coinDelta,0);assert.equal(continued.account?.run?.identity.runId,run.identity.runId);assert.equal(continued.account?.run?.identity.inboundDifficulty,inboundDifficulty);
  const close={operationId:'retire',type:'close' as const,runId:run.identity.runId,reason:'retired' as const},generation=service.getSnapshot()!.generation,closed=service.transact(close,generation);assert.equal(closed.status,'acknowledged',closed.message);assert.equal(closed.account?.wallet,base);assert.equal(closed.account?.lastClosedResult?.earnedCoins,base);assert.equal(closed.operation?.coinDelta,0);assert.equal(service.transact(close,generation).account?.wallet,base);assert.equal(createAccountService(storage,held(),()=>BEFORE).getSnapshot()?.wallet,base);
 }
});

test('rules18 failure pays base and allows retry; midnight daily win pays3x start day and survives reset reload',()=>{
 const failed=nearFinalShipment('hard','daily',1599);failed.phase='result';failed.result='failed';failed.endReason='blocked';failed.candidates.push({id:'boundary.unconsumed',shapeId:'shape.single',cargo:'cargo.food',quarterTurns:0});failed.candidates=failed.candidates.slice(0,3);
 // This failure is an explicit terminal fixture, rather than a naturally played defeat.
 failed.completedOrders=0;failed.shift=1;failed.orders=fromV16(refreshOrdersV16({...asV16(failed),orders:[]})).orders;failed.candidates=createRunV18({seed:4,mode:'standard'}).candidates;
 const {service}=install({nextRunSerial:2,run:accountRun(failed)}),closed=send(service,{operationId:'failed',type:'close',runId:'test.epoch.1',reason:'failed'});assert.equal(closed.status,'acknowledged',closed.message);assert.equal(closed.account?.wallet,Math.floor(failed.score/120));assert.equal(accountDailyAvailability(closed.account!,BEFORE).available,true);const retried=send(service,{operationId:'retry',type:'start',intent:intent('daily')});assert.equal(retried.status,'acknowledged',retried.message);assert.notEqual(retried.account?.run?.identity.runId,'test.epoch.1');
 const state=nearFinalShipment('hard','daily'),run=accountRun(state),clock=()=>BEFORE+2000,h=install({nextRunSerial:2,run},clock),won=send(h.service,{operationId:'dailywin',type:'command',runId:run.identity.runId,command:lastPlacement});assert.equal(won.status,'acknowledged',won.message);const base=Math.floor(won.account!.run!.state.score/120);assert.equal(won.account?.wallet,base*3);assert.equal(won.account?.dailyRewards?.[DAY].completedRunId,run.identity.runId);assert.equal(accountDailyAvailability(won.account!,BEFORE).completed,true);assert.equal(accountDailyAvailability(won.account!,BEFORE+2000).available,true);
 assert.equal(send(h.service,{operationId:'close',type:'close',runId:run.identity.runId,reason:'decline_overtime'}).status,'acknowledged');assert.equal(send(h.service,{operationId:'reset',type:'resetResults'}).status,'acknowledged');const restored=createAccountService(h.storage,held(),clock);assert.equal(restored.getSnapshot()?.wallet,base*3);assert.equal(accountDailyAvailability(restored.getSnapshot(),BEFORE).completed,true);const next=send(restored,{operationId:'tomorrow',type:'start',intent:intent('daily')});assert.equal(next.status,'acknowledged',next.message);assert.equal(next.account?.run?.identity.challengeDay,'2026-10-07');
});

test('an old16 paid day blocks new18 reward attempts and an old16 active preserves wallet inventory and identity',()=>{
 const {service,storage}=install({wallet:321,dailyRewards:{[DAY]:{completedRunId:'old16.win',bonusPaid:22}}}),before=service.getSnapshot();assert.equal(send(service,{operationId:'again',type:'start',intent:intent('daily')}).status,'not_committed');assert.deepEqual(service.getSnapshot(),before);assert.equal(storage.operations.filter(op=>op.kind==='set').length,0);
 const state=createRunV16({seed:8,mode:'standard',inboundDifficulty:'expert'}),run={...accountRun({...state,rulesetVersion:18,runConfigId:'run.inbound_v18.expert',guided:false,rawScore:0} as InboundRunV18),state,identity:{runId:'test.epoch.1',serial:1,rulesetVersion:16 as const,runConfigId:state.runConfigId,mode:'standard' as const,inboundDifficulty:'expert' as const,economyVersion:2 as const},history:{seed:state.seed,runConfigId:state.runConfigId,head:null,totalCommands:0,tail:[]}};
 const active=install({nextRunSerial:2,wallet:800,inventory:{rotate:1,clear:2,wildcard:3},run});assert.deepEqual(active.service.getSnapshot()?.run,run);const result=send(active.service,{operationId:'settings',type:'setSettings',patch:{sound:false}});assert.equal(result.status,'acknowledged',result.message);assert.deepEqual(result.account?.run,run);assert.equal(result.account?.wallet,800);assert.deepEqual(result.account?.inventory,{rotate:1,clear:2,wildcard:3});
});

test('rules18 immutable history supports128 command chunks with strict command validation',()=>{
 const state=createRunV18({seed:4,mode:'standard'}),run=accountRun(state),storage=new FaultStorage(),commands=Array.from({length:130},()=>({type:'finish' as const})),staged=stageHistory(storage,run.identity,run.history,commands,130);
 // Storage shape test only: these commands are not claimed to be a valid gameplay replay.
 assert.equal(staged.commandBaseIndex,128);assert.equal(staged.tail.length,2);assert.deepEqual([...readHistory(storage,run.identity,staged.cursor,staged.tail)],commands);assert.throws(()=>stageHistory(storage,run.identity,staged.cursor,[...staged.tail,{type:'upgrade',upgradeId:'warehouse_expand'}] as never,131));
});

test('seeded rules18 account commands replay the preserved history and conserve cumulative coins across reload',()=>{
 for(const inboundDifficulty of ['hard','expert'] as const)for(const mode of ['standard','endless','daily'] as const){if(mode==='daily'&&inboundDifficulty==='expert')continue;
  const h=install(),started=send(h.service,{operationId:'start',type:'start',intent:intent(mode,inboundDifficulty)});assert.equal(started.status,'acknowledged',started.message);let current=h.service,paid=0;const id=started.account!.run!.identity.runId,seed=started.account!.run!.state.seed;
  if(mode==='daily')assert.equal(send(current,{operationId:'choose',type:'command',runId:id,command:{type:'chooseCleanup',branch:'placements'}}).status,'acknowledged');
  for(let index=0;index<18;index++){const state=current.getSnapshot()!.run!.state as InboundRunV18;if(state.phase!=='input')break;const moves=findLegalMovesV18(state);assert.ok(moves.length);const result=send(current,{operationId:`natural.${index}`,type:'command',runId:id,command:{type:'place',...moves[0]}});assert.equal(result.status,'acknowledged',result.message);paid+=result.operation!.coinDelta;assert.equal(paid,Math.floor(result.account!.run!.state.score/120));if(index%4===0)current=createAccountService(h.storage,held(),()=>BEFORE);}
  const run=current.getSnapshot()!.run!,commands=[...readHistory(h.storage,run.identity,run.history,run.history.tail)] as InboundCommandV18[];assert.ok(commands.length>=4);const replayed=replayV18({seed,mode,inboundDifficulty},commands);assert.equal(checksumV18(replayed.state),checksumV18(run.state as InboundRunV18));assert.equal(run.creditedBase,Math.floor(run.state.score/120));assert.equal(run.earnedCoins,run.creditedBase);assert.equal(current.getSnapshot()?.wallet,paid);assert.deepEqual(decodeAccount(h.storage,encodeAccount(current.getSnapshot()!)),current.getSnapshot());
 }
});

test('single deferred and split command settlements give identical rules18 coin credit for each tier',()=>{
 for(const inboundDifficulty of ['hard','expert'] as const){const before=nearFinalShipment(inboundDifficulty,'standard',79),commands:InboundCommandV18[]=[lastPlacement,{type:'continueOvertime'},{type:'finish'}];let final=before;
  for(const command of commands){const result=applyCommandV18(final,command);assert.equal(result.error,undefined);final=result.state;}
  const single=install({nextRunSerial:2,run:accountRun(final)}),one=send(single.service,{operationId:'single',type:'close',runId:'test.epoch.1',reason:'retired'});assert.equal(one.status,'acknowledged',one.message);
  const split=install({nextRunSerial:2,run:accountRun(before)});let paid=0;
  for(const [index,command] of commands.entries()){const result=send(split.service,{operationId:`split.${index}`,type:'command',runId:'test.epoch.1',command});assert.equal(result.status,'acknowledged',result.message);paid+=result.operation!.coinDelta;}
  const many=send(split.service,{operationId:'split.close',type:'close',runId:'test.epoch.1',reason:'retired'});assert.equal(many.status,'acknowledged',many.message);paid+=many.operation!.coinDelta;assert.equal(one.account?.wallet,many.account?.wallet);assert.equal(paid,Math.floor(final.score/120));assert.equal(many.account?.lastClosedResult?.earnedCoins,Math.floor(final.score/120));assert.equal(one.account?.lastClosedResult?.score,scaledScoreV18(final.rawScore,inboundDifficulty));
 }
});

test('daily18 mirrored root faults and retries commit the scaled3x reward once and retain the date lock',()=>{
 const run=accountRun(nearFinalShipment('hard','daily')),request={operationId:'faultwin',type:'command' as const,runId:run.identity.runId,command:lastPlacement},probe=install({nextRunSerial:2,run});assert.equal(send(probe.service,request).status,'acknowledged');const writes=probe.storage.operations.map((operation,index)=>({operation,index:index+1})).filter(({operation})=>operation.kind==='set'&&(operation.key===ACCOUNT_KEYS.a||operation.key===ACCOUNT_KEYS.b));assert.equal(writes.length,2);const expected=probe.service.getSnapshot()!.wallet;
 for(const {index} of writes)for(const timing of ['before','after'] as const){const h=install({nextRunSerial:2,run}),generation=h.service.getSnapshot()!.generation;h.storage.resetFault({at:index,timing});let result=h.service.transact(request,generation);h.storage.resetFault();if(result.status!=='acknowledged')result=h.service.retryPending(request.operationId);assert.equal(result.status,'acknowledged',result.message);assert.equal(h.service.getSnapshot()?.wallet,expected);assert.equal(h.service.transact(request,generation).account?.wallet,expected);const restored=createAccountService(h.storage,held(),()=>BEFORE);assert.equal(restored.getSnapshot()?.wallet,expected);assert.equal(accountDailyAvailability(restored.getSnapshot(),BEFORE).completed,true);assert.equal(restored.getSnapshot()?.dailyRewards?.[DAY].completedRunId,run.identity.runId);}
});

test('an accepted old16 final daily shipment locks the same date against a new18 start after close and reload',()=>{
 const state=applyCommandV16(createRunV16({seed:localDailyChallenge(BEFORE,16).seed,mode:'daily'}),{type:'chooseCleanup',branch:'orders'}).state;
 // Explicit old16 final boundary; the final shipment and lock are real accepted commands.
 state.completedOrders=29;state.shift=5;state.score=1201;state.candidates[0]={id:'boundary.last',shapeId:'shape.single',cargo:'cargo.food',quarterTurns:0};state.orders=['dock.north','dock.east','dock.south','dock.west'].map((dockId,index)=>({id:`old16.order.${index}`,dockId,cargo:CARGO[index].id,amount:index===0?4:6,baseScore:200}));for(const cell of [8,9,10])state.board[cell]='cargo.food';
 const run:AccountRun={identity:{runId:'test.epoch.1',serial:1,rulesetVersion:16,runConfigId:state.runConfigId,mode:'daily',inboundDifficulty:'normal',economyVersion:2,challengeDay:DAY},state,history:{seed:state.seed,runConfigId:state.runConfigId,head:null,totalCommands:state.commandIndex,tail:state.commands},lifecycle:'active',reserved:[],creditedBase:0,earnedCoins:0,resultCursor:null},h=install({nextRunSerial:2,run});
 const won=send(h.service,{operationId:'oldwin',type:'command',runId:run.identity.runId,command:lastPlacement});assert.equal(won.status,'acknowledged',won.message);assert.equal(won.account?.dailyRewards?.[DAY].completedRunId,run.identity.runId);assert.equal(send(h.service,{operationId:'close16',type:'close',runId:run.identity.runId,reason:'decline_overtime'}).status,'acknowledged');
 const current=createAccountService(h.storage,held(),()=>BEFORE),before=current.getSnapshot();assert.equal(send(current,{operationId:'new18',type:'start',intent:intent('daily')}).status,'not_committed');assert.deepEqual(current.getSnapshot(),before);assert.ok(current.getSnapshot()?.profile.results['inbound.daily.v16.plain']);assert.equal(Object.keys(current.getSnapshot()!.profile.results).some(key=>key.includes('.v18.')),false);
});

test('account4 rules18 starts preserve purchased cosmetics tutorial settings wallet inventory and earned daily ledgers',()=>{
 const base=install().account,profile=base.profile,owned=[...profile.ownedCosmetics!,'cargo.wood','forklift.white','theme.harbor'].sort(),patch={formatVersion:4 as const,tutorialsEnabled:false,guides:base.guides,wallet:1777,inventory:{rotate:2,clear:3,wildcard:4},dailyPaid:{'2026-10-05':{bestBase:13,paid:26}},dailyRewards:{'2026-10-05':{completedRunId:'old16.day',bonusPaid:26}},profile:{...profile,ownedCosmetics:owned,cosmetics:{theme:'harbor' as const,cargo:'wood' as const,forklift:'white' as const},cargoOutline:true}},h=install(patch),before=h.service.getSnapshot()!,start=intent('endless','expert');start.items=['rotate','clear'];const result=send(h.service,{operationId:'preserve',type:'start',intent:start});assert.equal(result.status,'acknowledged',result.message);assert.equal(result.account?.tutorialsEnabled,false);assert.equal(result.account?.wallet,before.wallet);assert.deepEqual(result.account?.inventory,{rotate:1,clear:2,wildcard:4});assert.deepEqual(result.account?.profile.ownedCosmetics,owned);assert.deepEqual(result.account?.profile.cosmetics,before.profile.cosmetics);assert.deepEqual(result.account?.dailyPaid,before.dailyPaid);assert.deepEqual(result.account?.dailyRewards,before.dailyRewards);assert.deepEqual(result.account?.guides,before.guides);
});

test('rules18 closed identity and history reject coerced enums mismatched tier and wrong daily seed in valid envelopes',()=>{
 const state=nearFinalShipment('hard','daily'),h=install({nextRunSerial:2,run:accountRun(state)}),won=send(h.service,{operationId:'win',type:'command',runId:'test.epoch.1',command:lastPlacement});assert.equal(won.status,'acknowledged');const closed=send(h.service,{operationId:'close',type:'close',runId:'test.epoch.1',reason:'decline_overtime'}).account!;
 for(const mutate of [(a:AccountSnapshot)=>{Object.assign(a.lastClosedResult!.identity,{rulesetVersion:['18']});},(a:AccountSnapshot)=>{Object.assign(a.lastClosedResult!.identity,{mode:['daily']});},(a:AccountSnapshot)=>{Object.assign(a.lastClosedResult!.identity,{economyVersion:'2'});},(a:AccountSnapshot)=>{Object.assign(a.lastClosedResult!.identity,{inboundDifficulty:'expert',runConfigId:'run.inbound_v18.expert'});},(a:AccountSnapshot)=>{a.lastClosedResult!.history.seed++;},(a:AccountSnapshot)=>{Object.assign(a.lastClosedResult!.identity,{extra:true});},(a:AccountSnapshot)=>{Object.assign(a.lastClosedResult!.history.tail[1],{type:['place']});}]){const bad=structuredClone(closed);mutate(bad);assert.throws(()=>assertAccountSnapshot(bad));assert.throws(()=>decodeAccount(h.storage,enveloped(bad)));}
});
