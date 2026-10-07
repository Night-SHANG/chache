import test from 'node:test';
import assert from 'node:assert/strict';
import {applyPlayableCommand,createPlayableRun,type RunSpec} from '../src/domain/playable.ts';
import type {InboundRunV15} from '../src/domain/v15/types.ts';
import {makeV11Fixture} from './helpers/v11-fixtures.ts';

function create15(mode:'standard'|'daily'|'endless'='standard',guided=false):InboundRunV15 {
 return createPlayableRun({family:'inbound',rulesetVersion:15,mode,guided,seed:1,toolCharges:{rotate:0,clear:0,wildcard:0}} as RunSpec) as InboundRunV15;
}
function ready(completedOrders:number,mode:'standard'|'daily'='standard'):InboundRunV15 {
 // Begin with the production identity before supplying a small, explicit transition fixture.
 const identity=create15(mode);
 return {...makeV11Fixture(),rulesetVersion:identity.rulesetVersion,runConfigId:identity.runConfigId,mode,completedOrders,shift:completedOrders<24?4:5,
  orders:[{id:'order.food',dockId:'dock.north',cargo:'cargo.food',amount:4,baseScore:200},{id:'order.chem',dockId:'dock.east',cargo:'cargo.chem',amount:5,baseScore:200}]};
}
const place=(state:InboundRunV15,x=4,y=1)=>applyPlayableCommand(state,{type:'place',pieceId:state.candidates[0].id,origin:{x,y}});

test('new rules15 has an independent production identity',()=>{
 const run=create15();assert.equal(run.rulesetVersion,15);assert.equal(run.runConfigId,'run.inbound_v15');
});

test('the placement completing order24 generates rush under stage5 without changing the surviving tray or board cargo',()=>{
 for(const mode of ['standard','daily'] as const){
  const state=ready(23,mode);for(const cell of [8,9,10])state.board[cell]='cargo.food';
  state.candidates[1]={...state.candidates[1],shapeId:'shape.single',trait:'pallet'};
  state.board[40]='cargo.machine';state.cellTraits[40]={kind:'pallet'};
  const untouched=structuredClone(state),result=place(state);assert.equal(result.error,undefined);
  const next=result.state as InboundRunV15;
  assert.equal(next.completedOrders,24);assert.equal(next.shift,5);assert.equal(next.candidates[0].trait,'rush');assert.equal(next.candidates[0].rushTurns,3);
  assert.deepEqual(next.candidates.slice(1),state.candidates.slice(1));assert.equal(next.board[40],state.board[40]);assert.deepEqual(next.cellTraits[40],state.cellTraits[40]);
  assert.deepEqual(state,untouched);assert.deepEqual(place(structuredClone(state)).state,next);
 }
});

test('full chain settlement sets the stage before generating the replacement',()=>{
 const state=ready(22);state.orders[1]={id:'order.machine',dockId:'dock.east',cargo:'cargo.machine',amount:3,baseScore:200};
 for(const cell of [8,9,10])state.board[cell]='cargo.food';for(const cell of [22,23,24])state.board[cell]='cargo.machine';
 const result=place(state),next=result.state as InboundRunV15;
 assert.equal(result.error,undefined);assert.equal(result.events.filter(event=>event.type==='shipment').length,2);assert.equal(next.completedOrders,24);assert.equal(next.shift,5);assert.equal(next.candidates[0].trait,'rush');
});

test('order30 ends standard and daily immediately without unused candidate or order RNG draws',()=>{
 for(const mode of ['standard','daily'] as const){
  const state=ready(29,mode);for(const cell of [8,9,10])state.board[cell]='cargo.food';
  const result=place(state),next=result.state as InboundRunV15;assert.equal(result.error,undefined);
  assert.equal(next.result,'won');assert.equal(next.endReason,'completed');assert.equal(next.completedOrders,30);
  assert.deepEqual(next.rngState,state.rngState);assert.equal(next.nextId,state.nextId);assert.equal(next.generatedPieces,state.generatedPieces);
  assert.deepEqual(next.candidates,state.candidates.slice(1));assert.deepEqual(next.orders,[state.orders[1]]);
  assert.equal(next.commandIndex,state.commandIndex+1);assert.equal(result.events.filter(event=>event.type==='result').length,1);
 }
});

test('continuing overtime preserves old candidates and orders and fills the missing slots',()=>{
 const state=ready(29);for(const cell of [8,9,10])state.board[cell]='cargo.food';
 state.candidates[1]={...state.candidates[1],trait:'rush',rushTurns:3};
 const won=place(state).state as InboundRunV15;const result=applyPlayableCommand(won,{type:'continueOvertime'}),next=result.state as InboundRunV15;
 assert.equal(result.error,undefined);assert.equal(next.overtime,true);assert.equal(next.result,null);assert.equal(next.shift,5);assert.equal(next.candidates.length,3);
 assert.deepEqual(next.candidates.slice(0,2),won.candidates);assert.equal(next.generatedPieces,won.generatedPieces+1);assert.ok(next.orders.some(order=>JSON.stringify(order)===JSON.stringify(won.orders[0])));
 assert.deepEqual(won.candidates,state.candidates.slice(1));assert.ok(applyPlayableCommand({...won,mode:'daily'},{type:'continueOvertime'}).error);
});
