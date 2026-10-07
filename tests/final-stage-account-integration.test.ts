import test from 'node:test';
import assert from 'node:assert/strict';
import {createAccountService,accountDailyAvailability,accountDisplayProfile,type StartIntent,type AccountRequest} from '../src/application/account-service.ts';
import {ACCOUNT_KEYS,encodeAccount} from '../src/application/account-store.ts';
import {assertAccountSnapshot} from '../src/application/account-profile.ts';
import {localDailyChallenge} from '../src/application/profile.ts';
import {advanceGuide,guideOverlay,isGuideComplete} from '../src/application/tutorials.ts';
import {INBOUND_GUIDE_V14} from '../src/application/inbound-guide-v14.ts';
import {createRunV15,applyCommandV15} from '../src/domain/v15/engine.ts';
import {applyCommandV14} from '../src/domain/v14/engine.ts';
import {playableChecksum,isInboundV14,isInboundV15} from '../src/domain/playable.ts';
import type {AccountSnapshot,GuideProgress} from '../src/application/account-types.ts';
import {FaultStorage,makeAccountFixture} from './helpers/account-fixtures.ts';

const held={status:'held' as const,release(){}};
const beforeMidnight=Date.parse('2026-10-06T15:59:59Z'),afterMidnight=Date.parse('2026-10-06T16:00:01Z');
function setup(patch:Partial<AccountSnapshot>={},time=beforeMidnight){
 const storage=new FaultStorage(),account=makeAccountFixture({generation:1,lastOperation:{operationId:'fixture',expectedGeneration:0,requestDigest:'fixture',committedGeneration:1},...patch});
 for(const key of [ACCOUNT_KEYS.a,ACCOUNT_KEYS.b])storage.values.set(key,encodeAccount(account));
 return {storage,service:createAccountService(storage,held,()=>time)};
}
function intent(version:14|15=15,mode:'standard'|'daily'|'endless'='standard'):StartIntent{return {spec:{family:'inbound',mode,rulesetVersion:version,seed:1,guided:false,toolCharges:{rotate:0,clear:0,wildcard:0}},items:[],guide:'direct'};}
function send(service:ReturnType<typeof createAccountService>,request:AccountRequest){return service.transact(request,service.getSnapshot()!.generation);}

test('rules15 starts, reserves tools, rejects pre-cleanup elapsed time, persists and restores with economy2',()=>{
 const {storage,service}=setup({inventory:{rotate:1,clear:0,wildcard:0}});
 const started=send(service,{type:'start',operationId:'start15',intent:{...intent(),items:['rotate']}});assert.equal(started.status,'acknowledged',started.message);
 const run=started.account!.run!;assert.equal(run.state.rulesetVersion,15);assert.equal(run.identity.runConfigId,'run.inbound_v15');assert.equal(run.identity.economyVersion,2);assert.deepEqual(run.reserved,['rotate']);
 assert.equal(send(service,{type:'saveElapsed',operationId:'clock',runId:run.identity.runId,elapsedMs:1}).status,'not_committed');
 const chosen=send(service,{type:'command',operationId:'cleanup',runId:run.identity.runId,command:{type:'chooseCleanup',branch:'placements'}});assert.equal(chosen.status,'acknowledged',chosen.message);
 const restored=createAccountService(storage,held,()=>afterMidnight).getSnapshot()!;assert.deepEqual(restored,chosen.account);assert.doesNotThrow(()=>assertAccountSnapshot(restored));
 const closed=send(service,{type:'close',operationId:'close',runId:run.identity.runId,reason:'home'});assert.equal(closed.status,'acknowledged',closed.message);assert.equal(closed.account?.inventory.rotate,1);
});

test('rules15 daily binds the Shanghai start date and new seed namespace while old14 restores without conversion',()=>{
 const next=localDailyChallenge(beforeMidnight,15),old=localDailyChallenge(beforeMidnight,14);assert.equal(next.day,'2026-10-06');assert.notEqual(next.seed,old.seed);
 const {service:fresh}=setup();const started=send(fresh,{type:'start',operationId:'daily15',intent:intent(15,'daily')});assert.equal(started.status,'acknowledged',started.message);
 assert.equal(started.account!.run!.state.seed,next.seed);assert.equal(started.account!.run!.identity.challengeDay,next.day);assert.equal(accountDailyAvailability(started.account!,afterMidnight,15).day,'2026-10-07');
 const {service:oldService}=setup();const oldStarted=send(oldService,{type:'start',operationId:'daily14',intent:intent(14,'daily')});assert.equal(oldStarted.status,'acknowledged',oldStarted.message);
 const {service:restored}=setup(oldStarted.account!,afterMidnight),run=restored.getSnapshot()!.run!;assert.ok(isInboundV14(run.state));assert.equal(run.state.seed,old.seed);assert.equal(run.identity.challengeDay,old.day);
 const command={type:'chooseCleanup' as const,branch:'orders' as const},expected=applyCommandV14(run.state,command),continued=send(restored,{type:'command',operationId:'old.branch',runId:run.identity.runId,command});
 assert.equal(continued.status,'acknowledged',continued.message);assert.equal(continued.account!.run!.state.rulesetVersion,14);assert.equal(playableChecksum(continued.account!.run!.state),playableChecksum(expected.state));
});

