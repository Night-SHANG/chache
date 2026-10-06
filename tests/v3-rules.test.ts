import test from 'node:test';
import assert from 'node:assert/strict';
import { createRunV3, applyCommandV3, previewPlacementV3, findLegalMovesV3 } from '../src/domain/v3/engine.ts';
import { RULES_V3_CONFIG } from '../src/domain/v3/content.ts';
import { createRunV2, applyCommandV2, findLegalMovesV2 } from '../src/domain/v2/engine.ts';
import { UPGRADES_V2, RULES_V2_CONFIG } from '../src/domain/v2/content.ts';
import { orderStatusV2 } from '../src/domain/v2/board.ts';
import type { Command, Order, Point, RunState, Shipment } from '../src/domain/types.ts';
const F = 'cargo.food', M = 'cargo.machine';
const tutorialOrigins: Point[] = [{x:1,y:1},{x:3,y:1},{x:3,y:4}];
function jsonCopy<T>(value:T):T { return JSON.parse(JSON.stringify(value)) as T; }
function freeze<T>(value:T):T {if(value&&typeof value==='object'){Object.freeze(value);for(const child of Object.values(value))freeze(child);}return value;}
function place(state:RunState,origin:Point) { return applyCommandV3(state,{type:'place',pieceId:state.candidates[0].id,origin}); }
function shipments(result:ReturnType<typeof place>):Shipment[] {return result.events.filter(e=>e.type==='shipment');}
function tutorialThrough(count:number):RunState {let state=createRunV3(301,'tutorial');for(let i=0;i<count;i++)state=place(state,tutorialOrigins[i]).state;return state;}
function oldGameplay(state:RunState):RunState {const copy=jsonCopy(state);copy.rulesetVersion=2;copy.runConfigId=RULES_V2_CONFIG.runConfigId;delete copy.tutorialStep;delete copy.overtime;delete copy.endReason;return copy;}
function winningInput(mode:RunState['mode']='standard'):RunState {
  const state=createRunV3(541,mode);state.shift=5;state.completedOrders=29;state.board.fill(null);state.cellTraits!.fill(null);
  state.board[8]=F;state.board[9]=F;state.orders=[{id:'final-order',dockId:'dock.north',cargo:F,amount:3,baseScore:200}];
  state.candidates=[{id:'final-piece',shapeId:'shape.single',cargo:F},{id:'held-piece',shapeId:'shape.single',cargo:M}];
  state.upgrades=['upgrade.four_choices','upgrade.contract'];return state;
}
function won():RunState {return place(winningInput(),{x:3,y:1}).state;}

test('v3 declares its version while standard and daily start with the exact v2 content sequence',()=>{
  for(const seed of [0,1,44,-83,2147483647])for(const mode of ['standard','daily'] as const){
    const state=createRunV3(seed,mode);assert.equal(state.rulesetVersion,3);assert.equal(state.runConfigId,'run.standard_v3');
    assert.equal(state.tutorialStep,3);assert.equal(state.overtime,false);assert.equal(state.endReason,null);
    assert.deepEqual(oldGameplay(state),createRunV2(seed,mode));assert.deepEqual(state,createRunV3(seed,mode));
  }
  assert.equal(RULES_V3_CONFIG.rulesetVersion,3);assert.equal(RULES_V3_CONFIG.runConfigId,'run.standard_v3');assert.equal(RULES_V3_CONFIG.balanced,false);
});

test('v3 standard and daily reducers retain v2 outcomes across seeded real placements and upgrade choices',()=>{
  for(const mode of ['standard','daily'] as const)for(const seed of [1,17,809]){
    let old=createRunV2(seed,mode),current=createRunV3(seed,mode);
    for(let turn=0;turn<60&&old.phase!=='result';turn++){
      const moves=findLegalMovesV2(old),command:Command=old.phase==='upgrade'?{type:'upgrade',upgradeId:old.upgradeChoices[0]}:{type:'place',...moves[(turn*11)%moves.length]};
      const expected=applyCommandV2(old,command),actual=applyCommandV3(current,command);assert.equal(actual.error,undefined);assert.deepEqual(actual.events,expected.events);
      assert.deepEqual(oldGameplay(actual.state),expected.state);old=expected.state;current=actual.state;
    }
  }
});

