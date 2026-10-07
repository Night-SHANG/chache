import test from 'node:test';
import assert from 'node:assert/strict';

// Mutation target: absence of the permanent rush entry must fail as an assertion.
test('permanent rush has an independent rules19 creation boundary',async()=>{
 const engine=await import('../src/domain/v19/engine.ts').catch(()=>null);
 assert.ok(engine,'Permanent rush rules19 engine must exist');
 const state=engine.createRunV19({seed:17,mode:'rush'});
 assert.equal(state.rulesetVersion,19);
 assert.equal(state.mode,'rush');
 assert.equal(state.runConfigId,'run.rush_v19.hard');
 assert.equal(state.phase,'cleanup');
 assert.deepEqual(state.candidates,[]);
});

import * as engine from '../src/domain/v19/engine.ts';
import {RULES_V19_CONFIG,rushConfigIdV19} from '../src/domain/v19/content.ts';
import {createRandomState} from '../src/domain/random.ts';
import {createRunV16,applyCommandV16} from '../src/domain/v16/engine.ts';
import {generatePieceV16,generationDistributionV16,refreshOrdersV16} from '../src/domain/v16/generation.ts';
import {checksumV16} from '../src/domain/v16/replay.ts';
import {scaledScoreV18} from '../src/domain/v18/content.ts';
import type {InboundRunV16} from '../src/domain/v16/types.ts';
import type {RushRunV19,RushDifficultyV19,StartRushV19,RushCommandV19} from '../src/domain/v19/types.ts';

function domain():typeof engine {
 for(const name of ['applyCommandV19','previewPlacementV19','findLegalMovesV19','asV16','fromV16'])assert.equal(typeof engine[name as keyof typeof engine],'function',`Missing rules19 ${name}`);
 return engine;
}
function start(tier:RushDifficultyV19='hard',seed=17):RushRunV19 {return engine.createRunV19({seed,mode:'rush',inboundDifficulty:tier});}
function input(tier:RushDifficultyV19='hard',branch:'orders'|'placements'='placements'):RushRunV19 {return domain().applyCommandV19(start(tier),{type:'chooseCleanup',branch}).state;}
function ready(completedOrders=0,tier:RushDifficultyV19='hard'):RushRunV19 {
 const state=input(tier);state.completedOrders=completedOrders;state.shift=Math.min(5,Math.floor(completedOrders/6)+1) as RushRunV19['shift'];
 state.candidates=[{id:'fixture.food',shapeId:'shape.single',cargo:'cargo.food',quarterTurns:0},{id:'fixture.machine',shapeId:'shape.single',cargo:'cargo.machine',quarterTurns:0},{id:'fixture.chem',shapeId:'shape.domino_h',cargo:'cargo.chem',quarterTurns:0}];
 state.orders=[{id:'fixture.order',dockId:'dock.north',cargo:'cargo.food',amount:4,baseScore:101}];
 for(const cell of [8,9,10])state.board[cell]='cargo.food';return state;
}
const ship={type:'place',pieceId:'fixture.food',origin:{x:4,y:1}} as const;
function pristine16(seed:number,inboundDifficulty:RushDifficultyV19):InboundRunV16 {
 const template=createRunV16({seed,mode:'standard',inboundDifficulty});
 return refreshOrdersV16({...template,mode:'daily',phase:'cleanup',rngState:createRandomState(seed),nextId:1,orders:[],candidates:[],generatedPieces:0});
}

