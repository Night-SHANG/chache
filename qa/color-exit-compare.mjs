/** Bounded observational QA. No production settings, RNG or historical scan files are changed. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync,mkdirSync,readdirSync} from 'node:fs';
import {resolve,relative,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {performance} from 'node:perf_hooks';
import {createRun,applyCommand,findLegalMoves,previewPlacement} from '../src/domain/engine.ts';
import {collectGroups,neighbors,orderStatus,toIndex,toPoint} from '../src/domain/board.ts';
import {checksum,replayWithTrace} from '../src/domain/replay.ts';
import {encodeRun,decodeRun} from '../src/application/save.ts';
import {RULES_V4_CONFIG,COLOR_EXIT_DOCKS,COLOR_EXIT_ENTRY} from '../src/domain/v4/content.ts';

export const STRATEGIES=['exit_feed','route_group'];
export const PROTOCOL={
 id:'color-exit-compare-v1',rulesetVersion:4,mode:'color_exit',runConfigId:'run.color_exit_p0_v4',
 rules:{balanced:false,minBatch:4,targetBatches:30,candidateCount:3,boardSize:7},
 maxCommands:3000,seedRange:'Consecutive seeds; default 1 through 100 paired across the two strategies.',
 policyObservation:'Only the present board, three candidates, fixed exits and phase. No seed, RNG state, generated-piece counter, candidate replacement or future draw is read. Candidate assessment uses pure preview, never speculative applyCommand.',
 tieBreak:'Stable engine legal-move enumeration: current candidate index, then origin y, then x. No rotation and no random tie-break.',
 exit_feed:'Lexicographic minimum: [minimum placed-cell Manhattan distance to matching single gate, -immediate shipment batches, -immediately shipped cells, mean placed-cell gate distance, -same-color contacts with old cargo]. No entry/route safeguard.',
 route_group:'Lexicographic minimum: [post-resolution south-entry occupied (0/1), post-resolution gate-connected >=4 groups with no south empty route, -immediate shipment batches, -immediately shipped cells, -routeGroupScore, minimum placed-cell gate distance]. routeGroupScore = reachable empty cells + 3 * total surviving gate-connected cells + 2 * same-color contacts with old cargo - mean placed-cell gate distance - post-resolution occupied cells. This is one fixed untuned heuristic, not an optimal solver.',
 exitAdjacent:'A placement counts if any of its actual placed cells is at Manhattan distance <=1 from its own color single gate; gate contact at distance 0 is also recorded.',
 selfShipment:'An immediate shipment counts only when EVERY event.cells cell belongs to this command\'s placed.cells. A 4- or 5-cell piece can self-ship; this does not mean event.cells.length===1. Report per-placement and per-batch denominators.',
 occupancy:'Maximum simultaneous occupied cells after placement and before resolution, as recorded by the real engine maxOccupancy.',
 failures:'The only domain loss is all three candidates having no legal placement. Entry-occupied and route-blocked are overlapping board diagnostics, not demonstrated causal attributions. Loop caps remain inconclusive, separate from losses.',
 validation:'Every step uses real root applyCommand; chosen preview shipment events must match. Every accepted state encodeRun/decodeRun round-trip must be exactly equal with matching checksum; the restored state continues the game. At the end, full root replayWithTrace must match every step checksum and the full final state.',
 limits:'100 paired seeds and two hand-written heuristics give an empirical distribution only. Identical seeds do not guarantee identical future supplies after strategies diverge: occupancy, color counts, stage and selected tray slot affect generation. No min4 rebalance; no claim of optimality, fun, or fair direct comparison with historical old-mode 100002 runs.',
};
const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const ENTRY=toIndex(COLOR_EXIT_ENTRY.entry);
const gateFor=cargo=>COLOR_EXIT_DOCKS.find(dock=>dock.cargo===cargo);
const occupied=board=>board.reduce((n,cell)=>n+Number(cell!==null),0);
const sum=values=>values.reduce((a,b)=>a+b,0);
const ratio=(numerator,denominator)=>denominator?numerator/denominator:null;
const sha=raw=>createHash('sha256').update(raw).digest('hex');

export function assertProtocol(){
 for(const [key,value] of Object.entries(PROTOCOL.rules))assert.equal(RULES_V4_CONFIG[key],value,`P0 rule drift: ${key}`);
 assert.equal(RULES_V4_CONFIG.runConfigId,PROTOCOL.runConfigId);
 assert.deepEqual(COLOR_EXIT_ENTRY.entry,{x:3,y:6});
 assert.deepEqual(COLOR_EXIT_DOCKS.map(d=>[d.id,d.cargo,d.entry]),[['dock.north','cargo.food',{x:3,y:0}],['dock.east','cargo.chem',{x:6,y:3}],['dock.west','cargo.machine',{x:0,y:3}]]);
 return true;
}

/** Explicit public observation prevents accidental future-state reads during policy selection. */
function observation(state){
 if(state.mode!=='color_exit'||state.rulesetVersion!==4)throw Error('Only ruleset 4 color_exit states are supported');
 return {rulesetVersion:4,runConfigId:PROTOCOL.runConfigId,mode:'color_exit',phase:state.phase,
  board:state.board,candidates:state.candidates,orders:state.orders,
  seed:0,rngState:[0,0,0,0],commands:[],commandIndex:0,nextId:0,generatedPieces:0,
  cellTraits:Array(49).fill(null),upgrades:[],upgradeChoices:[],shift:1,score:0,completedOrders:0,lastChain:0,maxChain:0,result:null,overtime:false,endReason:null};
}

