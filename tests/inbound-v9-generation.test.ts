import test from 'node:test';
import assert from 'node:assert/strict';
import { createRandomState } from '../src/domain/random.ts';
import { makeV9Fixture } from './helpers/v9-fixtures.ts';
import { boostProbabilityV9,generationDistributionV9,generatePieceV9,refreshOrdersV9,refillCandidateV9 } from '../src/domain/v9/generation.ts';
const close=(a:number,b:number)=>assert.ok(Math.abs(a-b)<1e-12,`${a} != ${b}`);
test('probability boosts add percentage points while preserving a larger base',()=>{
 for(const [base,levels,cap,want] of [[.4,2,.9,.6],[.85,2,.9,.9],[.95,1,.9,.95],[.3,1,.8,.4],[.3,2,.8,.5],[.85,2,.8,.85]])close(boostProbabilityV9(base,levels,.1,cap),want);
});
test('stage and guided trait shares and pallet upgrades have exact denominators',()=>{
 const s=makeV9Fixture();const shares=()=>Object.values(generationDistributionV9(s).traits);
 assert.deepEqual(shares(),[.94,0,.06,0,0]);s.shift=2;assert.deepEqual(shares(),[.94,0,.06,0,0]);s.shift=3;assert.deepEqual(shares(),[.85,.05,.06,.03,.01]);
 s.levels.pallet_rate=1;assert.deepEqual(shares(),[.8,.1,.06,.03,.01]);s.levels.pallet_rate=2;assert.deepEqual(shares(),[.75,.15,.06,.03,.01]);
 s.guided=true;s.shift=1;assert.deepEqual(shares(),[1,0,0,0,0]);s.shift=2;assert.deepEqual(shares(),[.94,0,.06,0,0]);
});
test('small boost follows occupancy and repetition adjustment and preserves subgroup ratios',()=>{
 const s=makeV9Fixture({shift:3});for(let i=0;i<20;i++)s.board[i]='cargo.food';const base=generationDistributionV9(s);s.levels.small_parcels=2;const boosted=generationDistributionV9(s);
 const small=(d:typeof base)=>d.ordinaryShapes.filter(p=>['shape.single','shape.domino_h','shape.domino_v'].includes(p.shapeId));
 close(small(boosted).reduce((n,p)=>n+p.probability,0),boostProbabilityV9(small(base).reduce((n,p)=>n+p.probability,0),2,.1,.9));
 close(small(boosted)[1].probability/small(boosted)[2].probability,small(base)[1].probability/small(base)[2].probability);
 close(boosted.ordinaryShapes.reduce((n,p)=>n+p.probability,0),1);
 s.supplyCargo='cargo.food';s.levels.cargo_supply=1;const supplied=generationDistributionV9(s);close(supplied.nonWildcardCargos[0].probability,boostProbabilityV9(base.nonWildcardCargos[0].probability,1,.1,.8));close(supplied.nonWildcardCargos.reduce((n,p)=>n+p.probability,0),1);
});
test('pure generation has no forced fourth pallet, shape downgrade or rescue draw',()=>{
 const s=makeV9Fixture({shift:3,generatedPieces:3});s.board.fill('cargo.machine');const json=JSON.stringify(s);const a=generatePieceV9(s),b=generatePieceV9(s);assert.deepEqual(a,b);assert.equal(JSON.stringify(s),json);assert.equal(a.state.generatedPieces,4);
 let pallets=0;for(let seed=1;seed<=40;seed++){const p=generatePieceV9(makeV9Fixture({seed,rngState:createRandomState(seed),shift:3,generatedPieces:3})).piece;if(p.trait==='pallet')pallets++;}assert.ok(pallets<40);
});
test('orders use raw stage ranges, apply reduction once and replacement preserves other slots',()=>{
 const s=makeV9Fixture({shift:5,orders:[]});s.levels.light_orders=1;const orders=refreshOrdersV9(s);assert.ok(orders.orders.every(o=>o.amount>=4&&o.amount<=6));
 s.candidates=[{id:'a',shapeId:'shape.i4_h',quarterTurns:1,cargo:'cargo.food'},{id:'b',shapeId:'shape.single',quarterTurns:0,cargo:'cargo.chem'},{id:'c',shapeId:'shape.domino_h',quarterTurns:3,cargo:'cargo.machine'}];
 const next=refillCandidateV9(s,1);assert.deepEqual(next.candidates[0],s.candidates[0]);assert.deepEqual(next.candidates[2],s.candidates[2]);assert.notEqual(next.candidates[1].id,'b');assert.equal(next.candidates.length,3);
});
test('replacement shape repetition considers only unconsumed candidates',()=>{
 for(let seed=1;seed<=500;seed++){const s=makeV9Fixture({seed,rngState:createRandomState(seed)});s.candidates[0].shapeId='shape.i3_h';s.rngState=createRandomState(seed*104729);const remaining={...s,candidates:s.candidates.filter((_,i)=>i!==0)};const expected=generatePieceV9(remaining);const actual=refillCandidateV9(s,0);assert.deepEqual(actual.candidates[0],expected.piece,`seed ${seed}`);assert.deepEqual(actual.rngState,expected.state.rngState);}
});
