import test from 'node:test';
import assert from 'node:assert/strict';
import {assertGameRun,assertGameCommandShape,encodeGameRun,decodeGameRun} from '../src/application/game-codec.ts';
import {createRunV16,applyCommandV16,previewPlacementV16} from '../src/domain/v16/engine.ts';
import {checksumV16,replayV16,compactCommandTailV16} from '../src/domain/v16/replay.ts';
import {findLegalMovesV16,pieceCellsV16,reservedEntryCellsV16} from '../src/domain/v16/board.ts';
import {findRescuePlanV16} from '../src/domain/v16/tools.ts';
import {createPlayableRun,applyPlayableCommand,playableChecksum,findPlayableMoves,previewPlayablePlacement,isInboundV16,isInboundRun,reservedEntryCells} from '../src/domain/playable.ts';
import type {InboundRunV16,InboundCommandV16} from '../src/domain/v16/types.ts';

const start=(mode:InboundRunV16['mode']='standard')=>createRunV16({seed:17,mode});
const active=(mode:InboundRunV16['mode']='standard')=>mode==='daily'?applyCommandV16(start(mode),{type:'chooseCleanup',branch:'orders'}).state:start(mode);
function rejects(state:InboundRunV16,mutate:(value:InboundRunV16)=>void){const copy=structuredClone(state);mutate(copy);assert.throws(()=>assertGameRun(copy));assert.throws(()=>encodeGameRun(copy));}

// Real seed2026 route-policy placements, recorded as tray slot/x/y. No state injection.
const LONG_RUN_MOVES='011 113 111 213 221 232 234 043 041 041 053 045 225 015 011 122 011 212 111 133 111 131 100 111 230 101 111 002 011 141 150 034 003 111 131 110 121 041 242 212 111 113 211 131 121 211 213 214 113 132 110 025 021 233 254 111 100 211 113 100 211 041 111 220 011 133 141 101 111 013 021 033 000 010 031 044 012 111 132 112 011 010 042 023 022 002 013 034 245 034 253 212 214 233 213 033 012 211 224 114 124 234 252 131 032 124 122 025 031 233 153 114 144 064 056 000 166 121 134 011 220 231 235 242 011 141 023 104 243 021'.split(' ').map(text=>text.split('').map(Number));

test('v16 save identity round trips all modes, guided standard and daily before and after cleanup',()=>{
 for(const mode of ['standard','daily','endless'] as const)for(const guided of mode==='standard'?[false,true]:[false]){
  let state=createRunV16({seed:17,mode,guided});assert.doesNotThrow(()=>assertGameRun(state));assert.deepEqual(decodeGameRun(encodeGameRun(state)),state);
  if(state.phase==='cleanup')state=applyCommandV16(state,{type:'chooseCleanup',branch:'placements'}).state;
  assert.deepEqual(decodeGameRun(encodeGameRun(state)),state);
  const move=findLegalMovesV16(state)[0];state=applyCommandV16(state,{type:'place',...move}).state;assert.deepEqual(decodeGameRun(encodeGameRun(state)),state);
  assert.equal(JSON.parse(encodeGameRun(state)).schemaVersion,16);
 }
});

test('v16 ordinary and endless reject rush, waste, cleanup states and cleanup command history',()=>{
 for(const mode of ['standard','endless'] as const){
  const state=start(mode);assert.doesNotThrow(()=>assertGameRun(state));
  rejects(state,s=>{s.candidates[0]={...s.candidates[0],trait:'rush',rushTurns:3};});
  rejects(state,s=>{s.board[0]='cargo.food';s.cellTraits[0]={kind:'waste'};});
  rejects(state,s=>{s.board[0]='cargo.food';s.cellTraits[0]={kind:'rush',remaining:3,bornAtPlacement:1};s.successfulPlacements=1;s.commandIndex=1;s.commands=[{type:'place',pieceId:s.candidates[0].id,origin:{x:0,y:0}}];});
  rejects(state,s=>{s.cleanup={branch:'orders',progress:0};});rejects(state,s=>{s.phase='cleanup';});
  rejects(state,s=>{s.commands=[{type:'chooseCleanup',branch:'placements'}];s.commandIndex=1;});
  rejects(state,s=>{s.commands=[{type:'chooseCleanup',branch:'orders'}];s.commandBaseIndex=128;s.commandIndex=129;});
 }
});

