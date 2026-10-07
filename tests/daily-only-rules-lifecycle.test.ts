import test from 'node:test';
import assert from 'node:assert/strict';
import {CARGO,DOCKS,SHAPES} from '../src/domain/rulesets/v1/content.ts';
import {createRunV16,applyCommandV16,settlePhaseV16,previewPlacementV16} from '../src/domain/v16/engine.ts';
import {findLegalMovesV16,reservedEntryCellsV16,pieceCellsV16,placementCellsV16} from '../src/domain/v16/board.ts';
import {findRescuePlanV16} from '../src/domain/v16/tools.ts';
import {generationDistributionV16} from '../src/domain/v16/generation.ts';
import type {InboundRunV16,PieceV16} from '../src/domain/v16/types.ts';

/** Explicit boundary fixture, not a claimed naturally played run. */
function boundary(completedOrders:number,mode:InboundRunV16['mode']='standard'):InboundRunV16 {
 let state=createRunV16({seed:17,mode});if(mode==='daily')state=applyCommandV16(state,{type:'chooseCleanup',branch:'placements'}).state;
 return {...state,completedOrders,shift:Math.min(5,Math.floor(completedOrders/6)+1) as InboundRunV16['shift'],
  candidates:[{id:'test.food',shapeId:'shape.single',cargo:'cargo.food',quarterTurns:0},{id:'test.pallet',shapeId:'shape.single',cargo:'cargo.machine',quarterTurns:0,trait:'pallet'},{id:'test.chem',shapeId:'shape.domino_h',cargo:'cargo.chem',quarterTurns:0}],
  orders:[{id:'test.order.food',dockId:'dock.north',cargo:'cargo.food',amount:4,baseScore:200},{id:'test.order.chem',dockId:'dock.east',cargo:'cargo.chem',amount:5,baseScore:200}]};
}
const place=(state:InboundRunV16,pieceId=state.candidates[0].id,x=4,y=1)=>applyCommandV16(state,{type:'place',pieceId,origin:{x,y}});

test('ordinary and endless placement and stage transitions never enter cleanup',()=>{
 for(const mode of ['standard','endless'] as const)for(const completed of [0,5,11,17,23,29]){
  const state=boundary(completed,mode);for(const cell of [8,9,10])state.board[cell]='cargo.food';
  const next=place(state);assert.equal(next.error,undefined);assert.equal(next.state.completedOrders,completed+1);assert.equal(next.state.cleanup,null);
  assert.equal(next.state.phase,mode==='standard'&&completed===29?'result':'input');assert.ok(next.state.candidates.every(piece=>piece.trait!=='rush'));
 }
 for(const mode of ['standard','endless'] as const){const state={...createRunV16({seed:17,mode}),phase:'cleanup' as const};assert.ok(applyCommandV16(state,{type:'chooseCleanup',branch:'orders'}).error);}
});

test('daily stage five affects only replacement cargo after the complete shipment chain',()=>{
 const state=boundary(22,'daily');state.orders[1]={id:'test.order.machine',dockId:'dock.east',cargo:'cargo.machine',amount:3,baseScore:200};
 for(const cell of [8,9,10])state.board[cell]='cargo.food';for(const cell of [22,23,24])state.board[cell]='cargo.machine';
 state.board[40]='cargo.chem';state.cellTraits[40]={kind:'pallet'};
 const before=structuredClone(state),result=place(state);assert.equal(result.error,undefined);assert.equal(result.state.completedOrders,24);assert.equal(result.state.shift,5);
 assert.equal(result.events.filter(event=>event.type==='shipment').length,2);assert.equal(result.state.candidates[0].trait,'rush');assert.equal(result.state.candidates[0].rushTurns,3);
 assert.deepEqual(result.state.candidates.slice(1),state.candidates.slice(1));assert.equal(result.state.board[40],'cargo.chem');assert.deepEqual(result.state.cellTraits[40],{kind:'pallet'});assert.deepEqual(state,before);
});

