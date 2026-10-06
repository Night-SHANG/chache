import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import type {CargoId,Command,CommandResult,OutboundDifficulty,Point,RunState,Shipment} from '../src/domain/types.ts';
import {nextRandom} from '../src/domain/random.ts';
import {createRunV6,applyCommandV6,findLegalMovesV6,previewPlacementV6} from '../src/domain/v6/engine.ts';
import {orderStatusV6} from '../src/domain/v6/board.ts';
import {RULES_V6_CONFIG} from '../src/domain/v6/content.ts';
import {createRunV3} from '../src/domain/v3/engine.ts';
import {createRunV7} from '../src/domain/v7/engine.ts';
import {createRunV8,applyCommandV8,findLegalMovesV8,previewPlacementV8,isIrrecoverableOutboundEntryBlocked} from '../src/domain/v8/engine.ts';
import {RULES_V8_CONFIG,MIXED_COLOR_PERCENT_V8,outboundRunConfigIdV8} from '../src/domain/v8/content.ts';

const F:CargoId='cargo.food',M:CargoId='cargo.machine',C:CargoId='cargo.chem';
const difficulties:readonly OutboundDifficulty[]=['easy','normal','hard','expert'];
const shipments=(result:CommandResult)=>result.events.filter((event):event is Shipment=>event.type==='shipment');
function freeze<T>(value:T):T {if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;}
function asV6(state:RunState):RunState {return {...state,rulesetVersion:6,runConfigId:`run.outbound9_v6.${state.difficultyId}`};}
function prepared(seed=17,difficulty:OutboundDifficulty='easy'):RunState {
 const state=createRunV8(seed,difficulty);
 state.candidates=[{id:'fixture.food',shapeId:'shape.single',cargo:F},{id:'fixture.chem',shapeId:'shape.single',cargo:C},{id:'fixture.machine',shapeId:'shape.single',cargo:M}];
 return state;
}
function place(state:RunState,origin:Point={x:4,y:8},pieceId=state.candidates[0].id):CommandResult {return applyCommandV8(state,{type:'place',pieceId,origin});}
function status(state:RunState,cargo:CargoId){return orderStatusV6(state,state.orders.find(order=>order.cargo===cargo)!);}

// Mutation targets: identity isolation or any supply/RNG/config drift from frozen v6.
test('v8 changes only explicit run identity while retaining four difficulties and exact v6 initial supply',()=>{
 assert.deepEqual(RULES_V8_CONFIG,{...RULES_V6_CONFIG,rulesetVersion:8,runConfigId:'run.outbound9_v8'});
 assert.deepEqual(MIXED_COLOR_PERCENT_V8,{easy:20,normal:30,hard:40,expert:50});
 for(const difficulty of difficulties)for(const seed of [0,17,-83,2147483647]){
  const state=createRunV8(seed,difficulty);
  assert.equal(state.rulesetVersion,8);assert.equal(state.runConfigId,`run.outbound9_v8.${difficulty}`);
  assert.equal(outboundRunConfigIdV8(difficulty),state.runConfigId);assert.equal(state.difficultyId,difficulty);
  assert.equal(state.mode,'color_exit');assert.equal(state.boardSize,9);assert.equal(state.board.length,81);
  assert.deepEqual(asV6(state),createRunV6(seed,difficulty));assert.deepEqual(state,createRunV8(seed,difficulty));
 }
 for(const value of [undefined,null,'entry','',20])assert.throws(()=>createRunV8(1,value as never),/难度|difficulty|版本/i);
});

// Mutation targets: pre-placement checks, order-status inference, omitted phase guard, early refill exit.
test('occupying the south entry ends a run with 80 empty cells after the exact six-draw v6 replacement',()=>{
 for(const difficulty of difficulties){
  const state=freeze(prepared(17,difficulty)),before=JSON.stringify(state),command:Command={type:'place',pieceId:'fixture.food',origin:{x:4,y:8}};
  assert.equal(isIrrecoverableOutboundEntryBlocked(state),false);
  const baseline=applyCommandV6(asV6(state),command),result=applyCommandV8(state,command),next=result.state;
  assert.equal(result.error,undefined);assert.equal(next.phase,'result');assert.equal(next.result,'failed');assert.equal(next.endReason,'blocked');
  assert.equal(next.board[76],F);assert.equal(next.board.filter(cell=>cell===null).length,80);
  assert.deepEqual(result.events,[...baseline.events,{type:'result',result:'failed'}]);
  assert.deepEqual(asV6({...next,phase:'input',result:null,endReason:null}),baseline.state);
  assert.equal(next.commandIndex,1);assert.deepEqual(next.commands,[command]);assert.equal(next.generatedPieces,state.generatedPieces!+1);
  let rng=[...state.rngState];for(const [min,max] of [[1,100],[0,2147483647],[0,2147483647],[0,7],[0,5],[0,5]])rng=nextRandom(rng,min,max).state;
  assert.deepEqual(next.rngState,rng);assert.equal(JSON.stringify(state),before);
  assert.ok(next.orders.every(order=>orderStatusV6(next,order).reason==='insufficient'));
  assert.equal(isIrrecoverableOutboundEntryBlocked(next),true);
 }
});

