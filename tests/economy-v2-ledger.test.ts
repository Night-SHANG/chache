import test from 'node:test';
import assert from 'node:assert/strict';
import * as accounts from '../src/application/account-service.ts';
import { baseCoins } from '../src/application/economy.ts';
import { ACCOUNT_KEYS, encodeAccount } from '../src/application/account-store.ts';
import { assertAccountSnapshot } from '../src/application/account-profile.ts';
import { localDailyChallenge, createProfile, encodeProfile, PROFILE_KEYS } from '../src/application/profile.ts';
import { createRunV14, applyCommandV14 } from '../src/domain/v14/engine.ts';
import { getStageV14 } from '../src/domain/v14/content.ts';
import { refreshOrdersV14 } from '../src/domain/v14/generation.ts';
import { createRunV12 } from '../src/domain/v12/engine.ts';
import { createRunV13 } from '../src/domain/v13/engine.ts';
import { createRunV11, applyCommandV11 } from '../src/domain/v11/engine.ts';
import { refreshOrdersV11 } from '../src/domain/v11/generation.ts';
import { accountDigest, canonicalStringify } from '../src/application/history-store.ts';
import { INBOUND_GUIDE_V14 } from '../src/application/inbound-guide-v14.ts';
import type { AccountSnapshot, AccountRun } from '../src/application/account-types.ts';
import type { InboundRunV14 } from '../src/domain/v14/types.ts';
import { FaultStorage, makeAccountFixture } from './helpers/account-fixtures.ts';

const DAY = '2026-10-06', BEFORE = Date.parse(`${DAY}T15:59:59Z`);
const held = () => ({ status: 'held' as const, release() {} });
const intent = (mode: 'standard'|'daily'|'endless' = 'daily'): accounts.StartIntent => ({
 spec:{family:'inbound',rulesetVersion:14,mode,seed:1,guided:false,toolCharges:{rotate:0,clear:0,wildcard:0}},items:[],guide:'direct',
});
function install(patch:Partial<AccountSnapshot> = {}, clock = () => BEFORE) {
 const storage = new FaultStorage();
 const account = makeAccountFixture({generation:1,lastOperation:{operationId:'fixture',expectedGeneration:0,committedGeneration:1,requestDigest:'fixture'},...patch});
 const raw = encodeAccount(account); storage.values.set(ACCOUNT_KEYS.a,raw); storage.values.set(ACCOUNT_KEYS.b,raw);
 const service = accounts.createAccountService(storage,held(),clock); assert.ok(service.getSnapshot()); storage.resetFault();
 return {storage,service,account};
}
function send(service:accounts.AccountService, request:accounts.AccountRequest) {return service.transact(request,service.getSnapshot()?.generation??0);}
function scoredRun(score:number,mode:'standard'|'daily'|'endless'='daily',won=false,economyVersion:1|2=2):AccountRun {
 let state = applyCommandV14(createRunV14({seed:1,mode}),{type:'chooseCleanup',branch:'orders'}).state;
 state = refreshOrdersV14({...state,score,completedOrders:won?30:0,shift:getStageV14(won?30:0),...(won?{phase:'result',result:'won',endReason:'completed'}:{})} as InboundRunV14);
 return {identity:{runId:'test.epoch.1',serial:1,rulesetVersion:14,runConfigId:state.runConfigId,mode,economyVersion,...(mode==='daily'?{challengeDay:DAY}:{})},state,history:{seed:state.seed,runConfigId:state.runConfigId,head:null,totalCommands:state.commandIndex,tail:state.commands},lifecycle:'active',reserved:[],creditedBase:0,earnedCoins:0,resultCursor:null};
}
function v2Run(run:AccountRun,patch:Partial<AccountSnapshot>={}) {return {formatVersion:2 as const,economyVersion:2 as const,dailyRewards:{},nextRunSerial:2,run,...patch};}

test('economy2 uses displayed score alone without milestone, unit cap, or tool penalty',()=>{
 assert.deepEqual([0,119,120,239,240,12000000].map(score=>baseCoins('inbound',0,score,2)),[0,0,1,1,2,100000]);
 assert.deepEqual([29,30,59,60,3000000].map(score=>baseCoins('outbound',0,score,2)),[0,1,1,2,100000]);
 assert.equal(baseCoins('inbound',Number.MAX_SAFE_INTEGER,120,2),1);
 assert.equal(baseCoins('outbound',0,Number.MAX_SAFE_INTEGER,2),Math.floor(Number.MAX_SAFE_INTEGER/30));
 assert.equal(baseCoins('inbound',30,10000,1),55);
});

