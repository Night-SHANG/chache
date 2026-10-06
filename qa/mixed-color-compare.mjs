/** Independent bounded v5 observations. Imports real rules; never modifies production or tunes ratios. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {existsSync,mkdirSync,readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {dirname,join,relative,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {performance} from 'node:perf_hooks';
import process from 'node:process';
import {createRun,applyCommand,findLegalMoves,previewPlacement} from '../src/domain/engine.ts';
import {collectGroups,neighbors,toIndex,toPoint} from '../src/domain/board.ts';
import {checksum,replayWithTrace} from '../src/domain/replay.ts';
import {pieceCellCargo} from '../src/domain/pieces.ts';
import {createRandomState} from '../src/domain/random.ts';
import {SHAPES} from '../src/domain/rulesets/v1/content.ts';
import {COLOR_EXIT_DOCKS,COLOR_EXIT_ENTRY,COLOR_EXIT_CARGO} from '../src/domain/v4/content.ts';
import {RULES_V5_CONFIG,COLOR_TIERS,MIXED_COLOR_PERCENT,MIXED_COLOR_PATTERNS} from '../src/domain/v5/content.ts';
import {drawPieceRollsV5,generatePieceV5} from '../src/domain/v5/engine.ts';

export const PROTOCOL=Object.freeze({
 id:'mixed-color-compare-v1',rulesetVersion:5,mode:'color_exit',strategy:'per_cell_route_group',
 tiers:['entry','middle','late'],mixedPercent:{entry:20,middle:30,late:40},
 seedStart:1,seedEnd:100,fullGames:300,maxCommands:600,generatorSeed:6062026,generatorSamplesPerTier:10000,
 rules:{balanced:false,boardSize:7,candidateCount:3,minBatch:4,targetBatches:30,batchesPerStage:6,stageCount:5,pointsPerCell:10},
 selection:'One untuned fixed heuristic, all tiers. Lexicographic minimum [post-resolution south-entry occupied, post-resolution ready gate groups lacking empty entry route, -immediate batches, -immediate shipped cells, -routeGroupScore, mean actual placed-cell distance to own gate]. routeGroupScore = reachable empty cells + 3 * surviving own-gate-connected cells + 2 * same-color contacts with old cargo - mean own-gate distance - surviving occupancy. Every distance and contact uses pieceCellCargo at its actual cell, never only piece.cargo.',
 observation:'Current board, three candidates, static gates, phase and rules identity only; seed, RNG state, generated counter, future candidate and future draw are hidden. All legal placements are previewed without speculative applyCommand.',
 tieBreak:'Stable engine order: candidate index, origin y, origin x. Equal scores retain the first move; no random tie-breaking, rotation, search or autoplay tuning.',
 generation:'Counts include the three initial candidates and every actual replacement, including unselected held pieces. Winning placement ends before replacement, so its final held count is two. Selected counts are reported separately.',
 partial:'Immediate partial mixed placement: 0 < current mixed piece cells shipped < 4 after the complete chain. Separate per-event partial mixed-piece count records a mixed piece touched by a shipment with own cells still remaining just after that event (including earlier pieces and within-chain temporary halves). Partial shipment batches count batches with >=1 such piece; they are not number of all cells shipped.',
 chains:'Chain length is shipment events per accepted placement. Long chain means >=2; full 0/1/2/3 distribution and maximum are retained.',
 generatorSampling:'Separate generator-only stream of 10000 pieces per tier, seed6062026, starting at generation ordinal1. Identical raw RNG cursor; contexts cycle empty/checkerboard/full and shift rises 1..5 in equal spans. Each tier retains a rolling three-piece tray. Every generation verifies exact threshold selection, shared four raw draws, nested mixed sets and cursor equality. Checkerboard/full cannot fit a 2x2; mixed generation must still occur without fallback.',
 validation:'Real root createRun/applyCommand and preview per command. Every completed or capped run is replayed from seed/tier/commands with every checksum and full final state compared exactly. Failure requires blocked endReason and zero legal moves. Generated = selected + final-held for both kinds.',
 limitations:'Only 100 matched seeds, one hand-written heuristic, no human play. Same seed and generation ordinal share raw draws, but tier-dependent retained candidates, board states, stages and branches produce different weighted supplies and played sequences. No claim of optimality, fun, causal difficulty ranking, or old100002-run coverage of v5. Caps are inconclusive, never losses. No ratio or frozen-rule changes.',
});

const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const ENTRY=toIndex(COLOR_EXIT_ENTRY.entry);
const sum=values=>values.reduce((a,b)=>a+b,0);
const kind=piece=>piece.cellCargos===undefined?'pure':'mixed';
const counts=()=>({pure:0,mixed:0});
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const gateFor=cargo=>COLOR_EXIT_DOCKS.find(gate=>gate.cargo===cargo);
const percent=(n,d)=>d?`${(100*n/d).toFixed(2)}%`:'未观察';

export function assertProtocol(){
 assert.deepEqual(COLOR_TIERS,PROTOCOL.tiers);assert.deepEqual(MIXED_COLOR_PERCENT,PROTOCOL.mixedPercent);
 for(const [key,value] of Object.entries(PROTOCOL.rules))assert.equal(RULES_V5_CONFIG[key],value,`Frozen rule drift: ${key}`);
 assert.equal(RULES_V5_CONFIG.rulesetVersion,5);assert.equal(RULES_V5_CONFIG.runConfigId,'run.color_exit_mix_v5');
 assert.deepEqual(COLOR_EXIT_ENTRY.entry,{x:3,y:6});
 assert.deepEqual(COLOR_EXIT_DOCKS.map(gate=>[gate.cargo,gate.entry]),[['cargo.food',{x:3,y:0}],['cargo.chem',{x:6,y:3}],['cargo.machine',{x:0,y:3}]]);
 assert.equal(MIXED_COLOR_PATTERNS.length,12);return true;
}

function observation(state){
 if(state.rulesetVersion!==5||state.mode!=='color_exit')throw Error('Comparison supports only v5 color_exit');
 return {rulesetVersion:5,mode:'color_exit',colorTier:state.colorTier,runConfigId:state.runConfigId,phase:state.phase,
  board:state.board,candidates:state.candidates,orders:state.orders,
  seed:0,rngState:[0,0,0,0],commands:[],commandIndex:0,nextId:0,generatedPieces:0,
  cellTraits:Array(49).fill(null),upgrades:[],upgradeChoices:[],shift:1,score:0,completedOrders:0,lastChain:0,maxChain:0,result:null,overtime:false,endReason:null};
}

function reachableEmpty(board){
 if(board[ENTRY]!==null)return new Set();
 const seen=new Set([ENTRY]),queue=[ENTRY];
 for(let cursor=0;cursor<queue.length;cursor++)for(const next of neighbors(queue[cursor]))if(board[next]===null&&!seen.has(next)){seen.add(next);queue.push(next);}
 return seen;
}

/** Exported measured features make the protocol auditable without changing the live rules. */
export function inspectMove(state,move){
 const view=observation(state),piece=view.candidates.find(p=>p.id===move.pieceId);
 assert.ok(piece,'Missing selected piece');
 const preview=previewPlacement(view,move.pieceId,move.origin);assert.equal(preview.valid,true,'Illegal move in heuristic');
 const distances=preview.cells.map((cell,index)=>{const point=toPoint(cell),gate=gateFor(pieceCellCargo(piece,index));assert.ok(gate);return Math.abs(point.x-gate.entry.x)+Math.abs(point.y-gate.entry.y);});
 const meanGateDistance=sum(distances)/distances.length;
 const sameColorContacts=sum(preview.cells.map((cell,index)=>neighbors(cell).filter(next=>view.board[next]===pieceCellCargo(piece,index)).length));
 const board=[...view.board];for(const [index,cell] of preview.cells.entries())board[cell]=pieceCellCargo(piece,index);
 for(const shipment of preview.shipments)for(const cell of shipment.cells)board[cell]=null;
 const reachable=reachableEmpty(board),gateGroups=collectGroups(board).filter(group=>group.cells.includes(toIndex(gateFor(group.cargo).entry)));
 const gateConnectedCells=sum(gateGroups.map(group=>group.cells.length));
 const blockedReadyExits=gateGroups.filter(group=>group.cells.length>=PROTOCOL.rules.minBatch&&!group.cells.some(cell=>neighbors(cell).some(next=>reachable.has(next)))).length;
 const occupiedCells=board.filter(Boolean).length,batches=preview.shipments.length,shippedCells=sum(preview.shipments.map(shipment=>shipment.cells.length));
 const routeGroupScore=reachable.size+3*gateConnectedCells+2*sameColorContacts-meanGateDistance-occupiedCells;
 const features={entryOccupied:board[ENTRY]!==null,blockedReadyExits,batches,shippedCells,reachableEmptyCells:reachable.size,gateConnectedCells,sameColorContacts,meanGateDistance,occupiedCells,routeGroupScore};
 return {score:[Number(features.entryOccupied),blockedReadyExits,-batches,-shippedCells,-routeGroupScore,meanGateDistance],features,projectedBoard:board};
}

