import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRunV12} from '../src/domain/v12/engine.ts';
import {createRunV13,applyCommandV13} from '../src/domain/v13/engine.ts';
import {playableChecksum,isOutboundToolsRun,type OutboundToolsRun} from '../src/domain/playable.ts';
import {createAccountService,type AccountRequest} from '../src/application/account-service.ts';
import {ACCOUNT_KEYS,encodeAccount} from '../src/application/account-store.ts';
import {assertAccountSnapshot} from '../src/application/account-profile.ts';
import {stageHistory,readHistory,verifyAccountReferences} from '../src/application/history-store.ts';
import {baseCoins} from '../src/application/economy.ts';
import {FaultStorage,makeAccountFixture} from './helpers/account-fixtures.ts';
import type {RunIdentity,AccountRun} from '../src/application/account-types.ts';
import type {OutboundToolCommandV13} from '../src/domain/v13/types.ts';

const held={status:'held' as const,release(){}};
function install(state:OutboundToolsRun){
 const storage=new FaultStorage();
 const identity:RunIdentity={runId:'entrance.fixture',serial:1,rulesetVersion:state.rulesetVersion,runConfigId:state.runConfigId,mode:state.rulesetVersion===12?'outbound':'outboundEndless',difficultyId:state.difficultyId,economyVersion:2};
 const staged=stageHistory(storage,identity,{seed:state.seed,runConfigId:state.runConfigId,head:null,totalCommands:0,tail:[]},state.commands,state.commandIndex);
 const creditedBase=baseCoins('outbound',state.completedOrders,state.score,2);
 const run:AccountRun={identity,state:{...state,commands:staged.tail,commandBaseIndex:staged.commandBaseIndex,runSerial:1} as OutboundToolsRun,history:staged.cursor,lifecycle:'active',reserved:(['rotate','clear','wildcard'] as const).filter(item=>state.toolCharges[item]===1),creditedBase,earnedCoins:creditedBase,resultCursor:null};
 const account=makeAccountFixture({formatVersion:2,economyVersion:2,dailyRewards:{},generation:1,nextRunSerial:2,wallet:creditedBase,run});
 for(const key of [ACCOUNT_KEYS.a,ACCOUNT_KEYS.b])storage.values.set(key,encodeAccount(account));
 const service=createAccountService(storage,held,()=>0);assert.ok(service.getSnapshot());
 return {storage,service,runId:identity.runId};
}
function send(service:ReturnType<typeof createAccountService>,request:AccountRequest){return service.transact(request,service.getSnapshot()!.generation);}

test('real v13 history seals command128, restarts at129, and preserves carried tools and replay checksum',()=>{
 const source=(JSON.parse(readFileSync(new URL('./fixtures/outbound-v10-golden.json',import.meta.url),'utf8')) as {long:{seed:number;difficulty:'easy';commands:OutboundToolCommandV13[]}}).long;
 let state=createRunV13(source.seed,source.difficulty,{rotate:1,clear:0,wildcard:1});
 for(const command of source.commands.slice(0,127)){const result=applyCommandV13(state,command);assert.equal(result.error,undefined);state=result.state;}
 const {storage,service,runId}=install(state),expected128=applyCommandV13(state,source.commands[127]).state;
 const committed=send(service,{type:'command',operationId:'command128',runId,command:source.commands[127]});
 assert.equal(committed.status,'acknowledged',committed.message);
 const run=committed.account!.run!;assert.equal(run.history.totalCommands,128);assert.equal(run.history.tail.length,0);assert.equal(run.history.head?.commandCount,128);
 assert.equal(playableChecksum(run.state),playableChecksum(expected128));assert.deepEqual([...readHistory(storage,run.identity,run.history,run.history.tail)],source.commands.slice(0,128));
 const restarted=createAccountService(storage,held,()=>0),next=send(restarted,{type:'command',operationId:'command129',runId,command:source.commands[128]});
 assert.equal(next.status,'acknowledged',next.message);assert.equal(next.account!.run!.history.tail.length,1);
 assert.equal(playableChecksum(next.account!.run!.state),playableChecksum(applyCommandV13(expected128,source.commands[128]).state));
 assert.deepEqual(next.account!.run!.reserved,['rotate','wildcard']);verifyAccountReferences(storage,next.account!);
});

