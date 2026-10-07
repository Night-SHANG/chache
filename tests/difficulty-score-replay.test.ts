import test from 'node:test';
import assert from 'node:assert/strict';
import type {OutboundDifficulty} from '../src/domain/types.ts';
import {createRunV6,drawPieceRollsV6,generatePieceV6} from '../src/domain/v6/engine.ts';
import {applyCommandV12,createRunV12,findLegalMovesV12} from '../src/domain/v12/engine.ts';
import {applyCommandV13,createRunV13,findLegalMovesV13} from '../src/domain/v13/engine.ts';
import {checksumV12,compactCommandTailV12,replayV12} from '../src/domain/v12/replay.ts';
import {checksumV13,compactCommandTailV13,replayV13} from '../src/domain/v13/replay.ts';
import {displayScoreV12} from '../src/domain/v12/score.ts';
import type {OutboundToolRunV12,OutboundToolCommandV12} from '../src/domain/v12/types.ts';
import type {OutboundToolRunV13,OutboundToolCommandV13} from '../src/domain/v13/types.ts';

type State=OutboundToolRunV12|OutboundToolRunV13;
function apply(state:State,command:OutboundToolCommandV13) {
 return state.rulesetVersion===12?applyCommandV12(state,command as OutboundToolCommandV12):applyCommandV13(state,command);
}
function checksum(state:State):string {return state.rulesetVersion===12?checksumV12(state):checksumV13(state);}
function shipFive(state:State) {
 const input=structuredClone(state);input.candidates[0]={id:'fixture',shapeId:'shape.single',cargo:'cargo.food',quarterTurns:0};
 for(const cell of [4,13,22,31])input.board[cell]='cargo.food';
 return apply(input,{type:'place',pieceId:'fixture',origin:{x:4,y:4}});
}

// Mutation target: replay or restoring raw points as displayed points changes shipment deltas.
test('real generated command replay and JSON restore retain exact raw points in every tier',()=>{
 for(const version of [12,13] as const)for(const [difficulty,seed] of [['easy',1],['normal',1],['hard',19],['expert',10]] as const){
  let state:State=version===12?createRunV12(seed,difficulty):createRunV13(seed,difficulty),restored=structuredClone(state);
  let cumulativeRaw=0,cumulativeDisplayed=0,shipments=0;
  const commands:OutboundToolCommandV12[]=[];
  for(let index=0;index<40&&state.phase==='input';index++){
   const move=state.rulesetVersion===12?findLegalMovesV12(state)[0]:findLegalMovesV13(state)[0];assert.ok(move);
   const command={type:'place',...move} as const,result=apply(state,command);assert.equal(result.error,undefined);
   const restoredResult=apply(restored,command);assert.deepEqual(restoredResult,result);
   for(const event of result.events)if(event.type==='shipment'){
    cumulativeRaw+=event.units*10;cumulativeDisplayed+=event.score;shipments++;
    assert.equal(cumulativeDisplayed,displayScoreV12(cumulativeRaw,difficulty));
   }
   state=result.state;commands.push(command);assert.equal(state.rawScore,cumulativeRaw);assert.equal(state.score,cumulativeDisplayed);
   restored=JSON.parse(JSON.stringify(state)) as State;
   assert.equal(checksum(restored),checksum(state));
  }
  assert.ok(shipments>=2,`${version}/${difficulty} must replay real scoring, not just empty moves`);
  const replayed=version===12?replayV12(seed,difficulty,commands):replayV13(seed,difficulty,commands);
  assert.deepEqual(replayed,state);assert.equal(checksum(replayed),checksum(state));
 }
});

