import test from 'node:test';
import assert from 'node:assert/strict';

// Mutation target: a missing fixed-rush boundary or inherited hard-tier identity.
test('fixed rush creates a separate normal rules20 identity without inherited multipliers',async()=>{
 const api=await import('../src/domain/v20/engine.ts').catch(()=>null);
 assert.ok(api,'Fixed rush rules20 engine must exist');
 const state=api.createRunV20({seed:17,mode:'rush'});
 assert.equal(state.rulesetVersion,20);assert.equal(state.runConfigId,'run.rush_v20.fixed');assert.equal(state.inboundDifficulty,'normal');assert.equal(state.mode,'rush');assert.equal(state.rawScore,0);assert.equal(state.score,0);assert.equal(state.phase,'cleanup');assert.deepEqual(state.candidates,[]);
});

import {createRunV16,applyCommandV16} from '../src/domain/v16/engine.ts';
import {generatePieceV16,generationDistributionV16,refreshOrdersV16} from '../src/domain/v16/generation.ts';
import {createRandomState} from '../src/domain/random.ts';
import {checksumV16} from '../src/domain/v16/replay.ts';
import {reservedEntryCellsV16} from '../src/domain/v16/board.ts';
import {applyToolV16,findRescuePlanV16} from '../src/domain/v16/tools.ts';
import type {RushRunV20,StartRushV20,RushCommandV20} from '../src/domain/v20/types.ts';
const loaded=await import('../src/domain/v20/engine.ts').catch(()=>null);
function api(){assert.ok(loaded,'Fixed rush rules20 engine must exist');return loaded;}
function start(seed=17){return api().createRunV20({seed,mode:'rush'});}
function input(branch:'orders'|'placements'='placements'){return api().applyCommandV20(start(),{type:'chooseCleanup',branch}).state;}
function ready(completedOrders=0):RushRunV20 {
 const state=input();state.completedOrders=completedOrders;state.shift=Math.min(5,Math.floor(completedOrders/6)+1) as RushRunV20['shift'];
 state.candidates=[{id:'fixture.food',shapeId:'shape.single',cargo:'cargo.food',quarterTurns:0},{id:'fixture.machine',shapeId:'shape.single',cargo:'cargo.machine',quarterTurns:0},{id:'fixture.chem',shapeId:'shape.domino_h',cargo:'cargo.chem',quarterTurns:0}];
 state.orders=[{id:'fixture.order',dockId:'dock.north',cargo:'cargo.food',amount:4,baseScore:101}];for(const cell of [8,9,10])state.board[cell]='cargo.food';return state;
}
const ship={type:'place',pieceId:'fixture.food',origin:{x:4,y:1}} as const;

// Mutation target: menu difficulty leaks into fixed-rush generation, dates or guidance.
test('fixed rush accepts normal only and rejects foreign identity and tool budgets',()=>{
 const engine=api();assert.deepEqual(engine.createRunV20({seed:17,mode:'rush',inboundDifficulty:'normal'}),start());
 for(const patch of [{mode:'daily'},{mode:'standard'},{mode:'endless'},{inboundDifficulty:'hard'},{inboundDifficulty:'expert'},{inboundDifficulty:null},{guided:true},{guided:null},{toolCharges:null},{toolCharges:{rotate:1,clear:1,wildcard:1}},{toolCharges:{rotate:0,clear:0}},{date:'2026-10-08'},{dailyKey:'today'},{challengeDay:'2026-10-08'},{overtime:true},{seed:1.5},{seed:4294967296}])assert.throws(()=>engine.createRunV20({seed:1,mode:'rush',...patch} as unknown as StartRushV20),JSON.stringify(patch));
});

// Mutation target: creating standard first discards candidate draws or rerolls orders.
test('fixed rush follows the exact daily16 normal opening and cleanup random stream',()=>{
 const engine=api();for(const seed of [0,1,17,123,-2147483648,4294967295]){
  const state=start(seed),raw=createRunV16({seed,mode:'daily',inboundDifficulty:'normal'});assert.deepEqual(engine.asV16(state),raw);assert.deepEqual(engine.fromV16(raw),state);assert.equal(state.nextId,3);assert.equal(state.generatedPieces,0);
  for(const branch of ['orders','placements'] as const){const next=engine.applyCommandV20(state,{type:'chooseCleanup',branch});assert.equal(next.error,undefined);assert.deepEqual(engine.asV16(next.state),applyCommandV16(raw,{type:'chooseCleanup',branch}).state);assert.equal(next.state.generatedPieces,3);assert.deepEqual(next.state.cleanup,{branch,progress:0});}
  for(const command of [{type:'finish'},{type:'place',pieceId:'none',origin:{x:1,y:1}},{type:'clear',cells:[0]},{type:'continueOvertime'}] as RushCommandV20[]){const rejected=engine.applyCommandV20(state,command);assert.ok(rejected.error);assert.equal(rejected.state,state);}
 }
});

