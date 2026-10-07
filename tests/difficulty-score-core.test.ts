import test from 'node:test';
import assert from 'node:assert/strict';
import type {CargoId,OutboundDifficulty} from '../src/domain/types.ts';
import {applyCommandV12,createRunV12,findRescuePlanV12,previewPlacementV12,settlePhaseV12} from '../src/domain/v12/engine.ts';
import {applyCommandV13,createRunV13,findRescuePlanV13,previewPlacementV13,settlePhaseV13} from '../src/domain/v13/engine.ts';
import type {OutboundToolCommandV12,OutboundToolRunV12,ToolChargesV12} from '../src/domain/v12/types.ts';
import type {OutboundToolCommandV13,OutboundToolRunV13} from '../src/domain/v13/types.ts';

const F:CargoId='cargo.food';
type State=OutboundToolRunV12|OutboundToolRunV13;
const noTools:ToolChargesV12={rotate:0,clear:0,wildcard:0};
function create(version:12|13,difficulty:OutboundDifficulty,tools:ToolChargesV12=noTools):State {
 return version===12?createRunV12(17,difficulty,tools):createRunV13(17,difficulty,tools);
}
function apply(state:State,command:OutboundToolCommandV13) {
 return state.rulesetVersion===12?applyCommandV12(state,command as OutboundToolCommandV12):applyCommandV13(state,command);
}
function fiveCellNorth(state:State):State {
 const next=structuredClone(state);for(const cell of [4,13,22,31])next.board[cell]=F;
 next.candidates[0]={id:'shipment.fixture',shapeId:'shape.single',cargo:F,quarterTurns:0};return next;
}
const shipmentCommand={type:'place',pieceId:'shipment.fixture',origin:{x:4,y:4}} as const;

// Mutation target: keeping only rounded shipment deltas loses the second half-point.
test('normal and endless retain fractional score across two five-cell shipments',()=>{
 for(const version of [12,13] as const){
  const initial=create(version,'normal');assert.equal(initial.rawScore,0);assert.equal(initial.score,0);
  const firstInput=fiveCellNorth(initial),before=structuredClone(firstInput);
  const preview=version===12?previewPlacementV12(firstInput as OutboundToolRunV12,shipmentCommand.pieceId,shipmentCommand.origin)
   :previewPlacementV13(firstInput as OutboundToolRunV13,shipmentCommand.pieceId,shipmentCommand.origin);
  assert.equal(preview.valid,true);assert.deepEqual(preview.shipments.map(event=>event.score),[62]);assert.deepEqual(firstInput,before);
  const first=apply(firstInput,shipmentCommand);assert.equal(first.error,undefined);assert.equal(first.state.rawScore,50);assert.equal(first.state.score,62);
  assert.deepEqual(first.events.filter(event=>event.type==='shipment').map(event=>event.score),[62]);
  const second=apply(fiveCellNorth(first.state),shipmentCommand);assert.equal(second.error,undefined);assert.equal(second.state.rawScore,100);assert.equal(second.state.score,125);
  assert.deepEqual(second.events.filter(event=>event.type==='shipment').map(event=>event.score),[63]);
  assert.deepEqual(firstInput,before);
 }
});

// Mutation target: using another tier or only applying the multiplier in one mode.
test('every difficulty scales actual shipment totals identically in normal and endless',()=>{
 for(const version of [12,13] as const)for(const [difficulty,expected] of [['easy',50],['normal',62],['hard',75],['expert',100]] as const){
  const input=fiveCellNorth(create(version,difficulty)),result=apply(input,shipmentCommand);
  assert.equal(result.error,undefined);assert.equal(result.state.score,expected);assert.equal(result.state.rawScore,50);
  assert.equal(result.events.filter(event=>event.type==='shipment').reduce((sum,event)=>sum+event.score,0),expected);
 }
});

// Mutation target: prematurely finishing at the thirtieth order drops later chain points.
test('the full final chain scales before normal victory and endless continuation',()=>{
 for(const version of [12,13] as const){
  const input=create(version,'normal');input.completedOrders=29;input.shift=5;
  for(const cell of [4,13,22,31,40])input.board[cell]=F;
  for(const cell of [44,43,42,41])input.board[cell]='cargo.chem';
  for(const cell of [36,37,38,39,48])input.board[cell]='cargo.machine';
  input.candidates[0]={id:'trigger',shapeId:'shape.single',cargo:F,quarterTurns:0};
  const result=apply(input,{type:'place',pieceId:'trigger',origin:{x:0,y:0}}),shipments=result.events.filter(event=>event.type==='shipment');
  assert.equal(result.error,undefined);assert.deepEqual(shipments.map(event=>event.score),[62,50,63]);assert.deepEqual(shipments.map(event=>event.chain),[1,2,3]);
  assert.equal(result.state.rawScore,140);assert.equal(result.state.score,175);assert.equal(result.state.completedOrders,32);
  assert.equal(result.state.phase,version===12?'result':'input');assert.equal(result.state.result,version===12?'won':null);
  assert.equal(result.state.generatedPieces,input.generatedPieces+(version===12?0:1));
 }
});

