import test from 'node:test';
import assert from 'node:assert/strict';
import {applyCommandV14,createRunV14,previewPlacementV14} from '../src/domain/v14/engine.ts';
import {findLegalMovesV14,reservedEntryCellsV14} from '../src/domain/v14/board.ts';
import {findRescuePlanV14} from '../src/domain/v14/tools.ts';
import {checksumV14,compactCommandTailV14,replayV14} from '../src/domain/v14/replay.ts';
import type {InboundCommandV14,StartV14} from '../src/domain/v14/types.ts';

test('seeded standard, daily and endless command streams keep every reserved entry empty and replay deterministically',()=>{
 for(const mode of ['standard','daily','endless'] as const)for(const seed of [1,17,2026]){
  const options:StartV14={seed,mode,toolCharges:mode==='daily'?{rotate:0,clear:0,wildcard:0}:{rotate:0,clear:1,wildcard:1}};
  let state=createRunV14(options);const commands:InboundCommandV14[]=[],checksums:string[]=[];
  const accept=(command:InboundCommandV14)=>{
   const result=applyCommandV14(state,command);assert.equal(result.error,undefined);state=result.state;commands.push(command);checksums.push(checksumV14(state));
   for(const cell of reservedEntryCellsV14(state)){assert.equal(state.board[cell],null);assert.equal(state.cellTraits[cell],null);}
  };
  accept({type:'chooseCleanup',branch:'placements'});
  for(let step=0;step<50&&state.result===null;step++){
   if(state.phase==='rescue'){
    const plan=findRescuePlanV14(state);assert.ok(plan);assert.ok(plan.length>0);for(const command of plan)accept(command);
   }
   if(state.phase!=='input')break;
   const move=findLegalMovesV14(state)[0],before=JSON.stringify(state),preview=previewPlacementV14(state,move.pieceId,move.origin);
   assert.equal(preview.valid,true);assert.equal(JSON.stringify(state),before);
   const invalid=applyCommandV14(state,{type:'clear',cells:reservedEntryCellsV14(state).slice(0,1)});assert.ok(invalid.error);assert.equal(invalid.state,state);assert.equal(JSON.stringify(state),before);
   const restored=structuredClone({...state,elapsedMs:1000*step,maxOccupancy:45,runSerial:42});assert.equal(checksumV14(restored),checksumV14(state));
   accept({type:'place',...move});assert.equal(checksumV14(preview.stateAfter!),checksumV14(state));
   assert.equal(checksumV14(applyCommandV14(restored,{type:'place',...move}).state),checksumV14(state));
  }
  if(state.phase==='input'||state.phase==='rescue')accept({type:'finish'});
  const replayed=replayV14(options,commands);assert.equal(checksumV14(replayed.state),checksumV14(state));assert.deepEqual(replayed.trace.map(entry=>entry.checksum),checksums);
  function* stream(){yield* commands;}assert.deepEqual(replayV14(options,stream()),replayed);
 }
});

test('v14 checksum distinguishes its rules identity while ignoring metadata and compacted history representation',()=>{
 const state=createRunV14({seed:17,mode:'standard'}),history=Array.from({length:128},()=>({type:'chooseCleanup' as const,branch:'orders' as const}));
 const full={...state,commandIndex:128,commands:history},compacted=compactCommandTailV14(full,128);
 assert.equal(compacted.commandBaseIndex,128);assert.deepEqual(compacted.commands,[]);assert.equal(checksumV14(compacted),checksumV14(full));
 assert.equal(checksumV14({...full,elapsedMs:2500,runSerial:42,maxOccupancy:45}),checksumV14(full));
 for(const through of [-128,1,127,129,256,.5])assert.throws(()=>compactCommandTailV14(full,through));
 assert.throws(()=>replayV14({seed:17,mode:'standard'},[{type:'place',pieceId:'missing',origin:{x:0,y:0}}]),/Replay command 1/);
});
