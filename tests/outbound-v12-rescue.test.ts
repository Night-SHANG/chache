import test from 'node:test';
import assert from 'node:assert/strict';
import type {CargoId,RunState} from '../src/domain/types.ts';
import {orderStatusV6} from '../src/domain/v6/board.ts';
import {findLegalMovesV6} from '../src/domain/v6/engine.ts';
import {createRunV12,applyCommandV12,applyToolV12,findLegalMovesV12,findRescuePlanV12,previewPlacementV12,settlePhaseV12} from '../src/domain/v12/engine.ts';
import {createRunV13,applyCommandV13,findLegalMovesV13,findRescuePlanV13,settlePhaseV13} from '../src/domain/v13/engine.ts';
import type {OutboundToolRunV12,OutboundToolPieceV12,ToolChargesV12} from '../src/domain/v12/types.ts';
import {checksumV12} from '../src/domain/v12/replay.ts';

const F:CargoId='cargo.food',C:CargoId='cargo.chem',M:CargoId='cargo.machine';
function one(shapeId:string,cargo:CargoId=F):OutboundToolPieceV12 {return {id:'fixture',shapeId,cargo,quarterTurns:0};}
function checkerboard(tools:ToolChargesV12,first:CargoId=F):OutboundToolRunV12 {
 const run=createRunV12(17,'normal',tools);
 run.board=run.board.map((_,i)=>i===76?null:(Math.floor(i/9)+i%9)%2?first:M);return run;
}
function frozen<T>(value:T):T {if(value&&typeof value==='object'){Object.values(value).forEach(frozen);Object.freeze(value);}return value;}

// This is an exact constructed screenshot regression, not a claim of a naturally replayed position.
test('the screenshot obstruction keeps 31 legal new-rule moves and no shipment or forced termination',()=>{
 const run=createRunV12(17,'normal');
 const rows=['..RRR.R..','GRR.RRR..','GRRRR.R..','YYRRRRR..','YYYYYYYYY','.RRYYY...','GRRGGG.GG','G..GGGGGG','GGGG..GG.'];
 const cargo:Record<string,CargoId|null>={R:F,Y:C,G:M,'.':null};run.board=rows.flatMap(row=>[...row].map(cell=>cargo[cell]));
 run.candidates=[one('shape.single',M),{...one('shape.domino_v',M),id:'domino'},{...one('shape.l4_e',M),id:'mixed',cellCargos:[M,M,F,F]}];
 const legacy:RunState={...run,phase:'input',commands:[]};
 assert.equal(run.board.filter(cell=>cell===null).length,23);assert.equal(findLegalMovesV6(legacy).length,32);
 const moves=findLegalMovesV12(run);assert.equal(moves.length,31);assert.equal(settlePhaseV12(run).phase,'input');assert.deepEqual(findRescuePlanV12(run),[]);
 for(const move of moves){const preview=previewPlacementV12(run,move.pieceId,move.origin);assert.equal(preview.valid,true);assert.deepEqual(preview.shipments,[]);assert.ok(!preview.cells.includes(76));}
 const statuses=run.orders.map(order=>orderStatusV6(legacy,order));
 assert.deepEqual(statuses.map(status=>[status.count,status.reason]),[[19,'route-blocked'],[14,'route-blocked'],[0,'exit-unconnected']]);
 const result=applyCommandV12(frozen(run),{type:'place',pieceId:'fixture',origin:{x:0,y:0}});
 assert.equal(result.error,undefined);assert.equal(result.state.phase,'input');assert.equal(result.state.result,null);assert.equal(result.events.filter(event=>event.type==='shipment').length,0);
});

