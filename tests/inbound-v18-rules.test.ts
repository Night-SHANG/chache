import test from 'node:test';
import assert from 'node:assert/strict';
import {createRandomState,nextRandom} from '../src/domain/random.ts';
import {createRunV16} from '../src/domain/v16/engine.ts';
import {generationDistributionV16,refreshOrdersV16} from '../src/domain/v16/generation.ts';
import {applyCommandV16} from '../src/domain/v16/engine.ts';
import {reservedEntryCellsV16} from '../src/domain/v16/board.ts';
import {checksumV16} from '../src/domain/v16/replay.ts';
import {RULES_V18_CONFIG,inboundConfigIdV18,isInboundDifficultyV18,scaledScoreV18} from '../src/domain/v18/content.ts';
import {applyCommandV18,createRunV18,asV16,fromV16,findLegalMovesV18,previewPlacementV18} from '../src/domain/v18/engine.ts';
import {checksumV18,compactCommandTailV18,replayV18} from '../src/domain/v18/replay.ts';
import type {InboundCommandV18,InboundRunV18,StartV18} from '../src/domain/v18/types.ts';

function boundary(completedOrders:number,mode:StartV18['mode']='standard',inboundDifficulty:InboundRunV18['inboundDifficulty']='hard'):InboundRunV18 {
 let state=createRunV18({seed:17,mode,inboundDifficulty});if(mode==='daily')state=applyCommandV18(state,{type:'chooseCleanup',branch:'placements'}).state;
 state.completedOrders=completedOrders;state.shift=Math.min(5,Math.floor(completedOrders/6)+1) as InboundRunV18['shift'];
 state.candidates=[{id:'test.food',shapeId:'shape.single',cargo:'cargo.food',quarterTurns:0},{id:'test.machine',shapeId:'shape.single',cargo:'cargo.machine',quarterTurns:0,trait:'pallet'},{id:'test.chem',shapeId:'shape.domino_h',cargo:'cargo.chem',quarterTurns:0}];
 state.orders=[{id:'test.order.food',dockId:'dock.north',cargo:'cargo.food',amount:4,baseScore:101},{id:'test.order.machine',dockId:'dock.east',cargo:'cargo.machine',amount:3,baseScore:101}];
 return state;
}
const shipmentCommand={type:'place',pieceId:'test.food',origin:{x:4,y:1}} as const;
function readyFood(state:InboundRunV18):InboundRunV18 {const next=structuredClone(state);next.candidates[0]={id:'test.food',shapeId:'shape.single',cargo:'cargo.food',quarterTurns:0};next.orders=[{id:'test.order.food',dockId:'dock.north',cargo:'cargo.food',amount:4,baseScore:101}];for(const cell of [8,9,10])next.board[cell]='cargo.food';return next;}

// Mutation target: accidentally retaining ordinary16 entry or allowing professional daily.
test('rules18 creates only hard and expert, fixes daily to hard, and rejects malformed starts',()=>{
 for(const mode of ['standard','daily','endless'] as const){const state=createRunV18({seed:123,mode});assert.equal(state.inboundDifficulty,'hard');assert.equal(state.rulesetVersion,18);assert.equal(state.runConfigId,'run.inbound_v18.hard');assert.equal(state.mode,mode);assert.equal(state.guided,false);assert.equal(state.rawScore,0);assert.equal(state.score,0);}
 for(const inboundDifficulty of ['hard','expert'] as const)for(const mode of ['standard','endless'] as const){const state=createRunV18({seed:123,mode,inboundDifficulty});assert.equal(state.runConfigId,inboundConfigIdV18(inboundDifficulty));}
 for(const options of [null,{seed:1,mode:'daily',inboundDifficulty:'expert'},{seed:1,mode:'standard',inboundDifficulty:'normal'},{seed:1,mode:'standard',inboundDifficulty:null},{seed:1,mode:'standard',guided:true},{seed:1,mode:['standard']},{seed:1,mode:'standard',guided:null},{seed:1,mode:'standard',toolCharges:null},{seed:1,mode:'daily',toolCharges:{rotate:1,clear:0,wildcard:0}},{seed:1.5,mode:'standard'},{seed:4294967296,mode:'standard'}])assert.throws(()=>createRunV18(options as unknown as StartV18));
 assert.equal(isInboundDifficultyV18('normal'),false);assert.equal(isInboundDifficultyV18(['hard']),false);assert.equal(isInboundDifficultyV18('hard'),true);assert.throws(()=>inboundConfigIdV18('normal' as never));assert.equal(RULES_V18_CONFIG.rulesetVersion,18);
});