test('pending daily cleanup is the pristine seeded opening with no candidates, progress or clocks',()=>{
 const state=start('daily');assert.doesNotThrow(()=>assertGameRun(state));
 rejects(state,s=>{s.candidates=start().candidates;});rejects(state,s=>{s.generatedPieces=1;});rejects(state,s=>{s.successfulPlacements=1;});
 rejects(state,s=>{s.board[0]='cargo.food';});rejects(state,s=>{s.board[0]='cargo.food';s.cellTraits[0]={kind:'waste'};});
 rejects(state,s=>{s.score=1;});rejects(state,s=>{s.nextId++;});rejects(state,s=>{s.rngState[0]++;});
 rejects(state,s=>{s.orders[0].amount=s.orders[0].amount===3?4:3;});rejects(state,s=>{s.commandIndex=128;s.commandBaseIndex=128;});
 rejects(state,s=>{s.guided=true;});rejects(state,s=>{s.overtime=true;});rejects(state,s=>{s.phase='input';});
 const chosen=active('daily');assert.doesNotThrow(()=>assertGameRun(chosen));
 rejects(chosen,s=>{s.phase='cleanup';});rejects(chosen,s=>{s.cleanup=null;});
 rejects(chosen,s=>{s.commands[0]={type:'finish'};});rejects(chosen,s=>{s.commands.push({type:'chooseCleanup',branch:'orders'});s.commandIndex++;});
});

test('v16 codec protects fields, entry cells, tool budgets and command windows without weakening old shapes',()=>{
 const state=start();assert.doesNotThrow(()=>assertGameRun(state));
 for(const patch of [{runConfigId:'run.inbound_v15'},{rulesetVersion:15},{bogus:true},{boardSize:8},{guided:'false'},{mode:'tutorial'},{levels:{...state.levels,small_parcels:1}},{overtime:true}])assert.throws(()=>assertGameRun({...state,...patch}));
 for(const patch of [{shapeId:'shape.cross5'},{cargo:'cargo.cold'},{bogus:true},{trait:'pallet',shapeId:'shape.domino_h'}])assert.throws(()=>assertGameRun({...state,candidates:[{...state.candidates[0],...patch},...state.candidates.slice(1)]}));
 for(const cell of reservedEntryCellsV16(state))rejects(state,s=>{s.board[cell]='cargo.food';});
 rejects(state,s=>{s.toolCharges={rotate:1,clear:1,wildcard:1};});rejects(state,s=>{s.commandBaseIndex=1;s.commandIndex=1;});rejects(state,s=>{s.commandIndex=1;});
 rejects(state,s=>{s.usedToolIds=['clear'];s.toolCharges.clear=1;});
 assert.doesNotThrow(()=>assertGameCommandShape({type:'clear',cells:[0]},16));assert.throws(()=>assertGameCommandShape({type:'clear',cells:[3]},16));
 assert.doesNotThrow(()=>assertGameCommandShape({type:'chooseCleanup',branch:'orders'},16));assert.throws(()=>assertGameCommandShape({type:'upgrade',upgradeId:'small_parcels'},16));
 const encoded=encodeGameRun(state),tampered=JSON.parse(encoded);tampered.state.score++;assert.throws(()=>decodeGameRun(JSON.stringify(tampered)),/校验/);
 const wrongVersion=JSON.parse(encoded);wrongVersion.schemaVersion=15;assert.throws(()=>decodeGameRun(JSON.stringify(wrongVersion)),/版本/);
 assert.throws(()=>decodeGameRun(JSON.stringify({...JSON.parse(encoded),extra:true})));assert.throws(()=>decodeGameRun(JSON.stringify({...JSON.parse(encoded),schemaVersion:17})));
});

