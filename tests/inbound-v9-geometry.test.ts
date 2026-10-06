import test from 'node:test';
import assert from 'node:assert/strict';
import { makeV9Fixture } from './helpers/v9-fixtures.ts';
import { toIndexV9,toPointV9,pieceCellsV9,expandBoardV9,openSideGateV9,docksV9,collectGroupsV9,findRouteV9,findLegalMovesV9,selectOrderGroupV9 } from '../src/domain/v9/board.ts';

test('expansion preserves coordinates and deadlines and moves edge gates consistently',()=>{
 const s=makeV9Fixture();s.board[48]='cargo.food';s.cellTraits[48]={kind:'rush',remaining:1,bornAtPlacement:0};
 const e=expandBoardV9(s);assert.equal(e.board.length,64);assert.equal(e.board.filter(c=>c===null).length-s.board.filter(c=>c===null).length,15);
 assert.equal(toIndexV9({x:6,y:6},8),54);assert.deepEqual(toPointV9(54,8),{x:6,y:6});assert.equal(e.board[54],'cargo.food');assert.deepEqual(e.cellTraits[54],s.cellTraits[48]);
 assert.deepEqual(docksV9(e).map(d=>d.entry),[{x:3,y:0},{x:7,y:3},{x:3,y:7},{x:0,y:3}]);assert.equal(s.board.length,49);
});
test('gate opening is one-cell non-scoring clearance in either upgrade order and can be blocked again',()=>{
 const s=makeV9Fixture({cleanup:{branch:'orders',progress:1},score:33,completedOrders:3});s.board[42]='cargo.food';s.board[43]='cargo.food';s.cellTraits[42]={kind:'waste'};
 for(const e of [expandBoardV9(openSideGateV9(s)),openSideGateV9(expandBoardV9(s))]){
  assert.equal(e.board[56],null);assert.equal(e.board[49],'cargo.food');assert.equal(e.score,33);assert.equal(e.completedOrders,3);assert.equal(e.cleanup!.progress,1);
  assert.ok(findLegalMovesV9(e).some(m=>m.origin.x===0&&m.origin.y===7));
 }
});
test('routes prefer original dock at equal distance and public gate when shorter',()=>{
 const s=makeV9Fixture();s.levels.side_gate=1;s.board[21]='cargo.food';
 const order={id:'o',dockId:'dock.west',cargo:'cargo.food' as const,amount:1,baseScore:100};
 // West entry is occupied, so the public gate is the only entry.
 assert.equal(findRouteV9(s,order,[21])?.gateId,'dock.side');
 s.board[21]=null;s.board[22]='cargo.food';const route=findRouteV9(s,order,[22]);assert.equal(route?.gateId,'dock.west');assert.deepEqual(route?.path[0],{x:0,y:3});
 s.board.fill(null);s.board[36]='cargo.food';const side=findRouteV9(s,{...order,dockId:'dock.north'},[36]);assert.equal(side?.gateId,'dock.side');assert.deepEqual(side?.path[0],{x:0,y:6});
});
test('waste is zero units, pallets two, wildcard one with per-order membership',()=>{
 const s=makeV9Fixture();s.board[8]='cargo.food';s.cellTraits[8]={kind:'pallet'};s.board[9]='cargo.machine';s.cellTraits[9]={kind:'wildcard'};s.board[10]='cargo.chem';s.board[15]='cargo.food';s.cellTraits[15]={kind:'waste'};
 assert.deepEqual(collectGroupsV9(s,'cargo.food').map(g=>[g.cells,g.units]),[[[8,9],3]]);
 assert.deepEqual(collectGroupsV9(s,'cargo.chem').map(g=>[g.cells,g.units]),[[[9,10],2]]);
 assert.equal(selectOrderGroupV9(s,{...s.orders[0],amount:3})?.group.units,3);
});
test('all orientations use normalized offsets and occupied pallets never provide route passage',()=>{
 assert.deepEqual(pieceCellsV9({id:'p',shapeId:'shape.i4_h',cargo:'cargo.food',quarterTurns:1}),[{x:0,y:0},{x:0,y:1},{x:0,y:2},{x:0,y:3}]);
 const s=makeV9Fixture();s.board.fill('cargo.machine');s.cellTraits.fill({kind:'pallet'});s.board[3]=null;s.cellTraits[3]=null;s.board[10]='cargo.food';s.cellTraits[10]=null;s.board[17]='cargo.food';s.cellTraits[17]=null;
 assert.equal(findRouteV9(s,s.orders[0],[17]),null);
});

test('true equal-length 7/8 routes both choose original west dock',()=>{
 for(const size of [7,8] as const){const s=makeV9Fixture({boardSize:size});s.levels.side_gate=1;const cells=size===7?[29,36]:[41];for(const cell of cells)s.board[cell]='cargo.food';
 const order={...s.orders[0],dockId:'dock.west'};const chosen=findRouteV9(s,order,cells)!;assert.equal(chosen.gateId,'dock.west');
 const forced=structuredClone(s);forced.board[size*3]='cargo.machine';const alternative=findRouteV9(forced,order,cells)!;assert.equal(alternative.gateId,'dock.side');assert.equal(chosen.path.length,alternative.path.length);
 }
});

test('pallet corridor blocks the only otherwise legal loading route',()=>{
 const s=makeV9Fixture();s.board.fill('cargo.machine');s.cellTraits.fill(null);s.board[3]=null;s.board[10]='cargo.machine';s.cellTraits[10]={kind:'pallet'};s.board[17]=null;s.board[24]='cargo.food';assert.equal(findRouteV9(s,s.orders[0],[24]),null);
 s.board[10]=null;s.cellTraits[10]=null;assert.ok(findRouteV9(s,s.orders[0],[24]));
});
