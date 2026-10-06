/** Q1: fixed, source-bound observations. No live rule, economy or policy tuning. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {existsSync,mkdirSync,readFileSync,readdirSync,renameSync,writeFileSync,unlinkSync} from 'node:fs';
import {dirname,join,relative,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {performance} from 'node:perf_hooks';
import {createPlayableRun,applyPlayableCommand,playableChecksum,previewPlayablePlacement} from '../src/domain/playable.ts';
import {decodeGameRun,encodeGameRun} from '../src/application/game-codec.ts';
import {baseCoins,ITEM_PRICES} from '../src/application/economy.ts';
import {createRandomState,nextRandom} from '../src/domain/random.ts';
import {findLegalMovesV9,pieceCellsV9,docksV9,selectOrderGroupV9,neighborsV9} from '../src/domain/v9/board.ts';
import {findRescuePlanV9} from '../src/domain/v9/tools.ts';
import {eligibleUpgradesV9,shipmentBonusV9} from '../src/domain/v9/upgrades.ts';
import {RULES_V9_CONFIG,UPGRADES_V9,emptyLevelsV9} from '../src/domain/v9/content.ts';
import {chooseMove as chooseOutboundRoute} from '../qa/outbound-v6-compare.mjs';
import {findLegalMovesV6,previewPlacementV6} from '../src/domain/v6/engine.ts';
import {outboundRunConfigId as outboundRunConfigIdV6} from '../src/domain/v6/content.ts';
import {CARGO} from '../src/domain/rulesets/v1/content.ts';

const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const sha=value=>createHash('sha256').update(value).digest('hex');
const inc=(map,key,amount=1)=>{map[key]=(map[key]??0)+amount;};
const sum=values=>values.reduce((n,value)=>n+value,0);
const ratio=(n,d)=>d?n/d:null;
const TOOLS=Object.freeze({none:{rotate:0,clear:0,wildcard:0},rotate_clear:{rotate:1,clear:1,wildcard:0},rotate_wildcard:{rotate:1,clear:0,wildcard:1},clear_wildcard:{rotate:0,clear:1,wildcard:1}});
export const PROTOCOL=Object.freeze({id:'growth-q1-bounded-v2',strategies:['route','greedy'],placementCap:300,
 decision:'Current visible board/candidates/orders only. Candidate tray order then y/x breaks ties. No future generator or upgrade draws are inspected.',
 inboundRoute:'Geometric current-order settlement only: 15*shipmentScore + 25*shippedCells - 3*placedCells; +14 same cargo adjacent contact, +1 empty adjacent contact, -300 occupied active dock cell, +12 order cargo. No regenerated order or candidate lookahead.',
 inboundGreedy:'Maximize unique shipment and hazard-clear cells minus placed cells, then shipment score; no future generation.',
 outboundRoute:'Exact frozen qa/outbound-v6-compare per-cell route/group policy, evaluated on a temporary v6 geometry observation. Real runs and reducers remain v8 normal or v10 endless.',
 outboundGreedy:'Maximize current visible physical shipped cells minus placed cells, then shipment score; frozen v6 geometry only.',
 upgrade:'Uniform choice among the visible offer using a separate pure-rand cursor seeded seed XOR 0x4f1bbcdc; same starting cursor for both policies/cleanup/tools. First current order cargo for initial supply.',
 tools:'Use legal domain rescue plan only when phase=rescue, never in outbound. Paired same seed/strategy/cleanup, not synchronized generator draws after trajectories diverge.',
 clock:'Measure bot decision wall ms, process CPU ms and total machine wall ms separately. Model mandatory animation = 1000 ms per actual shipment group; machine-active model minutes=(machine wall + mandatory animation)/60000. This is not human play time, income/minute or fun.',
 caps:'A nonterminal 300-successful-placement prefix is capped/inconclusive, never failed or won; its base coins are potential formula value, not a credited wallet award.'});

function integer(n,name,min,max){assert.ok(Number.isSafeInteger(n)&&n>=min&&n<=max,`${name} must be bounded ${min}..${max}`);return n;}
export function buildPlan({profile='baseline',seedStart=1,seedEnd,strategies=['route','greedy'],maxPlacements=300}={}){
 assert.ok(['baseline','income','tools','all','pilot'].includes(profile),'Unknown profile');
 integer(maxPlacements,'placements',1,300);integer(seedStart,'seed start',1,64);
 seedEnd??=profile==='baseline'||profile==='all'?64:profile==='pilot'?1:32;
 integer(seedEnd,'seed end',seedStart,profile==='baseline'||profile==='all'?64:32);
 assert.ok(strategies.length>0&&strategies.every(name=>PROTOCOL.strategies.includes(name))&&new Set(strategies).size===strategies.length,'Unknown/duplicate strategy');
 const cases=[];
 const add=(group,spec,strategy,cleanup='orders',tools='none')=>cases.push({id:[group,spec.family,spec.mode??spec.variant,spec.difficultyId??'na',strategy,cleanup,tools,`s${spec.seed}`].join('-'),group,spec,strategy,cleanup,tools,maxPlacements});
 const inbound=(seed,mode,tools)=>({family:'inbound',mode,rulesetVersion:9,seed,guided:false,toolCharges:{...TOOLS[tools]}});
 for(let seed=seedStart;seed<=seedEnd;seed++)for(const strategy of strategies){
  if(['baseline','all','pilot'].includes(profile))for(const cleanup of ['orders','placements'])add('baseline',inbound(seed,'standard','none'),strategy,cleanup);
  if(['income','all','pilot'].includes(profile)&&seed<=32){
   for(const mode of ['standard','endless'])add('income',inbound(seed,mode,'none'),strategy);
   for(const difficultyId of ['easy','normal','hard','expert'])for(const variant of ['normal','endless'])add('income',{family:'outbound',variant,rulesetVersion:variant==='normal'?8:10,seed,difficultyId},strategy);
  }
  if(['tools','all','pilot'].includes(profile)&&seed<=32)for(const mode of ['standard','endless'])for(const tools of Object.keys(TOOLS).slice(1))add('tools',inbound(seed,mode,tools),strategy,'orders',tools);
 }
 return {protocol:PROTOCOL.id,profile,seedStart,seedEnd,strategies:[...strategies],maxPlacements,cases};
}

/** Geometric projection calls the real pure selectors, never the reducer/generator. */
function inboundProjection(state,move){
 const piece=state.candidates.find(p=>p.id===move.pieceId),size=state.boardSize;
 const cells=pieceCellsV9(piece).map(p=>(p.y+move.origin.y)*size+p.x+move.origin.x);
 const board=[...state.board],cellTraits=[...state.cellTraits];
 for(const cell of cells){board[cell]=piece.cargo;cellTraits[cell]=piece.trait?{kind:piece.trait}:null;}
 const view={...state,board,cellTraits},cleared=new Set(),pending=[...state.orders];let value=0,batches=0;
 const docks=docksV9(view);pending.sort((a,b)=>docks.findIndex(d=>d.id===a.dockId)-docks.findIndex(d=>d.id===b.dockId));
 while(pending.length){let group=null,index=-1;for(let i=0;i<pending.length;i++){group=selectOrderGroupV9(view,pending[i]);if(group){index=i;break;}}if(!group)break;
  const [order]=pending.splice(index,1);batches++;
  const base=order.baseScore+Math.max(0,group.group.units-order.amount)*RULES_V9_CONFIG.score.overfill+(group.path.length-1)*RULES_V9_CONFIG.score.routeDepth;
  value+=Math.floor(base*(100+(batches-1)*RULES_V9_CONFIG.score.chainPercent)/100)+shipmentBonusV9(state,group.group.units,order.amount,batches);
  const extra=group.group.cells.some(i=>cellTraits[i]?.kind==='hazard')?[...new Set(group.group.cells.flatMap(i=>neighborsV9(i,size)))].sort((a,b)=>a-b).filter(i=>cellTraits[i]?.kind==='waste').slice(0,1):[];
  for(const cell of [...group.group.cells,...extra]){cleared.add(cell);board[cell]=null;cellTraits[cell]=null;}
 }
 return {piece,cells,cleared,value,batches};
}
function outboundObservation(state){return {...state,rulesetVersion:6,runConfigId:outboundRunConfigIdV6(state.difficultyId),seed:0,rngState:[0,0,0,0],commands:[],commandIndex:0,nextId:0,shift:1,score:0,completedOrders:0,generatedPieces:0};}
export function chooseGrowthMove(state,strategy='route'){
 assert.ok(PROTOCOL.strategies.includes(strategy),'Unknown strategy');if(state.phase!=='input')return null;
 if(state.rulesetVersion!==9){const view=outboundObservation(state);if(strategy==='route')return chooseOutboundRoute(view);
  let best=null,bestValue=-Infinity,bestSecondary=-Infinity;
  for(const move of findLegalMovesV6(view)){const preview=previewPlacementV6(view,move.pieceId,move.origin);assert.ok(preview.valid);
   const value=sum(preview.shipments.map(s=>s.cells.length))-preview.cells.length,secondary=sum(preview.shipments.map(s=>s.score));
   if(value>bestValue||value===bestValue&&secondary>bestSecondary){best=move;bestValue=value;bestSecondary=secondary;}}
  return best;
 }
 let best=null,bestValue=-Infinity,bestSecondary=-Infinity;
 for(const move of findLegalMovesV9(state)){const projection=inboundProjection(state,move);let value,secondary=0;
  if(strategy==='greedy'){value=projection.cleared.size-projection.cells.length;secondary=projection.value;}
  else{value=projection.value*15+projection.cleared.size*25-projection.cells.length*3;
   for(const cell of projection.cells){for(const n of neighborsV9(cell,state.boardSize)){if(state.board[n]===projection.piece.cargo)value+=14;else if(state.board[n]===null)value++;}
    if(docksV9(state).some(d=>d.entry.y*state.boardSize+d.entry.x===cell))value-=300;}
   if(state.orders.some(o=>o.cargo===projection.piece.cargo))value+=12;
  }
  if(value>bestValue||value===bestValue&&secondary>bestSecondary){best=move;bestValue=value;bestSecondary=secondary;}
 }
 return best;
}
export const coinsFor=(family,units,score)=>baseCoins(family,units,score);
function initialMetrics(){return {status:'capped',failure:0,placements:0,commands:0,shipmentGroups:0,shippedCells:0,shipUnits:0,score:0,units:0,shift:1,
 earlyFailure:0,occupiedFractionSum:0,peakOccupancy:0,chainDistribution:{},maxChain:0,rushPlaced:0,rushShipped:0,rushExpired:0,wasteCellPlacementSum:0,wastePeak:0,
 cleanupTriggers:0,cleanupEmptyTriggers:0,cleanupCleared:0,hazardCleared:0,palletUnitsShipped:0,wildcardCellsShipped:0,
 upgradeOffered:{},upgradeChosen:{},toolUsed:{},generatedByShiftTrait:{},rescueEpisodes:0,codecChecks:0,previewChecks:0,replayChecks:0,decisionMs:0,machineWallMs:0,processCpuMs:0};}
