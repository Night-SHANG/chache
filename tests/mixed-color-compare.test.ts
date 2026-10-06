import test from 'node:test';
import assert from 'node:assert/strict';
import {createRun,applyCommand,previewPlacement,findLegalMoves} from '../src/domain/engine.ts';
import {checksum,replay} from '../src/domain/replay.ts';
import type {RunState,Piece,Command,ColorTier} from '../src/domain/types.ts';
// @ts-expect-error Standalone observational QA tool is outside the production TypeScript build.
import * as compare from '../qa/mixed-color-compare.mjs';

const F='cargo.food',M='cargo.machine',C='cargo.chem';
const mixed:Piece={id:'fixture.mix',shapeId:'shape.square',cargo:F,cellCargos:[F,F,M,M]};
function fixture():RunState {
 const state=createRun(1,'color_exit',5,'entry');state.candidates=[structuredClone(mixed)];return state;
}

// Mutation target: changing rules, probabilities, strategy, seed count or command budget is protocol drift.
test('mixed comparison freezes three probabilities, one heuristic and a 300-run budget',()=>{
 assert.equal(compare.assertProtocol(),true);
 assert.deepEqual(compare.PROTOCOL.tiers,['entry','middle','late']);
 assert.deepEqual(compare.PROTOCOL.mixedPercent,{entry:20,middle:30,late:40});
 assert.equal(compare.PROTOCOL.fullGames,300);assert.equal(compare.PROTOCOL.seedStart,1);assert.equal(compare.PROTOCOL.seedEnd,100);
 assert.equal(compare.PROTOCOL.generatorSamplesPerTier,10000);assert.equal(compare.PROTOCOL.maxCommands,600);
 assert.throws(()=>compare.chooseMove(createRun(1,'color_exit',4)),/v5/);
 assert.throws(()=>compare.runComparison({seeds:101}),/seeds/);
});

// Mutation target: painting the entire mixed square with piece.cargo changes distance, contacts and remaining connectivity.
test('heuristic measures actual per-cell colors, preserving the unshipped band',()=>{
 const state=fixture();state.board[3]=F;state.board[10]=F;state.board[23]=M;
 const move={pieceId:mixed.id,origin:{x:3,y:2}},before=JSON.stringify(state);
 const measured=compare.inspectMove(state,move),preview=previewPlacement(state,move.pieceId,move.origin);
 assert.equal(measured.features.meanGateDistance,3); // F: 2,3; M:3,4.
 assert.equal(measured.features.sameColorContacts,2); // food at 10 and machine at 23.
 assert.equal(measured.features.batches,1);assert.equal(measured.features.shippedCells,4);
 assert.equal(measured.projectedBoard[24],M);assert.equal(measured.projectedBoard[25],M);
 for(const cell of preview.shipments[0].cells)assert.equal(measured.projectedBoard[cell],null);
 assert.equal(JSON.stringify(state),before);
 const second=fixture();second.candidates[0].cellCargos=[F,F,C,C];
 assert.notEqual(compare.inspectMove(second,move).features.meanGateDistance,compare.inspectMove(fixture(),move).features.meanGateDistance);
});

// Mutation target: scoring same-colored contact by the anchor cargo, or losing empty-cell flood-fill, must fail.
test('empty reachability and gate connectivity are distinct fixed heuristic features',()=>{
 const state=fixture();const clear=compare.inspectMove(state,{pieceId:mixed.id,origin:{x:2,y:1}});
 assert.equal(clear.features.entryOccupied,false);assert.equal(clear.features.reachableEmptyCells,45);
 const entry=compare.inspectMove(state,{pieceId:mixed.id,origin:{x:3,y:5}});
 assert.equal(entry.features.entryOccupied,true);assert.equal(entry.features.reachableEmptyCells,0);
 const gate=compare.inspectMove(state,{pieceId:mixed.id,origin:{x:3,y:0}});
 assert.equal(gate.features.gateConnectedCells,2);assert.equal(clear.features.gateConnectedCells,0);
});