test('new starts atomically upgrade account schema and bind economy2 while preserving wallet and old ledger',()=>{
 const {service,storage}=install({wallet:555,dailyPaid:{'2026-10-05':{bestBase:13,paid:26}}});
 const result=send(service,{operationId:'start',type:'start',intent:intent('standard')});
 assert.equal(result.status,'acknowledged',result.message);
 assert.equal(result.account?.economyVersion,2); assert.equal(result.account?.formatVersion,2);
 assert.equal(result.account?.run?.identity.economyVersion,2); assert.equal(result.account?.wallet,555);
 assert.deepEqual(result.account?.dailyPaid,{'2026-10-05':{bestBase:13,paid:26}});
 assert.deepEqual(result.account?.dailyRewards,{});
 assert.equal(storage.values.get(ACCOUNT_KEYS.a),storage.values.get(ACCOUNT_KEYS.b));
});

test('failure and abandonment get base coins, while first win gets three times base and locks its date',()=>{
 for(const won of [false,true]) {
  const run=scoredRun(1200,'daily',won),{service,storage}=install(v2Run(run));
  const result=send(service,{operationId:'close',type:'close',runId:run.identity.runId,reason:won?'decline_overtime':'home'});
  assert.equal(result.status,'acknowledged',result.message); assert.equal(result.account?.wallet,won?30:10);
  assert.equal(result.account?.lastClosedResult?.earnedCoins,won?30:10);
  assert.equal(accounts.accountDailyAvailability(result.account!,BEFORE).completed,won);
  const restored=accounts.createAccountService(storage,held(),()=>BEFORE);
  const retry=send(restored,{operationId:'retry',type:'start',intent:intent()});
  assert.equal(retry.status,won?'not_committed':'acknowledged');
  assert.equal(restored.getSnapshot()?.wallet,won?30:10);
 }
});

test('legacy bestBase <=43 proves no win; >=45 proves completed, old extras offset the new first-win award',()=>{
 for(const bestBase of [0,13,43,45,60]) {
  const dailyPaid={[DAY]:{bestBase,paid:Math.min(120,bestBase*2)}}, {service}=install({dailyPaid,wallet:500});
  assert.equal(accounts.accountDailyAvailability(service.getSnapshot(),BEFORE).completed,bestBase>=45);
  const result=send(service,{operationId:'daily',type:'start',intent:intent()});
  assert.equal(result.status,bestBase>=45?'not_committed':'acknowledged'); assert.equal(service.getSnapshot()?.wallet,500);
 }
 const run=scoredRun(12000,'daily',true),{service}=install(v2Run(run,{wallet:500,dailyPaid:{[DAY]:{bestBase:13,paid:26}}}));
 const result=send(service,{operationId:'win',type:'close',runId:run.identity.runId,reason:'decline_overtime'});
 assert.equal(result.status,'acknowledged',result.message); assert.equal(result.account?.wallet,774);
 assert.equal(result.account?.dailyRewards?.[DAY].bonusPaid,200);
});

test('cross-midnight win locks and pays its start date, leaving tomorrow available across reset and restart',()=>{
 const run=scoredRun(1200,'daily',true),{service,storage}=install(v2Run(run),()=>BEFORE+2000);
 const won=send(service,{operationId:'win',type:'close',runId:run.identity.runId,reason:'decline_overtime'});
 assert.equal(won.status,'acknowledged',won.message);
 assert.equal(accounts.accountDailyAvailability(won.account!,BEFORE).completed,true);
 assert.equal(accounts.accountDailyAvailability(won.account!,BEFORE+2000).available,true);
 assert.equal(send(service,{operationId:'reset',type:'resetResults'}).status,'acknowledged');
 const restored=accounts.createAccountService(storage,held(),()=>BEFORE+2000);
 assert.equal(accounts.accountDailyAvailability(restored.getSnapshot(),BEFORE).completed,true);
 const next=send(restored,{operationId:'tomorrow',type:'start',intent:intent()});
 assert.equal(next.status,'acknowledged',next.message); assert.equal(next.account?.run?.identity.challengeDay,'2026-10-07');
 assert.equal(next.account?.wallet,30);
});

