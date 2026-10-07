import test from 'node:test';
import assert from 'node:assert/strict';
import {nextRandom} from '../src/domain/random.ts';
import {CARGO,SHAPES} from '../src/domain/rulesets/v1/content.ts';
import {createRunV14} from '../src/domain/v14/engine.ts';
import {pieceCellsV14} from '../src/domain/v14/board.ts';
import {generationDistributionV14,generatePieceV14,refillCandidateV14} from '../src/domain/v14/generation.ts';
import type {InboundRunV14,StartV14} from '../src/domain/v14/types.ts';

function fixture(mode:StartV14['mode'],shift:InboundRunV14['shift'],guided=false):InboundRunV14 {
 const state=createRunV14({seed:17,mode,guided});
 Object.assign(state,{shift,completedOrders:(shift-1)*6,phase:'input',cleanup:{branch:'orders',progress:0}});
 return state;
}
function select<T>(values:T[],weights:number[],draw:number):T {
 const total=weights.reduce((sum,weight)=>sum+weight,0);let cumulative=0;
 for(let i=0;i<values.length;i++){cumulative+=weights[i]/total;if(draw<cumulative)return values[i];}
 return values[values.length-1];
}

// Mutation caught: daily retaining ordinary six percent, or rush stealing pallet/hazard/wildcard mass.
test('each mode and shift has its approved exclusive rush rate and preserves other special rates',()=>{
 for(const mode of ['standard','daily','endless'] as const)for(const shift of [1,2,3,4,5] as const){
  const rush=mode==='daily'?.12:.06,special=shift>=3;
  assert.deepEqual(generationDistributionV14(fixture(mode,shift)).traits,{
   normal:(100-(mode==='daily'?12:6)-(special?9:0))/100,pallet:special?.05:0,rush,hazard:special?.03:0,wildcard:special?.01:0,
  });
 }
 for(const shift of [1,2,3,4,5] as const){
  const guided=generationDistributionV14(fixture('standard',shift,true)).traits;
  assert.equal(guided.rush,shift===1?0:.06);
  assert.deepEqual(guided,shift===1?{normal:1,pallet:0,rush:0,hazard:0,wildcard:0}:generationDistributionV14(fixture('standard',shift)).traits);
 }
});

// Mutation caught: replacing real occupancy/recent-shape/cargo adaptation with a uniform or frozen tape.
test('ordinary and rush share the actual occupancy-adjusted shape and inventory-weighted cargo pools',()=>{
 const state=fixture('daily',3);state.candidates=[{id:'recent',shapeId:'shape.domino_h',cargo:'cargo.food',quarterTurns:0,trait:'rush',rushTurns:3}];
 for(const cell of [0,1,2,7,8,9])state.board[cell]='cargo.food';
 state.cellTraits[0]={kind:'pallet'};state.cellTraits[1]={kind:'waste'};
 state.board[12]='cargo.machine';state.board[13]='cargo.cold';
 const distribution=generationDistributionV14(state),shapes=SHAPES.filter(shape=>shape.minShift<=3);
 const weights=shapes.map(shape=>{
  let weight=shape.weight*100;
  if(shape.cells.length<=2)weight=Math.floor(weight*(100+Math.floor(8*200/49))/100);
  if(shape.id==='shape.domino_h')weight=Math.floor(weight/2);
  return weight;
 });
 const shapeTotal=weights.reduce((sum,weight)=>sum+weight,0);
 assert.deepEqual(distribution.ordinaryShapes,shapes.map((shape,i)=>({shapeId:shape.id,probability:weights[i]/shapeTotal})));
 assert.deepEqual(distribution.nonWildcardCargos,[{cargo:'cargo.food',probability:32/94},{cargo:'cargo.machine',probability:22/94},{cargo:'cargo.chem',probability:20/94},{cargo:'cargo.electronic',probability:20/94}]);
});