// Mutation target: any order stage accidentally uses old hard/expert quantities.
test('actual stage draws cover fixed A ranges and six-percent then all-rush new pieces',()=>{
 const engine=api(),ranges=[[3,4],[3,5],[4,5],[4,6],[5,7]];
 for(const shift of [1,2,3,4,5] as const){const seen=new Set<number>(),[min,max]=ranges[shift-1];
  for(let seed=1;seed<=80;seed++){const raw=engine.asV16({...start(seed),shift,completedOrders:(shift-1)*6,orders:[]});const filled=engine.fromV16(refreshOrdersV16(raw));for(const order of filled.orders){assert.ok(order.amount>=min&&order.amount<=max);seen.add(order.amount);}assert.equal(generationDistributionV16(raw).traits.rush,shift===5?1:.06);}
  assert.ok(seen.has(min));assert.ok(seen.has(max));
 }
 const shapes=new Set<string>();for(let seed=1;seed<=100;seed++){const raw=engine.asV16({...start(),shift:5,completedOrders:24});raw.rngState=createRandomState(Math.imul(seed,0x9e3779b9));const {piece}=generatePieceV16(raw);assert.equal(piece.trait,'rush');assert.equal(piece.rushTurns,3);shapes.add(piece.shapeId);}assert.ok(shapes.has('shape.single'));assert.ok(shapes.size>1);
});

// Mutation target: inheriting a 1.5x/2x score or event multiplier.
test('actual shipments previews and cumulative score stay exactly one times raw',()=>{
 const engine=api(),state=ready();state.rawScore=1;state.score=1;state.orders.push({id:'fixture.machine-order',dockId:'dock.east',cargo:'cargo.machine',amount:3,baseScore:101});for(const cell of [22,23,24])state.board[cell]='cargo.machine';const before=structuredClone(state);
 const raw=applyCommandV16(engine.asV16(state),ship),next=engine.applyCommandV20(state,ship),preview=engine.previewPlacementV20(state,ship.pieceId,ship.origin);assert.equal(next.error,undefined);assert.deepEqual(engine.asV16(next.state),raw.state);assert.equal(next.state.score,next.state.rawScore);assert.deepEqual(next.events,raw.events);assert.equal(next.events.filter(event=>event.type==='shipment').length,2);assert.deepEqual(preview.stateAfter,next.state);assert.deepEqual(preview.events,next.events);assert.deepEqual(state,before);
});

// Mutation target: invalid scores, dates, or a foreign projection are accepted.
test('fixed projections reject unsafe scores and retain immutable valid snapshots',()=>{
 const engine=api(),state=ready(),raw=engine.asV16(state),before=structuredClone(state);
 for(const patch of [{rulesetVersion:19},{runConfigId:'run.rush_v19.hard'},{inboundDifficulty:'hard'},{inboundDifficulty:'expert'},{mode:'daily'},{guided:true},{rawScore:undefined},{rawScore:-1},{rawScore:1.5},{rawScore:Number.MAX_SAFE_INTEGER+1},{score:1},{seed:1.5},{overtime:true},{toolCharges:{rotate:1,clear:1,wildcard:1}},{usedToolIds:['rotate','rotate']},{date:'2026-10-08'},{challengeDay:'2026-10-08'}])assert.throws(()=>engine.asV16({...state,...patch} as never));
 for(const patch of [{rulesetVersion:20},{runConfigId:'run.inbound_v16.hard'},{mode:'standard'},{inboundDifficulty:'hard'},{guided:true},{rawScore:0},{score:-1},{score:1.5},{score:Number.MAX_SAFE_INTEGER+1},{overtime:true}])assert.throws(()=>engine.fromV16({...raw,...patch} as never));
 assert.throws(()=>engine.applyCommandV20({...state,rawScore:Number.MAX_SAFE_INTEGER,score:Number.MAX_SAFE_INTEGER},ship),RangeError);assert.deepEqual(state,before);
});

