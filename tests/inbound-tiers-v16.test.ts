import test from 'node:test';
import {createCanvas} from '@napi-rs/canvas';
import {render} from '../src/presentation/renderer.ts';
import assert from 'node:assert/strict';
import {CARGO} from '../src/domain/rulesets/v1/content.ts';
import {createRunV16,applyCommandV16,findLegalMovesV16} from '../src/domain/v16/engine.ts';
import {refreshOrdersV16,generationDistributionV16} from '../src/domain/v16/generation.ts';
import {replayV16} from '../src/domain/v16/replay.ts';
import {assertGameRun,encodeGameRun,decodeGameRun} from '../src/application/game-codec.ts';
import {createAccountService} from '../src/application/account-service.ts';
import type {AccountRequest} from '../src/application/account-service.ts';
import {accountDigest,canonicalStringify} from '../src/application/history-store.ts';
import {assertAccountSnapshot} from '../src/application/account-profile.ts';
import {ACCOUNT_KEYS,encodeAccount,decodeAccount} from '../src/application/account-store.ts';
import {accountCosmeticState} from '../src/application/cosmetics.ts';
import {GameSession} from '../src/application/session.ts';
import {FaultStorage,makeAccountFixture,makeAccountRun} from './helpers/account-fixtures.ts';
import {sessionHost} from './helpers/session-fixtures.ts';
import {getUiControls} from '../src/presentation/ui.ts';
const tiers=['normal','hard','expert'] as const;
const ranges={normal:[[3,4],[3,5],[4,5],[4,6],[5,7]],hard:[[4,4],[4,5],[5,5],[5,6],[6,7]],expert:[[4,5],[4,6],[5,6],[5,7],[6,8]]};
for(const inboundDifficulty of tiers)test(`rules16 ${inboundDifficulty} samples every stage bounds and preserves existing orders`,()=>{
 for(let shift=1;shift<=5;shift++){
  const [min,max]=ranges[inboundDifficulty][shift-1],seen=new Set<number>();
  for(let seed=1;seed<=40;seed++){
   const state=createRunV16({seed,mode:'standard',inboundDifficulty});state.shift=shift as 1|2|3|4|5;state.orders=[];
   const filled=refreshOrdersV16(state);for(const order of filled.orders){assert.ok(order.amount>=min&&order.amount<=max);seen.add(order.amount);}
   assert.equal(generationDistributionV16(filled).traits.rush,0);assert.equal(filled.cleanup,null);
   filled.shift=5;assert.deepEqual(refreshOrdersV16(filled).orders.filter(o=>filled.orders.some(old=>old.id===o.id)),filled.orders);
  }
  assert.ok(seen.has(min));assert.ok(seen.has(max));
 }
});
test('rules16 strict persisted tiers and seeded replay',()=>{
 for(const inboundDifficulty of tiers){const state=createRunV16({seed:4,mode:'standard',inboundDifficulty});assert.equal(state.inboundDifficulty,inboundDifficulty);assert.equal(state.runConfigId,`run.inbound_v16${inboundDifficulty==='normal'?'':'.'+inboundDifficulty}`);const command={type:'place' as const,...findLegalMovesV16(state)[0]};assert.deepEqual(replayV16({seed:4,mode:'standard',inboundDifficulty},[command]).state,applyCommandV16(state,command).state);assert.deepEqual(decodeGameRun(encodeGameRun(state)),state);
 for(const value of [undefined,null,['hard'],'bogus',false])assert.throws(()=>assertGameRun({...state,inboundDifficulty:value}));assert.throws(()=>assertGameRun({...state,runConfigId:'wrong'}));}
 for(const inboundDifficulty of ['hard','expert'] as const){for(const mode of ['daily','endless'] as const)assert.throws(()=>createRunV16({seed:1,mode,inboundDifficulty}));assert.throws(()=>createRunV16({seed:1,mode:'standard',guided:true,inboundDifficulty}));const state=createRunV16({seed:1,mode:'standard',inboundDifficulty});state.phase='result';state.result='won';state.endReason='completed';state.completedOrders=30;state.shift=5;assert.ok(applyCommandV16(state,{type:'continueOvertime'}).error);assert.throws(()=>assertGameRun({...state,overtime:true}));}
});
test('account tier identities and result buckets remain distinct with and without tools',()=>{
 const storage=new FaultStorage();const initial=makeAccountFixture({inventory:{rotate:0,clear:0,wildcard:3}}),raw=encodeAccount(initial);storage.values.set(ACCOUNT_KEYS.a,raw);storage.values.set(ACCOUNT_KEYS.b,raw);const service=createAccountService(storage,{status:'held',release(){}},()=>0);let n=0;
 const tx=(body:Omit<Extract<AccountRequest,{type:'start'}>,'operationId'>|Omit<Extract<AccountRequest,{type:'command'}>,'operationId'>|Omit<Extract<AccountRequest,{type:'close'}>,'operationId'>)=>{const result=service.transact({...body,operationId:`tier.${++n}`},service.getSnapshot()?.generation??0);assert.equal(result.status,'acknowledged',result.message);return result;};
 for(const inboundDifficulty of tiers)for(const tools of [false,true]){tx({type:'start',intent:{spec:{family:'inbound',rulesetVersion:16,mode:'standard',seed:1,guided:false,inboundDifficulty,toolCharges:{rotate:0,clear:0,wildcard:0}},items:tools?['wildcard']:[],guide:'direct'}});const account=service.getSnapshot()!,id=account.run!.identity;assert.equal(id.inboundDifficulty,inboundDifficulty);assert.throws(()=>assertAccountSnapshot({...account,run:{...account.run,identity:{...id,inboundDifficulty:'wrong'}}}));if(tools)tx({type:'command',runId:id.runId,command:{type:'wildcard',pieceId:account.run!.state.candidates[0].id}});tx({type:'command',runId:id.runId,command:{type:'finish'}});assert.ok(service.getSnapshot()!.profile.results[`inbound.standard.v16.${inboundDifficulty}.${tools?'tools':'plain'}`]);tx({type:'close',runId:id.runId,reason:'retired'});}
});
test('current two-tier menu changes are view-only and formal rules18 restart retains its tier',()=>{
 const h=sessionHost();h.session.action({type:'chooseInbound'});const before=[...h.data],rng=structuredClone(h.session.state.rngState);h.storage.resetFault();
 for(const inboundDifficulty of ['expert','normal','hard'] as const)h.session.action({type:'selectInboundDifficulty',inboundDifficulty});
 assert.deepEqual([...h.data],before);assert.deepEqual(h.session.state.rngState,rng);assert.equal(h.storage.operations.filter(o=>o.kind==='set'||o.kind==='remove').length,0);
 const controls=getUiControls(h.session.state,h.session.view);assert.equal(controls.filter(c=>c.action.type==='selectInboundDifficulty').length,2);assert.equal(controls.filter(c=>c.action.type==='newRun'&&c.action.mode==='standard').length,1);
 h.session.action(controls.find(c=>c.action.type==='newRun'&&c.action.mode==='standard')!.action);assert.equal(h.session.view.screen,'prepareTools');h.session.action({type:'prepareNext'});assert.equal(h.session.state.rulesetVersion,18);assert.equal(h.session.view.account!.run!.identity.inboundDifficulty,'hard');h.session.restart();h.session.action({type:'confirm'});h.session.action({type:'prepareNext'});assert.equal(h.session.view.account!.run!.identity.inboundDifficulty,'hard');
});