// Mutation caught: rush omitting/reordering the shape draw, using its own pool, or adding a wildcard cargo draw.
test('seeded draws consume trait then ordinary shape for normal/rush then one shared cargo, across all modes and stages',()=>{
 const seenRushShapes=new Set<string>(),seenRushCargos=new Set<string>(),seenSpecials=new Set<string>();
 for(const mode of ['standard','daily','endless'] as const)for(const shift of [1,2,3,4,5] as const)for(let seed=1;seed<=520;seed++){
  const state=fixture(mode,shift);state.rngState=createRunV14({seed:seed*104729,mode}).rngState;state.candidates=[{id:'recent',shapeId:'shape.i3_h',quarterTurns:0,cargo:'cargo.food'}];
  for(const cell of [7,8,14,15,16,17,23])state.board[cell]='cargo.machine';
  const before=structuredClone(state),distribution=generationDistributionV14(state);
  const traitDraw=nextRandom(state.rngState,0,0xffffffff),trait=select(['normal','pallet','rush','hazard','wildcard'] as const,Object.values(distribution.traits),traitDraw.value/0x100000000);
  let rng=traitDraw.state,shapeId='shape.single';
  if(trait==='normal'||trait==='rush'){
   const shapeDraw=nextRandom(rng,0,0xffffffff);rng=shapeDraw.state;
   shapeId=select(distribution.ordinaryShapes.map(shape=>shape.shapeId),distribution.ordinaryShapes.map(shape=>shape.probability),shapeDraw.value/0x100000000);
  }
  let cargo=distribution.nonWildcardCargos[0].cargo;
  if(trait!=='wildcard'){
   const cargoDraw=nextRandom(rng,0,0xffffffff);rng=cargoDraw.state;
   cargo=select(distribution.nonWildcardCargos.map(entry=>entry.cargo),distribution.nonWildcardCargos.map(entry=>entry.probability),cargoDraw.value/0x100000000);
  }
  const generated=generatePieceV14(state);
  assert.equal(generated.piece.trait??'normal',trait,`${mode}/${shift}/${seed}`);
  assert.equal(generated.piece.shapeId,shapeId,`${trait} shape ${mode}/${shift}/${seed}`);
  assert.equal(generated.piece.cargo,cargo,`${trait} cargo ${mode}/${shift}/${seed}`);
  assert.deepEqual(generated.state.rngState,rng,`${trait} RNG ${mode}/${shift}/${seed}`);
  assert.equal(generated.piece.quarterTurns,0);assert.equal(generated.state.nextId,state.nextId+1);assert.equal(generated.state.generatedPieces,state.generatedPieces+1);
  assert.deepEqual(state,before);
  if(trait==='rush'){assert.equal(generated.piece.rushTurns,3);seenRushShapes.add(shapeId);seenRushCargos.add(cargo);}
  else {assert.equal(generated.piece.rushTurns,undefined);if(trait!=='normal'){seenSpecials.add(trait);assert.equal(pieceCellsV14(generated.piece).length,1);}}
 }
 assert.ok(seenRushShapes.size>=15);assert.ok([...seenRushShapes].some(id=>SHAPES.find(shape=>shape.id===id)!.cells.length===5));
 assert.deepEqual([...seenRushCargos].sort(),CARGO.map(cargo=>cargo.id).sort());assert.deepEqual([...seenSpecials].sort(),['hazard','pallet','wildcard']);
});

test('refill samples against only waiting candidates and never ages their rush turns',()=>{
 const state=fixture('daily',5);state.candidates=[
  {id:'old',shapeId:'shape.i4_h',quarterTurns:0,cargo:'cargo.food',trait:'rush',rushTurns:3},
  {id:'waiting',shapeId:'shape.cross5',quarterTurns:0,cargo:'cargo.cold',trait:'rush',rushTurns:3},
 ];
 const before=structuredClone(state),expected=generatePieceV14({...state,candidates:[state.candidates[1]]}),actual=refillCandidateV14(state,0);
 assert.deepEqual(actual.candidates[0],expected.piece);assert.deepEqual(actual.rngState,expected.state.rngState);
 assert.deepEqual(actual.candidates[1],state.candidates[1]);assert.deepEqual(state,before);
 for(const slot of [-1,.5,3,Infinity,NaN])assert.throws(()=>refillCandidateV14(state,slot));
});