function reachableEmpty(board){
 if(board[ENTRY]!==null)return [];
 const queue=[ENTRY],seen=new Set(queue);
 for(let cursor=0;cursor<queue.length;cursor++)for(const next of neighbors(queue[cursor]))if(board[next]===null&&!seen.has(next)){seen.add(next);queue.push(next);}
 return queue;
}

export function diagnoseBoard(state){
 const statuses=state.orders.map(order=>({dockId:order.dockId,cargo:order.cargo,...orderStatus(state,order)}));
 return {entryOccupied:state.board[ENTRY]!==null,reachableEmptyCells:reachableEmpty(state.board).length,
  routeBlockedReadyExits:statuses.filter(s=>s.reason==='route-blocked').length,
  entryBlockedReadyExits:statuses.filter(s=>s.reason==='entry-blocked').length,statuses};
}

function distances(cells,cargo){
 const gate=gateFor(cargo);assert.ok(gate,`Unknown cargo ${cargo}`);
 return cells.map(cell=>{const p=toPoint(cell);return Math.abs(p.x-gate.entry.x)+Math.abs(p.y-gate.entry.y);});
}

function inspectMove(view,move,strategy){
 const piece=view.candidates.find(p=>p.id===move.pieceId),preview=previewPlacement(view,move.pieceId,move.origin);
 assert.equal(preview.valid,true,'Engine legal move did not preview as legal');
 const distance=distances(preview.cells,piece.cargo),minimum=Math.min(...distance),mean=sum(distance)/distance.length;
 const contacts=sum(preview.cells.map(cell=>neighbors(cell).filter(next=>view.board[next]===piece.cargo).length));
 const batches=preview.shipments.length,cleared=sum(preview.shipments.map(s=>s.cells.length));
 if(strategy==='exit_feed')return [minimum,-batches,-cleared,mean,-contacts];
 const board=[...view.board];for(const cell of preview.cells)board[cell]=piece.cargo;
 for(const shipment of preview.shipments)for(const cell of shipment.cells)board[cell]=null;
 const projected={...view,board},diagnostic=diagnoseBoard(projected);
 const gateCells=sum(collectGroups(board).filter(group=>group.cells.includes(toIndex(gateFor(group.cargo).entry))).map(group=>group.cells.length));
 const routeGroupScore=diagnostic.reachableEmptyCells+3*gateCells+2*contacts-mean-occupied(board);
 return [Number(diagnostic.entryOccupied),diagnostic.routeBlockedReadyExits,-batches,-cleared,-routeGroupScore,minimum];
}

function lexicographic(a,b){for(let i=0;i<a.length;i++)if(a[i]!==b[i])return a[i]-b[i];return 0;}