test('explicit legacy win survives reset even when dailyPaid has no economic proof',()=>{
 const daily=localDailyChallenge(BEFORE,3),account=makeAccountFixture();
 account.profile.legacyResults.dailyHistory[daily.id]={day:daily.day,seed:daily.seed,rulesetVersion:3,score:0,orders:30,won:true};
 const {service,storage}=install({profile:account.profile});
 assert.equal(send(service,{operationId:'reset',type:'resetResults'}).status,'acknowledged');
 const restored=accounts.createAccountService(storage,held(),()=>BEFORE);
 assert.equal(accounts.accountDailyAvailability(restored.getSnapshot(),BEFORE).completed,true);
 assert.equal(send(restored,{operationId:'again',type:'start',intent:intent()}).status,'not_committed');
});

test('old bound runs retain economy1 settlement after account migration',()=>{
 const run=scoredRun(1200,'daily',false,1),{service}=install({nextRunSerial:2,run});
 const result=send(service,{operationId:'close',type:'close',runId:run.identity.runId,reason:'home'});
 assert.equal(result.status,'acknowledged',result.message); assert.equal(result.account?.economyVersion,2);
 assert.equal(result.account?.lastClosedResult?.identity.economyVersion,1); assert.equal(result.account?.wallet,0);
});

test('schema2 validator refuses missing reward ledger and unsupported run economy versions',()=>{
 const run=scoredRun(0),{account}=install(v2Run(run));
 const missing=structuredClone(account); delete missing.dailyRewards; assert.throws(()=>assertAccountSnapshot(missing));
 assert.throws(()=>assertAccountSnapshot({...account,run:{...run,identity:{...run.identity,economyVersion:3}}}));
});

test('legacy formula win proof has a strict gap between maximum failed and minimum completed entitlement',()=>{
 assert.equal(Math.max(...Array.from({length:30},(_,units)=>baseCoins('inbound',units,Number.MAX_SAFE_INTEGER,1))),43);
 assert.equal(baseCoins('inbound',30,0,1),45);
});

test('a failed result receives its base and permits another uniquely identified attempt',()=>{
 const run=scoredRun(2399);run.state={...run.state,phase:'result',result:'failed',endReason:'blocked'};
 const {service}=install(v2Run(run));
 const failed=send(service,{operationId:'failed',type:'close',runId:run.identity.runId,reason:'failed'});
 assert.equal(failed.status,'acknowledged',failed.message);assert.equal(failed.account?.wallet,19);
 const retry=send(service,{operationId:'again',type:'start',intent:intent()});
 assert.equal(retry.status,'acknowledged');assert.notEqual(retry.account?.run?.identity.runId,run.identity.runId);
 assert.equal(retry.account?.run?.earnedCoins,0);assert.equal(retry.account?.wallet,19);
});

test('normal completion through overtime keeps one cumulative paid cursor with no duplicate first thirty reward',()=>{
 const run=scoredRun(12000,'standard',true),{service}=install(v2Run(run));
 const continued=send(service,{operationId:'continue',type:'command',runId:run.identity.runId,command:{type:'continueOvertime'}});
 assert.equal(continued.status,'acknowledged',continued.message);assert.equal(continued.account?.wallet,100);
 assert.equal(continued.account?.run?.identity.runId,run.identity.runId);assert.equal(continued.account?.run?.creditedBase,100);
 const closed=send(service,{operationId:'retire',type:'close',runId:run.identity.runId,reason:'retired'});
 assert.equal(closed.status,'acknowledged',closed.message);assert.equal(closed.account?.wallet,100);
 assert.equal(closed.operation?.coinDelta,0);assert.equal(closed.account?.lastClosedResult?.earnedCoins,100);
});

test('prepared daily starts retain their original date across a failed write and midnight retry',()=>{
 for(const blockedKey of [ACCOUNT_KEYS.a,ACCOUNT_KEYS.b]){
  let now=BEFORE;const {storage,service}=install({},()=>now),write=storage.set.bind(storage);
  storage.set=(key,value)=>{if(key===blockedKey)throw Error('offline');write(key,value);};
  const request:accounts.AccountRequest={operationId:'prepared',type:'start',intent:intent()};
  const prepared=service.transact(request,1);assert.equal(prepared.status,blockedKey===ACCOUNT_KEYS.a?'committed_unmirrored':'not_committed');
  now+=2000;storage.set=write;
  const resumed=service.retryPending('prepared');assert.equal(resumed.status,'acknowledged',resumed.message);
  assert.equal(resumed.account?.run?.identity.challengeDay,DAY);
  assert.equal(resumed.account?.run?.state.seed,localDailyChallenge(BEFORE,14).seed);
 }
});