test('tutorial teaches two real food placements then an actual south-to-north clearing chain',()=>{
  let state=createRunV3(301,'tutorial');assert.equal(state.tutorialStep,0);assert.equal(state.candidates.length,1);
  assert.equal(state.candidates[0].shapeId,'shape.domino_h');assert.equal(state.candidates[0].cargo,F);
  assert.deepEqual(state.orders.map(o=>[o.dockId,o.cargo,o.amount]),[['dock.north',F,3]]);
  const first=place(state,tutorialOrigins[0]);assert.equal(first.error,undefined);assert.equal(shipments(first).length,0);state=first.state;
  assert.equal(state.tutorialStep,1);assert.equal(state.candidates.length,1);assert.equal(state.candidates[0].shapeId,'shape.single');assert.equal(state.candidates[0].cargo,F);
  assert.deepEqual(state.board.map((cargo,i)=>cargo?i:-1).filter(i=>i>=0),[8,9]);
  assert.ok(first.events.some(e=>e.type==='tutorialAdvanced'&&e.step===1));
  const second=place(state,tutorialOrigins[1]);assert.equal(second.error,undefined);assert.deepEqual(shipments(second).map(s=>[s.dockId,s.cells,s.chain]),[['dock.north',[8,9,10],1]]);state=second.state;
  assert.equal(state.tutorialStep,2);assert.ok(second.events.some(e=>e.type==='tutorialAdvanced'&&e.step===2));
  assert.deepEqual(state.board.map((cargo,i)=>cargo===F?i:-1).filter(i=>i>=0),[42,43,44]);
  assert.deepEqual(state.board.map((cargo,i)=>cargo===M?i:-1).filter(i=>i>=0),[21,22,23,24,25,26,27]);
  assert.equal(state.candidates.length,1);assert.equal(state.candidates[0].shapeId,'shape.single');assert.equal(state.candidates[0].cargo,M);
  assert.deepEqual(state.orders.map(o=>[o.dockId,o.cargo,o.amount]),[['dock.north',F,3],['dock.south',M,8]]);
  const north=state.orders.find(o=>o.dockId==='dock.north')!;assert.equal(orderStatusV2(state,north).reason,'route-blocked');
  const last=place(state,tutorialOrigins[2]);assert.equal(last.error,undefined);assert.deepEqual(shipments(last).map(s=>[s.dockId,s.chain]),[['dock.south',1],['dock.north',2]]);
  assert.deepEqual(shipments(last)[0].cells,[21,22,23,24,25,26,27,31]);assert.deepEqual(shipments(last)[1].cells,[42,43,44]);
  assert.equal(last.state.tutorialStep,3);assert.equal(last.state.phase,'result');assert.equal(last.state.result,'won');assert.equal(last.state.endReason,'completed');
  assert.equal(last.state.shift,1);assert.equal(last.state.completedOrders,3);assert.equal(last.state.commandIndex,3);assert.equal(last.state.commands.length,3);assert.equal(last.state.maxChain,2);
  assert.ok(last.state.board.every(cell=>cell===null));assert.equal(last.state.upgrades.length,0);assert.equal(last.state.upgradeChoices.length,0);
  assert.ok(last.events.some(e=>e.type==='tutorialAdvanced'&&e.step===3));assert.ok(last.events.some(e=>e.type==='result'&&e.result==='won'));
});