// Mutation target: accepting daily/standard identities or discarding selected expert tier.
test('rush starts only hard or expert without dates, guidance or overtime',()=>{
 for(const tier of ['hard','expert'] as const){const state=start(tier);assert.equal(state.inboundDifficulty,tier);assert.equal(state.runConfigId,rushConfigIdV19(tier));assert.equal(state.guided,false);assert.equal(state.overtime,false);assert.deepEqual(state.toolCharges,{rotate:0,clear:0,wildcard:0});assert.equal(state.rawScore,0);assert.equal(state.score,0);assert.equal(state.mode,'rush');assert.equal(state.rulesetVersion,19);assert.ok(!Object.keys(state).some(key=>/^(date|daily)/i.test(key)));}
 assert.equal(RULES_V19_CONFIG.rulesetVersion,19);assert.equal(RULES_V19_CONFIG.cleanup.orders,2);assert.equal(RULES_V19_CONFIG.cleanup.placements,6);
 const invalid=[null,{seed:1,mode:'daily'},{seed:1,mode:'standard'},{seed:1,mode:'endless'},{seed:1,mode:'rush',inboundDifficulty:'normal'},{seed:1,mode:'rush',inboundDifficulty:null},{seed:1,mode:'rush',guided:true},{seed:1,mode:'rush',guided:null},{seed:1,mode:'rush',toolCharges:null},{seed:1,mode:'rush',toolCharges:{rotate:1,clear:1,wildcard:1}},{seed:1,mode:'rush',toolCharges:{rotate:0,clear:0}},{seed:1,mode:'rush',date:'2026-10-07'},{seed:1,mode:'rush',dailyKey:'today'},{seed:1,mode:'rush',overtime:true},{seed:1.5,mode:'rush'},{seed:4294967296,mode:'rush'}];
 for(const options of invalid)assert.throws(()=>engine.createRunV19(options as unknown as StartRushV19),JSON.stringify(options));
 assert.throws(()=>rushConfigIdV19('normal' as never));
});

// Mutation target: the wrapper consumes standard candidate draws or normal-tier order draws first.
test('both rush tiers begin with only the actual pristine daily orders and unchanged draw stream',()=>{
 const api=domain();for(const tier of ['hard','expert'] as const)for(const seed of [0,1,17,123,-2147483648,4294967295]){
  const state=start(tier,seed);assert.deepEqual(api.asV16(state),pristine16(seed,tier));assert.deepEqual(state.candidates,[]);assert.equal(state.generatedPieces,0);assert.equal(state.nextId,3);
  assert.deepEqual(api.fromV16(api.asV16(state)),state);
 }
 const state=start();assert.deepEqual(state.rngState,[-2131262522,-1400050838,-1159659991,1556558152]);assert.deepEqual(state.orders.map(order=>order.amount),[4,4]);
});

// Mutation target: skipping cleanup, changing its generation timing, or enabling inventory tools.
test('cleanup is mandatory and both choices generate actual candidates with identical RNG',()=>{
 const api=domain();for(const tier of ['hard','expert'] as const){const state=start(tier),before=structuredClone(state),branches=[];
  for(const command of [{type:'finish'},{type:'place',pieceId:'missing',origin:{x:1,y:1}},{type:'rotate',pieceId:'missing',quarterTurns:1},{type:'clear',cells:[0]},{type:'wildcard',pieceId:'missing'},{type:'continueOvertime'}] as RushCommandV19[]){const result=api.applyCommandV19(state,command);assert.ok(result.error);assert.equal(result.state,state);assert.deepEqual(result.events,[]);}
  for(const branch of ['orders','placements'] as const){const step=api.applyCommandV19(state,{type:'chooseCleanup',branch});assert.equal(step.error,undefined);assert.equal(step.state.phase,'input');assert.deepEqual(step.state.cleanup,{branch,progress:0});assert.equal(step.state.generatedPieces,3);assert.equal(step.state.candidates.length,3);assert.deepEqual(api.asV16(step.state),applyCommandV16(pristine16(17,tier),{type:'chooseCleanup',branch}).state);assert.ok(api.applyCommandV19(step.state,{type:'chooseCleanup',branch}).error);branches.push(step.state);}
  assert.deepEqual(branches[0].candidates,branches[1].candidates);assert.deepEqual(branches[0].rngState,branches[1].rngState);assert.deepEqual(state,before);
 }
});

