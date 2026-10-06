/** Bounded, reproducible v6 observations. Production rules and historical v5 evidence remain read-only. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {appendFileSync,existsSync,mkdirSync,readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {dirname,join,relative,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {performance} from 'node:perf_hooks';
import process from 'node:process';
import {createRun,applyCommand,findLegalMoves,previewPlacement} from '../src/domain/engine.ts';
import {collectGroupsV6 as collectGroups,neighborsV6 as neighbors,toIndexV6 as toIndex,toPointV6 as toPoint} from '../src/domain/v6/board.ts';
import {checksum,replayWithTrace} from '../src/domain/replay.ts';
import {pieceCellCargo} from '../src/domain/pieces.ts';
import {createRandomState,nextRandom} from '../src/domain/random.ts';
import {SHAPES} from '../src/domain/rulesets/v1/content.ts';
import {RULES_V6_CONFIG,OUTBOUND_DIFFICULTIES,OUTBOUND_DOCKS,OUTBOUND_ENTRY,OUTBOUND_CARGO,MIXED_COLOR_PERCENT_V6,MIXED_SHAPES_V6,MIXED_PARTITIONS_V6,COLOR_PAIRS_V6,MIXED_COLOR_PATTERNS_V6} from '../src/domain/v6/content.ts';
import {drawPieceRollsV6,generatePieceV6} from '../src/domain/v6/engine.ts';
import {saveRun,loadRun,encodeRun,decodeRun,slotForDifficulty} from '../src/application/save.ts';
import {PROTOCOL as V5_PROTOCOL,createPieceTracker,trackPlacement} from './mixed-color-compare.mjs';
export {createPieceTracker,trackPlacement};

export const PROTOCOL=Object.freeze({
 id:'outbound-v6-compare-v1',rulesetVersion:6,mode:'color_exit',strategy:'per_cell_route_group',
 tiers:['easy','normal','hard','expert'],mixedPercent:{easy:20,normal:30,hard:40,expert:50},
 seedStart:1,seedEnd:100,fullGames:400,maxCommands:600,generatorSeed:6062026,generatorSamplesPerTier:10000,
 rules:{balanced:false,boardSize:9,candidateCount:3,minBatch:4,targetBatches:30,batchesPerStage:6,stageCount:5,pointsPerCell:10},
 selection:V5_PROTOCOL.selection,observation:V5_PROTOCOL.observation,tieBreak:V5_PROTOCOL.tieBreak,generation:V5_PROTOCOL.generation,
 partial:'Immediate partial means this selected mixed piece loses at least one but fewer than its actual 4 or 5 cells over the complete chain. Per-event partial counts each touched mixed piece with its own cells still remaining immediately after an individual shipment. Old inventory and within-chain temporary remnants are distinguished.',
 chains:V5_PROTOCOL.chains,
 generatorSampling:'10000 generator-only samples per difficulty, common seed6062026 from ordinal1. Contexts cycle empty/checkerboard/full and stages1..5 in equal spans, with per-tier rolling retained candidates. Independently recompute six fixed draws and exact thresholds, compare cursors, shape-first index, partition modulo and color pair. No fitting/rescue fallback; log unplaceable mixed4 and mixed5 separately. Uniformity means each mixed shape has probability1/8, not each of66 color patterns has probability1/66.',
 validation:'Actual root rules; every accepted command preview matches shipment events and projected final board. Full command replay compares every checksum and final complete state. Strict real saveRun/loadRun and encode/decode at command0, each tenth command, and final; resumed loaded state drives subsequent commands. Generated = selected + final-held. Failed requires zero legal moves, completed requires >=30 batches. Caps are inconclusive.',
 limitations:'100 matched seeds and one untuned heuristic, not human balance or an optimality proof. Within v6 raw draws align by generation ordinal, while retained pieces, stage and occupancy diverge. Historical v5 uses the identical scoring coefficients but 49 rather than81 cells, four rather than six draws, square-only rather than eight mixed shapes, and a changed pure occupancy denominator. Cross-version outcomes are descriptive, not an isolated mixed-ratio experiment. No auto-tuning or60% tier.',
});
const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const ENTRY=toIndex(OUTBOUND_ENTRY.entry);
const sum=values=>values.reduce((a,b)=>a+b,0);
const kind=piece=>piece.cellCargos===undefined?'pure':'mixed';
const counts=()=>({pure:0,mixed:0});
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const gateFor=cargo=>OUTBOUND_DOCKS.find(gate=>gate.cargo===cargo);
const percent=(n,d)=>d?`${(100*n/d).toFixed(2)}%`:'未观察';
export function assertProtocol(){
 assert.deepEqual(OUTBOUND_DIFFICULTIES,PROTOCOL.tiers);assert.deepEqual(MIXED_COLOR_PERCENT_V6,PROTOCOL.mixedPercent);
 for(const [key,value] of Object.entries(PROTOCOL.rules))assert.equal(RULES_V6_CONFIG[key],value,`Frozen rule drift: ${key}`);
 assert.equal(RULES_V6_CONFIG.rulesetVersion,6);assert.equal(RULES_V6_CONFIG.runConfigId,'run.outbound9_v6');
 assert.deepEqual(OUTBOUND_ENTRY.entry,{x:4,y:8});
 assert.deepEqual(OUTBOUND_DOCKS.map(gate=>[gate.cargo,gate.entry]),[['cargo.food',{x:4,y:0}],['cargo.chem',{x:8,y:4}],['cargo.machine',{x:0,y:4}]]);
 assert.deepEqual(MIXED_SHAPES_V6,['shape.square','shape.i4_h','shape.i4_v','shape.l4_e','shape.l4_w','shape.s4_h','shape.z4_h','shape.p5']);
 assert.equal(MIXED_COLOR_PATTERNS_V6.length,66);assert.equal(PROTOCOL.selection,V5_PROTOCOL.selection);return true;
}
function observation(state){
 if(state.rulesetVersion!==6||state.mode!=='color_exit'||state.boardSize!==9)throw Error('Comparison supports only v6 nine-grid outbound');
 return {rulesetVersion:6,mode:'color_exit',difficultyId:state.difficultyId,boardSize:9,runConfigId:state.runConfigId,phase:state.phase,
  board:state.board,candidates:state.candidates,orders:state.orders,
  seed:0,rngState:[0,0,0,0],commands:[],commandIndex:0,nextId:0,generatedPieces:0,
  cellTraits:Array(81).fill(null),upgrades:[],upgradeChoices:[],shift:1,score:0,completedOrders:0,lastChain:0,maxChain:0,result:null,overtime:false,endReason:null};
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


function registerGenerated(run,pieces){for(const piece of pieces)run.generated[kind(piece)]++;}
function checkpoint(state,storage,run){
 const encoded=encodeRun(state);assert.deepEqual(decodeRun(encoded),state);
 assert.equal(saveRun(storage,state).ok,true,'Strict checkpoint save failed');
 const loaded=loadRun(storage,slotForDifficulty(state.difficultyId));assert.equal(loaded.source,'main');assert.deepEqual(loaded.state,state);
 run.checkpoints.push({commandIndex:state.commandIndex,checksum:checksum(state),envelopeSha256:sha(encoded)});run.saveLoadChecks++;
 return loaded.state;
}
export function simulateRun(seed,tier,{maxCommands=PROTOCOL.maxCommands}={}){
 assertProtocol();assert.ok(Number.isInteger(seed)&&seed>=1&&seed<=100,'seed must be 1..100');assert.ok(PROTOCOL.tiers.includes(tier),'Invalid tier');
 assert.ok(Number.isInteger(maxCommands)&&maxCommands>=1&&maxCommands<=PROTOCOL.maxCommands,'Invalid maxCommands');
 const started=performance.now();let state=createRun(seed,'color_exit',6,tier);
 const run={seed,tier,strategy:PROTOCOL.strategy,status:null,terminal:false,moves:0,batches:0,score:0,peakOccupancy:0,maxChain:0,
  generated:counts(),initialGenerated:counts(),selected:counts(),heldFinal:counts(),chainDistribution:{0:0,1:0,2:0,3:0},longChainPlacements:0,
  immediatePartialMixedPlacement:0,immediateFullyShippedMixedPlacement:0,immediateMixedShippedCells:0,immediateMixedRemainingCells:0,
  partialMixedPieceShipmentEvents:0,partialShipmentBatches:0,
  initialChecksum:checksum(state),previewChecks:0,replayChecks:0,saveLoadChecks:0,checkpoints:[],trace:[]};
 const data=new Map(),storage={get:key=>data.get(key)??null,set:(key,value)=>data.set(key,value),remove:key=>data.delete(key)};
 registerGenerated(run,state.candidates);run.initialGenerated={...run.generated};const tracker=createPieceTracker();state=checkpoint(state,storage,run);
 while(state.phase!=='result'&&run.moves<maxCommands){
  const move=chooseMove(state);assert.ok(move,'Nonterminal state lacks legal move');
  const piece=state.candidates.find(candidate=>candidate.id===move.pieceId),idsBefore=new Set(state.candidates.map(candidate=>candidate.id));
  const command={type:'place',pieceId:move.pieceId,origin:{...move.origin}},preview=previewPlacement(state,move.pieceId,move.origin);
  const result=applyCommand(state,command);assert.equal(result.error,undefined);assert.equal(result.state.commandIndex,state.commandIndex+1);
  const shipments=result.events.filter(event=>event.type==='shipment');assert.deepEqual(shipments,preview.shipments);
  const projected=[...state.board];preview.cells.forEach((cell,i)=>{projected[cell]=pieceCellCargo(piece,i);});for(const shipment of preview.shipments)for(const cell of shipment.cells)projected[cell]=null;
  assert.deepEqual(projected,result.state.board);run.previewChecks++;
  const metrics=trackPlacement(tracker,piece,result.events,result.state.board);for(const [metric,value] of Object.entries(metrics))run[metric]+=value;
  state=result.state;run.moves++;run.batches+=shipments.length;run.selected[kind(piece)]++;run.chainDistribution[shipments.length]++;run.longChainPlacements+=Number(shipments.length>=2);
  registerGenerated(run,state.candidates.filter(candidate=>!idsBefore.has(candidate.id)));
  run.trace.push({commandIndex:state.commandIndex,command,checksum:checksum(state),selectedKind:kind(piece),selectedShape:piece.shapeId,selectedCells:preview.cells.length,batches:shipments.length,
   shippedCells:sum(shipments.map(shipment=>shipment.cells.length)),...metrics});
  if(state.commandIndex%10===0)state=checkpoint(state,storage,run);
 }
 if(run.checkpoints.at(-1).commandIndex!==state.commandIndex)state=checkpoint(state,storage,run);
 const replayed=replayWithTrace(seed,state.commands,'color_exit',6,tier);assert.deepEqual(replayed.state,state);
 assert.deepEqual(replayed.trace,run.trace.map(step=>({commandIndex:step.commandIndex,checksum:step.checksum})));run.replayChecks=replayed.trace.length;
 run.terminal=state.phase==='result';run.status=run.terminal?state.result:'capped';run.finalLegalMoves=findLegalMoves(state).length;
 if(run.status==='failed'){assert.equal(state.endReason,'blocked');assert.equal(run.finalLegalMoves,0);}
 if(run.status==='won'){assert.equal(state.endReason,'completed');assert.ok(state.completedOrders>=30&&state.completedOrders<=32);}
 for(const piece of state.candidates)run.heldFinal[kind(piece)]++;
 for(const type of ['pure','mixed'])assert.equal(run.generated[type],run.selected[type]+run.heldFinal[type]);
 assert.equal(run.generated.pure+run.generated.mixed,state.generatedPieces);assert.equal(run.moves,run.selected.pure+run.selected.mixed);assert.equal(run.batches,state.completedOrders);
 run.peakOccupancy=state.maxOccupancy??0;run.finalOccupancy=state.board.filter(Boolean).length;run.maxChain=state.maxChain;run.score=state.score;run.finalChecksum=checksum(state);run.finalState=state;
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
  peakOccupancy:distribution(runs.map(run=>run.peakOccupancy)),finalOccupancy:distribution(runs.map(run=>run.finalOccupancy)),finalLegalMoves:distribution(runs.map(run=>run.finalLegalMoves)),deadlocks:runs.filter(run=>run.status==='failed').length,maxChain:distribution(runs.map(run=>run.maxChain)),
  generated:byType('generated'),initialGenerated:byType('initialGenerated'),selected:byType('selected'),heldFinal:byType('heldFinal'),
  chainDistribution:Object.fromEntries([0,1,2,3].map(chain=>[chain,sum(runs.map(run=>run.chainDistribution[chain]))])),longChainPlacements:total('longChainPlacements'),
  ...Object.fromEntries(['immediatePartialMixedPlacement','immediateFullyShippedMixedPlacement','immediateMixedShippedCells','immediateMixedRemainingCells','partialMixedPieceShipmentEvents','partialShipmentBatches','previewChecks','replayChecks','saveLoadChecks','elapsedMs'].map(field=>[field,total(field)])),
  millisecondsPerRun:distribution(runs.map(run=>run.elapsedMs))};
}


export function runComparison({seeds=100,maxCommands=PROTOCOL.maxCommands,onRun,beforeRun}={}){
 assertProtocol();if(!Number.isInteger(seeds)||seeds<1||seeds>100)throw Error('seeds must be 1..100');
 const runs=[];for(let seed=1;seed<=seeds;seed++)for(const tier of PROTOCOL.tiers){beforeRun?.();const run=simulateRun(seed,tier,{maxCommands});runs.push(run);onRun?.(run,runs.length);}
 const outcomeQuadruples={};for(let i=0;i<runs.length;i+=4){const outcomes=runs.slice(i,i+4).map(run=>run.status).join('/');outcomeQuadruples[outcomes]=(outcomeQuadruples[outcomes]??0)+1;}
 return {runs,summary:{protocol:PROTOCOL,seedStart:1,seedEnd:seeds,matchedSeeds:seeds,totalRuns:runs.length,maxCommands,
  tiers:Object.fromEntries(PROTOCOL.tiers.map(tier=>[tier,aggregateRuns(runs.filter(run=>run.tier===tier))])),outcomeQuadruples}};
}
function independentDraws(rngState){
 const values=[];let next=rngState;for(const [min,max] of [[1,100],[0,2147483647],[0,2147483647],[0,7],[0,5],[0,5]]){const draw=nextRandom(next,min,max);values.push(draw.value);next=draw.state;}
 return {rolls:Object.fromEntries(['typeRoll','shapeRaw','cargoRaw','mixedShape','splitRaw','colorPair'].map((key,i)=>[key,values[i]])),rngState:next};
}
function shapeCanFit(board,shapeId){
 const shape=SHAPES.find(shape=>shape.id===shapeId);
 for(let y=0;y<9;y++)for(let x=0;x<9;x++)if(shape.cells.every(cell=>x+cell.x<9&&y+cell.y<9&&board[toIndex({x:x+cell.x,y:y+cell.y})]===null))return true;
 return false;
}
export function sampleGenerator({samples=PROTOCOL.generatorSamplesPerTier,onSample}={}){
 assert.ok(Number.isInteger(samples)&&samples>=1&&samples<=10000,'samples must be 1..10000');assertProtocol();
 const states=PROTOCOL.tiers.map(tier=>({...createRun(PROTOCOL.generatorSeed,'color_exit',6,tier),rngState:createRandomState(PROTOCOL.generatorSeed),candidates:[],nextId:1,generatedPieces:0}));
 const totals=Object.fromEntries(PROTOCOL.tiers.map(tier=>[tier,{generated:counts(),shapeCounts:Object.fromEntries(MIXED_SHAPES_V6.map(id=>[id,0])),patternCounts:Array(66).fill(0),unplaceableMixedBySize:{4:0,5:0},fallbackCount:0}]));
 const records=[],typeRollHistogram=Array(100).fill(0),selectionPatterns={};
 for(let ordinal=1;ordinal<=samples;ordinal++){
  const context=['empty','checkerboard','full'][(ordinal-1)%3],shift=1+Math.min(4,Math.floor((ordinal-1)*5/samples));
  const board=Array.from({length:81},(_,cell)=>context==='empty'||context==='checkerboard'&&(cell%9+Math.floor(cell/9))%2===1?null:OUTBOUND_CARGO[cell%3]);
  const fits=Object.fromEntries(MIXED_SHAPES_V6.map(shapeId=>[shapeId,shapeCanFit(board,shapeId)]));
  const expected=independentDraws(states[0].rngState);assert.deepEqual(drawPieceRollsV6(states[0].rngState),expected);const generated=[];
  for(const [index,tier] of PROTOCOL.tiers.entries()){
   const state=states[index];state.board=[...board];state.shift=shift;
   const result=generatePieceV6(state);assert.deepEqual(result.rolls,expected.rolls);assert.deepEqual(result.rngState,expected.rngState);
   const isMixed=kind(result.piece)==='mixed';assert.equal(isMixed,result.rolls.typeRoll<=PROTOCOL.mixedPercent[tier],'Type threshold fallback/drift');
   const total=totals[tier];total.generated[kind(result.piece)]++;
   if(isMixed){
    assert.equal(result.piece.shapeId,MIXED_SHAPES_V6[result.rolls.mixedShape]);
    const partitions=MIXED_PARTITIONS_V6[result.piece.shapeId],partition=partitions[result.rolls.splitRaw%partitions.length],pair=COLOR_PAIRS_V6[result.rolls.colorPair];
    assert.deepEqual(result.piece.cellCargos,[...partition].map(letter=>pair[letter==='A'?0:1]));
    const patternIndex=MIXED_COLOR_PATTERNS_V6.findIndex(pattern=>pattern.shapeId===result.piece.shapeId&&pattern.cellCargos.every((cargo,i)=>cargo===result.piece.cellCargos[i]));assert.ok(patternIndex>=0);
    total.patternCounts[patternIndex]++;total.shapeCounts[result.piece.shapeId]++;if(!fits[result.piece.shapeId])total.unplaceableMixedBySize[result.piece.cellCargos.length]++;
   }
   if(state.candidates.length<3)state.candidates.push(result.piece);else state.candidates[(ordinal-1)%3]=result.piece;
   state.rngState=result.rngState;state.nextId++;state.generatedPieces++;
   generated.push({kind:kind(result.piece),shapeId:result.piece.shapeId,cargo:result.piece.cargo,...(isMixed?{cellCargos:result.piece.cellCargos}:{})});
  }
  const selection=generated.map(piece=>piece.kind==='mixed'?'1':'0').join('');assert.ok(['0000','0001','0011','0111','1111'].includes(selection),'Non-nested mixed selection');
  typeRollHistogram[expected.rolls.typeRoll-1]++;selectionPatterns[selection]=(selectionPatterns[selection]??0)+1;
  const record={ordinal,context,shift,mixedShapeFits:fits,rolls:expected.rolls,generated:Object.fromEntries(PROTOCOL.tiers.map((tier,i)=>[tier,generated[i]]))};records.push(record);onSample?.(record);
 }
 for(const total of Object.values(totals)){
  total.shapeSharesWithinMixed=Object.fromEntries(MIXED_SHAPES_V6.map(id=>[id,total.shapeCounts[id]/total.generated.mixed]));
  total.shapeChiSquareVsUniform=sum(Object.values(total.shapeCounts).map(n=>(n-total.generated.mixed/8)**2/(total.generated.mixed/8)));
  total.patternsObserved=total.patternCounts.filter(Boolean).length;
 }
 return {records,summary:{seed:PROTOCOL.generatorSeed,samplesPerTier:samples,totalGenerated:samples*4,drawsPerPiece:6,rawAlignmentChecks:samples,nestedSelectionChecks:samples,
  typeRollHistogram,selectionPatterns,tiers:totals,contexts:Object.fromEntries(['empty','checkerboard','full'].map(context=>[context,records.filter(record=>record.context===context).length])),
  expectedMixedShapeShare:1/8,flattened66PatternShapeShares:Object.fromEntries(MIXED_SHAPES_V6.map(id=>[id,MIXED_PARTITIONS_V6[id].length*6/66]))}};
}
function filesBelow(folder){return readdirSync(folder,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?filesBelow(join(folder,entry.name)):[join(folder,entry.name)]).sort();}
export function coreSourceBinding(){
 const files=[...filesBelow(join(ROOT,'src/domain')),join(ROOT,'src/application/save.ts'),join(ROOT,'src/application/run-slots.ts'),...filesBelow(join(ROOT,'node_modules/pure-rand/lib/esm')),join(ROOT,'node_modules/pure-rand/package.json')].sort();
 const hashes=Object.fromEntries(files.map(path=>[relative(ROOT,path),sha(readFileSync(path))]));return {sha256:sha(JSON.stringify(hashes)),files:hashes};
}
export function assertSourceBinding(before,after=coreSourceBinding()){assert.deepEqual(after,before,'Core source changed (source drift): stop and coordinate, never auto-regenerate');return true;}

function historicalV5(){
 const folder=join(ROOT,'artifacts/mixed-color-comparison'),manifest=JSON.parse(readFileSync(join(folder,'manifest.json'),'utf8'));
 for(const [file,hash] of Object.entries({...manifest.sourceArtifacts,...manifest.outputs}))assert.equal(sha(readFileSync(resolve(ROOT,file))),hash,`Historical v5 evidence drift: ${file}`);
 const summary=JSON.parse(readFileSync(join(folder,'summary.json'),'utf8'));
 assert.equal(summary.protocol.selection,PROTOCOL.selection);assert.equal(summary.protocol.strategy,PROTOCOL.strategy);
 return {summary,manifestSha256:sha(readFileSync(join(folder,'manifest.json'))),summarySha256:sha(readFileSync(join(folder,'summary.json'))),historicalCoreSha256:manifest.coreSource.sha256,
  note:'Historical output and source-artifact hashes verified without requiring changed root-router bytes to equal the old snapshot. No new v5 strategy games were run.'};
}
const describe=d=>`中位${d.median}，P25–P75 ${d.p25}–${d.p75}，范围${d.min}–${d.max}，均值${d.mean.toFixed(2)}`;
export function reportMarkdown(summary,generator,binding,timing,history){
 const lines=['# v6 出库四档：400局有界经验比较','',
  `固定同一策略，seed ${summary.seedStart}–${summary.seedEnd} × 简单20% / 中等30% / 困难40% / 专业50%，共${summary.totalRuns}局，每局最多${summary.maxCommands}次有效落子。完整策略测量${(timing.gamesMs/1000).toFixed(2)}秒，独立生成器抽样${(timing.generatorMs/1000).toFixed(2)}秒。时间是本机计算时间，不是玩家时长。`,'',
  '## 结论边界','',
  '这是一套固定启发式机器人的有界观察，不证明真人难度、好玩、休闲度或最优策略。没有根据结果调整任何比例、shape、门、目标或策略系数，没有60%档。cap只表示未完成，不记为失败。',
  '同一v6生成序号的六个原始抽签严格对齐，混色阈值集合嵌套；但保留候选、棋盘库存、阶段和终局长度会分化，整局不是逐件相同供货。四档用完全相同的协议，不把档位名当作已经证明的难度。','',
  '## 固定协议和定义','',
  '- 9×9、81格、南入口(4,8)、北食品(4,0)、东化工(8,4)、西机械(0,4)。三候选保留未选槽，同色四邻接连本色出口且组≥4，有南入口空路才出货；30批目标、每6批升阶段、每格10分。',
  '- 逐落子遍历所有合法候选/坐标，用真实preview评估，最小化 [出完货后入口占用、连门达标却无空路的组数、负出货批数、负出货格数、负routeGroupScore、各放置格到本色门的平均距离]。routeGroupScore = 南入口可达空格 + 3×连本色门的存货格 + 2×本次放置格与旧同色货格接触边 − 平均本色门距 − 出货后占用。',
  '- 与历史v5使用同一评分公式和系数，只把所有索引、邻居、门和格距改为真实9×9几何。每格通过pieceCellCargo读取实际颜色，不把混色整件当锚点色。不看seed/RNG/未来货物，不试走applyCommand，不搜索未来，不调参。平局保留引擎顺序候选索引→y→x的首个合法点。',
  '- 生成数含初始三件与真正补件，也含没被选用的保留件；每类逐局核验生成=选用+最终保留。胜局不补最后一件，因此终局保留两件。峰值占用含放下后、清货前；最终占用单列。',
  '- 即时半件：新放混色件在完整连锁后自身清掉至少一格、少于自身实际4或5格。逐shipment部分清除另计被清且该事件后自身仍有残格的混色件/事件，可以涉及旧件或同链临时半块；部分出货批数指包含至少一个此类事件的批，不是整批格数。',
  '- 长链为同次落子≥2批，记录0/1/2/3链分布。失败均核验blocked且三候选合计0合法落点；胜局核验completed与≥30批。初始、每10步、终局使用真实严格saveRun/loadRun及encode/decode，继续从读回state落子；Replay比对每条命令checksum和最终完整state。',''];
 for(const tier of PROTOCOL.tiers){const s=summary.tiers[tier];lines.push(`## ${tier}（混色${PROTOCOL.mixedPercent[tier]}%）`,'',
  `- 终局/胜/败/cap：${s.terminal}/${s.won}/${s.failed}/${s.capped}，样本${s.runs}局；确认死局${s.deadlocks}`,
  `- 有效落子${s.moves}，每局${describe(s.movesPerRun)}；出货${s.batches}批，每局${describe(s.batchesPerRun)}`,
  `- 峰值占用${describe(s.peakOccupancy)}；最终占用${describe(s.finalOccupancy)}；最大链${describe(s.maxChain)}`,
  `- 0/1/2/3链落子：${[0,1,2,3].map(n=>s.chainDistribution[n]).join('/')}；长链${s.longChainPlacements}/${s.moves}（${percent(s.longChainPlacements,s.moves)}）`,
  `- 生成纯/混${s.generated.pure}/${s.generated.mixed}，混色占${percent(s.generated.mixed,s.generated.pure+s.generated.mixed)}；初始三候选纯/混${s.initialGenerated.pure}/${s.initialGenerated.mixed}`,
  `- 选用纯/混${s.selected.pure}/${s.selected.mixed}，混色选用占${percent(s.selected.mixed,s.moves)}；最终保留纯/混${s.heldFinal.pure}/${s.heldFinal.mixed}`,
  `- 新混色即时半件出货${s.immediatePartialMixedPlacement}/${s.selected.mixed}（${percent(s.immediatePartialMixedPlacement,s.selected.mixed)}）；同次完整出清${s.immediateFullyShippedMixedPlacement}；当次共清自身${s.immediateMixedShippedCells}格、留${s.immediateMixedRemainingCells}格`,
  `- 逐事件混色部分清除${s.partialMixedPieceShipmentEvents}个件/事件，涉及${s.partialShipmentBatches}/${s.batches}批`,
  `- preview/结算核验${s.previewChecks}次；Replay逐命令${s.replayChecks}次、${s.runs}局最终全状态；严格save/load ${s.saveLoadChecks}个检查点。`,'');}
 lines.push('## 独立生成器抽样：每档10000件，不是额外整局','',
  `seed ${generator.seed}，每档${generator.samplesPerTier}件，共${generator.totalGenerated}件。空盘/棋盘格隔空/满盘上下文${generator.contexts.empty}/${generator.contexts.checkerboard}/${generator.contexts.full}次；阶段1–5均匀分段，保留候选按固定三槽轮换。棋盘格和满盘都不能放任何池中4/5格连通混色件。`,
  `逐生成序号独立重算六抽：1..100、0..2147483647、0..2147483647、0..7、0..5、0..5；固定顺序/阈值/shape/分区/色对核验，跨四档RNG游标核对${generator.rawAlignmentChecks}组；嵌套核对${generator.nestedSelectionChecks}组。easy/normal/hard/expert混色位串：${JSON.stringify(generator.selectionPatterns)}。`,
  '混色shape先均匀8选1，因此每shape条件概率12.5%；shape内再均匀合法分区和六个有序色对。66图样不能整体等权抽：若整体等权，square会占18.18%、P5占27.27%、其它六shape各9.09%。下列频数是经验波动，精确分布来自逐次shapeIndex和分区映射断言；χ²只作描述，不作调参依据。','');
 for(const tier of PROTOCOL.tiers){const g=generator.tiers[tier];lines.push(`- ${tier}：纯/混${g.generated.pure}/${g.generated.mixed}，混色${percent(g.generated.mixed,generator.samplesPerTier)}；不能落下仍生成4格/5格混色${g.unplaceableMixedBySize[4]}/${g.unplaceableMixedBySize[5]}，阈值回退${g.fallbackCount}。`,
  `  - square/i4_h/i4_v/l4_e/l4_w/s4_h/z4_h/p5计数：${MIXED_SHAPES_V6.map(id=>g.shapeCounts[id]).join('/')}；混色内占比：${MIXED_SHAPES_V6.map(id=>percent(g.shapeCounts[id],g.generated.mixed)).join('/')}；对8形状等权χ²=${g.shapeChiSquareVsUniform.toFixed(3)}；观察到${g.patternsObserved}/66图样。`);}
 lines.push('','## 与历史v5的描述性参照','',
  '沿用历史v5的同一评分公式，历史300局产物与工具/规格哈希已校验；没有额外跑v5策略样本。不能把v5和v6当孤立混色比例实验：容量49→81（多32格，约+65.3%）、门距、候选混色shape分布、每件四抽→六抽、纯色拥挤权重分母都改变；同数字seed跨版本也不代表同一随机供货序列。v5只有2×2混色，v6有均匀8种4/5格混色；v5没有50%对应组。','');
 for(const [oldTier,newTier] of [['entry','easy'],['middle','normal'],['late','hard']]){const a=history.summary.tiers[oldTier],b=summary.tiers[newTier];lines.push(`- ${PROTOCOL.mixedPercent[newTier]}%：历史v5 ${oldTier} 胜/败/cap ${a.won}/${a.failed}/${a.capped}，落子中位${a.movesPerRun.median}、出货批中位${a.batchesPerRun.median}；本次v6 ${newTier} ${b.won}/${b.failed}/${b.capped}，落子中位${b.movesPerRun.median}、出货批中位${b.batchesPerRun.median}。`);}
 lines.push('','## 证据、指纹和复现','',
  `四档按seed配对的终局组合：${JSON.stringify(summary.outcomeQuadruples)}。`,
  `当前核心及依赖SHA-256：${binding.sha256}。运行前后及每局边界检查相同；清单含domain、严格save/run-slots、pure-rand ESM与package字节。工具/测试/规格/历史参照和全部输出另有SHA-256。`,
  `历史v5核心SHA-256：${history.historicalCoreSha256}；历史manifest SHA-256：${history.manifestSha256}。保留原报告，没有把旧100002局或旧300局冒充v6覆盖。`,
  '- artifacts/outbound-v6-comparison/runs.jsonl：400局真实命令、每步checksum、选择shape/大小、半件指标、save/load检查点与最终完整状态。generator.jsonl：10000个配对生成序号、上下文、六抽、四档实际货件和各shape可放性。',
  '- summary.json、generator-summary.json、historical-v5.json：聚合分布与历史来源。manifest.json绑定源码/输出、Node版本、耗时；report.md与docs/outbound-v6-comparison.md同内容。',
  '- 小协议测试：node --test tests/outbound-v6-compare.test.ts。只有短cap及人工夹具，不另作完整策略试跑。',
  '- 已有证据只读核验：node qa/outbound-v6-compare.mjs --verify artifacts/outbound-v6-comparison。重放已有命令、核对每步/完整终态与保存检查点，不重新选择策略。',
  '- 全量入口：OUTBOUND_EXPECT_CORE=<已核准核心SHA> node qa/outbound-v6-compare.mjs --output <新目录>。默认拒绝覆盖任何已有证据，发现源码漂移写halted.json和已完成记录后停止；不会自动重跑。只有另获批准才重新做400局。',
  '', '真人试玩、真正浏览器/微信宿主、触屏可读性和最终平衡仍要单独验收，本报告不替代这些检查。','');
 return lines.join('\n');
}
const SOURCE_ARTIFACTS=['qa/outbound-v6-compare.mjs','qa/mixed-color-compare.mjs','tests/outbound-v6-compare.test.ts','docs/outbound-v6-design-draft.md','docs/superpowers/plans/2026-10-06-outbound-v6-comparison.md','artifacts/mixed-color-comparison/manifest.json','artifacts/mixed-color-comparison/summary.json'];
function sourceArtifacts(){return Object.fromEntries(SOURCE_ARTIFACTS.map(file=>[file,sha(readFileSync(join(ROOT,file)))]));}
export function writeEvidence(output,result,sample,{coreSource,gamesMs,generatorMs,createdAt,sourceBefore=sourceArtifacts()}){
 assertSourceBinding(coreSource);assert.deepEqual(sourceArtifacts(),sourceBefore,'Tool/spec source changed during comparison');
 const history=historicalV5(),report=reportMarkdown(result.summary,sample.summary,coreSource,{gamesMs,generatorMs},history);mkdirSync(output,{recursive:true});
 const contents={'runs.jsonl':result.runs.map(run=>JSON.stringify(run)).join('\n')+'\n','summary.json':JSON.stringify(result.summary,null,2)+'\n',
  'generator.jsonl':sample.records.map(record=>JSON.stringify(record)).join('\n')+'\n','generator-summary.json':JSON.stringify(sample.summary,null,2)+'\n',
  'historical-v5.json':JSON.stringify(history,null,2)+'\n','report.md':report};
 const outputs={};for(const [name,content] of Object.entries(contents)){writeFileSync(join(output,name),content);outputs[name]=sha(content);}
 const manifest={protocol:PROTOCOL.id,createdAt,completedAt:new Date().toISOString(),node:process.version,platform:process.platform,arch:process.arch,
  fullGames:result.runs.length,matchedSeeds:result.summary.matchedSeeds,seedRange:[result.summary.seedStart,result.summary.seedEnd],maxCommands:result.summary.maxCommands,generatorSamplesPerTier:sample.summary.samplesPerTier,
  strategy:PROTOCOL.strategy,gamesMs,generatorMs,coreSource,coreUnchangedDuringRun:true,sourceArtifacts:sourceBefore,outputs};
 if(output===join(ROOT,'artifacts/outbound-v6-comparison')){const path=join(ROOT,'docs/outbound-v6-comparison.md');writeFileSync(path,report);manifest.publishedReport={path:relative(ROOT,path),sha256:sha(report)};}
 writeFileSync(join(output,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');return manifest;
}
export function verifyArtifacts(folder){
 const manifest=JSON.parse(readFileSync(join(folder,'manifest.json'),'utf8'));assertSourceBinding(manifest.coreSource);
 for(const [file,hash] of Object.entries(manifest.sourceArtifacts))assert.equal(sha(readFileSync(resolve(ROOT,file))),hash,`Tool/spec source drift: ${file}`);
 for(const [file,hash] of Object.entries(manifest.outputs))assert.equal(sha(readFileSync(join(folder,file))),hash,`Artifact drift: ${file}`);
 if(manifest.publishedReport)assert.equal(sha(readFileSync(join(ROOT,manifest.publishedReport.path))),manifest.publishedReport.sha256,'Published report drift');
 let replayChecks=0,runs=0,saveLoadChecks=0;const seen=new Set();
 for(const line of readFileSync(join(folder,'runs.jsonl'),'utf8').trim().split('\n')){
  const run=JSON.parse(line);assert.equal(seen.has(`${run.seed}:${run.tier}`),false);seen.add(`${run.seed}:${run.tier}`);
  let state=createRun(run.seed,'color_exit',6,run.tier);assert.equal(checksum(state),run.initialChecksum);
  const checkpoints=new Map(run.checkpoints.map(check=>[check.commandIndex,check]));
  const verifySave=()=>{const expected=checkpoints.get(state.commandIndex);if(!expected)return;const data=new Map(),storage={get:key=>data.get(key)??null,set:(key,v)=>data.set(key,v),remove:key=>data.delete(key)};
   assert.equal(checksum(state),expected.checksum);assert.equal(sha(encodeRun(state)),expected.envelopeSha256);assert.equal(saveRun(storage,state).ok,true);assert.deepEqual(loadRun(storage,slotForDifficulty(run.tier)).state,state);saveLoadChecks++;};
  verifySave();for(const step of run.trace){const preview=previewPlacement(state,step.command.pieceId,step.command.origin),result=applyCommand(state,step.command);assert.equal(result.error,undefined);assert.deepEqual(preview.shipments,result.events.filter(event=>event.type==='shipment'));state=result.state;assert.equal(state.commandIndex,step.commandIndex);assert.equal(checksum(state),step.checksum);replayChecks++;verifySave();}
  assert.deepEqual(state,run.finalState);assert.equal(checksum(state),run.finalChecksum);assert.equal(run.trace.length,run.moves);assert.equal(run.checkpoints.length,run.saveLoadChecks);
  if(run.status==='failed'){assert.equal(state.endReason,'blocked');assert.equal(findLegalMoves(state).length,0);}runs++;
 }
 assert.equal(runs,manifest.fullGames);for(let seed=manifest.seedRange[0];seed<=manifest.seedRange[1];seed++)for(const tier of PROTOCOL.tiers)assert.ok(seen.has(`${seed}:${tier}`));
 assertSourceBinding(manifest.coreSource);return {runs,replayChecks,saveLoadChecks,coreSha256:manifest.coreSource.sha256,artifactHashes:'matched'};
}
function main(){
 const args=process.argv.slice(2);
 if(args[0]==='--verify'&&args.length===2){process.stdout.write(JSON.stringify(verifyArtifacts(resolve(args[1])),null,2)+'\n');return;}
 if(args.length&&!(args.length===2&&args[0]==='--output'))throw Error('Usage: node qa/outbound-v6-compare.mjs [--output directory | --verify directory]');
 const output=resolve(args[1]??join(ROOT,'artifacts/outbound-v6-comparison'));
 if(existsSync(output)&&readdirSync(output).length)throw Error('Existing evidence will not be overwritten; use --verify or an authorized new output.');
 assertProtocol();const coreSource=coreSourceBinding(),sourceBefore=sourceArtifacts();
 assert.equal(process.env.OUTBOUND_EXPECT_CORE,coreSource.sha256,'Set OUTBOUND_EXPECT_CORE to the reviewed current source SHA before the one full campaign');
 mkdirSync(output,{recursive:true});const createdAt=new Date().toISOString(),started=performance.now();let completedRuns=0;
 writeFileSync(join(output,'started.json'),JSON.stringify({createdAt,coreSource,sourceArtifacts:sourceBefore,protocol:PROTOCOL},null,2)+'\n');
 try {
  const result=runComparison({beforeRun:()=>assertSourceBinding(coreSource),onRun:(run,n)=>{appendFileSync(join(output,'runs.jsonl'),JSON.stringify(run)+'\n');completedRuns=n;assertSourceBinding(coreSource);if(n%20===0)process.stderr.write(`${n}/400: seed${run.seed} ${run.tier} ${run.status}, ${run.moves} moves, ${run.batches} batches\n`);}}),gamesMs=performance.now()-started;
  assert.equal(result.runs.length,400);const sampleStart=performance.now();
  const sample=sampleGenerator({onSample:record=>{appendFileSync(join(output,'generator.jsonl'),JSON.stringify(record)+'\n');if(record.ordinal%100===0)assertSourceBinding(coreSource);}}),generatorMs=performance.now()-sampleStart;
  const manifest=writeEvidence(output,result,sample,{coreSource,sourceBefore,gamesMs,generatorMs,createdAt});
  // Lifecycle log is source-bound too, without making manifest hash itself circular.
  manifest.outputs['started.json']=sha(readFileSync(join(output,'started.json')));writeFileSync(join(output,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
  process.stdout.write(JSON.stringify({output,coreSha256:coreSource.sha256,gamesMs,generatorMs,tiers:Object.fromEntries(PROTOCOL.tiers.map(tier=>{const s=result.summary.tiers[tier];return [tier,{won:s.won,failed:s.failed,capped:s.capped,moves:s.moves,batches:s.batches,generated:s.generated,saveLoadChecks:s.saveLoadChecks}];}))},null,2)+'\n');
  if(result.runs.some(run=>!run.terminal))process.exitCode=2;
 }catch(error){writeFileSync(join(output,'halted.json'),JSON.stringify({at:new Date().toISOString(),completedRuns,error:String(error),coreBefore:coreSource,coreAfter:coreSourceBinding()},null,2)+'\n');throw error;}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){try{main();}catch(error){process.stderr.write(`${error.stack??error}\n`);process.exitCode=1;}}