test('tutorial accepts only its highlighted origin and keeps rejected or cancel-like input atomic at every step',()=>{
  for(let step=0;step<3;step++){
    const state=tutorialThrough(step),before=JSON.stringify(state),allowed=tutorialOrigins[step];
    assert.deepEqual(findLegalMovesV3(state),[{pieceId:state.candidates[0].id,origin:allowed}]);
    for(let y=0;y<7;y++)for(let x=0;x<7;x++)if(x!==allowed.x||y!==allowed.y){
      const rejected=place(state,{x,y});assert.ok(rejected.error,`step ${step}: ${x},${y}`);assert.equal(rejected.state,state);assert.deepEqual(rejected.events,[]);
      assert.equal(previewPlacementV3(state,state.candidates[0].id,{x,y}).valid,false);
    }
    const commands:Command[]=[{type:'upgrade',upgradeId:'upgrade.contract'},{type:'continueOvertime'},{type:'finishOvertime'},{type:'cancel'} as unknown as Command,{type:'place',pieceId:'missing',origin:allowed}];
    for(const command of commands){const rejected=applyCommandV3(state,command);assert.ok(rejected.error);assert.equal(rejected.state,state);assert.deepEqual(rejected.events,[]);}
    assert.equal(JSON.stringify(state),before);
  }
});

test('tutorial previews have no side effects and match committed shipment details',()=>{
  for(let step=0;step<3;step++){
    const state=freeze(tutorialThrough(step)),before=JSON.stringify(state),origin=tutorialOrigins[step];
    const preview=previewPlacementV3(state,state.candidates[0].id,origin);assert.equal(preview.valid,true);assert.deepEqual(preview.shipments,shipments(place(state,origin)));
    assert.equal(JSON.stringify(state),before);
  }
});

test('every tutorial JSON snapshot can resume and command replay yields the identical complete state',()=>{
  const expected=tutorialThrough(3),initial=createRunV3(301,'tutorial');
  for(let boundary=0;boundary<=3;boundary++){
    let state=jsonCopy(tutorialThrough(boundary));for(let step=boundary;step<3;step++)state=place(state,tutorialOrigins[step]).state;assert.deepEqual(state,expected);
  }
  let replay=initial;for(const command of expected.commands)replay=applyCommandV3(replay,jsonCopy(command)).state;assert.deepEqual(replay,expected);
  assert.deepEqual(expected.rngState,initial.rngState);
});

test('standard final shipment ends completed before offering explicit Overtime continuation',()=>{
  const state=won();assert.equal(state.phase,'result');assert.equal(state.result,'won');assert.equal(state.completedOrders,30);assert.equal(state.shift,5);
  assert.equal(state.overtime,false);assert.equal(state.endReason,'completed');assert.ok(place(winningInput(),{x:3,y:1}).events.some(e=>e.type==='result'));
});

test('continueOvertime preserves accumulated gameplay and old content while deterministically filling missing content',()=>{
  const state=won();state.orders=[{id:'retained-order',dockId:'dock.east',cargo:M,amount:7,baseScore:200}];state.board[40]=M;
  const before=JSON.stringify(state),next=applyCommandV3(freeze(state),{type:'continueOvertime'});
  assert.equal(next.error,undefined);assert.equal(next.state.phase,'input');assert.equal(next.state.result,null);assert.equal(next.state.endReason,null);assert.equal(next.state.overtime,true);assert.equal(next.state.shift,5);
  assert.deepEqual(next.state.board,state.board);assert.deepEqual(next.state.cellTraits,state.cellTraits);assert.deepEqual(next.state.upgrades,state.upgrades);
  assert.equal(next.state.score,state.score);assert.equal(next.state.completedOrders,state.completedOrders);assert.equal(next.state.maxChain,state.maxChain);
  assert.equal(next.state.candidates.length,4);assert.deepEqual(next.state.candidates[0],state.candidates[0]);assert.equal(next.state.orders.length,4);
  assert.equal(new Set(next.state.orders.map(o=>o.cargo)).size,4);assert.equal(new Set(next.state.orders.map(o=>o.dockId)).size,4);assert.deepEqual(next.state.orders.find(o=>o.id==='retained-order'),state.orders[0]);
  assert.equal(next.state.commandIndex,state.commandIndex+1);assert.deepEqual(next.state.commands[next.state.commands.length-1],{type:'continueOvertime'});assert.deepEqual(next.events,[{type:'overtimeStarted'}]);
  assert.deepEqual(next,applyCommandV3(jsonCopy(state),{type:'continueOvertime'}));assert.equal(JSON.stringify(state),before);
});

