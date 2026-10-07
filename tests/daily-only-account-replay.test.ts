import {applyCommandV16,createRunV16} from '../src/domain/v16/engine.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createAccountService,type AccountRequest,type TransactionResult} from '../src/application/account-service.ts';
import {ACCOUNT_KEYS,encodeAccount,loadAccount} from '../src/application/account-store.ts';
import {assertAccountSnapshot} from '../src/application/account-profile.ts';
import {accountCosmeticState} from '../src/application/cosmetics.ts';
import {playableChecksum,isInboundV16,findPlayableMoves,type GameCommand} from '../src/domain/playable.ts';
import {advanceGuide,guideOverlay} from '../src/application/tutorials.ts';
import {FaultStorage,makeAccountFixture,makeAccountRun} from './helpers/account-fixtures.ts';
import type {AccountSnapshot} from '../src/application/account-types.ts';
const trace=JSON.parse(readFileSync(new URL('./helpers/daily-v16-trace.json',import.meta.url),'utf8')) as {wallTime:number;seed:number;commands:GameCommand[]};
const held=()=>({status:'held' as const,release(){}});
function setup(account=makeAccountFixture()){const storage=new FaultStorage(),raw=encodeAccount(account);storage.values.set(ACCOUNT_KEYS.a,raw);storage.values.set(ACCOUNT_KEYS.b,raw);const service=createAccountService(storage,held(),()=>trace.wallTime);return {storage,service};}
function request(service:ReturnType<typeof createAccountService>,body:Record<string,unknown>){return service.transact({operationId:`daily.${service.getSnapshot()!.generation}`,...body} as AccountRequest,service.getSnapshot()!.generation);}
const start=(version=16)=>({type:'start',intent:{spec:{family:'inbound',rulesetVersion:version,mode:'daily',seed:999,guided:false,toolCharges:{rotate:0,clear:0,wildcard:0}},items:[],guide:'direct'}});

test('fresh, returning, completed and skipped daily guides have identical real-date gameplay and reward through natural victory',()=>{
 const accounts=['fresh','returning','complete','skipped'].map((kind,index)=>{const old=makeAccountFixture({epoch:`daily.${index}`,nextRunSerial:index+1});old.guides.inbound={learned:['place','order','route','rushTimer','sweepChoice','expired'],skipped:true,authoredStartConsumed:true};const h=setup(old);assert.equal(request(h.service,{type:'setSettings',patch:{sound:false}}).status,'acknowledged');const current=structuredClone(h.service.getSnapshot()!) as AccountSnapshot;if(kind==='returning')current.guides.daily!.learned=['sweepChoice'];if(kind==='complete')current.guides.daily!.learned=['sweepChoice','rushTimer'];if(kind==='skipped')current.guides.daily!.skipped=true;return setup(current);});
 for(const h of accounts){assert.equal(request(h.service,start()).status,'acknowledged');assert.equal(h.service.getSnapshot()!.run!.state.seed,trace.seed);assert.equal(h.service.getSnapshot()!.run!.identity.mode,'daily');}
 for(const command of trace.commands){for(const h of accounts){const run=h.service.getSnapshot()!.run!;const result=request(h.service,{type:'command',runId:run.identity.runId,command});assert.equal(result.status,'acknowledged',result.message);}
  const states=accounts.map(h=>h.service.getSnapshot()!.run!.state);for(const state of states.slice(1)){assert.equal(playableChecksum(state),playableChecksum(states[0]));assert.deepEqual({...state,runSerial:0},{...states[0],runSerial:0});}
  assert.equal(new Set(accounts.map(h=>h.service.getSnapshot()!.wallet)).size,1);assert.equal(new Set(accounts.map(h=>h.service.getSnapshot()!.run!.earnedCoins)).size,1);
 }
 for(const h of accounts){const account=h.service.getSnapshot()!,run=account.run!;assert.equal(run.state.result,'won');assert.equal(run.state.completedOrders,30);assert.ok(account.wallet>0);assert.equal(account.wallet,run.creditedBase*3);assert.equal(account.guides.daily!.learned.includes('rushTimer'),true);assert.ok(account.profile.results['inbound.daily.v16.plain']);assert.ok(accountCosmeticState(account).ownedCosmetics.includes('forklift.blue'));
  assert.equal(request(h.service,{type:'close',runId:run.identity.runId,reason:'decline_overtime'}).status,'acknowledged');const wallet=h.service.getSnapshot()!.wallet;assert.equal(request(h.service,{type:'resetResults'}).status,'acknowledged');assert.equal(h.service.getSnapshot()!.wallet,wallet);for(const version of [15,16])assert.equal(request(h.service,start(version)).status,'not_committed');assert.equal(h.service.getSnapshot()!.wallet,wallet);
 }
});

