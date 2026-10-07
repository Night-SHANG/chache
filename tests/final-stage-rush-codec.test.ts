import test from 'node:test';
import assert from 'node:assert/strict';
import {assertGameRun,assertGameCommandShape,encodeGameRun,decodeGameRun} from '../src/application/game-codec.ts';
import {createRunV15,applyCommandV15,previewPlacementV15} from '../src/domain/v15/engine.ts';
import {checksumV15,replayV15,compactCommandTailV15} from '../src/domain/v15/replay.ts';
import {findLegalMovesV15,reservedEntryCellsV15} from '../src/domain/v15/board.ts';
import {findRescuePlanV15} from '../src/domain/v15/tools.ts';
import type {InboundRunV15,InboundCommandV15} from '../src/domain/v15/types.ts';
import {createRunV14} from '../src/domain/v14/engine.ts';
import {checksumV14} from '../src/domain/v14/replay.ts';

test('rules15 accepts its strict save identity, and rejects unrecognized fields, tools, cargo and clocks',()=>{
 const run=applyCommandV15(createRunV15({seed:1,mode:'standard'}),{type:'chooseCleanup',branch:'orders'}).state;
 assert.doesNotThrow(()=>assertGameRun(run));assert.deepEqual(decodeGameRun(encodeGameRun(run)),run);
 assert.doesNotThrow(()=>assertGameCommandShape({type:'clear',cells:[0]},15));assert.throws(()=>assertGameCommandShape({type:'clear',cells:[3]},15));
 for(const patch of [{mode:'endless'},{runConfigId:'run.inbound_v14'},{bogus:true},{rulesetVersion:14},{boardSize:8},{levels:{...run.levels,small_parcels:1}}])assert.throws(()=>assertGameRun({...run,...patch}));
 for(const patch of [{shapeId:'shape.cross5'},{cargo:'cargo.cold'},{trait:'rush',rushTurns:2},{bogus:true}])assert.throws(()=>assertGameRun({...run,candidates:[{...run.candidates[0],...patch},...run.candidates.slice(1)]}));
 const clock=structuredClone(run);clock.successfulPlacements=1;clock.board[0]='cargo.food';clock.board[1]='cargo.food';clock.cellTraits[0]={kind:'rush',remaining:3,bornAtPlacement:1};clock.cellTraits[1]={kind:'rush',remaining:2,bornAtPlacement:1};
 assert.throws(()=>assertGameRun(clock));clock.cellTraits[1]!.remaining=3;assert.doesNotThrow(()=>assertGameRun(clock));clock.board[1]='cargo.machine';assert.throws(()=>assertGameRun(clock));
});

test('terminal save permits exactly the unconsumed pair and remaining original orders',()=>{
 const state=applyCommandV15(createRunV15({seed:1,mode:'standard'}),{type:'chooseCleanup',branch:'orders'}).state;
 state.shift=5;state.completedOrders=29;state.candidates[0]={id:state.candidates[0].id,shapeId:'shape.single',cargo:'cargo.food',quarterTurns:0};
 state.orders=[{id:'final',dockId:'dock.north',cargo:'cargo.food',amount:3,baseScore:200}];for(const cell of [8,9,10])state.board[cell]='cargo.food';
 const won=applyCommandV15(state,{type:'place',pieceId:state.candidates[0].id,origin:{x:6,y:6}}).state;
 assert.equal(won.result,'won');assert.equal(won.candidates.length,2);assert.equal(won.orders.length,0);assert.doesNotThrow(()=>assertGameRun(won));
 assert.deepEqual(decodeGameRun(encodeGameRun(won)),won);
 assert.throws(()=>assertGameRun({...won,candidates:[...won.candidates,state.candidates[0]]}));assert.throws(()=>assertGameRun({...won,phase:'input',result:null,endReason:null}));
 const overtime=applyCommandV15(won,{type:'continueOvertime'}).state;assert.doesNotThrow(()=>assertGameRun(overtime));assert.equal(overtime.orders.length,4);assert.equal(overtime.candidates.length,3);
 // This seeded continuation generates a wildcard, proving final-stage override ended before the refill.
 assert.equal(overtime.candidates[2].trait,'wildcard');
});

test('production seeded streams replay exactly through clone, preview, save and restore',()=>{
 for(const mode of ['standard','daily'] as const)for(const seed of [1,17,2026]){
  const options={seed,mode};let state=createRunV15(options);const commands:InboundCommandV15[]=[],checksums:string[]=[];
  const accept=(command:InboundCommandV15)=>{const result=applyCommandV15(state,command);assert.equal(result.error,undefined);state=result.state;commands.push(command);checksums.push(checksumV15(state));assert.doesNotThrow(()=>assertGameRun(state));};
  accept({type:'chooseCleanup',branch:'placements'});
  for(let index=0;index<40&&state.result===null;index++){
   if(state.phase==='rescue'){const plan=findRescuePlanV15(state);assert.ok(plan);for(const command of plan)accept(command);}
   if(state.phase!=='input')break;
   const move=findLegalMovesV15(state)[0],snapshot=structuredClone(state),preview=previewPlacementV15(state,move.pieceId,move.origin),restored=decodeGameRun(encodeGameRun(state)) as InboundRunV15;
   assert.deepEqual(state,snapshot);accept({type:'place',...move});assert.equal(checksumV15(preview.stateAfter!),checksumV15(state));assert.equal(checksumV15(applyCommandV15(restored,{type:'place',...move}).state),checksumV15(state));
   assert.ok(reservedEntryCellsV15(state).every(cell=>state.board[cell]===null));
  }
  assert.deepEqual(replayV15(options,commands).trace.map(item=>item.checksum),checksums);assert.equal(checksumV15(replayV15(options,commands).state),checksumV15(state));
 }
});

test('rules15 checksum binds new identity but excludes metadata and compacted history representation',()=>{
 const run=createRunV15({seed:17,mode:'standard'});assert.notEqual(checksumV15(run),checksumV14(createRunV14({seed:17,mode:'standard'})));
 const full={...run,commandIndex:128,commands:Array.from({length:128},()=>({type:'chooseCleanup' as const,branch:'orders' as const}))};
 assert.equal(checksumV15(compactCommandTailV15(full,128)),checksumV15(full));assert.equal(checksumV15({...run,elapsedMs:1000,maxOccupancy:40,runSerial:42}),checksumV15(run));
});