test('a mixed piece ending on index 76 blocks the entry independently of its origin and first color',()=>{
 const state=prepared();state.candidates[0]={id:'fixture.food',shapeId:'shape.square',cargo:F,cellCargos:[F,F,C,C]};
 const result=place(state,{x:3,y:7});assert.equal(result.error,undefined);assert.equal(result.state.board[76],C);
 assert.equal(result.state.result,'failed');assert.deepEqual(result.events[0],{type:'placed',pieceId:'fixture.food',cells:[66,67,75,76]});
});

test('entry termination leaves geometric moves available but rejects every further placement without mutation',()=>{
 const ended=freeze(place(prepared()).state),before=JSON.stringify(ended),moves=findLegalMovesV8(ended);
 assert.ok(moves.length>0);assert.deepEqual(moves,findLegalMovesV6(ended));
 for(const move of moves){const rejected=applyCommandV8(ended,{type:'place',...move});assert.ok(rejected.error);assert.equal(rejected.state,ended);assert.deepEqual(rejected.events,[]);assert.equal(previewPlacementV8(ended,move.pieceId,move.origin).valid,false);}
 assert.equal(JSON.stringify(ended),before);
});

test('a full-board v6 loss keeps a single failed result event when the entry is also occupied',()=>{
 const state=prepared();state.board.fill(M);state.board[0]=null;
 const result=place(state,{x:0,y:0});assert.equal(result.error,undefined);assert.equal(result.state.result,'failed');
 assert.equal(result.state.endReason,'blocked');assert.deepEqual(result.events.filter(event=>event.type==='result'),[{type:'result',result:'failed'}]);
 assert.deepEqual(asV6(result.state),applyCommandV6(asV6(state),{type:'place',pieceId:'fixture.food',origin:{x:0,y:0}}).state);
});

test('invalid and unsupported commands retain the original state even if the entry was already occupied',()=>{
 const state=prepared();state.board[76]=F;freeze(state);const before=JSON.stringify(state);
 const invalid:Command[]=[{type:'place',pieceId:'missing',origin:{x:0,y:0}},{type:'place',pieceId:'fixture.food',origin:{x:4,y:8}},
  {type:'place',pieceId:'fixture.food',origin:{x:-1,y:0}},{type:'place',pieceId:'fixture.food',origin:{x:0.5,y:0}},
  {type:'upgrade',upgradeId:'upgrade.pallet_pass'},{type:'continueOvertime'},{type:'finishOvertime'},{type:'finishEndless'}];
 for(const command of invalid){const result=applyCommandV8(state,command);assert.ok(result.error);assert.equal(result.state,state);assert.deepEqual(result.events,[]);}
 assert.equal(JSON.stringify(state),before);assert.equal(state.phase,'input');
});

// Mutation targets: a heuristic based on currently ready orders, disconnected cargo or empty-space reachability.
test('no ready order on an empty-entry board is still playable',()=>{
 const state=prepared(),result=place(state,{x:0,y:0});assert.equal(result.error,undefined);assert.equal(shipments(result).length,0);
 assert.ok(result.state.orders.every(order=>orderStatusV6(result.state,order).status!=='ready'));
 assert.equal(result.state.phase,'input');assert.equal(result.state.result,null);assert.equal(isIrrecoverableOutboundEntryBlocked(result.state),false);
});