// Mutation target: drawing A orders/candidates and then patching amounts corrupts the initial RNG.
test('daily hard opening follows pristine seed C order draws and delays candidates until cleanup',()=>{
 for(const seed of [0,1,17,123,-2147483648,4294967295]){
  const state=createRunV18({seed,mode:'daily'}),template=createRunV16({seed,mode:'standard',inboundDifficulty:'hard'});
  const pristine={...template,mode:'daily' as const,phase:'cleanup' as const,rngState:createRandomState(seed),nextId:1,orders:[],candidates:[],generatedPieces:0};
  const expected=refreshOrdersV16(pristine);assert.deepEqual(asV16(state),expected);assert.deepEqual(state.orders.map(order=>order.amount),[4,4]);assert.deepEqual(state.candidates,[]);assert.equal(state.generatedPieces,0);assert.equal(state.nextId,3);
 }
 // pure-rand still consumes an actual draw when min === max; C's [4,4] draws must remain.
 const random=createRandomState(17),draw=nextRandom(random,4,4);assert.equal(draw.value,4);assert.notDeepEqual(draw.state,random);
});

// Mutation target: using daily/ordinaryA initialization for direct endless changes tier RNG.
test('standard and direct endless retain the selected frozen16 opening generation',()=>{
 for(const inboundDifficulty of ['hard','expert'] as const){const expected=createRunV16({seed:17,mode:'standard',inboundDifficulty});assert.deepEqual(asV16(createRunV18({seed:17,mode:'standard',inboundDifficulty})),expected);assert.deepEqual(asV16(createRunV18({seed:17,mode:'endless',inboundDifficulty})),{...expected,mode:'endless'});}
});

// Mutation target: multiplying the full number first can round a valid safe result incorrectly.
test('score scales cumulative integers exactly and rejects unsafe inputs or results',()=>{
 for(const [tier,numerator,denominator] of [['hard',3n,2n],['expert',2n,1n]] as const){for(const raw of [0,1,2,3,101,4503599627370495,4503599627370496,6004799503160660,6004799503160661,6004799503160662]){const expected=BigInt(raw)*numerator/denominator;if(expected>BigInt(Number.MAX_SAFE_INTEGER))assert.throws(()=>scaledScoreV18(raw,tier));else assert.equal(scaledScoreV18(raw,tier),Number(expected));}assert.throws(()=>scaledScoreV18(Number.MAX_SAFE_INTEGER,tier));}
 for(const raw of [-1,NaN,Infinity,1.5,Number.MAX_SAFE_INTEGER+1])assert.throws(()=>scaledScoreV18(raw,'hard'));assert.throws(()=>scaledScoreV18(1,'normal' as never));
});

// Mutation target: projecting displayed score back into16 or retaining rawScore multiplies twice.
test('score projections preserve raw cumulative score, strict identity and input immutability',()=>{
 for(const inboundDifficulty of ['hard','expert'] as const){const raw=createRunV16({seed:17,mode:'standard',inboundDifficulty});raw.score=101;const before=structuredClone(raw),state=fromV16(raw);assert.equal(state.rawScore,101);assert.equal(state.score,inboundDifficulty==='hard'?151:202);assert.deepEqual(asV16(state),raw);assert.equal(Object.prototype.hasOwnProperty.call(asV16(state),'rawScore'),false);assert.deepEqual(raw,before);
  for(const patch of [{rulesetVersion:16},{runConfigId:'run.inbound_v18.expert',inboundDifficulty:'hard'},{inboundDifficulty:'normal'},{inboundDifficulty:['hard']},{mode:['standard']},{mode:'daily',inboundDifficulty:'expert',runConfigId:'run.inbound_v18.expert'},{guided:true},{guided:undefined},{rawScore:undefined},{rawScore:-1},{rawScore:1.5},{score:state.score+1}])assert.throws(()=>asV16({...state,...patch} as never));
  for(const patch of [{rulesetVersion:18},{runConfigId:'run.inbound_v16'},{inboundDifficulty:'normal'},{mode:['standard']},{guided:true},{rawScore:101},{score:-1},{score:1.5},{score:Number.MAX_SAFE_INTEGER}])assert.throws(()=>fromV16({...raw,...patch} as never));
 }
});

