import test from 'node:test';
import assert from 'node:assert/strict';
import {createPlayableRun, isToolRun, previewPlayablePlacement, type RunSpec} from '../src/domain/playable.ts';
import {assertGameCommandShape} from '../src/application/game-codec.ts';
import {createAccountService, type StartIntent, type AccountRequest} from '../src/application/account-service.ts';
import {ACCOUNT_KEYS, encodeAccount} from '../src/application/account-store.ts';
import {FaultStorage, makeAccountFixture} from './helpers/account-fixtures.ts';

const charges={rotate:0 as const,clear:0 as const,wildcard:0 as const};
const held={status:'held' as const,release(){}};
function setup(){
 const storage=new FaultStorage(),account=makeAccountFixture({generation:1,inventory:{rotate:1,clear:1,wildcard:1}});
 for(const key of [ACCOUNT_KEYS.a,ACCOUNT_KEYS.b])storage.values.set(key,encodeAccount(account));
 return {storage,service:createAccountService(storage,held,()=>Date.parse('2026-10-07T12:00:00Z'))};
}
function intent(version:12|13|14):StartIntent {
 return {spec:version===14?{family:'inbound',mode:'standard',rulesetVersion:14,seed:1,guided:false,toolCharges:charges}:{family:'outbound',variant:version===12?'normal':'endless',rulesetVersion:version,seed:1,difficultyId:'easy',toolCharges:charges},items:['rotate','wildcard'],guide:'direct'} as unknown as StartIntent;
}
function send(service:ReturnType<typeof createAccountService>,request:AccountRequest){return service.transact(request,service.getSnapshot()!.generation);}

test('new entrance identities start with their own reducers',()=>{
 for(const version of [12,13,14] as const){const state=createPlayableRun(intent(version).spec as RunSpec);assert.equal(state.rulesetVersion,version);}
});

test('new account starts reserve two tools and home returns unused reservations exactly once',()=>{
 for(const version of [12,13,14] as const){
  const {storage,service}=setup();
  const started=send(service,{type:'start',operationId:'start',intent:intent(version)});
  assert.equal(started.status,'acknowledged',started.message);
  assert.deepEqual(started.account!.run!.reserved,['rotate','wildcard']);
  assert.deepEqual(started.account!.inventory,{rotate:0,clear:1,wildcard:0});
  const restarted=createAccountService(storage,held,()=>0),run=restarted.getSnapshot()!.run!;
  const close:AccountRequest={type:'close',operationId:'close',runId:run.identity.runId,reason:'home'},generation=restarted.getSnapshot()!.generation;
  const closed=restarted.transact(close,generation);
  assert.equal(closed.status,'acknowledged',closed.message);
  assert.deepEqual(closed.account!.inventory,{rotate:1,clear:1,wildcard:1});
  assert.deepEqual(restarted.transact(close,generation).account!.inventory,closed.account!.inventory);
 }
});

test('outbound wildcard commands require an explicit legal cargo and new normal rejects endless finish',()=>{
 const check=assertGameCommandShape as (value:unknown,version:number)=>void;
 for(const version of [12,13]){
  assert.doesNotThrow(()=>check({type:'wildcard',pieceId:'piece.1',cargo:'cargo.food'},version));
  assert.throws(()=>check({type:'wildcard',pieceId:'piece.1'},version));
  assert.throws(()=>check({type:'wildcard',pieceId:'piece.1',cargo:'cargo.wood'},version));
  assert.throws(()=>check({type:'rotate',pieceId:'piece.1',quarterTurns:0},version));
  assert.throws(()=>check({type:'clear',cells:[76]},version));
 }
 assert.throws(()=>check({type:'finishOutboundEndless'},12));
 assert.doesNotThrow(()=>check({type:'finishOutboundEndless'},13));
});