test('an isolated empty entry recovers when cargo reaches its outlet and ships directly from the entry',()=>{
 const state=prepared();for(const index of [13,22,31,40,49,58,67])state.board[index]=F;state.board[75]=C;state.board[77]=M;
 assert.equal(state.board[76],null);assert.equal(status(state,F).reason,'exit-unconnected');assert.equal(isIrrecoverableOutboundEntryBlocked(state),false);
 const preview=previewPlacementV8(freeze(state),'fixture.food',{x:4,y:0}),result=place(state,{x:4,y:0});
 assert.equal(result.error,undefined);assert.equal(result.state.phase,'input');assert.equal(result.state.result,null);
 assert.deepEqual(shipments(result).map(event=>event.cells),[[4,13,22,31,40,49,58,67]]);
 assert.deepEqual(shipments(result)[0].path,[{x:4,y:8}]);assert.deepEqual(preview.shipments,shipments(result));
 assert.equal(result.state.board[75],C);assert.equal(result.state.board[77],M);assert.equal(result.state.score,80);
});

test('three unavailable exits and a blocked route can recover through an east-then-north clearing chain',()=>{
 const state=prepared();for(const index of [4,5,13,14])state.board[index]=F;for(let index=18;index<27;index++)state.board[index]=C;
 state.candidates[1]={id:'fixture.chem',shapeId:'shape.domino_v',cargo:C};
 assert.equal(status(state,F).reason,'route-blocked');assert.ok(state.orders.every(order=>orderStatusV6(state,order).status!=='ready'));
 const paused=place(state,{x:0,y:0});assert.equal(paused.state.phase,'input');assert.equal(shipments(paused).length,0);
 const preview=previewPlacementV8(paused.state,'fixture.chem',{x:8,y:3}),result=place(paused.state,{x:8,y:3},'fixture.chem');
 assert.equal(result.error,undefined);assert.equal(result.state.phase,'input');assert.equal(result.state.result,null);
 assert.deepEqual(shipments(result).map(event=>[event.cargo,event.chain]),[[C,1],[F,2]]);assert.deepEqual(preview.shipments,shipments(result));
 assert.equal(result.state.completedOrders,2);assert.equal(result.state.score,150);assert.equal(result.state.board[0],F);
 assert.ok(shipments(result)[1].path.some(point=>shipments(result)[0].cells.includes(point.y*9+point.x)));
});

test('a detached large group stays playable and later ships after its outlet connection is completed',()=>{
 const state=prepared();for(const index of [22,31,40,49])state.board[index]=F;
 state.candidates[0]={id:'fixture.food',shapeId:'shape.domino_v',cargo:F};
 assert.equal(status(state,F).reason,'exit-unconnected');
 const wait=place(state,{x:0,y:0},'fixture.machine');assert.equal(wait.state.phase,'input');assert.equal(shipments(wait).length,0);
 const result=place(wait.state,{x:4,y:0},'fixture.food');assert.equal(result.state.phase,'input');
 assert.deepEqual(shipments(result).map(event=>event.cells),[[4,13,22,31,40,49]]);
});

test('a real thirtieth shipment wins after settlement without drawing a replacement or appending failure',()=>{
 const state=prepared();state.completedOrders=29;state.shift=5;for(const index of [4,13,22])state.board[index]=F;
 const command:Command={type:'place',pieceId:'fixture.food',origin:{x:4,y:3}},result=applyCommandV8(freeze(state),command);
 assert.equal(result.error,undefined);assert.equal(result.state.phase,'result');assert.equal(result.state.result,'won');assert.equal(result.state.endReason,'completed');
 assert.equal(result.state.completedOrders,30);assert.equal(result.state.score,40);assert.equal(shipments(result).length,1);
 assert.deepEqual(result.events.filter(event=>event.type==='result'),[{type:'result',result:'won'}]);
 assert.deepEqual(result.state.rngState,state.rngState);assert.equal(result.state.generatedPieces,state.generatedPieces);assert.equal(result.state.candidates.length,2);
 assert.deepEqual(asV6(result.state),applyCommandV6(asV6(state),command).state);
});

test('even a ready-sized outlet group containing the entry cannot ship or reopen it',()=>{
 const state=prepared();for(const index of [4,13,22,31,40,49,58,67])state.board[index]=F;
 const result=place(state);assert.equal(result.state.result,'failed');assert.equal(result.state.completedOrders,0);assert.equal(result.state.score,0);
 assert.equal(shipments(result).length,0);assert.equal(status(result.state,F).reason,'entry-blocked');
 assert.equal(result.state.board[76],F);
});

