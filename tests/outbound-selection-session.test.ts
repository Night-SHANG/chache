import test from 'node:test';
import assert from 'node:assert/strict';
import {GameSession} from '../src/application/session.ts';
import {FaultStorage,makeAccountFixture} from './helpers/account-fixtures.ts';
import {encodeAccount,ACCOUNT_KEYS} from '../src/application/account-store.ts';
import {getUiControls} from '../src/presentation/ui.ts';
import type {OutboundDifficulty} from '../src/domain/types.ts';
import type {Platform} from '../src/platform/types.ts';

function reopen(storage:FaultStorage){return new GameSession({storage,writerLease:{status:'held',release(){}},now:()=>0,wallTime:()=>0,playSound(){},stopSounds(){}} as unknown as Platform,{seed:1,mode:'standard'});}
function host(){const storage=new FaultStorage(),account=makeAccountFixture(),raw=encodeAccount({...account,generation:1,lastOperation:{operationId:'fixture',expectedGeneration:0,requestDigest:'fixture',committedGeneration:1}});storage.values.set(ACCOUNT_KEYS.a,raw);storage.values.set(ACCOUNT_KEYS.b,raw);return {storage,session:reopen(storage)};}
function choose(session:GameSession,difficulty:OutboundDifficulty){const start=getUiControls(session.state,session.view).find(c=>c.action.type==='newRun'&&c.action.difficultyId===difficulty);assert.ok(start);session.action(start.action);}

test('fresh selection defaults to ordinary and repeated mode switches never write or replace the board',()=>{
 const {session:s,storage}=host();assert.equal(s.view.outboundSelectionMode,'normal');s.action({type:'chooseColorTier'});
 const before=[...storage.values],state=s.state,account=s.view.account;storage.resetFault();
 for(const mode of ['endless','endless','normal','normal','endless'] as const){s.action({type:'selectOutboundMode',mode});assert.equal(s.view.outboundSelectionMode,mode);assert.equal(s.state,state);assert.equal(s.view.account,account);}
 assert.deepEqual([...storage.values],before);assert.equal(storage.operations.filter(o=>o.kind==='set'||o.kind==='remove').length,0);
});

test('all four difficulty starts retain selected mode and all preparations omit retired guidance',()=>{
 for(const mode of ['normal','endless'] as const)for(const difficulty of ['easy','normal','hard','expert'] as const){
  const {session:s}=host();s.action({type:'chooseColorTier'});s.action({type:'selectOutboundMode',mode});choose(s,difficulty);
  assert.equal(s.view.screen,'prepareTools');
  assert.equal(s.view.guide,null);
  assert.equal(s.view.screen,'prepareTools');s.action({type:'prepareNext'});
  assert.equal(s.state.rulesetVersion,mode==='normal'?12:13);assert.equal('difficultyId' in s.state&&s.state.difficultyId,difficulty);
  assert.equal(s.view.account?.run?.identity.mode,mode==='normal'?'outbound':'outboundEndless');assert.equal(s.view.outboundSelectionMode,mode);
 }
});

test('preparation Back preserves mode but a fresh home entry resets ordinary without saving any selection',()=>{
 const {session:s,storage}=host();s.action({type:'chooseColorTier'});const before=[...storage.values];
 choose(s,'easy');assert.equal(s.view.screen,'prepareTools');s.action({type:'back'});assert.equal(s.view.screen,'colorTiers');assert.equal(s.view.outboundSelectionMode,'normal');
 s.action({type:'selectOutboundMode',mode:'endless'});choose(s,'easy');assert.equal(s.view.screen,'prepareTools');s.action({type:'back'});assert.equal(s.view.screen,'colorTiers');assert.equal(s.view.outboundSelectionMode,'endless');
 s.action({type:'home'});s.action({type:'chooseColorTier'});assert.equal(s.view.outboundSelectionMode,'normal');
 assert.deepEqual([...storage.values],before);assert.equal(reopen(storage).view.outboundSelectionMode,'normal','a menu preference is not persisted');
});

test('restored outbound run synchronizes selector once and hidden toggles cannot change its identity',()=>{
 for(const mode of ['normal','endless'] as const){
  const {session:s,storage}=host();s.action({type:'chooseColorTier'});s.action({type:'selectOutboundMode',mode});choose(s,'hard');s.action({type:'prepareNext'});
  const restored=reopen(storage),state=restored.state,identity=restored.view.account?.run?.identity,before=[...storage.values];
  assert.equal(restored.view.needsResume,true);assert.equal(restored.view.outboundSelectionMode,mode);
  restored.action({type:'selectOutboundMode',mode:mode==='normal'?'endless':'normal'});
  assert.equal(restored.view.outboundSelectionMode,mode);restored.resume();
  restored.action({type:'selectOutboundMode',mode:mode==='normal'?'endless':'normal'});
  assert.equal(restored.view.outboundSelectionMode,mode);assert.equal(restored.state,state);assert.deepEqual(restored.view.account?.run?.identity,identity);assert.deepEqual([...storage.values],before);
  restored.action({type:'home'});restored.action({type:'cancel'});assert.equal(restored.state,state);
 }
});

test('stale guidance action cannot reinterpret an infinite or advanced difficulty preparation',()=>{
 for(const [mode,difficulty] of [['endless','easy'],['normal','expert']] as const){
  const {session:s}=host();s.action({type:'chooseColorTier'});s.action({type:'selectOutboundMode',mode});choose(s,difficulty);
  s.action({type:'guidedStart',track:'outbound'});assert.equal(s.view.screen,'prepareTools');assert.equal(s.view.prepareIntent?.guide,'direct');
  s.action({type:'selectOutboundMode',mode:mode==='normal'?'endless':'normal'});assert.equal(s.view.outboundSelectionMode,mode);
  s.action({type:'prepareNext'});assert.equal(s.state.rulesetVersion,mode==='normal'?12:13);assert.equal('difficultyId' in s.state&&s.state.difficultyId,difficulty);
 }
});
