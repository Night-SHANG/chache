import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import type {OutboundDifficulty} from '../src/domain/types.ts';
import type {OutboundEndlessCommandV10, OutboundEndlessRunV10} from '../src/domain/v10/types.ts';
import {createRunV10, applyCommandV10, compactCommandTailV10} from '../src/domain/v10/engine.ts';
import {checksumV10, replayV10} from '../src/domain/v10/replay.ts';

interface Route {seed:number;difficulty:OutboundDifficulty;commands:OutboundEndlessCommandV10[];checksums:string[]}
const fixture=JSON.parse(readFileSync('tests/fixtures/outbound-v10-golden.json','utf8')) as {cases:Route[];crossThirty:Route&{batches:number[];score:number;completedOrders:number};long:Route};

// Mutation targets: state field omissions, mixed cargo omissions, mutable caller command history and silently ignored errors.
test('replay preserves complete natural prefixes and pinned v10 checksums for all difficulties',()=>{
 for(const route of [...fixture.cases,fixture.crossThirty]){
  let state=createRunV10(route.seed,route.difficulty);assert.equal(checksumV10(state),route.checksums[0]);
  for(const [index,command] of route.commands.entries()){
   const result=applyCommandV10(state,command);assert.equal(result.error,undefined);state=result.state;
   assert.equal(checksumV10(state),route.checksums[index+1],`${route.difficulty} command ${index+1}`);
   if(route===fixture.crossThirty)assert.equal(state.completedOrders,fixture.crossThirty.batches[index]);
  }
  assert.deepEqual(replayV10(route.seed,route.difficulty,route.commands),state);
 }
 const result=replayV10(fixture.crossThirty.seed,fixture.crossThirty.difficulty,fixture.crossThirty.commands);
 assert.equal(result.completedOrders,37);assert.equal(result.score,2780);assert.equal(result.result,'failed');
});

test('checksum includes every future-affecting v10 field and ignores application metadata and history representation',()=>{
 const state=createRunV10(17,'expert'),checksum=checksumV10(state);
 const edits:Partial<OutboundEndlessRunV10>[]=[{seed:18},{board:state.board.map((cell,index)=>index===0?'cargo.food':cell)},
  {candidates:state.candidates.map((piece,index)=>index===0?{...piece,id:'changed'}:piece)},
  {candidates:state.candidates.map((piece,index)=>index===0?{...piece,cellCargos:piece.cellCargos?.map((cargo,cell)=>cell===1?'cargo.machine':cargo)}:piece)},
  {orders:state.orders.map((order,index)=>index===0?{...order,amount:5}:order)}, {rngState:state.rngState.map(value=>value+1)},
  {shift:2},{score:1},{completedOrders:1},{lastChain:1},{maxChain:1},{commandIndex:1},{nextId:5},{generatedPieces:4},
  {phase:'result',result:'won',endReason:'retired'},{phase:'result',result:'failed',endReason:'blocked'}];
 for(const patch of edits)assert.notEqual(checksumV10({...state,...patch}),checksum,JSON.stringify(patch));
 assert.equal(checksumV10({...state,runSerial:47,elapsedMs:1000,maxOccupancy:12}),checksum);
 assert.equal(checksumV10({...state,commandBaseIndex:128,commands:[{type:'finishOutboundEndless'}]}),checksum);
 assert.notEqual(checksumV10(createRunV10(17,'easy')),checksum);
 assert.throws(()=>checksumV10({...state,rulesetVersion:8} as never),/规则|版本|identity/i);
});

test('retirement and replay errors are deterministic, report the exact rejected command and preserve the caller history',()=>{
 const command:OutboundEndlessCommandV10={type:'place',pieceId:'piece.1',origin:{x:0,y:0}},state=createRunV10(17,'easy');
 const first=applyCommandV10(state,command);assert.equal(first.error,undefined);command.origin.x=8;
 assert.deepEqual(first.state.commands[0],{type:'place',pieceId:'piece.1',origin:{x:0,y:0}});
 const commands:OutboundEndlessCommandV10[]=[{type:'place',pieceId:'piece.1',origin:{x:0,y:0}},{type:'finishOutboundEndless'}];
 const retired=replayV10(17,'easy',commands);assert.equal(retired.endReason,'retired');assert.deepEqual(retired.commands,commands);
 assert.throws(()=>replayV10(17,'easy',[...commands,{type:'finishOutboundEndless'}]),/Replay command 2:/);
 assert.throws(()=>replayV10(17,'easy',[{type:'place',pieceId:'missing',origin:{x:0,y:0}}]),/Replay command 0:/);
});

test('the 128-command segment and the embedded 129th-command tail replay to exactly the same long-run state',()=>{
 const route=fixture.long;assert.ok(route.commands.length>129);
 let state=createRunV10(route.seed,route.difficulty);const chunks:OutboundEndlessCommandV10[][]=[];
 for(const [index,command] of route.commands.entries()){
  const applied=applyCommandV10(state,command);assert.equal(applied.error,undefined);state=applied.state;
  assert.equal(state.commandIndex,index+1);assert.equal(state.commandIndex,state.commandBaseIndex+state.commands.length);
  if(index===127){
   assert.equal(state.commandBaseIndex,0);assert.equal(state.commands.length,128);
   chunks.push(state.commands);const before=JSON.stringify(state),checksum=checksumV10(state);
   state=compactCommandTailV10(state,128);assert.equal(JSON.stringify(applied.state),before);
   assert.equal(state.commandBaseIndex,128);assert.deepEqual(state.commands,[]);assert.equal(checksumV10(state),checksum);
  }
  if(index===128){assert.equal(state.commandBaseIndex,128);assert.deepEqual(state.commands,[command]);}
 }
 const complete=[...chunks.flat(),...state.commands];assert.deepEqual(complete,route.commands);
 const replayed=replayV10(route.seed,route.difficulty,complete);
 assert.deepEqual(compactCommandTailV10(replayed,128),state);assert.equal(checksumV10(state),route.checksums[route.checksums.length-1]);
 const before=JSON.stringify(state),retired=applyCommandV10(state,{type:'finishOutboundEndless'});assert.equal(retired.error,undefined);
 assert.equal(JSON.stringify(state),before);assert.equal(retired.state.endReason,'retired');
 assert.deepEqual(compactCommandTailV10(replayV10(route.seed,route.difficulty,[...complete,{type:'finishOutboundEndless'}]),128),retired.state);
});

test('domain replay retains every command until the application explicitly seals a complete 128-command segment',()=>{
 const route=fixture.long,state=replayV10(route.seed,route.difficulty,route.commands);
 assert.equal(state.commandBaseIndex,0);assert.deepEqual(state.commands,route.commands);assert.ok(state.commands.length>129);
 const compacted=compactCommandTailV10(state,128);assert.equal(compacted.commandBaseIndex,128);assert.deepEqual(compacted.commands,route.commands.slice(128));
 assert.equal(checksumV10(compacted),checksumV10(state));
 for(const boundary of [-128,1,127,129,256,0.5])assert.throws(()=>compactCommandTailV10(state,boundary),/历史|封段|边界|index/i);
 assert.deepEqual(compactCommandTailV10(compacted,128),compacted);
 assert.throws(()=>compactCommandTailV10(compacted,0),/历史|封段|边界|index/i);
});