function compareScores(left,right){for(let i=0;i<left.length;i++)if(left[i]!==right[i])return left[i]-right[i];return 0;}
export function chooseMove(state){
 const view=observation(state);if(view.phase!=='input')return null;
 let best=null,bestScore=null;
 for(const move of findLegalMoves(view)){const {score}=inspectMove(view,move);if(bestScore===null||compareScores(score,bestScore)<0){best=move;bestScore=score;}}
 return best;
}

/** Shadow piece provenance is diagnostics-only; production intentionally tracks individual cargo cells. */
export function createPieceTracker(){return {owners:new Map(),pieces:new Map()};}
export function trackPlacement(tracker,piece,events,finalBoard){
 const placed=events.find(event=>event.type==='placed');assert.ok(placed);assert.equal(placed.pieceId,piece.id);
 tracker.pieces.set(piece.id,{mixed:kind(piece)==='mixed',cells:new Set(placed.cells)});
 for(const cell of placed.cells){assert.equal(tracker.owners.has(cell),false);tracker.owners.set(cell,piece.id);}
 let partialMixedPieceShipmentEvents=0,partialShipmentBatches=0;
 for(const event of events.filter(event=>event.type==='shipment')){
  const touched=new Set();
  for(const cell of event.cells){const id=tracker.owners.get(cell);if(id!==undefined){touched.add(id);tracker.pieces.get(id).cells.delete(cell);tracker.owners.delete(cell);}}
  let partial=0;
  for(const id of touched){const record=tracker.pieces.get(id);if(record.mixed&&record.cells.size>0)partial++;if(record.cells.size===0&&id!==piece.id)tracker.pieces.delete(id);}
  partialMixedPieceShipmentEvents+=partial;partialShipmentBatches+=Number(partial>0);
 }
 const record=tracker.pieces.get(piece.id),remaining=record.cells.size,isMixed=record.mixed;
 for(const cell of record.cells)assert.notEqual(finalBoard[cell],null,'Metric provenance contradicts real board');
 if(remaining===0)tracker.pieces.delete(piece.id);
 return {partialMixedPieceShipmentEvents,partialShipmentBatches,
  immediatePartialMixedPlacement:Number(isMixed&&remaining>0&&remaining<placed.cells.length),
  immediateFullyShippedMixedPlacement:Number(isMixed&&remaining===0),
  immediateMixedShippedCells:isMixed?placed.cells.length-remaining:0,immediateMixedRemainingCells:isMixed?remaining:0};
}