// Mutation target: rounding each odd shipment separately loses the accumulated half-point.
test('actual shipment events are cumulative floor differences across commands and within a chain',()=>{
 for(const tier of ['hard','expert'] as const){
  const initial=readyFood(boundary(0,'standard',tier)),before=structuredClone(initial),rawFirst=applyCommandV16(asV16(initial),shipmentCommand),first=applyCommandV18(initial,shipmentCommand);
  assert.equal(first.error,undefined);assert.deepEqual(rawFirst.events.filter(event=>event.type==='shipment').map(event=>event.score),[101]);assert.equal(first.state.rawScore,101);assert.equal(first.state.score,scaledScoreV18(101,tier));assert.deepEqual(first.events.filter(event=>event.type==='shipment').map(event=>event.score),[scaledScoreV18(101,tier)]);assert.deepEqual(initial,before);
  const secondInput=readyFood(first.state),second=applyCommandV18(secondInput,shipmentCommand);assert.equal(second.state.rawScore,202);assert.equal(second.state.score,scaledScoreV18(202,tier));assert.deepEqual(second.events.filter(event=>event.type==='shipment').map(event=>event.score),[scaledScoreV18(202,tier)-scaledScoreV18(101,tier)]);
  const chain=readyFood(boundary(0,'standard',tier));chain.orders.push({id:'chain.machine',dockId:'dock.east',cargo:'cargo.machine',amount:3,baseScore:101});for(const cell of [22,23,24])chain.board[cell]='cargo.machine';
  const rawChain=applyCommandV16(asV16(chain),shipmentCommand),actual=applyCommandV18(chain,shipmentCommand);let cumulative=chain.rawScore;const expected=rawChain.events.filter(event=>event.type==='shipment').map(event=>{const previous=scaledScoreV18(cumulative,tier);cumulative+=event.score;return scaledScoreV18(cumulative,tier)-previous;});assert.equal(expected.length,2);assert.deepEqual(actual.events.filter(event=>event.type==='shipment').map(event=>event.score),expected);assert.deepEqual(asV16(actual.state),rawChain.state);
 }
});

// Mutation target: a stage/win bonus is omitted or multiplied again after projecting a saved score.
test('stage and victory bonuses scale once while final shipment consumes no unused random draws',()=>{
 for(const tier of ['hard','expert'] as const)for(const mode of ['standard','daily','endless'] as const){if(mode==='daily'&&tier==='expert')continue;
  for(const completed of [5,29]){const state=readyFood(boundary(completed,mode,tier));state.rawScore=1;state.score=scaledScoreV18(1,tier);const raw=applyCommandV16(asV16(state),shipmentCommand),actual=applyCommandV18(state,shipmentCommand);assert.equal(actual.error,undefined);assert.deepEqual(asV16(actual.state),raw.state);assert.equal(actual.state.score,scaledScoreV18(raw.state.score,tier));assert.equal(actual.state.rawScore,completed===5||completed===29&&mode!=='endless'?302:102);
   assert.deepEqual(actual.events.filter(event=>event.type==='shipment').map(event=>event.score),[scaledScoreV18(102,tier)-scaledScoreV18(1,tier)]);
   if(completed===29&&mode!=='endless'){assert.equal(actual.state.result,'won');assert.deepEqual(actual.state.rngState,state.rngState);assert.equal(actual.state.nextId,state.nextId);assert.equal(actual.state.generatedPieces,state.generatedPieces);assert.deepEqual(actual.state.candidates,state.candidates.slice(1));}else{assert.equal(actual.state.result,null);assert.equal(actual.state.generatedPieces,state.generatedPieces+1);}
  }
 }
});

