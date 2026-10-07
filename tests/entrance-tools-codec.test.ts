import test from 'node:test';
import assert from 'node:assert/strict';
import {assertGameRun,assertGameCommandShape,encodeGameRun,decodeGameRun} from '../src/application/game-codec.ts';
import {createRunV14} from '../src/domain/v14/engine.ts';
import {reservedEntryCellsV14} from '../src/domain/v14/board.ts';
import {createRunV12,applyCommandV12} from '../src/domain/v12/engine.ts';
import {createRunV13,applyCommandV13} from '../src/domain/v13/engine.ts';

test('v14 codec enforces reserved geometry and exact candidate and trait fields',()=>{
 const state=createRunV14({seed:1,mode:'standard',guided:true});
 assert.deepEqual(decodeGameRun(encodeGameRun(state)),state);
 for(const cell of reservedEntryCellsV14(state)){
  const bad=structuredClone(state);bad.board[cell]='cargo.food';assert.throws(()=>assertGameRun(bad));
 }
 const unknown=structuredClone(state);Object.assign(unknown.candidates[0],{arbitrary:true});assert.throws(()=>assertGameRun(unknown));
 const trait=structuredClone(state);trait.board[0]='cargo.food';Object.assign(trait.cellTraits,{0:{kind:'waste',arbitrary:true}});assert.throws(()=>assertGameRun(trait));
 const occupancy=structuredClone(state);occupancy.maxOccupancy=46;assert.throws(()=>assertGameRun(occupancy));
});

test('outbound codec accepts the actual final placement before refill, and rejects malformed tool snapshots',()=>{
 const state=createRunV12(1,'easy');state.completedOrders=29;state.shift=5;
 for(const cell of [4,13,22])state.board[cell]='cargo.food';
 state.candidates[0]={id:state.candidates[0].id,shapeId:'shape.single',quarterTurns:0,cargo:'cargo.food'};
 const won=applyCommandV12(state,{type:'place',pieceId:state.candidates[0].id,origin:{x:4,y:3}});
 assert.equal(won.error,undefined);assert.equal(won.state.result,'won');assert.equal(won.state.candidates.length,2);
 assert.doesNotThrow(()=>assertGameRun(won.state));assert.deepEqual(decodeGameRun(encodeGameRun(won.state)),won.state);
 const sealed=structuredClone(won.state);sealed.commandBaseIndex=128;sealed.commandIndex=128;sealed.commands=[];
 assert.doesNotThrow(()=>assertGameRun(sealed),'the winning placement can be the final command of a durably sealed history segment');
 for(const run of [createRunV12(1,'normal'),createRunV13(1,'expert')]){
  assert.deepEqual(decodeGameRun(encodeGameRun(run)),run);
  const mutate=(change:(value:typeof run)=>void)=>{const bad=structuredClone(run);change(bad);assert.throws(()=>assertGameRun(bad));};
  mutate(value=>{value.board[76]='cargo.food';});
  mutate(value=>{Object.assign(value.candidates[0],{quarterTurns:4});});
  mutate(value=>{Object.assign(value.candidates[0],{trait:'wildcard'});});
  mutate(value=>{value.usedToolIds=['rotate'];value.toolCharges.rotate=1;});
  mutate(value=>{value.commandBaseIndex=1;value.commandIndex=1;});
  mutate(value=>{value.maxOccupancy=81;});
  mutate(value=>{value.candidates.pop();});
 }
 const endless=createRunV13(1,'easy'),retired=applyCommandV13(endless,{type:'finishOutboundEndless'});
 assert.doesNotThrow(()=>assertGameRun(retired.state));
});

test('new command versions reject cross-family operations and reserved clear indexes',()=>{
 for(const version of [12,13] as const){
  assert.doesNotThrow(()=>assertGameCommandShape({type:'wildcard',pieceId:'piece.1',cargo:'cargo.food'},version));
  for(const command of [{type:'wildcard',pieceId:'piece.1'},{type:'wildcard',pieceId:'piece.1',cargo:'cargo.wood'},{type:'clear',cells:[76]},{type:'chooseCleanup',branch:'orders'},{type:'finish'}])assert.throws(()=>assertGameCommandShape(command,version));
 }
 for(const cell of reservedEntryCellsV14({boardSize:7}))assert.throws(()=>assertGameCommandShape({type:'clear',cells:[cell]},14));
 assert.throws(()=>assertGameCommandShape({type:'wildcard',pieceId:'piece.1',cargo:'cargo.food'},14));
 assert.throws(()=>assertGameCommandShape({type:'place',pieceId:'piece.1',origin:{x:7,y:0}},14));
 assert.throws(()=>assertGameCommandShape({type:'upgrade',upgradeId:'candidate_slots'},14));
});
