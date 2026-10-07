import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import * as support from '../scripts/entrance-host-support.mjs';
import {validateResumeStorage} from '../scripts/growth-host-support.mjs';
import {ACCOUNT_KEYS} from '../src/application/account-store.ts';
import {createPlayableRun,type RunSpec} from '../src/domain/playable.ts';

const binding=()=>({commit:'a'.repeat(40),expectedCommit:'a'.repeat(40),sourceSha256:'b'.repeat(64),expectedSourceSha256:'b'.repeat(64),manifestSourceSha256:'b'.repeat(64),gameJsSha256:'c'.repeat(64),expectedGameJsSha256:'c'.repeat(64)});
const sha256=(bytes:string)=>createHash('sha256').update(bytes).digest('hex');
const spec:RunSpec={family:'outbound',variant:'normal',rulesetVersion:12,seed:17,difficultyId:'easy',toolCharges:{rotate:1,clear:1,wildcard:0}};

test('entrance host evidence requires exact owner commit, source and actual game bytes',()=>{
 assert.equal(typeof support.verifyEntranceBinding,'function');
 assert.doesNotThrow(()=>support.verifyEntranceBinding(binding()));
 for(const key of ['commit','expectedCommit','sourceSha256','expectedSourceSha256','manifestSourceSha256','gameJsSha256','expectedGameJsSha256'] as const){
  assert.throws(()=>support.verifyEntranceBinding({...binding(),[key]:undefined} as unknown as ReturnType<typeof binding>),/hash|commit|source|game/i);
  assert.throws(()=>support.verifyEntranceBinding({...binding(),[key]:'d'.repeat(key.toLowerCase().includes('commit')?40:64)}),/commit|source|game/i);
 }
});

test('entrance resume fixtures reserve outbound tools and reject unlabelled constructed geometry',()=>{
 assert.equal(typeof support.entranceFixtureStorage,'function');
 const storage=support.entranceFixtureStorage(spec),read=validateResumeStorage(storage);
 assert.deepEqual(read.account!.run!.reserved,['rotate','clear']);
 const state=createPlayableRun(spec);state.board[0]='cargo.food';
 assert.throws(()=>support.entranceFixtureStorage(spec,[],{constructedState:state}),/constructed|label/i);
 const constructed=support.entranceFixtureStorage(spec,[],{constructedState:state,label:'CONSTRUCTED: occupied cell for direct native touch QA'});
 assert.equal(validateResumeStorage(constructed).account!.run!.state.board[0],'cargo.food');
 state.board[76]='cargo.food';
 assert.throws(()=>support.entranceFixtureStorage(spec,[],{constructedState:state,label:'CONSTRUCTED: invalid reserved cell'}),/entry|入口|state|存档|reserved/i);
});

test('entrance host refuses corrupt resume roots before executing and reports actual VM crashes',async()=>{
 assert.equal(typeof support.createBoundEntranceHost,'function');
 const dir=await mkdtemp(join(tmpdir(),'entrance-host-protocol-'));
 try{
  const bundlePath=join(dir,'game.js'),bytes='throw Error("entrance host intentional failure")';await writeFile(bundlePath,bytes);
  const hashes={...binding(),gameJsSha256:sha256(bytes),expectedGameJsSha256:sha256(bytes)};
  await assert.rejects(support.createBoundEntranceHost(hashes,{bundlePath,storage:new Map([[ACCOUNT_KEYS.a,'{'],[ACCOUNT_KEYS.b,'{']])}),/resume|fixture|account/i);
  await assert.rejects(support.createBoundEntranceHost(hashes,{bundlePath}),/entrance host intentional failure/);
  await writeFile(bundlePath,'globalThis.fakeGame=true;');
  await assert.rejects(support.createBoundEntranceHost(hashes,{bundlePath}),/game.*hash|bytes/i);
 }finally{await rm(dir,{recursive:true,force:true});}
});