// Mutation target: continuing professional/hard is rejected, changes tier, or adds another victory bonus.
test('both tiers continue the same standard run into overtime, refill normally, and retire as won',()=>{
 for(const tier of ['hard','expert'] as const){const won=applyCommandV18(readyFood(boundary(29,'standard',tier)),shipmentCommand).state;const before=structuredClone(won),continued=applyCommandV18(won,{type:'continueOvertime'});assert.equal(continued.error,undefined);assert.equal(continued.state.overtime,true);assert.equal(continued.state.phase,'input');assert.equal(continued.state.result,null);assert.equal(continued.state.endReason,null);assert.equal(continued.state.inboundDifficulty,tier);assert.equal(continued.state.runConfigId,won.runConfigId);assert.equal(continued.state.seed,won.seed);assert.equal(continued.state.rawScore,won.rawScore);assert.equal(continued.state.score,won.score);assert.equal(continued.state.commandIndex,won.commandIndex+1);assert.deepEqual(continued.state.commands[continued.state.commands.length-1],{type:'continueOvertime'});assert.deepEqual(continued.events,[{type:'overtimeStarted'}]);assert.equal(continued.state.orders.length,4);assert.equal(continued.state.candidates.length,3);assert.deepEqual(continued.state.candidates.slice(0,2),won.candidates);assert.ok(continued.state.candidates.every(piece=>piece.trait!=='rush'));assert.equal(continued.state.cleanup,null);assert.deepEqual(won,before);
  const next=applyCommandV18(readyFood(continued.state),shipmentCommand);assert.equal(next.state.result,null);assert.equal(next.state.rawScore,won.rawScore+101);const retired=applyCommandV18(next.state,{type:'finish'});assert.equal(retired.state.result,'won');assert.equal(retired.state.endReason,'retired');assert.equal(retired.state.rawScore,next.state.rawScore);
 }
 for(const state of [boundary(0),{...boundary(30),phase:'result' as const,result:'failed' as const,endReason:'blocked' as const},{...boundary(30,'daily'),phase:'result' as const,result:'won' as const,endReason:'completed' as const},{...boundary(30,'endless'),phase:'result' as const,result:'won' as const,endReason:'completed' as const}]){const rejected=applyCommandV18(state,{type:'continueOvertime'});assert.ok(rejected.error);assert.equal(rejected.state,state);assert.deepEqual(rejected.events,[]);}
});

// Mutation target: special overtime settlement loses blocked/rescue events or spends points on probing.
test('overtime boundary preserves rescue and failure settlement events and score',()=>{
 for(const tier of ['hard','expert'] as const)for(const rescuable of [true,false]){const won=boundary(30,'standard',tier);won.phase='result';won.result='won';won.endReason='completed';won.rawScore=101;won.score=scaledScoreV18(101,tier);won.board.fill('cargo.cold');for(const cell of reservedEntryCellsV16(asV16(won)))won.board[cell]=null;won.toolCharges={rotate:0,clear:rescuable?1:0,wildcard:0};const next=applyCommandV18(won,{type:'continueOvertime'});assert.equal(next.error,undefined);assert.equal(next.state.rawScore,101);assert.equal(next.state.score,won.score);assert.equal(next.state.phase,rescuable?'rescue':'result');assert.equal(next.events[0].type,'overtimeStarted');assert.equal(next.events[1].type,rescuable?'rescue':'result');if(rescuable){const rescue=next.events.find(event=>event.type==='rescue');assert.ok(rescue);let rescued=next.state;for(const command of rescue.plan){const result=applyCommandV18(rescued,command);assert.equal(result.error,undefined);rescued=result.state;}assert.equal(rescued.phase,'input');assert.ok(findLegalMovesV18(rescued).length);assert.equal(rescued.rawScore,101);}else{assert.equal(next.state.result,'failed');assert.equal(next.state.endReason,'blocked');}}
});