test('immediate clear shipment credits only real shipments and records normal victory in the tools bucket',()=>{
 const state=createRunV12(17,'hard',{rotate:1,clear:1,wildcard:0});state.completedOrders=29;state.shift=5;
 for(const cell of [67,75,77])state.board[cell]='cargo.machine';
 for(const cell of [4,13,22,31])state.board[cell]='cargo.food';
 for(const cell of [44,43,42,41])state.board[cell]='cargo.chem';
 for(const cell of [36,37,38,39])state.board[cell]='cargo.machine';
 const {storage,service,runId}=install(state),before=service.getSnapshot()!;
 const result=send(service,{type:'command',operationId:'clear',runId,command:{type:'clear',cells:[67]}});
 assert.equal(result.status,'acknowledged',result.message);const after=result.account!.run!;
 assert.equal(after.state.completedOrders,32);assert.ok(isOutboundToolsRun(after.state));assert.equal(after.state.rawScore,120);assert.equal(after.state.score,180);assert.equal(after.state.endReason,'completed');
 assert.equal(result.events?.filter(event=>event.type==='shipment').length,3);
 assert.equal(result.operation?.coinDelta,baseCoins('outbound',32,180,2)-before.wallet);
 assert.deepEqual(after.state.rngState,state.rngState);assert.deepEqual(after.state.candidates,state.candidates);
 assert.deepEqual(after.reserved,['rotate']);assert.equal(result.account!.profile.results['outbound.v12.hard.tools']?.runs,1);
 const closed=send(service,{type:'close',operationId:'close',runId,reason:'decline_overtime'});
 assert.equal(closed.status,'acknowledged',closed.message);assert.equal(closed.account!.inventory.rotate,1);assert.equal(closed.account!.inventory.clear,0);
 verifyAccountReferences(storage,closed.account!);
});

test('outbound result buckets isolate four difficulties, both variants, and actual tool use',()=>{
 const keys:string[]=[];
 for(const version of [12,13] as const)for(const difficulty of ['easy','normal','hard','expert'] as const)for(const use of [false,true]){
  const state=version===12?createRunV12(17,difficulty,{rotate:0,clear:0,wildcard:1}):createRunV13(17,difficulty,{rotate:0,clear:0,wildcard:1});
  if(version===12){state.completedOrders=29;state.shift=5;for(const cell of [4,13,22])state.board[cell]='cargo.food';state.candidates[0]={id:state.candidates[0].id,shapeId:use?'shape.domino_h':'shape.single',cargo:'cargo.food',quarterTurns:0};}
  const {service,runId}=install(state);
  if(use){const piece=state.candidates[0];const cargo=version===12?'cargo.food':piece.cargo==='cargo.food'?'cargo.chem':'cargo.food';const result=send(service,{type:'command',operationId:'tool',runId,command:{type:'wildcard',pieceId:piece.id,cargo}});assert.equal(result.status,'acknowledged',result.message);}
  let result;
  if(version===12)result=send(service,{type:'command',operationId:'win',runId,command:{type:'place',pieceId:state.candidates[0].id,origin:{x:4,y:3}}});
  else result=send(service,{type:'close',operationId:'finish',runId,reason:'retired'});
  assert.equal(result.status,'acknowledged',result.message);assertAccountSnapshot(result.account);
  const expected=`${version===12?'outbound':'outboundEndless'}.v${version}.${difficulty}.${use?'tools':'plain'}`;
  assert.deepEqual(Object.keys(result.account!.profile.results),[expected]);keys.push(expected);
  if(version===12){assert.ok(isOutboundToolsRun(result.account!.run!.state));assert.equal(result.account!.run!.state.candidates.length,2);assert.deepEqual(result.account!.run!.reserved,use?[]:['wildcard']);}
 }
 assert.equal(new Set(keys).size,16);
});
