import test from 'node:test';
import assert from 'node:assert/strict';
import { createRunV14, applyCommandV14 } from '../src/domain/v14/engine.ts';
import { assertGameRun, decodeGameRun, encodeGameRun } from '../src/application/game-codec.ts';
import { createRunV12 } from '../src/domain/v12/engine.ts';

test('codec accepts multi-cell rush candidates only in14 and rejects mismatched clocks for same piece',()=>{
 const state=applyCommandV14(createRunV14({seed:1,mode:'standard'}),{type:'chooseCleanup',branch:'orders'}).state;
 state.candidates[0]={id:state.candidates[0].id,shapeId:'shape.domino_h',cargo:'cargo.food',quarterTurns:0,trait:'rush',rushTurns:3};
 assert.doesNotThrow(()=>assertGameRun(state));
 assert.deepEqual(decodeGameRun(encodeGameRun(state)),state);
 assert.throws(()=>assertGameRun({...state,candidates:[{...state.candidates[0],shapeId:'shape.square'},...state.candidates.slice(1)]}));
 assert.throws(()=>assertGameRun({...state,candidates:[{...state.candidates[0],cargo:'cargo.cold'},...state.candidates.slice(1)]}));
 for(const trait of ['pallet','hazard','wildcard'] as const)assert.throws(()=>assertGameRun({...state,candidates:[{...state.candidates[0],trait,rushTurns:undefined},...state.candidates.slice(1)]}));
 const placed={...state,successfulPlacements:1,board:[...state.board],cellTraits:[...state.cellTraits]};
 placed.board[0]='cargo.food';placed.board[1]='cargo.food';
 placed.cellTraits[0]={kind:'rush',remaining:3,bornAtPlacement:1};placed.cellTraits[1]={kind:'rush',remaining:2,bornAtPlacement:1};
 assert.throws(()=>assertGameRun(placed));
});

test('codec requires raw score and validates the cumulative difficulty relation instead of divisibility by ten',()=>{
 const state=createRunV12(1,'normal');
 const scaled={...state,rawScore:10,score:12};
 assert.doesNotThrow(()=>assertGameRun(scaled));
 assert.deepEqual(decodeGameRun(encodeGameRun(scaled)),scaled);
 assert.throws(()=>assertGameRun({...scaled,score:10}));
 assert.throws(()=>assertGameRun({...scaled,rawScore:Number.MAX_SAFE_INTEGER}));
 const missing={...scaled} as Record<string,unknown>;delete missing.rawScore;assert.throws(()=>assertGameRun(missing));
});