// Mutation target: replacing tier ranges with normal ranges or changing daily rush shape/color generation.
test('all five stages retain C/B order ranges and six-percent then all-rush generation',()=>{
 const api=domain(),ranges={hard:[[4,4],[4,5],[5,5],[5,6],[6,7]],expert:[[4,5],[4,6],[5,6],[5,7],[6,8]]};
 for(const tier of ['hard','expert'] as const)for(const shift of [1,2,3,4,5] as const){const seen=new Set<number>(),[min,max]=ranges[tier][shift-1];
  for(let seed=1;seed<=40;seed++){const state={...start(tier,seed),shift,completedOrders:(shift-1)*6,orders:[]},raw=api.asV16(state),filled=api.fromV16(refreshOrdersV16(raw));for(const order of filled.orders){assert.ok(order.amount>=min&&order.amount<=max);seen.add(order.amount);}assert.deepEqual(api.fromV16(refreshOrdersV16(api.asV16(filled))).orders,filled.orders);assert.equal(generationDistributionV16(raw).traits.rush,shift===5?1:.06);}
  assert.ok(seen.has(min));assert.ok(seen.has(max));
 }
 const shapes=new Set<string>(),cargos=new Set<string>();for(let seed=1;seed<=200;seed++){const state={...start('expert'),shift:5 as const,completedOrders:24},raw=api.asV16(state);raw.rngState=createRandomState(Math.imul(seed,0x9e3779b9));const draw=generatePieceV16(raw);assert.equal(draw.piece.trait,'rush');assert.equal(draw.piece.rushTurns,3);shapes.add(draw.piece.shapeId);cargos.add(draw.piece.cargo);}
 assert.ok(shapes.has('shape.single'));assert.ok(shapes.size>1);assert.equal(cargos.size,5);
});

// Mutation target: projecting displayed scores as raw or rounding each shipment separately.
test('actual commands and previews scale cumulative scores and per-event carry once',()=>{
 const api=domain();for(const tier of ['hard','expert'] as const){const state=ready(0,tier);state.rawScore=1;state.score=scaledScoreV18(1,tier);state.orders.push({id:'fixture.machine-order',dockId:'dock.east',cargo:'cargo.machine',amount:3,baseScore:101});for(const cell of [22,23,24])state.board[cell]='cargo.machine';const before=structuredClone(state);
  const raw=applyCommandV16(api.asV16(state),ship),step=api.applyCommandV19(state,ship),preview=api.previewPlacementV19(state,ship.pieceId,ship.origin);assert.equal(step.error,undefined);assert.deepEqual(preview.stateAfter,step.state);assert.deepEqual(preview.events,step.events);assert.deepEqual(api.asV16(step.state),raw.state);assert.equal(step.state.score,scaledScoreV18(raw.state.score,tier));assert.deepEqual(state,before);
  let cumulative=1;const expected=raw.events.filter(event=>event.type==='shipment').map(event=>{const previous=scaledScoreV18(cumulative,tier);cumulative+=event.score;return scaledScoreV18(cumulative,tier)-previous;});assert.equal(expected.length,2);assert.deepEqual(step.events.filter(event=>event.type==='shipment').map(event=>event.score),expected);
  const second=ready(0,tier);second.rawScore=step.state.rawScore;second.score=step.state.score;const again=api.applyCommandV19(second,ship);assert.equal(again.state.rawScore,step.state.rawScore+101);assert.equal(again.state.score,scaledScoreV18(again.state.rawScore,tier));
 }
});

// Mutation target: foreign identities, tool stock, overtime, or inconsistent/unsafe scores pass projection.
test('projection rejects foreign identities and malformed scores without mutating input',()=>{
 const api=domain();for(const tier of ['hard','expert'] as const){const state=ready(0,tier),raw=api.asV16(state),before=structuredClone(state);
  for(const patch of [{rulesetVersion:18},{runConfigId:'run.inbound_v18.hard'},{runConfigId:'run.rush_v19.normal'},{inboundDifficulty:'normal'},{mode:'daily'},{mode:'standard'},{guided:true},{guided:undefined},{rawScore:undefined},{rawScore:-1},{rawScore:1.5},{rawScore:Number.MAX_SAFE_INTEGER},{score:1},{seed:null},{seed:1.5},{seed:4294967296},{overtime:true},{toolCharges:{rotate:1,clear:1,wildcard:1}},{usedToolIds:['rotate','clear','wildcard']},{date:'2026-10-07'},{dailyKey:'today'}])assert.throws(()=>api.asV16({...state,...patch} as never));
  for(const patch of [{rulesetVersion:19},{runConfigId:'run.inbound_v16'},{mode:'standard'},{mode:'rush'},{inboundDifficulty:'normal'},{guided:true},{rawScore:0},{score:-1},{score:1.5},{score:Number.MAX_SAFE_INTEGER},{toolCharges:{rotate:1,clear:1,wildcard:1}},{overtime:true}])assert.throws(()=>api.fromV16({...raw,...patch} as never));
  const maximum=tier==='hard'?6004799503160661:4503599627370495;const large={...state,rawScore:maximum,score:scaledScoreV18(maximum,tier)};assert.throws(()=>api.applyCommandV19(large,ship),RangeError);assert.equal(large.rawScore,maximum);assert.deepEqual(state,before);
 }
});