test('the irreversible-entry predicate is scoped strictly to the matching v8 outbound identity',()=>{
 const state=prepared();state.board[76]=C;assert.equal(isIrrecoverableOutboundEntryBlocked(state),true);
 for(const patch of [{rulesetVersion:6},{runConfigId:'run.outbound9_v6.easy'},{runConfigId:'run.outbound9_v8.hard'},
  {difficultyId:undefined},{boardSize:undefined},{board:Array(49).fill(null)},{mode:'standard' as const},{mode:'daily' as const},{mode:'endless' as const}]){
  assert.equal(isIrrecoverableOutboundEntryBlocked({...state,...patch}),false,JSON.stringify(patch));
 }
 for(const inbound of [createRunV3(1),createRunV3(1,'daily'),createRunV7(1)]){
  inbound.board[45]=M;inbound.upgrades=['upgrade.pallet_pass','upgrade.extra_pickup','upgrade.sweep_route'];
  assert.equal(isIrrecoverableOutboundEntryBlocked(inbound),false);
 }
 for(const version of [1,2,3,4,5,6,7])assert.equal(isIrrecoverableOutboundEntryBlocked({...state,rulesetVersion:version}),false);
});

test('every bounded one-placement continuation under frozen v6 leaves an occupied entry blocked',()=>{
 const state=asV6(prepared());state.board[76]=M;for(const index of [4,13,22,31])state.board[index]=F;
 const moves=findLegalMovesV6(state);assert.equal(moves.length,228);
 for(const move of moves){const result=applyCommandV6(freeze(state),{type:'place',...move});assert.equal(result.error,undefined);assert.equal(result.state.board[76],M);assert.equal(shipments(result).length,0);assert.equal(result.state.board.filter(Boolean).length,6);}
});

test('seeded v8 prefixes preserve all v6 gameplay and previews up to the first proven early stop',()=>{
 let earlyStops=0,nonterminalSteps=0;
 for(const difficulty of difficulties)for(const seed of [0,17,-8,2147483647]){
  let state=createRunV8(seed,difficulty),legacy=createRunV6(seed,difficulty);
  for(let step=0;step<75&&state.phase==='input';step++){
   const moves=findLegalMovesV8(state);assert.deepEqual(moves,findLegalMovesV6(legacy));const move=moves[(step*13)%moves.length];
   const command:Command={type:'place',...move},before=JSON.stringify(state),preview=previewPlacementV8(freeze(state),move.pieceId,move.origin);
   assert.deepEqual(preview,previewPlacementV6(legacy,move.pieceId,move.origin));
   const result=applyCommandV8(state,command),expected=applyCommandV6(legacy,command);assert.equal(result.error,undefined);assert.equal(JSON.stringify(state),before);
   assert.deepEqual(preview.shipments,shipments(result));
   if(expected.state.phase==='input'&&result.state.phase==='result'){
    assert.equal(result.state.board[76]!==null,true);assert.equal(result.state.result,'failed');
    assert.deepEqual(asV6({...result.state,phase:'input',result:null,endReason:null}),expected.state);
    assert.deepEqual(result.events,[...expected.events,{type:'result',result:'failed'}]);earlyStops++;
   }else{assert.deepEqual(asV6(result.state),expected.state);assert.deepEqual(result.events,expected.events);nonterminalSteps++;}
   state=result.state;legacy=expected.state;
  }
 }
 assert.ok(earlyStops>0);assert.ok(nonterminalSteps>100);
});

test('v1 through v7 frozen rule source fingerprints stay unchanged',()=>{
 const manifest=JSON.parse(readFileSync('tests/fixtures/outbound-v8-legacy-files.json','utf8')) as Record<string,string>;
 for(const [file,hash] of Object.entries(manifest))assert.equal(createHash('sha256').update(readFileSync(file)).digest('hex'),hash,file);
 assert.ok(Object.keys(manifest).some(file=>file.startsWith('src/domain/v6/')));assert.ok(Object.keys(manifest).some(file=>file.startsWith('src/domain/v7/')));
});

test('v8 natural terminal routes remain pinned for every difficulty',()=>{
 const fixture=JSON.parse(readFileSync('tests/fixtures/outbound-v8-golden.json','utf8')) as {cases:{seed:number;difficulty:OutboundDifficulty;commands:Command[];trace:string[]}[]};
 assert.deepEqual(fixture.cases.map(item=>item.difficulty),difficulties);
 for(const item of fixture.cases){let state=createRunV8(item.seed,item.difficulty);const digest=(value:RunState)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
  assert.equal(digest(state),item.trace[0]);for(const [index,command] of item.commands.entries()){const result=applyCommandV8(state,command);assert.equal(result.error,undefined);state=result.state;assert.equal(digest(state),item.trace[index+1]);}
  assert.equal(state.phase,'result');assert.equal(state.result,'failed');assert.equal(state.board[76]!==null,true);assert.ok(findLegalMovesV8(state).length>0);
 }
});
