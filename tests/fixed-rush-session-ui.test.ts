import test from 'node:test';
import assert from 'node:assert/strict';
import {GameSession} from '../src/application/session.ts';
import {sessionHost} from './helpers/session-fixtures.ts';
import {getUiControls} from '../src/presentation/ui.ts';
import {createRunV19} from '../src/domain/v19/engine.ts';
import {makeAccountRun} from './helpers/account-fixtures.ts';

for(const tier of ['hard','expert'] as const)test(`${tier} menu starts fixed rush21 without carrying a difficulty`,()=>{
 const h=sessionHost({wallet:777,inventory:{rotate:1,clear:1,wildcard:1}});h.session.action({type:'chooseInbound'});h.session.action({type:'selectInboundDifficulty',inboundDifficulty:tier});
 const starts=getUiControls(h.session.state,h.session.view).filter(c=>c.action.type==='newRun');assert.deepEqual(starts.map(c=>c.label),['开始','开始','开始']);
 const rush=starts.find(c=>c.action.type==='newRun'&&c.action.mode==='rush')!;assert.deepEqual(rush.action,{type:'newRun',mode:'rush'});h.session.action(rush.action);
 assert.equal(h.session.view.prepareIntent?.spec.rulesetVersion,21);assert.equal('inboundDifficulty' in h.session.view.prepareIntent!.spec,false);
 const before=[...h.data];for(const item of ['rotate','clear','wildcard'] as const)h.session.action({type:'toggleItem',item});assert.deepEqual(h.session.view.prepareIntent?.items,['rotate','clear']);h.session.action({type:'back'});assert.deepEqual([...h.data],before);
 h.session.action({type:'newRun',mode:'rush',inboundDifficulty:tier});h.session.action({type:'toggleItem',item:'rotate'});h.session.action({type:'prepareNext'});
 assert.equal(Number(h.session.state.rulesetVersion),21);assert.equal(h.session.state.mode,'rush');assert.equal(h.session.state.phase,'cleanup');assert.equal(h.session.state.commandIndex,0);assert.deepEqual(h.session.state.candidates,[]);assert.equal(h.session.view.account?.run?.identity.inboundDifficulty,'normal');assert.equal(h.session.view.account?.run?.identity.challengeDay,undefined);
 h.time(50000);h.session.tick(50000);assert.equal(h.session.view.elapsed,0);const seed=h.session.state.seed,serial=h.session.state.runSerial;
 const restored=new GameSession(h.platform,{seed:900,mode:'standard'});assert.deepEqual(restored.state,h.session.state);restored.resume();h.time(90000);restored.action({type:'chooseCleanup',branch:'placements'});assert.equal(restored.view.elapsed,0);h.time(91000);restored.tick(91000);assert.equal(restored.view.elapsed,1000);
 restored.restart();const snapshot=[...h.data],saved=structuredClone(restored.state);restored.action({type:'cancel'});assert.deepEqual(restored.state,saved);assert.deepEqual([...h.data],snapshot);
 restored.restart();restored.action({type:'confirm'});assert.equal(restored.view.screen,'prepareTools');assert.equal(restored.view.account?.inventory.rotate,1);restored.action({type:'prepareNext'});assert.equal(restored.state.rulesetVersion,21);assert.notEqual(restored.state.seed,seed);assert.notEqual(restored.state.runSerial,serial);
});

test('stale daily action starts fresh fixed rush without daily reward locking',()=>{
 const h=sessionHost({formatVersion:2,economyVersion:2,dailyRewards:{'2026-10-06':{completedRunId:'old.daily',bonusPaid:40}}});h.session.action({type:'newRun',mode:'daily',inboundDifficulty:'expert'});assert.equal(h.session.view.prepareIntent?.spec.rulesetVersion,21);h.session.action({type:'prepareNext'});assert.equal(h.session.state.mode,'rush');assert.equal(h.session.view.account?.run?.identity.inboundDifficulty,'normal');assert.deepEqual(h.session.view.account?.dailyRewards,{'2026-10-06':{completedRunId:'old.daily',bonusPaid:40}});
});

test('restored rush19 retains its original bound difficulty until an explicitly confirmed new run',()=>{
 const state=createRunV19({seed:71,mode:'rush',inboundDifficulty:'expert'});state.runSerial=1;const run=makeAccountRun({state,identity:{runId:'old19.rush',serial:1,rulesetVersion:19,runConfigId:state.runConfigId,mode:'rush',inboundDifficulty:'expert',economyVersion:2},history:{seed:state.seed,runConfigId:state.runConfigId,head:null,totalCommands:0,tail:[]}}),h=sessionHost({run,nextRunSerial:2,formatVersion:2,economyVersion:2,dailyRewards:{}});h.session.resume();assert.deepEqual(h.session.state,state);h.session.restart();h.session.action({type:'cancel'});assert.deepEqual(h.session.state,state);h.session.restart();h.session.action({type:'confirm'});h.session.action({type:'prepareNext'});assert.equal(Number(h.session.state.rulesetVersion),21);assert.equal(h.session.view.account?.run?.identity.inboundDifficulty,'normal');assert.notEqual(h.session.state.seed,state.seed);
});
