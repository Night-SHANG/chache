import assert from 'node:assert/strict';
import test from 'node:test';
import {createRun} from '../src/domain/engine.ts';
import {encodeRun} from '../src/application/save.ts';
import {createRunV9,applyCommandV9} from '../src/domain/v9/engine.ts';
import {createRunV10} from '../src/domain/v10/engine.ts';
import {assertGameCommandShape,assertGameRun,decodeGameRun,encodeGameRun} from '../src/application/game-codec.ts';

test('game codec preserves legacy envelopes and encodes new identities separately',()=>{
 for(const difficulty of ['easy','normal','hard','expert'] as const){
  const old=createRun(17,'color_exit',8,difficulty);
  assert.equal(encodeGameRun(old),encodeRun(old));assert.deepEqual(decodeGameRun(encodeRun(old)),old);
  const endless=createRunV10(17,difficulty);
  assert.deepEqual(decodeGameRun(encodeGameRun(endless)),endless);
 }
 for(const mode of ['standard','daily','endless'] as const){
  const fresh=createRunV9({seed:17,mode}),chosen=applyCommandV9(fresh,{type:'chooseCleanup',branch:'orders'}).state;
  assert.deepEqual(decodeGameRun(encodeGameRun(fresh)),fresh);assert.deepEqual(decodeGameRun(encodeGameRun(chosen)),chosen);
 }
});

test('game codec rejects mismatched versions, sizes, traits, commands and reward state',()=>{
 const inbound=applyCommandV9(createRunV9({seed:1,mode:'standard'}),{type:'chooseCleanup',branch:'orders'}).state;
 const outbound=createRunV10(47,'expert');
 const bad:unknown[]=[
  {...inbound,rulesetVersion:10},{...outbound,rulesetVersion:9},{...outbound,rulesetVersion:11},
  {...inbound,boardSize:8},{...outbound,boardSize:7},{...outbound,difficultyId:'easy'},
  {...inbound,toolCharges:{rotate:1,clear:1,wildcard:1}},
  {...inbound,levels:{...inbound.levels,light_orders:2}},
  {...inbound,pendingThresholds:[4,4]},
  {...inbound,candidates:inbound.candidates.map((p,i)=>i===0?{...p,quarterTurns:4}:p)},
  {...outbound,commandIndex:1,commands:[{type:'chooseCleanup',branch:'orders'}]},
  {...outbound,cellTraits:outbound.cellTraits.map((v,i)=>i===0?{kind:'rush',remaining:3}:v)},
  {...inbound,commandBaseIndex:128},
 ];
 for(const value of bad)assert.throws(()=>assertGameRun(value));
});

test('game codec verifies envelope digest and rejects wrong schema without altering raw input',()=>{
 const run=createRunV10(1,'easy'),raw=encodeGameRun(run),value=JSON.parse(raw);
 value.state.score+=10;assert.throws(()=>decodeGameRun(JSON.stringify(value)));
 value.state.score-=10;value.schemaVersion=9;assert.throws(()=>decodeGameRun(JSON.stringify(value)));
 assert.deepEqual(decodeGameRun(raw),run);
});

test('shared history command schema rejects coerced rotations and more than two clear cells',()=>{
 assert.throws(()=>assertGameCommandShape({type:'rotate',pieceId:'piece.1',quarterTurns:'1'},9));
 assert.throws(()=>assertGameCommandShape({type:'clear',cells:[0,1,2]},9));
 assert.throws(()=>assertGameCommandShape({type:'finishOutboundEndless'},8));
 assert.doesNotThrow(()=>assertGameCommandShape({type:'clear',cells:[0,63]},9));
});

test('new identities reject impossible pending phases, retirement results and foreign growth fields',()=>{
 const inbound=applyCommandV9(createRunV9({seed:1,mode:'standard'}),{type:'chooseCleanup',branch:'orders'}).state;
 assert.throws(()=>assertGameRun({...inbound,completedOrders:4,pendingThresholds:[4]}));
 for(const mode of ['standard','daily','endless'])assert.throws(()=>assertGameRun({...inbound,mode,phase:'result',result:'won',endReason:'retired'}));
 assert.throws(()=>assertGameRun({...inbound,upgrades:[]}));
 assert.throws(()=>assertGameRun({...createRunV10(1,'easy'),levels:inbound.levels}));
});
