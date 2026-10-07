import test from 'node:test';
import assert from 'node:assert/strict';
import {CARGO,DOCKS,SHAPES} from '../src/domain/rulesets/v1/content.ts';
import {createRunV14,applyCommandV14,previewPlacementV14} from '../src/domain/v14/engine.ts';
import {findLegalMovesV14,pieceCellsV14,placementCellsV14,reservedEntryCellsV14} from '../src/domain/v14/board.ts';
import {checksumV14} from '../src/domain/v14/replay.ts';
import type {CargoId,InboundCommandV14,InboundRunV14,PieceV14} from '../src/domain/v14/types.ts';

function fixture(patch:Partial<InboundRunV14>={}):InboundRunV14 {
 const state=createRunV14({seed:17,mode:'standard'});
 return {...state,shift:5,completedOrders:24,phase:'input',cleanup:{branch:'placements',progress:0},
  orders:DOCKS.map((dock,i)=>({id:`order-test-${i}`,dockId:dock.id,cargo:CARGO[i].id,amount:7,baseScore:200})),
  candidates:[{id:'rush',shapeId:'shape.i4_h',quarterTurns:0,cargo:'cargo.food',trait:'rush',rushTurns:3},{id:'waiting',shapeId:'shape.domino_v',quarterTurns:0,cargo:'cargo.cold',trait:'rush',rushTurns:3},{id:'normal',shapeId:'shape.single',quarterTurns:0,cargo:'cargo.chem'}],...patch};
}
function place(state:InboundRunV14,pieceId:string,x:number,y:number){return applyCommandV14(state,{type:'place',pieceId,origin:{x,y}});}
function stepAway(state:InboundRunV14,x:number,cargo:CargoId='cargo.machine'){
 const next=structuredClone(state);next.candidates[0]={id:`step-${x}`,shapeId:'shape.single',quarterTurns:0,cargo};
 return place(next,next.candidates[0].id,x,6);
}

// Mutation caught: keeping the old trait-single-only predicate or independent cargo/clock per shape cell.
test('every ordinary shape with every cargo places as one same-color rush piece and expires after three later placements',()=>{
 for(const shape of SHAPES)for(const cargo of CARGO){
  const state=fixture();state.candidates[0]={id:'rush',shapeId:shape.id,quarterTurns:0,cargo:cargo.id,trait:'rush',rushTurns:3};
  const before=structuredClone(state),expected=pieceCellsV14(state.candidates[0]).map(cell=>(cell.y+2)*7+cell.x+2),placed=place(state,'rush',2,2);
  assert.equal(placed.error,undefined,`${shape.id}/${cargo.id}`);assert.deepEqual(placed.events[0],{type:'placed',pieceId:'rush',cells:expected});
  for(const cell of expected){assert.equal(placed.state.board[cell],cargo.id);assert.deepEqual(placed.state.cellTraits[cell],{kind:'rush',remaining:3,bornAtPlacement:1});}
  assert.ok(!placed.events.some(event=>event.type==='rushTick'||event.type==='rushExpired'));assert.deepEqual(state,before);
  let next=placed.state;
  for(let turn=0;turn<3;turn++){
   const result=stepAway(next,turn,cargo.id==='cargo.machine'?'cargo.chem':'cargo.machine');assert.equal(result.error,undefined);next=result.state;
   for(const cell of expected)assert.deepEqual(next.cellTraits[cell],turn===2?{kind:'waste'}:{kind:'rush',remaining:2-turn,bornAtPlacement:1});
   if(turn===2)assert.deepEqual(result.events.find(event=>event.type==='rushExpired'),{type:'rushExpired',cells:expected.slice().sort((a,b)=>a-b)});
   else assert.deepEqual(result.events.find(event=>event.type==='rushTick'),{type:'rushTick',cells:expected.slice().sort((a,b)=>a-b).map(cell=>({cell,remaining:2-turn}))});
   assert.deepEqual(next.candidates[1],state.candidates[1]);
  }
 }
});

