import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import type {CargoId, Command, OutboundDifficulty, Point, RunState} from '../src/domain/types.ts';
import type {OutboundEndlessCommandV10, OutboundEndlessRunV10, OutboundShipmentV10, OutboundStepResultV10} from '../src/domain/v10/types.ts';
import {drawPieceRollsV6, generatePieceV6} from '../src/domain/v6/engine.ts';
import {orderStatusV6} from '../src/domain/v6/board.ts';
import {createRunV8, applyCommandV8, findLegalMovesV8, previewPlacementV8} from '../src/domain/v8/engine.ts';
import {createRunV10, applyCommandV10, previewPlacementV10, findLegalMovesV10} from '../src/domain/v10/engine.ts';
import {MIXED_COLOR_PERCENT_V10, RULES_V10_CONFIG, outboundRunConfigIdV10} from '../src/domain/v10/content.ts';

const F:CargoId='cargo.food', C:CargoId='cargo.chem', M:CargoId='cargo.machine';
const difficulties:OutboundDifficulty[]=['easy','normal','hard','expert'];
const shipments=(result:OutboundStepResultV10)=>result.events.filter((event):event is OutboundShipmentV10=>event.type==='shipment');
function freeze<T>(value:T):T {if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;}
function asV8(state:OutboundEndlessRunV10):RunState {
 const {commandBaseIndex:base,...rest}=state;
 assert.equal(base,0);
 return {...rest,rulesetVersion:8,runConfigId:`run.outbound9_v8.${state.difficultyId}`,commands:state.commands.filter((command):command is Extract<OutboundEndlessCommandV10,{type:'place'}>=>command.type==='place')};
}
function prepared(completedOrders=0, seed=17, difficulty:OutboundDifficulty='easy'):OutboundEndlessRunV10 {
 const state=createRunV10(seed,difficulty);state.completedOrders=completedOrders;state.shift=Math.min(5,Math.floor(completedOrders/6)+1);
 state.candidates=[{id:'fixture.food',shapeId:'shape.single',cargo:F},{id:'fixture.chem',shapeId:'shape.single',cargo:C},{id:'fixture.machine',shapeId:'shape.single',cargo:M}];
 return state;
}
function place(state:OutboundEndlessRunV10, origin:Point={x:4,y:8}, pieceId=state.candidates[0].id):OutboundStepResultV10 {return applyCommandV10(state,{type:'place',pieceId,origin});}

// Mutation targets: changing identity, RNG ranges, shape/color pools or difficulty weights.
test('v10 has an independent endless identity and the exact initial v8 supply in all four difficulties',()=>{
 assert.equal(RULES_V10_CONFIG.rulesetVersion,10);assert.equal(RULES_V10_CONFIG.boardSize,9);assert.equal(RULES_V10_CONFIG.candidateCount,3);
 assert.deepEqual(MIXED_COLOR_PERCENT_V10,{easy:20,normal:30,hard:40,expert:50});
 for(const difficulty of difficulties)for(const seed of [0,17,-83,2147483647]){
  const state=createRunV10(seed,difficulty);assert.equal(state.rulesetVersion,10);assert.equal(state.mode,'color_exit');assert.equal(state.boardSize,9);
  assert.equal(state.runConfigId,`run.outbound9_v10.${difficulty}`);assert.equal(state.runConfigId,outboundRunConfigIdV10(difficulty));
  assert.equal(state.commandIndex,0);assert.equal(state.commandBaseIndex,0);assert.deepEqual(asV8(state),createRunV8(seed,difficulty));
 }
 for(const difficulty of [undefined,null,'entry','',20])assert.throws(()=>createRunV10(1,difficulty as never),/难度|difficulty|版本/i);
});

test('same-seed v10 and ordinary v8 match every settled prefix and shipment before the winning command',()=>{
 const fixture=JSON.parse(readFileSync('tests/fixtures/outbound-v10-golden.json','utf8')) as {crossThirty:{seed:number;difficulty:OutboundDifficulty;commands:Command[];normalWinAtCommand:number}};
 const pairs=[...difficulties.map(difficulty=>({seed:17,difficulty,commands:null as Command[]|null})),fixture.crossThirty];
 let paired=0;
 for(const item of pairs){let state=createRunV10(item.seed,item.difficulty),normal=createRunV8(item.seed,item.difficulty);
  for(let index=0;index<110&&normal.phase==='input';index++){
   const moves=findLegalMovesV8(normal);assert.deepEqual(findLegalMovesV10(state),moves);
   const command:Command=item.commands?item.commands[index]:{type:'place',...moves[(index*13)%moves.length]};
   const before=JSON.stringify(state),preview=previewPlacementV10(freeze(state),command.type==='place'?command.pieceId:'',command.type==='place'?command.origin:{x:0,y:0});
   if(command.type==='place')assert.deepEqual(preview,previewPlacementV8(normal,command.pieceId,command.origin));
   const actual=applyCommandV10(state,command as OutboundEndlessCommandV10),expected=applyCommandV8(normal,command);
   assert.equal(actual.error,undefined);assert.equal(JSON.stringify(state),before);
   if(expected.state.result==='won') {assert.equal(index+1,fixture.crossThirty.normalWinAtCommand);assert.equal(actual.state.result,null);assert.equal(actual.state.candidates.length,3);break;}
   assert.deepEqual(asV8(actual.state),expected.state);assert.deepEqual(actual.events,expected.events);paired++;
   state=actual.state;normal=expected.state;
  }
 }
 assert.ok(paired>100);
});

