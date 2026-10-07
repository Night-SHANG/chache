import test from 'node:test';
import assert from 'node:assert/strict';
import {makeV11Fixture} from './helpers/v11-fixtures.ts';
import {createRunV11,applyCommandV11,findLegalMovesV11,previewPlacementV11} from '../src/domain/v11/engine.ts';
import {compactCommandTailV11,checksumV11,replayV11} from '../src/domain/v11/replay.ts';
import {decodeGameRun,encodeGameRun} from '../src/application/game-codec.ts';
import type {InboundCommandV11,InboundRunV11,StartV11} from '../src/domain/v11/types.ts';

// A non-block boundary must never produce a state the strict save codec cannot restore.
test('compaction only accepts complete 128-command blocks and preserves gameplay at command 129',()=>{
 const state=makeV11Fixture({commandIndex:128,commands:Array.from({length:128},()=>({type:'place' as const,pieceId:'history',origin:{x:0,y:0}}))});
 for(const through of [-128,1,127,129,256,.5])assert.throws(()=>compactCommandTailV11(state,through));
 const compacted=compactCommandTailV11(state,128);assert.equal(compacted.commandBaseIndex,128);assert.deepEqual(compacted.commands,[]);
 assert.equal(checksumV11(compacted),checksumV11(state));assert.deepEqual(decodeGameRun(encodeGameRun(compacted)),compacted);
 const result=applyCommandV11(compacted,{type:'place',pieceId:compacted.candidates[0].id,origin:{x:0,y:0}});
 assert.equal(result.error,undefined);assert.equal(result.state.commandIndex,129);assert.equal(result.state.commandBaseIndex,128);assert.equal(result.state.commands.length,1);
 assert.deepEqual(decodeGameRun(encodeGameRun(result.state)),result.state);assert.throws(()=>compactCommandTailV11(compacted,0));
});

test('actual seeded replay survives save resume, previews, invalid tools and presentation pause metadata',()=>{
 const options:StartV11={seed:17,mode:'standard',toolCharges:{rotate:0,clear:1,wildcard:1}},commands:InboundCommandV11[]=[];
 let state=createRunV11(options);
 const accept=(command:InboundCommandV11)=>{const result=applyCommandV11(state,command);assert.equal(result.error,undefined);state=result.state;commands.push(command);};
 accept({type:'chooseCleanup',branch:'placements'});accept({type:'wildcard',pieceId:state.candidates[0].id});
 for(let step=0;step<6&&state.phase==='input';step++){
  const move=findLegalMovesV11(state)[0],before=JSON.stringify(state),preview=previewPlacementV11(state,move.pieceId,move.origin);
  assert.ok(preview.valid);assert.equal(JSON.stringify(state),before);
  const cancelled=applyCommandV11(state,{type:'clear',cells:[]});assert.ok(cancelled.error);assert.equal(cancelled.state,state);assert.equal(JSON.stringify(state),before);
  const restored=decodeGameRun(encodeGameRun({...state,elapsedMs:100000+step,maxOccupancy:49,runSerial:42})) as InboundRunV11;
  assert.equal(checksumV11(restored),checksumV11(state));
  const resumed=applyCommandV11(restored,{type:'place',...move});accept({type:'place',...move});
  assert.equal(checksumV11(state),checksumV11(resumed.state));assert.equal(checksumV11(state),checksumV11(preview.stateAfter!));
 }
 if(state.phase==='input'||state.phase==='rescue')accept({type:'finish'});
 const replayed=replayV11(options,commands);assert.equal(checksumV11(replayed.state),checksumV11(state));assert.deepEqual(replayed.state,state);
 function* stream(){yield* commands;}assert.deepEqual(replayV11(options,stream()),replayed);
 assert.throws(()=>replayV11(options,[{type:'place',pieceId:'missing',origin:{x:0,y:0}}]),/Replay command 1/);
});

test('checksum includes orientation, deadlines, cleanup, command index and tools while excluding only app and history representation',()=>{
 const state=makeV11Fixture(),baseline=checksumV11(state);
 const mutations:((state:InboundRunV11)=>void)[]=[next=>{next.candidates[0].quarterTurns=1;},next=>{next.cellTraits[0]={kind:'rush',remaining:1,bornAtPlacement:0};},next=>{next.cleanup!.progress=1;},next=>{next.commandIndex++;},next=>{next.toolCharges.clear=1;},next=>{next.usedToolIds=['clear'];},next=>{next.rngState[0]++;},next=>{next.successfulPlacements++;},next=>{next.guided=true;}];
 for(const mutate of mutations){const changed=structuredClone(state);mutate(changed);assert.notEqual(checksumV11(changed),baseline);}
 assert.equal(checksumV11({...state,elapsedMs:900,runSerial:7,maxOccupancy:44,commandBaseIndex:128,commands:[]}),baseline);
});