// Mutation target: compaction accidentally resets the fractional carry or rescaling a loaded score.
test('normal and endless command compaction preserves score and the next shipment delta',()=>{
 for(const version of [12,13] as const){
  let state:State=version===12?createRunV12(17,'normal'):createRunV13(17,'normal');
  // Domain fixture for an already sealed prefix: each synthetic command is an accepted five-cell shipment.
  for(let index=0;index<129;index++){
   if(version===12){state.completedOrders=0;state.phase='input';state.result=null;state.endReason=null;}
   const result=shipFive(state);assert.equal(result.error,undefined);state=result.state;
  }
  assert.equal(state.rawScore,6450);assert.equal(state.score,8062);
  const compacted=state.rulesetVersion===12?compactCommandTailV12(state,128):compactCommandTailV13(state,128);
  assert.equal(compacted.commandBaseIndex,128);assert.equal(compacted.commands.length,1);assert.equal(compacted.commandIndex,129);
  assert.equal(compacted.rawScore,6450);assert.equal(compacted.score,8062);assert.equal(checksum(compacted),checksum(state));
  const restored=JSON.parse(JSON.stringify(compacted)) as State,expected=shipFive(state),actual=shipFive(restored);
  assert.equal(actual.state.rawScore,6500);assert.equal(actual.state.score,8125);
  assert.deepEqual(actual.events.filter(event=>event.type==='shipment').map(event=>event.score),[63]);
  assert.deepEqual(actual.events,expected.events);assert.equal(checksum(actual.state),checksum(expected.state));
 }
});

// Mutation target: an endless score cap or retirement-time multiplier alters the earned total.
test('endless high score continues past thirty and retirement settles without multiplying again',()=>{
 for(const difficulty of ['easy','normal','hard','expert'] as const){
  const state=createRunV13(17,difficulty);state.rawScore=5_000_000_010;state.score=displayScoreV12(state.rawScore,difficulty);
  state.completedOrders=100_000_001;state.shift=5;
  const shipped=shipFive(state);assert.equal(shipped.error,undefined);assert.equal(shipped.state.rawScore,state.rawScore+50);
  assert.equal(shipped.state.score,displayScoreV12(state.rawScore+50,difficulty));assert.equal(shipped.state.phase,'input');
  assert.equal(shipped.state.completedOrders,100_000_002);assert.equal(shipped.state.shift,5);
  for(const phase of ['input','rescue'] as const){
   const retired=applyCommandV13({...shipped.state,phase} as OutboundToolRunV13,{type:'finishOutboundEndless'});
   assert.equal(retired.error,undefined);assert.equal(retired.state.rawScore,shipped.state.rawScore);assert.equal(retired.state.score,shipped.state.score);
   assert.deepEqual(retired.events,[{type:'result',result:'won',endReason:'retired'}]);
   const repeated=applyCommandV13(retired.state,{type:'finishOutboundEndless'});assert.ok(repeated.error);assert.equal(repeated.state,retired.state);
  }
 }
});

// Mutation target: scoring draws random numbers or score-based supply changes the frozen difficulty generator.
test('difficulty scoring preserves frozen initial and replacement generation',()=>{
 for(const version of [12,13] as const)for(const difficulty of ['easy','normal','hard','expert'] as const){
  const state:State=version===12?createRunV12(17,difficulty):createRunV13(17,difficulty),legacy=createRunV6(17,difficulty);
  assert.deepEqual(state.rngState,legacy.rngState);assert.deepEqual(state.candidates,legacy.candidates.map(piece=>({...piece,quarterTurns:0})));
  const shipped=shipFive(state);assert.equal(shipped.error,undefined);assert.deepEqual(shipped.state.rngState,drawPieceRollsV6(state.rngState).rngState);
  const expected=generatePieceV6({...shipped.state,candidates:shipped.state.candidates.slice(1),phase:'input',commands:[],rngState:state.rngState,nextId:state.nextId});
  assert.deepEqual(shipped.state.candidates[0],{...expected.piece,quarterTurns:0});assert.equal(shipped.state.generatedPieces,state.generatedPieces+1);
  const large={...state,rawScore:1_000_000,score:displayScoreV12(1_000_000,difficulty as OutboundDifficulty)},high=shipFive(large);
  assert.deepEqual(high.state.candidates,shipped.state.candidates);assert.deepEqual(high.state.rngState,shipped.state.rngState);
 }
});
