import test from 'node:test';
import assert from 'node:assert/strict';
import {assertGameRun,assertGameCommandShape,encodeGameRun,decodeGameRun} from '../src/application/game-codec.ts';
import {createRunV11,applyCommandV11,findLegalMovesV11} from '../src/domain/v11/engine.ts';
import {isInboundV9,isInboundV11,isInboundRun,createPlayableRun} from '../src/domain/playable.ts';
import {NEUTRAL_LEVEL_IDS_V11} from '../src/domain/v11/content.ts';
import type {InboundRunV11} from '../src/domain/v11/types.ts';

function active(){return applyCommandV11(createRunV11({seed:17,mode:'standard'}),{type:'chooseCleanup',branch:'orders'}).state;}
function rejects(mutate:(value:Record<string,unknown>)=>void){const state:Record<string,unknown>=JSON.parse(JSON.stringify(active()));mutate(state);assert.throws(()=>assertGameRun(state));}

test('new codec round trips normal, daily, endless, guided, pending cleanup and accepted command states',()=>{
 for(const mode of ['standard','daily','endless'] as const)for(const guided of mode==='standard'?[false,true]:[false]){
  let state=createRunV11({seed:17,mode,guided});assert.deepEqual(decodeGameRun(encodeGameRun(state)),state);
  if(state.phase==='cleanup')state=applyCommandV11(state,{type:'chooseCleanup',branch:'placements'}).state;
  assert.deepEqual(decodeGameRun(encodeGameRun(state)),state);
  const move=findLegalMovesV11(state)[0];state=applyCommandV11(state,{type:'place',...move}).state;
  assert.deepEqual(decodeGameRun(encodeGameRun(state)),state);
 }
});

test('codec rejects every nonzero compatibility level, upgrade reward, supply and upgrade command',()=>{
 for(const id of NEUTRAL_LEVEL_IDS_V11)for(const value of [-1,1,.5,'0',null])rejects(state=>{(state.levels as Record<string,unknown>)[id]=value;});
 rejects(state=>{delete(state.levels as Record<string,unknown>).side_gate;});rejects(state=>{(state.levels as Record<string,unknown>).gift=0;});
 for(const field of ['upgradeChoices','pendingThresholds','claimedThresholds'])rejects(state=>{state[field]=field==='upgradeChoices'?['side_gate']:[4];});
 rejects(state=>{state.supplyCargo='cargo.food';});rejects(state=>{state.phase='upgrade';});
 rejects(state=>{state.commands=[{type:'upgrade',upgradeId:'candidate_slots'}];state.commandIndex=1;});
 assert.throws(()=>assertGameCommandShape({type:'upgrade',upgradeId:'candidate_slots'},11));
 assert.doesNotThrow(()=>assertGameCommandShape({type:'upgrade',upgradeId:'candidate_slots'},9));
});

test('codec enforces fixed board and three slots plus exact rule identity and seven-square command coordinates',()=>{
 rejects(state=>{state.boardSize=8;state.board=Array(64).fill(null);state.cellTraits=Array(64).fill(null);});
 rejects(state=>{state.board=Array(48).fill(null);});rejects(state=>{state.cellTraits=Array(50).fill(null);});
 rejects(state=>{(state.candidates as unknown[]).pop();});rejects(state=>{(state.candidates as unknown[]).push({...active().candidates[0],id:'extra'});});
 rejects(state=>{state.runConfigId='run.inbound_v9';});rejects(state=>{state.rulesetVersion=9;});rejects(state=>{state.difficultyId='normal';});
 rejects(state=>{state.mode='color_exit';});rejects(state=>{state.mode='daily';state.guided=true;});
 assert.doesNotThrow(()=>assertGameCommandShape({type:'place',pieceId:'piece.1',origin:{x:6,y:6}},11));
 assert.throws(()=>assertGameCommandShape({type:'place',pieceId:'piece.1',origin:{x:7,y:0}},11));
 assert.throws(()=>assertGameCommandShape({type:'clear',cells:[49]},11));
 assert.doesNotThrow(()=>assertGameCommandShape({type:'place',pieceId:'piece.1',origin:{x:7,y:7}},9));
 assert.doesNotThrow(()=>assertGameCommandShape({type:'clear',cells:[63]},9));
});

test('codec digest and envelope prevent version substitution, state tampering and replay metadata corruption',()=>{
 const encoded=encodeGameRun(active()),envelope=JSON.parse(encoded);
 envelope.state.score++;assert.throws(()=>decodeGameRun(JSON.stringify(envelope)),/校验/);
 const mismatch=JSON.parse(encoded);mismatch.schemaVersion=9;assert.throws(()=>decodeGameRun(JSON.stringify(mismatch)),/版本/);
 rejects(state=>{state.commandBaseIndex=1;state.commandIndex=2;});
 rejects(state=>{state.commandIndex=2;});rejects(state=>{state.toolCharges={rotate:1,clear:1,wildcard:1};});
 rejects(state=>{state.usedToolIds=['clear'];state.toolCharges={rotate:0,clear:1,wildcard:0};});
});

test('broad inbound identity includes nine and eleven while exact guards keep old upgrade routes isolated',()=>{
 const old=createPlayableRun({family:'inbound',rulesetVersion:9,mode:'standard',seed:1,guided:false,toolCharges:{rotate:0,clear:0,wildcard:0}}),fresh=active();
 assert.ok(isInboundRun(old)&&isInboundRun(fresh));assert.ok(isInboundV9(old));assert.equal(isInboundV9(fresh),false);
 assert.ok(isInboundV11(fresh));assert.equal(isInboundV11(old),false);
 const restored=decodeGameRun(encodeGameRun(fresh));assert.ok(isInboundV11(restored));assert.deepEqual(restored,fresh satisfies InboundRunV11);
});