// Mutation target: drawing replacements before the thirtieth shipment or retroactively changing old pieces.
test('stage five only changes new pieces and order thirty stops before refill or overtime',()=>{
 const engine=api();for(const completed of [5,23,29]){const state=ready(completed),next=engine.applyCommandV20(state,ship);assert.equal(next.error,undefined);assert.deepEqual(engine.asV16(next.state),applyCommandV16(engine.asV16(state),ship).state);assert.equal(next.state.rawScore,301);assert.equal(next.state.score,301);
  if(completed===23){assert.equal(next.state.shift,5);assert.equal(next.state.candidates[0].trait,'rush');assert.deepEqual(next.state.candidates.slice(1),state.candidates.slice(1));}
  if(completed===29){assert.equal(next.state.result,'won');assert.equal(next.state.completedOrders,30);assert.deepEqual(next.state.rngState,state.rngState);assert.equal(next.state.generatedPieces,state.generatedPieces);assert.equal(next.state.nextId,state.nextId);assert.deepEqual(next.state.candidates,state.candidates.slice(1));assert.ok(engine.applyCommandV20(next.state,{type:'continueOvertime'}).error);}
 }
});

// Mutation target: expiring before shipping or clearing new waste during the same placement.
test('two-order and six-placement cleanup precede expiry while shipments clear hazard waste',()=>{
 const engine=api();for(const branch of ['orders','placements'] as const){const state=ready();state.cleanup={branch,progress:branch==='orders'?1:5};state.successfulPlacements=3;for(const cell of [8,9,10])state.cellTraits[cell]={kind:'rush',remaining:1,bornAtPlacement:1};state.board[0]='cargo.chem';state.cellTraits[0]={kind:'waste'};state.board[36]='cargo.cold';state.cellTraits[36]={kind:'rush',remaining:1,bornAtPlacement:1};const next=engine.applyCommandV20(state,ship);assert.deepEqual(next.events.map(event=>event.type),['placed','shipment','cleanup','rushExpired']);assert.equal(next.state.board[0],null);assert.equal(next.state.cellTraits[8],null);assert.deepEqual(next.state.cellTraits[36],{kind:'waste'});assert.deepEqual(next.state.cleanup,{branch,progress:0});}
 const hazardous=ready();hazardous.cellTraits[8]={kind:'hazard'};hazardous.board[1]='cargo.chem';hazardous.cellTraits[1]={kind:'waste'};const next=engine.applyCommandV20(hazardous,ship);assert.equal(next.state.board[1],null);assert.deepEqual(next.events.find(event=>event.type==='shipment')?.extraClearedCells,[1]);
});

// Mutation target: partial multishape survivors stop sharing their original deadline.
test('partial multi-cell rush survives and expires together without failed moves aging it',()=>{
 const engine=api();let state=input();state.successfulPlacements=1;for(const cell of [0,2]){state.board[cell]='cargo.machine';state.cellTraits[cell]={kind:'rush',remaining:3,bornAtPlacement:1};}
 for(let index=0;index<3;index++){state.orders=[];state.candidates[0]={id:`fixture.single.${index}`,shapeId:'shape.single',cargo:'cargo.chem',quarterTurns:0};const bad=engine.applyCommandV20(state,{type:'place',pieceId:state.candidates[0].id,origin:{x:0,y:0}});assert.ok(bad.error);assert.equal(bad.state,state);state=engine.applyCommandV20(state,{type:'place',pieceId:state.candidates[0].id,origin:{x:5,y:3+index}}).state;if(index<2)assert.deepEqual([state.cellTraits[0]?.remaining,state.cellTraits[2]?.remaining],[2-index,2-index]);}
 assert.deepEqual(state.cellTraits[0],{kind:'waste'});assert.deepEqual(state.cellTraits[2],{kind:'waste'});
});

