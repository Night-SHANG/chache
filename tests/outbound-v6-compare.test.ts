import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createRun,previewPlacement,findLegalMoves} from '../src/domain/engine.ts';
import {checksum,replay} from '../src/domain/replay.ts';
import type {RunState,Piece,Command,OutboundDifficulty} from '../src/domain/types.ts';
// @ts-expect-error Standalone QA module is intentionally outside the production TypeScript build.
import * as compare from '../qa/outbound-v6-compare.mjs';

const F='cargo.food',M='cargo.machine',C='cargo.chem';
const mixed:Piece={id:'fixture.mix',shapeId:'shape.square',cargo:F,cellCargos:[F,F,M,M]};
function fixture():RunState {const state=createRun(1,'color_exit',6,'easy');state.candidates=[structuredClone(mixed)];return state;}

// Mutation targets: budget, four exact thresholds, shape-first weighting, 9x9 identity.
test('v6 comparison fixes four thresholds, one geometry-aware heuristic and exactly 400-game campaign',()=>{
 assert.equal(typeof compare.assertProtocol,'function','Comparison protocol validator is implemented');
 assert.equal(compare.assertProtocol(),true);
 assert.deepEqual(compare.PROTOCOL.tiers,['easy','normal','hard','expert']);
 assert.deepEqual(compare.PROTOCOL.mixedPercent,{easy:20,normal:30,hard:40,expert:50});
 assert.equal(compare.PROTOCOL.fullGames,400);assert.equal(compare.PROTOCOL.seedStart,1);assert.equal(compare.PROTOCOL.seedEnd,100);
 assert.equal(compare.PROTOCOL.rules.boardSize,9);assert.equal(compare.PROTOCOL.generatorSamplesPerTier,10000);assert.equal(compare.PROTOCOL.maxCommands,600);
 assert.throws(()=>compare.chooseMove(createRun(1,'color_exit',5,'entry')),/v6/);
 assert.throws(()=>compare.runComparison({seeds:101}),/seeds/);
});
// Mutation targets: using 7-wide stride or piece.cargo for the entire mixed shape.
test('v6 heuristic uses actual cell colors and 9-wide gate distances after settlement',()=>{
 const state=fixture();state.board[4]=F;state.board[13]=F;state.board[30]=M;
 const move={pieceId:mixed.id,origin:{x:4,y:2}},before=JSON.stringify(state);
 const measured=compare.inspectMove(state,move),preview=previewPlacement(state,move.pieceId,move.origin);
 assert.equal(measured.features.meanGateDistance,4); // F distances 2,3; M distances 5,6.
 assert.equal(measured.features.sameColorContacts,2);assert.equal(measured.features.batches,1);assert.equal(measured.features.shippedCells,4);
 assert.equal(measured.projectedBoard[31],M);assert.equal(measured.projectedBoard[32],M);
 for(const cell of preview.shipments[0].cells)assert.equal(measured.projectedBoard[cell],null);
 assert.equal(JSON.stringify(state),before);
 const second=fixture();second.candidates[0].cellCargos=[F,F,C,C];
 assert.notEqual(compare.inspectMove(second,move).features.meanGateDistance,compare.inspectMove(fixture(),move).features.meanGateDistance);
});
test('v6 empty-route and own-gate connectivity are different fixed features',()=>{
 const state=fixture(),clear=compare.inspectMove(state,{pieceId:mixed.id,origin:{x:2,y:1}});
 assert.equal(clear.features.entryOccupied,false);assert.equal(clear.features.reachableEmptyCells,77);
 const entry=compare.inspectMove(state,{pieceId:mixed.id,origin:{x:4,y:7}});
 assert.equal(entry.features.entryOccupied,true);assert.equal(entry.features.reachableEmptyCells,0);
 const gate=compare.inspectMove(state,{pieceId:mixed.id,origin:{x:4,y:0}});
 assert.equal(gate.features.gateConnectedCells,2);assert.equal(clear.features.gateConnectedCells,0);
});
test('v6 policy is deterministic, read-only and blind to seed, RNG, ordinal, history and difficulty thresholds',()=>{
 const state=createRun(7,'color_exit',6,'normal'),before=JSON.stringify(state),move=compare.chooseMove(state);
 assert.ok(findLegalMoves(state).some(m=>JSON.stringify(m)===JSON.stringify(move)));
 const hidden={...state,seed:999,rngState:[11,22,33,44],nextId:9000,generatedPieces:5000,commands:[]};
 assert.deepEqual(compare.chooseMove(hidden),move);assert.deepEqual(compare.chooseMove(state),move);assert.equal(JSON.stringify(state),before);
 for(const difficultyId of ['easy','normal','hard','expert'] as OutboundDifficulty[])assert.deepEqual(compare.chooseMove({...state,difficultyId,runConfigId:`run.outbound9_v6.${difficultyId}`}),move);
});
// P5's actual length, not a hardcoded four, determines partial and shipped cells.
test('v6 mixed provenance counts P5 two-of-five partial clearing and older remnants exactly',()=>{
 const piece:Piece={id:'p5',shapeId:'shape.p5',cargo:F,cellCargos:[F,F,M,M,M]};
 const tracker=compare.createPieceTracker(),board:Array<string|null>=Array(81).fill(null);for(const cell of [13,14,22])board[cell]=M;
 const metrics=compare.trackPlacement(tracker,piece,[{type:'placed',pieceId:'p5',cells:[4,5,13,14,22]},
 {type:'shipment',cells:[4,5,6,7]}],board);
 assert.equal(metrics.immediatePartialMixedPlacement,1);assert.equal(metrics.immediateMixedShippedCells,2);assert.equal(metrics.immediateMixedRemainingCells,3);
 assert.equal(metrics.partialMixedPieceShipmentEvents,1);assert.equal(metrics.partialShipmentBatches,1);
 const final:Array<string|null>=Array(81).fill(null),later=compare.trackPlacement(tracker,{id:'next',shapeId:'shape.single',cargo:M},[
 {type:'placed',pieceId:'next',cells:[12]},{type:'shipment',cells:[12,13,14,22]}],final);
 assert.equal(later.partialMixedPieceShipmentEvents,0);assert.equal(tracker.owners.size,0);
});
test('v6 independent sampling checks six draws, nested thresholds, all eight shapes and unplaceable four/five-cell pieces',()=>{
 const result=compare.sampleGenerator({samples:240});
 assert.equal(result.records.length,240);assert.equal(result.summary.rawAlignmentChecks,240);assert.equal(result.summary.nestedSelectionChecks,240);
 assert.equal(result.summary.drawsPerPiece,6);
 for(const tier of ['easy','normal','hard','expert']){
  const s=result.summary.tiers[tier];assert.equal(s.generated.pure+s.generated.mixed,240);assert.equal(s.fallbackCount,0);
  assert.ok(s.unplaceableMixedBySize[4]>0);assert.ok(s.unplaceableMixedBySize[5]>0);
  assert.equal(Object.values(s.shapeCounts).reduce((a,b)=>Number(a)+Number(b),0),s.generated.mixed);
  assert.equal(s.generated.mixed,result.records.filter((r:{rolls:{typeRoll:number}})=>r.rolls.typeRoll<=compare.PROTOCOL.mixedPercent[tier]).length);
 }
 assert.deepEqual(result,compare.sampleGenerator({samples:240}));
});
test('v6 short cap reconciles actual generation, selected/held, replay and strict storage without reporting losses',()=>{
 const result=compare.runComparison({seeds:1,maxCommands:3});assert.equal(result.runs.length,4);
 for(const run of result.runs){
  assert.equal(run.status,'capped');assert.equal(run.terminal,false);assert.equal(run.moves,3);assert.equal(run.replayChecks,3);assert.equal(run.previewChecks,3);
  assert.equal(run.generated.pure+run.generated.mixed,6);assert.equal(run.initialGenerated.pure+run.initialGenerated.mixed,3);
  assert.equal(run.saveLoadChecks,2);assert.deepEqual(run.checkpoints.map((p:{commandIndex:number})=>p.commandIndex),[0,3]);
  for(const kind of ['pure','mixed'])assert.equal(run.generated[kind],run.selected[kind]+run.heldFinal[kind]);
  const commands=run.trace.map((s:{command:Command})=>s.command);assert.equal(checksum(replay(run.seed,commands,'color_exit',6,run.tier)),run.finalChecksum);
  assert.equal(run.peakOccupancy,run.finalState.maxOccupancy);assert.equal(run.batches,run.finalState.completedOrders);
  assert.equal(run.finalOccupancy,run.finalState.board.filter(Boolean).length);assert.equal(run.finalLegalMoves>0,true);
 }
 for(const summary of Object.values(result.summary.tiers) as {capped:number;failed:number;won:number}[]){assert.equal(summary.capped,1);assert.equal(summary.failed,0);assert.equal(summary.won,0);}
});
test('source binding includes root routing, save identity, pure-rand code and refuses drift',()=>{
 const bound=compare.coreSourceBinding();for(const name of ['src/domain/engine.ts','src/domain/replay.ts','src/domain/v6/engine.ts','src/application/save.ts','src/application/run-slots.ts','node_modules/pure-rand/package.json'])assert.ok(bound.files[name]);
 assert.equal(compare.assertSourceBinding(bound,bound),true);
 assert.throws(()=>compare.assertSourceBinding(bound,{...bound,sha256:'changed'}),/source.*changed|drift/i);
});

// Mutation targets: unbound outputs, replay-only final checksum, historical capacity treated as an isolated ratio test.
test('v6 evidence roundtrips short fixture commands and refuses output corruption',()=>{
 const output=mkdtempSync(join(tmpdir(),'outbound-v6-evidence-'));
 try {
  const result=compare.runComparison({seeds:1,maxCommands:1}),sample=compare.sampleGenerator({samples:12}),binding=compare.coreSourceBinding();
  compare.writeEvidence(output,result,sample,{coreSource:binding,gamesMs:0,generatorMs:0,createdAt:'2026-10-06T00:00:00.000Z'});
  const checked=compare.verifyArtifacts(output);assert.equal(checked.runs,4);assert.equal(checked.replayChecks,4);assert.equal(checked.saveLoadChecks,8);
  const report=readFileSync(join(output,'report.md'),'utf8');assert.match(report,/49.*81/);assert.match(report,/66/);assert.match(report,/不是.*比例|不.*孤立.*比例/);
  const path=join(output,'runs.jsonl');writeFileSync(path,readFileSync(path,'utf8')+' ');
  assert.throws(()=>compare.verifyArtifacts(output),/Artifact drift/);
 } finally {rmSync(output,{recursive:true,force:true});}
});