// Mutation caught: clearing a fragment restarting its siblings, or ageing before wildcard shipment resolution.
test('clearing the middle then shipping one rush fragment through a wildcard leaves the other fragment on its original deadline',()=>{
 const state=fixture({toolCharges:{rotate:0,clear:1,wildcard:0}});state.orders[0].amount=5;
 state.candidates[1]={id:'bridge',shapeId:'shape.single',quarterTurns:0,cargo:'cargo.machine',trait:'wildcard'};
 for(const cell of [19,20,26])state.board[cell]='cargo.food';
 const placed=place(state,'rush',1,1);assert.equal(placed.error,undefined);assert.equal(placed.state.completedOrders,24);
 const split=applyCommandV14(placed.state,{type:'clear',cells:[9,10]});assert.equal(split.error,undefined);
 assert.equal(split.state.successfulPlacements,1);assert.equal(split.state.score,0);assert.deepEqual(split.state.cellTraits[8],{kind:'rush',remaining:3,bornAtPlacement:1});assert.deepEqual(split.state.cellTraits[11],split.state.cellTraits[8]);
 const shipped=place(split.state,'bridge',4,2);assert.equal(shipped.error,undefined);
 const shipment=shipped.events.find(event=>event.type==='shipment');assert.ok(shipment);assert.equal(shipment.cargo,'cargo.food');assert.equal(shipment.units,5);assert.deepEqual(shipment.cells,[11,18,19,20,26]);
 assert.equal(shipped.state.cellTraits[11],null);assert.equal(shipped.state.board[11],null);
 assert.deepEqual(shipped.state.cellTraits[8],{kind:'rush',remaining:2,bornAtPlacement:1});
 assert.deepEqual(shipped.events.find(event=>event.type==='rushTick'),{type:'rushTick',cells:[{cell:8,remaining:2}]});
 const penultimate=stepAway(shipped.state,0);assert.equal(penultimate.error,undefined);assert.deepEqual(penultimate.state.cellTraits[8],{kind:'rush',remaining:1,bornAtPlacement:1});
 const expired=stepAway(penultimate.state,1);assert.equal(expired.error,undefined);assert.deepEqual(expired.state.cellTraits[8],{kind:'waste'});assert.equal(expired.state.board[8],'cargo.food');
 assert.deepEqual(expired.events.find(event=>event.type==='rushExpired'),{type:'rushExpired',cells:[8]});
 for(const cell of [9,10,11])assert.equal(expired.state.cellTraits[cell],null);
});

test('disconnected same-piece survivors expire together and placement cleanup removes only old waste',()=>{
 const state=fixture({toolCharges:{rotate:0,clear:1,wildcard:0}});
 state.board[0]='cargo.chem';state.cellTraits[0]={kind:'waste'};
 const placed=place(state,'rush',1,1);assert.equal(placed.error,undefined);
 const split=applyCommandV14(placed.state,{type:'clear',cells:[9,10]});assert.equal(split.error,undefined);
 let next=split.state;
 for(const x of [0,1]){const result=stepAway(next,x);assert.equal(result.error,undefined);next=result.state;}
 next.cleanup={branch:'placements',progress:5};
 const expired=stepAway(next,2);assert.equal(expired.error,undefined);assert.equal(expired.state.board[0],null);
 assert.deepEqual(expired.events.find(event=>event.type==='cleanup')?.cells,[0]);assert.deepEqual(expired.events.find(event=>event.type==='rushExpired'),{type:'rushExpired',cells:[8,11]});
 for(const cell of [8,11])assert.deepEqual(expired.state.cellTraits[cell],{kind:'waste'});
});