test('every before/after cleanup write failure and restarted exact retry preserves one choice and its daily fact',()=>{
 const opening=setup();assert.equal(request(opening.service,start()).status,'acknowledged');const initial=structuredClone(opening.service.getSnapshot()!) as AccountSnapshot;
 const body:AccountRequest={operationId:'choice.once',type:'command',runId:initial.run!.identity.runId,command:{type:'chooseCleanup',branch:'orders'}};
 const baseline=setup(initial);baseline.storage.resetFault();const success=baseline.service.transact(body,initial.generation);assert.equal(success.status,'acknowledged');const count=baseline.storage.operations.length,expected=success.account!;
 for(let at=1;at<=count;at++)for(const timing of ['before','after'] as const){const h=setup(initial);h.storage.resetFault({at,timing});const result=h.service.transact(body,initial.generation);if(result.status!=='acknowledged')assert.deepEqual(h.service.getSnapshot(),initial);h.storage.resetFault();const loaded=loadAccount(h.storage,assertAccountSnapshot);assert.ok(['ready','degraded'].includes(loaded.status));assert.deepEqual(loaded.account,loaded.account?.generation===initial.generation?initial:expected);const restarted=createAccountService(h.storage,held(),()=>trace.wallTime);const retried:TransactionResult=restarted.getPendingOperationId()?restarted.retryPending('choice.once'):restarted.transact(body,initial.generation);assert.equal(retried.status,'acknowledged',`${at}/${timing}: ${retried.message}`);assert.deepEqual(restarted.getSnapshot(),expected);assert.equal(restarted.getSnapshot()!.run!.state.commandIndex,1);assert.deepEqual(restarted.getSnapshot()!.guides.daily!.learned,['sweepChoice']);assert.equal(restarted.getSnapshot()!.formatVersion,4);}
});

test('candidate-only rush and placement that ships it immediately never show a countdown hint or record a tick',()=>{
 // A deliberately labeled boundary fixture isolates immediate shipment, without changing daily starts or seeded QA traces.
 const h=setup();assert.equal(request(h.service,start()).status,'acknowledged');assert.equal(request(h.service,{type:'command',runId:h.service.getSnapshot()!.run!.identity.runId,command:trace.commands[0]}).status,'acknowledged');
 const run=h.service.getSnapshot()!.run!.state;if(!isInboundV16(run))throw Error('Expected16');
 run.candidates[0]={id:'boundary.rush',shapeId:'shape.single',cargo:'cargo.food',quarterTurns:0,trait:'rush',rushTurns:3};run.orders=[{id:'boundary.order',cargo:'cargo.food',dockId:'dock.north',amount:3,baseScore:100}];run.board.fill(null);run.cellTraits.fill(null);run.board[8]='cargo.food';run.board[9]='cargo.food';
 const progress={learned:['sweepChoice' as const],skipped:false,authoredStartConsumed:false};assert.equal(guideOverlay('daily',progress,run),null);const command={type:'place' as const,pieceId:'boundary.rush',origin:{x:3,y:1}},result=applyCommandV16(run,command);assert.equal(result.error,undefined);assert.equal(result.state.completedOrders,1);assert.equal(result.state.cellTraits.some(trait=>trait?.kind==='rush'),false);assert.equal(guideOverlay('daily',progress,result.state),null);assert.deepEqual(advanceGuide('daily',progress,run,command,result),progress);
});