test('continuing with already full orders and candidates preserves RNG rather than resetting or redrawing',()=>{
  const state=won(),full=createRunV3(982);state.candidates=full.candidates;
  state.upgrades=[];state.orders=['cargo.food','cargo.machine','cargo.chem','cargo.electronic'].map((cargo,index)=>({id:`fixed-${index}`,dockId:['dock.north','dock.east','dock.south','dock.west'][index],cargo,amount:5,baseScore:200} as Order));
  const next=applyCommandV3(state,{type:'continueOvertime'}).state;assert.deepEqual(next.rngState,state.rngState);assert.deepEqual(next.candidates,state.candidates);assert.deepEqual(next.orders,state.orders);
  assert.equal(next.nextId,state.nextId);assert.equal(next.generatedPieces,state.generatedPieces);
});

test('Overtime start rejects daily, tutorial, unfinished, failed, non-result and already-overtime states atomically',()=>{
  const cases:RunState[]=[createRunV3(1),tutorialThrough(3),{...won(),mode:'daily'},{...won(),phase:'input'},{...won(),result:'failed'},{...won(),shift:4},{...won(),completedOrders:29},{...won(),overtime:true}];
  for(const state of cases){const before=JSON.stringify(state),result=applyCommandV3(state,{type:'continueOvertime'});assert.ok(result.error);assert.equal(result.state,state);assert.equal(JSON.stringify(state),before);assert.deepEqual(result.events,[]);}
});

test('finishOvertime retires only active standard Overtime, records its command and leaves game content and RNG unchanged',()=>{
  const state=applyCommandV3(won(),{type:'continueOvertime'}).state,before=JSON.stringify(state),result=applyCommandV3(freeze(state),{type:'finishOvertime'});
  assert.equal(result.error,undefined);assert.equal(result.state.phase,'result');assert.equal(result.state.result,'won');assert.equal(result.state.endReason,'retired');assert.equal(result.state.overtime,true);
  assert.deepEqual(result.state.commands[result.state.commands.length-1],{type:'finishOvertime'});assert.equal(result.state.commandIndex,state.commandIndex+1);assert.deepEqual(result.events,[{type:'result',result:'won'}]);
  for(const key of ['board','cellTraits','candidates','orders','score','completedOrders','shift','rngState','upgrades','nextId','generatedPieces'] as const)assert.deepEqual(result.state[key],state[key]);
  assert.equal(JSON.stringify(state),before);
  for(const invalid of [createRunV3(1),won(),result.state,{...state,mode:'daily' as const},{...state,mode:'tutorial' as const},{...state,phase:'upgrade' as const}]){
    const rejected=applyCommandV3(invalid,{type:'finishOvertime'});assert.ok(rejected.error);assert.equal(rejected.state,invalid);assert.deepEqual(rejected.events,[]);
  }
});

test('Overtime remains shift 5 through 1200 additional real shipments with no new upgrades or repeat win bonus',()=>{
  let state=applyCommandV3(won(),{type:'continueOvertime'}).state;
  // Exhaust the finite offer pool deliberately; Overtime must never request another upgrade draw.
  state.upgrades=UPGRADES_V2.flatMap(upgrade=>Array<string>(upgrade.maxStack).fill(upgrade.id));
  for(let turn=0;turn<1200;turn++){
    // Isolate the long-run reducer contract from survival balance: prepare one reachable old order each turn.
    state.board.fill(null);state.cellTraits!.fill(null);state.board[8]=F;state.board[9]=F;
    state.candidates=[{id:`endless-${turn}`,shapeId:'shape.single',cargo:F}];state.orders=[{id:`endless-order-${turn}`,dockId:'dock.north',cargo:F,amount:3,baseScore:200}];
    const priorScore=state.score,priorOrders=state.completedOrders,result=place(state,{x:3,y:1});assert.equal(result.error,undefined);
    assert.equal(result.state.phase,'input',`turn ${turn}`);assert.equal(result.state.result,null);assert.equal(result.state.endReason,null);assert.equal(result.state.shift,5);
    assert.equal(result.state.completedOrders,priorOrders+1);assert.equal(result.state.score,priorScore+shipments(result).reduce((sum,s)=>sum+s.score,0));
    assert.ok(!result.events.some(e=>e.type==='upgrade'||e.type==='result'||e.type==='shift'));assert.deepEqual(result.state.upgradeChoices,[]);
    assert.equal(result.state.orders.length,4);assert.equal(new Set(result.state.orders.map(o=>o.cargo)).size,4);assert.equal(result.state.candidates.length,4);state=result.state;
  }
  assert.equal(state.completedOrders,1230);assert.equal(state.overtime,true);
});

