import test from 'node:test';
import assert from 'node:assert/strict';
import {createRunV20,applyCommandV20,asV16} from '../src/domain/v20/engine.ts';
import {presentationPieceCells,inboundGroups,inboundOrderGroup,inboundDocks} from '../src/presentation/inbound-helpers.ts';
import {toolPreview} from '../src/presentation/tool-preview.ts';
import {collectGroupsV16,selectOrderGroupV16,docksV16} from '../src/domain/v16/board.ts';

test('fixed20 presentation honors rotations instead of treating pieces as old static shapes',()=>{
 const piece={id:'probe',shapeId:'shape.domino_h',cargo:'cargo.food',quarterTurns:1} as const;
 assert.deepEqual(presentationPieceCells(piece,20),[{x:0,y:0},{x:0,y:1}]);
});
test('fixed20 tool preview uses the inbound wildcard and keeps raw score and rush timing unchanged',()=>{
 const state=applyCommandV20(createRunV20({seed:17,mode:'rush',toolCharges:{rotate:1,clear:0,wildcard:1}}),{type:'chooseCleanup',branch:'placements'}).state;
 const before=structuredClone(state),command={type:'wildcard' as const,pieceId:state.candidates[0].id},preview=toolPreview(state,command),actual=applyCommandV20(state,command);
 assert.equal(preview.error,undefined);assert.deepEqual(preview,actual);assert.deepEqual(state,before);assert.equal(actual.state.mode,'rush');assert.equal(actual.state.score,actual.state.rawScore);assert.equal(actual.state.successfulPlacements,before.successfulPlacements);assert.deepEqual(actual.state.cleanup,before.cleanup);
});
test('fixed20 grouping and active docks use the fixed daily projection without mutating its identity',()=>{
 const state=applyCommandV20(createRunV20({seed:17,mode:'rush'}),{type:'chooseCleanup',branch:'orders'}).state;
 for(const cell of [8,9,10])state.board[cell]='cargo.food';
 const before=structuredClone(state),raw=asV16(state);
 assert.deepEqual(inboundGroups(state,'cargo.food'),collectGroupsV16(raw,'cargo.food'));
 for(const order of state.orders)assert.deepEqual(inboundOrderGroup(state,order),selectOrderGroupV16(raw,order));
 assert.deepEqual(inboundDocks(state),docksV16(raw));assert.deepEqual(state,before);
});
