import test from 'node:test';import assert from 'node:assert/strict';
import {makeV9Fixture} from './helpers/v9-fixtures.ts';
import {createRunV9,applyCommandV9} from '../src/domain/v9/engine.ts';
const place=(s:ReturnType<typeof makeV9Fixture>,x:number,y:number)=>applyCommandV9(s,{type:'place',pieceId:s.candidates[0].id,origin:{x,y}});
test('normal starts require a unique cleanup choice before generating three candidates',()=>{
 const s=createRunV9({seed:1,mode:'standard'});assert.equal(s.phase,'cleanup');assert.equal(s.cleanup,null);assert.equal(s.candidates.length,0);assert.equal(s.successfulPlacements,0);
 const n=applyCommandV9(s,{type:'chooseCleanup',branch:'orders'});assert.equal(n.state.candidates.length,3);assert.deepEqual(n.state.cleanup,{branch:'orders',progress:0});assert.ok(applyCommandV9(n.state,{type:'chooseCleanup',branch:'placements'}).error);
});
test('rush begins at three and only subsequent successful placements age it',()=>{
 let s=makeV9Fixture({orders:[]});s.candidates[0].trait='rush';s.candidates[0].rushTurns=3;
 s=place(s,0,0).state;assert.deepEqual(s.cellTraits[0],{kind:'rush',remaining:3,bornAtPlacement:1});
 for(const remaining of [2,1,0]){s.candidates[0]={id:`test${remaining}`,shapeId:'shape.single',quarterTurns:0,cargo:'cargo.machine'};s=place(s,6,remaining+2).state;assert.equal(s.cellTraits[0]?.kind,remaining?'rush':'waste');if(remaining)assert.equal(s.cellTraits[0]?.remaining,remaining);}
});
test('rush at one ships before ageing and waste does not join groups',()=>{
 const s=makeV9Fixture();for(const i of [8,9,10])s.board[i]='cargo.food';s.cellTraits[8]={kind:'rush',remaining:1,bornAtPlacement:0};
 const r=place(s,4,1);assert.equal(r.state.completedOrders,1);assert.equal(r.state.cellTraits[8],null);assert.ok(!r.events.some(e=>e.type==='rushExpired'));
});
test('four shipments with orders progress one consume two old waste cells and retain progress one',()=>{
 const s=makeV9Fixture({boardSize:8,shift:5,completedOrders:23,cleanup:{branch:'orders',progress:1}});
 const cargos=['cargo.food','cargo.machine','cargo.chem','cargo.electronic'] as const;const docks=['dock.north','dock.east','dock.south','dock.west'];
 s.orders=cargos.map((cargo,i)=>({id:`o${i}`,dockId:docks[i],cargo,amount:3,baseScore:100}));for(let r=0;r<4;r++)for(let x=1;x<=3;x++)s.board[(r+1)*8+x]=cargos[r];
 for(const i of [5,6,7]){s.board[i]='cargo.food';s.cellTraits[i]={kind:'waste'};}
 const result=place(s,7,7);assert.equal(result.events.filter(e=>e.type==='shipment').length,4);assert.equal(result.state.board[5],null);assert.equal(result.state.board[6],null);assert.notEqual(result.state.board[7],null);assert.equal(result.state.cleanup!.progress,1);assert.deepEqual(result.state.pendingThresholds,[24,26]);assert.equal(result.state.phase,'upgrade');
});
test('one five-cell placement triggers placements cleanup once and new expired waste survives',()=>{
 const s=makeV9Fixture({cleanup:{branch:'placements',progress:5},orders:[],shift:4});s.candidates[0]={id:'p',shapeId:'shape.cross5',quarterTurns:0,cargo:'cargo.machine'};s.board[0]='cargo.food';s.cellTraits[0]={kind:'waste'};s.board[1]='cargo.food';s.cellTraits[1]={kind:'rush',remaining:1,bornAtPlacement:0};
 const r=place(s,2,2);assert.equal(r.state.board[0],null);assert.equal(r.state.cellTraits[1]?.kind,'waste');assert.equal(r.state.cleanup!.progress,0);assert.equal(r.state.successfulPlacements,1);
});
test('empty cleanup triggers are consumed and clear paths wait for next placement',()=>{
 const s=makeV9Fixture({cleanup:{branch:'placements',progress:5},orders:[]});const r=place(s,6,6);assert.equal(r.state.cleanup!.progress,0);assert.ok(!r.events.some(e=>e.type==='cleanup'));
 const blocked=makeV9Fixture({cleanup:{branch:'placements',progress:5}});for(const i of [8,9,10,11])blocked.board[i]='cargo.food';blocked.board[3]='cargo.machine';blocked.cellTraits[3]={kind:'waste'};const first=place(blocked,6,6);assert.equal(first.state.completedOrders,0);assert.equal(first.state.board[3],null);const second=applyCommandV9(first.state,{type:'place',pieceId:first.state.candidates[2].id,origin:{x:6,y:5}});assert.equal(second.state.completedOrders,1);
});
test('hazard clears one adjacent waste and passive sweep picks a different old cell',()=>{
 const s=makeV9Fixture({cleanup:{branch:'orders',progress:1}});for(const i of [8,9,10])s.board[i]='cargo.food';s.cellTraits[8]={kind:'hazard'};for(const i of [1,15]){s.board[i]='cargo.machine';s.cellTraits[i]={kind:'waste'};}
 const r=place(s,4,1);const shipment=r.events.find(e=>e.type==='shipment');assert.ok(shipment&&shipment.type==='shipment');assert.deepEqual(shipment.extraClearedCells,[1]);const cleanup=r.events.find(e=>e.type==='cleanup');assert.ok(cleanup&&cleanup.type==='cleanup');assert.deepEqual(cleanup.cells,[15]);
});