function checkpoint(run){const raw=encodeGameRun(run.state);assert.deepEqual(decodeGameRun(raw),run.state);run.metrics.codecChecks++;return raw;}
function snapshot(run){return {...run,state:run.state,metrics:{...run.metrics},trace:[...run.trace],upgradeRng:[...run.upgradeRng]};}
function decide(run){const {state}=run;
 if(state.phase==='cleanup')return {type:'chooseCleanup',branch:run.cleanup};
 if(state.phase==='upgrade'){
  const draw=nextRandom(run.upgradeRng,0,state.upgradeChoices.length-1);run.upgradeRng=draw.state;
  const upgradeId=state.upgradeChoices[draw.value];let cargo;
  if(upgradeId==='cargo_supply'&&!state.supplyCargo){const unlocked=CARGO.slice(0,RULES_V9_CONFIG.cargoByShift[state.shift-1]).map(c=>c.id);cargo=state.orders.map(o=>o.cargo).find(c=>unlocked.includes(c))??unlocked[0];}
  return {type:'upgrade',upgradeId,...(cargo?{cargo}:{})};
 }
 if(state.phase==='rescue'){const plan=findRescuePlanV9(state);assert.ok(plan?.length,'Rescue phase has no legal plan');return plan[0];}
 const move=chooseGrowthMove(state,run.strategy);assert.ok(move,'Nonterminal input lacks a legal move');return {type:'place',...move};
}
export function simulateGrowthCase(caseSpec,{resume,beforeCommand,onCheckpoint,previewEvery=10}={}){
 const run=resume?structuredClone(resume):{...caseSpec,state:createPlayableRun(caseSpec.spec),metrics:initialMetrics(),trace:[],upgradeRng:createRandomState((caseSpec.spec.seed^0x4f1bbcdc)|0)};
 assert.equal(run.id,caseSpec.id);verifyGrowthReplay(run);let wallCursor=performance.now(),cpuCursor=process.cpuUsage(),attemptedCommand=null,previousCursor=null;
 const chargeTime=()=>{const now=performance.now(),cpu=process.cpuUsage(cpuCursor);run.metrics.processCpuMs+=(cpu.user+cpu.system)/1000;run.metrics.machineWallMs+=now-wallCursor;wallCursor=now;cpuCursor=process.cpuUsage();};
 delete run.error;delete run.attemptedCommand;
 if(!resume){checkpoint(run);for(const piece of run.state.candidates)inc(run.metrics.generatedByShiftTrait,`${run.state.shift}/${piece.trait??(piece.cellCargos?'mixed':'normal')}`);}
 try{
  while(run.state.phase!=='result'&&run.metrics.placements<run.maxPlacements){
   const old=run.state,tick=performance.now();previousCursor=[...run.upgradeRng];
   attemptedCommand=decide(run);run.metrics.decisionMs+=performance.now()-tick;
   // Save the cursor before attempted command; a failed decision/command must be retried identically.
   beforeCommand?.({state:old,command:attemptedCommand,id:run.id});
   const preview=attemptedCommand.type==='place'&&old.commandIndex%previewEvery===0?previewPlayablePlacement(old,attemptedCommand.pieceId,attemptedCommand.origin):null;
   const result=applyPlayableCommand(old,attemptedCommand);assert.equal(result.error,undefined,JSON.stringify(attemptedCommand));assert.equal(result.state.commandIndex,old.commandIndex+1);
   if(preview){assert.ok(preview.valid);assert.deepEqual(result.events,preview.events);assert.deepEqual(result.state,preview.stateAfter);run.metrics.previewChecks++;}
   const shipments=result.events.filter(e=>e.type==='shipment');run.metrics.commands++;
   if(attemptedCommand.type==='place'){
    run.metrics.placements++;const piece=old.candidates.find(p=>p.id===attemptedCommand.pieceId);if(piece.trait==='rush')run.metrics.rushPlaced++;
    inc(run.metrics.chainDistribution,shipments.length);run.metrics.shipmentGroups+=shipments.length;run.metrics.shippedCells+=sum(shipments.map(s=>s.cells.length));run.metrics.shipUnits+=sum(shipments.map(s=>s.units??s.cells.length));
    for(const shipment of shipments){for(const cell of shipment.cells){const trait=old.cellTraits?.[cell]?.kind??(result.events.find(e=>e.type==='placed')?.cells.includes(cell)?piece.trait:null);
     if(trait==='rush')run.metrics.rushShipped++;if(trait==='pallet')run.metrics.palletUnitsShipped+=2;if(trait==='wildcard')run.metrics.wildcardCellsShipped++;}
     run.metrics.hazardCleared+=shipment.extraClearedCells?.length??0;}
    if(old.rulesetVersion===9&&old.cleanup){const progress=old.cleanup.progress+(old.cleanup.branch==='orders'?shipments.length:1),target=RULES_V9_CONFIG.cleanup[old.cleanup.branch],triggers=Math.floor(progress/target),removed=sum(result.events.filter(e=>e.type==='cleanup').map(e=>e.cells.length));
     run.metrics.cleanupTriggers+=triggers;run.metrics.cleanupEmptyTriggers+=triggers-removed;run.metrics.cleanupCleared+=removed;}
    run.metrics.rushExpired+=sum(result.events.filter(e=>e.type==='rushExpired').map(e=>e.cells.length));
    const occupied=result.state.board.filter(Boolean).length,waste=result.state.cellTraits?.filter(t=>t?.kind==='waste').length??0;
    run.metrics.occupiedFractionSum+=occupied/result.state.board.length;run.metrics.peakOccupancy=Math.max(run.metrics.peakOccupancy,result.state.maxOccupancy??occupied);run.metrics.wasteCellPlacementSum+=waste;run.metrics.wastePeak=Math.max(run.metrics.wastePeak,waste);
   }
   if(old.phase!=='rescue'&&result.state.phase==='rescue')run.metrics.rescueEpisodes++;
   const previousIds=new Set(old.candidates.map(p=>p.id));for(const piece of result.state.candidates)if(!previousIds.has(piece.id))inc(run.metrics.generatedByShiftTrait,`${result.state.shift}/${piece.trait??(piece.cellCargos?'mixed':'normal')}`);
   for(const event of result.events){if(event.type==='upgrade')for(const id of event.choices)inc(run.metrics.upgradeOffered,id);if(event.type==='upgradeChosen')inc(run.metrics.upgradeChosen,event.upgradeId);if(event.type==='toolUsed')inc(run.metrics.toolUsed,event.toolId);}
   run.state=result.state;run.trace.push({command:attemptedCommand,checksum:playableChecksum(run.state),events:result.events});attemptedCommand=null;previousCursor=null;
   if(run.state.commandIndex%10===0){checkpoint(run);chargeTime();onCheckpoint?.(snapshot(run));}
  }
  checkpoint(run);chargeTime();
  run.metrics.status=run.state.phase==='result'?run.state.result:'capped';run.metrics.failure=Number(run.metrics.status==='failed');run.metrics.earlyFailure=Number(run.metrics.status==='failed'&&run.state.completedOrders<6);
  run.metrics.score=run.state.score;run.metrics.units=run.state.completedOrders;run.metrics.shift=run.state.shift;run.metrics.maxChain=run.state.maxChain;
  run.metrics.coins=coinsFor(run.spec.family,run.metrics.units,run.metrics.score);run.metrics.meanOccupancy=ratio(run.metrics.occupiedFractionSum,run.metrics.placements);
  run.metrics.mandatoryAnimationMs=run.metrics.shipmentGroups*1000;run.metrics.machineActiveModelMinutes=(run.metrics.machineWallMs+run.metrics.mandatoryAnimationMs)/60000;
  run.metrics.coinsPerUnit=ratio(run.metrics.coins,run.metrics.units);run.metrics.coinsPerPlacement=ratio(run.metrics.coins,run.metrics.placements);run.metrics.coinsPerMachineActiveModelMinute=ratio(run.metrics.coins,run.metrics.machineActiveModelMinutes);
  run.metrics.toolAcquisitionCost=sum(Object.entries(TOOLS[run.tools]).map(([id,count])=>ITEM_PRICES[id]*count));run.metrics.usedToolValue=sum(Object.entries(run.metrics.toolUsed).map(([id,count])=>ITEM_PRICES[id]*count));
  run.metrics.remainingTools=run.state.toolCharges??null;
  run.metrics.replayChecks=verifyGrowthReplay(run).commands;run.finalChecksum=playableChecksum(run.state);return run;
 }catch(error){if(previousCursor)run.upgradeRng=previousCursor;chargeTime();run.attemptedCommand=attemptedCommand;run.error=String(error);error.simulation=snapshot(run);throw error;}
}
export function verifyGrowthReplay(run){
 let state=createPlayableRun(run.spec),upgradeRng=createRandomState((run.spec.seed^0x4f1bbcdc)|0);assert.equal(run.trace.length,run.state.commandIndex,'Replay prefix length mismatch');
 for(const entry of run.trace){if(entry.command.type==='upgrade')upgradeRng=nextRandom(upgradeRng,0,state.upgradeChoices.length-1).state;
  const result=applyPlayableCommand(state,entry.command);assert.equal(result.error,undefined,'Replay command rejected');state=result.state;assert.equal(playableChecksum(state),entry.checksum,'Replay checksum mismatch');assert.deepEqual(result.events,entry.events,'Replay event mismatch');}
 if(run.upgradeRng)assert.deepEqual(run.upgradeRng,upgradeRng,'Bot upgrade cursor mismatch');
 if(run.metrics){assert.equal(run.metrics.commands,run.trace.length,'Checkpoint command accounting corrupted');assert.equal(run.metrics.placements,run.trace.filter(e=>e.command.type==='place').length,'Checkpoint placement accounting corrupted');assert.equal(run.metrics.shipmentGroups,state.completedOrders,'Checkpoint shipment accounting corrupted');}
 assert.deepEqual(state,run.state,'Replay final state mismatch');return {checksum:playableChecksum(state),commands:run.trace.length};
}
function filesIn(path){return readdirSync(path,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?filesIn(join(path,entry.name)):[join(path,entry.name)]);}
export function sourceBinding(){
 const rules=filesIn(join(ROOT,'src/domain')).filter(path=>path.endsWith('.ts'));
 const paths=[...rules,...filesIn(join(ROOT,'src/shared')).filter(path=>path.endsWith('.ts')),join(ROOT,'src/application/economy.ts'),join(ROOT,'src/application/game-codec.ts'),join(ROOT,'src/application/save.ts'),join(ROOT,'src/application/run-slots.ts')];
 const policy=[join(ROOT,'scripts/simulate-growth.mjs'),join(ROOT,'qa/outbound-v6-compare.mjs'),join(ROOT,'qa/mixed-color-compare.mjs')];
 const hashes=Object.fromEntries([...paths,...policy].sort().map(path=>[relative(ROOT,path),sha(readFileSync(path))]));
 return {commit:execFileSync('git',['rev-parse','HEAD'],{cwd:ROOT,encoding:'utf8'}).trim(),files:hashes,sha256:sha(JSON.stringify(hashes))};
}
function atomicJson(path,value){mkdirSync(dirname(path),{recursive:true});writeFileSync(`${path}.tmp`,JSON.stringify(value,null,2)+'\n');renameSync(`${path}.tmp`,path);}
function evidenceEnvelope(run,item,sourceHash){return {sourceHash,caseHash:sha(JSON.stringify(item)),evidenceHash:sha(JSON.stringify(run)),run};}
function validateEvidence(record,item,binding){
 assert.equal(record.sourceHash,binding.sha256,'Evidence source binding mismatch');assert.equal(record.caseHash,sha(JSON.stringify(item)),'Evidence case binding mismatch');assert.equal(record.evidenceHash,sha(JSON.stringify(record.run)),'Evidence hash corrupted');
 for(const [key,value] of Object.entries(item))assert.deepEqual(record.run[key],value,`Evidence ${key} case binding mismatch`);
 verifyGrowthReplay(record.run);return record.run;
}
export function runGrowthSuite(plan,{output,stopAfter=Infinity,beforeCommand,onRun,budgetMs=3600000}={}){
 assert.ok(output,'Output directory required');output=resolve(output);mkdirSync(join(output,'runs'),{recursive:true});
 const binding=sourceBinding(),planHash=sha(JSON.stringify(plan)),manifestPath=join(output,'manifest.json');
 if(existsSync(manifestPath)){const manifest=JSON.parse(readFileSync(manifestPath,'utf8'));assert.equal(manifest.planHash,planHash,'Resume plan binding mismatch');assert.equal(manifest.source.sha256,binding.sha256,'Resume source binding mismatch');}
 else{
  for(const [path,hash] of Object.entries(binding.files)){const bytes=readFileSync(join(ROOT,path));assert.equal(sha(bytes),hash);const dest=join(output,'source',path);mkdirSync(dirname(dest),{recursive:true});writeFileSync(dest,bytes);}
  atomicJson(manifestPath,{protocol:PROTOCOL,plan,planHash,source:binding,startedAt:new Date().toISOString(),resourceBudget:{workers:1,execution:'sequential',budgetMs,maxPlacements:plan.maxPlacements}});
 }
 const started=performance.now(),runs=[];let executed=0,status='complete';
 for(const item of plan.cases){
  const path=join(output,'runs',`${item.id}.json`);
  const activePath=join(output,'active.json');
  if(existsSync(path)){const completed=validateEvidence(JSON.parse(readFileSync(path,'utf8')),item,binding);
   if(existsSync(activePath)){const active=JSON.parse(readFileSync(activePath,'utf8'));if(active.run?.id===item.id){const stale=validateEvidence(active,item,binding);assert.ok(stale.trace.length<=completed.trace.length,'Stale checkpoint exceeds completed evidence');assert.deepEqual(stale.trace,completed.trace.slice(0,stale.trace.length),'Stale checkpoint conflicts with completed evidence');unlinkSync(activePath);}}
   runs.push(completed);continue;}
  if(executed>=stopAfter||performance.now()-started>=budgetMs){status='interrupted';break;}
  let resume;if(existsSync(activePath)){const active=JSON.parse(readFileSync(activePath,'utf8'));assert.equal(active.run.id,item.id,'Active case order mismatch');resume=validateEvidence(active,item,binding);}
  try{
   const run=simulateGrowthCase(item,{resume,beforeCommand,onCheckpoint:active=>atomicJson(activePath,evidenceEnvelope(active,item,binding.sha256))});
   assert.equal(sourceBinding().sha256,binding.sha256,'Live rule/economy/policy byte drift');
   atomicJson(path,evidenceEnvelope(run,item,binding.sha256));if(existsSync(activePath))unlinkSync(activePath);runs.push(run);executed++;onRun?.(run,runs.length,plan.cases.length);
   atomicJson(join(output,'progress.json'),{completed:runs.length,expected:plan.cases.length,lastId:run.id,status:'running'});
  }catch(error){if(error.simulation)atomicJson(activePath,evidenceEnvelope(error.simulation,item,binding.sha256));atomicJson(join(output,'halted.json'),{at:new Date().toISOString(),completed:runs.length,expected:plan.cases.length,error:String(error),run:error.simulation??null,sourceBefore:binding,sourceAfter:sourceBinding()});throw error;}
 }
 const sourceAfter=sourceBinding();assert.equal(sourceAfter.sha256,binding.sha256,'Rule/economy/policy byte drift');
 const result={status,expected:plan.cases.length,completed:runs.length,executed,sourceBefore:binding,sourceAfter,runs,summary:aggregateRuns(runs)};
 atomicJson(join(output,'summary.json'),{...result,runs:undefined});atomicJson(join(output,'progress.json'),{status,completed:runs.length,expected:plan.cases.length});return result;
}
export function aggregateRuns(runs){
 const groups={};for(const run of runs){const key=[run.group,run.spec.family,run.spec.mode??run.spec.variant,run.spec.difficultyId??'',run.strategy,run.cleanup,run.tools].join('/');(groups[key]??=[]).push(run);}
 const summarize=items=>{const totals={};for(const key of ['placements','commands','shipmentGroups','shippedCells','shipUnits','units','score','coins','earlyFailure','occupiedFractionSum','rushPlaced','rushShipped','rushExpired','wasteCellPlacementSum','cleanupTriggers','cleanupEmptyTriggers','cleanupCleared','hazardCleared','rescueEpisodes','toolAcquisitionCost','usedToolValue','palletUnitsShipped','wildcardCellsShipped','decisionMs','machineWallMs','processCpuMs','mandatoryAnimationMs','codecChecks','previewChecks','replayChecks'])totals[key]=sum(items.map(r=>r.metrics[key]));
  const statuses=Object.fromEntries(['won','failed','capped'].map(status=>[status,items.filter(r=>r.metrics.status===status).length])),histograms={};
  for(const key of ['chainDistribution','upgradeOffered','upgradeChosen','toolUsed','generatedByShiftTrait']){histograms[key]={};for(const item of items)for(const [id,count] of Object.entries(item.metrics[key]))inc(histograms[key],id,count);}
  histograms.failureShift={};histograms.outcomeReason={};for(const item of items){if(item.metrics.status==='failed')inc(histograms.failureShift,item.state.shift);inc(histograms.outcomeReason,item.metrics.status==='capped'?'placement_cap':item.state.endReason);}
  return {runs:items.length,...statuses,...totals,...histograms,meanUnits:ratio(totals.units,items.length),meanScore:ratio(totals.score,items.length),meanCoins:ratio(totals.coins,items.length),meanOccupancy:ratio(totals.occupiedFractionSum,totals.placements),maxChain:Math.max(0,...items.map(r=>r.metrics.maxChain)),peakWaste:Math.max(0,...items.map(r=>r.metrics.wastePeak)),coinsPerUnit:ratio(totals.coins,totals.units),coinsPerPlacement:ratio(totals.coins,totals.placements),machineActiveModelMinutes:(totals.machineWallMs+totals.mandatoryAnimationMs)/60000,coinsPerMachineActiveModelMinute:ratio(totals.coins,(totals.machineWallMs+totals.mandatoryAnimationMs)/60000)};};
 return {total:summarize(runs),groups:Object.fromEntries(Object.entries(groups).map(([key,items])=>[key,summarize(items)]))};
}
export function measureUpgradeCapacity(){
 const initial=createPlayableRun({family:'inbound',mode:'standard',rulesetVersion:9,seed:1,guided:false,toolCharges:{...TOOLS.none}}),rounds=[],seen=new Set();
 function visit(levels,depth){if(depth===7)return;const key=Object.values(levels).join(',')+':'+depth;if(seen.has(key))return;seen.add(key);
  const state={...initial,levels,completedOrders:RULES_V9_CONFIG.upgradeThresholds[depth]},ids=eligibleUpgradesV9(state),functional=ids.filter(id=>UPGRADES_V9.find(u=>u.id===id).functional).length;
  const round=rounds[depth]??={threshold:RULES_V9_CONFIG.upgradeThresholds[depth],statesChecked:0,minEligible:Infinity,minFunctional:Infinity};round.statesChecked++;round.minEligible=Math.min(round.minEligible,ids.length);round.minFunctional=Math.min(round.minFunctional,functional);assert.ok(ids.length>=3&&functional>=2,'Real upgrade capacity violated');
  for(const id of ids)visit({...levels,[id]:levels[id]+1},depth+1);
 }
 visit(emptyLevelsV9(),0);return {method:'Unique reachable level vectors, actual eligibleUpgradesV9 at all seven thresholds; this is type capacity, not a full-game count.',statesChecked:seen.size,rounds};
}
function main(){const opts={};let output='artifacts/growth-simulation/baseline';
 for(let i=2;i<process.argv.length;i++){const name=process.argv[i],value=process.argv[++i];assert.ok(value!==undefined,`Missing ${name}`);
  if(name==='--profile')opts.profile=value;else if(name==='--seed-start')opts.seedStart=Number(value);else if(name==='--seed-end')opts.seedEnd=Number(value);else if(name==='--strategy')opts.strategies=value.split(',');else if(name==='--max-placements')opts.maxPlacements=Number(value);else if(name==='--output')output=value;else throw Error(`Unknown option ${name}`);}
 const plan=buildPlan(opts),result=runGrowthSuite(plan,{output,onRun:(run,n,total)=>{if(n%8===0||n===total)process.stdout.write(JSON.stringify({completed:n,total,id:run.id,status:run.metrics.status,placements:run.metrics.placements,units:run.metrics.units,machineWallMs:run.metrics.machineWallMs})+'\n');}});
 process.stdout.write(JSON.stringify({output,status:result.status,completed:result.completed,expected:result.expected,sourceHash:result.sourceAfter.sha256,total:result.summary.total},null,2)+'\n');
 if(result.status!=='complete'||result.summary.total.capped)process.exitCode=2;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){try{main();}catch(error){process.stderr.write(`${error.stack??error}\n`);process.exitCode=1;}}
