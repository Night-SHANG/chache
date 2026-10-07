import test from 'node:test';
import assert from 'node:assert/strict';
import {makeV11Fixture} from './helpers/v11-fixtures.ts';
import {applyCommandV14,settlePhaseV14} from '../src/domain/v14/engine.ts';
import {findLegalMovesV14,reservedEntryCellsV14} from '../src/domain/v14/board.ts';
import {applyToolV14,findRescuePlanV14} from '../src/domain/v14/tools.ts';
import type {InboundRunV14,ToolCommandV14} from '../src/domain/v14/types.ts';

function fixture(patch:Partial<InboundRunV14>={}):InboundRunV14 {
 return {...makeV11Fixture(),rulesetVersion:14,runConfigId:'run.inbound_v14',...patch};
}
function filled(patch:Partial<InboundRunV14>={}):InboundRunV14 {
 const state=fixture(patch);state.board.fill('cargo.machine');
 for(const cell of reservedEntryCellsV14(state))state.board[cell]=null;
 return state;
}

// Mutation caught: treating a reserved cell as the free part of a clear witness.
test('clear cannot invent a rescue by opening two cells in a shape that crosses a permanent entry',()=>{
 const state=filled({candidates:[{id:'long',shapeId:'shape.i3_h',quarterTurns:0,cargo:'cargo.food'}],toolCharges:{rotate:0,clear:1,wildcard:0}});
 assert.deepEqual(findLegalMovesV14(state),[]);assert.equal(findRescuePlanV14(state),null);
 assert.equal(settlePhaseV14(state).phase,'result');
});

test('an actual clear witness always leaves a legal placement on placeable cells',()=>{
 const state=filled({candidates:[{id:'domino',shapeId:'shape.domino_h',quarterTurns:0,cargo:'cargo.food'}],toolCharges:{rotate:0,clear:1,wildcard:0}});
 const before=JSON.stringify(state),plan=findRescuePlanV14(state);assert.ok(plan);assert.equal(plan.length,1);
 assert.equal(plan[0].type,'clear');if(plan[0].type==='clear')for(const cell of plan[0].cells){assert.ok(!reservedEntryCellsV14(state).includes(cell));assert.notEqual(state.board[cell],null);}
 const result=applyCommandV14(settlePhaseV14(state),plan[0]);assert.equal(result.error,undefined);assert.equal(result.state.phase,'input');
 assert.ok(findLegalMovesV14(result.state).length);assert.equal(result.state.toolCharges.clear,0);assert.equal(result.state.score,0);
 assert.equal(JSON.stringify(state),before);
});

test('finite clear plus rotate or wildcard rescue respects every reserved entry and consumes each tool once',()=>{
 for(const kind of ['rotate','wildcard'] as const){
  const state=filled({phase:'rescue',candidates:[{id:'long',shapeId:'shape.i4_h',quarterTurns:0,cargo:'cargo.food'}],toolCharges:{clear:1,rotate:kind==='rotate'?1:0,wildcard:kind==='wildcard'?1:0}});
  if(kind==='rotate'){state.board[1]=null;state.board[8]=null;}
  const before=JSON.stringify(state),plan=findRescuePlanV14(state);assert.ok(plan);assert.equal(plan.length,2);
  let next=state;for(const command of plan){const result=applyCommandV14(next,command);assert.equal(result.error,undefined);next=result.state;}
  assert.equal(next.phase,'input');assert.ok(findLegalMovesV14(next).length);assert.deepEqual(next.usedToolIds.slice().sort(),['clear',kind].sort());
  assert.equal(next.commandIndex,2);assert.deepEqual(next.rngState,state.rngState);assert.equal(next.completedOrders,0);assert.equal(next.score,0);
  for(const cell of reservedEntryCellsV14(next))assert.equal(next.board[cell],null);
  for(const tool of ['clear',kind] as const){const unavailable=structuredClone(state);unavailable.toolCharges[tool]=0;assert.equal(findRescuePlanV14(unavailable),null);}
  assert.equal(JSON.stringify(state),before);
 }
});