test('daily can naturally fail without placing a rush and retry the same real date without completing its guide',()=>{
 const h=setup();assert.equal(request(h.service,start()).status,'acknowledged');let id=h.service.getSnapshot()!.run!.identity.runId;assert.equal(request(h.service,{type:'command',runId:id,command:trace.commands[0]}).status,'acknowledged');
 for(let step=0;step<80&&h.service.getSnapshot()!.run!.state.phase==='input';step++){
  const state=h.service.getSnapshot()!.run!.state;assert.equal(guideOverlay('daily',h.service.getSnapshot()!.guides.daily!,state),null);const move=findPlayableMoves(state).find(move=>state.candidates.find(piece=>piece.id===move.pieceId)?.trait!=='rush');assert.ok(move,'the fixed ordinary-first trace must remain an actual playable no-rush-board run');assert.equal(request(h.service,{type:'command',runId:id,command:{type:'place',...move}}).status,'acknowledged');
 }
 const ended=h.service.getSnapshot()!.run!;assert.equal(ended.state.phase,'result');assert.equal(ended.state.result,'failed');assert.equal(guideOverlay('daily',h.service.getSnapshot()!.guides.daily!,ended.state),null);assert.deepEqual(h.service.getSnapshot()!.guides.daily!.learned,['sweepChoice']);assert.equal(request(h.service,{type:'close',runId:id,reason:'failed'}).status,'acknowledged');assert.equal(request(h.service,start()).status,'acknowledged');id=h.service.getSnapshot()!.run!.identity.runId;assert.notEqual(id,ended.identity.runId);assert.equal(h.service.getSnapshot()!.run!.state.seed,trace.seed);assert.equal(h.service.getSnapshot()!.run!.state.phase,'cleanup');assert.deepEqual(h.service.getSnapshot()!.guides.daily!.learned,['sweepChoice']);
});


test('real standard16 win unlocks formal cosmetics and continues overtime under the same account identity',()=>{
 const state=createRunV16({seed:2026,mode:'standard'});state.runSerial=1;
 const run=makeAccountRun({state,identity:{runId:'test.formal16',serial:1,rulesetVersion:16,runConfigId:state.runConfigId,mode:'standard',economyVersion:2},history:{seed:state.seed,runConfigId:state.runConfigId,head:null,totalCommands:0,tail:[]}});
 const h=setup(makeAccountFixture({formatVersion:2,economyVersion:2,dailyRewards:{},nextRunSerial:2,run}));
 // First part of the frozen seed2026 natural130-command trace used by the rules16 codec proof.
 const moves='011 113 111 213 221 232 234 043 041 041 053 045 225 015 011 122 011 212 111 133 111 131 100 111 230 101 111 002 011 141 150 034 003 111 131 110 121 041 242 212 111 113 211 131 121 211 213 214 113 132 110 025 021 233 254 111 100 211 113 100 211 041 111 220 011 133 141 101 111 013 021 033 000 010 031 044 012 111 132 112 011 010 042 023 022 002 013 034 245 034 253 212 214 233 213 033 012 211 224 114 124 234 252 131 032 124 122 025 031 233 153 114 144 064 056 000 166 121 134 011 220 231 235 242 011 141 023 104 243 021'.split(' ').map(text=>text.split('').map(Number));
 for(const [slot,x,y] of moves){const current=h.service.getSnapshot()!.run!.state;if(current.phase==='result')break;const placed=request(h.service,{type:'command',runId:run.identity.runId,command:{type:'place',pieceId:current.candidates[slot].id,origin:{x,y}}});assert.equal(placed.status,'acknowledged',placed.message);}
 const won=h.service.getSnapshot()!,identity=structuredClone(won.run!.identity);assert.equal(won.run!.state.result,'won');assert.equal(won.profile.results['inbound.standard.v16.plain'].wins,1);assert.ok(won.profile.ownedCosmetics?.includes('forklift.blue'));assert.ok(won.profile.ownedCosmetics?.includes('forklift.red'));assert.deepEqual(won.guides.daily!.learned,[]);
 assert.equal(request(h.service,{type:'command',runId:identity.runId,command:{type:'continueOvertime'}}).status,'acknowledged');const continued=h.service.getSnapshot()!.run!;assert.deepEqual(continued.identity,identity);assert.ok(isInboundV16(continued.state));assert.equal(continued.state.overtime,true);assert.equal(continued.state.cleanup,null);assert.ok(continued.state.candidates.every(piece=>piece.trait!=='rush'));assert.equal(continued.state.guided,false);
 assert.equal(request(h.service,{type:'resetResults'}).status,'acknowledged');assert.ok(h.service.getSnapshot()!.profile.ownedCosmetics?.includes('forklift.red'));assert.deepEqual(h.service.getSnapshot()!.run!.identity,identity);
});