// Mutation target: tools consume a placement, RNG draw, cleanup interval, or more than two charges.
test('two finite tools preserve frozen use semantics and rescue without daily restrictions',()=>{
 const engine=api();for(const charges of [{rotate:1,clear:1,wildcard:0},{rotate:1,clear:0,wildcard:1},{rotate:0,clear:1,wildcard:1}] as const)assert.deepEqual(engine.createRunV20({seed:17,mode:'rush',toolCharges:charges}).toolCharges,charges);
 let state=input();state.toolCharges={rotate:1,clear:0,wildcard:1};state.candidates[0].shapeId='shape.i4_h';state.rawScore=101;state.score=101;const before=structuredClone(state);
 for(const command of [{type:'rotate',pieceId:state.candidates[0].id,quarterTurns:1},{type:'wildcard',pieceId:state.candidates[1].id}] as const){const raw=applyToolV16({...engine.asV16(state),mode:'standard'},command),next=engine.applyCommandV20(state,command);assert.equal(next.error,undefined);assert.deepEqual(engine.asV16(next.state),{...raw.state,mode:'daily'});assert.deepEqual(next.events,raw.events);state=next.state;}
 for(const field of ['rngState','cellTraits','cleanup','rawScore','score','orders','successfulPlacements','completedOrders','generatedPieces'] as const)assert.deepEqual(state[field],before[field]);assert.deepEqual(state.usedToolIds,['rotate','wildcard']);assert.ok(engine.applyCommandV20(state,{type:'wildcard',pieceId:state.candidates[1].id}).error);
 const blocked=input();blocked.toolCharges={rotate:0,clear:1,wildcard:0};const reserved=reservedEntryCellsV16(blocked);blocked.board=blocked.board.map((_,cell)=>reserved.includes(cell)?null:'cargo.food');blocked.cellTraits=blocked.board.map(cell=>cell===null?null:{kind:'waste'});blocked.candidates=blocked.candidates.map((piece,index)=>({...piece,shapeId:'shape.single',id:`rescue.${index}`}));assert.equal(engine.findLegalMovesV20(blocked).length,0);const plan=engine.findRescuePlanV20(blocked);assert.deepEqual(plan,findRescuePlanV16({...engine.asV16(blocked),mode:'standard'}));assert.ok(plan?.length);const settled=engine.settlePhaseV20(blocked);assert.equal(settled.phase,'rescue');assert.equal(settled.result,null);const rescued=engine.applyCommandV20(settled,plan![0]);assert.equal(rescued.error,undefined);assert.equal(rescued.state.toolCharges.clear,0);assert.ok(engine.findLegalMovesV20(rescued.state).length);
});

// Mutation target: replay/compaction changes score identity or draws twice.
test('natural traces replay hash restore and compact with fixed raw scores',async()=>{
 const engine=api(),replay=await import('../src/domain/v20/replay.ts').catch(()=>null);assert.ok(replay,'Fixed rush replay must exist');const options={seed:17,mode:'rush' as const};let state=start(),raw=createRunV16({seed:17,mode:'daily'});const commands:RushCommandV20[]=[],trace:{index:number;checksum:string}[]=[];
 for(let index=0;index<12&&state.result===null;index++){const command:RushCommandV20=index===0?{type:'chooseCleanup',branch:'orders'}:{type:'place',...engine.findLegalMovesV20(state)[0]};const next=engine.applyCommandV20(JSON.parse(JSON.stringify(state)) as RushRunV20,command);assert.equal(next.error,undefined);state=next.state;raw=applyCommandV16(raw,command).state;commands.push(command);trace.push({index:state.commandIndex,checksum:replay.checksumV20(state)});assert.deepEqual(engine.asV16(state),raw);}
 assert.ok(commands.length>=6);assert.deepEqual(replay.replayV20(options,commands),{state,trace});assert.notEqual(replay.checksumV20(state),checksumV16(raw));assert.equal(replay.checksumV20({...state,elapsedMs:100,runSerial:9,maxOccupancy:45}),replay.checksumV20(state));assert.notEqual(replay.checksumV20({...state,commandIndex:state.commandIndex+1}),replay.checksumV20(state));assert.throws(()=>replay.checksumV20({...state,rawScore:state.rawScore+1}));assert.throws(()=>replay.replayV20(options,[{type:'finish'}]),/Replay command 1/);
 state.commandIndex=130;state.commandBaseIndex=0;state.commands=Array.from({length:130},()=>({type:'finish'} as const));const compacted=replay.compactCommandTailV20(state,128);assert.equal(compacted.commands.length,2);assert.equal(compacted.commandBaseIndex,128);assert.equal(replay.checksumV20(compacted),replay.checksumV20(state));for(const through of [-128,1,256,NaN])assert.throws(()=>replay.compactCommandTailV20(state,through));
});

