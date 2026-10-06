import test from 'node:test';
import assert from 'node:assert/strict';
import {createRun,applyCommand,findLegalMoves,previewPlacement} from '../src/domain/engine.ts';
import {checksum,replay} from '../src/domain/replay.ts';
import type {Command,RunState,Shipment} from '../src/domain/types.ts';
// @ts-expect-error Standalone QA tool is JavaScript, outside the production TypeScript build.
import * as compare from '../qa/color-exit-compare.mjs';

const F='cargo.food',M='cargo.machine';
function fixture():RunState {
 const state=createRun(1,'color_exit',4);
 state.candidates=[{id:'food',shapeId:'shape.single',cargo:F},{id:'machine',shapeId:'shape.single',cargo:M}];
 return state;
}

test('comparison freezes the unbalanced P0 and accepts only the two declared policies',()=>{
 assert.deepEqual(compare.STRATEGIES,['exit_feed','route_group']);
 assert.equal(compare.assertProtocol(),true);
 assert.throws(()=>compare.chooseMove(fixture(),'other'),/strategy/);
 assert.throws(()=>compare.chooseMove(createRun(1),'exit_feed'),/color_exit/);
});

test('feed policy minimizes matching single-gate distance and immediately ships among ties',()=>{
 const state=fixture();state.board[10]=F;state.board[17]=F;state.board[24]=F;
 const before=JSON.stringify(state),move=compare.chooseMove(state,'exit_feed');
 assert.deepEqual(move,{pieceId:'food',origin:{x:3,y:0}});
 assert.equal(previewPlacement(state,move.pieceId,move.origin).shipments.length,1);
 assert.equal(JSON.stringify(state),before);
});

test('route policy keeps the south entry open when at least one legal alternative exists',()=>{
 const state=fixture();state.board.fill(M);state.board[45]=null;state.board[48]=null;
 const move=compare.chooseMove(state,'route_group');
 assert.deepEqual(move.origin,{x:6,y:6});
 assert.equal(applyCommand(state,{type:'place',...move}).state.board[45],null);
});

test('both policies use legal unrotated current candidates without reading the future RNG or seed',()=>{
 for(const strategy of compare.STRATEGIES){
  const state=fixture(),legal=findLegalMoves(state),before=JSON.stringify(state);
  const forbidden=new Proxy(state,{get(target,key,receiver){if(['rngState','seed','nextId','generatedPieces'].includes(String(key)))throw Error(`Hidden field read: ${String(key)}`);return Reflect.get(target,key,receiver);}});
  const move=compare.chooseMove(forbidden,strategy);
  assert.ok(legal.some(item=>JSON.stringify(item)===JSON.stringify(move)));
  assert.equal(JSON.stringify(state),before);
  assert.equal(compare.chooseMove({...state,phase:'result'},strategy),null);
 }
});

test('one-piece self-shipment means every shipped cell is newly placed, including 4-cell pieces',()=>{
 const placed={type:'placed' as const,pieceId:'square',cells:[3,4,10,11]};
 const ship={type:'shipment',cells:[3,4,10,11],dockId:'dock.north',cargo:F} as Shipment;
 const exact=compare.classifyPlacement([placed,ship],F);
 assert.equal(exact.selfShipmentBatches,1);assert.equal(exact.selfShipmentPlacement,true);
 assert.equal(exact.exitAdjacent,true);assert.equal(exact.gateContact,true);
 assert.equal(compare.classifyPlacement([placed,{...ship,cells:[3,4,10,11,17]}],F).selfShipmentBatches,0);
 assert.equal(compare.classifyPlacement([placed,{...ship,cells:[3,4,10]}],F).selfShipmentBatches,1);
});

test('failure diagnostics separate entry occupancy, genuine route blockage and insufficient cargo',()=>{
 const state=fixture();for(const cell of [3,10,17,16])state.board[cell]=F;
 for(const cell of [21,22,23,24,25,26,27])state.board[cell]=M;
 const blocked=compare.diagnoseBoard(state);assert.equal(blocked.entryOccupied,false);assert.equal(blocked.routeBlockedReadyExits,1);
 state.board[45]=M;const entry=compare.diagnoseBoard(state);assert.equal(entry.entryOccupied,true);assert.equal(entry.entryBlockedReadyExits,2);assert.equal(entry.routeBlockedReadyExits,0);
 assert.equal(compare.diagnoseBoard(fixture()).routeBlockedReadyExits,0);
});

test('each accepted command has matching saved state and replay checksums with event-reconcilable metrics',()=>{
 const run=compare.simulateRun(1,{strategy:'exit_feed',maxCommands:6});
 assert.equal(run.status,'capped');assert.equal(run.placements,6);assert.equal(run.saveChecks,6);assert.equal(run.replayChecks,6);
 const commands=run.trace.map((step:{command:Command})=>step.command);
 assert.equal(checksum(replay(1,commands,'color_exit',4)),run.finalChecksum);
 let state=createRun(1,'color_exit',4),batches=0,self=0,near=0;
 for(const step of run.trace){const candidate=state.candidates.find(p=>p.id===step.command.pieceId)!;const result=applyCommand(state,step.command);assert.equal(result.error,undefined);state=result.state;
  assert.equal(checksum(state),step.checksum);assert.deepEqual(result.events,step.events);
  const metrics=compare.classifyPlacement(result.events,candidate.cargo);batches+=result.events.filter(e=>e.type==='shipment').length;self+=metrics.selfShipmentBatches;near+=Number(metrics.exitAdjacent);
 }
 assert.equal(run.batches,batches);assert.equal(run.selfShipmentBatches,self);assert.equal(run.exitAdjacentPlacements,near);assert.equal(run.maxOccupancy,state.maxOccupancy);
 assert.deepEqual(run,compare.simulateRun(1,{strategy:'exit_feed',maxCommands:6}));
});

test('bounded paired comparisons retain every consecutive seed and classify caps separately from failures',()=>{
 const result=compare.runComparison({seedStart:7,runs:2,maxCommands:2});
 assert.deepEqual(result.runs.map((run:{seed:number;strategy:string})=>[run.seed,run.strategy]),[[7,'exit_feed'],[7,'route_group'],[8,'exit_feed'],[8,'route_group']]);
 for(const summary of Object.values(result.summary.strategies) as {runs:number;won:number;failed:number;capped:number;placements:unknown}[]){assert.equal(summary.runs,2);assert.equal(summary.won,0);assert.equal(summary.failed,0);assert.equal(summary.capped,2);}
 assert.equal(result.summary.pairedSeeds,2);
 assert.throws(()=>compare.runComparison({runs:0}),/runs/);
 assert.throws(()=>compare.runComparison({runs:1,maxCommands:3001}),/maxCommands/);
 assert.match(compare.reportMarkdown(result.summary),/不能/);
});
