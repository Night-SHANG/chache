import test from 'node:test';
import assert from 'node:assert/strict';
import * as fixed from '../src/domain/v20/engine.ts';
import {checksumV20} from '../src/domain/v20/replay.ts';
import * as playable from '../src/domain/playable.ts';
import {assertGameRun,assertGameCommandShape,encodeGameRun,decodeGameRun} from '../src/application/game-codec.ts';
import type {RushRunV21,StartRushV21} from '../src/domain/v21/types.ts';
const loaded=await import('../src/domain/v21/engine.ts').catch(()=>null);
const replay=await import('../src/domain/v21/replay.ts').catch(()=>null);
function api(){assert.ok(loaded,'Base-only rush rules21 adapter must exist');return loaded;}
const charges={rotate:1,clear:0,wildcard:1} as const;
const options={seed:17,mode:'rush' as const,toolCharges:charges};
function start(){return api().createRunV21(options);}
// Mutation target: v21 reuses the old economic identity or changes any gameplay field.
test('rules21 owns a strict base-reward identity with byte-equivalent fixed20 gameplay',()=>{
 const state=start(),previous=fixed.createRunV20(options);
 assert.equal(state.rulesetVersion,21);assert.equal(state.runConfigId,'run.rush_v21.base');
 assert.deepEqual(api().asV20(state),previous);assert.deepEqual(api().fromV20(previous),state);
 for(const patch of [{rulesetVersion:20},{runConfigId:'run.rush_v20.fixed'},{inboundDifficulty:'hard'},{mode:'daily'},{rawScore:1},{score:1},{guided:true},{overtime:true},{date:'2026-10-08'},{challengeDay:'2026-10-08'},{toolCharges:{rotate:1,clear:1,wildcard:1}}])assert.throws(()=>api().asV20({...state,...patch} as never));
 assert.throws(()=>api().fromV20(state as never));
 for(const patch of [{inboundDifficulty:'expert'},{mode:'daily'},{guided:true},{date:'2026-10-08'},{toolCharges:{rotate:1,clear:1,wildcard:1}},{seed:1.5}])assert.throws(()=>api().createRunV21({...options,...patch} as StartRushV21));
});
// Mutation target: dispatch drops cleanup, tools, reserved entries, preview or raw-score behavior.
test('rules21 playable commands previews tools and legal moves match fixed20 without mutations',()=>{
 let state=playable.createPlayableRun({family:'inbound',rulesetVersion:21,guided:false,...options}),old=fixed.createRunV20(options);
 assert.ok(playable.isInboundRun(state));assert.ok(playable.isTieredInbound(state));assert.equal(playable.reservedEntryCells(state).length,4);
 const commands:playable.GameCommand[]=[{type:'chooseCleanup',branch:'orders'}];
 for(let index=0;index<18&&state.result===null;index++){
  const command:playable.GameCommand=index===0?commands[0]:index===1?{type:'wildcard' as const,pieceId:state.candidates[0].id}:{type:'place' as const,...playable.findPlayableMoves(state)[0]};
  const before:playable.GameRun=structuredClone(state),next=playable.applyPlayableCommand(state,command),expected=fixed.applyCommandV20(old,command as never);
  if(command.type==='place')assert.deepEqual(playable.previewPlayablePlacement(state,command.pieceId,command.origin).stateAfter,next.state);
  assert.equal(next.error,undefined);assert.deepEqual(next.events,expected.events);assert.deepEqual(state,before);assert.deepEqual(api().asV20(next.state as RushRunV21),expected.state);
  state=next.state;old=expected.state;assert.deepEqual(playable.findPlayableMoves(state),fixed.findLegalMovesV20(old));assert.equal(state.score,(state as RushRunV21).rawScore);
 }
 assert.ok(state.commandIndex>=6);const invalid=playable.applyPlayableCommand(state,{type:'continueOvertime'});assert.ok(invalid.error);assert.equal(invalid.state,state);
});
// Mutation target: saves permit old identity/config, dates, unsafe scores or command variants.
test('rules21 codec enforces strict identity score timing tools and history shape',()=>{
 for(const state of [start(),api().applyCommandV21(start(),{type:'chooseCleanup',branch:'placements'}).state]){
  assert.deepEqual(decodeGameRun(encodeGameRun(state)),state);
  for(const patch of [{rulesetVersion:'21'},{runConfigId:'run.rush_v20.fixed'},{mode:'daily'},{inboundDifficulty:'hard'},{score:1},{rawScore:'0'},{date:'2026-10-08'},{challengeDay:'2026-10-08'},{toolCharges:{rotate:1,clear:1,wildcard:1}},{elapsedMs:-1},{usedToolIds:['rotate','rotate']}])assert.throws(()=>assertGameRun({...state,...patch}));
 }
 assert.doesNotThrow(()=>assertGameCommandShape({type:'clear',cells:[8]},21));assert.throws(()=>assertGameCommandShape({type:'continueOvertime'},21));
});
// Mutation target: v21 replay hashes collide with v20 or compaction changes canonical state.
test('rules21 replay and compact tails retain distinct identity and checksum',()=>{
 assert.ok(replay,'Base-only rush replay must exist');let state=start();const commands:playable.GameCommand[]=[];
 for(let index=0;index<10&&state.result===null;index++){
  const command=index===0?{type:'chooseCleanup' as const,branch:'orders' as const}:{type:'place' as const,...api().findLegalMovesV21(state)[0]};
  commands.push(command);state=api().applyCommandV21(state,command).state;
 }
 assert.deepEqual(replay.replayV21(options,commands as never).state,state);assert.equal(playable.playableChecksum(state),replay.checksumV21(state));assert.notEqual(replay.checksumV21(state),checksumV20(api().asV20(state)));
 assert.equal(replay.checksumV21({...state,elapsedMs:100,runSerial:9,maxOccupancy:45}),replay.checksumV21(state));
 state={...state,commandIndex:130,commandBaseIndex:0,commands:Array.from({length:130},()=>({type:'finish' as const}))};const compact=replay.compactCommandTailV21(state,128);assert.equal(compact.rulesetVersion,21);assert.equal(compact.commands.length,2);assert.equal(compact.commandBaseIndex,128);assert.equal(replay.checksumV21(compact),replay.checksumV21(state));assert.throws(()=>replay.compactCommandTailV21(state,1));
});
// Mutation target: wrapper loses rescue recovery or accepts tools once game has ended.
test('rules21 settlement and finite rescue plans exactly preserve frozen20 behavior',()=>{
 const state=api().applyCommandV21(start(),{type:'chooseCleanup',branch:'orders'}).state;state.toolCharges={rotate:0,clear:1,wildcard:0};state.candidates=state.candidates.map((piece,index)=>({...piece,id:`rescue.${index}`,shapeId:'shape.single'}));state.orders=[];const entries=playable.reservedEntryCells(state);state.board=state.board.map((_,cell)=>entries.includes(cell)?null:'cargo.food');state.cellTraits=state.board.map(cell=>cell===null?null:{kind:'waste'});
 const before=structuredClone(state),plan=api().findRescuePlanV21(state),settled=api().settlePhaseV21(state);assert.ok(plan?.length);assert.deepEqual(plan,fixed.findRescuePlanV20(api().asV20(state)));assert.equal(settled.phase,'rescue');assert.deepEqual(api().asV20(settled),fixed.settlePhaseV20(api().asV20(state)));assert.deepEqual(state,before);
 const rescued=api().applyCommandV21(settled,plan[0]);assert.equal(rescued.error,undefined);assert.ok(api().findLegalMovesV21(rescued.state).length);
});
