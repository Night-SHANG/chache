import {createRun,applyCommand,findLegalMoves,previewPlacement} from '../src/domain/engine.ts';
import {decodeRun,encodeRun} from '../src/application/save.ts';
import {SHAPES,DOCKS,CURRENT_RULESET,UPGRADES} from '../src/domain/content.ts';
import {UPGRADES as LEGACY_UPGRADES} from '../src/domain/rulesets/v1/content.ts';
import {createRandomState,nextRandom} from '../src/domain/random.ts';
import {checksum} from '../src/domain/replay.ts';
import {mkdir,writeFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';

export const STRATEGIES=Object.freeze(['random','greedy','route']);
const catalogue=version=>version===1?LEGACY_UPGRADES:UPGRADES;
const counts=version=>Object.fromEntries(catalogue(version).map(u=>[u.id,0]));
const increment=(histogram,key,amount=1)=>{histogram[key]=(histogram[key]??0)+amount;};
const ratio=(numerator,denominator)=>denominator?numerator/denominator:null;
function strategyName(name){if(!STRATEGIES.includes(name))throw Error(`Unknown strategy: ${name}`);return name;}
function integer(value,name,min,max){if(!Number.isSafeInteger(value)||value<min||value>max)throw Error(`${name} must be an integer in [${min}, ${max}]`);return value;}

/** Separate cursor: choosing or previewing never reads or writes RunState.rngState. */
export function createBotRandom(seed){
 let cursor=createRandomState(integer(seed,'bot seed',-2147483648,2147483647));
 return {nextInt(maxExclusive){
  integer(maxExclusive,'random bound',1,2147483647);
  const draw=nextRandom(cursor,0,maxExclusive-1);cursor=draw.state;return draw.value;
 }};
}

/** Compatibility contract: default route scoring and enumeration tie-breaks are unchanged. */
export function chooseMove(state,mode='route',botRandom){
 strategyName(mode);
 if(state.phase!=='input')return null;
 const moves=findLegalMoves(state);if(!moves.length)return null;
 if(mode==='random'){
  const random=botRandom??createBotRandom((state.seed^state.commandIndex^0x51f15e)|0);
  return moves[random.nextInt(moves.length)];
 }
 let best=null,bestScore=-Infinity,bestSecondary=-Infinity;
 for(const move of moves){
  const piece=state.candidates.find(p=>p.id===move.pieceId),shape=SHAPES.find(s=>s.id===piece.shapeId),preview=previewPlacement(state,move.pieceId,move.origin);
  assert.equal(preview.valid,true,'Legal-move preview must be valid');
  let score=preview.shipments.reduce((sum,s)=>sum+s.score*15+s.cells.length*25,0)-shape.cells.length*3,secondary=0;
  if(mode==='greedy'){
   // Physical cells, not pallet units or score. Set avoids double-counting side-effect clears.
   const cleared=new Set(preview.shipments.flatMap(s=>[...s.cells,...(s.extraClearedCells??[])]));
   score=cleared.size-preview.cells.length;secondary=preview.shipments.reduce((sum,s)=>sum+s.score,0);
  }else{
   for(const local of shape.cells){const x=move.origin.x+local.x,y=move.origin.y+local.y;for(const [dx,dy] of [[0,-1],[1,0],[0,1],[-1,0]]){const nx=x+dx,ny=y+dy;if(nx>=0&&ny>=0&&nx<7&&ny<7){const neighbor=state.board[ny*7+nx];if(neighbor===piece.cargo)score+=14;else if(neighbor===null)score+=1;}}if(DOCKS.some(d=>d.entry.x===x&&d.entry.y===y))score-=300;}
   if(state.orders.some(o=>o.cargo===piece.cargo))score+=12;
  }
  if(score>bestScore||(score===bestScore&&secondary>bestSecondary)){bestScore=score;bestSecondary=secondary;best=move;}
 }
 return best;
}

function observeCandidateBlockage(metrics,state){
 // Victory returns before refill, so its depleted tray is not a generated candidate observation.
 if(state.result==='won')return;
 const size=state.candidates.length,key=String(size),blocked=findLegalMoves(state).length===0;
 const bucket=metrics.candidateBlockage[key]??={observations:0,allBlocked:0};
 bucket.observations++;if(blocked)bucket.allBlocked++;
}

/** One complete standard run, or a bounded prefix. Mode is also exposed for authored tutorial tests. */
export function simulateRun(seed,{rulesetVersion=CURRENT_RULESET,strategy='route',botSeed=0,maxCommands=300,mode='standard'}={}){
 integer(seed,'seed',-2147483648,2147483647);integer(rulesetVersion,'ruleset',1,3);
 integer(maxCommands,'max commands',1,1000000);strategyName(strategy);
 assert.ok(['standard','daily','tutorial'].includes(mode),'Unsupported simulation mode');
 const random=createBotRandom(botSeed);
 let state=createRun(seed,mode,rulesetVersion),command=null;
 const metrics={seed,botSeed,strategy,rulesetVersion,mode,status:'capped',commands:0,placements:0,orders:0,score:0,shift:1,
  firstShipmentPlacements:null,occupiedCellsSum:0,occupancySamples:0,meanBoardOccupancy:null,ordersPer100Placements:null,
  chainDistribution:{},maxChain:0,maxResolutionSteps:0,snapshotChecks:0,upgradeOffered:counts(rulesetVersion),upgradeSelected:counts(rulesetVersion),
  candidateBlockage:{},finalChecksum:null};
 try{
  while(state.phase!=='result'&&metrics.commands<maxCommands){
   if(state.phase==='upgrade'){
    assert.ok(state.upgradeChoices.length,'Upgrade phase must offer an upgrade');
    const index=strategy==='random'?random.nextInt(state.upgradeChoices.length):0;
    command={type:'upgrade',upgradeId:state.upgradeChoices[index]};
   }else{
    const move=chooseMove(state,strategy,random);assert.ok(move,'Input phase must have a legal move');command={type:'place',...move};
   }
   const oldOrderCount=state.orders.length,result=applyCommand(state,command);assert.equal(result.error,undefined);
   state=result.state;metrics.commands++;
   assert.deepEqual(decodeRun(encodeRun(state)),state);metrics.snapshotChecks++;
   if(command.type==='upgrade')increment(metrics.upgradeSelected,command.upgradeId);
   else{
    metrics.placements++;
    const shipments=result.events.filter(e=>e.type==='shipment'),steps=shipments.length;
    assert.ok(steps<=64,'Resolution must remain under its 64-shipment guard');
    assert.ok(steps<=oldOrderCount,'Frozen resolution must not ship a newly generated order');
    metrics.orders+=steps;increment(metrics.chainDistribution,steps);metrics.maxResolutionSteps=Math.max(metrics.maxResolutionSteps,steps);
    if(steps&&metrics.firstShipmentPlacements===null)metrics.firstShipmentPlacements=metrics.placements;
    metrics.occupiedCellsSum+=state.board.filter(c=>c!==null).length;metrics.occupancySamples++;
    observeCandidateBlockage(metrics,state);
    if(state.phase==='upgrade')for(const id of state.upgradeChoices)increment(metrics.upgradeOffered,id);
   }
  }
 }catch(error){
  // A broken seed remains reproducible even if it fails during choosing, reduction or save validation.
  error.simulation={seed,botSeed,strategy,rulesetVersion,mode,commandIndex:state.commandIndex,attemptedCommand:command,commands:state.commands,snapshot:encodeRun(state)};
  throw error;
 }
 metrics.status=state.phase==='result'?state.result:'capped';metrics.shift=state.shift;metrics.score=state.score;metrics.maxChain=state.maxChain;
 metrics.meanBoardOccupancy=ratio(metrics.occupiedCellsSum,49*metrics.occupancySamples);
 metrics.ordersPer100Placements=ratio(100*metrics.orders,metrics.placements);metrics.finalChecksum=checksum(state);
 return {state,metrics};
}

function firstShipmentSummary(values,runs){
 const ordered=[...values].sort((a,b)=>a-b),n=ordered.length;
 return {observed:n,censored:runs-n,mean:ratio(ordered.reduce((a,b)=>a+b,0),n),min:n?ordered[0]:null,
  median:n?(ordered[Math.floor((n-1)/2)]+ordered[Math.floor(n/2)])/2:null,p95:n?ordered[Math.ceil(n*.95)-1]:null,max:n?ordered[n-1]:null};
}
function aggregate(name,runResults,errors,version){
 const report={strategy:name,runs:runResults.length+errors.length,wins:0,failures:0,capped:0,errors,commands:0,placements:0,orders:0,snapshotChecks:0,
  shiftHistogram:{},failureShiftHistogram:{},meanFailureShift:null,firstShipment:null,meanBoardOccupancy:null,ordersPer100Placements:null,
  occupiedCellsSum:0,occupancySamples:0,chainDistribution:{},maxChain:0,maxResolutionSteps:0,candidateBlockage:{},threeCandidateAllBlocked:null,
  upgradeOffered:counts(version),upgradeSelected:counts(version),neverOffered:[],neverSelected:[],runResults};
 let failureShiftSum=0;const first=[];
 for(const r of runResults){
  if(r.status==='won')report.wins++;else if(r.status==='failed'){report.failures++;failureShiftSum+=r.shift;increment(report.failureShiftHistogram,r.shift);}else report.capped++;
  increment(report.shiftHistogram,r.shift);
  for(const key of ['commands','placements','orders','snapshotChecks','occupiedCellsSum','occupancySamples'])report[key]+=r[key];
  for(const key of ['maxChain','maxResolutionSteps'])report[key]=Math.max(report[key],r[key]);
  if(r.firstShipmentPlacements!==null)first.push(r.firstShipmentPlacements);
  for(const key of ['chainDistribution','upgradeOffered','upgradeSelected'])for(const [id,count] of Object.entries(r[key]))increment(report[key],id,count);
  for(const [size,counts] of Object.entries(r.candidateBlockage)){
   const bucket=report.candidateBlockage[size]??={observations:0,allBlocked:0};bucket.observations+=counts.observations;bucket.allBlocked+=counts.allBlocked;
  }
 }
 for(const bucket of Object.values(report.candidateBlockage))bucket.rate=ratio(bucket.allBlocked,bucket.observations);
 report.threeCandidateAllBlocked=report.candidateBlockage['3']??{observations:0,allBlocked:0,rate:null};
 report.meanFailureShift=ratio(failureShiftSum,report.failures);
 // Crashed seeds have unknown telemetry; report them separately instead of pretending they were censored normal runs.
 report.firstShipment={...firstShipmentSummary(first,runResults.length),unknown:errors.length};
 report.meanBoardOccupancy=ratio(report.occupiedCellsSum,49*report.occupancySamples);
 report.ordersPer100Placements=ratio(100*report.orders,report.placements);
 report.neverOffered=Object.keys(report.upgradeOffered).filter(id=>!report.upgradeOffered[id]);
 report.neverSelected=Object.keys(report.upgradeSelected).filter(id=>!report.upgradeSelected[id]);
 return report;
}

/** No timestamps or elapsed time in reports: fixed options give byte-identical JSON. */
export function runSimulation({runs=100,rulesetVersion=CURRENT_RULESET,seedStart=1,botSeed=0,maxCommands=300,strategies=STRATEGIES}={}){
 integer(runs,'runs',1,1000000);integer(rulesetVersion,'ruleset',1,3);integer(seedStart,'seed start',-2147483648,2147483647);
 integer(botSeed,'bot seed',-2147483648,2147483647);integer(maxCommands,'max commands',1,1000000);
 integer(seedStart+runs-1,'final seed',-2147483648,2147483647);
 if(!Array.isArray(strategies)||!strategies.length||new Set(strategies).size!==strategies.length)throw Error('Strategies must be a nonempty unique array');
 strategies.forEach(strategyName);
 const report={schemaVersion:2,kind:'bounded deterministic headless QA; bot results are not human balance or fun evidence',rulesetVersion,mode:'standard',
  runsPerStrategy:runs,totalRuns:runs*strategies.length,seedStart,seedEnd:seedStart+runs-1,botSeed,maxCommands,largeScaleCoverage:false,
  botSeedDerivation:'int32(seed XOR botSeed XOR 0x51f15e), separate per run; never uses gameplay RNG',
  limitations:['Not a 100k–1m campaign acceptance','No wall-clock watchdog for synchronous engine hangs','Upgrade offered/selected is not effect-activation coverage','Standard runs only; no Overtime survival assessment'],strategies:{}};
 for(const strategy of strategies){
  const results=[],errors=[];
  for(let seed=seedStart;seed<seedStart+runs;seed++){
   const derivedBotSeed=(seed^botSeed^0x51f15e)|0;
   try{results.push(simulateRun(seed,{rulesetVersion,strategy,botSeed:derivedBotSeed,maxCommands}).metrics);}
   catch(error){errors.push({seed,botSeed:derivedBotSeed,message:error.message,reproduction:error.simulation??null});}
  }
  report.strategies[strategy]=aggregate(strategy,results,errors,rulesetVersion);
 }
 return report;
}

function parseArgs(args){
 const options={},positionals=[];let output='artifacts/simulation.json';
 const keys={'--runs':'runs','--ruleset':'rulesetVersion','--seed-start':'seedStart','--bot-seed':'botSeed','--max-commands':'maxCommands'};
 for(let i=0;i<args.length;i++){
  const arg=args[i];if(arg==='--help')return {help:true};
  if(!arg.startsWith('--')){positionals.push(arg);continue;}
  if(!Object.hasOwn(keys,arg)&&arg!=='--strategy'&&arg!=='--output')throw Error(`Unknown option: ${arg}`);
  const value=args[++i];if(value===undefined||value.startsWith('--'))throw Error(`Missing value for ${arg}`);
  if(arg==='--output')output=value;
  else if(arg==='--strategy')options.strategies=value==='all'?[...STRATEGIES]:[value];
  else options[keys[arg]]=Number(value);
 }
 if(positionals.length>2)throw Error('Expected at most positional run count and ruleset');
 for(const [index,key] of ['runs','rulesetVersion'].entries())if(positionals[index]!==undefined){if(options[key]!==undefined)throw Error(`Duplicate ${key}`);options[key]=Number(positionals[index]);}
 return {options,output};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 try{
  const args=parseArgs(process.argv.slice(2));
  if(args.help)console.log('Usage: node scripts/simulate.mjs [runs] [ruleset] [--runs N] [--ruleset 1|2|3] [--strategy random|greedy|route|all] [--seed-start N] [--bot-seed N] [--max-commands N] [--output path]\nDefaults: 100 runs per strategy, current ruleset, all strategies, seeds from 1, bot seed 0, 300 commands, artifacts/simulation.json.');
  else{
   const report=runSimulation(args.options),json=JSON.stringify(report,null,2)+'\n';
   await mkdir(dirname(resolve(args.output)),{recursive:true});await writeFile(args.output,json);console.log(JSON.stringify(report));
   if(Object.values(report.strategies).some(r=>r.errors.length||r.capped))process.exitCode=2;
  }
 }catch(error){console.error(`Simulation failed: ${error.message}`);process.exitCode=1;}
}
