import test from 'node:test';
import assert from 'node:assert/strict';
import {applyCommandV14,createRunV14,previewPlacementV14} from '../src/domain/v14/engine.ts';
import {findLegalMovesV14,pieceCellsV14,reservedEntryCellsV14} from '../src/domain/v14/board.ts';
import {checksumV14,replayV14} from '../src/domain/v14/replay.ts';
import type {InboundCommandV14,InboundRunV14} from '../src/domain/v14/types.ts';

// Mutation caught: mode-specific placement divergence, non-portable RNG, or preview consuming an actual clock.
test('real generated multi-cell rush placement restores and replays exactly in standard daily and endless modes',()=>{
 for(const mode of ['standard','daily','endless'] as const){
  let ready:InboundRunV14|undefined;
  for(let seed=1;seed<=300;seed++){
   const result=applyCommandV14(createRunV14({seed:seed*104729,mode}),{type:'chooseCleanup',branch:'placements'});assert.equal(result.error,undefined);
   if(result.state.candidates.some(piece=>piece.trait==='rush'&&pieceCellsV14(piece).length>1)){ready=result.state;break;}
  }
  assert.ok(ready,`${mode} has a real multi-cell rush candidate`);
  let state=ready;const commands:InboundCommandV14[]=[{type:'chooseCleanup',branch:'placements'}];
  const trace=[checksumV14(state)],rush=state.candidates.find(piece=>piece.trait==='rush'&&pieceCellsV14(piece).length>1)!;
  for(let turn=0;turn<4;turn++){
   const move=findLegalMovesV14(state).find(move=>turn>0||move.pieceId===rush.id);assert.ok(move);
   const command={type:'place' as const,...move},before=structuredClone(state),preview=previewPlacementV14(state,move.pieceId,move.origin);
   assert.equal(preview.valid,true);assert.deepEqual(state,before);
   const restored=JSON.parse(JSON.stringify({...state,elapsedMs:5000,runSerial:99})) as InboundRunV14;
   const result=applyCommandV14(state,command),again=applyCommandV14(restored,command);assert.equal(result.error,undefined);
   assert.deepEqual(result.events,again.events);assert.equal(checksumV14(result.state),checksumV14(again.state));assert.equal(checksumV14(result.state),checksumV14(preview.stateAfter!));
   if(turn===0){const placed=result.events.find(event=>event.type==='placed');assert.ok(placed);assert.equal(placed.cells.length,pieceCellsV14(rush).length);for(const cell of placed.cells)if(result.state.board[cell]!==null){assert.equal(result.state.board[cell],rush.cargo);assert.deepEqual(result.state.cellTraits[cell],{kind:'rush',remaining:3,bornAtPlacement:1});}}
   state=result.state;commands.push(command);trace.push(checksumV14(state));
   for(const cell of reservedEntryCellsV14(state)){assert.equal(state.board[cell],null);assert.equal(state.cellTraits[cell],null);}
  }
  const replayed=replayV14({seed:state.seed,mode},commands);assert.equal(checksumV14(replayed.state),checksumV14(state));assert.deepEqual(replayed.trace.map(entry=>entry.checksum),trace);
 }
});