// A geometry-only missing-cell witness cannot find this: clearing one route blocker ships seven remote cells.
test('finite rescue simulates complete clear settlement instead of checking only erased footprints',()=>{
 const run=checkerboard({rotate:0,clear:1,wildcard:0},C);run.candidates=[one('shape.i4_v',C)];
 for(const cell of [4,13,22,31,40,49,58])run.board[cell]=F;
 const before=JSON.stringify(run);assert.deepEqual(findLegalMovesV12(run),[]);
 const plan=findRescuePlanV12(frozen(run));assert.deepEqual(plan,[{type:'clear',cells:[67]}]);assert.equal(JSON.stringify(run),before);
 const merelyDeleted={...run,board:run.board.map((cargo,index)=>index===67?null:cargo)};
 assert.deepEqual(findLegalMovesV12(merelyDeleted),[]);
 const rescue=settlePhaseV12(run);assert.equal(rescue.phase,'rescue');assert.equal(rescue.result,null);
 const result=applyToolV12(rescue,plan![0]);assert.equal(result.error,undefined);assert.equal(result.state.phase,'input');assert.ok(findLegalMovesV12(result.state).length>0);
 assert.equal(result.state.completedOrders,1);assert.equal(result.state.score,70);assert.deepEqual(result.events.filter(event=>event.type==='shipment').map(event=>event.cells),[[4,13,22,31,40,49,58]]);
 assert.deepEqual(result.state.rngState,run.rngState);assert.equal(result.state.generatedPieces,run.generatedPieces);assert.equal(result.state.commandIndex,1);
});

test('a true two-tool rescue can need both a two-cell clear and a candidate rotation',()=>{
 const run=checkerboard({rotate:1,clear:1,wildcard:0});run.board[0]=null;run.board[9]=null;run.candidates=[one('shape.i4_h',C)];
 assert.deepEqual(findLegalMovesV12(run),[]);
 assert.equal(findRescuePlanV12({...run,toolCharges:{rotate:1,clear:0,wildcard:0}}),null);
 assert.equal(findRescuePlanV12({...run,toolCharges:{rotate:0,clear:1,wildcard:0}}),null);
 const plan=findRescuePlanV12(frozen(run));assert.deepEqual(plan,[{type:'clear',cells:[18,27]},{type:'rotate',pieceId:'fixture',quarterTurns:1}]);
 let current=settlePhaseV12(run);assert.equal(current.phase,'rescue');
 for(const [index,command] of plan!.entries()){
  const result=applyCommandV12(current,command);assert.equal(result.error,undefined);current=result.state;
  assert.equal(current.phase,index===0?'rescue':'input');assert.equal(current.result,null);
 }
 assert.deepEqual(current.usedToolIds,['clear','rotate']);assert.deepEqual(current.toolCharges,{rotate:0,clear:0,wildcard:0});assert.equal(current.commandIndex,2);
 assert.ok(findLegalMovesV12(current).some(move=>move.origin.x===0&&move.origin.y===0));
});

test('a tool transition into rescue preserves its first witness, state checksum, and event order without saving the plan',()=>{
 const run=checkerboard({rotate:1,clear:1,wildcard:0});run.board[0]=null;run.board[9]=null;run.candidates=[one('shape.i4_h',C)];
 const result=applyCommandV12(frozen(run),{type:'rotate',pieceId:'fixture',quarterTurns:1});
 assert.equal(result.error,undefined);assert.equal(result.state.phase,'rescue');
 assert.deepEqual(result.events,[{type:'toolUsed',toolId:'rotate',pieceId:'fixture'},{type:'rescue',plan:[{type:'clear',cells:[18,27]}]}]);
 // Captured before the witness-sharing refactor from this complete, real command transition.
 assert.equal(checksumV12(result.state),'78042500');assert.equal(Object.prototype.hasOwnProperty.call(result.state,'rescuePlan'),false);
 const event=result.events[1];assert.equal(event.type,'rescue');if(event.type!=='rescue')return;
 const rescued=applyCommandV12(result.state,event.plan[0]);assert.equal(rescued.error,undefined);assert.equal(rescued.state.phase,'input');
 assert.equal(checksumV12(result.state),'78042500');
});

test('the finite search returns no plan when every carried one- or two-tool sequence leaves no placement',()=>{
 const run=checkerboard({rotate:1,clear:1,wildcard:0});run.candidates=[one('shape.p5')];
 assert.equal(findRescuePlanV12(frozen(run)),null);const settled=settlePhaseV12(run);
 assert.equal(settled.phase,'result');assert.equal(settled.result,'failed');assert.equal(settled.endReason,'blocked');
 // Neither phase settlement nor enumeration spends tools or changes any gameplay counters.
 assert.deepEqual(settled.toolCharges,run.toolCharges);assert.deepEqual(settled.usedToolIds,[]);assert.equal(settled.commandIndex,0);assert.deepEqual(settled.rngState,run.rngState);
 const endless={...createRunV13(17,'normal',run.toolCharges),board:[...run.board],candidates:run.candidates};
 assert.equal(findRescuePlanV13(endless),null);assert.equal(settlePhaseV13(endless).result,'failed');
});