// Mutation targets: returning at 30, stopping a chain, moving/removing an unconsumed slot or extra RNG draws.
test('crossing from 29 to 30, 31 or 32 settles every group and refills only the consumed slot with six draws',()=>{
 for(const count of [1,2,3])for(const slot of [0,1,2]){
  const state=prepared(29);for(const index of [4,13,22,31])state.board[index]=F;
  if(count>=2)for(const index of [44,43,42,41])state.board[index]=C;
  if(count>=3)for(const index of [36,37,38,39])state.board[index]=M;
  const normal=asV8(state),command:Command={type:'place',pieceId:state.candidates[slot].id,origin:{x:0,y:0}};
  const result=applyCommandV10(freeze(state),command as OutboundEndlessCommandV10),finite=applyCommandV8(normal,command);
  assert.equal(result.error,undefined);assert.equal(result.state.completedOrders,29+count);assert.equal(shipments(result).length,count);
  assert.equal(result.state.shift,5);assert.equal(result.state.phase,'input');assert.equal(result.state.result,null);assert.equal(result.state.endReason,null);
  assert.equal(result.state.candidates.length,3);assert.deepEqual(result.events,finite.events.filter(event=>event.type!=='result'));
  for(let index=0;index<3;index++)if(index!==slot)assert.deepEqual(result.state.candidates[index],state.candidates[index]);
  const expected=generatePieceV6({...finite.state,phase:'input',result:null,endReason:null});
  assert.deepEqual(result.state.candidates[slot],expected.piece);assert.deepEqual(result.state.rngState,expected.rngState);
  assert.deepEqual(result.state.rngState,drawPieceRollsV6(state.rngState).rngState);
  assert.equal(result.state.generatedPieces,state.generatedPieces+1);assert.equal(result.state.nextId,state.nextId+1);
  assert.deepEqual(result.state.board,finite.state.board);assert.equal(result.state.score,finite.state.score);
 }
});

test('after hundreds of batches stage-five supply and mixed-color probability stay exactly at the original final pool',()=>{
 for(const difficulty of difficulties){
  const late=prepared(600,17,difficulty),finite=asV8(prepared(24,17,difficulty));
  for(const index of [4,13,22]){late.board[index]=F;finite.board[index]=F;}
  const command={type:'place',pieceId:'fixture.food',origin:{x:4,y:3}} as const;
  const result=applyCommandV10(late,command),expected=applyCommandV8(finite,command);
  assert.equal(result.state.completedOrders,601);assert.equal(result.state.phase,'input');assert.equal(result.state.shift,5);
  assert.deepEqual(asV8({...result.state,completedOrders:25}),expected.state);assert.deepEqual(result.events,expected.events);
 }
});

test('an occupied south entry after 30 fails only after the six-draw refill',()=>{
 const state=freeze(prepared(31)),result=place(state);
 assert.equal(result.state.completedOrders,31);assert.equal(result.state.board[76],F);assert.equal(result.state.phase,'result');
 assert.equal(result.state.result,'failed');assert.equal(result.state.endReason,'blocked');assert.equal(result.state.candidates.length,3);
 assert.deepEqual(result.state.rngState,drawPieceRollsV6(state.rngState).rngState);
 assert.deepEqual(result.events.filter(event=>event.type==='result'),[{type:'result',result:'failed'}]);
 assert.ok(findLegalMovesV10(result.state).length>0);
});