function registerGenerated(run,pieces){for(const piece of pieces)run.generated[kind(piece)]++;}
export function simulateRun(seed,tier,{maxCommands=PROTOCOL.maxCommands}={}){
 assertProtocol();assert.ok(Number.isInteger(seed)&&seed>=1&&seed<=100,'seed must be 1..100');assert.ok(COLOR_TIERS.includes(tier),'Invalid tier');
 assert.ok(Number.isInteger(maxCommands)&&maxCommands>=1&&maxCommands<=PROTOCOL.maxCommands,'Invalid maxCommands');
 const started=performance.now();let state=createRun(seed,'color_exit',5,tier);
 const run={seed,tier,strategy:PROTOCOL.strategy,status:null,terminal:false,moves:0,batches:0,score:0,peakOccupancy:0,maxChain:0,
  generated:counts(),initialGenerated:counts(),selected:counts(),heldFinal:counts(),chainDistribution:{0:0,1:0,2:0,3:0},longChainPlacements:0,
  immediatePartialMixedPlacement:0,immediateFullyShippedMixedPlacement:0,immediateMixedShippedCells:0,immediateMixedRemainingCells:0,
  partialMixedPieceShipmentEvents:0,partialShipmentBatches:0,
  initialChecksum:checksum(state),previewChecks:0,replayChecks:0,trace:[]};
 registerGenerated(run,state.candidates);run.initialGenerated={...run.generated};const tracker=createPieceTracker();
 while(state.phase!=='result'&&run.moves<maxCommands){
  const move=chooseMove(state);assert.ok(move,'Nonterminal state lacks legal move');
  const piece=state.candidates.find(candidate=>candidate.id===move.pieceId),idsBefore=new Set(state.candidates.map(candidate=>candidate.id));
  const command={type:'place',pieceId:move.pieceId,origin:{...move.origin}},preview=previewPlacement(state,move.pieceId,move.origin);
  const result=applyCommand(state,command);assert.equal(result.error,undefined);assert.equal(result.state.commandIndex,state.commandIndex+1);
  const shipments=result.events.filter(event=>event.type==='shipment');assert.deepEqual(shipments,preview.shipments);run.previewChecks++;
  const metrics=trackPlacement(tracker,piece,result.events,result.state.board);for(const [metric,value] of Object.entries(metrics))run[metric]+=value;
  state=result.state;run.moves++;run.batches+=shipments.length;run.selected[kind(piece)]++;run.chainDistribution[shipments.length]++;run.longChainPlacements+=Number(shipments.length>=2);
  registerGenerated(run,state.candidates.filter(candidate=>!idsBefore.has(candidate.id)));
  run.trace.push({commandIndex:state.commandIndex,command,checksum:checksum(state),selectedKind:kind(piece),batches:shipments.length,
   shippedCells:sum(shipments.map(shipment=>shipment.cells.length)),...metrics});
 }
 const replayed=replayWithTrace(seed,state.commands,'color_exit',5,tier);assert.deepEqual(replayed.state,state);
 assert.deepEqual(replayed.trace,run.trace.map(step=>({commandIndex:step.commandIndex,checksum:step.checksum})));run.replayChecks=replayed.trace.length;
 run.terminal=state.phase==='result';run.status=run.terminal?state.result:'capped';
 if(run.status==='failed'){assert.equal(state.endReason,'blocked');assert.equal(findLegalMoves(state).length,0);}
 if(run.status==='won'){assert.equal(state.endReason,'completed');assert.ok(state.completedOrders>=30&&state.completedOrders<=32);}
 for(const piece of state.candidates)run.heldFinal[kind(piece)]++;
 for(const type of ['pure','mixed'])assert.equal(run.generated[type],run.selected[type]+run.heldFinal[type]);
 assert.equal(run.generated.pure+run.generated.mixed,state.generatedPieces);assert.equal(run.moves,run.selected.pure+run.selected.mixed);assert.equal(run.batches,state.completedOrders);
 run.peakOccupancy=state.maxOccupancy??0;run.maxChain=state.maxChain;run.score=state.score;run.finalChecksum=checksum(state);run.finalState=state;
 run.elapsedMs=performance.now()-started;return run;
}