export function chooseMove(state,strategy){
 if(!STRATEGIES.includes(strategy))throw Error(`Unknown strategy ${strategy}`);
 const view=observation(state);if(view.phase!=='input')return null;
 let best=null,bestScore=null;
 for(const move of findLegalMoves(view)){const score=inspectMove(view,move,strategy);if(bestScore===null||lexicographic(score,bestScore)<0){best=move;bestScore=score;}}
 return best;
}

export function classifyPlacement(events,cargo){
 const placed=events.find(event=>event.type==='placed');assert.ok(placed,'Missing real placed event');
 const cells=new Set(placed.cells),shipments=events.filter(event=>event.type==='shipment');
 const selfShipmentBatches=shipments.filter(event=>event.cells.length>0&&event.cells.every(cell=>cells.has(cell))).length;
 const minimum=Math.min(...distances(placed.cells,cargo));
 return {gateContact:minimum===0,exitAdjacent:minimum<=1,selfShipmentBatches,selfShipmentPlacement:selfShipmentBatches>0};
}

export function simulateRun(seed,{strategy,maxCommands=3000}={}){
 assertProtocol();if(!STRATEGIES.includes(strategy))throw Error(`Unknown strategy ${strategy}`);
 if(!Number.isInteger(maxCommands)||maxCommands<1||maxCommands>3000)throw Error('maxCommands must be 1..3000');
 let state=createRun(seed,'color_exit',4);
 const run={seed,strategy,status:null,initialChecksum:checksum(state),placements:0,batches:0,firstBatchPlacement:null,
  maxOccupancy:0,maxChain:0,chainDistribution:{0:0,1:0,2:0,3:0},exitBatches:Object.fromEntries(COLOR_EXIT_DOCKS.map(d=>[d.id,0])),
  cargoPlacements:Object.fromEntries(COLOR_EXIT_DOCKS.map(d=>[d.cargo,0])),exitAdjacentPlacements:0,gateContactPlacements:0,
  selfShipmentPlacements:0,selfShipmentBatches:0,entryOccupiedTurns:0,firstEntryOccupiedPlacement:null,routeBlockedTurns:0,
  saveChecks:0,replayChecks:0,trace:[]};
 while(state.phase!=='result'&&run.placements<maxCommands){
  const move=chooseMove(state,strategy);assert.ok(move,'Nonterminal state has no legal command');
  const piece=state.candidates.find(p=>p.id===move.pieceId),command={type:'place',pieceId:move.pieceId,origin:{...move.origin}};
  const preview=previewPlacement(state,move.pieceId,move.origin),result=applyCommand(state,command);
  assert.equal(result.error,undefined);assert.equal(result.state.commandIndex,state.commandIndex+1);
  const shipments=result.events.filter(event=>event.type==='shipment');assert.deepEqual(shipments,preview.shipments);
  const restored=decodeRun(encodeRun(result.state));assert.deepEqual(restored,result.state);assert.equal(checksum(restored),checksum(result.state));
  state=restored;run.saveChecks++;run.placements++;run.cargoPlacements[piece.cargo]++;run.batches+=shipments.length;
  if(shipments.length&&run.firstBatchPlacement===null)run.firstBatchPlacement=run.placements;
  run.chainDistribution[shipments.length]++;for(const shipment of shipments)run.exitBatches[shipment.dockId]++;
  const classified=classifyPlacement(result.events,piece.cargo);run.exitAdjacentPlacements+=Number(classified.exitAdjacent);
  run.gateContactPlacements+=Number(classified.gateContact);run.selfShipmentPlacements+=Number(classified.selfShipmentPlacement);run.selfShipmentBatches+=classified.selfShipmentBatches;
  const diagnostic=diagnoseBoard(state);
  run.entryOccupiedTurns+=Number(diagnostic.entryOccupied);run.routeBlockedTurns+=Number(diagnostic.routeBlockedReadyExits>0);
  if(diagnostic.entryOccupied&&run.firstEntryOccupiedPlacement===null)run.firstEntryOccupiedPlacement=run.placements;
  run.trace.push({commandIndex:state.commandIndex,command,checksum:checksum(state),events:result.events});
 }
 const replayed=replayWithTrace(seed,state.commands,'color_exit',4);assert.deepEqual(replayed.state,state);
 assert.deepEqual(replayed.trace,run.trace.map(({commandIndex,checksum:hash})=>({commandIndex,checksum:hash})));run.replayChecks=replayed.trace.length;
 run.status=state.phase==='result'?state.result:'capped';
 if(run.status==='failed'){assert.equal(state.endReason,'blocked');assert.equal(findLegalMoves(state).length,0);}
 run.maxOccupancy=state.maxOccupancy??0;run.maxChain=state.maxChain;run.finalChecksum=checksum(state);
 run.finalDiagnostic=diagnoseBoard(state);run.finalSave=JSON.parse(encodeRun(state));
 return run;
}