test('policy is deterministic, does not mutate state, and cannot use seed or future RNG to choose',()=>{
 const state=createRun(7,'color_exit',5,'middle'),before=JSON.stringify(state),move=compare.chooseMove(state);
 assert.ok(findLegalMoves(state).some(m=>JSON.stringify(m)===JSON.stringify(move)));
 const hidden={...state,seed:999,rngState:[11,22,33,44],nextId:9000,generatedPieces:5000,commands:[]};
 assert.deepEqual(compare.chooseMove(hidden),move);assert.deepEqual(compare.chooseMove(state),move);assert.equal(JSON.stringify(state),before);
 for(const tier of ['entry','middle','late'] as ColorTier[])assert.deepEqual(compare.chooseMove({...state,colorTier:tier,runConfigId:`run.color_exit_mix_v5.${tier}`}),move);
});

test('partial mixed metrics count only actual mixed-cell removals and track older remnants',()=>{
 const state=fixture();state.board[3]=F;state.board[10]=F;
 const move:Command={type:'place',pieceId:mixed.id,origin:{x:3,y:2}},result=applyCommand(state,move);
 const tracker=compare.createPieceTracker(),metrics=compare.trackPlacement(tracker,mixed,result.events,result.state.board);
 assert.equal(metrics.immediatePartialMixedPlacement,1);assert.equal(metrics.immediateMixedShippedCells,2);assert.equal(metrics.immediateMixedRemainingCells,2);
 assert.equal(metrics.partialMixedPieceShipmentEvents,1);assert.equal(metrics.partialShipmentBatches,1);
 assert.equal(result.events.filter(e=>e.type==='shipment')[0].cells.length,4); // Other two cells are old pure inventory.
 const laterBoard=[...result.state.board];laterBoard[24]=null;laterBoard[25]=null;
 const later=compare.trackPlacement(tracker,{id:'fixture.next',shapeId:'shape.single',cargo:M},[
  {type:'placed',pieceId:'fixture.next',cells:[23]},
  {type:'shipment',dockId:'dock.west',orderId:'fake',cargo:M,cells:[21,22,23,24,25],path:[],score:50,chain:1},
 ],laterBoard);
 assert.equal(later.partialMixedPieceShipmentEvents,0);assert.equal(later.immediateMixedShippedCells,0);
 assert.equal(tracker.owners.has(24),false);assert.equal(tracker.owners.has(25),false);
});

test('independent generator sampling aligns raw draws and nested threshold selection even when square cannot fit',()=>{
 const result=compare.sampleGenerator({samples:120});
 assert.equal(result.records.length,120);assert.equal(result.summary.rawAlignmentChecks,120);assert.equal(result.summary.nestedSelectionChecks,120);
 for(const tier of ['entry','middle','late']){
  const s=result.summary.tiers[tier];assert.equal(s.generated.pure+s.generated.mixed,120);assert.equal(s.fallbackCount,0);
  assert.ok(s.mixedWhenSquareCannotFit>0);
  assert.equal(s.generated.mixed,result.records.filter((r:{rolls:{typeRoll:number}})=>r.rolls.typeRoll<=compare.PROTOCOL.mixedPercent[tier]).length);
 }
 assert.deepEqual(result,compare.sampleGenerator({samples:120}));
});

test('short capped protocol runs reconcile generation, selected count, commands and exact replay for all tiers',()=>{
 const result=compare.runComparison({seeds:1,maxCommands:3});
 assert.equal(result.runs.length,3);
 for(const run of result.runs){
  assert.equal(run.seed,1);assert.equal(run.status,'capped');assert.equal(run.terminal,false);assert.equal(run.moves,3);assert.equal(run.replayChecks,3);
  assert.equal(run.generated.pure+run.generated.mixed,6);assert.equal(run.initialGenerated.pure+run.initialGenerated.mixed,3);
  assert.equal(run.selected.pure+run.selected.mixed,3);
  for(const kind of ['pure','mixed'])assert.equal(run.generated[kind],run.selected[kind]+run.heldFinal[kind]);
  const commands=run.trace.map((s:{command:Command})=>s.command);assert.equal(checksum(replay(run.seed,commands,'color_exit',5,run.tier)),run.finalChecksum);
  assert.equal(run.peakOccupancy,run.finalState.maxOccupancy);assert.equal(run.batches,run.finalState.completedOrders);
 }
 for(const summary of Object.values(result.summary.tiers) as {capped:number;failed:number;won:number}[]){assert.equal(summary.capped,1);assert.equal(summary.failed,0);assert.equal(summary.won,0);}
});
