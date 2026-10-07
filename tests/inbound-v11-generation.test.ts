import test from 'node:test';
import assert from 'node:assert/strict';
import {createRandomState} from '../src/domain/random.ts';
import {makeV11Fixture} from './helpers/v11-fixtures.ts';
import {createRunV11,applyCommandV11,settlePhaseV11} from '../src/domain/v11/engine.ts';
import {generationDistributionV11,generatePieceV11,refreshOrdersV11,refillCandidateV11} from '../src/domain/v11/generation.ts';
import {findRouteV11} from '../src/domain/v11/board.ts';
import {RULES_V11_CONFIG} from '../src/domain/v11/content.ts';

// Mutations caught: stage-one/two minima 4; retained light-order reduction; sampled offers.
test('each stage samples its exact raw demand range, including restored early minimum three',()=>{
 const minima=[3,3,4,4,5],maxima=[4,5,5,6,7];
 assert.deepEqual(RULES_V11_CONFIG.orderMinByShift,minima);assert.deepEqual(RULES_V11_CONFIG.orderMaxByShift,maxima);
 for(const shift of [1,2,3,4,5] as const){
  const amounts=new Set<number>();
  for(let seed=1;seed<=100;seed++){
   const state=refreshOrdersV11(makeV11Fixture({shift,completedOrders:(shift-1)*6,orders:[],rngState:createRandomState(seed)}));
   assert.equal(state.orders.length,RULES_V11_CONFIG.docksByShift[shift-1]);
   for(const order of state.orders){assert.ok(order.amount>=minima[shift-1]&&order.amount<=maxima[shift-1]);amounts.add(order.amount);}
  }
  assert.deepEqual([...amounts].sort(),Array.from({length:maxima[shift-1]-minima[shift-1]+1},(_,i)=>minima[shift-1]+i));
 }
});

test('ordinary stages one and two keep six percent rush while guided stage one uses normal cargo',()=>{
 for(const guided of [false,true])for(const shift of [1,2,3,4,5] as const){
  const state=makeV11Fixture({guided,shift}),distribution=generationDistributionV11(state);
  assert.deepEqual(Object.values(distribution.traits),guided&&shift===1?[1,0,0,0,0]:shift<3?[.94,0,.06,0,0]:[.85,.05,.06,.03,.01]);
  const counts=new Map<string,number>();
  let stream=state;for(let draw=0;draw<300;draw++){const generated=generatePieceV11(stream);stream=generated.state;const trait=generated.piece.trait??'normal';counts.set(trait,(counts.get(trait)??0)+1);}
  if(guided&&shift===1)assert.deepEqual([...counts.keys()],['normal']);else assert.ok(counts.get('rush')!>0);
 }
});

test('milestone settlement consumes no offer randomness before or after a three-slot refill',()=>{
 for(const completedOrders of [4,8,12,16,20,24,26]){
  const shift=Math.min(5,Math.floor(completedOrders/6)+1) as 1|2|3|4|5;
  const state=refreshOrdersV11(makeV11Fixture({completedOrders,shift,orders:[]}));
  const before=JSON.stringify(state),settled=settlePhaseV11(state);
  assert.equal(settled.phase,'input');assert.deepEqual(settled.rngState,state.rngState);assert.equal(settled.generatedPieces,state.generatedPieces);
  assert.deepEqual(settled.candidates,state.candidates);assert.equal(JSON.stringify(state),before);
  const expected=generatePieceV11({...state,candidates:state.candidates.slice(1)}),replaced=refillCandidateV11(settled,0);
  assert.deepEqual(replaced.rngState,expected.state.rngState);assert.deepEqual(replaced.candidates[0],expected.piece);assert.equal(replaced.candidates.length,3);
 }
});

test('fixed rules ignore forged upgrade abilities in generation, geometry and shipment scoring',()=>{
 const state=makeV11Fixture({shift:3,completedOrders:12}),forged=structuredClone(state);
 Object.assign(forged.levels,{candidate_slots:2,warehouse_expand:1,side_gate:1,small_parcels:2,cargo_supply:2,light_orders:1,pallet_rate:2,order_bonus:3,overfill_bonus:3,chain_bonus:3});
 Object.assign(forged,{supplyCargo:'cargo.food'});
 assert.deepEqual(generationDistributionV11(forged),generationDistributionV11(state));
 const future=refreshOrdersV11({...state,orders:[]}),forgedFuture=refreshOrdersV11({...forged,orders:[]});
 assert.deepEqual(forgedFuture.orders,future.orders);assert.deepEqual(forgedFuture.rngState,future.rngState);
 for(const target of [state,forged]){target.board[3]='cargo.machine';for(const cell of [8,9,10,11])target.board[cell]='cargo.food';}
 assert.equal(findRouteV11(forged,forged.orders[0],[8,9,10,11]),null);
 for(const target of [state,forged])target.board[3]=null;
 const command={type:'place' as const,pieceId:state.candidates[2].id,origin:{x:6,y:6}},normal=applyCommandV11(state,command),altered=applyCommandV11(forged,command);
 assert.equal(normal.error,undefined);assert.equal(normal.state.completedOrders,13);assert.equal(altered.state.score,normal.state.score);
 assert.equal(altered.state.boardSize,7);assert.equal(altered.state.candidates.length,3);assert.deepEqual(altered.events,normal.events);
});

test('guided stage two requires cleanup without retrospective progress or a new candidate draw',()=>{
 const state=createRunV11({seed:17,mode:'standard',guided:true});
 assert.equal(state.phase,'input');assert.equal(state.cleanup,null);assert.equal(state.candidates.length,3);
 const secondStage=settlePhaseV11({...state,shift:2,completedOrders:6,successfulPlacements:10});assert.equal(secondStage.phase,'cleanup');
 assert.deepEqual(secondStage.rngState,state.rngState);
 const chosen=applyCommandV11(secondStage,{type:'chooseCleanup',branch:'placements'});
 assert.equal(chosen.error,undefined);assert.deepEqual(chosen.state.cleanup,{branch:'placements',progress:0});
 assert.equal(chosen.state.successfulPlacements,10);assert.deepEqual(chosen.state.candidates,state.candidates);assert.deepEqual(chosen.state.rngState,state.rngState);
 assert.equal(chosen.state.commandIndex,1);assert.ok(applyCommandV11(chosen.state,{type:'chooseCleanup',branch:'orders'}).error);
});
