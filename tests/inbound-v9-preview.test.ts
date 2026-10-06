import test from 'node:test';import assert from 'node:assert/strict';import {makeV9Fixture} from './helpers/v9-fixtures.ts';import {applyCommandV9,previewPlacementV9} from '../src/domain/v9/engine.ts';
test('preview uses complete accepted settlement with no source mutations',()=>{
 const s=makeV9Fixture({cleanup:{branch:'placements',progress:5},completedOrders:3});for(const i of [8,9,10])s.board[i]='cargo.food';s.board[0]='cargo.machine';s.cellTraits[0]={kind:'rush',remaining:1,bornAtPlacement:0};s.board[48]='cargo.food';s.cellTraits[48]={kind:'waste'};
 const json=JSON.stringify(s),p=previewPlacementV9(s,s.candidates[0].id,{x:4,y:1}),r=applyCommandV9(s,{type:'place',pieceId:s.candidates[0].id,origin:{x:4,y:1}});assert.ok(p.valid);assert.deepEqual(p.stateAfter,r.state);assert.deepEqual(p.events,r.events);assert.deepEqual(p.shipments,r.events.filter(e=>e.type==='shipment'));assert.equal(JSON.stringify(s),json);
});
test('invalid placement keeps state identity and all events, RNG, deadlines and history unchanged',()=>{
 const s=makeV9Fixture();s.board[0]='cargo.food';s.cellTraits[0]={kind:'rush',remaining:1,bornAtPlacement:0};const json=JSON.stringify(s),r=applyCommandV9(s,{type:'place',pieceId:s.candidates[0].id,origin:{x:0,y:0}});assert.equal(r.state,s);assert.deepEqual(r.events,[]);assert.ok(r.error);assert.equal(JSON.stringify(s),json);assert.equal(previewPlacementV9(s,s.candidates[0].id,{x:0,y:0}).valid,false);
});