test('Overtime JSON recovery preserves previews, commands, random draws and voluntary result',()=>{
  const input=winningInput(),commands:Command[]=[{type:'place',pieceId:input.candidates[0].id,origin:{x:3,y:1}},{type:'continueOvertime'}];
  let expected=input;const checkpoints=[jsonCopy(input)];for(const command of commands){expected=applyCommandV3(expected,command).state;checkpoints.push(jsonCopy(expected));}
  const move=findLegalMovesV3(expected)[0],preview=previewPlacementV3(freeze(jsonCopy(expected)),move.pieceId,move.origin);assert.equal(preview.valid,true);
  commands.push({type:'place',...move},{type:'finishOvertime'});for(const command of commands.slice(2)){expected=applyCommandV3(expected,command).state;checkpoints.push(jsonCopy(expected));}
  for(let i=0;i<checkpoints.length;i++){let restored=checkpoints[i];for(const command of commands.slice(i)){const result=applyCommandV3(restored,command);assert.equal(result.error,undefined);restored=result.state;}assert.deepEqual(restored,expected);}
});

test('a blocked Overtime placement reports failure with blocked end reason rather than another victory',()=>{
  const state=applyCommandV3(won(),{type:'continueOvertime'}).state;state.board.fill(M);state.cellTraits!.fill(null);state.board[0]=null;
  state.candidates=[{id:'last-space',shapeId:'shape.single',cargo:F}];state.orders=[{id:'no-shipment',dockId:'dock.north',cargo:F,amount:7,baseScore:200}];
  const result=place(state,{x:0,y:0});assert.equal(result.error,undefined);assert.equal(result.state.phase,'result');assert.equal(result.state.result,'failed');assert.equal(result.state.endReason,'blocked');assert.equal(result.state.overtime,true);
  assert.deepEqual(result.events.filter(e=>e.type==='result'),[{type:'result',result:'failed'}]);
});

test('normal and daily blockage also records blocked without changing the v2 outcome',()=>{
  for(const mode of ['standard','daily'] as const){
    const state=createRunV3(72,mode);state.board.fill(M);state.cellTraits!.fill(null);state.board[0]=null;
    state.candidates=[{id:'last-space',shapeId:'shape.single',cargo:F}];state.orders=[{id:'no-shipment',dockId:'dock.north',cargo:F,amount:7,baseScore:100}];
    const result=place(state,{x:0,y:0});assert.equal(result.state.result,'failed');assert.equal(result.state.endReason,'blocked');assert.equal(result.state.overtime,false);
    assert.deepEqual(oldGameplay(result.state),applyCommandV2(oldGameplay(state),{type:'place',pieceId:'last-space',origin:{x:0,y:0}}).state);
  }
});