// Explicit terminal boundary fixture exercises the actual last shipment and session closure.
for(const inboundDifficulty of tiers)test(`${inboundDifficulty} final shipment draws nothing and only normal offers overtime`,()=>{
 const state=createRunV16({seed:17,mode:'standard',inboundDifficulty});state.completedOrders=29;state.shift=5;state.runSerial=1;state.candidates[0]={id:'last.food',shapeId:'shape.single',cargo:'cargo.food',quarterTurns:0};state.orders=[{id:'last.order',dockId:'dock.north',cargo:'cargo.food',amount:4,baseScore:200}];for(const cell of [8,9,10])state.board[cell]='cargo.food';
 const result=applyCommandV16(state,{type:'place',pieceId:'last.food',origin:{x:4,y:1}});assert.equal(result.error,undefined);assert.equal(result.state.completedOrders,30);assert.equal(result.state.result,'won');assert.deepEqual(result.state.rngState,state.rngState);assert.equal(result.state.nextId,state.nextId);assert.equal(result.state.generatedPieces,state.generatedPieces);assert.deepEqual(result.state.candidates,state.candidates.slice(1));
 const run=makeAccountRun({state:result.state,identity:{runId:'test.last',serial:1,rulesetVersion:16,inboundDifficulty,runConfigId:state.runConfigId,mode:'standard',economyVersion:2},history:{seed:state.seed,runConfigId:state.runConfigId,head:null,totalCommands:1,tail:result.state.commands}});const h=sessionHost({formatVersion:2,economyVersion:2,dailyRewards:{},nextRunSerial:2,run});assert.equal(!!h.session.view.account?.run,inboundDifficulty==='normal');assert.equal(getUiControls(h.session.state,h.session.view).some(c=>c.action.type==='continueOvertime'),inboundDifficulty==='normal');
 if(inboundDifficulty!=='normal'){assert.ok(accountCosmeticState(h.session.view.account!).ownedCosmetics.includes('forklift.red'));assert.ok(accountCosmeticState(h.session.view.account!).ownedCosmetics.includes('forklift.blue'));const snapshot=[...h.data];h.session.action({type:'continueOvertime'});assert.deepEqual([...h.data],snapshot);assert.equal(h.session.state.result,'won');const restored=new GameSession(h.platform,{seed:17,mode:'standard'});assert.equal(restored.view.account?.run,null);}
});