test('every before/after daily close fault atomically commits migration, bonus, lock and closure once',()=>{
 for(const economyVersion of [1,2] as const){
  const run=scoredRun(12000,'daily',true,economyVersion),patch=economyVersion===1?{nextRunSerial:2,run,wallet:7}:v2Run(run,{wallet:7});
  const baseline=install(patch),request:accounts.AccountRequest={operationId:'win',type:'close',runId:run.identity.runId,reason:'decline_overtime'};
  assert.equal(baseline.service.transact(request,1).status,'acknowledged');
  const operationCount=baseline.storage.operations.length,want=7+baseCoins('inbound',30,12000,economyVersion)*3;
  for(const timing of ['before','after'] as const)for(let at=1;at<=operationCount;at++){
   const {storage,service}=install(patch);storage.resetFault({timing,at});
   const first=service.transact(request,1);
   assert.equal(service.getSnapshot()?.wallet,first.status==='acknowledged'?want:7,`${economyVersion}/${timing}/${at}: speculative wallet`);
   storage.resetFault();const restarted=accounts.createAccountService(storage,held(),()=>BEFORE);
   const result:accounts.TransactionResult=restarted.getStatus()==='degraded'?restarted.retryPending('win'):restarted.transact(request,1);
   assert.equal(result.status,'acknowledged',`${economyVersion}/${timing}/${at}: ${result.message}`);
   assert.equal(result.account?.wallet,want);assert.equal(result.account?.run,null);assert.equal(result.account?.formatVersion,2);
   assert.equal(accounts.accountDailyAvailability(result.account!,BEFORE).completed,true);
   const writes=storage.operations.filter(op=>op.kind==='set').length;
   assert.equal(restarted.transact(request,1).status,'acknowledged');assert.equal(restarted.getSnapshot()?.wallet,want);
   assert.equal(storage.operations.filter(op=>op.kind==='set').length,writes);
  }
 }
});

test('overflow refuses the whole settlement and unknown account formats remain untouched',()=>{
 const run=scoredRun(1200,'daily',true),{service,storage}=install(v2Run(run,{wallet:Number.MAX_SAFE_INTEGER-10}));
 const before=new Map(storage.values),result=send(service,{operationId:'overflow',type:'close',runId:run.identity.runId,reason:'decline_overtime'});
 assert.equal(result.status,'not_committed');assert.deepEqual(storage.values,before);assert.deepEqual(service.getSnapshot()?.dailyRewards,{});
 const raw=JSON.parse(storage.values.get(ACCOUNT_KEYS.a)!);raw.account.economyVersion=3;
 const future=JSON.stringify(raw);storage.values.set(ACCOUNT_KEYS.a,future);storage.values.set(ACCOUNT_KEYS.b,future);
 const unknown=accounts.createAccountService(storage,held(),()=>BEFORE);storage.resetFault();
 assert.equal(unknown.transact({operationId:'start',type:'start',intent:intent()},1).status,'unknown');
 assert.equal(storage.operations.some(op=>op.kind==='set'),false);assert.equal(storage.values.get(ACCOUNT_KEYS.a),future);
});

test('a post-migration legacy result win also survives a later display reset',()=>{
 const daily=localDailyChallenge(BEFORE,3),run=scoredRun(0,'standard'),base=makeAccountFixture(v2Run(run));
 base.profile.legacyResults.dailyHistory[daily.id]={day:DAY,seed:daily.seed,rulesetVersion:3,score:100,orders:30,won:true};
 const {service}=install(base);
 const reset=send(service,{operationId:'reset',type:'resetResults'});assert.equal(reset.status,'acknowledged',reset.message);
 assert.equal(reset.account?.dailyRewards?.[DAY].completedRunId,`legacy.${DAY}`);
 assert.equal(accounts.accountDailyAvailability(reset.account!,BEFORE).completed,true);
});

