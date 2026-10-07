import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import * as support from '../scripts/final-economy-host-support.mjs';
import {validateResumeStorage} from '../scripts/growth-host-support.mjs';
import {ACCOUNT_KEYS} from '../src/application/account-store.ts';
import {createPlayableRun,type RunSpec} from '../src/domain/playable.ts';

const binding=()=>({commit:'a'.repeat(40),expectedCommit:'a'.repeat(40),sourceSha256:'b'.repeat(64),expectedSourceSha256:'b'.repeat(64),manifestSourceSha256:'b'.repeat(64),gameJsSha256:'c'.repeat(64),expectedGameJsSha256:'c'.repeat(64)});
const sha256=(bytes:string)=>createHash('sha256').update(bytes).digest('hex');
const spec:RunSpec={family:'outbound',variant:'normal',rulesetVersion:12,seed:17,difficultyId:'easy',toolCharges:{rotate:1,clear:1,wildcard:0}};

test('final economy host evidence requires exact owner commit, source and actual game bytes',()=>{
 assert.equal(typeof support.verifyFinalEconomyBinding,'function');
 assert.doesNotThrow(()=>support.verifyFinalEconomyBinding(binding()));
 for(const key of ['commit','expectedCommit','sourceSha256','expectedSourceSha256','manifestSourceSha256','gameJsSha256','expectedGameJsSha256'] as const){
  assert.throws(()=>support.verifyFinalEconomyBinding({...binding(),[key]:undefined} as unknown as ReturnType<typeof binding>),/hash|commit|source|game/i);
  assert.throws(()=>support.verifyFinalEconomyBinding({...binding(),[key]:'d'.repeat(key.toLowerCase().includes('commit')?40:64)}),/commit|source|game/i);
 }
});

test('final economy resume fixtures reserve outbound tools and reject unlabelled constructed geometry',()=>{
 assert.equal(typeof support.finalEconomyFixtureStorage,'function');
 const storage=support.finalEconomyFixtureStorage(spec),read=validateResumeStorage(storage);
 assert.deepEqual(read.account!.run!.reserved,['rotate','clear']);
 assert.equal(read.account!.formatVersion,2);assert.equal(read.account!.economyVersion,2);assert.equal(read.account!.run!.identity.economyVersion,2);assert.deepEqual(read.account!.dailyRewards,{});
 const state=createPlayableRun(spec);state.board[0]='cargo.food';
 assert.throws(()=>support.finalEconomyFixtureStorage(spec,[],{constructedState:state}),/constructed|label/i);
 const constructed=support.finalEconomyFixtureStorage(spec,[],{constructedState:state,label:'CONSTRUCTED: occupied cell for direct native touch QA'});
 assert.equal(validateResumeStorage(constructed).account!.run!.state.board[0],'cargo.food');
 state.board[76]='cargo.food';
 assert.throws(()=>support.finalEconomyFixtureStorage(spec,[],{constructedState:state,label:'CONSTRUCTED: invalid reserved cell'}),/entry|入口|state|存档|reserved/i);
});

test('final economy host refuses corrupt resume roots before executing and reports actual VM crashes',async()=>{
 assert.equal(typeof support.createBoundFinalEconomyHost,'function');
 const dir=await mkdtemp(join(tmpdir(),'final-economy-host-protocol-'));
 try{
  const bundlePath=join(dir,'game.js'),bytes='throw Error("final economy host intentional failure")';await writeFile(bundlePath,bytes);
  const hashes={...binding(),gameJsSha256:sha256(bytes),expectedGameJsSha256:sha256(bytes)};
  await assert.rejects(support.createBoundFinalEconomyHost(hashes,{bundlePath,storage:new Map([[ACCOUNT_KEYS.a,'{'],[ACCOUNT_KEYS.b,'{']])}),/resume|fixture|account/i);
  await assert.rejects(support.createBoundFinalEconomyHost(hashes,{bundlePath}),/final economy host intentional failure/);
  await writeFile(bundlePath,'globalThis.fakeGame=true;');
  await assert.rejects(support.createBoundFinalEconomyHost(hashes,{bundlePath}),/game.*hash|bytes/i);
 }finally{await rm(dir,{recursive:true,force:true});}
});