test('formal tier labels appear in HUD/results and all segmented controls meet the smallest layout',()=>{
 const h=sessionHost();const labels=(state:ReturnType<typeof createRunV16>)=>{const ctx=createCanvas(1080,1920).getContext('2d') as unknown as CanvasRenderingContext2D,words:string[]=[];ctx.fillText=(word)=>{words.push(word);};render(ctx,state,{...h.session.view,screen:'game'});return words.join(' ');};
 for(const [inboundDifficulty,label] of [['normal','普通'],['hard','困难'],['expert','专业']] as const){const state=createRunV16({seed:1,mode:'standard',inboundDifficulty});assert.match(labels(state),new RegExp(`${label}五班`));state.phase='result';state.result='failed';state.endReason='retired';assert.match(labels(state),new RegExp(`${label}五班`));}
 for(const mode of ['daily','endless'] as const)assert.doesNotMatch(labels(createRunV16({seed:1,mode})),/困难五班|专业五班/);
 h.session.action({type:'chooseInbound'});const controls=getUiControls(h.session.state,h.session.view);for(const width of [360,390,430])for(const c of controls.filter(c=>c.action.type==='selectInboundDifficulty'))assert.ok(c.rect.h*width/1080>=44&&c.rect.w*width/1080>=44);
});
test('expert stage-five generated eight-unit orders survive codec and an account command',()=>{
 // Explicit stage boundary; order contents come from the real seeded generator.
 let state=createRunV16({seed:1,mode:'standard',inboundDifficulty:'expert'});state.shift=5;state.completedOrders=24;state.orders=[];state=refreshOrdersV16(state);state.runSerial=1;assert.ok(state.orders.some(order=>order.amount===8));assert.deepEqual(decodeGameRun(encodeGameRun(state)),state);
 const run=makeAccountRun({state,identity:{runId:'test.expert8',serial:1,rulesetVersion:16,inboundDifficulty:'expert',runConfigId:state.runConfigId,mode:'standard',economyVersion:2},history:{seed:state.seed,runConfigId:state.runConfigId,head:null,totalCommands:0,tail:[]}}),h=sessionHost({formatVersion:2,economyVersion:2,dailyRewards:{},nextRunSerial:2,run});h.session.resume();h.session.dispatch({type:'place',...findLegalMovesV16(state)[0]});assert.equal(h.session.state.commandIndex,1);assert.equal(h.session.view.accountBlocked,false);assert.ok(h.session.state.orders.some(order=>order.amount===8));const restored=new GameSession(h.platform,{seed:1,mode:'standard'});assert.equal(restored.state.commandIndex,1);assert.deepEqual(restored.state,h.session.state);
});
test('explicit null tier is rejected while omitted tier defaults to normal',()=>{
 assert.throws(()=>createRunV16({seed:1,mode:'standard',inboundDifficulty:null} as unknown as Parameters<typeof createRunV16>[0]));assert.equal(createRunV16({seed:1,mode:'standard'}).inboundDifficulty,'normal');
});

