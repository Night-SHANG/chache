import test from 'node:test';
import assert from 'node:assert/strict';
import {DOCKS,SHAPES} from '../src/domain/rulesets/v1/content.ts';
import {makeV11Fixture} from './helpers/v11-fixtures.ts';
import {createRunV11} from '../src/domain/v11/engine.ts';
import {generationDistributionV11} from '../src/domain/v11/generation.ts';
import {applyCommandV14,createRunV14,previewPlacementV14,settlePhaseV14} from '../src/domain/v14/engine.ts';
import {docksV14,findLegalMovesV14,findRouteV14,pieceCellsV14,placementCellsV14,reservedEntryCellsV14} from '../src/domain/v14/board.ts';
import {generationDistributionV14,refreshOrdersV14} from '../src/domain/v14/generation.ts';
import {findRescuePlanV14} from '../src/domain/v14/tools.ts';
import type {InboundRunV14,PieceV14} from '../src/domain/v14/types.ts';

function fixture(patch:Partial<InboundRunV14>={}):InboundRunV14 {
 return {...makeV11Fixture(),rulesetVersion:14,runConfigId:'run.inbound_v14',...patch};
}
const expectedEntries=DOCKS.map(d=>d.entry.y*7+d.entry.x);

// Mutations caught: reserve only active doors; reserve the exterior; permit an overlapping shape.
test('rules14 starts with all four fixed dock entries reserved and otherwise preserves fresh rules11 starts',()=>{
 assert.deepEqual(expectedEntries,[3,27,45,21]);
 for(const mode of ['standard','daily','endless'] as const)for(const seed of [0,1,17,2147483647]){
  const state=createRunV14({seed,mode}),old=createRunV11({seed,mode});
  assert.deepEqual(state,{...old,rulesetVersion:14,runConfigId:'run.inbound_v14'});
  assert.deepEqual(reservedEntryCellsV14(state),expectedEntries);
  assert.equal(state.board.length-reservedEntryCellsV14(state).length,45);
  for(const cell of expectedEntries){assert.equal(state.board[cell],null);assert.equal(state.cellTraits[cell],null);}
 }
 for(const shift of [1,2,3,4,5] as const)assert.deepEqual(reservedEntryCellsV14(fixture({shift})),expectedEntries);
});

test('single cargo has exactly 45 legal landing cells and rejects each reserved entry without mutation',()=>{
 const state=fixture({candidates:[{id:'single',shapeId:'shape.single',cargo:'cargo.food',quarterTurns:0}]});
 const before=JSON.stringify(state),moves=findLegalMovesV14(state);
 assert.equal(moves.length,45);
 for(const cell of expectedEntries){
  const origin={x:cell%7,y:Math.floor(cell/7)},preview=previewPlacementV14(state,'single',origin),result=applyCommandV14(state,{type:'place',pieceId:'single',origin});
  assert.equal(preview.valid,false);assert.equal(preview.reason,'入口需留空');assert.deepEqual(preview.cells,[cell]);assert.deepEqual(preview.events,[]);
  assert.ok(result.error);assert.equal(result.state,state);assert.deepEqual(result.events,[]);
  assert.ok(!moves.some(move=>move.origin.x===origin.x&&move.origin.y===origin.y));
 }
 assert.equal(JSON.stringify(state),before);
});

test('every shape and rotation uses the same full-footprint reservation predicate for preview and moves',()=>{
 const reserved=new Set(expectedEntries);
 for(const shape of SHAPES)for(const quarterTurns of [0,1,2,3] as const){
  const piece:PieceV14={id:'shape-test',shapeId:shape.id,cargo:'cargo.food',quarterTurns},state=fixture({candidates:[piece]}),moves=findLegalMovesV14(state);
  for(let y=0;y<7;y++)for(let x=0;x<7;x++){
   const points=pieceCellsV14(piece).map(p=>({x:p.x+x,y:p.y+y})),valid=points.every(p=>p.x<7&&p.y<7&&!reserved.has(p.y*7+p.x));
   const checked=placementCellsV14(state,piece.id,{x,y}),preview=previewPlacementV14(state,piece.id,{x,y});
   assert.equal(!checked.reason,valid,`${shape.id}/${quarterTurns} at ${x},${y}`);
   assert.equal(preview.valid,valid);assert.equal(moves.some(move=>move.origin.x===x&&move.origin.y===y),valid);
   if(preview.valid)for(const cell of expectedEntries)assert.equal(preview.stateAfter!.board[cell],null);
  }
 }
});