// Mutation target: preview/raw event projections mutate input or error paths replace the original state.
test('preview and command errors preserve immutable input, matching scaled actual placement',()=>{
 const state=readyFood(boundary(0)),before=structuredClone(state),preview=previewPlacementV18(state,shipmentCommand.pieceId,shipmentCommand.origin),actual=applyCommandV18(state,shipmentCommand);assert.equal(preview.valid,true);assert.deepEqual(preview.stateAfter,actual.state);assert.deepEqual(preview.events,actual.events);assert.deepEqual(preview.shipments,actual.events.filter(event=>event.type==='shipment'));assert.deepEqual(state,before);
 for(const command of [{type:'place',pieceId:'missing',origin:{x:0,y:0}},{type:'chooseCleanup',branch:'orders'},{type:'clear',cells:[8]},{type:'bogus'},null] as const){const rejected=applyCommandV18(state,command as unknown as InboundCommandV18);assert.ok(rejected.error);assert.equal(rejected.state,state);assert.deepEqual(rejected.events,[]);assert.deepEqual(state,before);}
 const invalid=previewPlacementV18(state,'missing',{x:0,y:0});assert.equal(invalid.valid,false);assert.equal(invalid.stateAfter,undefined);assert.deepEqual(invalid.events,[]);
 for(const operation of [(corrupt:InboundRunV18)=>applyCommandV18(corrupt,shipmentCommand),(corrupt:InboundRunV18)=>previewPlacementV18(corrupt,shipmentCommand.pieceId,shipmentCommand.origin),(corrupt:InboundRunV18)=>findLegalMovesV18(corrupt)])assert.throws(()=>operation({...state,score:state.score+1}));
});

// Mutation target: selecting hard daily changes the frozen piece generator or draws before cleanup.
test('daily cleanup branches generate identical frozen candidates and retain all special probabilities',()=>{
 const state=createRunV18({seed:123,mode:'daily'}),orders=applyCommandV18(state,{type:'chooseCleanup',branch:'orders'}),placements=applyCommandV18(state,{type:'chooseCleanup',branch:'placements'});assert.equal(orders.error,undefined);assert.deepEqual(orders.state.candidates,placements.state.candidates);assert.deepEqual(orders.state.rngState,placements.state.rngState);assert.deepEqual(orders.state.orders,state.orders);assert.deepEqual(orders.events,[{type:'cleanupChosen',branch:'orders'}]);assert.deepEqual(asV16(orders.state),applyCommandV16(asV16(state),{type:'chooseCleanup',branch:'orders'}).state);
 for(const mode of ['standard','daily','endless'] as const)for(const shift of [1,2,3,4,5] as const){const input=boundary((shift-1)*6,mode),traits=generationDistributionV16(asV16(input)).traits;assert.equal(traits.rush,mode==='daily'?shift===5?1:.06:0);assert.equal(traits.hazard,shift<3||mode==='daily'&&shift===5?0:.03);assert.equal(traits.pallet,shift<3||mode==='daily'&&shift===5?0:.05);assert.equal(traits.wildcard,shift<3||mode==='daily'&&shift===5?0:.01);}
});

// Mutation target: replaying a18 run through16 changes identity/score and loses rounding carry.
test('actual seed4 shipment replay pins raw, scaled event, RNG and checksum traces',()=>{
 const options={seed:4,mode:'standard' as const,inboundDifficulty:'hard' as const},commands:InboundCommandV18[]=[],scores:number[]=[],eventScores:number[][]=[],checksums:string[]=[];let state=createRunV18(options);
 for(let index=0;index<6;index++){const command={type:'place' as const,...findLegalMovesV18(state)[0]},before=structuredClone(state),step=applyCommandV18(state,command);assert.equal(step.error,undefined);state=step.state;commands.push(command);scores.push(state.rawScore);eventScores.push(step.events.filter(event=>event.type==='shipment').map(event=>event.score));checksums.push(checksumV18(state));assert.deepEqual(before.rngState,asV16(before).rngState);}
 assert.deepEqual(scores,[0,117,117,117,117,234]);assert.deepEqual(eventScores,[[],[175],[],[],[],[176]]);assert.equal(state.score,351);assert.equal(state.completedOrders,2);assert.equal(state.nextId,14);assert.deepEqual(state.rngState,[-777906162,-1984763741,795009368,1789211173]);
 assert.deepEqual(checksums,['2b48c2ed','c29846f9','b78119aa','d567d8aa','750fdf43','3d012907']);
 const replayed=replayV18(options,commands);assert.deepEqual(replayed.state,state);assert.deepEqual(replayed.trace,checksums.map((checksum,index)=>({index:index+1,checksum})));assert.notEqual(checksumV18(state),checksumV16(asV16(state)));assert.equal(checksumV18({...state,elapsedMs:1000,runSerial:99,maxOccupancy:49}),checksumV18(state));assert.throws(()=>checksumV18({...state,rawScore:state.rawScore+1}));assert.throws(()=>replayV18(options,[{type:'chooseCleanup',branch:'orders'}]),/Replay command 1/);assert.throws(()=>replayV18({seed:17,mode:'daily'},[{type:'finish'}]),/Replay command 1/);
});