test('a real seed-1 five-shift run can continue, play and retire with every JSON checkpoint replaying identically',()=>{
  // Fixed, unmodified command-only route from initial state. Tuples are [piece number, x, y].
  const route:([number,number,number]|string)[]=[
    [3,1,1],[5,1,2],[7,5,5],[4,3,2],[11,0,5],[6,1,1],[9,3,1],[15,0,0],'stock_orders',
    [17,0,5],[14,2,1],[13,2,3],[21,0,6],[24,0,5],'light_orders',
    [20,1,1],[27,0,0],[30,0,0],[28,0,0],[34,0,0],'pallet_pass',
    [19,1,1],[37,1,2],[36,1,3],[41,1,1],[42,1,3],[44,0,4],'wild_supply',
    [32,1,1],[46,3,1],[48,4,1],[47,3,1],[51,3,2],[52,5,1],[39,4,2],[50,3,3],[58,1,3],'sweep_route',
    [55,1,1],[61,4,1],[62,2,1],[56,5,0],[64,4,5],[68,4,2],'hazard_clearance',
    [66,2,1],[71,4,0],[73,4,1],[74,3,2],[60,1,3],[76,4,2],[77,4,3],[79,4,0],[70,2,3],[82,3,3],'extra_pickup',
    [75,4,1],[81,1,3],[86,1,2],[88,3,4],[89,2,1],[85,2,1],[91,0,5],
  ];
  const commands:Command[]=route.map(move=>typeof move==='string'?{type:'upgrade',upgradeId:`upgrade.${move}`}:{type:'place',pieceId:`piece.${move[0]}`,origin:{x:move[1],y:move[2]}});
  let state=createRunV3(1),legacy=createRunV2(1);const checkpoints=[jsonCopy(state)];
  for(const command of commands){
    const result=applyCommandV3(state,command),oldResult=applyCommandV2(legacy,command);assert.equal(result.error,undefined);assert.deepEqual(result.events,oldResult.events);
    assert.deepEqual(oldGameplay(result.state),oldResult.state);state=result.state;legacy=oldResult.state;checkpoints.push(jsonCopy(state));
  }
  assert.equal(state.completedOrders,30);assert.equal(state.score,6309);assert.equal(state.result,'won');assert.equal(state.endReason,'completed');assert.equal(state.commandIndex,63);
  const continueCommand:Command={type:'continueOvertime'};commands.push(continueCommand);state=applyCommandV3(state,continueCommand).state;checkpoints.push(jsonCopy(state));
  for(let turn=0;turn<3;turn++){
    const move=findLegalMovesV3(state)[0],command:Command={type:'place',...move},preview=previewPlacementV3(freeze(jsonCopy(state)),move.pieceId,move.origin);
    const result=applyCommandV3(state,command);assert.equal(result.error,undefined);assert.equal(result.state.phase,'input');assert.deepEqual(shipments(result),preview.shipments);
    commands.push(command);state=result.state;checkpoints.push(jsonCopy(state));
  }
  const finish:Command={type:'finishOvertime'};commands.push(finish);state=applyCommandV3(state,finish).state;checkpoints.push(jsonCopy(state));
  assert.equal(state.endReason,'retired');assert.deepEqual(state.commands,commands);
  for(let boundary=0;boundary<checkpoints.length;boundary++){
    let restored=checkpoints[boundary];for(const command of commands.slice(boundary)){const result=applyCommandV3(restored,command);assert.equal(result.error,undefined);restored=result.state;}
    assert.deepEqual(restored,state,`JSON boundary ${boundary}`);
  }
});

test('continuing overtime immediately fails closed when regenerated candidates have no legal move',()=>{
 const state=createRunV3(4,'standard');state.shift=5;state.completedOrders=29;state.board.fill(M);state.cellTraits!.fill(null);for(const cell of [2,3,7])state.board[cell]=null;for(const cell of [0,1,8])state.board[cell]=F;
 state.orders=[{id:'order.last',dockId:'dock.north',cargo:F,amount:4,baseScore:100}];state.candidates=[{id:'piece.last',shapeId:'shape.single',cargo:F},{id:'piece.large1',shapeId:'shape.p5',cargo:M},{id:'piece.large2',shapeId:'shape.cross5',cargo:M}];
 const victory=place(state,{x:0,y:1}).state;assert.equal(victory.result,'won');const overtime=applyCommandV3(victory,{type:'continueOvertime'});assert.equal(findLegalMovesV3(overtime.state).length,0);assert.equal(overtime.state.phase,'result');assert.equal(overtime.state.result,'failed');assert.equal(overtime.state.endReason,'blocked');assert.ok(overtime.events.some(e=>e.type==='result'&&e.result==='failed'));
});