test('an empty entry or an empty cell can never be a clear target and rejection preserves all state',()=>{
 const state=fixture({toolCharges:{rotate:0,clear:1,wildcard:0}});state.board[8]='cargo.food';
 const commands:ToolCommandV14[]=[...reservedEntryCellsV14(state).map(cell=>({type:'clear' as const,cells:[cell]})),{type:'clear',cells:[0]},{type:'clear',cells:[8,3]},{type:'clear',cells:[8,8]},{type:'clear',cells:[8,9,10]}];
 const before=JSON.stringify(state);
 for(const command of commands)for(const apply of [applyToolV14,applyCommandV14]){
  const result=apply(state,command);assert.ok(result.error);assert.equal(result.state,state);assert.deepEqual(result.events,[]);assert.equal(JSON.stringify(state),before);
 }
});

test('clear retains rules11 shipment timing, waiting until the next successful placement',()=>{
 const state=fixture({orders:[{id:'blocked-order',dockId:'dock.north',cargo:'cargo.food',amount:3,baseScore:100}],toolCharges:{rotate:0,clear:1,wildcard:0},cleanup:{branch:'placements',progress:5}});
 for(const cell of [7,8,9,10,11,12,13])state.board[cell]='cargo.machine';
 for(const cell of [22,23,24])state.board[cell]='cargo.food';
 state.cellTraits[7]={kind:'rush',remaining:1,bornAtPlacement:0};
 const result=applyCommandV14(state,{type:'clear',cells:[10]});assert.equal(result.error,undefined);
 assert.deepEqual(result.events,[{type:'toolUsed',toolId:'clear',cells:[10]}]);assert.equal(result.state.board[10],null);assert.equal(result.state.score,0);assert.equal(result.state.completedOrders,0);
 for(const field of ['orders','cleanup','successfulPlacements','rngState','generatedPieces'] as const)assert.deepEqual(result.state[field],state[field]);
 assert.deepEqual(result.state.cellTraits[7],state.cellTraits[7]);
 const placed=applyCommandV14(result.state,{type:'place',pieceId:state.candidates[2].id,origin:{x:0,y:0}});
 assert.equal(placed.error,undefined);assert.equal(placed.state.completedOrders,1);assert.equal(placed.events.filter(event=>event.type==='shipment').length,1);
 assert.ok(placed.state.score>0);for(const cell of reservedEntryCellsV14(state))assert.equal(placed.state.board[cell],null);
});

test('equivalent rotations, existing wildcards and unavailable tools consume no commands, randomness or charge',()=>{
 const state=fixture({toolCharges:{rotate:1,clear:0,wildcard:1}});
 state.candidates[0].shapeId='shape.square';state.candidates[2].trait='wildcard';
 const commands:ToolCommandV14[]=[{type:'rotate',pieceId:state.candidates[0].id,quarterTurns:1},{type:'rotate',pieceId:state.candidates[0].id,quarterTurns:2},{type:'rotate',pieceId:'missing',quarterTurns:1},{type:'wildcard',pieceId:state.candidates[2].id},{type:'clear',cells:[8]}];
 const before=JSON.stringify(state);
 for(const command of commands){const result=applyCommandV14(state,command);assert.ok(result.error);assert.equal(result.state,state);assert.deepEqual(result.events,[]);assert.equal(JSON.stringify(state),before);}
 const used=applyCommandV14(state,{type:'rotate',pieceId:state.candidates[1].id,quarterTurns:1});assert.equal(used.error,undefined);
 const repeated=applyCommandV14(used.state,{type:'rotate',pieceId:state.candidates[1].id,quarterTurns:1});assert.ok(repeated.error);assert.equal(repeated.state,used.state);
 assert.deepEqual(used.state.rngState,state.rngState);assert.equal(used.state.commandIndex,1);assert.deepEqual(used.state.usedToolIds,['rotate']);
});