test('an isolated empty entry after 30 remains playable and recovers when same-color cargo reaches its outlet',()=>{
 const state=prepared(31);for(const index of [13,22,31,40,49,58,67])state.board[index]=F;state.board[75]=C;state.board[77]=M;
 const geometric=asV8(state);assert.equal(orderStatusV6(geometric,state.orders[0]).reason,'exit-unconnected');
 const preview=previewPlacementV10(freeze(state),'fixture.food',{x:4,y:0}),result=place(state,{x:4,y:0});
 assert.equal(result.state.phase,'input');assert.equal(result.state.result,null);assert.equal(result.state.completedOrders,32);
 assert.deepEqual(shipments(result).map(event=>event.cells),[[4,13,22,31,40,49,58,67]]);assert.deepEqual(shipments(result)[0].path,[{x:4,y:8}]);
 assert.deepEqual(preview.shipments,shipments(result));assert.equal(result.state.board[75],C);assert.equal(result.state.board[77],M);
});

test('empty entry with no geometrically legal candidate fails, while final same-color settlement can rescue it',()=>{
 const dead=prepared(31);dead.board.fill(M);dead.board[36]=C;dead.board[76]=null;dead.board[0]=null;
 dead.candidates[1]={id:'fixture.chem',shapeId:'shape.square',cargo:C};dead.candidates[2]={id:'fixture.machine',shapeId:'shape.square',cargo:M};
 const failed=place(freeze(dead),{x:0,y:0});assert.equal(failed.state.board[76],null);assert.equal(findLegalMovesV10(failed.state).length,0);
 assert.equal(failed.state.result,'failed');assert.equal(failed.state.endReason,'blocked');
 const saved=prepared(31);saved.board.fill(C);for(const index of [4,13,22,40,49,58,67])saved.board[index]=F;saved.board[31]=null;saved.board[76]=null;
 const preview=previewPlacementV10(freeze(saved),'fixture.food',{x:4,y:3}),result=place(saved,{x:4,y:3});
 assert.equal(result.state.board[76],null);assert.equal(result.state.phase,'input');assert.ok(findLegalMovesV10(result.state).length>0);
 assert.deepEqual(shipments(result).map(event=>event.cargo),[F,C]);assert.deepEqual(preview.shipments,shipments(result));
 assert.equal(result.state.completedOrders,33);assert.equal(result.state.candidates.length,3);
});

test('invalid or unsupported commands, obsolete identities and post-result input do not mutate the run',()=>{
 const state=freeze(prepared(31)),before=JSON.stringify(state);
 const invalid=[null,{type:'place',pieceId:'missing',origin:{x:0,y:0}},{type:'place',pieceId:'fixture.food',origin:{x:-1,y:0}},
  {type:'place',pieceId:'fixture.food',origin:{x:0.5,y:0}},{type:'upgrade',upgradeId:'upgrade.pallet_pass'},{type:'finishEndless'}];
 for(const command of invalid){const result=applyCommandV10(state,command as OutboundEndlessCommandV10);assert.ok(result.error);assert.equal(result.state,state);assert.deepEqual(result.events,[]);}
 assert.equal(JSON.stringify(state),before);
 for(const patch of [{rulesetVersion:8},{runConfigId:'run.outbound9_v8.easy'},{runConfigId:'run.outbound9_v10.expert'},{mode:'endless'},{boardSize:7}]){
  assert.throws(()=>applyCommandV10({...state,...patch} as OutboundEndlessRunV10,{type:'finishOutboundEndless'}),/规则|版本|identity/i);
 }
 const ended=freeze(place(state).state);
 for(const command of [{type:'finishOutboundEndless'},{type:'place',pieceId:ended.candidates[0].id,origin:{x:0,y:0}}] as OutboundEndlessCommandV10[]){
  const result=applyCommandV10(ended,command);assert.ok(result.error);assert.equal(result.state,ended);assert.deepEqual(result.events,[]);
 }
 assert.equal(previewPlacementV10(ended,ended.candidates[0].id,{x:0,y:0}).valid,false);
});

test('finishing outbound endless records voluntary retirement once without shipment, refill or ordinary completion',()=>{
 const state=freeze(prepared(32)),before=JSON.stringify(state),result=applyCommandV10(state,{type:'finishOutboundEndless'});
 assert.equal(result.error,undefined);assert.equal(JSON.stringify(state),before);assert.equal(result.state.phase,'result');assert.equal(result.state.endReason,'retired');
 assert.equal(result.state.result,'won');assert.equal(result.state.score,state.score);assert.equal(result.state.completedOrders,32);
 assert.deepEqual(result.state.rngState,state.rngState);assert.deepEqual(result.state.candidates,state.candidates);
 assert.equal(result.state.commandIndex,1);assert.deepEqual(result.state.commands,[{type:'finishOutboundEndless'}]);
 assert.deepEqual(result.events,[{type:'result',result:'won',endReason:'retired'}]);
 const repeated=applyCommandV10(freeze(result.state),{type:'finishOutboundEndless'});assert.ok(repeated.error);assert.equal(repeated.state,result.state);
});