// Mutation target: new stage draws happen before final settlement or replace surviving tray entries.
test('stage five changes only newly drawn pieces and order thirty wins without unused refills',()=>{
 const api=domain();for(const tier of ['hard','expert'] as const)for(const completed of [5,23,29]){const state=ready(completed,tier),before=structuredClone(state),step=api.applyCommandV19(state,ship);assert.equal(step.error,undefined);assert.deepEqual(api.asV16(step.state),applyCommandV16(api.asV16(state),ship).state);assert.equal(step.state.rawScore,301);assert.equal(step.state.score,scaledScoreV18(301,tier));assert.deepEqual(state,before);
  if(completed===23){assert.equal(step.state.shift,5);assert.equal(step.state.candidates[0].trait,'rush');assert.equal(step.state.candidates[0].rushTurns,3);assert.deepEqual(step.state.candidates.slice(1),state.candidates.slice(1));}
  if(completed===29){assert.equal(step.state.result,'won');assert.equal(step.state.endReason,'completed');assert.equal(step.state.completedOrders,30);assert.deepEqual(step.state.rngState,state.rngState);assert.equal(step.state.nextId,state.nextId);assert.equal(step.state.generatedPieces,state.generatedPieces);assert.deepEqual(step.state.candidates,state.candidates.slice(1));const rejected=api.applyCommandV19(step.state,{type:'continueOvertime'});assert.ok(rejected.error);assert.equal(rejected.state,step.state);}
 }
});

// Mutation target: expiring before shipment or cleaning fresh waste during the same placement.
test('shipment and cleanup settle before expiry using the actual two-order and six-placement intervals',()=>{
 const api=domain();for(const branch of ['orders','placements'] as const){const state=ready();state.cleanup={branch,progress:branch==='orders'?1:5};state.successfulPlacements=3;for(const cell of [8,9,10])state.cellTraits[cell]={kind:'rush',remaining:1,bornAtPlacement:1};state.board[0]='cargo.chem';state.cellTraits[0]={kind:'waste'};state.board[36]='cargo.cold';state.cellTraits[36]={kind:'rush',remaining:1,bornAtPlacement:1};
  const step=api.applyCommandV19(state,ship);assert.equal(step.error,undefined);assert.deepEqual(step.events.map(event=>event.type),['placed','shipment','cleanup','rushExpired']);assert.equal(step.state.board[0],null);assert.equal(step.state.cellTraits[8],null);assert.deepEqual(step.state.cellTraits[36],{kind:'waste'});assert.deepEqual(step.state.cleanup,{branch,progress:0});
 }
});

// Mutation target: surviving cells from a partial multi-cell rush lose their shared deadline.
test('partial multishape rush survivors tick and expire together while failed commands do not age them',()=>{
 const api=domain();let state=input();state.orders=[];state.successfulPlacements=1;for(const cell of [0,2]){state.board[cell]='cargo.machine';state.cellTraits[cell]={kind:'rush',remaining:3,bornAtPlacement:1};}
 for(let index=0;index<3;index++){state.orders=[];state.candidates[0]={id:`fixture.single.${index}`,shapeId:'shape.single',cargo:'cargo.chem',quarterTurns:0};const bad=api.applyCommandV19(state,{type:'place',pieceId:state.candidates[0].id,origin:{x:0,y:0}});assert.ok(bad.error);assert.equal(bad.state,state);const step=api.applyCommandV19(state,{type:'place',pieceId:state.candidates[0].id,origin:{x:5,y:3+index}});assert.equal(step.error,undefined);state=step.state;
  if(index<2)assert.deepEqual([state.cellTraits[0]?.remaining,state.cellTraits[2]?.remaining],[2-index,2-index]);else assert.deepEqual(step.events.find(event=>event.type==='rushExpired'),{type:'rushExpired',cells:[0,2]});
 }
 assert.deepEqual(state.cellTraits[0],{kind:'waste'});assert.deepEqual(state.cellTraits[2],{kind:'waste'});assert.equal(state.cellTraits[1],null);
});