function distribution(values){
 const sorted=[...values].sort((a,b)=>a-b);if(!sorted.length)return {n:0,min:null,p25:null,median:null,p75:null,max:null,mean:null};
 const quantile=q=>{const index=(sorted.length-1)*q,lo=Math.floor(index);return sorted[lo]+(sorted[Math.ceil(index)]-sorted[lo])*(index-lo);};
 return {n:values.length,min:sorted[0],p25:quantile(.25),median:quantile(.5),p75:quantile(.75),max:sorted.at(-1),mean:sum(values)/values.length};
}
function aggregateRuns(runs){
 const total=field=>sum(runs.map(run=>run[field])),byType=field=>Object.fromEntries(['pure','mixed'].map(type=>[type,sum(runs.map(run=>run[field][type]))]));
 return {runs:runs.length,terminal:runs.filter(run=>run.terminal).length,won:runs.filter(run=>run.status==='won').length,failed:runs.filter(run=>run.status==='failed').length,capped:runs.filter(run=>run.status==='capped').length,
  moves:total('moves'),movesPerRun:distribution(runs.map(run=>run.moves)),batches:total('batches'),batchesPerRun:distribution(runs.map(run=>run.batches)),
  peakOccupancy:distribution(runs.map(run=>run.peakOccupancy)),maxChain:distribution(runs.map(run=>run.maxChain)),
  generated:byType('generated'),initialGenerated:byType('initialGenerated'),selected:byType('selected'),heldFinal:byType('heldFinal'),
  chainDistribution:Object.fromEntries([0,1,2,3].map(chain=>[chain,sum(runs.map(run=>run.chainDistribution[chain]))])),longChainPlacements:total('longChainPlacements'),
  ...Object.fromEntries(['immediatePartialMixedPlacement','immediateFullyShippedMixedPlacement','immediateMixedShippedCells','immediateMixedRemainingCells','partialMixedPieceShipmentEvents','partialShipmentBatches','previewChecks','replayChecks','elapsedMs'].map(field=>[field,total(field)])),
  millisecondsPerRun:distribution(runs.map(run=>run.elapsedMs))};
}