test('real generated production streams preserve preview, save, replay, bridge and four empty entries',()=>{
 for(const mode of ['standard','daily','endless'] as const)for(const seed of [1,17,2026]){
  const options={seed,mode};let state=createRunV16(options);const commands:InboundCommandV16[]=[],checksums:string[]=[];
  const accept=(command:InboundCommandV16)=>{const result=applyCommandV16(state,command);assert.equal(result.error,undefined);state=result.state;commands.push(command);checksums.push(checksumV16(state));assert.doesNotThrow(()=>assertGameRun(state));};
  assert.doesNotThrow(()=>assertGameRun(state));if(state.phase==='cleanup')accept({type:'chooseCleanup',branch:'placements'});
  for(let index=0;index<40&&state.result===null;index++){
   if(state.phase==='rescue'){const plan=findRescuePlanV16(state);assert.ok(plan);for(const command of plan)accept(command);}
   if(state.phase!=='input')break;
   const move=findPlayableMoves(state)[0],before=structuredClone(state),preview=previewPlayablePlacement(state,move.pieceId,move.origin),restored=decodeGameRun(encodeGameRun(state));
   assert.equal(preview.valid,true);assert.deepEqual(state,before);accept({type:'place',...move});assert.equal(playableChecksum(preview.stateAfter!),checksumV16(state));assert.equal(playableChecksum(applyPlayableCommand(restored,{type:'place',...move}).state),checksumV16(state));
   assert.deepEqual(reservedEntryCells(state),reservedEntryCellsV16(state));assert.ok(reservedEntryCellsV16(state).every(cell=>state.board[cell]===null));
  }
  assert.deepEqual(replayV16(options,commands).trace.map(item=>item.checksum),checksums);assert.equal(checksumV16(replayV16(options,commands).state),checksumV16(state));
  const bridged=createPlayableRun({family:'inbound',rulesetVersion:16,seed,mode,guided:false,toolCharges:{rotate:0,clear:0,wildcard:0}});assert.ok(isInboundV16(bridged)&&isInboundRun(bridged));assert.deepEqual(bridged,createRunV16(options));
 }
});

test('natural daily multi-cell rush can be saved and replayed without changing clocks or waiting cargo',()=>{
 let ready:InboundRunV16|undefined;
 for(let seed=1;seed<=300;seed++){
  const next=applyCommandV16(createRunV16({seed:seed*104729,mode:'daily'}),{type:'chooseCleanup',branch:'placements'}).state;
  if(next.candidates.some(piece=>piece.trait==='rush'&&pieceCellsV16(piece).length>1)){ready=next;break;}
 }
 assert.ok(ready);assert.doesNotThrow(()=>assertGameRun(ready));const rush=ready.candidates.find(piece=>piece.trait==='rush'&&pieceCellsV16(piece).length>1)!;
 const move=findLegalMovesV16(ready).find(move=>move.pieceId===rush.id)!;
 const result=applyCommandV16(ready,{type:'place',...move});assert.equal(result.error,undefined);assert.doesNotThrow(()=>assertGameRun(result.state));assert.deepEqual(decodeGameRun(encodeGameRun(result.state)),result.state);
 assert.equal(checksumV16(previewPlacementV16(ready,move.pieceId,move.origin).stateAfter!),checksumV16(result.state));
 assert.equal(checksumV16(replayV16({seed:ready.seed,mode:'daily'},[{type:'chooseCleanup',branch:'placements'},{type:'place',...move}]).state),checksumV16(result.state));
 const occupied=result.state.cellTraits.map((trait,index)=>trait?.kind==='rush'?index:-1).filter(index=>index>=0);assert.ok(occupied.length>1);
 rejects(result.state,s=>{s.cellTraits[occupied[1]]!.remaining=2;});
});