function distribution(values){
 if(!values.length)return {n:0,min:null,p25:null,median:null,p75:null,max:null,mean:null};
 const sorted=[...values].sort((a,b)=>a-b),quantile=q=>{const index=(sorted.length-1)*q,lower=Math.floor(index);return sorted[lower]+(sorted[Math.ceil(index)]-sorted[lower])*(index-lower);};
 return {n:values.length,min:sorted[0],p25:quantile(.25),median:quantile(.5),p75:quantile(.75),max:sorted.at(-1),mean:sum(values)/values.length};
}

function aggregateRuns(runs){
 const total=key=>sum(runs.map(run=>run[key])),perRun=key=>distribution(runs.map(run=>run[key]));
 const placements=total('placements'),batches=total('batches');
 const exitBatches=Object.fromEntries(COLOR_EXIT_DOCKS.map(dock=>[dock.id,sum(runs.map(run=>run.exitBatches[dock.id]))]));
 const shares=Object.values(exitBatches).map(n=>ratio(n,batches));
 const failureRuns=runs.filter(run=>run.status==='failed'),entryFailed=failureRuns.filter(run=>run.finalDiagnostic.entryOccupied);
 const routeFailed=failureRuns.filter(run=>run.finalDiagnostic.routeBlockedReadyExits>0);
 const example=run=>({seed:run.seed,strategy:run.strategy,placements:run.placements,batches:run.batches,firstEntryOccupiedPlacement:run.firstEntryOccupiedPlacement,finalChecksum:run.finalChecksum,board:run.finalSave.state.board,diagnostic:run.finalDiagnostic});
 return {runs:runs.length,won:runs.filter(run=>run.status==='won').length,failed:failureRuns.length,capped:runs.filter(run=>run.status==='capped').length,
  effectivePlacements:placements,placements:perRun('placements'),firstBatch:distribution(runs.filter(run=>run.firstBatchPlacement!==null).map(run=>run.firstBatchPlacement)),noBatchRuns:runs.filter(run=>run.firstBatchPlacement===null).length,
  batches,batchesPerRun:perRun('batches'),maxOccupancy:perRun('maxOccupancy'),maxChain:perRun('maxChain'),
  chainDistribution:Object.fromEntries([0,1,2,3].map(chain=>[chain,sum(runs.map(run=>run.chainDistribution[chain]))])),
  exitBatches,exitShares:Object.fromEntries(COLOR_EXIT_DOCKS.map(d=>[d.id,ratio(exitBatches[d.id],batches)])),
  exitBias:{maxMinusMinShare:batches?Math.max(...shares)-Math.min(...shares):null,totalVariationFromUniform:batches?sum(shares.map(s=>Math.abs(s-1/3)))/2:null},
  cargoPlacements:Object.fromEntries(COLOR_EXIT_DOCKS.map(d=>[d.cargo,sum(runs.map(run=>run.cargoPlacements[d.cargo]))])),
  exitAdjacent:{count:total('exitAdjacentPlacements'),denominator:placements,rate:ratio(total('exitAdjacentPlacements'),placements),perRun:distribution(runs.map(run=>ratio(run.exitAdjacentPlacements,run.placements)))},
  gateContact:{count:total('gateContactPlacements'),denominator:placements,rate:ratio(total('gateContactPlacements'),placements)},
  selfShipment:{placements:total('selfShipmentPlacements'),placementDenominator:placements,placementRate:ratio(total('selfShipmentPlacements'),placements),batches:total('selfShipmentBatches'),batchDenominator:batches,batchRate:ratio(total('selfShipmentBatches'),batches)},
  diagnostics:{everEntryOccupiedRuns:runs.filter(run=>run.entryOccupiedTurns>0).length,entryOccupiedTurns:total('entryOccupiedTurns'),routeBlockedTurns:total('routeBlockedTurns'),
   entryOccupiedFailures:entryFailed.length,routeBlockedReadyFailures:routeFailed.length,entryOrRouteBlockedFailures:failureRuns.filter(run=>run.finalDiagnostic.entryOccupied||run.finalDiagnostic.routeBlockedReadyExits>0).length,
   failuresWithoutEitherDiagnostic:failureRuns.filter(run=>!run.finalDiagnostic.entryOccupied&&run.finalDiagnostic.routeBlockedReadyExits===0).length,
   entryFailureExamples:entryFailed.slice(0,3).map(example),routeFailureExamples:routeFailed.slice(0,3).map(example),otherFailureExamples:failureRuns.filter(run=>!run.finalDiagnostic.entryOccupied&&run.finalDiagnostic.routeBlockedReadyExits===0).slice(0,3).map(example)},
  validation:{saveChecks:total('saveChecks'),replayChecks:total('replayChecks'),previewCommandChecks:placements},
 };
}

