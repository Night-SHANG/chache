import test from 'node:test';
import assert from 'node:assert/strict';
import {makeV11Fixture} from './helpers/v11-fixtures.ts';
import {createRunV14,applyCommandV14,settlePhaseV14,previewPlacementV14} from '../src/domain/v14/engine.ts';
import {findRescuePlanV14} from '../src/domain/v14/tools.ts';
import {findLegalMovesV14} from '../src/domain/v14/board.ts';
import type {InboundCommandV14,InboundRunV14} from '../src/domain/v14/types.ts';
function makeV14Fixture(patch:Partial<InboundRunV14>={}):InboundRunV14{return {...makeV11Fixture(),rulesetVersion:14,runConfigId:'run.inbound_v14',...patch};}
const place=(state:InboundRunV14,x:number,y:number)=>applyCommandV14(state,{type:'place',pieceId:state.candidates[0].id,origin:{x,y}});

test('rush expires only after three later successful placements, unaffected by invalid actions or previews',()=>{
 let state=makeV14Fixture({orders:[],toolCharges:{rotate:1,clear:0,wildcard:0}});state.candidates[0].trait='rush';state.candidates[0].rushTurns=3;
 state=place(state,0,0).state;assert.deepEqual(state.cellTraits[0],{kind:'rush',remaining:3,bornAtPlacement:1});
 for(const command of [{type:'place',pieceId:'missing',origin:{x:1,y:0}},{type:'clear',cells:[]},{type:'cancel'},{type:'pause'}] as InboundCommandV14[]){const result=applyCommandV14(state,command);assert.ok(result.error);assert.equal(result.state,state);}
 const preview=previewPlacementV14(state,state.candidates[2].id,{x:6,y:6});assert.ok(preview.valid);assert.equal(state.cellTraits[0]?.remaining,3);
 for(const remaining of [2,1,0]){state.candidates[0]={id:`test.${remaining}`,shapeId:'shape.single',quarterTurns:0,cargo:'cargo.machine'};const result=place(state,5,remaining+2);assert.equal(result.error,undefined);state=result.state;assert.equal(state.cellTraits[0]?.kind,remaining?'rush':'waste');if(remaining)assert.equal(state.cellTraits[0]?.remaining,remaining);}
});

test('two completed orders trigger one cleanup and only old waste is eligible',()=>{
 const state=makeV14Fixture({cleanup:{branch:'orders',progress:1}});
 for(const cell of [8,9,10])state.board[cell]='cargo.food';for(const cell of [0,6]){state.board[cell]='cargo.machine';state.cellTraits[cell]={kind:'waste'};}
 state.board[1]='cargo.machine';state.cellTraits[1]={kind:'rush',remaining:1,bornAtPlacement:0};
 const result=place(state,4,1);assert.equal(result.error,undefined);assert.equal(result.state.completedOrders,1);
 assert.deepEqual(result.state.cleanup,{branch:'orders',progress:0});assert.equal(result.state.board[0],null);assert.equal(result.state.cellTraits[6]?.kind,'waste');
 assert.equal(result.state.cellTraits[1]?.kind,'waste');assert.deepEqual(result.events.find(event=>event.type==='cleanup')?.cells,[0]);
});

test('six successful placements sweep once independent of piece cell count and new expired waste survives',()=>{
 const state=makeV14Fixture({cleanup:{branch:'placements',progress:5},orders:[],shift:4,completedOrders:18});
 state.candidates[0]={id:'large',shapeId:'shape.cross5',quarterTurns:0,cargo:'cargo.machine'};
 state.board[0]='cargo.food';state.cellTraits[0]={kind:'waste'};state.board[1]='cargo.food';state.cellTraits[1]={kind:'rush',remaining:1,bornAtPlacement:0};
 const result=place(state,2,2);assert.equal(result.error,undefined);assert.equal(result.state.successfulPlacements,1);
 assert.equal(result.state.cleanup!.progress,0);assert.equal(result.state.board[0],null);assert.equal(result.state.cellTraits[1]?.kind,'waste');
 assert.equal(result.events.filter(event=>event.type==='cleanup').length,1);
});

test('rush ships before ageing and hazard clearance precedes passive old-waste cleanup',()=>{
 const state=makeV14Fixture({cleanup:{branch:'orders',progress:1}});for(const cell of [8,9,10])state.board[cell]='cargo.food';
 state.cellTraits[8]={kind:'hazard'};state.cellTraits[9]={kind:'rush',remaining:1,bornAtPlacement:0};
 for(const cell of [1,15]){state.board[cell]='cargo.machine';state.cellTraits[cell]={kind:'waste'};}
 const result=place(state,4,1),shipment=result.events.find(event=>event.type==='shipment');assert.ok(shipment);
 assert.deepEqual(shipment.extraClearedCells,[1]);assert.deepEqual(result.events.find(event=>event.type==='cleanup')?.cells,[15]);
 assert.equal(result.state.cellTraits[9],null);assert.ok(!result.events.some(event=>event.type==='rushExpired'));
});