test('new16 closed identity rejects nonprimitive mode version and tier through valid-digest envelopes',()=>{
 const h=sessionHost(),service=createAccountService(h.storage,h.platform.writerLease!,()=>h.platform.wallTime!()),start=service.transact({type:'start',operationId:'fixture.closed16.start',intent:{spec:{family:'inbound',rulesetVersion:16,mode:'standard',seed:1,inboundDifficulty:'normal',guided:false,toolCharges:{rotate:0,clear:0,wildcard:0}},items:[],guide:'direct'}},service.getSnapshot()!.generation);assert.equal(start.status,'acknowledged');h.session=new GameSession(h.platform,{seed:1,mode:'standard'});h.session.resume();assert.equal(h.session.state.rulesetVersion,16);h.session.dispatch({type:'finish'});const account=h.session.view.account!;assert.ok(account.lastClosedResult);assert.equal(account.lastClosedResult.identity.rulesetVersion,16);assert.equal(account.run,null);
 for(const [field,value] of [['mode',['standard']],['mode',[['standard']]],['rulesetVersion',['16']],['rulesetVersion','16'],['inboundDifficulty',['normal']],['inboundDifficulty',null]] as const){const bad=structuredClone(account);Object.assign(bad.lastClosedResult!.identity,{[field]:value});assert.throws(()=>assertAccountSnapshot(bad),field);assert.throws(()=>encodeAccount(bad),field);const raw=canonicalStringify({formatVersion:1,generation:bad.generation,digest:accountDigest(canonicalStringify(bad)),account:bad});assert.throws(()=>decodeAccount(h.storage,raw),field);}
});
test('expert account transitions from order23 to24 and persists newly generated eight-unit demand',()=>{
 let state=createRunV16({seed:6,mode:'standard',inboundDifficulty:'expert'});state.shift=4;state.completedOrders=23;state.orders=[];state=refreshOrdersV16(state);state.orders=state.orders.map((order,index)=>({...order,cargo:CARGO[index].id}));state.runSerial=1;state.candidates[0]={id:'boundary.last',shapeId:'shape.single',cargo:'cargo.food',quarterTurns:0};state.orders[0]={...state.orders[0],amount:4,baseScore:175};for(const cell of [8,9,10])state.board[cell]='cargo.food';
 const run=makeAccountRun({state,identity:{runId:'test.23to24',serial:1,rulesetVersion:16,inboundDifficulty:'expert',runConfigId:state.runConfigId,mode:'standard',economyVersion:2},history:{seed:state.seed,runConfigId:state.runConfigId,head:null,totalCommands:0,tail:[]}}),h=sessionHost({formatVersion:2,economyVersion:2,dailyRewards:{},nextRunSerial:2,run});h.session.resume();h.session.dispatch({type:'place',pieceId:'boundary.last',origin:{x:4,y:1}});assert.equal(h.session.state.completedOrders,24);assert.equal(h.session.state.shift,5);assert.ok(h.session.state.orders.some(order=>order.amount===8));assert.equal(h.session.view.accountBlocked,false);const restored=new GameSession(h.platform,{seed:1,mode:'standard'});assert.deepEqual(restored.state,h.session.state);
});
test('tier selector highlights only the selected segment in the real Canvas',()=>{
 const h=sessionHost();h.session.action({type:'chooseInbound'});h.session.action({type:'selectInboundDifficulty',inboundDifficulty:'expert'});const c=createCanvas(1080,1920),ctx=c.getContext('2d');render(ctx as unknown as CanvasRenderingContext2D,h.session.state,h.session.view);const controls=getUiControls(h.session.state,h.session.view).filter(control=>control.action.type==='selectInboundDifficulty');for(const control of controls){const pixel=ctx.getImageData(control.rect.x+40,control.rect.y+30,1,1).data;assert.equal(pixel[0]>150,control.selected,control.label);}
});