test('new outbound valid tool use commits once, while invalid or unconfirmed work preserves the visible account',()=>{
 for(const version of [12,13] as const){
  const {storage,service}=setup();
  const started=send(service,{type:'start',operationId:'start',intent:intent(version)});assert.equal(started.status,'acknowledged',started.message);
  const run=service.getSnapshot()!.run!,before=JSON.stringify(service.getSnapshot());
  previewPlayablePlacement(run.state,run.state.candidates[0].id,{x:4,y:8});assert.equal(JSON.stringify(service.getSnapshot()),before);
  const invalid=send(service,{type:'command',operationId:'invalid',runId:run.identity.runId,command:{type:'clear',cells:[]}});
  assert.equal(invalid.status,'not_committed');assert.equal(JSON.stringify(service.getSnapshot()),before);
  const piece=run.state.candidates[0],command={type:'wildcard' as const,pieceId:piece.id,cargo:'cargo.chem' as const};
  const request:AccountRequest={type:'command',operationId:'tool',runId:run.identity.runId,command},generation=service.getSnapshot()!.generation;
  const set=storage.set.bind(storage);storage.set=(key,value)=>{if(key===ACCOUNT_KEYS.a)throw Error('mirror offline');set(key,value);};
  const unmirrored=service.transact(request,generation);assert.equal(unmirrored.status,'committed_unmirrored',unmirrored.message);
  assert.equal(JSON.stringify(service.getSnapshot()),before);assert.equal(unmirrored.events,undefined);
  storage.set=set;const acknowledged=service.retryPending('tool');assert.equal(acknowledged.status,'acknowledged',acknowledged.message);
  const after=acknowledged.account!.run!;assert.ok(isToolRun(after.state));
  assert.deepEqual(after.reserved,['rotate']);assert.deepEqual(after.state.usedToolIds,['wildcard']);assert.equal(after.state.toolCharges.wildcard,0);
  assert.equal(acknowledged.events?.filter(event=>event.type==='toolUsed').length,1);
  assert.equal(service.transact(request,generation).events,undefined);
  const closed=send(service,{type:'close',operationId:'close',runId:run.identity.runId,reason:version===13?'retired':'home'});
  assert.equal(closed.status,'acknowledged',closed.message);assert.deepEqual(closed.account!.inventory,{rotate:1,clear:1,wildcard:0});
  if(version===13)assert.equal(closed.account!.profile.results['outboundEndless.v13.easy.tools']?.runs,1);
 }
});

test('unused carried outbound items remain plain scores and authored or daily starts refuse personal items',()=>{
 const {service}=setup();const started=send(service,{type:'start',operationId:'start',intent:intent(13)});assert.equal(started.status,'acknowledged',started.message);
 const close=send(service,{type:'close',operationId:'retire',runId:started.account!.run!.identity.runId,reason:'retired'});
 assert.equal(close.status,'acknowledged',close.message);assert.equal(close.account!.profile.results['outboundEndless.v13.easy.plain']?.runs,1);
 assert.deepEqual(close.account!.inventory,{rotate:1,clear:1,wildcard:1});
 for(const version of [12,14] as const){const {service:fresh}=setup(),start=intent(version);if(start.spec.family==='inbound')start.spec.guided=true;start.guide='guided';assert.equal(send(fresh,{type:'start',operationId:'guide',intent:start}).status,'not_committed');}
 const {service:fresh}=setup(),daily=intent(14);assert.equal(daily.spec.family,'inbound');if(daily.spec.family==='inbound')daily.spec.mode='daily';assert.equal(send(fresh,{type:'start',operationId:'daily',intent:daily}).status,'not_committed');
});

test('legacy outbound rejects new tool budgets and new outbound requires a well-formed budget',()=>{
 for(const version of [8,10,12,13] as const){
  const spec={family:'outbound',variant:version===8||version===12?'normal':'endless',rulesetVersion:version,seed:1,difficultyId:'easy',...(version<12?{toolCharges:charges}:{})};
  assert.throws(()=>createPlayableRun(spec as RunSpec));
  const {service}=setup();assert.equal(send(service,{type:'start',operationId:'invalid',intent:{spec:spec as RunSpec,items:[],guide:'direct'}}).status,'not_committed');
 }
 const {service}=setup(),start=intent(12);Object.assign(start.spec,{toolCharges:{rotate:2,clear:0,wildcard:0}});
 assert.equal(send(service,{type:'start',operationId:'bad.charges',intent:start}).status,'not_committed');
});