test('clear plus chosen-color single conversion can rescue a full checkerboard with two distinct charges',()=>{
 const run=checkerboard({rotate:0,clear:1,wildcard:1});run.candidates=[one('shape.p5')];
 assert.equal(findRescuePlanV12({...run,toolCharges:{rotate:0,clear:1,wildcard:0}}),null);
 assert.equal(findRescuePlanV12({...run,toolCharges:{rotate:0,clear:0,wildcard:1}}),null);
 const plan=findRescuePlanV12(run);assert.ok(plan);assert.equal(plan.length,2);assert.deepEqual(plan.map(command=>command.type),['clear','wildcard']);
 let current=settlePhaseV12(run);for(const command of plan){const next=applyCommandV12(current,command);assert.equal(next.error,undefined);current=next.state;}
 assert.equal(current.phase,'input');assert.equal(current.candidates[0].shapeId,'shape.single');assert.equal(current.candidates[0].trait,undefined);assert.ok(findLegalMovesV12(current).length);
});

test('a clear shipment reaching thirty wins even if its empty line still cannot fit a cross-shaped candidate',()=>{
 const run=checkerboard({rotate:0,clear:1,wildcard:0},C);run.candidates=[one('shape.cross5')];run.completedOrders=29;run.shift=5;
 for(const cell of [4,13,22,31,40,49,58,67])run.board[cell]=F;
 const result=applyCommandV12(run,{type:'clear',cells:[0]});assert.equal(result.error,undefined);assert.deepEqual(findLegalMovesV12(result.state),[]);
 assert.equal(result.state.result,'won');assert.equal(result.state.endReason,'completed');assert.equal(result.state.completedOrders,30);assert.equal(result.state.score,80);
 assert.deepEqual(result.state.rngState,run.rngState);assert.deepEqual(result.state.candidates,run.candidates);
 const endless={...createRunV13(17,'normal',run.toolCharges),board:[...run.board],candidates:run.candidates,completedOrders:29,shift:5};
 const ongoing=applyCommandV13(endless,{type:'clear',cells:[0]});assert.equal(ongoing.state.completedOrders,30);assert.deepEqual(findLegalMovesV13(ongoing.state),[]);assert.equal(ongoing.state.result,'failed');
});

test('a rotated mixed square ships only its food cells and leaves the original-index chemical residual cells',()=>{
 const run=createRunV12(17,'normal',{rotate:1,clear:0,wildcard:0});run.candidates=[{...one('shape.square'),cellCargos:[F,F,C,C]}];run.board[22]=F;run.board[31]=F;
 const rotated=applyCommandV12(run,{type:'rotate',pieceId:'fixture',quarterTurns:1});assert.equal(rotated.error,undefined);
 const preview=previewPlacementV12(rotated.state,'fixture',{x:3,y:0});assert.deepEqual(preview.cells,[4,13,3,12]);
 const result=applyCommandV12(rotated.state,{type:'place',pieceId:'fixture',origin:{x:3,y:0}});assert.equal(result.error,undefined);
 const shipment=result.events.find(event=>event.type==='shipment');assert.ok(shipment&&shipment.type==='shipment');assert.deepEqual(shipment.cells,[4,13,22,31]);
 assert.ok(shipment.cargoPaths.every(path=>path.path.every(point=>![3,12].includes(point.y*9+point.x))));assert.equal(result.state.board[3],C);assert.equal(result.state.board[12],C);assert.equal(result.state.score,40);
});

test('chosen-color single cargo never acts as a hidden bridge between different colors',()=>{
 for(const cargo of [F,C,M]){
  const run=createRunV12(17,'normal',{rotate:0,clear:0,wildcard:1});run.candidates=[one('shape.p5')];for(const cell of [4,13,22])run.board[cell]=F;
  const changed=applyCommandV12(run,{type:'wildcard',pieceId:'fixture',cargo});assert.equal(changed.error,undefined);
  const result=applyCommandV12(changed.state,{type:'place',pieceId:'fixture',origin:{x:4,y:3}});assert.equal(result.error,undefined);
  assert.equal(result.state.completedOrders,cargo===F?1:0);assert.equal(result.state.board[31],cargo===F?null:cargo);assert.ok(result.state.cellTraits.every(trait=>trait===null));
 }
});
