import {verifyAccountReferences} from '../src/application/history-store.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import {GameSession,COMPARISON_SEED_KEY} from '../src/application/session.ts';
import {createProfile,encodeProfile,PROFILE_KEYS} from '../src/application/profile.ts';
import {ACCOUNT_KEYS,loadAccount} from '../src/application/account-store.ts';
import {saveKeysFor} from '../src/application/save.ts';
import {playableChecksum,findPlayableMoves} from '../src/domain/playable.ts';
import {checksumV12,replayV12} from '../src/domain/v12/replay.ts';
import {createRun} from '../src/domain/engine.ts';
import type {Platform} from '../src/platform/types.ts';
import {startCurrentRun,storeLegacyRun} from './helpers/legacy-session-fixtures.ts';
import {legacyState} from './helpers/session-fixtures.ts';
function host(){
 const data=new Map<string,string>(),profile=createProfile(),writes:string[]=[];profile.tutorialComplete=true;data.set(PROFILE_KEYS.main,encodeProfile(profile));let fail='';
 const platform={storage:{get:(key:string)=>data.get(key)??null,set:(key:string,value:string)=>{if(key===fail)throw Error('write unavailable');data.set(key,value);writes.push(key);},remove:(key:string)=>{data.delete(key);writes.push(key);}},writerLease:{status:'held',release(){}},now:()=>0,wallTime:()=>Date.parse('2026-10-06'),playSound:()=>{},stopSounds:()=>{}} as unknown as Platform;
 return {data,writes,platform,fail:(key:string)=>{fail=key;}};
}
const start=(session:GameSession,difficultyId:'easy'|'normal'='easy')=>startCurrentRun(session,'color_exit',difficultyId);
test('account outbound restarts allocate new sequences while cancellation and reload retain the saved sequence',()=>{
 const h=host(),s=new GameSession(h.platform,{seed:17,mode:'standard'});start(s);const first=s.state.seed,raw=JSON.stringify([...h.data]),digest=playableChecksum(s.state);s.restart();s.action({type:'cancel'});assert.equal(JSON.stringify([...h.data]),raw);assert.equal(playableChecksum(s.state),digest);s.hide();s.show();
 const restored=new GameSession(h.platform,{seed:17,mode:'standard'});assert.equal(restored.state.seed,first);assert.equal(restored.view.needsResume,true);restored.resume();start(restored);const second=restored.state.seed;assert.notEqual(second,first);restored.action({type:'home'});restored.action({type:'confirm'});start(restored);assert.equal(new Set([first,second,restored.state.seed]).size,3);
 const command={type:'place' as const,...findPlayableMoves(restored.state)[0]},seed=restored.state.seed;restored.dispatch(command);assert.equal(playableChecksum(restored.state),checksumV12(replayV12(seed,'easy',[command])));assert.equal(restored.view.account?.run?.history.seed,seed);
});
test('account outbound ignores a historical comparison preference across difficulty starts',()=>{
 const h=host();h.data.set(COMPARISON_SEED_KEY,'73');const s=new GameSession(h.platform,{seed:17,mode:'standard'});start(s);const first=s.state.seed;assert.notEqual(first,73);s.action({type:'home'});s.action({type:'confirm'});start(s,'normal');assert.notEqual(s.state.seed,first);assert.equal(h.data.get(COMPARISON_SEED_KEY),'73');
});
test('failed account start consumes no sequence and preserves stored legacy progress before retry',()=>{
 const h=host(),old=createRun(17,'standard',3);old.runSerial=37;storeLegacyRun(h.data,old,true);const s=new GameSession(h.platform,{seed:17,mode:'standard'});s.resume();s.action({type:'toggleSound'});const prior=playableChecksum(s.state),priorRaw=h.data.get(saveKeysFor('orders').main),serial=s.profile.nextRunSerial,accountRaw=[h.data.get(ACCOUNT_KEYS.a),h.data.get(ACCOUNT_KEYS.b)];
 h.fail(ACCOUNT_KEYS.b);s.action({type:'newRun',mode:'color_exit',difficultyId:'easy'});s.action({type:'confirm'});if(s.view.screen==='guideOffer')s.action({type:'directStart'});assert.equal(s.view.screen,'prepareTools');s.action({type:'prepareNext'});
 assert.equal(playableChecksum(s.state),prior);assert.equal(h.data.get(saveKeysFor('orders').main),priorRaw);assert.equal(s.profile.nextRunSerial,serial);assert.equal(s.view.account?.run,null);assert.equal(s.view.saveStatus,'保存结果尚未确认，请重试');assert.deepEqual([h.data.get(ACCOUNT_KEYS.a),h.data.get(ACCOUNT_KEYS.b)],accountRaw);assert.equal(loadAccount(h.platform.storage,account=>verifyAccountReferences(h.platform.storage,account)).account?.nextRunSerial,serial);
 h.fail('');start(s);assert.equal(s.state.rulesetVersion,12);assert.equal(s.state.runSerial,serial);assert.equal(loadAccount(h.platform.storage,account=>verifyAccountReferences(h.platform.storage,account)).account?.run?.identity.serial,serial);assert.equal(s.view.account?.nextRunSerial,serial+1);assert.equal(h.data.get(saveKeysFor('orders').main),priorRaw);
});
test('stored developer comparison runs retain their fixed seed while preferences never rewrite them',()=>{
 const h=host();for(const tier of ['entry','middle'] as const){const state=createRun(17,'color_exit',5,tier);state.runSerial=tier==='entry'?1:2;storeLegacyRun(h.data,state,tier==='entry');}
 const s=new GameSession(h.platform,{seed:17,mode:'standard',developerMode:true});s.resume();const entry=h.data.get(saveKeysFor('color_exit_entry').main);s.action({type:'comparisonSeedNext'});assert.equal(s.view.comparisonSeed,18);assert.equal(h.data.get(saveKeysFor('color_exit_entry').main),entry);
 for(const tier of ['middle','entry'] as const){s.action({type:'switchMode',variant:`color_exit_${tier}`});s.action({type:'confirm'});assert.equal(legacyState(s).seed,17);assert.equal(s.state.rulesetVersion,5);}
});
test('account daily same-day restarts retain their actual v18 hard challenge and seed',()=>{
 const h=host(),s=new GameSession(h.platform,{seed:17,mode:'standard'});startCurrentRun(s,'daily');const seed=s.state.seed,day=s.view.account?.run?.identity.challengeDay,serial=s.state.runSerial;assert.equal(s.state.rulesetVersion,18);assert.equal(s.view.account?.run?.identity.challengeDay,'2026-10-06');startCurrentRun(s,'daily');assert.equal(s.state.seed,seed);assert.equal(s.view.account?.run?.identity.challengeDay,day);assert.ok(s.state.runSerial!>serial!);
});
