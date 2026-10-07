import test from 'node:test';
import assert from 'node:assert/strict';
import {makeV11Fixture} from './helpers/v11-fixtures.ts';
import {applyCommandV11,settlePhaseV11} from '../src/domain/v11/engine.ts';
import {findLegalMovesV11,pieceCellsV11} from '../src/domain/v11/board.ts';
import {findRescuePlanV11} from '../src/domain/v11/tools.ts';
import type {InboundRunV11,ToolCommandV11} from '../src/domain/v11/types.ts';

function blocked(kind:'rotate'|'wildcard',commandIndex=0):InboundRunV11{
 const state=makeV11Fixture({phase:'rescue',shift:3,completedOrders:12,commandIndex,commands:Array.from({length:commandIndex},()=>({type:'place' as const,pieceId:'prior',origin:{x:0,y:0}})),toolCharges:{clear:1,rotate:kind==='rotate'?1:0,wildcard:kind==='wildcard'?1:0}});
 state.board.fill('cargo.machine');state.candidates=state.candidates.map(piece=>({...piece,shapeId:'shape.i4_h'}));
 if(kind==='rotate'){state.board[0]=null;state.board[21]=null;}
 return state;
}

test('three-slot two-tool rescue requires and executes clear plus rotate or wildcard including command128',()=>{
 for(const kind of ['rotate','wildcard'] as const)for(const commandIndex of [0,127]){
  const state=blocked(kind,commandIndex),before=JSON.stringify(state),plan=findRescuePlanV11(state);assert.ok(plan);assert.equal(plan.length,2);
  let replay=state;for(const command of plan){const result=applyCommandV11(replay,command);assert.equal(result.error,undefined);replay=result.state;}
  assert.ok(findLegalMovesV11(replay).length);assert.equal(replay.commandIndex,commandIndex+2);assert.equal(replay.phase,'input');assert.equal(replay.candidates.length,3);
  assert.deepEqual(replay.usedToolIds.slice().sort(),['clear',kind].sort());assert.equal(JSON.stringify(state),before);
  for(const tool of ['clear',kind] as const){const unavailable=structuredClone(state);unavailable.toolCharges[tool]=0;assert.equal(findRescuePlanV11(unavailable),null);}
 }
});

test('available tools consume once without RNG, deadline, cleanup, score, order or placement advancement',()=>{
 const state=makeV11Fixture({toolCharges:{rotate:1,clear:0,wildcard:1},successfulPlacements:7,cleanup:{branch:'placements',progress:5}});
 state.candidates[0].shapeId='shape.i4_h';state.board[0]='cargo.food';state.cellTraits[0]={kind:'rush',remaining:1,bornAtPlacement:3};
 const rotated=applyCommandV11(state,{type:'rotate',pieceId:state.candidates[0].id,quarterTurns:1});assert.equal(rotated.error,undefined);
 assert.equal(rotated.state.candidates[0].quarterTurns,1);assert.deepEqual(pieceCellsV11(rotated.state.candidates[0]),[{x:0,y:0},{x:0,y:1},{x:0,y:2},{x:0,y:3}]);
 const wildcard=applyCommandV11(rotated.state,{type:'wildcard',pieceId:state.candidates[1].id});assert.equal(wildcard.error,undefined);
 assert.equal(wildcard.state.candidates[1].trait,'wildcard');assert.equal(wildcard.state.candidates[1].id,state.candidates[1].id);
 for(const next of [rotated.state,wildcard.state])for(const field of ['rngState','cellTraits','cleanup','score','orders','successfulPlacements','completedOrders','generatedPieces'] as const)assert.deepEqual(next[field],state[field],field);
 assert.deepEqual(wildcard.state.usedToolIds,['rotate','wildcard']);assert.equal(wildcard.state.commandIndex,2);
 assert.ok(applyCommandV11(wildcard.state,{type:'wildcard',pieceId:state.candidates[2].id}).error);
});

test('clear removes exactly selected cargo and traits and creates a real clear-only rescue witness',()=>{
 const state=makeV11Fixture({toolCharges:{rotate:0,clear:1,wildcard:0}});state.board.fill('cargo.machine');state.cellTraits[8]={kind:'rush',remaining:1,bornAtPlacement:0};
 const rescue=settlePhaseV11(state);assert.equal(rescue.phase,'rescue');const plan=findRescuePlanV11(rescue)!;assert.equal(plan.length,1);
 const result=applyCommandV11(rescue,{type:'clear',cells:[8,9]});assert.equal(result.error,undefined);assert.equal(result.state.board[8],null);assert.equal(result.state.board[9],null);assert.equal(result.state.cellTraits[8],null);assert.equal(result.state.board[10],'cargo.machine');
 assert.equal(result.state.phase,'input');assert.equal(result.state.toolCharges.clear,0);assert.equal(result.state.successfulPlacements,0);
});

test('invalid, equivalent, unavailable or prohibited tools reject without consumption or mutation',()=>{
 const state=makeV11Fixture({toolCharges:{rotate:1,clear:1,wildcard:0}});state.candidates[0].shapeId='shape.square';state.board[8]='cargo.food';
 const commands:ToolCommandV11[]=[{type:'rotate',pieceId:state.candidates[0].id,quarterTurns:1},{type:'rotate',pieceId:'missing',quarterTurns:1},{type:'clear',cells:[]},{type:'clear',cells:[8,8]},{type:'clear',cells:[49]},{type:'clear',cells:[0]},{type:'clear',cells:[8,9,10]},{type:'wildcard',pieceId:state.candidates[0].id}];
 const before=JSON.stringify(state);for(const command of commands){const result=applyCommandV11(state,command);assert.ok(result.error);assert.equal(result.state,state);assert.deepEqual(result.events,[]);assert.equal(JSON.stringify(state),before);}
 for(const patch of [{phase:'cleanup' as const},{phase:'result' as const,result:'failed' as const,endReason:'blocked' as const},{mode:'daily' as const}]){const unavailable={...state,...patch},result=applyCommandV11(unavailable,{type:'clear',cells:[8]});assert.ok(result.error);assert.equal(result.state,unavailable);}
});