test('order30 completion takes priority with no order or candidate draw; standard overtime stays rush-free',()=>{
 for(const mode of ['standard','daily'] as const){
  const state=boundary(29,mode);for(const cell of [8,9,10])state.board[cell]='cargo.food';
  const won=place(state);assert.equal(won.error,undefined);assert.equal(won.state.phase,'result');assert.equal(won.state.result,'won');assert.equal(won.state.endReason,'completed');
  assert.deepEqual(won.state.rngState,state.rngState);assert.equal(won.state.nextId,state.nextId);assert.equal(won.state.generatedPieces,state.generatedPieces);assert.deepEqual(won.state.candidates,state.candidates.slice(1));assert.deepEqual(won.state.orders,[state.orders[1]]);
  assert.equal(won.events.filter(event=>event.type==='result').length,1);
  const continued=applyCommandV16(won.state,{type:'continueOvertime'});
  if(mode==='daily')assert.ok(continued.error);
  else{assert.equal(continued.error,undefined);assert.equal(continued.state.phase,'input');assert.equal(continued.state.cleanup,null);assert.equal(continued.state.overtime,true);assert.equal(continued.state.candidates.length,3);assert.equal(continued.state.orders.length,4);assert.ok(continued.state.candidates.every(piece=>piece.trait!=='rush'));assert.equal(generationDistributionV16(continued.state).traits.rush,0);assert.deepEqual(continued.state.candidates.slice(0,2),won.state.candidates);}
 }
 const blocked=boundary(30);blocked.board.fill('cargo.machine');for(const cell of reservedEntryCellsV16(blocked))blocked.board[cell]=null;
 assert.equal(settlePhaseV16(blocked).result,'won');
});

test('daily multi-cell rush ages on successful placements, not waiting, preview or invalid commands',()=>{
 for(const shape of SHAPES){
  const state=boundary(24,'daily');state.orders=DOCKS.map((dock,i)=>({id:`test.order.${i}`,dockId:dock.id,cargo:CARGO[i].id,amount:7,baseScore:200}));
  state.candidates[0]={id:'test.rush',shapeId:shape.id,cargo:'cargo.cold',quarterTurns:0,trait:'rush',rushTurns:3};
  state.candidates[1]={id:'test.waiting',shapeId:'shape.domino_v',cargo:'cargo.cold',quarterTurns:0,trait:'rush',rushTurns:3};
  const cells=pieceCellsV16(state.candidates[0]).map(cell=>(cell.y+2)*7+cell.x+2),placed=place(state,'test.rush',2,2);assert.equal(placed.error,undefined,shape.id);
  let next=placed.state;for(const cell of cells)assert.deepEqual(next.cellTraits[cell],{kind:'rush',remaining:3,bornAtPlacement:1});
  for(let index=0;index<3;index++){
   next.candidates[0]={id:`test.step.${index}`,shapeId:'shape.single',cargo:'cargo.machine',quarterTurns:0};
   const before=structuredClone(next),preview=previewPlacementV16(next,next.candidates[0].id,{x:index,y:6});assert.equal(preview.valid,true);assert.deepEqual(next,before);
   const rejected=place(next,'missing',index,6);assert.ok(rejected.error);assert.equal(rejected.state,next);
   const result=place(next,next.candidates[0].id,index,6);assert.equal(result.error,undefined);next=result.state;
   for(const cell of cells)assert.deepEqual(next.cellTraits[cell],index===2?{kind:'waste'}:{kind:'rush',remaining:2-index,bornAtPlacement:1});
   assert.deepEqual(next.candidates[1],state.candidates[1]);
  }
 }
});