export function runComparison({seeds=100,maxCommands=PROTOCOL.maxCommands,onRun}={}){
 assertProtocol();if(!Number.isInteger(seeds)||seeds<1||seeds>100)throw Error('seeds must be 1..100');
 const runs=[];for(let seed=1;seed<=seeds;seed++)for(const tier of COLOR_TIERS){const run=simulateRun(seed,tier,{maxCommands});runs.push(run);onRun?.(run,runs.length);}
 const outcomeTriples={};for(let i=0;i<runs.length;i+=3){const triple=runs.slice(i,i+3).map(run=>run.status).join('/');outcomeTriples[triple]=(outcomeTriples[triple]??0)+1;}
 return {runs,summary:{protocol:PROTOCOL,seedStart:1,seedEnd:seeds,matchedSeeds:seeds,totalRuns:runs.length,maxCommands,
  tiers:Object.fromEntries(COLOR_TIERS.map(tier=>[tier,aggregateRuns(runs.filter(run=>run.tier===tier))])),outcomeTriples}};
}

export function sampleGenerator({samples=PROTOCOL.generatorSamplesPerTier}={}){
 assert.ok(Number.isInteger(samples)&&samples>=1&&samples<=10000,'samples must be 1..10000');assertProtocol();
 const states=COLOR_TIERS.map(tier=>({...createRun(PROTOCOL.generatorSeed,'color_exit',5,tier),rngState:createRandomState(PROTOCOL.generatorSeed),candidates:[],nextId:1,generatedPieces:0}));
 const totals=Object.fromEntries(COLOR_TIERS.map(tier=>[tier,{generated:counts(),patternCounts:Array(12).fill(0),mixedWhenSquareCannotFit:0,fallbackCount:0}]));
 const records=[],typeRollHistogram=Array(100).fill(0),selectionPatterns={};
 for(let ordinal=1;ordinal<=samples;ordinal++){
  const context=['empty','checkerboard','full'][(ordinal-1)%3],shift=1+Math.min(4,Math.floor((ordinal-1)*5/samples));
  const board=Array.from({length:49},(_,cell)=>context==='empty'||context==='checkerboard'&&(cell%7+Math.floor(cell/7))%2===1?null:COLOR_EXIT_CARGO[cell%3]);
  const square=SHAPES.find(shape=>shape.id==='shape.square');
  const squareCanFit=Array.from({length:36},(_,i)=>({x:i%6,y:Math.floor(i/6)})).some(origin=>square.cells.every(cell=>board[toIndex({x:origin.x+cell.x,y:origin.y+cell.y})]===null));
  const expected=drawPieceRollsV5(states[0].rngState),generated=[];
  for(const [index,tier] of COLOR_TIERS.entries()){
   const state=states[index];state.board=[...board];state.shift=shift;
   const result=generatePieceV5(state);assert.deepEqual(result.rolls,expected.rolls);assert.deepEqual(result.rngState,expected.rngState);
   const isMixed=kind(result.piece)==='mixed';assert.equal(isMixed,result.rolls.typeRoll<=MIXED_COLOR_PERCENT[tier],'Type threshold fallback/drift');
   const total=totals[tier];total.generated[kind(result.piece)]++;if(isMixed){const patternIndex=MIXED_COLOR_PATTERNS.findIndex(pattern=>pattern.every((cargo,i)=>cargo===result.piece.cellCargos[i]));assert.ok(patternIndex>=0);total.patternCounts[patternIndex]++;if(!squareCanFit)total.mixedWhenSquareCannotFit++;}
   if(state.candidates.length<3)state.candidates.push(result.piece);else state.candidates[(ordinal-1)%3]=result.piece;
   state.rngState=result.rngState;state.nextId++;state.generatedPieces++;
   generated.push({kind:kind(result.piece),shapeId:result.piece.shapeId,cargo:result.piece.cargo,...(isMixed?{cellCargos:result.piece.cellCargos}:{})});
  }
  const selection=generated.map(piece=>piece.kind==='mixed'?'1':'0').join('');assert.ok(['000','001','011','111'].includes(selection),'Non-nested mixed selection');
  typeRollHistogram[expected.rolls.typeRoll-1]++;selectionPatterns[selection]=(selectionPatterns[selection]??0)+1;
  records.push({ordinal,context,shift,squareCanFit,rolls:expected.rolls,generated:Object.fromEntries(COLOR_TIERS.map((tier,i)=>[tier,generated[i]]))});
 }
 return {records,summary:{seed:PROTOCOL.generatorSeed,samplesPerTier:samples,totalGenerated:samples*3,rawAlignmentChecks:samples,nestedSelectionChecks:samples,
  typeRollHistogram,selectionPatterns,tiers:totals,contexts:Object.fromEntries(['empty','checkerboard','full'].map(context=>[context,records.filter(record=>record.context===context).length]))}};
}

