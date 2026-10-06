import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createRun,applyCommand,previewPlacement,findLegalMoves} from '../src/domain/engine.ts';
import {orderStatus,toIndex,toPoint,neighbors} from '../src/domain/board.ts';
import * as content from '../src/domain/content.ts';
import {checksum,replay,replayWithTrace} from '../src/domain/replay.ts';
import type {CargoId,Command,CommandResult,RunState,Shipment,Point} from '../src/domain/types.ts';
const F:CargoId='cargo.food',M:CargoId='cargo.machine',C:CargoId='cargo.chem';
const mode='color_exit' as RunState['mode'];
const create=(seed=17)=>createRun(seed,mode,4);
const clone=<T>(value:T):T=>JSON.parse(JSON.stringify(value));
function freeze<T>(value:T):T {if(value&&typeof value==='object'){for(const item of Object.values(value))freeze(item);Object.freeze(value);}return value;}
function prepared(cargo:CargoId,cells:number[],origin:Point):{state:RunState;command:Command}{
 const state=create();for(const cell of cells)state.board[cell]=cargo;
 state.candidates=[{id:'fixture.single',shapeId:'shape.single',cargo},{id:'fixture.domino',shapeId:'shape.domino_h',cargo:M},{id:'fixture.third',shapeId:'shape.domino_v',cargo:C}];
 return {state,command:{type:'place',pieceId:'fixture.single',origin}};
}
const shipments=(result:CommandResult):Shipment[]=>result.events.filter((event):event is Shipment=>event.type==='shipment');
function target(state:RunState,cargo:CargoId){return state.orders.find(order=>order.cargo===cargo)!;}

