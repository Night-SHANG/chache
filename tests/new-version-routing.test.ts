import test from 'node:test';import assert from 'node:assert/strict';
import {createRun,applyCommand,findLegalMoves,previewPlacement} from '../src/domain/engine.ts';import {checksum,replayWithTrace} from '../src/domain/replay.ts';import {orderStatus} from '../src/domain/board.ts';
import type {RunState,OutboundDifficulty} from '../src/domain/types.ts';
const outbound=(id:string)=>createRun(29,'color_exit',6,id as OutboundDifficulty);
test('v6 root create/preview/route/apply/replay dispatch by explicit dimensions and difficulty',()=>{
 for(const difficulty of ['easy','normal','hard','expert']){let s=outbound(difficulty);assert.equal(s.board.length,81);const trace=[];for(let n=0;n<8&&s.phase==='input';n++){const move=findLegalMoves(s)[0],preview=previewPlacement(s,move.pieceId,move.origin);assert.equal(preview.valid,true);const next=applyCommand(s,{type:'place',...move});assert.equal(next.error,undefined);s=next.state;trace.push({commandIndex:s.commandIndex,checksum:checksum(s)});for(const o of s.orders)assert.ok(orderStatus(s,o));}const replay=replayWithTrace(s.seed,s.commands,s.mode,6,difficulty as OutboundDifficulty);assert.deepEqual(replay.trace,trace);assert.equal(checksum(replay.state),checksum(s));}
});
test('new difficulty and size fields cannot leak into frozen rules or each other',()=>{
 assert.throws(()=>createRun(1,'color_exit',6),/难度|difficulty|规则/);assert.throws(()=>createRun(1,'color_exit',6,'entry' as never),/难度|difficulty|规则/);
 for(const version of [1,2,3,4,5]){const s=createRun(1,version<4?'standard':'color_exit',version,version===5?'entry':undefined);for(const field of ['boardSize','difficultyId'])assert.throws(()=>checksum({...s,[field]:undefined}),/旧|身份|版本|尺寸/);}
 const s=outbound('easy');assert.throws(()=>checksum({...s,boardSize:7} as unknown as RunState),/尺寸|身份|版本/);assert.throws(()=>checksum({...s,colorTier:'entry'}),/档|身份|版本/);assert.throws(()=>checksum({...s,runConfigId:'run.outbound9_v6.hard'}),/难度|身份|配置/);
});
test('direct endless root route is explicit v7 and an explicit retirement replays deterministically',()=>{
 const s=createRun(9,'endless' as RunState['mode'],7);assert.equal(s.board.length,49);assert.equal(s.shift,1);assert.equal(s.mode,'endless');let state=s;for(let n=0;n<5&&state.phase!=='result';n++){const command=state.phase==='upgrade'?{type:'upgrade' as const,upgradeId:state.upgradeChoices[0]}:{type:'place' as const,...findLegalMoves(state)[0]};state=applyCommand(state,command).state;}if(state.phase==='input')state=applyCommand(state,{type:'finishEndless'}).state;const copy=replayWithTrace(9,state.commands,'endless' as RunState['mode'],7);assert.equal(checksum(copy.state),checksum(state));assert.throws(()=>createRun(1,'endless' as RunState['mode'],3),/模式|版本/);assert.throws(()=>createRun(1,'standard',7),/模式|版本/);
});
test('v7 public domain routes reject malformed fixed-grid and growth identity before hashing or applying',()=>{
 const base=createRun(1,'endless',7);for(const patch of [{board:Array(81).fill(null),cellTraits:Array(81).fill(null)},{board:Array(48).fill(null)},{overtime:true},{tutorialStep:0}]){const bad={...base,...patch};assert.throws(()=>checksum(bad),/身份|尺寸|无限/);assert.throws(()=>findLegalMoves(bad),/身份|尺寸|无限/);assert.throws(()=>applyCommand(bad,{type:'place',pieceId:bad.candidates[0].id,origin:{x:0,y:0}}),/身份|尺寸|无限/);}
});