export function runComparison({seedStart=1,runs=100,maxCommands=3000,onRun}={}){
 if(!Number.isInteger(runs)||runs<1||runs>100)throw Error('runs must be 1..100 paired seeds');
 if(!Number.isInteger(seedStart)||seedStart<1||seedStart+runs-1>2147483647)throw Error('Invalid consecutive seed range');
 if(!Number.isInteger(maxCommands)||maxCommands<1||maxCommands>3000)throw Error('maxCommands must be 1..3000');
 assertProtocol();const records=[];
 for(let seed=seedStart;seed<seedStart+runs;seed++)for(const strategy of STRATEGIES){const run=simulateRun(seed,{strategy,maxCommands});records.push(run);onRun?.(run);}
 const a=records.filter(r=>r.strategy==='exit_feed'),b=records.filter(r=>r.strategy==='route_group');
 const outcomePairs={};for(let i=0;i<a.length;i++){const key=`${a[i].status}/${b[i].status}`;outcomePairs[key]=(outcomePairs[key]??0)+1;}
 const summary={protocol:PROTOCOL,config:RULES_V4_CONFIG,seedStart,seedEnd:seedStart+runs-1,pairedSeeds:runs,totalRuns:records.length,maxCommands,
  strategies:Object.fromEntries(STRATEGIES.map(strategy=>[strategy,aggregateRuns(records.filter(r=>r.strategy===strategy))])),
  paired:{outcomesAOverB:outcomePairs,placementsBMinusA:distribution(b.map((run,i)=>run.placements-a[i].placements)),batchesBMinusA:distribution(b.map((run,i)=>run.batches-a[i].batches))}};
 return {summary,runs:records};
}