import * as playable from '../src/domain/playable.ts';
// Mutation target: rules20 dispatch falls through to an older engine or accepts a tiered spec.
test('playable bridge recognizes fixed20 and dispatches create commands preview moves and checksums',async()=>{
 assert.equal(typeof playable.isFixedRushV20,'function');const state=playable.createPlayableRun({family:'inbound',rulesetVersion:20,mode:'rush',seed:17,guided:false,toolCharges:{rotate:0,clear:0,wildcard:0}});assert.deepEqual(state,start());assert.ok(playable.isFixedRushV20(state));assert.ok(playable.isInboundRun(state));assert.ok(playable.isTieredInbound(state));
 const stepped=playable.applyPlayableCommand(state,{type:'chooseCleanup',branch:'orders'}).state;assert.deepEqual(stepped,api().applyCommandV20(start(),{type:'chooseCleanup',branch:'orders'}).state);assert.deepEqual(playable.findPlayableMoves(stepped),api().findLegalMovesV20(stepped as RushRunV20));const move=playable.findPlayableMoves(stepped)[0];assert.deepEqual(playable.previewPlayablePlacement(stepped,move.pieceId,move.origin),api().previewPlacementV20(stepped as RushRunV20,move.pieceId,move.origin));const replay=await import('../src/domain/v20/replay.ts');assert.equal(playable.playableChecksum(stepped),replay.checksumV20(stepped as RushRunV20));
 for(const inboundDifficulty of ['hard','expert'])assert.throws(()=>playable.createPlayableRun({family:'inbound',rulesetVersion:20,mode:'rush',seed:17,guided:false,toolCharges:{rotate:0,clear:0,wildcard:0},inboundDifficulty} as never));
});

// Mutation target: a clear command ships immediately, advances rush clocks, or clears the wrong cells.
test('partial rush clearing retains survivor deadlines and waits until placement to ship',()=>{
 const engine=api();let state=input();state.toolCharges={rotate:0,clear:1,wildcard:0};state.orders=[{id:'blocked-order',dockId:'dock.north',cargo:'cargo.food',amount:3,baseScore:100}];state.cleanup={branch:'placements',progress:5};state.successfulPlacements=2;
 for(const cell of [7,8,9,10,11,12,13])state.board[cell]='cargo.machine';for(const cell of [22,23,24])state.board[cell]='cargo.food';for(const cell of [7,8,9])state.cellTraits[cell]={kind:'rush',remaining:1,bornAtPlacement:1};const before=structuredClone(state),step=engine.applyCommandV20(state,{type:'clear',cells:[8,10]});assert.equal(step.error,undefined);state=step.state;
 assert.deepEqual(step.events,[{type:'toolUsed',toolId:'clear',cells:[8,10]}]);assert.equal(state.board[8],null);assert.equal(state.cellTraits[8],null);assert.deepEqual(state.cellTraits[7],before.cellTraits[7]);assert.deepEqual(state.cellTraits[9],before.cellTraits[9]);for(const field of ['rngState','cleanup','rawScore','score','orders','successfulPlacements','completedOrders','generatedPieces'] as const)assert.deepEqual(state[field],before[field],field);
 state.candidates[0]={id:'trigger',shapeId:'shape.single',cargo:'cargo.chem',quarterTurns:0};const placed=engine.applyCommandV20(state,{type:'place',pieceId:'trigger',origin:{x:0,y:0}});assert.equal(placed.error,undefined);assert.equal(placed.state.completedOrders,1);assert.deepEqual(placed.events.find(event=>event.type==='rushExpired'),{type:'rushExpired',cells:[7,9]});
});

// Mutation target: invalid tool input consumes inventory, commands or entropy.
test('bad, equivalent and canceled tool selections preserve the original run',()=>{
 const engine=api(),state=input();state.toolCharges={rotate:1,clear:1,wildcard:0};state.candidates[0].shapeId='shape.square';state.board[8]='cargo.food';const before=structuredClone(state);
 for(const command of [{type:'rotate',pieceId:state.candidates[0].id,quarterTurns:1},{type:'rotate',pieceId:'missing',quarterTurns:1},{type:'clear',cells:[]},{type:'clear',cells:[8,8]},{type:'clear',cells:[49]},{type:'clear',cells:[0]},{type:'clear',cells:[8,9,10]},{type:'wildcard',pieceId:state.candidates[0].id},{type:'cancelTool'}] as RushCommandV20[]){const step=engine.applyCommandV20(state,command);assert.ok(step.error);assert.equal(step.state,state);assert.deepEqual(step.events,[]);assert.deepEqual(state,before);}
});