// Removing v4 dispatch, fixed targets, or any of these explicitly versioned values must fail this test.
test('color-exit creation is separate, deterministic and leaves CURRENT_RULESET at 3',()=>{
 const state=create();assert.equal(content.CURRENT_RULESET,3);assert.equal(content.COLOR_EXIT_RULESET,4);
 assert.equal(state.rulesetVersion,4);assert.equal(state.mode,'color_exit');assert.equal(state.runConfigId,'run.color_exit_p0_v4');
 assert.deepEqual(state,create());assert.equal(state.candidates.length,3);assert.equal(state.phase,'input');assert.equal(state.shift,1);
 assert.deepEqual(state.orders,content.COLOR_EXIT_TARGETS);assert.deepEqual(state.orders.map(o=>[o.id,o.dockId,o.cargo,o.amount,o.baseScore]),[['exit.food','dock.north',F,4,0],['exit.chem','dock.east',C,4,0],['exit.machine','dock.west',M,4,0]]);
 assert.deepEqual(state.upgrades,[]);assert.deepEqual(state.upgradeChoices,[]);assert.equal(state.overtime,false);assert.equal(state.endReason,null);
 assert.ok(state.cellTraits?.every(trait=>trait===null));assert.equal(state.generatedPieces,3);
 const config=content.RULES_V4_CONFIG;assert.equal(config.balanced,false);assert.equal(config.minBatch,4);assert.equal(config.targetBatches,30);assert.equal(config.batchesPerStage,6);assert.equal(config.pointsPerCell,10);assert.equal(config.candidateCount,3);
 assert.deepEqual(content.COLOR_EXIT_ENTRY.entry,{x:3,y:6});assert.deepEqual(content.COLOR_EXIT_DOCKS.map(d=>[d.id,d.entry,d.cargo]),[['dock.north',{x:3,y:0},F],['dock.east',{x:6,y:3},C],['dock.west',{x:0,y:3},M]]);
});
test('root creation and existing-state routing reject mismatched mode and rules',()=>{
 for(const version of [1,2,3])assert.throws(()=>createRun(1,mode,version),/模式|mode/i);
 for(const wrong of ['standard','daily','tutorial'] as const)assert.throws(()=>createRun(1,wrong,4),/模式|mode/i);
 const state=create();for(const broken of [{...state,mode:'standard' as const},{...state,rulesetVersion:3}]){
  assert.throws(()=>applyCommand(broken,{type:'place',...findLegalMoves(state)[0]}),/模式|mode/i);
  assert.throws(()=>previewPlacement(broken,state.candidates[0].id,{x:0,y:0}),/模式|mode/i);
  assert.throws(()=>findLegalMoves(broken),/模式|mode/i);
 }
});
for(const [name,cargo,cells,origin,gate] of [
 ['north',F,[3,10,17],{x:3,y:3},3],['east',C,[27,26,25],{x:3,y:3},27],['west',M,[21,22,23],{x:3,y:3},21],
] as const)test(`only the fixed ${name} color gate ships through the south forklift entry`,()=>{
 const {state,command}=prepared(cargo,[...cells],origin),result=applyCommand(state,command),event=shipments(result)[0];
 assert.equal(result.error,undefined);assert.equal(shipments(result).length,1);assert.equal(event.dockId,`dock.${name}`);assert.equal(event.transport,'conveyor');
 assert.equal(event.score,40);assert.equal(event.units,4);assert.equal(result.state.score,40);assert.equal(result.state.completedOrders,1);assert.equal(result.state.lastChain,1);
 assert.deepEqual(event.path[0],{x:3,y:6});assert.ok(event.path.every(p=>state.board[toIndex(p)]===null&&toIndex(p)!==toIndex(origin)));
 assert.ok(neighbors(toIndex(event.path[event.path.length-1])).some(cell=>event.cells.includes(cell)));assert.ok(event.cells.every(cell=>result.state.board[cell]===null));
 assert.deepEqual(event.cargoPaths?.map(item=>item.cell),[...cells,toIndex(origin)].sort((a,b)=>a-b));
 for(const {cell,path} of event.cargoPaths!){assert.deepEqual(path[0],toPoint(cell));assert.deepEqual(path[path.length-1],toPoint(gate));assert.ok(path.every(point=>event.cells.includes(toIndex(point))));for(let i=1;i<path.length;i++)assert.ok(neighbors(toIndex(path[i-1])).includes(toIndex(path[i])));}
 assert.deepEqual(result.state.orders,state.orders);
});
test('a matching cargo on the wrong gate and south entry never creates a shipment',()=>{
 for(const [cells,origin] of [[[27,26,25],{x:3,y:3}],[[42,43,44],{x:3,y:6}],[[21,22,23],{x:3,y:3}]] as [number[],Point][]){
  const {state,command}=prepared(F,cells,origin);assert.equal(shipments(applyCommand(state,command)).length,0);
 }
});
test('gate contact means the single border cell, not any cell along that edge',()=>{
 const {state,command}=prepared(F,[0,1,7],{x:1,y:1});const result=applyCommand(state,command);assert.equal(shipments(result).length,0);
 assert.equal(orderStatus(result.state,target(state,F)).reason,'exit-unconnected');assert.equal(orderStatus(result.state,target(state,F)).count,0);
});
test('diagonal touching cannot connect detached cargo into a gate group',()=>{
 const {state,command}=prepared(F,[3,11,19],{x:6,y:3});const result=applyCommand(state,command);assert.equal(shipments(result).length,0);
 const status=orderStatus(result.state,target(state,F));assert.equal(status.count,1);assert.equal(status.reason,'insufficient');
});
test('connected group below four waits even with a larger detached group elsewhere',()=>{
 const {state,command}=prepared(F,[3,10,28,29,35,36],{x:3,y:2});const result=applyCommand(state,command),status=orderStatus(result.state,target(state,F));
 assert.equal(shipments(result).length,0);assert.equal(status.count,3);assert.equal(status.largestGroupCount,4);assert.equal(status.exitConnected,true);assert.equal(status.reason,'insufficient');
});
test('no gate connection reports zero gate progress and explicit detached-group information',()=>{
 const state=create();for(const cell of [22,23,29,30])state.board[cell]=F;
 assert.deepEqual(orderStatus(state,target(state,F)),{count:0,largestGroupCount:4,exitConnected:false,status:'blocked',reason:'exit-unconnected',path:[]});
});
test('south entrance occupancy is legal placement but blocks ready cargo without mutating preview',()=>{
 const {state,command}=prepared(M,[],{x:3,y:6});for(const cell of [3,10,17,24])state.board[cell]=F;
 const preview=previewPlacement(state,'fixture.single',{x:3,y:6});assert.equal(preview.valid,true);assert.equal(preview.shipments.length,0);
 const result=applyCommand(state,command);assert.equal(result.error,undefined);assert.equal(result.state.board[45],M);
 const status=orderStatus(result.state,target(state,F));assert.equal(status.reason,'entry-blocked');assert.equal(status.count,4);assert.equal(status.status,'blocked');
});
test('empty south entry with an impassable wall distinguishes route-blocked from entry-blocked',()=>{
 const state=create();for(const cell of [3,10,17,16])state.board[cell]=F;for(const cell of [21,22,23,24,25,26,27])state.board[cell]=M;
 const status=orderStatus(state,target(state,F));assert.equal(status.reason,'route-blocked');assert.equal(status.count,4);assert.deepEqual(status.path,[]);
});
test('north east west are the deterministic priority when every gate is ready',()=>{
 const {state,command}=prepared(F,[3,10,17],{x:3,y:3});for(const cell of [27,20,13,6])state.board[cell]=C;for(const cell of [21,14,7,0])state.board[cell]=M;
 const result=applyCommand(state,command);assert.deepEqual(shipments(result).map(s=>[s.dockId,s.chain]),[['dock.north',1],['dock.east',2],['dock.west',3]]);
 assert.equal(result.state.score,120);assert.equal(result.state.completedOrders,3);assert.equal(result.state.maxChain,3);assert.deepEqual(result.state.orders,state.orders);
});
test('clearing a lower-priority gate recomputes south BFS and revisits the previously blocked north gate',()=>{
 const {state,command}=prepared(M,[],{x:0,y:6});for(const cell of [3,10,17,16])state.board[cell]=F;for(const cell of [21,22,23,24,25,26,27])state.board[cell]=C;
 assert.equal(orderStatus(state,target(state,F)).reason,'route-blocked');const result=applyCommand(state,command),events=shipments(result);
 assert.deepEqual(events.map(s=>[s.dockId,s.chain]),[['dock.east',1],['dock.north',2]]);assert.equal(result.state.score,110);assert.ok(events[1].path.some(p=>events[0].cells.includes(toIndex(p))));
 assert.equal(new Set(events.map(s=>s.dockId)).size,events.length);
});
test('connected overfill clears the whole group once, scores per cell and preserves same-color detached cargo',()=>{
 const {state,command}=prepared(F,[3,10,17,24,23,30,42,43],{x:2,y:2});const result=applyCommand(state,command),event=shipments(result)[0];
 assert.equal(event.cells.length,7);assert.equal(event.score,70);assert.equal(shipments(result).length,1);assert.equal(result.state.board[42],F);assert.equal(result.state.board[43],F);
});
test('cargo lines follow one deterministic north east south west BFS tree around bends and ties',()=>{
 const {state,command}=prepared(F,[3,4,10,11],{x:3,y:2});const event=shipments(applyCommand(state,command))[0];
 assert.deepEqual(event.cargoPaths,[{cell:3,path:[{x:3,y:0}]},{cell:4,path:[{x:4,y:0},{x:3,y:0}]},{cell:10,path:[{x:3,y:1},{x:3,y:0}]},{cell:11,path:[{x:4,y:1},{x:4,y:0},{x:3,y:0}]},{cell:17,path:[{x:3,y:2},{x:3,y:1},{x:3,y:0}]}]);
});
test('preview and commit share all shipment details, never consume input RNG, and support frozen states',()=>{
 const {state,command}=prepared(M,[],{x:0,y:6});for(const cell of [3,10,17,16])state.board[cell]=F;for(const cell of [21,22,23,24,25,26,27])state.board[cell]=C;
 const frozen=freeze(state),before=JSON.stringify(frozen),preview=previewPlacement(frozen,'fixture.single',{x:0,y:6}),result=applyCommand(frozen,command);
 assert.deepEqual(preview.shipments,shipments(result));assert.equal(JSON.stringify(frozen),before);assert.deepEqual(preview,previewPlacement(frozen,'fixture.single',{x:0,y:6}));
 assert.notEqual(result.state,state);assert.equal(result.state.commandIndex,1);assert.deepEqual(result.state.commands,[command]);assert.equal(result.state.maxOccupancy,12);
});
test('invalid placements and all non-place commands are rejected atomically',()=>{
 const state=freeze(create()),before=JSON.stringify(state),piece=state.candidates[0];
 const invalid:Command[]=[{type:'upgrade',upgradeId:'upgrade.contract'},{type:'continueOvertime'},{type:'finishOvertime'},{type:'bogus'} as unknown as Command,{type:'place',pieceId:'missing',origin:{x:0,y:0}},...[-1,7,0.5,NaN].map(x=>({type:'place' as const,pieceId:piece.id,origin:{x,y:0}}))];
 for(const command of invalid){const result=applyCommand(state,command);assert.ok(result.error);assert.equal(result.state,state);assert.deepEqual(result.events,[]);}
 assert.equal(JSON.stringify(state),before);
 const occupied=clone(state);occupied.board.fill(F);assert.equal(previewPlacement(occupied,piece.id,{x:0,y:0}).valid,false);
});
test('new rules reject special and excluded-cargo pieces even when artificially supplied',()=>{
 for(const patch of [{trait:'pallet' as const},{cargo:'cargo.cold' as const},{cargo:'cargo.electronic' as const},{rushTurns:3}]){
  const {state,command}=prepared(F,[],{x:0,y:0});Object.assign(state.candidates[0],patch);const result=applyCommand(state,command);assert.ok(result.error);assert.equal(result.state,state);
 }
});
test('batch six advances shape stage without upgrades, bonuses or random target generation',()=>{
 const {state,command}=prepared(F,[3,10,17],{x:3,y:3});state.completedOrders=5;const result=applyCommand(state,command);
 assert.equal(result.state.shift,2);assert.equal(result.state.completedOrders,6);assert.equal(result.state.score,40);assert.equal(result.state.phase,'input');assert.deepEqual(result.state.upgradeChoices,[]);
 assert.deepEqual(result.events.filter(e=>e.type==='shift'),[{type:'shift',shift:2}]);assert.ok(!result.events.some(e=>e.type==='upgrade'));assert.deepEqual(result.state.orders,state.orders);
});
test('crossing thirty completes all ready gates in that placement then wins without consuming candidate RNG',()=>{
 const {state,command}=prepared(F,[3,10,17],{x:3,y:3});state.completedOrders=29;state.shift=5;for(const cell of [27,20,13,6])state.board[cell]=C;for(const cell of [21,14,7,0])state.board[cell]=M;
 const result=applyCommand(state,command);assert.equal(result.state.completedOrders,32);assert.equal(result.state.phase,'result');assert.equal(result.state.result,'won');assert.equal(result.state.endReason,'completed');assert.equal(result.state.score,120);
 assert.equal(shipments(result).length,3);assert.equal(result.state.board[27],null);assert.deepEqual(result.state.rngState,state.rngState);assert.equal(result.state.generatedPieces,state.generatedPieces);assert.equal(result.state.candidates.length,2);
 assert.deepEqual(previewPlacement(state,'fixture.single',{x:3,y:3}).shipments,shipments(result));assert.ok(applyCommand(result.state,{type:'continueOvertime'}).error);
});
test('all candidates need no legal placement before failure, even if the first candidate is stuck',()=>{
 const {state,command}=prepared(M,[],{x:0,y:0});state.board.fill(M);state.board[0]=null;state.board[48]=null;state.candidates[1]={id:'large',shapeId:'shape.cross5',cargo:M};state.candidates[2]={id:'small',shapeId:'shape.single',cargo:C};
 const first=applyCommand(state,command);assert.equal(first.state.phase,'input');assert.ok(findLegalMoves(first.state).some(m=>m.pieceId==='small'));assert.ok(!findLegalMoves(first.state).some(m=>m.pieceId==='large'));
 const failed=applyCommand(first.state,{type:'place',pieceId:'small',origin:{x:6,y:6}});assert.equal(failed.state.phase,'result');assert.equal(failed.state.result,'failed');assert.equal(failed.state.endReason,'blocked');assert.equal(findLegalMoves(failed.state).length,0);
});
test('generation remains three-color ordinary shapes with deterministic stage gating and occupancy adjustment',()=>{
 for(const stage of [1,2,3,4,5])for(let seed=1;seed<=100;seed++){
  const state=create(seed);state.shift=stage;state.completedOrders=(stage-1)*6;
  const move=findLegalMoves(state)[seed%findLegalMoves(state).length],result=applyCommand(state,{type:'place',...move});assert.equal(result.error,undefined);
  assert.equal(result.state.candidates.length,3);for(const piece of result.state.candidates){assert.ok(([F,M,C] as CargoId[]).includes(piece.cargo));assert.equal(piece.trait,undefined);assert.equal(piece.rushTurns,undefined);assert.ok(content.SHAPES.find(s=>s.id===piece.shapeId)!.minShift<=stage);}
  assert.deepEqual(result,applyCommand(clone(state),{type:'place',...move}));assert.deepEqual(result.state.orders,state.orders);
 }
});
test('real seeded runs replay with trace and JSON checkpoints without shared RNG state',()=>{
 for(const seed of [0,1,9,72,-18,2147483647]){
  let state=create(seed);const checkpoints=[clone(state)];
  for(let turn=0;turn<90&&state.phase!=='result';turn++){
   const moves=findLegalMoves(state),move=moves[(turn*17)%moves.length],before=JSON.stringify(state);assert.ok(move);
   const preview=previewPlacement(state,move.pieceId,move.origin),next=applyCommand(state,{type:'place',...move});assert.equal(next.error,undefined);assert.deepEqual(preview.shipments,shipments(next));assert.equal(JSON.stringify(state),before);state=next.state;checkpoints.push(clone(state));
  }
  assert.deepEqual(replay(seed,state.commands,mode,4),state);assert.deepEqual(replayWithTrace(seed,state.commands,mode,4).state,state);
  for(const boundary of [0,Math.floor(checkpoints.length/2),checkpoints.length-1]){let restored=checkpoints[boundary];for(const command of state.commands.slice(boundary))restored=applyCommand(restored,command).state;assert.deepEqual(restored,state);}
  assert.deepEqual(create(seed),checkpoints[0]);assert.equal(checksum(replay(seed,state.commands,mode,4)),checksum(state));
 }
});
test('v4 checksum includes counters and result reasons but excludes presentation metadata',()=>{
 const state=create(),baseline=checksum(state);
 for(const patch of [{generatedPieces:99},{endReason:'blocked' as const},{nextId:99}])assert.notEqual(checksum({...state,...patch}),baseline);
 assert.equal(checksum({...state,runSerial:97,elapsedMs:999,maxOccupancy:42}),baseline);
});
test('the original v1 v2 v3 command checksums and v3 implementation bytes stay frozen',()=>{
 const manifest=JSON.parse(readFileSync('tests/fixtures/color-exit-old-golden.json','utf8')) as {files:Record<string,string>;cases:{version:number;seed:number;mode:RunState['mode'];commands:Command[];trace:string[]}[]};
 for(const [file,sha] of Object.entries(manifest.files))assert.equal(createHash('sha256').update(readFileSync(file)).digest('hex'),sha,file);
 for(const item of manifest.cases){let state=createRun(item.seed,item.mode,item.version);assert.equal(checksum(state),item.trace[0]);for(const [i,command] of item.commands.entries()){const result=applyCommand(state,command);assert.equal(result.error,undefined);state=result.state;assert.equal(checksum(state),item.trace[i+1]);}}
});
test('root read APIs reject mismatched mode and unsupported versions rather than selecting old routes',()=>{
 const state=create();for(const cell of [0,1,7,8])state.board[cell]=F;
 for(const broken of [{...state,rulesetVersion:3},{...state,rulesetVersion:5},{...state,mode:'standard' as const}]){
  assert.throws(()=>orderStatus(broken,target(state,F)),/模式|版本|mode|version/i);
  assert.throws(()=>checksum(broken),/模式|版本|mode|version/i);
 }
 const old=createRun(17,'standard',3);assert.throws(()=>orderStatus({...old,rulesetVersion:99},old.orders[0]),/版本|version/i);
});
test('v4 fixed configuration candidate draws RNG cursors and full command traces cannot drift silently',()=>{
 const fixture=JSON.parse(readFileSync('tests/fixtures/color-exit-v4-golden.json','utf8')) as {config:typeof content.RULES_V4_CONFIG;cases:{seed:number;initial:Pick<RunState,'candidates'|'rngState'>;commands:Command[];trace:string[]}[]};
 assert.deepEqual(content.RULES_V4_CONFIG,fixture.config);
 for(const item of fixture.cases){let state=create(item.seed);assert.deepEqual({candidates:state.candidates,rngState:state.rngState},item.initial);assert.equal(checksum(state),item.trace[0]);
  for(const [i,command] of item.commands.entries()){const result=applyCommand(state,command);assert.equal(result.error,undefined);state=result.state;assert.equal(checksum(state),item.trace[i+1]);}
 }
});
