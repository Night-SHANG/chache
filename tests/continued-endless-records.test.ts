import test from 'node:test';
import assert from 'node:assert/strict';
import {createRunV18,applyCommandV18,findLegalMovesV18} from '../src/domain/v18/engine.ts';
import {scaledScoreV18} from '../src/domain/v18/content.ts';
import type {InboundDifficultyV18,InboundRunV18} from '../src/domain/v18/types.ts';
import {CARGO} from '../src/domain/rulesets/v1/content.ts';
import {reservedEntryCellsV16} from '../src/domain/v16/board.ts';
import type {AccountRun,ResultBucket} from '../src/application/account-types.ts';
import {recordAccountResult,assertAccountSnapshot} from '../src/application/account-profile.ts';
import {createAccountService,accountDisplayProfile} from '../src/application/account-service.ts';
import type {AccountService,AccountRequest} from '../src/application/account-service.ts';
import {ACCOUNT_KEYS,encodeAccount} from '../src/application/account-store.ts';
import {upgradeAccountGuides} from '../src/application/account-guides.ts';
import {retainAccountCosmetics} from '../src/application/cosmetics.ts';
import {baseCoins} from '../src/application/economy.ts';
import {FaultStorage,makeAccountFixture} from './helpers/account-fixtures.ts';

const five=(tier:InboundDifficultyV18,tools=false)=>`inbound.standard.v18.${tier}.${tools?'tools':'plain'}`;
const endless=(tier:InboundDifficultyV18,tools=false)=>`inbound.endless.v18.${tier}.${tools?'tools':'plain'}`;
const held=()=>({status:'held' as const,release(){}});
function send(service:AccountService,request:AccountRequest){return service.transact(request,service.getSnapshot()!.generation);}
function boot(storage:FaultStorage){const service=createAccountService(storage,held(),()=>0);assert.ok(service.getSnapshot());return service;}
// Explicit near-final boundary fixture; its last shipment and continuation use the real engine.
function wonBoundary(tier:InboundDifficultyV18='hard',tool:'unused'|'used'|'none'='none'){
 let state=createRunV18({seed:17,mode:'standard',inboundDifficulty:tier,toolCharges:{rotate:0,clear:0,wildcard:tool==='none'?0:1}});
 if(tool==='used')state=applyCommandV18(state,{type:'wildcard',pieceId:state.candidates[0].id}).state;
 state.completedOrders=29;state.shift=5;state.rawScore=5400;state.score=scaledScoreV18(state.rawScore,tier);
 state.candidates[0]={id:'boundary.last',shapeId:'shape.single',cargo:'cargo.food',quarterTurns:0};
 state.orders=['dock.north','dock.east','dock.south','dock.west'].map((dockId,index)=>({id:`boundary.order.${index}`,dockId,cargo:CARGO[index].id,amount:index===0?4:6,baseScore:200}));
 for(const cell of [8,9,10])state.board[cell]='cargo.food';
 const result=applyCommandV18(state,{type:'place',pieceId:'boundary.last',origin:{x:4,y:1}});assert.equal(result.error,undefined);assert.equal(result.state.endReason,'completed');return result.state;
}
function fixture(state=wonBoundary(),results:Record<string,ResultBucket>={}){
 const base=baseCoins('inbound',state.completedOrders,state.score,2);
 const run:AccountRun={identity:{runId:'test.epoch.1',serial:1,rulesetVersion:18,runConfigId:state.runConfigId,mode:'standard',inboundDifficulty:state.inboundDifficulty,economyVersion:2},state,history:{seed:state.seed,runConfigId:state.runConfigId,head:null,totalCommands:state.commandIndex,tail:state.commands},lifecycle:'active',reserved:state.toolCharges.wildcard?['wildcard']:[],creditedBase:base,earnedCoins:base,resultCursor:null};
 let account=upgradeAccountGuides(retainAccountCosmetics(makeAccountFixture({formatVersion:2,economyVersion:2,dailyRewards:{},wallet:base,nextRunSerial:2,run})));
 account.profile.results=results;account=recordAccountResult(account,account.run!);
 const storage=new FaultStorage(),raw=encodeAccount(account);storage.values.set(ACCOUNT_KEYS.a,raw);storage.values.set(ACCOUNT_KEYS.b,raw);
 return {storage,service:boot(storage),account,runId:run.identity.runId};
}
function continueRun(service:AccountService,runId:string){const result=send(service,{operationId:'continue',type:'command',runId,command:{type:'continueOvertime'}});assert.equal(result.status,'acknowledged',result.message);return result.account!;}

