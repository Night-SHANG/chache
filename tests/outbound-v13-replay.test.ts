import test from 'node:test';
import assert from 'node:assert/strict';
import type {CargoId} from '../src/domain/types.ts';
import {drawPieceRollsV6,generatePieceV6} from '../src/domain/v6/engine.ts';
import {createRunV12,applyCommandV12,findLegalMovesV12} from '../src/domain/v12/engine.ts';
import {createRunV13,applyCommandV13,findLegalMovesV13,previewPlacementV13} from '../src/domain/v13/engine.ts';
import {checksumV12,replayV12,compactCommandTailV12} from '../src/domain/v12/replay.ts';
import {checksumV13,replayV13,compactCommandTailV13} from '../src/domain/v13/replay.ts';
import type {OutboundToolRunV13,OutboundToolCommandV13} from '../src/domain/v13/types.ts';

const F:CargoId='cargo.food',C:CargoId='cargo.chem',M:CargoId='cargo.machine';
function prepared(completedOrders:number):OutboundToolRunV13 {
 const state=createRunV13(17,'easy',{rotate:0,clear:1,wildcard:0});state.completedOrders=completedOrders;state.shift=Math.min(5,Math.floor(completedOrders/6)+1);
 state.candidates=[F,C,M].map((cargo,index)=>({id:`fixture.${index}`,shapeId:'shape.single',quarterTurns:0,cargo}));return state;
}
test('v13 full crossing-thirty shipment chain remains input, capped at stage five, with exactly six refill draws',()=>{
 for(const count of [1,2,3])for(const slot of [0,1,2]){
  const state=prepared(29);for(const i of [4,13,22,31])state.board[i]=F;
  if(count>=2)for(const i of [44,43,42,41])state.board[i]=C;if(count>=3)for(const i of [36,37,38,39])state.board[i]=M;
  const result=applyCommandV13(state,{type:'place',pieceId:state.candidates[slot].id,origin:{x:0,y:0}});
  assert.equal(result.error,undefined);assert.equal(result.state.completedOrders,29+count);assert.equal(result.state.phase,'input');assert.equal(result.state.shift,5);
  assert.equal(result.events.filter(event=>event.type==='shipment').length,count);assert.equal(result.state.candidates.length,3);
  assert.deepEqual(result.state.rngState,drawPieceRollsV6(state.rngState).rngState);assert.equal(result.state.generatedPieces,state.generatedPieces+1);
  const candidates=result.state.candidates.filter((_,i)=>i!==slot),expected=generatePieceV6({...result.state,candidates,phase:'input',commands:[],rngState:state.rngState,nextId:state.nextId});
  assert.deepEqual(result.state.candidates[slot],{...expected.piece,quarterTurns:0});
  for(let i=0;i<3;i++)if(i!==slot)assert.deepEqual(result.state.candidates[i],state.candidates[i]);
 }
});

test('v13 clear ships immediately past thirty without refilling and retirement works from input or rescue once',()=>{
 for(const phase of ['input','rescue'] as const){
  const state=prepared(600);state.phase=phase;state.board[67]=M;for(const i of [4,13,22,31])state.board[i]=F;
  const result=applyCommandV13(state,{type:'clear',cells:[67]});assert.equal(result.error,undefined);assert.equal(result.state.completedOrders,601);assert.equal(result.state.phase,'input');
  assert.equal(result.state.shift,5);assert.deepEqual(result.state.candidates,state.candidates);assert.deepEqual(result.state.rngState,state.rngState);
  const retired=applyCommandV13({...result.state,phase},{type:'finishOutboundEndless'});assert.equal(retired.state.result,'won');assert.equal(retired.state.endReason,'retired');
  assert.deepEqual(retired.events,[{type:'result',result:'won',endReason:'retired'}]);assert.deepEqual(retired.state.rngState,state.rngState);
  assert.ok(applyCommandV13(retired.state,{type:'finishOutboundEndless'}).error);assert.equal(previewPlacementV13(retired.state,retired.state.candidates[0].id,{x:0,y:0}).valid,false);
 }
 const normal=createRunV12(1,'normal');assert.ok(applyCommandV12(normal,{type:'finishOutboundEndless'} as never).error);
});

test('new checksums include charges, used tools and colored rotation but exclude application metadata and history storage',()=>{
 const run=createRunV12(17,'normal',{rotate:1,clear:1,wildcard:0}),checksum=checksumV12(run);
 assert.notEqual(checksumV12({...run,toolCharges:{rotate:0,clear:1,wildcard:0}}),checksum);
 assert.notEqual(checksumV12({...run,usedToolIds:['rotate']}),checksum);
 assert.notEqual(checksumV12({...run,candidates:run.candidates.map((p,i)=>({...p,quarterTurns:i===0?1:p.quarterTurns}))}),checksum);
 assert.equal(checksumV12({...run,runSerial:7,elapsedMs:999,maxOccupancy:50}),checksum);
 const command={type:'rotate',pieceId:'a',quarterTurns:1} as const;
 const long={...run,commandIndex:128,commands:Array.from({length:128},()=>command)},compact=compactCommandTailV12(long,128);
 assert.equal(compact.commands.length,0);assert.equal(compact.commandBaseIndex,128);assert.equal(checksumV12(compact),checksumV12(long));
 for(const index of [-1,1,127,129,256])assert.throws(()=>compactCommandTailV12(long,index));
 const infinite=createRunV13(17,'normal',{rotate:1,clear:1,wildcard:0});assert.notEqual(checksumV13(infinite),checksum);
 const long13={...infinite,commandIndex:128,commands:Array.from({length:128},()=>command)};
 assert.equal(checksumV13(compactCommandTailV13(long13,128)),checksumV13(long13));
});

test('v12 and v13 replay valid tool and placement prefixes reproducibly under their independent identities',()=>{
 const charges={rotate:0,clear:1,wildcard:1} as const;
 for(const version of [12,13] as const){
  let run:ReturnType<typeof createRunV12>|OutboundToolRunV13=version===12?createRunV12(17,'hard',charges):createRunV13(17,'hard',charges);
  const commands:OutboundToolCommandV13[]=[];
  const wildcard:Extract<OutboundToolCommandV13,{type:'wildcard'}>={type:'wildcard',pieceId:run.candidates[0].id,cargo:C};
  const initial=version===12?applyCommandV12(run as ReturnType<typeof createRunV12>,wildcard):applyCommandV13(run as OutboundToolRunV13,wildcard);
  assert.equal(initial.error,undefined);run=initial.state;commands.push(wildcard);
  for(let index=0;index<12&&run.phase==='input';index++){
   const move=version===12?findLegalMovesV12(run as ReturnType<typeof createRunV12>)[0]:findLegalMovesV13(run as OutboundToolRunV13)[0];
   const command={type:'place',...move} as const,result=version===12?applyCommandV12(run as ReturnType<typeof createRunV12>,command):applyCommandV13(run as OutboundToolRunV13,command);
   assert.equal(result.error,undefined);commands.push(command);run=result.state;
  }
  const replayed=version===12?replayV12(17,'hard',commands as Parameters<typeof replayV12>[2],charges):replayV13(17,'hard',commands,charges);
  assert.deepEqual(replayed,run);
 }
 assert.throws(()=>replayV12(17,'hard',[{type:'clear',cells:[0]}]),/Replay command/);
});