test('v16 replay rejects cleanup outside daily and rejects commands before the daily choice',()=>{
 for(const mode of ['standard','endless'] as const)assert.throws(()=>replayV16({seed:17,mode},[{type:'chooseCleanup',branch:'orders'}]),/Replay command 1/);
 assert.throws(()=>replayV16({seed:17,mode:'daily'},[{type:'place',pieceId:'piece.3',origin:{x:0,y:0}}]),/Replay command 1/);
 const state=start();assert.equal(checksumV16({...state,elapsedMs:1000,maxOccupancy:30,runSerial:42}),checksumV16(state));
 assert.throws(()=>compactCommandTailV16(state,1));assert.throws(()=>compactCommandTailV16(state,128));assert.deepEqual(compactCommandTailV16(state,0),state);
});

test('130 real endless commands round trip a 128-command window and replay to the same checksum',()=>{
 let full=createRunV16({seed:2026,mode:'endless'}),window=full;const commands:InboundCommandV16[]=[];
 for(const [slot,x,y] of LONG_RUN_MOVES){
  const command:InboundCommandV16={type:'place',pieceId:full.candidates[slot].id,origin:{x,y}},result=applyCommandV16(full,command);assert.equal(result.error,undefined);full=result.state;commands.push(command);
  const restored=decodeGameRun(encodeGameRun(window)) as InboundRunV16;window=applyCommandV16(restored,command).state;
  if(window.commandIndex===128){window=compactCommandTailV16(window,128);assert.equal(window.commands.length,0);assert.equal(window.commandBaseIndex,128);}
  assert.equal(checksumV16(window),checksumV16(full));
 }
 assert.equal(full.commandIndex,130);assert.equal(full.completedOrders,53);assert.equal(full.result,null);assert.equal(full.cleanup,null);assert.equal(window.commands.length,2);
 assert.deepEqual(decodeGameRun(encodeGameRun(window)),window);assert.equal(checksumV16(replayV16({seed:2026,mode:'endless'},commands).state),checksumV16(full));
 rejects(window,s=>{s.commandBaseIndex=0;});rejects(window,s=>{s.commands.push({type:'chooseCleanup',branch:'orders'});s.commandIndex++;});
});

test('a naturally completed standard run saves the unconsumed pair and resumes rush-free overtime',()=>{
 let state=createRunV16({seed:2026,mode:'standard'});
 for(const [slot,x,y] of LONG_RUN_MOVES){
  if(state.result!==null)break;
  const result=applyCommandV16(state,{type:'place',pieceId:state.candidates[slot].id,origin:{x,y}});assert.equal(result.error,undefined);state=result.state;
 }
 assert.equal(state.result,'won');assert.equal(state.endReason,'completed');assert.ok(state.completedOrders>=30);assert.equal(state.candidates.length,2);assert.ok(state.orders.length<4);assert.equal(state.cleanup,null);
 assert.deepEqual(decodeGameRun(encodeGameRun(state)),state);
 rejects(state,s=>{s.phase='input';s.result=null;s.endReason=null;});rejects(state,s=>{s.candidates.push({...s.candidates[0],id:'invalid.extra'});});
 const continued=applyCommandV16(state,{type:'continueOvertime'});assert.equal(continued.error,undefined);assert.equal(continued.state.overtime,true);assert.equal(continued.state.phase,'input');assert.equal(continued.state.candidates.length,3);assert.equal(continued.state.orders.length,4);assert.equal(continued.state.cleanup,null);
 assert.deepEqual(decodeGameRun(encodeGameRun(continued.state)),continued.state);assert.ok(continued.state.candidates.every(piece=>piece.trait!=='rush'));
 const retired=applyCommandV16(continued.state,{type:'finish'});assert.equal(retired.error,undefined);assert.equal(retired.state.result,'won');assert.equal(retired.state.endReason,'retired');assert.doesNotThrow(()=>assertGameRun(retired.state));
});