function filesBelow(folder){return readdirSync(folder,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?filesBelow(join(folder,entry.name)):[join(folder,entry.name)]).sort();}
export function coreSourceBinding(){
 const files=[...filesBelow(join(ROOT,'src/domain')),...filesBelow(join(ROOT,'node_modules/pure-rand/lib/esm')),join(ROOT,'node_modules/pure-rand/package.json')].sort();
 const hashes=Object.fromEntries(files.map(path=>[relative(ROOT,path),sha(readFileSync(path))]));return {sha256:sha(JSON.stringify(hashes)),files:hashes};
}
const describe=d=>`中位 ${d.median}，P25–P75 ${d.p25}–${d.p75}，范围 ${d.min}–${d.max}，均值 ${d.mean.toFixed(2)}`;
export function reportMarkdown(summary,generator,binding,timing){
 const lines=['# v5 三档双色：300局有界经验比较','',
  `同一套固定 heuristic，seed ${summary.seedStart}–${summary.seedEnd} × 入门20% / 中段30% / 后段40%，共 ${summary.totalRuns} 局；每局上限 ${summary.maxCommands} 次有效落子。本次完整模拟耗时 ${(timing.gamesMs/1000).toFixed(2)} 秒，生成器独立抽样 ${(timing.generatorMs/1000).toFixed(2)} 秒。`,'',
  '## 先读结论边界','',
  '仅描述本次机器人策略的样本，不把档名当作已证实的难度，不据此自动调概率，也不能证明休闲度、好玩、最优策略或真人胜率。旧100002局没有覆盖v5，不把旧结果并入本报告。',
  '同seed、同生成序号的四个原始抽签严格相同，类型阈值集合严格嵌套；但候选保留/选择、棋盘存量、阶段和后续分支会分化。整局不是逐件同供货的控制实验，不能把结局差异全归因为比例的因果效应。',
  '所有败局均由真实引擎确认三候选全部无合法落点；cap独立统计为未完成，绝不视为失败。时间是本机测量，不能当成玩家完成时长。','',
  '## 固定协议与口径','',
  '- 共同规则：7×7、三候选保留未选槽、三色单门、南入口空路、每色4邻接且组≥4、30批目标、每6批开放原纯色Shape档。未改生产规则或生成权重。',
  '- 策略在跑样本前写定：最小化 [出完货后南入口占用、达标连门但无空路的组数、负出货批数、负出货格数、负routeGroupScore、放置格各自到本色门的平均距离]。routeGroupScore = 南入口可达空格数 + 3×本色连门货格数 + 2×与旧同色货格接触边数 − 实际逐格平均门距 − 出货后占用。',
  '- 对双色的每一格使用实际颜色计算门距、旧库存同色接触、连通组和出完货后空路。遍历所有合法落点、用真实preview，不试走applyCommand，不看seed/RNG/未来货物。平局顺序固定候选索引→y→x。三档算法/系数完全相同，没有按结果调参。',
  '- 生成数包括开局三件与每次真正补件，连从未选过的保留件也计入；选择数单列。胜局最后落子先结算终局、不补件。每类均核验 生成=选择+终局保留。峰值占用包括放置后、清货前。长链=同次落子出货≥2批。',
  '- 即时半件出货：本次新放双色件的自身4格，在完整连锁后清掉1–3格；绝不把含旧库存的整批格数当成该件清除格数。另列逐shipment的双色件部分清除事件：本次被清且事件后还有自身格子的双色件/事件数；可涉及旧件，也含同链先清半块后清余半的暂存。部分出货批数指含至少一个上述事件的shipment数。',''];
 for(const tier of COLOR_TIERS){const s=summary.tiers[tier],g=s.generated;lines.push(`## ${tier}（逐件双色概率${MIXED_COLOR_PERCENT[tier]}%）`,'',
  `- 终局 / 胜 / 败 / cap：${s.terminal} / ${s.won} / ${s.failed} / ${s.capped}（样本${s.runs}局）`,
  `- 有效落子：${s.moves}；每局${describe(s.movesPerRun)}`,
  `- 出货：${s.batches}批；每局${describe(s.batchesPerRun)}`,
  `- 峰值占用：${describe(s.peakOccupancy)}；最大链：${describe(s.maxChain)}`,
  `- 0/1/2/3链落子数：${[0,1,2,3].map(chain=>s.chainDistribution[chain]).join(' / ')}；长链 ${s.longChainPlacements}/${s.moves}（${percent(s.longChainPlacements,s.moves)}）`,
  `- 生成纯 / 双色：${g.pure} / ${g.mixed}，双色实际占${percent(g.mixed,g.pure+g.mixed)}；其中初始三候选纯 / 双色 ${s.initialGenerated.pure} / ${s.initialGenerated.mixed}`,
  `- 选择纯 / 双色：${s.selected.pure} / ${s.selected.mixed}，双色选择占${percent(s.selected.mixed,s.moves)}；终局保留纯 / 双色 ${s.heldFinal.pure} / ${s.heldFinal.mixed}`,
  `- 新双色即时半件出货：${s.immediatePartialMixedPlacement}/${s.selected.mixed}次选用（${percent(s.immediatePartialMixedPlacement,s.selected.mixed)}）；同落子完整出清 ${s.immediateFullyShippedMixedPlacement}次；新双色在当次连锁共清自身${s.immediateMixedShippedCells}格、留下${s.immediateMixedRemainingCells}格`,
  `- 逐事件双色部分清除：${s.partialMixedPieceShipmentEvents}个件/事件，涉及${s.partialShipmentBatches}/${s.batches}批（${percent(s.partialShipmentBatches,s.batches)}）`,
  `- preview核对 ${s.previewChecks}次；Replay逐步checksum ${s.replayChecks}次，${s.runs}局最终全状态一致；计时 ${(s.elapsedMs/1000).toFixed(2)}秒。`,'');}
 lines.push('## 独立生成器抽样：不是额外完整对局','',
  `seed ${generator.seed}，每档${generator.samplesPerTier}件，合计${generator.totalGenerated}件。从第1次生成抽签开始，含与初始候选同序号的前三次。空盘/无2×2空位棋盘/满盘上下文数量：${generator.contexts.empty}/${generator.contexts.checkerboard}/${generator.contexts.full}。该受控抽样用于概率与无回退检查，与机器人挑选偏差、终局长度无关。`,
  `每个生成序号都检查四个raw rolls和下一个RNG游标跨档完全相同，共${generator.rawAlignmentChecks}组；精确阈值/嵌套检查${generator.nestedSelectionChecks}组；三档混色选择位串(entry/middle/late)计数：${JSON.stringify(generator.selectionPatterns)}。只能出现000、001、011、111。`,'');
 for(const tier of COLOR_TIERS){const s=generator.tiers[tier];lines.push(`- ${tier}：纯${s.generated.pure} / 双色${s.generated.mixed} = ${percent(s.generated.mixed,generator.samplesPerTier)}；12图样计数 ${s.patternCounts.join('/')}；2×2不能落下时仍生成双色${s.mixedWhenSquareCannotFit}次；阈值回退${s.fallbackCount}次。`);}
 lines.push('', '实际比例是逐件独立抽签的经验值，不承诺恰好20/30/40；无回退证据来自逐次精确阈值断言、固定四抽/游标核对和无2×2位置的生成检查。十二图样等概率是固定0..11抽签的规则，这里只记录本样本频数。','',
  '## 配对、证据与复现','',`entry/middle/late终局组合：${JSON.stringify(summary.outcomeTriples)}。`,
  `冻结core SHA-256：${binding.sha256}。manifest.json给出每个domain文件和pure-rand ESM依赖内容的SHA，以及工具、测试、规格和产物SHA；跑前跑后core哈希一致。`,
  '- artifacts/mixed-color-comparison/runs.jsonl：全部300局，含seed/tier、有效命令、每步checksum与统计、最终状态。初始seed与tier足以重新得到候选。',
  '- artifacts/mixed-color-comparison/generator.jsonl：10000个配对生成序号的上下文、四个原始抽签与三档实际货件。',
  '- summary.json与generator-summary.json：完整分布和累计指标；manifest.json：协议、环境、源码/结果指纹与耗时。',
  '- 小协议测试：node --test tests/mixed-color-compare.test.ts（只有短cap/人工局部夹具，未另加完整策略试跑）。',
  '- 已有证据只读核验：node qa/mixed-color-compare.mjs --verify artifacts/mixed-color-comparison（重放已记录命令，不重新运行策略，也不新增完整策略样本）。',
  '- 如另外批准重做相同300局：node qa/mixed-color-compare.mjs --output artifacts/mixed-color-comparison-reproduction。默认拒绝覆盖已有manifest；没有npm/npx、下载、联网或自动调整规则。',
  '', '本报告不选最终档位。应在同包三档真人试玩、特别观察双色残留是否可读、是否容易卡南入口、连锁反馈是否容易理解后，再由用户选档。','');
 return lines.join('\n');
}

