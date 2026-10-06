import test from 'node:test';import assert from 'node:assert/strict';import {makeV9Fixture} from './helpers/v9-fixtures.ts';import {applyToolV9} from '../src/domain/v9/tools.ts';import {createRunV9} from '../src/domain/v9/engine.ts';
test('rotation stores original shape and changed normalized orientation and rejects equivalent turns',()=>{
 const s=makeV9Fixture({toolCharges:{rotate:1,clear:0,wildcard:0}});s.candidates[0].shapeId='shape.i4_h';const r=applyToolV9(s,{type:'rotate',pieceId:s.candidates[0].id,quarterTurns:1});assert.equal(r.state.candidates[0].shapeId,'shape.i4_h');assert.equal(r.state.candidates[0].quarterTurns,1);assert.equal(r.state.toolCharges.rotate,0);assert.deepEqual(r.state.usedToolIds,['rotate']);
 for(const [shape,turns] of [['shape.i4_h',0],['shape.i4_h',4],['shape.domino_h',2],['shape.square',1]] as const){s.candidates[0].shapeId=shape;const json=JSON.stringify(s);const n=applyToolV9(s,{type:'rotate',pieceId:s.candidates[0].id,quarterTurns:turns as 1});assert.ok(n.error);assert.equal(n.state,s);assert.equal(JSON.stringify(s),json);}
});
test('clear removes only one or two selected cells with traits and rejects invalid selections',()=>{
 const s=makeV9Fixture({toolCharges:{rotate:0,clear:1,wildcard:0}});for(const i of [8,9,10]){s.board[i]='cargo.food';s.cellTraits[i]={kind:'rush',remaining:2,bornAtPlacement:0};}
 const r=applyToolV9(s,{type:'clear',cells:[8,9]});assert.equal(r.state.board[8],null);assert.equal(r.state.cellTraits[9],null);assert.equal(r.state.board[10],'cargo.food');assert.equal(r.state.cellTraits[10]?.remaining,2);
 for(const cells of [[],[8,8],[49],[0],[8,9,10]]){const n=applyToolV9(s,{type:'clear',cells});assert.equal(n.state,s);assert.ok(n.error);}
});
test('wildcard changes exactly its candidate without a draw or immediate settlement',()=>{
 const s=makeV9Fixture({toolCharges:{rotate:0,clear:0,wildcard:1},cleanup:{branch:'placements',progress:5},successfulPlacements:7});s.candidates=[{...s.candidates[0],id:'a'},{...s.candidates[0],id:'b'},{...s.candidates[0],id:'c'}];s.board[0]='cargo.food';s.cellTraits[0]={kind:'rush',remaining:1,bornAtPlacement:3};
 const r=applyToolV9(s,{type:'wildcard',pieceId:'b'});assert.deepEqual(r.state.candidates[0],s.candidates[0]);assert.deepEqual(r.state.candidates[2],s.candidates[2]);assert.equal(r.state.candidates[1].trait,'wildcard');assert.equal(r.state.candidates[1].id,'b');assert.deepEqual(r.state.rngState,s.rngState);assert.deepEqual(r.state.orders,s.orders);assert.equal(r.state.score,s.score);assert.equal(r.state.successfulPlacements,7);assert.deepEqual(r.state.cleanup,s.cleanup);assert.deepEqual(r.state.cellTraits,s.cellTraits);
 assert.ok(applyToolV9(s,{type:'wildcard',pieceId:'missing'}).error);s.candidates[1].trait='wildcard';assert.ok(applyToolV9(s,{type:'wildcard',pieceId:'b'}).error);
});
test('tools reject unavailable charges, prohibited phases, daily starts and excessive charges',()=>{
 for(const phase of ['cleanup','upgrade','result'] as const){const s=makeV9Fixture({phase,toolCharges:{rotate:1,clear:0,wildcard:0}});assert.equal(applyToolV9(s,{type:'rotate',pieceId:s.candidates[0].id,quarterTurns:1}).state,s);}
 assert.throws(()=>createRunV9({seed:1,mode:'standard',toolCharges:{rotate:1,clear:1,wildcard:1}}));assert.throws(()=>createRunV9({seed:1,mode:'daily',toolCharges:{rotate:1,clear:0,wildcard:0}}));assert.throws(()=>createRunV9({seed:1,mode:'standard',toolCharges:{rotate:2 as 1,clear:0,wildcard:0}}));assert.deepEqual(createRunV9({seed:1,mode:'standard',toolCharges:{rotate:1,clear:0,wildcard:0}}).usedToolIds,[]);
});