// A recorded seed17 route-policy prefix, played with the real hard endless engine and no injected state.
const LONG_HARD_MOVES='111 113 211 241 202 031 022 211 151 042 140 033 213 212 131 121 225 112 055 254 045 011 022 031 011 012 011 011 022 011 041 233 042 231 011 023 011 031 031 033 043 033 043 051 021 244 011 043 214 014 035 014 044 144 143 115 100 011 012 251 211 033 142 004 235 225 241 210 051 131 005 044 011 014 011 251 211 021 041 051 032 013 211 122 211 213 114 142 144 113 122 131 011 144 034 016 064 002 121 141 231 200 221 211 231 134 113 211 225 031 242 224 141 132 141 111 031 011 231 214 233 211 012 241 214 210 012 053 023 011'.split(' ').map(text=>text.split('').map(Number));

// Mutation target: tail compaction changes gameplay checksum/raw score or loses accepted commands.
test('130 real endless commands compact and replay with the same cumulative score and gameplay checksum',()=>{
 const options={seed:17,mode:'endless' as const};let full=createRunV18(options),window=full;const commands:InboundCommandV18[]=[];
 assert.deepEqual(compactCommandTailV18(full,0),full);for(const through of [-128,1,128,NaN])assert.throws(()=>compactCommandTailV18(full,through));
 for(const [slot,x,y] of LONG_HARD_MOVES){const command={type:'place' as const,pieceId:full.candidates[slot].id,origin:{x,y}},step=applyCommandV18(full,command);assert.equal(step.error,undefined);full=step.state;commands.push(command);window=applyCommandV18(JSON.parse(JSON.stringify(window)) as InboundRunV18,command).state;
  if(full.commandIndex===128){const before=structuredClone(window);window=compactCommandTailV18(window,128);assert.deepEqual(before,full);assert.equal(window.commands.length,0);assert.equal(window.commandBaseIndex,128);assert.equal(window.rawScore,full.rawScore);assert.throws(()=>compactCommandTailV18(window,0));}
  assert.equal(checksumV18(window),checksumV18(full));assert.ok(reservedEntryCellsV16(asV16(full)).every(cell=>full.board[cell]===null));
 }
 assert.equal(full.commandIndex,130);assert.equal(full.completedOrders,54);assert.equal(full.rawScore,11421);assert.equal(full.score,17131);assert.equal(full.result,null);assert.equal(full.shift,5);assert.equal(window.commands.length,2);assert.deepEqual(full.rngState,[-142051226,1207199586,-1891224682,-1665366384]);assert.equal(full.nextId,192);
 const replayed=replayV18(options,commands);assert.equal(replayed.state.commandBaseIndex,128);assert.deepEqual(replayed.state,window);assert.equal(checksumV18(replayed.state),checksumV18(full));assert.throws(()=>compactCommandTailV18({...window,score:window.score+1},128));assert.throws(()=>compactCommandTailV18({...window,commandBaseIndex:0},128));
});