// Mutation target: treating every bucket-key change as a tool migration erases the frozen five record.
test('five win survives boot, continuation and retirement as a separate cumulative endless result in both tiers',()=>{
 for(const tier of ['hard','expert'] as const){const {storage,account,runId}=fixture(wonBoundary(tier));let service=boot(storage);
  const checkpoint=structuredClone(account.profile.results[five(tier)]),identity=structuredClone(account.run!.identity),coins=account.wallet;
  const continued=continueRun(service,runId);assert.deepEqual(continued.run!.identity,identity);assert.equal(continued.run!.state.mode,'standard');assert.equal(continued.run!.state.overtime,true);assert.equal(continued.wallet,coins);
  assert.equal(send(service,{operationId:'continue.twice',type:'command',runId,command:{type:'continueOvertime'}}).status,'not_committed');
  service=boot(storage);const closed=send(service,{operationId:'retire',type:'close',runId,reason:'retired'});assert.equal(closed.status,'acknowledged',closed.message);
  assert.deepEqual(closed.account!.profile.results[five(tier)],checkpoint);const bucket=closed.account!.profile.results[endless(tier)];assert.ok(bucket);assert.equal(bucket.score,account.run!.state.score);assert.equal(bucket.units,30);assert.equal(bucket.runs,1);assert.equal(bucket.wins,0);assert.equal(bucket.retirements,1);
  assert.equal(closed.account!.wallet,coins);assert.equal(closed.account!.lastClosedResult!.earnedCoins,coins);assert.equal(closed.operation!.coinDelta,0);assert.equal(boot(storage).getSnapshot()!.lastClosedResult!.identity.runId,runId);
 }
});

test('first personal tool after continuing creates tools endless while keeping the plain five result fixed',()=>{
 const {service,account,runId}=fixture(wonBoundary('hard','unused'));const checkpoint=account.profile.results[five('hard')];continueRun(service,runId);
 const state=service.getSnapshot()!.run!.state;const use=send(service,{operationId:'use',type:'command',runId,command:{type:'wildcard',pieceId:state.candidates[0].id}});assert.equal(use.status,'acknowledged',use.message);
 const closed=send(service,{operationId:'retire',type:'close',runId,reason:'retired'});assert.equal(closed.status,'acknowledged',closed.message);assert.deepEqual(closed.account!.profile.results[five('hard')],checkpoint);assert.equal(closed.account!.profile.results[five('hard',true)],undefined);assert.ok(closed.account!.profile.results[endless('hard',true)]);assert.equal(closed.account!.inventory.wildcard,0);
});

test('a tool already used during five shifts keeps both records in their own tools buckets',()=>{
 const {service,account,runId}=fixture(wonBoundary('expert','used')),checkpoint=account.profile.results[five('expert',true)];continueRun(service,runId);const closed=send(service,{operationId:'retire',type:'close',runId,reason:'retired'});assert.equal(closed.status,'acknowledged',closed.message);assert.deepEqual(closed.account!.profile.results[five('expert',true)],checkpoint);assert.equal(closed.account!.profile.results[endless('expert',true)].score,account.run!.state.score);
});

test('existing direct endless best and totals survive a continued five run joining that bucket',()=>{
 for(const score of [10,99999]){const old:ResultBucket={runs:1,units:42,maxUnits:42,score,wins:0,retirements:1,maxChain:4,best:{score,units:42,chain:4}};const {service,account,runId}=fixture(wonBoundary(),{[endless('hard')]:old});continueRun(service,runId);const closed=send(service,{operationId:'retire',type:'close',runId,reason:'retired'});assert.equal(closed.status,'acknowledged',closed.message);const bucket=closed.account!.profile.results[endless('hard')];assert.equal(bucket.runs,2);assert.equal(bucket.score,score+account.run!.state.score);assert.equal(bucket.best!.score,Math.max(score,account.run!.state.score));assert.deepEqual(closed.account!.profile.results[five('hard')],account.profile.results[five('hard')]);}
});

test('reset before or after continuation preserves its score baseline and never restores the cleared five history',()=>{
 for(const after of [false,true]){const {service,account,runId}=fixture();if(after)continueRun(service,runId);assert.equal(send(service,{operationId:'reset',type:'resetResults'}).status,'acknowledged');if(!after)continueRun(service,runId);
  const closed=send(service,{operationId:'retire',type:'close',runId,reason:'retired'});assert.equal(closed.status,'acknowledged',closed.message);assert.equal(closed.account!.profile.results[five('hard')],undefined);const bucket=closed.account!.profile.results[endless('hard')];assert.ok(bucket);assert.equal(bucket.score,0);assert.equal(bucket.units,0);assert.equal(bucket.wins,0);assert.equal(closed.account!.wallet,account.wallet);
 }
});

test('home abandonment after continuing keeps five and coins without adding an endless record',()=>{
 const {service,account,runId}=fixture();continueRun(service,runId);const close=send(service,{operationId:'home',type:'close',runId,reason:'home'});assert.equal(close.status,'acknowledged');assert.deepEqual(close.account!.profile.results,account.profile.results);assert.equal(close.account!.wallet,account.wallet);
});

test('an immediate failed continuation still records cumulative endless once without erasing its completed five result',()=>{
 const state=wonBoundary();state.board.fill('cargo.cold');for(const cell of reservedEntryCellsV16({boardSize:7}))state.board[cell]=null;
 const {service,account,runId}=fixture(state);const continued=continueRun(service,runId);assert.equal(continued.run!.state.endReason,'blocked');assert.deepEqual(continued.profile.results[five('hard')],account.profile.results[five('hard')]);assert.equal(continued.profile.results[endless('hard')].score,state.score);
 const closed=send(service,{operationId:'fail.close',type:'close',runId,reason:'failed'});assert.equal(closed.status,'acknowledged');assert.deepEqual(closed.account!.profile.results,continued.profile.results);assert.equal(closed.account!.wallet,account.wallet);
});