test('current outbound fixtures retain raw/displayed score and version2 cumulative credits',()=>{
 const state=createPlayableRun({...spec,difficultyId:'normal'});assert.ok('rawScore' in state);state.rawScore=50;state.score=62;
 const storage=support.finalEconomyFixtureStorage({...spec,difficultyId:'normal'},[],{constructedState:state,label:'CONSTRUCTED: fractional cumulative scoring boundary'});const account=validateResumeStorage(storage).account!;
 assert.equal(account.wallet,2);assert.equal(account.run!.creditedBase,2);assert.equal(account.run!.state.score,62);
 assert.throws(()=>support.finalEconomyFixtureStorage({...spec,family:'inbound',mode:'daily'} as unknown as RunSpec),/Daily.*real/);
 const old=support.finalEconomyFixtureStorage({family:'outbound',variant:'normal',rulesetVersion:8,seed:17,difficultyId:'easy'},[],{economyVersion:1});assert.equal(validateResumeStorage(old).account!.run!.identity.economyVersion,1);
});

test('recovery inspections require explicit non-ready provenance and still execute only bound bytes',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'final-economy-recovery-'));
 try{const bundlePath=join(dir,'game.js'),bytes='throw Error("actual recovery host reached")';await writeFile(bundlePath,bytes);const hashes={...binding(),gameJsSha256:sha256(bytes),expectedGameJsSha256:sha256(bytes)},storage=new Map([[ACCOUNT_KEYS.a,'{'],[ACCOUNT_KEYS.b,'{']]);
 await assert.rejects(support.createBoundFinalEconomyHost(hashes,{bundlePath,storage,inspectStorageLabel:'skip'}),/inspection.*label/i);
 await assert.rejects(support.createBoundFinalEconomyHost(hashes,{bundlePath,storage,inspectStorageLabel:'INSPECTION: unknown account roots remain blocked'}),/actual recovery host reached/);
 }finally{await rm(dir,{recursive:true,force:true});}
});

import {simpleClearState,chooseDailyScenario} from '../scripts/host-final-economy.mjs';
import {applyPlayableCommand,playableChecksum} from '../src/domain/playable.ts';
import {localDailyChallenge} from '../src/application/profile.ts';
test('final host score and transport fixtures are strict current saves with real three-group clear settlement',()=>{
 for(const version of [12,13] as const)for(const difficultyId of ['easy','normal','hard','expert'] as const){const current:RunSpec={family:'outbound',variant:version===12?'normal':'endless',rulesetVersion:version,seed:17,difficultyId,toolCharges:{rotate:0,clear:1,wildcard:0}};const state=simpleClearState(current,{terminal:version===12});support.finalEconomyFixtureStorage(current,[],{constructedState:state,label:'CONSTRUCTED: score boundary'});const next=applyPlayableCommand(state,{type:'clear',cells:[40]});assert.equal(next.error,undefined);assert.ok('rawScore' in next.state);assert.equal(next.state.rawScore,90);}
 for(const version of [12,13] as const){const current:RunSpec={...spec,variant:version===12?'normal':'endless',rulesetVersion:version};const state=simpleClearState(current,{chain:true,terminal:version===12});support.finalEconomyFixtureStorage(current,[],{constructedState:state,label:'CONSTRUCTED: three-group corridor'});const result=applyPlayableCommand(state,{type:'clear',cells:[67]});assert.equal(result.error,undefined);assert.deepEqual(result.events.filter(e=>e.type==='shipment').map(e=>e.dockId),['dock.north','dock.east','dock.west']);if(version===12)assert.equal(result.state.result,'won');}
});
test('final daily scenario selection uses production Shanghai seeds and genuine reducer commands',()=>{
 const scenario=chooseDailyScenario(),identity=localDailyChallenge(scenario.epoch,15);assert.equal(scenario.identity.seed,identity.seed);assert.ok(scenario.epoch>=Date.parse('2026-10-07T12:00:00Z')&&scenario.epoch<Date.parse('2026-10-14T12:00:00Z'));
 let state=createPlayableRun({family:'inbound',rulesetVersion:15,mode:'daily',seed:identity.seed,guided:false,toolCharges:{rotate:0,clear:0,wildcard:0}});for(const command of scenario.commands){const result=applyPlayableCommand(state,command as Parameters<typeof applyPlayableCommand>[1]);assert.equal(result.error,undefined);state=result.state;}assert.equal(state.result,'won');assert.equal(playableChecksum(state),scenario.finalChecksum);
});