// Mutation target: daily opening draw differences disappear in an unpinned self-comparison.
test('daily17 pins the C-order initial RNG and actual cleanup candidate draws',()=>{
 const state=createRunV18({seed:17,mode:'daily'});assert.deepEqual(state.rngState,[-2131262522,-1400050838,-1159659991,1556558152]);assert.deepEqual(state.orders,[{id:'order.1',dockId:'dock.north',cargo:'cargo.chem',amount:4,baseScore:100},{id:'order.2',dockId:'dock.east',cargo:'cargo.machine',amount:4,baseScore:100}]);
 const chosen=applyCommandV18(state,{type:'chooseCleanup',branch:'orders'}).state;assert.deepEqual(chosen.rngState,[-1705793849,-1090482004,-1978728591,949655036]);assert.deepEqual(chosen.candidates,[{id:'piece.3',shapeId:'shape.single',cargo:'cargo.chem',quarterTurns:0},{id:'piece.4',shapeId:'shape.l3_se',cargo:'cargo.chem',quarterTurns:0},{id:'piece.5',shapeId:'shape.l3_nw',cargo:'cargo.machine',quarterTurns:0}]);assert.equal(chosen.nextId,6);assert.equal(chosen.generatedPieces,3);assert.deepEqual(replayV18({seed:17,mode:'daily'},[{type:'chooseCleanup',branch:'orders'}]).state,chosen);
});

// Mutation target: a tier/mode projection accidentally normalizes stages or professional eight-unit orders.
test('all tier stages sample C/B bounds, retain old orders, and professional endless retains eight units after24',()=>{
 const ranges={hard:[[4,4],[4,5],[5,5],[5,6],[6,7]],expert:[[4,5],[4,6],[5,6],[5,7],[6,8]]};
 for(const tier of ['hard','expert'] as const)for(const mode of ['standard','daily','endless'] as const){if(mode==='daily'&&tier==='expert')continue;
  for(let shift=1;shift<=5;shift++){const [min,max]=ranges[tier][shift-1],seen=new Set<number>();for(let seed=1;seed<=40;seed++){const input=createRunV18({seed,mode,inboundDifficulty:tier});input.shift=shift as InboundRunV18['shift'];input.completedOrders=(shift-1)*6;input.orders=[];const filled=fromV16(refreshOrdersV16(asV16(input)));for(const order of filled.orders){assert.ok(order.amount>=min&&order.amount<=max);seen.add(order.amount);}assert.deepEqual(fromV16(refreshOrdersV16(asV16(filled))).orders,filled.orders);}assert.ok(seen.has(min));assert.ok(seen.has(max));}
 }
 const endless=createRunV18({seed:1,mode:'endless',inboundDifficulty:'expert'});endless.completedOrders=240;endless.shift=5;endless.orders=[];const filled=fromV16(refreshOrdersV16(asV16(endless)));assert.deepEqual(filled.orders.map(order=>order.amount),[7,7,8,7]);const step=applyCommandV18(filled,{type:'place',...findLegalMovesV18(filled)[0]});assert.equal(step.error,undefined);assert.equal(step.state.shift,5);assert.ok(step.state.orders.some(order=>order.amount===8));assert.equal(step.state.result,null);
 let boundary24=createRunV18({seed:6,mode:'endless',inboundDifficulty:'expert'});boundary24.completedOrders=23;boundary24.shift=4;boundary24.orders=[];boundary24=fromV16(refreshOrdersV16(asV16(boundary24)));boundary24=readyFood(boundary24);const transitioned=applyCommandV18(boundary24,shipmentCommand);assert.equal(transitioned.error,undefined);assert.equal(transitioned.state.completedOrders,24);assert.equal(transitioned.state.shift,5);assert.ok(transitioned.state.orders.some(order=>order.amount===8));
});