test('only genuine standard overtime may carry an effective endless result cursor',()=>{
 const {service,runId}=fixture();continueRun(service,runId);const result=send(service,{operationId:'finish',type:'command',runId,command:{type:'finish'}});assert.equal(result.status,'acknowledged',result.message);const account=result.account!;assert.equal(account.run!.resultCursor!.bucketKey,endless('hard'));assert.doesNotThrow(()=>assertAccountSnapshot(account));
 for(const key of [endless('expert'),five('expert'),'inbound.daily.v18.hard.plain']){const bad=structuredClone(account);bad.run!.resultCursor!.bucketKey=key;assert.throws(()=>assertAccountSnapshot(bad));}
 const fresh=fixture().account;fresh.run!.resultCursor!.bucketKey=endless('hard');assert.throws(()=>assertAccountSnapshot(fresh));
});

test('unmirrored overtime retirement repairs the same result and refund without duplicate currency',()=>{
 const {storage,service,account,runId}=fixture(wonBoundary('hard','unused'));continueRun(service,runId);const set=storage.set.bind(storage);storage.set=(key,value)=>{if(key===ACCOUNT_KEYS.a)throw Error('mirror offline');set(key,value);};
 const pending=send(service,{operationId:'retire',type:'close',runId,reason:'retired'});assert.equal(pending.status,'committed_unmirrored');assert.equal(pending.closedState,undefined);storage.set=set;const closed=service.retryPending('retire');assert.equal(closed.status,'acknowledged',closed.message);assert.deepEqual(closed.account!.profile.results[five('hard')],account.profile.results[five('hard')]);assert.equal(closed.account!.profile.results[endless('hard')].runs,1);assert.equal(closed.account!.inventory.wildcard,1);assert.equal(closed.account!.wallet,account.wallet);assert.equal(service.retryPending('retire').operation,undefined);
});

test('later real overtime shipments increase only endless score and currency delta while five remains frozen',()=>{
 for(const tier of ['hard','expert'] as const){const {service,account,runId}=fixture(wonBoundary(tier));continueRun(service,runId);let count=0;
  while(service.getSnapshot()!.run!.state.phase==='input'&&count<25){const state=service.getSnapshot()!.run!.state as InboundRunV18,move=findLegalMovesV18(state)[0];assert.ok(move);const result=send(service,{operationId:`later.${++count}`,type:'command',runId,command:{type:'place',...move}});assert.equal(result.status,'acknowledged',result.message);assert.deepEqual(result.account!.profile.results[five(tier)],account.profile.results[five(tier)]);}
  const current=service.getSnapshot()!.run!.state;assert.ok(current.completedOrders>30);const ended=send(service,{operationId:'close',type:'close',runId,reason:current.phase==='result'?'failed':'retired'});assert.equal(ended.status,'acknowledged',ended.message);assert.deepEqual(ended.account!.profile.results[five(tier)],account.profile.results[five(tier)]);assert.equal(ended.account!.profile.results[endless(tier)].score,current.score);assert.equal(ended.account!.profile.results[endless(tier)].units,current.completedOrders);assert.equal(ended.account!.wallet,baseCoins('inbound',current.completedOrders,current.score,2));assert.equal(ended.operation!.coinDelta,0);
 }
});

test('result-only tools migration after the phase boundary replaces only the endless contribution',()=>{
 const {service,account,runId}=fixture(wonBoundary('hard','unused'));continueRun(service,runId);const end=send(service,{operationId:'finish',type:'command',runId,command:{type:'finish'}});assert.equal(end.status,'acknowledged');
 // This is a pure record-projection boundary test, not a claim that terminal gameplay accepts tools.
 const before=end.account!,run=structuredClone(before.run!);(run.state as InboundRunV18).usedToolIds=['wildcard'];(run.state as InboundRunV18).toolCharges.wildcard=0;run.reserved=[];run.state.commandIndex++;
 const projected=recordAccountResult({...before,run},run);assert.deepEqual(projected.profile.results[five('hard')],account.profile.results[five('hard')]);assert.equal(projected.profile.results[endless('hard')],undefined);assert.deepEqual(projected.profile.results[endless('hard',true)],before.profile.results[endless('hard')]);assert.equal(projected.profile.results[five('hard',true)],undefined);
});

test('continued endless settlement does not count the frozen five win twice in the account display',()=>{
 const {service,runId}=fixture();continueRun(service,runId);const result=send(service,{operationId:'finish',type:'command',runId,command:{type:'finish'}});assert.equal(result.status,'acknowledged');const profile=accountDisplayProfile(result.account!);assert.equal(profile.stats.wins,1);assert.equal(profile.stats.runs,1);assert.equal(profile.stats.orders,30);
});