test('thirty-order completion takes precedence over blockage and overtime retains stage five and tool budget',()=>{
 const ready=makeV14Fixture({completedOrders:30,shift:5,toolCharges:{rotate:1,clear:0,wildcard:0}});ready.board.fill('cargo.machine');
 const won=settlePhaseV14(ready);assert.equal(won.result,'won');assert.equal(won.endReason,'completed');assert.equal(won.score,200);
 assert.equal(settlePhaseV14(won).score,won.score);
 won.board.fill(null);const overtime=applyCommandV14(won,{type:'continueOvertime'});assert.equal(overtime.error,undefined);
 assert.equal(overtime.state.shift,5);assert.equal(overtime.state.completedOrders,30);assert.equal(overtime.state.boardSize,7);assert.equal(overtime.state.candidates.length,3);
 assert.deepEqual(overtime.state.toolCharges,won.toolCharges);assert.equal(overtime.state.overtime,true);assert.equal(overtime.state.result,null);
 const retired=applyCommandV14(overtime.state,{type:'finish'});assert.equal(retired.state.result,'won');assert.equal(retired.state.endReason,'retired');assert.ok(applyCommandV14(retired.state,{type:'finish'}).error);
 assert.ok(applyCommandV14({...won,mode:'daily'},{type:'continueOvertime'}).error);
});

test('endless keeps stage five past thirty, supports rescue retirement and never opens upgrade decisions',()=>{
 const state=settlePhaseV14(makeV14Fixture({mode:'endless',completedOrders:60,shift:5}));assert.equal(state.phase,'input');assert.equal(state.result,null);assert.equal(state.shift,5);
 const ended=applyCommandV14({...state,phase:'rescue'},{type:'finish'});assert.equal(ended.state.result,'failed');assert.equal(ended.state.endReason,'retired');
 const pending=createRunV14({seed:1,mode:'standard'}),rejected=applyCommandV14(pending,{type:'finish'});assert.ok(rejected.error);assert.equal(rejected.state,pending);
 const failed=makeV14Fixture();failed.board.fill('cargo.machine');assert.equal(findRescuePlanV14(failed),null);assert.equal(findLegalMovesV14(failed).length,0);
 const terminal=settlePhaseV14(failed);assert.equal(terminal.result,'failed');assert.equal(terminal.endReason,'blocked');
});

test('one accepted shipment batch can finish above thirty with baseline route, overfill and chain scoring',()=>{
 const state=makeV14Fixture({completedOrders:29,shift:5});state.orders=[{id:'first',dockId:'dock.north',cargo:'cargo.food',amount:3,baseScore:100},{id:'second',dockId:'dock.east',cargo:'cargo.machine',amount:3,baseScore:100}];
 for(const cell of [8,9,10,11])state.board[cell]='cargo.food';for(const cell of [22,23,24])state.board[cell]='cargo.machine';
 const result=place(state,6,6),shipments=result.events.filter(event=>event.type==='shipment');assert.equal(shipments.length,2);
 for(const shipment of shipments){const order=state.orders.find(order=>order.id===shipment.orderId)!;assert.equal(shipment.score,Math.floor((order.baseScore+(shipment.units-order.amount)*12+(shipment.path.length-1)*5)*(100+(shipment.chain-1)*25)/100));}
 assert.equal(result.state.completedOrders,31);assert.equal(result.state.result,'won');assert.equal(result.state.score,shipments.reduce((sum,shipment)=>sum+shipment.score,0)+200);
 assert.deepEqual(result.state.pendingThresholds,[]);assert.deepEqual(result.state.claimedThresholds,[]);
});

test('new direct creation rejects invalid seed, guide and tool identities',()=>{
 for(const seed of [1.1,NaN,Infinity,Number.MAX_SAFE_INTEGER,4294967296,-2147483649])assert.throws(()=>createRunV14({seed,mode:'standard'}));
 for(const seed of [-2147483648,2147483647,4294967295,0])assert.equal(createRunV14({seed,mode:'standard'}).seed,seed);
 assert.throws(()=>createRunV14({seed:1,mode:'daily',guided:true}));
 assert.throws(()=>createRunV14({seed:1,mode:'standard',toolCharges:{rotate:1,clear:1,wildcard:1}}));
 assert.throws(()=>createRunV14({seed:1,mode:'daily',toolCharges:{rotate:1,clear:0,wildcard:0}}));
});