const pct=value=>value===null?'未观察':`${(100*value).toFixed(2)}%`;
const dist=value=>value.n?`中位 ${value.median}；P25–P75 ${value.p25}–${value.p75}；范围 ${value.min}–${value.max}；均值 ${value.mean.toFixed(2)}`:'未观察';
export function reportMarkdown(summary){
 const lines=['# 颜色出口 P0：有界双策略经验测量','',`连续 seeds ${summary.seedStart}–${summary.seedEnd}，${summary.pairedSeeds} 对，共 ${summary.totalRuns} 局。min4 / 30批 / 三色 / 单格出口 / 南空路；balanced:false。每局 cap ${summary.maxCommands} 条有效命令。`,'',
  '## 解释边界','',
  '这是100 paired seeds / 两个固定手写 heuristic 的小样经验分布（试跑文件的数量另列），不能证明策略最优、玩法平衡或好玩；没有调低或提高 min4。相同 seed 在策略分岔后不保证相同货物序列：占用、货类存量、难度档和所选候选槽影响后续生成。此新模式与旧模式历史100002局协议不同，不能直接公平比较胜率。','',
  '所有失败均经真实规则确认三候选全部无合法落点。入口占用/已达标出口无路只是终局共现诊断，不等于已证明失败因果；没有达标货物时不会误记“无路”。cap 是未完成异常，绝不算败局。','',
  '## 预先固定策略','',`A exit_feed：${PROTOCOL.exit_feed}`,`B route_group：${PROTOCOL.route_group}`,`平局：${PROTOCOL.tieBreak}`,`观察范围：${PROTOCOL.policyObservation}`,'',
  '## 指标口径','',
  '有效落子=真实 applyCommand 接受的 place；首批步数=首次出现 shipment 的有效落子序号，未出首批另报。峰值占用包含刚放下、清货前的瞬时占用。出口邻近=本次任一放置格距对应单格门的曼哈顿距离≤1，另报真正占门格。',
  '单货件自出=shipment.cells 全部属于同条 placed.cells；4/5格货件照样可算一次货件即成批，不是 shipment.cells.length===1。两个比例分别以有效落子、全部出货批次为分母。三出口偏差给出批数占比、最大-最小占比和相对均匀分布的总变差（描述性；未控制三色供货比例）。',''];
 for(const strategy of STRATEGIES){const s=summary.strategies[strategy];lines.push(`## ${strategy==='exit_feed'?'A 贴口供货':'B 留路连组'}`,'',
  `- 胜 / 败 / cap：${s.won} / ${s.failed} / ${s.capped}`,
  `- 首批步数：${dist(s.firstBatch)}；未出首批 ${s.noBatchRuns} 局`,
  `- 每局有效落子：${dist(s.placements)}；累计 ${s.effectivePlacements} 次`,
  `- 每局出货批数：${dist(s.batchesPerRun)}；累计 ${s.batches} 批`,
  `- 峰值占用格：${dist(s.maxOccupancy)}；最大 chain：${dist(s.maxChain)}；逐落子 chain 分布 ${JSON.stringify(s.chainDistribution)}`,
  `- 出口批数 N/E/W：${Object.values(s.exitBatches).join(' / ')}；占比 ${Object.values(s.exitShares).map(pct).join(' / ')}；最大-最小 ${pct(s.exitBias.maxMinusMinShare)}；总变差 ${pct(s.exitBias.totalVariationFromUniform)}`,
  `- 贴对应出口邻近：${s.exitAdjacent.count}/${s.exitAdjacent.denominator} = ${pct(s.exitAdjacent.rate)}；直接占对应门格 ${s.gateContact.count}/${s.gateContact.denominator} = ${pct(s.gateContact.rate)}`,
  `- 单货件即时自出：${s.selfShipment.placements}/${s.selfShipment.placementDenominator} 落子 = ${pct(s.selfShipment.placementRate)}；${s.selfShipment.batches}/${s.selfShipment.batchDenominator} 批 = ${pct(s.selfShipment.batchRate)}`,
  `- 曾占南入口 ${s.diagnostics.everEntryOccupiedRuns} 局 / ${s.diagnostics.entryOccupiedTurns} 步；终局入口占用败局 ${s.diagnostics.entryOccupiedFailures}；入口仍空但达标出口无路败局 ${s.diagnostics.routeBlockedReadyFailures}；两诊断并集 ${s.diagnostics.entryOrRouteBlockedFailures}；不含两诊断的败局 ${s.diagnostics.failuresWithoutEitherDiagnostic}`,
  `- 验证：${s.validation.previewCommandChecks} 次 preview/真实命令一致，${s.validation.saveChecks} 次保存恢复全状态及 checksum 一致，${s.validation.replayChecks} 个逐命令 Replay checksum 一致。`,'');
  for(const [label,examples] of [['入口占用败局',s.diagnostics.entryFailureExamples],['达标但无路败局',s.diagnostics.routeFailureExamples],['其他无位败局',s.diagnostics.otherFailureExamples]])lines.push(`${label}例子：${examples.length?examples.map(e=>`seed ${e.seed}，${e.placements} 步/${e.batches}批，checksum ${e.finalChecksum}`).join('；'):'本样本未观察到'}。`);
  lines.push('');
 }
 lines.push('## 配对与复现','',`A/B终局配对计数：${JSON.stringify(summary.paired.outcomesAOverB)}。B-A有效落子差：${dist(summary.paired.placementsBMinusA)}；批数差：${dist(summary.paired.batchesBMinusA)}。这里配对控制初始seed，不代表控制策略分岔后的供货。`,'',
  'runs.jsonl 逐局保留连续 seed、完整 command/events/checksum trace 和最终 schema4 存档；summary.json 含完整统计与终局棋盘例子；manifest.json 记录源文件 SHA256、运行环境、耗时、参数和输出哈希。没有网络、安装、并行 worker、补救随机或规则修改。',
  `复现：node qa/color-exit-compare.mjs --runs ${summary.pairedSeeds} --seed-start ${summary.seedStart} --max-commands ${summary.maxCommands} --output artifacts/color-exit-comparison/reproduced`,'',
  '进一步判断需真人试两种模式，观察是否单调贴口、留路是否容易理解以及重玩意愿；本报告只量出风险，不据胜率宣布主模式。','');
 return lines.join('\n');
}