// Mutation target: tools consume RNG, alter placement clocks, or rescale an existing odd raw score.
test('tools preserve score carry and generator timing while daily tools reject with the original state',()=>{
 for(const tier of ['hard','expert'] as const)for(const mode of ['standard','endless'] as const){const state=boundary(12,mode,tier);state.rawScore=101;state.score=scaledScoreV18(101,tier);state.toolCharges={rotate:1,clear:0,wildcard:1};const before=structuredClone(state),rotated=applyCommandV18(state,{type:'rotate',pieceId:'test.chem',quarterTurns:1});assert.equal(rotated.error,undefined);assert.equal(rotated.state.rawScore,101);assert.equal(rotated.state.score,state.score);assert.equal(rotated.state.successfulPlacements,0);assert.deepEqual(rotated.state.rngState,state.rngState);assert.equal(rotated.state.commandIndex,1);assert.deepEqual(rotated.events,[{type:'toolUsed',toolId:'rotate',pieceId:'test.chem'}]);const wildcard=applyCommandV18(rotated.state,{type:'wildcard',pieceId:'test.chem'});assert.equal(wildcard.error,undefined);assert.equal(wildcard.state.candidates[2].trait,'wildcard');assert.equal(wildcard.state.rawScore,101);assert.equal(wildcard.state.commandIndex,2);assert.deepEqual(wildcard.state.rngState,state.rngState);assert.deepEqual(state,before);
  const repeated=applyCommandV18(wildcard.state,{type:'wildcard',pieceId:'test.chem'});assert.ok(repeated.error);assert.equal(repeated.state,wildcard.state);assert.deepEqual(repeated.events,[]);
 }
 const daily=boundary(12,'daily'),commands:InboundCommandV18[]=[{type:'clear',cells:[8]},{type:'rotate',pieceId:'test.chem',quarterTurns:1},{type:'wildcard',pieceId:'test.chem'}];for(const command of commands){const rejected=applyCommandV18(daily,command);assert.ok(rejected.error);assert.equal(rejected.state,daily);}
});

// Mutation target: tier wrapping changes hazard removal, cleanup-before-expiry or final100 rush draws.
test('daily hazard cleanup and stage-five replacement use exactly the frozen16 event order',()=>{
 const state=readyFood(boundary(12,'daily'));state.candidates[0].trait='hazard';state.cleanup={branch:'placements',progress:5};state.successfulPlacements=3;for(const cell of [0,18]){state.board[cell]='cargo.chem';state.cellTraits[cell]={kind:'waste'};}state.board[36]='cargo.cold';state.cellTraits[36]={kind:'rush',remaining:1,bornAtPlacement:1};const raw=applyCommandV16(asV16(state),shipmentCommand),actual=applyCommandV18(state,shipmentCommand);assert.equal(actual.error,undefined);assert.deepEqual(asV16(actual.state),raw.state);assert.deepEqual(actual.events.map(event=>event.type),['placed','shipment','cleanup','rushExpired']);assert.deepEqual(actual.events.find(event=>event.type==='shipment')?.extraClearedCells,[18]);assert.deepEqual(actual.events.find(event=>event.type==='cleanup')?.cells,[0]);assert.deepEqual(actual.state.cellTraits[36],{kind:'waste'});assert.equal(actual.state.rawScore,101);
 const final=readyFood(boundary(23,'daily')),before=structuredClone(final),step=applyCommandV18(final,shipmentCommand);assert.equal(step.state.shift,5);assert.equal(step.state.completedOrders,24);assert.equal(step.state.candidates[0].trait,'rush');assert.equal(step.state.candidates[0].rushTurns,3);assert.deepEqual(step.state.candidates.slice(1),before.candidates.slice(1));assert.deepEqual(asV16(step.state),applyCommandV16(asV16(final),shipmentCommand).state);
});

// Mutation target: the projection boundary accepts a seed outside the frozen engine's supported identity.
test('projections reject malformed seed identity and commands work with a deeply frozen input',()=>{
 const state=readyFood(boundary(0)),raw=asV16(state);for(const seed of [null,'17',[17],1.5,-2147483649,4294967296]){assert.throws(()=>asV16({...state,seed} as never));assert.throws(()=>fromV16({...raw,seed} as never));}
 const freeze=(value:unknown):void=>{if(value&&typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.freeze(value);}};
 const before=structuredClone(state);freeze(state);const preview=previewPlacementV18(state,shipmentCommand.pieceId,shipmentCommand.origin),actual=applyCommandV18(state,shipmentCommand);assert.equal(actual.error,undefined);assert.deepEqual(preview.stateAfter,actual.state);assert.deepEqual(state,before);assert.equal(actual.state.rawScore,101);assert.equal(actual.state.score,151);
});