test('daily cleanup clears old waste on 2 orders or 6 placements before newly expired fragments',()=>{
 for(const branch of ['orders','placements'] as const){
  // Explicit fragment-clock fixture exercises settlement without inventing a daily tool command.
  const state=boundary(24,'daily');state.cleanup={branch,progress:branch==='orders'?1:5};state.successfulPlacements=3;
  state.board[0]='cargo.chem';state.cellTraits[0]={kind:'waste'};
  for(const cell of [36,38]){state.board[cell]='cargo.cold';state.cellTraits[cell]={kind:'rush',remaining:1,bornAtPlacement:1};}
  for(const cell of [8,9,10])state.board[cell]='cargo.food';
  const result=place(state);assert.equal(result.error,undefined);assert.equal(result.state.board[0],null);assert.equal(result.state.cleanup!.progress,0);
  assert.deepEqual(result.events.find(event=>event.type==='cleanup')?.cells,[0]);assert.deepEqual(result.events.find(event=>event.type==='rushExpired'),{type:'rushExpired',cells:[36,38]});
  for(const cell of [36,38])assert.deepEqual(result.state.cellTraits[cell],{kind:'waste'});
 }
});

test('all four entries remain forbidden for every shape and rotation in all three modes',()=>{
 for(const mode of ['standard','daily','endless'] as const)for(const shape of SHAPES)for(const quarterTurns of [0,1,2,3] as const){
  const state=boundary(24,mode),piece:PieceV16={id:'test.shape',shapeId:shape.id,cargo:'cargo.food',quarterTurns,...(mode==='daily'?{trait:'rush' as const,rushTurns:3}:{})};state.candidates=[piece];
  const reserved=new Set(reservedEntryCellsV16(state)),moves=findLegalMovesV16(state);assert.equal(reserved.size,4);
  for(let y=0;y<7;y++)for(let x=0;x<7;x++){
   const points=pieceCellsV16(piece).map(cell=>({x:cell.x+x,y:cell.y+y})),valid=points.every(cell=>cell.x<7&&cell.y<7&&!reserved.has(cell.y*7+cell.x));
   assert.equal(!placementCellsV16(state,piece.id,{x,y}).reason,valid);assert.equal(moves.some(move=>move.origin.x===x&&move.origin.y===y),valid);
  }
 }
});

test('ordinary tools preserve placement and RNG timing; rescue uses a legal clear witness',()=>{
 for(const mode of ['standard','endless'] as const){
  const state=boundary(12,mode);state.toolCharges={rotate:1,clear:0,wildcard:1};
  const rotated=applyCommandV16(state,{type:'rotate',pieceId:'test.chem',quarterTurns:1});assert.equal(rotated.error,undefined);assert.equal(rotated.state.phase,'input');assert.equal(rotated.state.successfulPlacements,0);assert.deepEqual(rotated.state.rngState,state.rngState);
  const converted=applyCommandV16(rotated.state,{type:'wildcard',pieceId:'test.chem'});assert.equal(converted.error,undefined);assert.equal(converted.state.candidates[2].trait,'wildcard');assert.equal(converted.state.successfulPlacements,0);assert.deepEqual(converted.state.rngState,state.rngState);
  const blocked=boundary(12,mode);blocked.board.fill('cargo.machine');for(const cell of reservedEntryCellsV16(blocked))blocked.board[cell]=null;blocked.toolCharges={rotate:0,clear:1,wildcard:0};
  const rescue=settlePhaseV16(blocked);assert.equal(rescue.phase,'rescue');const plan=findRescuePlanV16(rescue);assert.ok(plan?.length);let next=rescue;
  for(const command of plan){const result=applyCommandV16(next,command);assert.equal(result.error,undefined);next=result.state;}
  assert.equal(next.phase,'input');assert.ok(findLegalMovesV16(next).length);assert.equal(next.successfulPlacements,0);assert.deepEqual(next.rngState,blocked.rngState);assert.equal(next.cleanup,null);
 }
 const daily=boundary(12,'daily');assert.ok(applyCommandV16(daily,{type:'clear',cells:[0]}).error);assert.equal(findRescuePlanV16(daily),null);
});