// Mutation target: adapter chooses different legal moves, mutates snapshots, or breaks replay identity.
test('natural production traces retain daily16 behavior and survive JSON restore and replay',async()=>{
 const api=domain(),replay=await import('../src/domain/v19/replay.ts').catch(()=>null);assert.ok(replay,'Missing rules19 replay');
 for(const tier of ['hard','expert'] as const){const options={seed:17,mode:'rush' as const,inboundDifficulty:tier};let state=api.createRunV19(options),raw=pristine16(17,tier);const commands:RushCommandV19[]=[],trace:{index:number;checksum:string}[]=[];
  for(let index=0;index<12&&state.result===null;index++){const command:RushCommandV19=index===0?{type:'chooseCleanup',branch:'orders'}:{type:'place',...api.findLegalMovesV19(state)[0]},before=structuredClone(state);const step=api.applyCommandV19(JSON.parse(JSON.stringify(state)) as RushRunV19,command),rawStep=applyCommandV16(raw,command);assert.equal(step.error,undefined);assert.equal(rawStep.error,undefined);state=step.state;raw=rawStep.state;commands.push(command);trace.push({index:state.commandIndex,checksum:replay.checksumV19(state)});assert.deepEqual(api.asV16(state),raw);assert.equal(state.score,scaledScoreV18(raw.score,tier));assert.deepEqual(api.asV16(before).rngState,before.rngState);}
  assert.ok(commands.length>=6);const result=replay.replayV19(options,commands);assert.deepEqual(result.state,state);assert.deepEqual(result.trace,trace);assert.notEqual(replay.checksumV19(state),checksumV16(raw));assert.equal(replay.checksumV19({...state,elapsedMs:100,runSerial:9,maxOccupancy:49}),replay.checksumV19(state));assert.notEqual(replay.checksumV19({...state,commandIndex:state.commandIndex+1}),replay.checksumV19(state));assert.notEqual(replay.checksumV19({...state,rawScore:state.rawScore+1,score:scaledScoreV18(state.rawScore+1,tier)}),replay.checksumV19(state));assert.throws(()=>replay.checksumV19({...state,rawScore:state.rawScore+1}));assert.throws(()=>replay.replayV19(options,[{type:'finish'}]),/Replay command 1/);
 }
});

// Mutation target: compacting a command window alters its game identity or permits invalid prefixes.
test('128-command tail compaction preserves gameplay and safe score state',async()=>{
 const api=domain(),replay=await import('../src/domain/v19/replay.ts').catch(()=>null);assert.ok(replay,'Missing rules19 replay');const state=input();state.commandIndex=130;state.commandBaseIndex=0;state.commands=Array.from({length:130},()=>({type:'finish'} as const));state.rawScore=101;state.score=151;const before=structuredClone(state),compacted=replay.compactCommandTailV19(state,128);
 assert.equal(compacted.commandBaseIndex,128);assert.equal(compacted.commands.length,2);assert.equal(replay.checksumV19(compacted),replay.checksumV19(state));assert.deepEqual(api.asV16(compacted).score,101);assert.deepEqual(state,before);for(const through of [-128,1,256,NaN])assert.throws(()=>replay.compactCommandTailV19(state,through));assert.throws(()=>replay.compactCommandTailV19({...state,commandBaseIndex:1},128));assert.throws(()=>replay.compactCommandTailV19({...state,score:152},128));
});

import {reservedEntryCellsV16} from '../src/domain/v16/board.ts';
import {applyToolV16,findRescuePlanV16} from '../src/domain/v16/tools.ts';