test('all multi-cell rush rotations obey the complete footprint, four reserved entries and occupied bounds',()=>{
 for(const shape of SHAPES)for(const quarterTurns of [0,1,2,3] as const){
  const piece:PieceV14={id:'rush',shapeId:shape.id,quarterTurns,cargo:'cargo.food',trait:'rush',rushTurns:3},state=fixture({candidates:[piece]});state.board[24]='cargo.machine';
  const reserved=new Set(reservedEntryCellsV14(state)),moves=findLegalMovesV14(state),before=checksumV14(state);
  for(let y=-1;y<=7;y++)for(let x=-1;x<=7;x++){
   const points=pieceCellsV14(piece).map(cell=>({x:cell.x+x,y:cell.y+y})),valid=points.every(cell=>cell.x>=0&&cell.x<7&&cell.y>=0&&cell.y<7&&!reserved.has(cell.y*7+cell.x)&&cell.y*7+cell.x!==24);
   const checked=placementCellsV14(state,piece.id,{x,y});assert.equal(!checked.reason,valid,`${shape.id}/${quarterTurns}/${x},${y}`);
   assert.equal(moves.some(move=>move.origin.x===x&&move.origin.y===y),valid);
  }
  assert.equal(checksumV14(state),before);
 }
});

test('pallet hazard and wildcard remain single-cell while rush is the only multi-cell special trait',()=>{
 for(const trait of ['pallet','hazard','wildcard'] as const){
  const state=fixture();state.candidates[0]={id:'invalid-special',shapeId:'shape.domino_h',quarterTurns:0,cargo:'cargo.food',trait};
  const result=place(state,'invalid-special',1,1);assert.ok(result.error);assert.equal(result.state,state);assert.deepEqual(result.events,[]);
 }
});

test('invalid, pause, preview and no-op commands cannot spend a rush placement or mutate waiting candidates',()=>{
 const state=fixture({toolCharges:{rotate:1,clear:1,wildcard:0}});state.candidates[0].shapeId='shape.square';
 const placed=place(state,'rush',1,1);assert.equal(placed.error,undefined);
 placed.state.candidates[0]={id:'square',shapeId:'shape.square',quarterTurns:0,cargo:'cargo.chem',trait:'rush',rushTurns:3};
 const next=placed.state,before=structuredClone(next),commands:InboundCommandV14[]=[
  {type:'place',pieceId:'missing',origin:{x:0,y:0}},
  {type:'place',pieceId:'square',origin:{x:2,y:0}},
  {type:'place',pieceId:'square',origin:{x:1,y:1}},
  {type:'place',pieceId:'square',origin:{x:6,y:6}},
  {type:'place',pieceId:'square',origin:{x:.5,y:1}},
  {type:'rotate',pieceId:'square',quarterTurns:1},
  {type:'clear',cells:[]},{type:'clear',cells:[0]},
  ...([{type:'pause'},{type:'cancel'}] as unknown as InboundCommandV14[]),
 ];
 for(const command of commands){const rejected=applyCommandV14(next,command);assert.ok(rejected.error);assert.equal(rejected.state,next);assert.deepEqual(rejected.events,[]);}
 const preview=previewPlacementV14(next,'square',{x:4,y:4});assert.equal(preview.valid,true);assert.equal(preview.stateAfter!.successfulPlacements,next.successfulPlacements+1);
 assert.deepEqual(next,before);assert.equal(checksumV14(structuredClone(next)),checksumV14(next));
});