test('the four empty reservations cannot prevent a full placeable warehouse from ending',()=>{
 const state=fixture({orders:[],candidates:[{id:'single',shapeId:'shape.single',cargo:'cargo.food',quarterTurns:0}]});
 state.board.fill('cargo.machine');for(const cell of expectedEntries)state.board[cell]=null;
 assert.equal(state.board.filter(cell=>cell!==null).length,45);
 assert.deepEqual(findLegalMovesV14(state),[]);assert.equal(findRescuePlanV14(state),null);
 const settled=settlePhaseV14(state);assert.equal(settled.result,'failed');assert.equal(settled.endReason,'blocked');
 for(const cell of expectedEntries)assert.equal(settled.board[cell],null);
});

test('reserved doors open only under the original stage order schedule and never replace an active BFS entry',()=>{
 for(const shift of [1,2,3,4,5] as const){
  const state=refreshOrdersV14(fixture({shift,completedOrders:(shift-1)*6,orders:[]}));
  assert.deepEqual(state.orders.map(order=>order.dockId),DOCKS.slice(0,[2,3,3,4,4][shift-1]).map(dock=>dock.id));
  assert.deepEqual(docksV14(state).map(d=>d.entry),DOCKS.map(d=>d.entry));
 }
 const state=fixture();state.board[2]='cargo.machine';state.board[4]='cargo.machine';state.board[10]='cargo.machine';
 for(const cell of [36,37,38,39])state.board[cell]='cargo.food';
 assert.equal(findRouteV14(state,state.orders[0],[36,37,38,39]),null);
 assert.equal(state.board[45],null);assert.equal(state.board[21],null);
});

test('opening a later door never silently erases cargo or awards a shipment for that entry',()=>{
 const state=fixture({completedOrders:5});state.orders=[{id:'stage-order',dockId:'dock.north',cargo:'cargo.food',amount:3,baseScore:100}];
 for(const cell of [8,9,10])state.board[cell]='cargo.food';
 // Deliberately inconsistent fixture protects against hidden entry cleanup at a stage boundary.
 state.board[45]='cargo.chem';state.cellTraits[45]={kind:'pallet'};
 const result=applyCommandV14(state,{type:'place',pieceId:state.candidates[2].id,origin:{x:6,y:6}});
 assert.equal(result.error,undefined);assert.equal(result.state.shift,2);assert.equal(result.state.completedOrders,6);
 assert.equal(result.state.board[45],'cargo.chem');assert.deepEqual(result.state.cellTraits[45],{kind:'pallet'});
 assert.equal(result.events.filter(event=>event.type==='shipment').length,1);
 for(const event of result.events)if('cells' in event)assert.ok(event.cells?.every(cell=>typeof cell!=='number'||cell!==45));
});

test('reservation leaves the frozen 49-cell generation denominator and six percent early rush unchanged',()=>{
 for(const occupancy of [0,3,15,30,45]){
  const state=fixture({candidates:[]});
  for(const cell of Array.from({length:49},(_,i)=>i).filter(cell=>!expectedEntries.includes(cell)).slice(0,occupancy))state.board[cell]='cargo.food';
  assert.deepEqual(generationDistributionV14(state),generationDistributionV11({...state,rulesetVersion:11,runConfigId:'run.inbound_v11'}));
  assert.deepEqual(generationDistributionV14(state).traits,{normal:.94,pallet:0,rush:.06,hazard:0,wildcard:0});
 }
});