// Mutation target: permanent rush silently drops legal stocked tools or accepts a third tool.
test('rush accepts any two distinct stocked tools and preserves exact frozen tool semantics',()=>{
 const api=domain();for(const charges of [{rotate:1,clear:1,wildcard:0},{rotate:1,clear:0,wildcard:1},{rotate:0,clear:1,wildcard:1}] as const){const pristine=api.createRunV19({seed:17,mode:'rush',toolCharges:charges});assert.deepEqual(pristine.toolCharges,charges);for(const command of [{type:'rotate',pieceId:'none',quarterTurns:1},{type:'clear',cells:[0]},{type:'wildcard',pieceId:'none'}] as RushCommandV19[])assert.ok(api.applyCommandV19(pristine,command).error);}
 let state=input();state.toolCharges={rotate:1,clear:0,wildcard:1};state.candidates[0].shapeId='shape.i4_h';state.successfulPlacements=7;state.cleanup={branch:'placements',progress:5};state.rawScore=101;state.score=151;state.board[0]='cargo.food';state.cellTraits[0]={kind:'rush',remaining:1,bornAtPlacement:3};const before=structuredClone(state);
 for(const command of [{type:'rotate',pieceId:state.candidates[0].id,quarterTurns:1},{type:'wildcard',pieceId:state.candidates[1].id}] as const){const raw=applyToolV16({...api.asV16(state),mode:'standard'},command),step=api.applyCommandV19(state,command);assert.equal(step.error,undefined);assert.deepEqual(api.asV16(step.state),{...raw.state,mode:'daily'});assert.deepEqual(step.events,raw.events);state=step.state;}
 for(const field of ['rngState','cellTraits','cleanup','rawScore','score','orders','successfulPlacements','completedOrders','generatedPieces'] as const)assert.deepEqual(state[field],before[field],field);assert.deepEqual(state.usedToolIds,['rotate','wildcard']);assert.equal(state.commandIndex,before.commandIndex+2);assert.equal(state.mode,'rush');const repeated=api.applyCommandV19(state,{type:'wildcard',pieceId:state.candidates[2].id});assert.ok(repeated.error);assert.equal(repeated.state,state);
});

// Mutation target: a clear command ships immediately, advances rush clocks, or clears the wrong cells.
test('partial rush clearing retains survivor deadlines and waits until placement to ship',()=>{
 const api=domain();let state=input();state.toolCharges={rotate:0,clear:1,wildcard:0};state.orders=[{id:'blocked-order',dockId:'dock.north',cargo:'cargo.food',amount:3,baseScore:100}];state.cleanup={branch:'placements',progress:5};state.successfulPlacements=2;
 for(const cell of [7,8,9,10,11,12,13])state.board[cell]='cargo.machine';for(const cell of [22,23,24])state.board[cell]='cargo.food';for(const cell of [7,8,9])state.cellTraits[cell]={kind:'rush',remaining:1,bornAtPlacement:1};const before=structuredClone(state),step=api.applyCommandV19(state,{type:'clear',cells:[8,10]});assert.equal(step.error,undefined);state=step.state;
 assert.deepEqual(step.events,[{type:'toolUsed',toolId:'clear',cells:[8,10]}]);assert.equal(state.board[8],null);assert.equal(state.cellTraits[8],null);assert.deepEqual(state.cellTraits[7],before.cellTraits[7]);assert.deepEqual(state.cellTraits[9],before.cellTraits[9]);for(const field of ['rngState','cleanup','rawScore','score','orders','successfulPlacements','completedOrders','generatedPieces'] as const)assert.deepEqual(state[field],before[field],field);
 state.candidates[0]={id:'trigger',shapeId:'shape.single',cargo:'cargo.chem',quarterTurns:0};const placed=api.applyCommandV19(state,{type:'place',pieceId:'trigger',origin:{x:0,y:0}});assert.equal(placed.error,undefined);assert.equal(placed.state.completedOrders,1);assert.deepEqual(placed.events.find(event=>event.type==='rushExpired'),{type:'rushExpired',cells:[7,9]});
});

// Mutation target: invalid tool input consumes inventory, commands or entropy.
test('bad, equivalent and canceled tool selections preserve the original run',()=>{
 const api=domain(),state=input();state.toolCharges={rotate:1,clear:1,wildcard:0};state.candidates[0].shapeId='shape.square';state.board[8]='cargo.food';const before=structuredClone(state);
 for(const command of [{type:'rotate',pieceId:state.candidates[0].id,quarterTurns:1},{type:'rotate',pieceId:'missing',quarterTurns:1},{type:'clear',cells:[]},{type:'clear',cells:[8,8]},{type:'clear',cells:[49]},{type:'clear',cells:[0]},{type:'clear',cells:[8,9,10]},{type:'wildcard',pieceId:state.candidates[0].id},{type:'cancelTool'}] as RushCommandV19[]){const step=api.applyCommandV19(state,command);assert.ok(step.error);assert.equal(step.state,state);assert.deepEqual(step.events,[]);assert.deepEqual(state,before);}
});

