/** Preregistered paired observations only. Never tunes production rules or bot policy. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {existsSync,mkdirSync,readFileSync,readdirSync,renameSync,writeFileSync,unlinkSync} from 'node:fs';
import {dirname,join,relative,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {performance} from 'node:perf_hooks';
import {createPlayableRun,applyPlayableCommand,playableChecksum,previewPlayablePlacement} from '../src/domain/playable.ts';
import {decodeGameRun,encodeGameRun} from '../src/application/game-codec.ts';
import {baseCoins,ITEM_PRICES} from '../src/application/economy.ts';
import {createRandomState,nextRandom} from '../src/domain/random.ts';
import {findLegalMovesV9,docksV9,selectOrderGroupV9} from '../src/domain/v9/board.ts';
import {findLegalMovesV11,docksV11,selectOrderGroupV11} from '../src/domain/v11/board.ts';
import {findRescuePlanV9} from '../src/domain/v9/tools.ts';
import {findRescuePlanV11} from '../src/domain/v11/tools.ts';
import {RULES_V9_CONFIG,CARGO} from '../src/domain/v9/content.ts';
import {chooseGrowthMove,PROTOCOL as GROWTH_PROTOCOL} from './simulate-growth.mjs';

const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const sha=value=>createHash('sha256').update(value).digest('hex');
const sum=values=>values.reduce((n,value)=>n+value,0);
const ratio=(n,d)=>d?n/d:null;
const inc=(map,key,amount=1)=>{map[key]=(map[key]??0)+amount;};
const TOOLS=Object.freeze({none:{rotate:0,clear:0,wildcard:0},rotate_clear:{rotate:1,clear:1,wildcard:0},rotate_wildcard:{rotate:1,clear:0,wildcard:1},clear_wildcard:{rotate:0,clear:1,wildcard:1}});
export const PROTOCOL=Object.freeze({id:'refinement-paired-five-shift-v1',preregisteredAt:'2026-10-07T01:22:22Z',
 population:'Normal inbound five-shift runs only, guided=false. Two fixed bots are observations, never estimated human win rates.',
 baseline:'Seeds1–64 × route/greedy × orders/placements × rules9/11 =512 cases. No tools. Same seed, policy and cleanup define a pair.',
 tools:'After baseline: rules11 seeds1–32 × route/greedy × orders/placements × rotate_clear/rotate_wildcard/clear_wildcard =384 cases; compare each to its exact no-tools rules11 counterpart.',
 strategies:['route','greedy'],placementCap:300,decision:GROWTH_PROTOCOL.decision,inboundRoute:GROWTH_PROTOCOL.inboundRoute,inboundGreedy:GROWTH_PROTOCOL.inboundGreedy,
 geometry:'Reuse the frozen growth policy without edits. Its dock penalty enumerates all four dock positions, including docks without current orders. For rules11 only, project version to9 for pure visible geometric selectors; neutral levels guarantee no upgrade bonus. Real commands, previews, codec and checksum always dispatch rules11. Verify selector parity every10 accepted commands.',
 upgrade:GROWTH_PROTOCOL.upgrade,
 randomPairing:'Equal starting seed, not synchronized draws: removing v9 upgrade offer sampling intentionally changes later RNG trajectories. No forced matching of later candidates/orders.',
 toolPolicy:'Unchanged conservative rescue-only domain witness: use the first legal findRescuePlan command only after phase=rescue. No proactive rotation/clearing/wildcard planning; this does not estimate full strategic tool value.',
 toolEconomy:'Each tool case starts with its two distinct charges free. Separately disclose prices rotate80/clear120/wildcard160; do not deduct hypothetical purchases from awarded base coins. No purchase or wallet credit is executed.',
 coins:'Actual inbound baseCoins = completedOrders + min(floor(score/1000), floor(completedOrders/2)) + 15*floor(completedOrders/30). Capped prefix coins are only potential formula value, never a credited reward.',
 caps:'At300 successful placements a nonterminal case is capped/inconclusive, never a win or failure. Never issue finish or continueOvertime.',
 evidence:'Every accepted command, engine event and post-command checksum retained and replayed; strict codec at start, every10 commands and end. Case/plan/source/evidence hashes, atomic checkpoints, fault dump and stop; exact resume only.',
 reporting:'All cases retained. Mean/median/range of placements, command steps, completed orders, score and base coins; failure-stage and order histograms; exact paired wins delta. Reproducible best/worst per group and complete failure catalog.',
 resources:'Single sequential process, no network, no automatic retries, no nested workers, no tuning. Pilot20 cases before full896; full budget bounded to3600000ms. Capped or interrupted reports disclose inconclusive results.'});

function integer(n,name,min,max){assert.ok(Number.isSafeInteger(n)&&n>=min&&n<=max,`${name} must be bounded ${min}..${max}`);return n;}
const identity=(group,version,strategy,cleanup,tools,seed)=>`${group}-v${version}-${strategy}-${cleanup}-${tools}-s${seed}`;
export function buildRefinementPlan({profile='all',seedStart=1,seedEnd=profile==='pilot'?1:64,strategies=['route','greedy'],maxPlacements=300}={}){
 assert.ok(['all','baseline','pilot'].includes(profile),'Unknown profile');integer(seedStart,'seed start',1,64);integer(seedEnd,'seed end',seedStart,64);integer(maxPlacements,'placements',1,300);
 assert.ok(strategies.length&&strategies.every(s=>PROTOCOL.strategies.includes(s))&&new Set(strategies).size===strategies.length,'Unknown/duplicate strategy');
 const cases=[],add=(group,version,seed,strategy,cleanup,tools)=>cases.push({id:identity(group,version,strategy,cleanup,tools,seed),group,
  spec:{family:'inbound',mode:'standard',rulesetVersion:version,seed,guided:false,toolCharges:{...TOOLS[tools]}},strategy,cleanup,tools,maxPlacements,
  ...(group==='tools'?{baselineId:identity('baseline',11,strategy,cleanup,'none',seed)}:{})});
 for(let seed=seedStart;seed<=seedEnd;seed++)for(const strategy of strategies)for(const cleanup of ['orders','placements'])for(const version of [9,11])add('baseline',version,seed,strategy,cleanup,'none');
 if(profile!=='baseline')for(let seed=seedStart;seed<=Math.min(seedEnd,32);seed++)for(const strategy of strategies)for(const cleanup of ['orders','placements'])for(const tools of Object.keys(TOOLS).slice(1))add('tools',11,seed,strategy,cleanup,tools);
 return {protocol:PROTOCOL.id,profile,seedStart,seedEnd,strategies:[...strategies],maxPlacements,cases};
}

export function chooseRefinementMove(state,strategy='route'){
 assert.ok([9,11].includes(state.rulesetVersion),'Only inbound9/11 allowed');
 return chooseGrowthMove(state.rulesetVersion===11?{...state,rulesetVersion:9}:state,strategy);
}
export function verifyNeutralGeometry(state){
 if(state.rulesetVersion!==11)return true;
 assert.equal(state.boardSize,7);assert.ok(Object.values(state.levels).every(n=>n===0));
 assert.deepEqual(findLegalMovesV11(state),findLegalMovesV9(state));assert.deepEqual(docksV11(state),docksV9(state));
 for(const order of state.orders)assert.deepEqual(selectOrderGroupV11(state,order),selectOrderGroupV9(state,order));return true;
}
export const coinsFor=(orders,score)=>baseCoins('inbound',orders,score);
function initialMetrics(){return {status:'capped',failure:0,failureStage:null,placements:0,commandSteps:0,completedOrders:0,score:0,baseCoins:0,
 shipmentGroups:0,shippedCells:0,shipUnits:0,chainDistribution:{},toolUsed:{},upgradeOffered:{},upgradeChosen:{},generatedByShiftTrait:{},rescueEpisodes:0,
 rushPlaced:0,rushExpired:0,cleanupTriggers:0,cleanupCleared:0,hazardCleared:0,occupiedFractionSum:0,peakOccupancy:0,wastePeak:0,
 codecChecks:0,geometryChecks:0,previewChecks:0,replayChecks:0,decisionMs:0,machineWallMs:0,processCpuMs:0};}
function checkpoint(run){assert.deepEqual(decodeGameRun(encodeGameRun(run.state)),run.state);run.metrics.codecChecks++;if(run.state.rulesetVersion===11){verifyNeutralGeometry(run.state);run.metrics.geometryChecks++;}}
const snapshot=run=>structuredClone(run);
function upgradeDecision(state,cursor){
 const draw=nextRandom(cursor,0,state.upgradeChoices.length-1),upgradeId=state.upgradeChoices[draw.value];let cargo;
 if(upgradeId==='cargo_supply'&&!state.supplyCargo){const unlocked=CARGO.slice(0,RULES_V9_CONFIG.cargoByShift[state.shift-1]).map(c=>c.id);cargo=state.orders.map(o=>o.cargo).find(c=>unlocked.includes(c))??unlocked[0];}
 return {cursor:draw.state,command:{type:'upgrade',upgradeId,...(cargo?{cargo}:{})}};
}
function decide(run){const {state}=run;
 if(state.phase==='cleanup')return {type:'chooseCleanup',branch:run.cleanup};
 if(state.phase==='upgrade'){assert.equal(state.rulesetVersion,9);const choice=upgradeDecision(state,run.upgradeRng);run.upgradeRng=choice.cursor;return choice.command;}
 if(state.phase==='rescue'){const plan=state.rulesetVersion===11?findRescuePlanV11(state):findRescuePlanV9(state);assert.ok(plan?.length,'Rescue phase has no legal plan');return plan[0];}
 const move=chooseRefinementMove(state,run.strategy);assert.ok(move,'Nonterminal input lacks a legal move');return {type:'place',...move};
}
function accountStep(run,old,command,result){
 const m=run.metrics,shipments=result.events.filter(e=>e.type==='shipment');m.commandSteps++;
 if(command.type==='place'){
  m.placements++;const piece=old.candidates.find(p=>p.id===command.pieceId);if(piece.trait==='rush')m.rushPlaced++;
  m.shipmentGroups+=shipments.length;m.shippedCells+=sum(shipments.map(s=>s.cells.length));m.shipUnits+=sum(shipments.map(s=>s.units));inc(m.chainDistribution,shipments.length);
  m.hazardCleared+=sum(shipments.map(s=>s.extraClearedCells?.length??0));m.rushExpired+=sum(result.events.filter(e=>e.type==='rushExpired').map(e=>e.cells.length));
  if(old.cleanup)m.cleanupTriggers+=Math.floor((old.cleanup.progress+(old.cleanup.branch==='orders'?shipments.length:1))/RULES_V9_CONFIG.cleanup[old.cleanup.branch]);
  m.cleanupCleared+=sum(result.events.filter(e=>e.type==='cleanup').map(e=>e.cells.length));
  const occupied=result.state.board.filter(Boolean).length;m.occupiedFractionSum+=occupied/result.state.board.length;m.peakOccupancy=Math.max(m.peakOccupancy,occupied);m.wastePeak=Math.max(m.wastePeak,result.state.cellTraits.filter(t=>t?.kind==='waste').length);
 }
 if(old.phase!=='rescue'&&result.state.phase==='rescue')m.rescueEpisodes++;
 const previousIds=new Set(old.candidates.map(p=>p.id));for(const piece of result.state.candidates)if(!previousIds.has(piece.id))inc(m.generatedByShiftTrait,`${result.state.shift}/${piece.trait??'normal'}`);
 for(const event of result.events){if(event.type==='upgrade')for(const id of event.choices)inc(m.upgradeOffered,id);if(event.type==='upgradeChosen')inc(m.upgradeChosen,event.upgradeId);if(event.type==='toolUsed')inc(m.toolUsed,event.toolId);}
}
function finishMetrics(run){const m=run.metrics,state=run.state;
 m.status=state.phase==='result'?state.result:'capped';m.failure=Number(m.status==='failed');m.failureStage=m.failure?state.shift:null;m.terminalReason=m.status==='capped'?'placement_cap':state.endReason;
 if(m.status==='failed'){assert.equal(state.endReason,'blocked');assert.equal(findLegalMovesV9(state).length,0);assert.equal(state.rulesetVersion===11?findRescuePlanV11(state):findRescuePlanV9(state),null);}
 if(m.status==='won'){assert.equal(state.endReason,'completed');assert.ok(state.completedOrders>=30);}
 if(m.status==='capped'){assert.equal(state.result,null);assert.equal(m.placements,run.maxPlacements);}
 m.completedOrders=state.completedOrders;m.score=state.score;m.baseCoins=coinsFor(state.completedOrders,state.score);m.finalStage=state.shift;m.maxChain=state.maxChain;m.earlyFailure=Number(m.failure&&state.completedOrders<6);
 m.meanOccupancy=ratio(m.occupiedFractionSum,m.placements);m.mandatoryAnimationMs=m.shipmentGroups*1000;
 m.toolAcquisitionCost=sum(Object.entries(TOOLS[run.tools]).map(([id,count])=>ITEM_PRICES[id]*count));m.usedToolValue=sum(Object.entries(m.toolUsed).map(([id,count])=>ITEM_PRICES[id]*count));m.remainingTools={...state.toolCharges};
}
export function simulateRefinementCase(caseSpec,{resume,beforeCommand,onCheckpoint,previewEvery=10}={}){
 const run=resume?snapshot(resume):{...caseSpec,state:createPlayableRun(caseSpec.spec),metrics:initialMetrics(),trace:[],upgradeRng:createRandomState((caseSpec.spec.seed^0x4f1bbcdc)|0)};
 for(const [key,value] of Object.entries(caseSpec))assert.deepEqual(run[key],value,`Resume ${key} case binding mismatch`);
 verifyRefinementReplay(run);let wallCursor=performance.now(),cpuCursor=process.cpuUsage(),attemptedCommand=null,previousCursor=null;
 const chargeTime=()=>{const now=performance.now(),cpu=process.cpuUsage(cpuCursor);run.metrics.processCpuMs+=(cpu.user+cpu.system)/1000;run.metrics.machineWallMs+=now-wallCursor;wallCursor=now;cpuCursor=process.cpuUsage();};
 delete run.error;delete run.attemptedCommand;delete run.finalChecksum;
 if(!resume){checkpoint(run);for(const piece of run.state.candidates)inc(run.metrics.generatedByShiftTrait,`${run.state.shift}/${piece.trait??'normal'}`);}
 try{
  while(run.state.phase!=='result'&&run.metrics.placements<run.maxPlacements){
   const old=run.state,tick=performance.now();previousCursor=[...run.upgradeRng];attemptedCommand=decide(run);run.metrics.decisionMs+=performance.now()-tick;
   beforeCommand?.({state:old,command:attemptedCommand,id:run.id});
   const preview=attemptedCommand.type==='place'&&old.commandIndex%previewEvery===0?previewPlayablePlacement(old,attemptedCommand.pieceId,attemptedCommand.origin):null;
   const result=applyPlayableCommand(old,attemptedCommand);assert.equal(result.error,undefined,JSON.stringify(attemptedCommand));assert.equal(result.state.commandIndex,old.commandIndex+1);
   if(preview){assert.ok(preview.valid);assert.deepEqual(result.events,preview.events);assert.deepEqual(result.state,preview.stateAfter);run.metrics.previewChecks++;}
   accountStep(run,old,attemptedCommand,result);run.state=result.state;run.trace.push({command:attemptedCommand,checksum:playableChecksum(run.state),events:result.events});attemptedCommand=null;previousCursor=null;
   if(run.state.commandIndex%10===0){checkpoint(run);chargeTime();onCheckpoint?.(snapshot(run));}
  }
  checkpoint(run);chargeTime();finishMetrics(run);run.metrics.replayChecks=verifyRefinementReplay(run).commands;run.finalChecksum=playableChecksum(run.state);return run;
 }catch(error){if(previousCursor)run.upgradeRng=previousCursor;chargeTime();run.attemptedCommand=attemptedCommand;run.error=String(error);error.simulation=snapshot(run);throw error;}
}
export function verifyRefinementReplay(run){
 let state=createPlayableRun(run.spec),upgradeRng=createRandomState((run.spec.seed^0x4f1bbcdc)|0);assert.equal(run.trace.length,run.state.commandIndex,'Replay prefix length mismatch');
 const accounting={...run,state,metrics:initialMetrics()};
 for(const entry of run.trace){assert.ok(!['finish','continueOvertime'].includes(entry.command.type),'Artificial finish forbidden');
  if(entry.command.type==='chooseCleanup')assert.equal(entry.command.branch,run.cleanup,'Cleanup policy mismatch');
  if(entry.command.type==='upgrade'){const choice=upgradeDecision(state,upgradeRng);assert.deepEqual(entry.command,choice.command,'Visible upgrade policy mismatch');upgradeRng=choice.cursor;}
  const result=applyPlayableCommand(state,entry.command);assert.equal(result.error,undefined,'Replay command rejected');accountStep(accounting,state,entry.command,result);state=result.state;
  assert.equal(playableChecksum(state),entry.checksum,'Replay checksum mismatch');assert.deepEqual(result.events,entry.events,'Replay event mismatch');
 }
 assert.deepEqual(run.upgradeRng,upgradeRng,'Bot upgrade cursor mismatch');
 for(const key of ['commandSteps','placements','shipmentGroups','shippedCells','shipUnits','chainDistribution','toolUsed','upgradeOffered','upgradeChosen','rushPlaced','rushExpired','cleanupTriggers','cleanupCleared','hazardCleared','rescueEpisodes'])assert.deepEqual(run.metrics[key],accounting.metrics[key],`Checkpoint ${key} accounting corrupted`);
 assert.equal(run.metrics.shipmentGroups,state.completedOrders,'Checkpoint completed-order accounting corrupted');assert.deepEqual(state,run.state,'Replay final state mismatch');
 if(run.finalChecksum)assert.equal(run.finalChecksum,playableChecksum(state),'Final checksum mismatch');return {checksum:playableChecksum(state),commands:run.trace.length};
}

function filesIn(path){return readdirSync(path,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?filesIn(join(path,entry.name)):[join(path,entry.name)]);}
export function sourceBinding(){
 const paths=[...filesIn(join(ROOT,'src/domain')),...filesIn(join(ROOT,'src/shared'))].filter(p=>p.endsWith('.ts'));
 paths.push(...['src/application/economy.ts','src/application/game-codec.ts','src/application/save.ts','src/application/run-slots.ts','scripts/simulate-refinement.mjs','scripts/simulate-growth.mjs','qa/outbound-v6-compare.mjs','qa/mixed-color-compare.mjs','package.json','package-lock.json'].map(p=>join(ROOT,p)));
 const hashes=Object.fromEntries(paths.sort().map(path=>[relative(ROOT,path),sha(readFileSync(path))]));
 return {node:process.version,parentBaselineCommit:'ff6e6d7ce78cb0b8f58810de7d2d4536490d2ef7',files:hashes,sha256:sha(JSON.stringify(hashes))};
}
function atomicJson(path,value){mkdirSync(dirname(path),{recursive:true});writeFileSync(`${path}.tmp`,JSON.stringify(value,null,2)+'\n');renameSync(`${path}.tmp`,path);}
const envelope=(run,item,sourceHash)=>({sourceHash,caseHash:sha(JSON.stringify(item)),evidenceHash:sha(JSON.stringify(run)),run});
function validateEvidence(record,item,binding){
 assert.equal(record.sourceHash,binding.sha256,'Evidence source binding mismatch');assert.equal(record.caseHash,sha(JSON.stringify(item)),'Evidence case binding mismatch');assert.equal(record.evidenceHash,sha(JSON.stringify(record.run)),'Evidence hash corrupted');
 for(const [key,value] of Object.entries(item))assert.deepEqual(record.run[key],value,`Evidence ${key} case binding mismatch`);verifyRefinementReplay(record.run);return record.run;
}
export function runRefinementSuite(plan,{output,stopAfter=Infinity,beforeCommand,onRun,budgetMs=3600000}={}){
 assert.ok(output,'Output directory required');assert.deepEqual(plan,buildRefinementPlan(plan),'Plan grid binding mismatch');output=resolve(output);mkdirSync(join(output,'runs'),{recursive:true});
 const binding=sourceBinding(),planHash=sha(JSON.stringify(plan)),manifestPath=join(output,'manifest.json');
 if(existsSync(manifestPath)){const manifest=JSON.parse(readFileSync(manifestPath,'utf8'));assert.equal(manifest.planHash,planHash,'Resume plan binding mismatch');assert.equal(manifest.source.sha256,binding.sha256,'Resume source binding mismatch');}
 else{for(const [path,hash] of Object.entries(binding.files)){const bytes=readFileSync(join(ROOT,path));assert.equal(sha(bytes),hash);const dest=join(output,'source',path);mkdirSync(dirname(dest),{recursive:true});writeFileSync(dest,bytes);}
  atomicJson(manifestPath,{protocol:PROTOCOL,plan,planHash,source:binding,startedAt:new Date().toISOString(),resourceBudget:{workers:1,execution:'sequential',budgetMs,maxPlacements:plan.maxPlacements}});}
 const started=performance.now(),runs=[];let executed=0,status='complete';
 for(const item of plan.cases){const path=join(output,'runs',`${item.id}.json`),activePath=join(output,'active.json');
  if(existsSync(path)){const completed=validateEvidence(JSON.parse(readFileSync(path,'utf8')),item,binding);
   if(existsSync(activePath)){const active=JSON.parse(readFileSync(activePath,'utf8'));if(active.run?.id===item.id){const stale=validateEvidence(active,item,binding);assert.ok(stale.trace.length<=completed.trace.length,'Stale checkpoint exceeds completed evidence');assert.deepEqual(stale.trace,completed.trace.slice(0,stale.trace.length),'Stale checkpoint conflicts with completed evidence');unlinkSync(activePath);}}
   runs.push(completed);continue;}
  if(executed>=stopAfter||performance.now()-started>=budgetMs){status='interrupted';break;}
  let resume;if(existsSync(activePath)){const active=JSON.parse(readFileSync(activePath,'utf8'));assert.equal(active.run.id,item.id,'Active case order mismatch');resume=validateEvidence(active,item,binding);}
  let run;try{run=simulateRefinementCase(item,{resume,beforeCommand,onCheckpoint:active=>atomicJson(activePath,envelope(active,item,binding.sha256))});
   assert.equal(sourceBinding().sha256,binding.sha256,'Live rule/economy/policy byte drift');atomicJson(path,envelope(run,item,binding.sha256));if(existsSync(activePath))unlinkSync(activePath);runs.push(run);executed++;onRun?.(run,runs.length,plan.cases.length);
   atomicJson(join(output,'progress.json'),{completed:runs.length,expected:plan.cases.length,lastId:run.id,status:'running'});
  }catch(error){if(run&&!error.simulation)error.simulation=snapshot(run);if(error.simulation)atomicJson(activePath,envelope(error.simulation,item,binding.sha256));atomicJson(join(output,'halted.json'),{at:new Date().toISOString(),completed:runs.length,expected:plan.cases.length,error:String(error),run:error.simulation??null,sourceBefore:binding,sourceAfter:sourceBinding()});throw error;}
 }
 const sourceAfter=sourceBinding();assert.equal(sourceAfter.sha256,binding.sha256,'Rule/economy/policy byte drift');
 const result={status,expected:plan.cases.length,completed:runs.length,executed,suiteWallMs:performance.now()-started,sourceBefore:binding,sourceAfter,runs,summary:aggregateRefinementRuns(runs),paired:comparePairedRuns(runs,{allowIncomplete:status!=='complete'})};
 atomicJson(join(output,'summary.json'),{...result,runs:undefined});atomicJson(join(output,'raw-results.json'),{protocol:PROTOCOL.id,sourceHash:binding.sha256,cases:runs.map(run=>({id:run.id,group:run.group,spec:run.spec,strategy:run.strategy,cleanup:run.cleanup,tools:run.tools,metrics:run.metrics,finalChecksum:run.finalChecksum,evidenceFile:`runs/${run.id}.json`}))});
 atomicJson(join(output,'catalog.json'),caseCatalog(runs));atomicJson(join(output,'progress.json'),{status,completed:runs.length,expected:plan.cases.length});return result;
}
function stats(values){if(!values.length)return {count:0,mean:null,median:null,min:null,max:null};const sorted=[...values].sort((a,b)=>a-b),n=sorted.length;return {count:n,mean:sum(sorted)/n,median:n%2?sorted[(n-1)/2]:(sorted[n/2-1]+sorted[n/2])/2,min:sorted[0],max:sorted[n-1]};}
function summarize(items){
 const statuses=Object.fromEntries(['won','failed','capped'].map(status=>[status,items.filter(r=>r.metrics.status===status).length]));
 const measures=Object.fromEntries(['placements','commandSteps','completedOrders','score','baseCoins','rushPlaced','rushExpired','cleanupTriggers','cleanupCleared','toolAcquisitionCost','usedToolValue','decisionMs','machineWallMs','processCpuMs'].map(key=>[key,stats(items.map(r=>r.metrics[key]))]));
 const histograms={failureStage:{},completedOrders:{},terminalReason:{},finalStage:{},chainDistribution:{},toolUsed:{},upgradeOffered:{},upgradeChosen:{},generatedByShiftTrait:{}};
 for(const item of items){const m=item.metrics;if(m.failure)inc(histograms.failureStage,m.failureStage);for(const key of ['completedOrders','terminalReason','finalStage'])inc(histograms[key],m[key]);for(const key of ['chainDistribution','toolUsed','upgradeOffered','upgradeChosen','generatedByShiftTrait'])for(const [id,count] of Object.entries(m[key]))inc(histograms[key],id,count);}
 return {runs:items.length,...statuses,winRate:statuses.capped?null:ratio(statuses.won,items.length),measures,histograms,checks:Object.fromEntries(['codecChecks','geometryChecks','previewChecks','replayChecks'].map(key=>[key,sum(items.map(r=>r.metrics[key]))]))};
}
export function aggregateRefinementRuns(runs){const groups={};for(const run of runs){const key=`${run.group}/v${run.spec.rulesetVersion}/${run.strategy}/${run.cleanup}/${run.tools}`;(groups[key]??=[]).push(run);}return {total:summarize(runs),groups:Object.fromEntries(Object.entries(groups).map(([key,items])=>[key,summarize(items)]))};}
function pairedSummary(pairs){
 const inconclusivePairs=pairs.filter(([a,b])=>a.metrics.status==='capped'||b.metrics.status==='capped').length;
 const oldWins=pairs.filter(([a])=>a.metrics.status==='won').length,newWins=pairs.filter(([,b])=>b.metrics.status==='won').length;
 const transitions={};for(const [a,b] of pairs)inc(transitions,`${a.metrics.status}->${b.metrics.status}`);
 return {pairs:pairs.length,inconclusivePairs,oldWins,newWins,newWinsMinusOldWins:newWins-oldWins,winRateDelta:inconclusivePairs?null:ratio(newWins-oldWins,pairs.length),
  oldFailedNewWon:transitions['failed->won']??0,oldWonNewFailed:transitions['won->failed']??0,transitions,
  deltas:Object.fromEntries(['placements','commandSteps','completedOrders','score','baseCoins'].map(key=>[key,stats(pairs.map(([a,b])=>b.metrics[key]-a.metrics[key]))])),
  cases:pairs.map(([a,b])=>({baselineId:a.id,comparisonId:b.id,baselineStatus:a.metrics.status,comparisonStatus:b.metrics.status,completedOrdersDelta:b.metrics.completedOrders-a.metrics.completedOrders,scoreDelta:b.metrics.score-a.metrics.score,baseCoinsDelta:b.metrics.baseCoins-a.metrics.baseCoins}))};
}
export function comparePairedRuns(runs,{allowIncomplete=false}={}){
 const byId=new Map(runs.map(r=>[r.id,r])),baseline=[],tools=[],baseGroups={},toolGroups={};
 for(const run of runs){let previous;
  if(run.group==='baseline'&&run.spec.rulesetVersion===11)previous=byId.get(identity('baseline',9,run.strategy,run.cleanup,'none',run.spec.seed));
  else if(run.group==='tools')previous=byId.get(run.baselineId);else continue;
  if(!previous){assert.ok(allowIncomplete,`Missing counterpart for ${run.id}`);continue;}const pair=[previous,run];
  if(run.group==='baseline'){baseline.push(pair);(baseGroups[`${run.strategy}/${run.cleanup}`]??=[]).push(pair);}
  else{tools.push(pair);(toolGroups[`${run.strategy}/${run.cleanup}/${run.tools}`]??=[]).push(pair);}
 }
 return {baseline:{direction:'rules11 minus rules9; same seed/strategy/cleanup',total:pairedSummary(baseline),groups:Object.fromEntries(Object.entries(baseGroups).map(([k,p])=>[k,pairedSummary(p)]))},tools:{direction:'rules11 with free carried tool pair minus matching rules11 without tools; baseline reused three times',total:pairedSummary(tools),groups:Object.fromEntries(Object.entries(toolGroups).map(([k,p])=>[k,pairedSummary(p)]))}};
}
function caseCatalog(runs){
 const row=run=>({id:run.id,seed:run.spec.seed,rulesetVersion:run.spec.rulesetVersion,strategy:run.strategy,cleanup:run.cleanup,tools:run.tools,status:run.metrics.status,failureStage:run.metrics.failureStage,placements:run.metrics.placements,commandSteps:run.metrics.commandSteps,completedOrders:run.metrics.completedOrders,score:run.metrics.score,baseCoins:run.metrics.baseCoins,checksum:run.finalChecksum,evidenceFile:`runs/${run.id}.json`});
 const groups={};for(const run of runs){const key=`${run.group}/v${run.spec.rulesetVersion}/${run.strategy}/${run.cleanup}/${run.tools}`;(groups[key]??=[]).push(run);}
 const order=(a,b)=>a.metrics.completedOrders-b.metrics.completedOrders||a.metrics.score-b.metrics.score||a.metrics.placements-b.metrics.placements||a.id.localeCompare(b.id);
 return {selection:'Within every group: completedOrders, then score, then placements, then lexical ID. Best/worst are reproducibility samples, not a substituted comparison population.',groups:Object.fromEntries(Object.entries(groups).map(([key,items])=>{const sorted=[...items].sort(order);return [key,{worst:row(sorted[0]),best:row(sorted.at(-1))}];})),failures:runs.filter(r=>r.metrics.status==='failed').map(row),capped:runs.filter(r=>r.metrics.status==='capped').map(row),wins:runs.filter(r=>r.metrics.status==='won').map(row)};
}
function main(){const opts={};let output='artifacts/refinement-simulation/full',budgetMs=3600000;
 for(let i=2;i<process.argv.length;i++){const name=process.argv[i],value=process.argv[++i];assert.ok(value!==undefined,`Missing ${name}`);if(name==='--profile')opts.profile=value;else if(name==='--seed-start')opts.seedStart=Number(value);else if(name==='--seed-end')opts.seedEnd=Number(value);else if(name==='--strategy')opts.strategies=value.split(',');else if(name==='--max-placements')opts.maxPlacements=Number(value);else if(name==='--output')output=value;else if(name==='--budget-ms')budgetMs=integer(Number(value),'budget',1,3600000);else throw Error(`Unknown option ${name}`);}
 const result=runRefinementSuite(buildRefinementPlan(opts),{output,budgetMs,onRun:(run,n,total)=>{if(n%8===0||n===total)process.stdout.write(JSON.stringify({completed:n,total,id:run.id,status:run.metrics.status,placements:run.metrics.placements,completedOrders:run.metrics.completedOrders,machineWallMs:run.metrics.machineWallMs})+'\n');}});
 process.stdout.write(JSON.stringify({output,status:result.status,completed:result.completed,expected:result.expected,suiteWallMs:result.suiteWallMs,sourceHash:result.sourceAfter.sha256,outcomes:{won:result.summary.total.won,failed:result.summary.total.failed,capped:result.summary.total.capped}},null,2)+'\n');
 if(result.status!=='complete'||result.summary.total.capped)process.exitCode=2;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){try{main();}catch(error){process.stderr.write(`${error.stack??error}\n`);process.exitCode=1;}}