function sourceHashes(){
 const files=[];const walk=dir=>{for(const entry of readdirSync(dir,{withFileTypes:true})){const path=join(dir,entry.name);if(entry.isDirectory())walk(path);else if(entry.name.endsWith('.ts'))files.push(path);}};
 walk(join(ROOT,'src/domain'));files.push(join(ROOT,'src/application/save.ts'),fileURLToPath(import.meta.url));
 return Object.fromEntries(files.sort().map(path=>[relative(ROOT,path),sha(readFileSync(path))]));
}

function main(){
 const options={runs:100,seedStart:1,maxCommands:3000,output:join(ROOT,'artifacts/color-exit-comparison/formal')};
 const mapping={'--runs':'runs','--seed-start':'seedStart','--max-commands':'maxCommands','--output':'output'};
 for(let i=2;i<process.argv.length;i+=2){const key=mapping[process.argv[i]],value=process.argv[i+1];if(!key||value===undefined)throw Error(`Unknown or incomplete option ${process.argv[i]}`);options[key]=key==='output'?resolve(value):Number(value);}
 const sourceBefore=sourceHashes(),start=performance.now();mkdirSync(options.output,{recursive:true});
 const result=runComparison({...options,onRun:run=>process.stderr.write(`${run.seed} ${run.strategy}: ${run.status}, ${run.placements} placements, ${run.batches} batches\n`)});
 const elapsedSeconds=(performance.now()-start)/1000,sourceAfter=sourceHashes();assert.deepEqual(sourceAfter,sourceBefore,'Measurement source changed during run');
 const contents={'summary.json':JSON.stringify(result.summary,null,2)+'\n','runs.jsonl':result.runs.map(run=>JSON.stringify(run)).join('\n')+'\n','report.md':reportMarkdown(result.summary)};
 for(const [file,content] of Object.entries(contents))writeFileSync(join(options.output,file),content);
 const manifest={protocolId:PROTOCOL.id,sourceFiles:sourceBefore,sourceUnchangedDuringRun:true,config:RULES_V4_CONFIG,
  command:process.argv.slice(1),node:process.version,singleProcess:true,networkUsed:false,installedSoftware:false,
  seedStart:options.seedStart,seedEnd:options.seedStart+options.runs-1,pairedSeeds:options.runs,totalRuns:result.runs.length,maxCommands:options.maxCommands,
  elapsedSeconds,secondsPerRun:elapsedSeconds/result.runs.length,outputs:Object.fromEntries(Object.entries(contents).map(([file,content])=>[file,sha(content)]))};
 writeFileSync(join(options.output,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
 console.log(JSON.stringify({output:options.output,totalRuns:result.runs.length,elapsedSeconds,secondsPerRun:manifest.secondsPerRun,strategies:Object.fromEntries(STRATEGIES.map(s=>[s,{won:result.summary.strategies[s].won,failed:result.summary.strategies[s].failed,capped:result.summary.strategies[s].capped}]))},null,2));
 if(result.runs.some(run=>run.status==='capped'))process.exitCode=2;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){try{main();}catch(error){console.error(error);process.exitCode=1;}}