export function verifyArtifacts(folder){
 const manifest=JSON.parse(readFileSync(join(folder,'manifest.json'),'utf8'));assert.deepEqual(coreSourceBinding(),manifest.coreSource);
 for(const [file,hash] of Object.entries(manifest.sourceArtifacts))assert.equal(sha(readFileSync(resolve(ROOT,file))),hash,`Tool/spec source drift: ${file}`);
 for(const [file,hash] of Object.entries(manifest.outputs))assert.equal(sha(readFileSync(resolve(ROOT,file))),hash,`Artifact drift: ${file}`);
 let replayChecks=0,runs=0;
 for(const line of readFileSync(join(folder,'runs.jsonl'),'utf8').trim().split('\n')){
  const run=JSON.parse(line),replayed=replayWithTrace(run.seed,run.trace.map(step=>step.command),'color_exit',5,run.tier);
  assert.deepEqual(replayed.state,run.finalState);assert.equal(checksum(replayed.state),run.finalChecksum);
  assert.deepEqual(replayed.trace,run.trace.map(step=>({commandIndex:step.commandIndex,checksum:step.checksum})));replayChecks+=replayed.trace.length;runs++;
 }
 assert.equal(runs,manifest.fullGames);return {runs,replayChecks,coreSha256:manifest.coreSource.sha256,artifactHashes:'matched'};
}