test('rotation and wildcard tools preserve board clocks and never age waiting rush pieces',()=>{
 const state=fixture({toolCharges:{rotate:1,clear:0,wildcard:1}}),placed=place(state,'rush',1,1);assert.equal(placed.error,undefined);
 const rotated=applyCommandV14(placed.state,{type:'rotate',pieceId:'waiting',quarterTurns:1});assert.equal(rotated.error,undefined);
 assert.equal(rotated.state.candidates[1].quarterTurns,1);assert.equal(rotated.state.candidates[1].rushTurns,3);assert.deepEqual(rotated.state.cellTraits,placed.state.cellTraits);
 assert.equal(rotated.state.successfulPlacements,1);assert.deepEqual(rotated.state.rngState,placed.state.rngState);
 const converted=applyCommandV14(rotated.state,{type:'wildcard',pieceId:'waiting'});assert.equal(converted.error,undefined);
 assert.deepEqual(converted.state.candidates[1],{id:'waiting',shapeId:'shape.single',quarterTurns:0,cargo:'cargo.cold',trait:'wildcard'});
 assert.deepEqual(converted.state.cellTraits,placed.state.cellTraits);assert.equal(converted.state.successfulPlacements,1);
 assert.deepEqual(converted.state.rngState,placed.state.rngState);assert.deepEqual(converted.state.usedToolIds,['rotate','wildcard']);
});

test('partial clears on every multi-cell shape and actual cargo retain every surviving cell deadline',()=>{
 for(const shape of SHAPES.filter(shape=>shape.cells.length>1))for(const cargo of CARGO){
  const state=fixture({toolCharges:{rotate:0,clear:1,wildcard:0}});state.candidates[0]={id:'rush',shapeId:shape.id,quarterTurns:0,cargo:cargo.id,trait:'rush',rushTurns:3};
  const placed=place(state,'rush',2,2);assert.equal(placed.error,undefined);
  const cells=pieceCellsV14(state.candidates[0]).map(cell=>(cell.y+2)*7+cell.x+2),otherCargo=cargo.id==='cargo.machine'?'cargo.chem':'cargo.machine';
  const ticked=stepAway(placed.state,0,otherCargo);assert.equal(ticked.error,undefined);
  const cleared=applyCommandV14(ticked.state,{type:'clear',cells:[cells[0]]});assert.equal(cleared.error,undefined);
  assert.equal(cleared.state.successfulPlacements,2);assert.equal(cleared.state.board[cells[0]],null);assert.equal(cleared.state.cellTraits[cells[0]],null);
  for(const cell of cells.slice(1)){assert.equal(cleared.state.board[cell],cargo.id);assert.deepEqual(cleared.state.cellTraits[cell],{kind:'rush',remaining:2,bornAtPlacement:1});}
  let next=cleared.state;
  for(const x of [1,2]){const result=stepAway(next,x,otherCargo);assert.equal(result.error,undefined);next=result.state;}
  for(const cell of cells.slice(1)){assert.equal(next.board[cell],cargo.id);assert.deepEqual(next.cellTraits[cell],{kind:'waste'});}
  assert.equal(next.board[cells[0]],null);
 }
});

test('separately placed rush pieces keep their own born-placement deadlines',()=>{
 const state=fixture();state.candidates[0].shapeId='shape.l3_ne';
 const first=place(state,'rush',1,1);assert.equal(first.error,undefined);
 const second=place(first.state,'waiting',4,1);assert.equal(second.error,undefined);
 for(const cell of [8,9,15])assert.deepEqual(second.state.cellTraits[cell],{kind:'rush',remaining:2,bornAtPlacement:1});
 for(const cell of [11,18])assert.deepEqual(second.state.cellTraits[cell],{kind:'rush',remaining:3,bornAtPlacement:2});
 const third=stepAway(second.state,0);assert.equal(third.error,undefined);
 const fourth=stepAway(third.state,1);assert.equal(fourth.error,undefined);
 assert.deepEqual(fourth.events.find(event=>event.type==='rushExpired'),{type:'rushExpired',cells:[8,9,15]});
 for(const cell of [11,18])assert.deepEqual(fourth.state.cellTraits[cell],{kind:'rush',remaining:1,bornAtPlacement:2});
 const fifth=stepAway(fourth.state,2);assert.equal(fifth.error,undefined);assert.deepEqual(fifth.events.find(event=>event.type==='rushExpired'),{type:'rushExpired',cells:[11,18]});
});