// Mutation target: awarding points for cells discarded by clear or multiplying a triggered shipment twice.
test('clear awards only actual shipments and retains the fractional carry',()=>{
 for(const version of [12,13] as const){
  const noShipment=create(version,'normal',{rotate:0,clear:1,wildcard:0});noShipment.board[0]=F;noShipment.board[80]='cargo.chem';
  const deleted=apply(noShipment,{type:'clear',cells:[0,80]});assert.equal(deleted.error,undefined);assert.equal(deleted.state.rawScore,0);assert.equal(deleted.state.score,0);
  assert.equal(deleted.events.filter(event=>event.type==='shipment').length,0);
  const input=create(version,'normal',{rotate:0,clear:1,wildcard:0});input.board[0]='cargo.machine';
  for(const cell of [4,13,22,31,40])input.board[cell]=F;
  const cleared=apply(input,{type:'clear',cells:[0]});assert.equal(cleared.error,undefined);assert.equal(cleared.state.rawScore,50);assert.equal(cleared.state.score,62);
  assert.deepEqual(cleared.events.filter(event=>event.type==='shipment').map(event=>event.score),[62]);assert.deepEqual(cleared.state.rngState,input.rngState);
  assert.deepEqual(cleared.state.candidates,input.candidates);assert.equal(cleared.state.toolCharges.clear,0);
  const next=apply(fiveCellNorth(cleared.state),shipmentCommand);assert.equal(next.state.rawScore,100);assert.equal(next.state.score,125);
  assert.deepEqual(next.events.filter(event=>event.type==='shipment').map(event=>event.score),[63]);
 }
});

// Mutation target: rescue probes leak speculative shipment points into the real run or lose its half-point.
test('rescue searches preserve fractional credit until the real clear shipment commits',()=>{
 for(const version of [12,13] as const){
  const input=create(version,'normal',{rotate:0,clear:1,wildcard:0});input.rawScore=50;input.score=62;
  input.board=input.board.map((_,cell)=>cell===76?null:(Math.floor(cell/9)+cell%9)%2?'cargo.chem':'cargo.machine');
  for(const cell of [4,13,22,31,40,49,58])input.board[cell]=F;
  input.candidates=[{id:'fixture',shapeId:'shape.i4_v',cargo:'cargo.chem',quarterTurns:0}];
  const before=structuredClone(input),plan=input.rulesetVersion===12?findRescuePlanV12(input):findRescuePlanV13(input);
  assert.deepEqual(plan,[{type:'clear',cells:[67]}]);assert.deepEqual(input,before);
  const rescue=input.rulesetVersion===12?settlePhaseV12(input):settlePhaseV13(input);
  assert.equal(rescue.phase,'rescue');assert.equal(rescue.rawScore,50);assert.equal(rescue.score,62);
  const actual=apply(rescue,plan![0]);assert.equal(actual.error,undefined);assert.equal(actual.state.phase,'input');
  assert.equal(actual.state.rawScore,120);assert.equal(actual.state.score,150);
  assert.deepEqual(actual.events.filter(event=>event.type==='shipment').map(event=>event.score),[88]);assert.deepEqual(input,before);
 }
});

// Mutation target: candidate-only tools or rejected placement consume pending fractional score.
test('rotating, recoloring, and invalid placement never award or discard accumulated points',()=>{
 for(const version of [12,13] as const){
  const input=create(version,'normal',{rotate:1,clear:0,wildcard:1});input.rawScore=50;input.score=62;
  input.candidates[0]={id:'fixture',shapeId:'shape.domino_h',cargo:F,quarterTurns:0};
  const rotated=apply(input,{type:'rotate',pieceId:'fixture',quarterTurns:1});assert.equal(rotated.error,undefined);
  const recolored=apply(rotated.state,{type:'wildcard',pieceId:'fixture',cargo:'cargo.machine'});assert.equal(recolored.error,undefined);
  for(const result of [rotated,recolored]){
   assert.equal(result.state.rawScore,50);assert.equal(result.state.score,62);assert.equal(result.events.filter(event=>event.type==='shipment').length,0);
   assert.deepEqual(result.state.rngState,input.rngState);
  }
  const rejected=apply(recolored.state,{type:'place',pieceId:'fixture',origin:{x:4,y:8}});
  assert.ok(rejected.error);assert.equal(rejected.state,recolored.state);assert.deepEqual(rejected.events,[]);
 }
});