function blockedRush(kind:'rotate'|'wildcard'|'clear'|'none'):RushRunV20 {
 const state=input();state.board.fill('cargo.machine');for(const cell of reservedEntryCellsV16(state))state.board[cell]=null;
 state.candidates=[{id:'long',shapeId:kind==='clear'?'shape.domino_h':'shape.i4_h',quarterTurns:0,cargo:'cargo.food'}];state.toolCharges={clear:kind==='none'?0:1,rotate:kind==='rotate'?1:0,wildcard:kind==='wildcard'?1:0};state.orders=[];if(kind==='rotate'){state.board[1]=null;state.board[8]=null;}return state;
}

// Mutation target: daily policy reports loss before checking one- or two-tool rescue witnesses.
test('rush settlement offers and executes finite clear plus rotation or wildcard rescue plans',()=>{
 const engine=api();assert.equal(typeof engine.settlePhaseV20,'function');assert.equal(typeof engine.findRescuePlanV20,'function');
 for(const kind of ['rotate','wildcard','clear','none'] as const){const state=blockedRush(kind),before=structuredClone(state),settled=engine.settlePhaseV20(state),plan=engine.findRescuePlanV20(settled);assert.equal(settled.mode,'rush');assert.deepEqual(state,before);
  if(kind==='none'){assert.equal(settled.result,'failed');assert.equal(settled.endReason,'blocked');assert.equal(plan,null);continue;}
  assert.equal(settled.phase,'rescue');assert.equal(settled.result,null);assert.ok(plan);assert.equal(plan.length,kind==='clear'?1:2);assert.deepEqual(plan,findRescuePlanV16({...engine.asV16(state),mode:'standard'}));let rescued=settled;for(const command of plan){const result=engine.applyCommandV20(rescued,command);assert.equal(result.error,undefined);rescued=result.state;}assert.equal(rescued.phase,'input');assert.ok(engine.findLegalMovesV20(rescued).length);assert.deepEqual(rescued.rngState,state.rngState);assert.equal(rescued.successfulPlacements,state.successfulPlacements);assert.equal(rescued.rawScore,state.rawScore);
 }
});

// Mutation target: command and preview retain a false daily blocked result instead of the proven rescue.
test('the actual placement boundary and its preview replace blocked loss with a legal tool rescue',()=>{
 const engine=api();for(const available of [false,true]){const state=blockedRush('clear');state.candidates=[{id:'last',shapeId:'shape.single',quarterTurns:0,cargo:'cargo.food'}];state.board[0]=null;state.shift=5;state.completedOrders=24;state.toolCharges={rotate:0,clear:available?1:0,wildcard:0};const command={type:'place',pieceId:'last',origin:{x:0,y:0}} as const,before=structuredClone(state),raw=applyCommandV16(engine.asV16(state),command);assert.equal(raw.state.result,'failed');const result=engine.applyCommandV20(state,command),preview=engine.previewPlacementV20(state,command.pieceId,command.origin);assert.equal(result.error,undefined);assert.deepEqual(preview.events,result.events);assert.deepEqual(preview.stateAfter,result.state);assert.deepEqual(state,before);
  if(available){assert.equal(result.state.phase,'rescue');assert.equal(result.state.result,null);const event=result.events.find(event=>event.type==='rescue');assert.ok(event);assert.equal(result.events.some(event=>event.type==='result'),false);let rescued=result.state;for(const action of event.plan)rescued=engine.applyCommandV20(rescued,action).state;assert.ok(engine.findLegalMovesV20(rescued).length);}else{assert.equal(result.state.result,'failed');assert.equal(result.events[result.events.length-1]?.type,'result');}
 }
});

// Mutation target: daily challenge identity survives a projection or commands mutate nested frozen data.
test('rush rejects legacy challenge-day identity and safely reduces deeply frozen snapshots',()=>{
 const engine=api(),state=ready(),raw=engine.asV16(state);assert.throws(()=>engine.asV16({...state,challengeDay:'2026-10-07'} as never));assert.throws(()=>engine.fromV16({...raw,challengeDay:'2026-10-07'} as never));
 const freeze=(value:unknown):void=>{if(value&&typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.freeze(value);}};const before=structuredClone(state);freeze(state);const preview=engine.previewPlacementV20(state,ship.pieceId,ship.origin),step=engine.applyCommandV20(state,ship);assert.equal(step.error,undefined);assert.deepEqual(preview.stateAfter,step.state);assert.deepEqual(state,before);
});