test('daily completion locks remain shared across14 and15 and survive display reset without rewriting paid ledgers',()=>{
 const day='2026-10-06',paid={[day]:{bestBase:40,paid:80}},rewards={[day]:{completedRunId:'old14.win',bonusPaid:110}};
 const {service}=setup({formatVersion:2,economyVersion:2,dailyPaid:paid,dailyRewards:rewards});
 for(const version of [14,15] as const){assert.equal(accountDailyAvailability(service.getSnapshot(),beforeMidnight,version).available,false);assert.equal(send(service,{type:'start',operationId:`blocked.${version}`,intent:intent(version,'daily')}).status,'not_committed');}
 assert.equal(send(service,{type:'resetResults',operationId:'reset'}).status,'acknowledged');assert.deepEqual(service.getSnapshot()!.dailyPaid,paid);assert.deepEqual(service.getSnapshot()!.dailyRewards,rewards);
 const {service:tomorrow}=setup(service.getSnapshot()!,afterMidnight);const next=send(tomorrow,{type:'start',operationId:'tomorrow',intent:intent(15,'daily')});assert.equal(next.status,'acknowledged',next.message);assert.equal(next.account!.run!.identity.challengeDay,'2026-10-07');assert.deepEqual(next.account!.dailyPaid,paid);assert.deepEqual(next.account!.dailyRewards,rewards);
});

test('rules15 guided routes teach all required lessons with actual generated multi-cell rush and no upgrade lesson',()=>{
 for(const branch of ['orders','placements'] as const){
  let state=createRunV15({seed:INBOUND_GUIDE_V14.seed,mode:'standard',guided:true}),progress:GuideProgress={learned:[],skipped:false,authoredStartConsumed:true};let rushSeen=false;
  for(const command of INBOUND_GUIDE_V14.branches[branch]){
   const overlay=guideOverlay('inbound',progress,state);if(command.type==='place'&&!isGuideComplete('inbound',progress,15))assert.deepEqual(overlay?.expectedCommand,command);
   const result=applyCommandV15(state,command);assert.equal(result.error,undefined);if(command.type==='place'&&state.candidates.find(piece=>piece.id===command.pieceId)?.trait==='rush')rushSeen=true;
   progress=advanceGuide('inbound',progress,state,command,result);state=result.state;
  }
  assert.equal(rushSeen,true);assert.equal(isGuideComplete('inbound',progress,15),true);assert.equal(progress.learned.includes('upgrade'),false);assert.equal(guideOverlay('inbound',progress,state),null);
 }
});

test('rules15 result buckets project ordinary and daily progress under the same achievement rules',()=>{
 const account=makeAccountFixture(),bucket={runs:1,units:30,maxUnits:30,score:12000,wins:1,retirements:0,maxChain:3,best:{score:12000,units:30,chain:3}};
 account.profile.results={'inbound.standard.v15.plain':bucket,'inbound.daily.v15.plain':bucket,'inbound.endless.v14.plain':{...bucket,units:500,maxUnits:500}};
 assert.doesNotThrow(()=>assertAccountSnapshot(account));const profile=accountDisplayProfile(account);assert.equal(profile.stats.orders,60);assert.equal(profile.stats.wins,2);assert.ok(profile.achievements.includes('five_shifts'));assert.equal(profile.achievements.includes('ship_100'),false);
 assert.equal(isInboundV15(createRunV15({seed:1,mode:'standard'})),true);
});

