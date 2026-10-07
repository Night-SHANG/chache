import test from 'node:test';
import assert from 'node:assert/strict';
import {sessionHost,startInbound} from './helpers/session-fixtures.ts';
import {createAccountService} from '../src/application/account-service.ts';
import {ACCOUNT_KEYS,encodeAccount} from '../src/application/account-store.ts';
import {FaultStorage,makeAccountFixture} from './helpers/account-fixtures.ts';
import {GameSession} from '../src/application/session.ts';
import {findPlayableMoves,playableChecksum} from '../src/domain/playable.ts';
import type {UiAction} from '../src/presentation/ui-types.ts';
const act=(h:ReturnType<typeof sessionHost>,a:Record<string,unknown>)=>h.session.action(a as UiAction);
const writes=(h:ReturnType<typeof sessionHost>)=>h.storage.operations.filter(op=>op.kind==='set'||op.kind==='remove').length;
for(const mode of ['standard','endless','daily','color_exit'] as const)test(`fresh ${mode} starts without an interactive offer or guide`,()=>{
 const h=sessionHost({},false);h.session.action({type:'newRun',mode,difficultyId:'easy'});assert.notEqual(h.session.view.screen,'guideOffer');
 if(h.session.view.screen==='prepareTools')h.session.action({type:'prepareNext'});assert.equal(h.session.view.screen,'game');assert.equal(h.session.view.guide,null);assert.equal(h.session.view.practice,undefined);
 assert.equal(h.session.view.account?.run?.identity.mode,mode==='color_exit'?'outbound':mode);if('guided' in h.session.state)assert.equal(h.session.state.guided,false);
 assert.equal(h.session.state.phase,mode==='daily'?'cleanup':'input');assert.equal(h.session.state.commandIndex,0);
 if(mode==='daily'){assert.equal(h.session.state.candidates.length,0);h.session.action({type:'chooseCleanup',branch:'placements'});assert.equal(h.session.state.phase,'input');assert.equal(h.session.view.guide,null);}
});
for(const persisted of [false,true])test(`homepage help is state and storage neutral with ${persisted?'existing':'no'} account`,()=>{
 const h=sessionHost({wallet:777,inventory:{rotate:1,clear:1,wildcard:1}},persisted),state=h.session.state,before=[...h.data],account=structuredClone(h.session.view.account);h.storage.resetFault();
 act(h,{type:'helpMenu'});assert.equal(h.session.view.screen,'helpMenu');
 for(const topic of ['inbound','outbound']){act(h,{type:'selectHelp',topic});assert.equal(h.session.view.screen,'colorIntro');assert.equal((h.session.view as unknown as {helpTopic:string}).helpTopic,topic);
 if(topic==='inbound'){h.session.action({type:'helpDetails'});assert.equal(h.session.view.screen,'helpDetails');h.session.action({type:'help'});assert.equal(h.session.view.screen,'colorIntro');}
 h.session.hide();h.session.show();h.session.action({type:'helpBack'});assert.equal(h.session.view.screen,'helpMenu');}
 h.session.action({type:'back'});assert.equal(h.session.view.screen,'menu');assert.equal(h.session.state,state);assert.deepEqual(h.session.view.account,account);assert.deepEqual([...h.data],before);assert.equal(writes(h),0);
});
test('pause help returns to the same paused game and held tools without a transaction',()=>{
 const h=sessionHost({inventory:{rotate:1,clear:1,wildcard:0}});startInbound(h.session,'standard',['rotate','clear']);h.session.togglePause();const state=h.session.state,before=[...h.data],elapsed=h.session.view.elapsed,account=structuredClone(h.session.view.account);h.storage.resetFault();
 h.session.action({type:'help'});assert.equal(h.session.view.screen,'colorIntro');assert.equal(h.session.view.confirmation,null);h.session.action({type:'helpDetails'});assert.equal(h.session.view.screen,'helpDetails');h.time(120000);h.session.tick(120000);h.session.action({type:'helpBack'});assert.equal(h.session.view.screen,'game');assert.equal(h.session.view.paused,true);assert.equal(h.session.state,state);assert.equal(h.session.view.elapsed,elapsed);assert.deepEqual(h.session.view.account,account);assert.deepEqual([...h.data],before);assert.equal(writes(h),0);
});
test('retired tutorial actions cannot change settings, open practice or start a hidden run',()=>{
 const h=sessionHost();h.session.action({type:'settings'});const before=[...h.data],state=h.session.state,account=structuredClone(h.session.view.account);h.storage.resetFault();
 for(const action of [{type:'toggleTutorials'},{type:'openPracticeSelect'},{type:'startPractice',kind:'inbound'},{type:'startPractice',kind:'outbound'},{type:'startPractice',kind:'daily'},{type:'guidedStart',track:'inbound'},{type:'skipTutorial'},{type:'introStart'}])act(h,action);
 assert.equal(h.session.view.screen,'settings');assert.equal(h.session.view.practice,undefined);assert.equal(h.session.state,state);assert.deepEqual(h.session.view.account,account);assert.deepEqual([...h.data],before);assert.equal(writes(h),0);
});
test('a saved guided16 board restores freely without deleting its identity, wallet or cargo',()=>{
 const storage=new FaultStorage(),raw=encodeAccount(makeAccountFixture({wallet:987}));storage.values.set(ACCOUNT_KEYS.a,raw);storage.values.set(ACCOUNT_KEYS.b,raw);const service=createAccountService(storage,{status:'held',release(){}},()=>0);
 const r=service.transact({type:'start',operationId:'old.guided',intent:{spec:{family:'inbound',rulesetVersion:16,mode:'standard',seed:1,guided:true,inboundDifficulty:'normal',toolCharges:{rotate:0,clear:0,wildcard:0}},items:[],guide:'guided'}},0);assert.equal(r.status,'acknowledged');const saved=r.account!;
 const h=sessionHost(saved);h.session.resume();assert.equal(h.session.view.guide,null);assert.equal(h.session.state.rulesetVersion,16);assert.equal(h.session.view.account?.wallet,987);const checksum=playableChecksum(h.session.state),move=findPlayableMoves(h.session.state).find(m=>m.origin.x!==1||m.origin.y!==1);assert.ok(move);h.session.dispatch({type:'place',...move});assert.notEqual(playableChecksum(h.session.state),checksum);assert.equal(h.session.state.commandIndex,1);const restored=new GameSession(h.platform,{seed:1,mode:'standard'});assert.equal(restored.view.guide,null);assert.equal(restored.state.commandIndex,1);
});
test('stale practice confirmation cannot close a real game or refund its tools',()=>{
 const h=sessionHost({inventory:{rotate:1,clear:1,wildcard:0}});startInbound(h.session,'standard',['rotate','clear']);const before=[...h.data],state=h.session.state,account=structuredClone(h.session.view.account);h.storage.resetFault();h.session.view.confirmation={kind:'startPractice',practiceKind:'inbound'};h.session.action({type:'confirm'});assert.equal(h.session.view.practice,undefined);assert.equal(h.session.state,state);assert.deepEqual(h.session.view.account,account);assert.deepEqual([...h.data],before);assert.equal(writes(h),0);
});
test('help chooser rejects a malformed topic without leaving the chooser or writing',()=>{
 const h=sessionHost({},false);act(h,{type:'helpMenu'});const before=[...h.data];h.storage.resetFault();act(h,{type:'selectHelp',topic:'daily'});assert.equal(h.session.view.screen,'helpMenu');assert.equal((h.session.view as unknown as {helpTopic?:string}).helpTopic,undefined);assert.deepEqual([...h.data],before);assert.equal(writes(h),0);
});