function blockedRush(kind:'rotate'|'wildcard'|'clear'|'none'):RushRunV19 {
 const state=input();state.board.fill('cargo.machine');for(const cell of reservedEntryCellsV16(state))state.board[cell]=null;
 state.candidates=[{id:'long',shapeId:kind==='clear'?'shape.domino_h':'shape.i4_h',quarterTurns:0,cargo:'cargo.food'}];state.toolCharges={clear:kind==='none'?0:1,rotate:kind==='rotate'?1:0,wildcard:kind==='wildcard'?1:0};state.orders=[];if(kind==='rotate'){state.board[1]=null;state.board[8]=null;}return state;
}

// Mutation target: daily policy reports loss before checking one- or two-tool rescue witnesses.
test('rush settlement offers and executes finite clear plus rotation or wildcard rescue plans',()=>{
 const api=domain();assert.equal(typeof api.settlePhaseV19,'function');assert.equal(typeof api.findRescuePlanV19,'function');
 for(const kind of ['rotate','wildcard','clear','none'] as const){const state=blockedRush(kind),before=structuredClone(state),settled=api.settlePhaseV19(state),plan=api.findRescuePlanV19(settled);assert.equal(settled.mode,'rush');assert.deepEqual(state,before);
  if(kind==='none'){assert.equal(settled.result,'failed');assert.equal(settled.endReason,'blocked');assert.equal(plan,null);continue;}
  assert.equal(settled.phase,'rescue');assert.equal(settled.result,null);assert.ok(plan);assert.equal(plan.length,kind==='clear'?1:2);assert.deepEqual(plan,findRescuePlanV16({...api.asV16(state),mode:'standard'}));let rescued=settled;for(const command of plan){const result=api.applyCommandV19(rescued,command);assert.equal(result.error,undefined);rescued=result.state;}assert.equal(rescued.phase,'input');assert.ok(api.findLegalMovesV19(rescued).length);assert.deepEqual(rescued.rngState,state.rngState);assert.equal(rescued.successfulPlacements,state.successfulPlacements);assert.equal(rescued.rawScore,state.rawScore);
 }
});

// Mutation target: command and preview retain a false daily blocked result instead of the proven rescue.
test('the actual placement boundary and its preview replace blocked loss with a legal tool rescue',()=>{
 const api=domain();for(const available of [false,true]){const state=blockedRush('clear');state.candidates=[{id:'last',shapeId:'shape.single',quarterTurns:0,cargo:'cargo.food'}];state.board[0]=null;state.shift=5;state.completedOrders=24;state.toolCharges={rotate:0,clear:available?1:0,wildcard:0};const command={type:'place',pieceId:'last',origin:{x:0,y:0}} as const,before=structuredClone(state),raw=applyCommandV16(api.asV16(state),command);assert.equal(raw.state.result,'failed');const result=api.applyCommandV19(state,command),preview=api.previewPlacementV19(state,command.pieceId,command.origin);assert.equal(result.error,undefined);assert.deepEqual(preview.events,result.events);assert.deepEqual(preview.stateAfter,result.state);assert.deepEqual(state,before);
  if(available){assert.equal(result.state.phase,'rescue');assert.equal(result.state.result,null);const event=result.events.find(event=>event.type==='rescue');assert.ok(event);assert.equal(result.events.some(event=>event.type==='result'),false);let rescued=result.state;for(const action of event.plan)rescued=api.applyCommandV19(rescued,action).state;assert.ok(api.findLegalMovesV19(rescued).length);}else{assert.equal(result.state.result,'failed');assert.equal(result.events[result.events.length-1]?.type,'result');}
 }
});

// Mutation target: daily challenge identity survives a projection or commands mutate nested frozen data.
test('rush rejects legacy challenge-day identity and safely reduces deeply frozen snapshots',()=>{
 const api=domain(),state=ready(),raw=api.asV16(state);assert.throws(()=>api.asV16({...state,challengeDay:'2026-10-07'} as never));assert.throws(()=>api.fromV16({...raw,challengeDay:'2026-10-07'} as never));
 const freeze=(value:unknown):void=>{if(value&&typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.freeze(value);}};const before=structuredClone(state);freeze(state);const preview=api.previewPlacementV19(state,ship.pieceId,ship.origin),step=api.applyCommandV19(state,ship);assert.equal(step.error,undefined);assert.deepEqual(preview.stateAfter,step.state);assert.deepEqual(state,before);
});