test('legacy initialization preserves explicit wins from backup profiles even when the main display lacks them',()=>{
 const storage=new FaultStorage(),main=createProfile(),backup=createProfile(),daily=localDailyChallenge(BEFORE,3);
 backup.dailyHistory[daily.id]={day:DAY,seed:daily.seed,rulesetVersion:3,score:500,orders:30,won:true};
 storage.values.set(PROFILE_KEYS.main,encodeProfile(main));storage.values.set(PROFILE_KEYS.backup,encodeProfile(backup));
 const before=new Map(storage.values),service=accounts.createAccountService(storage,held(),()=>BEFORE);
 const result=service.transact({operationId:'blocked',type:'start',intent:intent()},0);
 assert.equal(result.status,'not_committed');assert.deepEqual(storage.values,before);
 const initialized=service.transact({operationId:'ordinary',type:'start',intent:intent('standard')},0);
 assert.equal(initialized.status,'acknowledged',initialized.message);
 assert.equal(accounts.accountDailyAvailability(initialized.account!,BEFORE).completed,true);
});

test('daily payout totals and their completion receipt cannot diverge in a digest-valid account',()=>{
 const run=scoredRun(1200,'daily',true),{service}=install(v2Run(run));
 const paid=send(service,{operationId:'paid',type:'close',runId:run.identity.runId,reason:'decline_overtime'}).account!;
 assert.equal(paid.lastClosedResult?.earnedCoins,30);
 assert.throws(()=>assertAccountSnapshot({...paid,dailyRewards:{}}));
 assert.throws(()=>assertAccountSnapshot({...paid,dailyRewards:{[DAY]:{completedRunId:'another.run',bonusPaid:20}}}));
 assert.throws(()=>assertAccountSnapshot({...paid,lastClosedResult:{...paid.lastClosedResult,earnedCoins:29}}));
 assert.throws(()=>assertAccountSnapshot({...paid,dailyRewards:{[DAY]:{completedRunId:run.identity.runId,bonusPaid:19}}}));
});

test('real outbound multi-shipment tool events pay scaled cumulative score exactly once without tool penalty',()=>{
 for(const version of [12,13] as const)for(const difficulty of ['easy','normal','hard','expert'] as const){
  const state=(version===12?createRunV12:createRunV13)(17,difficulty,{rotate:1,clear:1,wildcard:0});
  state.completedOrders=29;state.shift=5;
  for(const cell of [67,75,77])state.board[cell]='cargo.machine';
  for(const cell of [4,13,22,31])state.board[cell]='cargo.food';
  for(const cell of [44,43,42,41])state.board[cell]='cargo.chem';
  for(const cell of [36,37,38,39])state.board[cell]='cargo.machine';
  const run:AccountRun={identity:{runId:'test.epoch.1',serial:1,rulesetVersion:version,runConfigId:state.runConfigId,mode:version===12?'outbound':'outboundEndless',difficultyId:difficulty,economyVersion:2},state,history:{seed:17,runConfigId:state.runConfigId,head:null,totalCommands:0,tail:[]},lifecycle:'active',reserved:['rotate','clear'],creditedBase:0,earnedCoins:0,resultCursor:null};
  const {service,storage}=install(v2Run(run)),command:accounts.AccountRequest={operationId:'clear',type:'command',runId:run.identity.runId,command:{type:'clear',cells:[67]}};
  const result=service.transact(command,1);assert.equal(result.status,'acknowledged',result.message);
  const displayed={easy:120,normal:150,hard:180,expert:240}[difficulty];
  assert.equal(result.account?.run?.state.score,displayed);assert.equal(result.account?.wallet,Math.floor(displayed/30));
  assert.equal(result.events?.filter(event=>event.type==='shipment').reduce((sum,event)=>sum+event.score,0),displayed);
  assert.equal(service.transact(command,1).account?.wallet,Math.floor(displayed/30));
  const restored=accounts.createAccountService(storage,held(),()=>BEFORE);
  const closed=send(restored,{operationId:'close',type:'close',runId:run.identity.runId,reason:version===12?'decline_overtime':'retired'});
  assert.equal(closed.status,'acknowledged',closed.message);assert.equal(closed.account?.wallet,Math.floor(displayed/30));
  assert.equal(closed.account?.lastClosedResult?.earnedCoins,Math.floor(displayed/30));assert.equal(closed.operation?.coinDelta,0);
  assert.deepEqual(closed.account?.inventory,{rotate:1,clear:0,wildcard:0});
 }
});