function main(){
 const args=process.argv.slice(2);
 if(args[0]==='--verify'&&args.length===2){process.stdout.write(JSON.stringify(verifyArtifacts(resolve(args[1])),null,2)+'\n');return;}
 if(args.length&&!(args.length===2&&args[0]==='--output'))throw Error('Usage: node qa/mixed-color-compare.mjs [--output directory | --verify directory]');
 const output=resolve(args[1]??join(ROOT,'artifacts/mixed-color-comparison'));
 if(existsSync(join(output,'manifest.json')))throw Error('Existing evidence will not be overwritten. Use --verify, or request an authorized new output run.');
 assertProtocol();const coreSource=coreSourceBinding(),started=performance.now(),createdAt=new Date().toISOString();
 const result=runComparison({onRun:(run,n)=>{if(n%30===0)process.stderr.write(`${n}/300: seed ${run.seed} ${run.tier} ${run.status}, ${run.moves} moves, ${run.batches} batches\n`);}}),gamesMs=performance.now()-started;
 const sampleStart=performance.now(),sample=sampleGenerator(),generatorMs=performance.now()-sampleStart;
 assert.deepEqual(coreSourceBinding(),coreSource,'Core source changed during comparison');
 const report=reportMarkdown(result.summary,sample.summary,coreSource,{gamesMs,generatorMs});mkdirSync(output,{recursive:true});
 const contents={'runs.jsonl':result.runs.map(run=>JSON.stringify(run)).join('\n')+'\n','summary.json':JSON.stringify(result.summary,null,2)+'\n',
  'generator.jsonl':sample.records.map(record=>JSON.stringify(record)).join('\n')+'\n','generator-summary.json':JSON.stringify(sample.summary,null,2)+'\n','report.md':report};
 const outputs={};for(const [name,content] of Object.entries(contents)){const path=join(output,name);writeFileSync(path,content);outputs[relative(ROOT,path)]=sha(content);}
 if(output===join(ROOT,'artifacts/mixed-color-comparison')){const reportPath=join(ROOT,'docs/mixed-color-comparison.md');writeFileSync(reportPath,report);outputs[relative(ROOT,reportPath)]=sha(report);}
 const sourceArtifacts=['qa/mixed-color-compare.mjs','tests/mixed-color-compare.test.ts','docs/mixed-color-v5-spec.md'];
 const manifest={protocol:PROTOCOL.id,createdAt,completedAt:new Date().toISOString(),node:process.version,platform:process.platform,arch:process.arch,
  fullGames:result.runs.length,matchedSeeds:100,seedRange:[1,100],maxCommands:PROTOCOL.maxCommands,generatorSamplesPerTier:PROTOCOL.generatorSamplesPerTier,
  strategy:PROTOCOL.strategy,gamesMs,generatorMs,coreSource,coreUnchangedDuringRun:true,
  sourceArtifacts:Object.fromEntries(sourceArtifacts.map(file=>[file,sha(readFileSync(join(ROOT,file)))])),outputs};
 writeFileSync(join(output,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
 process.stdout.write(JSON.stringify({output,coreSha256:coreSource.sha256,gamesMs,generatorMs,tiers:Object.fromEntries(COLOR_TIERS.map(tier=>{const s=result.summary.tiers[tier];return [tier,{won:s.won,failed:s.failed,capped:s.capped,moves:s.moves,batches:s.batches,generated:s.generated}];}))},null,2)+'\n');
 if(result.runs.some(run=>!run.terminal))process.exitCode=2;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){try{main();}catch(error){process.stderr.write(`${error.stack??error}\n`);process.exitCode=1;}}