function closingFixture(version:14|15,mode:'standard'|'daily',dailyPaid:AccountSnapshot['dailyPaid']={}){
 const {service}=setup({dailyPaid});const started=send(service,{type:'start',operationId:`prepare.${version}.${mode}`,intent:intent(version,mode)});assert.equal(started.status,'acknowledged',started.message);
 const runId=started.account!.run!.identity.runId;const chosen=send(service,{type:'command',operationId:'prepare.branch',runId,command:{type:'chooseCleanup',branch:'orders'}});assert.equal(chosen.status,'acknowledged',chosen.message);
 const account=structuredClone(chosen.account!),run=account.run!,state=run.state;assert.ok(isInboundV14(state)||isInboundV15(state));
 state.shift=5;state.completedOrders=29;state.score=11900;state.board.fill(null);state.cellTraits.fill(null);
 state.candidates[0]={id:state.candidates[0].id,shapeId:'shape.single',cargo:'cargo.food',quarterTurns:0,trait:'rush',rushTurns:3};
 state.orders=[{id:'closing.food',dockId:'dock.north',cargo:'cargo.food',amount:3,baseScore:200},
  {id:'waiting.machine',dockId:'dock.east',cargo:'cargo.machine',amount:5,baseScore:200},
  {id:'waiting.chem',dockId:'dock.south',cargo:'cargo.chem',amount:5,baseScore:200},
  {id:'waiting.cold',dockId:'dock.west',cargo:'cargo.cold',amount:5,baseScore:200}];
 for(const cell of [8,9,10])state.board[cell]='cargo.food';
 run.creditedBase=Math.floor(state.score/120);run.earnedCoins=run.creditedBase;account.wallet=run.creditedBase;
 return {account,command:{type:'place' as const,pieceId:state.candidates[0].id,origin:{x:6,y:6}}};
}

test('rules15 completed daily pays the unchanged score-based bonus once while retaining prior paid evidence',()=>{
 const day='2026-10-06',paid={[day]:{bestBase:40,paid:80}},{account,command}=closingFixture(15,'daily',paid),before=structuredClone(account),runId=account.run!.identity.runId;
 const {storage,service}=setup(account);const request:AccountRequest={type:'command',operationId:'finish.daily15',runId,command};
 const won=send(service,request);assert.equal(won.status,'acknowledged',won.message);const result=won.account!,state=result.run!.state,base=Math.floor(state.score/120);
 assert.equal(state.result,'won');assert.equal(state.candidates.length,2);assert.equal(state.orders.length,3);
 assert.equal(result.run!.creditedBase,base);assert.equal(result.wallet-before.wallet,base-before.run!.creditedBase+Math.max(0,base*2-80));assert.equal(result.run!.earnedCoins,base+Math.max(0,base*2-80));
 assert.deepEqual(result.dailyPaid,paid);assert.deepEqual(result.dailyRewards?.[day],{completedRunId:runId,bonusPaid:base*2});assert.equal(result.profile.results['inbound.daily.v15.plain'].wins,1);
 assert.equal(service.transact(request,before.generation).account?.wallet,result.wallet);
 const restored=createAccountService(storage,held,()=>beforeMidnight);assert.deepEqual(restored.getSnapshot()!.run!.state,state);
 const closed=send(restored,{type:'close',operationId:'close.daily15',runId,reason:'decline_overtime'});assert.equal(closed.status,'acknowledged',closed.message);assert.equal(closed.account!.wallet,result.wallet);
 for(const version of [14,15] as const){const blocked=send(restored,{type:'start',operationId:`again.${version}`,intent:intent(version,'daily')});assert.equal(blocked.status,'not_committed');assert.match(blocked.message,/今日挑战已完成/);}
});

test('a restored14 daily win creates the same date lock for subsequent15 starts',()=>{
 const {account,command}=closingFixture(14,'daily'),{service}=setup(account),runId=account.run!.identity.runId;
 const won=send(service,{type:'command',operationId:'finish.old14',runId,command});assert.equal(won.status,'acknowledged',won.message);assert.equal(won.account!.run!.state.rulesetVersion,14);assert.equal(won.account!.run!.state.candidates.length,3);
 const closed=send(service,{type:'close',operationId:'close.old14',runId,reason:'decline_overtime'});assert.equal(closed.status,'acknowledged',closed.message);
 const blocked=send(service,{type:'start',operationId:'start.new15',intent:intent(15,'daily')});assert.equal(blocked.status,'not_committed');assert.match(blocked.message,/今日挑战已完成/);
});

test('rules15 standard terminal restoration and overtime retain economy2 and ordinary base coin formula',()=>{
 const {account,command}=closingFixture(15,'standard'),{storage,service}=setup(account),runId=account.run!.identity.runId;
 const won=send(service,{type:'command',operationId:'finish.standard15',runId,command});assert.equal(won.status,'acknowledged',won.message);assert.equal(won.account!.wallet,Math.floor(won.account!.run!.state.score/120));
 const restored=createAccountService(storage,held,()=>afterMidnight),continued=send(restored,{type:'command',operationId:'overtime15',runId,command:{type:'continueOvertime'}});assert.equal(continued.status,'acknowledged',continued.message);
 assert.equal(continued.account!.run!.identity.economyVersion,2);assert.equal(continued.account!.run!.state.overtime,true);assert.equal(continued.account!.run!.state.candidates.length,3);assert.equal(continued.account!.wallet,won.account!.wallet);
 assert.equal(continued.account!.profile.results['inbound.standard.v15.plain'].wins,1);
});