test('many real inbound score increments conserve cumulative entitlement through restart, reset, and abandonment',()=>{
 const {service,storage}=install(),guided=intent('standard');guided.guide='guided';
 if(guided.spec.family==='inbound')guided.spec.guided=true;
 const started=send(service,{operationId:'guided',type:'start',intent:guided});assert.equal(started.status,'acknowledged',started.message);
 const runId=started.account!.run!.identity.runId;let current=service,paid=0,score=0;
 for(const [index,command] of INBOUND_GUIDE_V14.branches.orders.entries()){
  const result=send(current,{operationId:`move.${index}`,type:'command',runId,command});assert.equal(result.status,'acknowledged',result.message);
  score=result.account!.run!.state.score;paid+=result.operation!.coinDelta;
  assert.equal(paid,Math.floor(score/120));assert.equal(result.account?.run?.earnedCoins,paid);
  if(index%5===0)current=accounts.createAccountService(storage,held(),()=>BEFORE);
  if(index===15)assert.equal(send(current,{operationId:'reset',type:'resetResults'}).status,'acknowledged');
 }
 const closed=send(current,{operationId:'home',type:'close',runId,reason:'home'});
 assert.equal(closed.status,'acknowledged',closed.message);assert.equal(closed.operation?.coinDelta,0);
 assert.equal(closed.account?.wallet,Math.floor(score/120));assert.equal(closed.account?.lastClosedResult?.earnedCoins,paid);
});

test('unreleased prototype outbound save without rawScore fails closed and retains both original roots',()=>{
 const state=createRunV12(1,'normal'),run:AccountRun={identity:{runId:'prototype',serial:1,rulesetVersion:12,runConfigId:state.runConfigId,mode:'outbound',difficultyId:'normal',economyVersion:1},state,history:{seed:1,runConfigId:state.runConfigId,head:null,totalCommands:0,tail:[]},lifecycle:'active',reserved:[],creditedBase:0,earnedCoins:0,resultCursor:null};
 const {storage}=install({nextRunSerial:2,run}),raw=JSON.parse(storage.values.get(ACCOUNT_KEYS.a)!);
 delete raw.account.run.state.rawScore;raw.digest=accountDigest(canonicalStringify(raw.account));const old=canonicalStringify(raw);
 storage.values.set(ACCOUNT_KEYS.a,old);storage.values.set(ACCOUNT_KEYS.b,old);
 const service=accounts.createAccountService(storage,held(),()=>BEFORE);storage.resetFault();
 assert.equal(service.getSnapshot(),null);assert.equal(service.transact({operationId:'overwrite',type:'start',intent:intent('standard')},1).status,'unknown');
 assert.equal(storage.operations.some(op=>op.kind==='set'),false);assert.equal(storage.values.get(ACCOUNT_KEYS.a),old);assert.equal(storage.values.get(ACCOUNT_KEYS.b),old);
});

test('a legitimately ongoing economy1 retry remains playable and retains the old formula despite a completed date',()=>{
 let state=applyCommandV11(createRunV11({seed:17,mode:'daily'}),{type:'chooseCleanup',branch:'orders'}).state;
 state=refreshOrdersV11({...state,completedOrders:10,score:1200,shift:2});
 const run:AccountRun={identity:{runId:'old.ongoing',serial:1,rulesetVersion:11,runConfigId:state.runConfigId,mode:'daily',challengeDay:DAY,economyVersion:1},state,history:{seed:17,runConfigId:state.runConfigId,head:null,totalCommands:state.commandIndex,tail:state.commands},lifecycle:'active',reserved:[],creditedBase:0,earnedCoins:0,resultCursor:null};
 const {service,storage}=install({run,nextRunSerial:2,wallet:900,dailyPaid:{[DAY]:{bestBase:60,paid:120}}});
 const timed=send(service,{operationId:'resume',type:'saveElapsed',runId:run.identity.runId,elapsedMs:100});
 assert.equal(timed.status,'acknowledged',timed.message);assert.equal(timed.account?.run?.identity.economyVersion,1);
 const restored=accounts.createAccountService(storage,held(),()=>BEFORE),closed=send(restored,{operationId:'close',type:'close',runId:run.identity.runId,reason:'home'});
 assert.equal(closed.status,'acknowledged',closed.message);assert.equal(closed.account?.wallet,911);
 assert.equal(closed.account?.lastClosedResult?.earnedCoins,11);
 assert.deepEqual(closed.account?.dailyPaid[DAY],{bestBase:60,paid:120});
 assert.equal(send(restored,{operationId:'new.daily',type:'start',intent:intent()}).status,'not_committed');
});
