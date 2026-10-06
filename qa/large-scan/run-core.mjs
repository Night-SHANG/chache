import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {createRun,applyCommand,findLegalMoves} from '../../src/domain/engine.ts';
import {encodeRun,decodeRun} from '../../src/application/save.ts';
import {checksum,replay} from '../../src/domain/replay.ts';
import {UPGRADES} from '../../src/domain/content.ts';
import {chooseMove,createBotRandom,STRATEGIES} from '../../scripts/simulate.mjs';
import {createCoverage,observeInitial,observeCommand} from './observe.ts';

export const SCAN_PROTOCOL_VERSION=1;
export const ENGINE_MICROSECOND_BINS=[25,50,100,250,500,1000,2500,5000,10000,25000,50000,100000,250000,1000000,Infinity];
const zeroUpgrades=()=>Object.fromEntries(UPGRADES.map(u=>[u.id,0]));
const increment=(hist,key,n=1)=>{hist[key]=(hist[key]??0)+n;};
const validInteger=(v,min,max)=>Number.isSafeInteger(v)&&v>=min&&v<=max;
export function campaignSeeds(seedIndex){
 assert.ok(validInteger(seedIndex,0,2147483646),'seedIndex out of range');const seed=seedIndex+1;
 return {seed,botSeed:(seed^0x51f15e)|0,upgradeSeed:(seed^0x6a09e667)|0};
}
function raw(value){try{return JSON.stringify(value);}catch(error){return JSON.stringify({serializationFailed:String(error),fallback:String(value)});}}
/** Test injection belongs only to this QA adapter; the worker accepts no executable injection option. */
export function scanRun(options,emit=()=>{},ports={}){
 const seedIndex=options.seedIndex??0,seed=options.seed??seedIndex+1,botSeed=options.botSeed??((seed^0x51f15e)|0),upgradeSeed=options.upgradeSeed??((seed^0x6a09e667)|0);
 const strategy=options.strategy??'route',upgradePolicy=options.upgradePolicy??'uniform',rulesetVersion=3,maxCommands=options.maxCommands??300;
 const identity={seedIndex,seed,botSeed,upgradeSeed,strategy,upgradePolicy,rulesetVersion,mode:'standard'};
 const api={createRun,chooseMove,applyCommand,encodeRun,decodeRun,observeInitial,observeCommand,...ports};
 let state=null,command=null,stage='configuration';const started=performance.now();
 const metrics={...identity,status:'capped',commands:0,placements:0,orders:0,score:0,shift:1,firstShipmentPlacements:null,
  occupiedCellsSum:0,occupancySamples:0,peakOccupiedCells:0,terminalOccupiedCells:0,occupancyHistogram:Array(50).fill(0),
  maxChain:0,maxResolutionSteps:0,chainDistribution:{},snapshotChecks:0,replayVerified:false,generatedPieces:0,
  candidateBlockage:{},upgradeOffered:zeroUpgrades(),upgradeSelected:zeroUpgrades(),
  finalChecksum:null,timings:{botMs:0,engineMs:0,saveMs:0,observerMs:0,replayMs:0,ipcMs:0,wallMs:0,maxEngineMs:0,engineMicrosecondHistogram:Array(ENGINE_MICROSECOND_BINS.length).fill(0)},coverage:null};
 const time=(key,fn)=>{const start=performance.now();try{return fn();}finally{metrics.timings[key]+=performance.now()-start;}};
 try{
  assert.ok(validInteger(seed,-2147483648,2147483647),'seed out of signed-int32 range');
  assert.ok(validInteger(seedIndex,0,2147483646),'seedIndex out of range');assert.ok(STRATEGIES.includes(strategy),'unknown strategy');
  assert.ok(['uniform','legacy'].includes(upgradePolicy),'unknown upgrade policy');assert.ok(validInteger(maxCommands,1,1000000),'invalid command limit');
  stage='initialize';state=api.createRun(seed,'standard',3);const placementRandom=createBotRandom(botSeed),upgradeRandom=createBotRandom(upgradeSeed);
  metrics.coverage=createCoverage();api.observeInitial(metrics.coverage,state);
  while(state.phase!=='result'){
   if(metrics.commands>=maxCommands){stage='command-limit';throw Error(`Campaign command limit ${maxCommands} reached`);}
   command=null;stage='choose';
   command=time('botMs',()=>{
    if(state.phase==='upgrade'){
     assert.equal(state.upgradeChoices.length,3,'exactly three upgrade choices');
     const index=upgradePolicy==='legacy'?(strategy==='random'?placementRandom.nextInt(3):0):upgradeRandom.nextInt(3);
     return {type:'upgrade',upgradeId:state.upgradeChoices[index]};
    }
    const move=api.chooseMove(state,strategy,placementRandom);assert.ok(move,'input phase has no legal placement');return {type:'place',...move};
   });
   time('ipcMs',()=>emit({type:'command',commandIndex:state.commandIndex,command:structuredClone(command)}));
   const before=state,beforeChecksum=checksum(before),oldOrders=new Set(before.orders.map(o=>o.id));
   stage='apply';const engineStart=performance.now(),result=api.applyCommand(before,command),engineMs=performance.now()-engineStart;
   metrics.timings.engineMs+=engineMs;metrics.timings.maxEngineMs=Math.max(metrics.timings.maxEngineMs,engineMs);
   metrics.timings.engineMicrosecondHistogram[ENGINE_MICROSECOND_BINS.findIndex(bound=>engineMs*1000<=bound)]++;
   assert.equal(result.error,undefined);assert.equal(checksum(before),beforeChecksum,'reducer mutated prior state');state=result.state;
   metrics.commands++;assert.equal(state.commandIndex,metrics.commands);stage='save';time('saveMs',()=>assert.deepEqual(api.decodeRun(api.encodeRun(state)),state));metrics.snapshotChecks++;
   stage='observe';time('observerMs',()=>{
    const afterChecksum=checksum(state);api.observeCommand(metrics.coverage,before,command,result);
    assert.equal(checksum(state),afterChecksum,'observer mutated committed state');assert.equal(checksum(before),beforeChecksum,'observer mutated prior state');
   });
   if(command.type==='upgrade')increment(metrics.upgradeSelected,command.upgradeId);
   else{
    metrics.placements++;
    const shipments=result.events.filter(e=>e.type==='shipment'),placed=result.events.find(e=>e.type==='placed');
    assert.ok(placed);assert.ok(shipments.length<=oldOrders.size&&shipments.length<=4,'resolution shipped beyond frozen old Dock queue');
    assert.equal(new Set(shipments.map(e=>e.orderId)).size,shipments.length,'same order shipped twice');for(const event of shipments)assert.ok(oldOrders.has(event.orderId),'newly generated order shipped');
    increment(metrics.chainDistribution,shipments.length);metrics.orders+=shipments.length;metrics.maxResolutionSteps=Math.max(metrics.maxResolutionSteps,shipments.length);
    if(shipments.length&&metrics.firstShipmentPlacements===null)metrics.firstShipmentPlacements=metrics.placements;
    const occupied=state.board.filter(Boolean).length;metrics.occupiedCellsSum+=occupied;metrics.occupancySamples++;metrics.occupancyHistogram[occupied]++;
    metrics.peakOccupiedCells=Math.max(metrics.peakOccupiedCells,before.board.filter(Boolean).length+placed.cells.length,occupied);
    if(state.result!=='won'){
     const size=state.candidates.length,bucket=metrics.candidateBlockage[size]??={observations:0,allBlocked:0};bucket.observations++;if(!findLegalMoves(state).length)bucket.allBlocked++;
    }
    if(state.phase==='upgrade')for(const id of state.upgradeChoices)increment(metrics.upgradeOffered,id);
   }
  }
  stage='replay';metrics.finalChecksum=checksum(state);time('replayMs',()=>assert.equal(checksum(replay(seed,state.commands,'standard',3)),metrics.finalChecksum,'full replay mismatch'));metrics.replayVerified=true;
  metrics.status=state.result;metrics.shift=state.shift;metrics.score=state.score;metrics.maxChain=state.maxChain;metrics.generatedPieces=state.generatedPieces;metrics.terminalOccupiedCells=state.board.filter(Boolean).length;
  assert.equal(metrics.orders,state.completedOrders);assert.equal(Object.values(metrics.chainDistribution).reduce((a,b)=>a+b,0),metrics.placements);
  assert.equal(Object.entries(metrics.chainDistribution).reduce((sum,[chain,n])=>sum+Number(chain)*n,0),metrics.orders);
  assert.equal(metrics.occupancySamples,metrics.placements);assert.ok(metrics.peakOccupiedCells<=49);
  metrics.timings.wallMs=performance.now()-started;return {state,metrics};
 }catch(error){
  const failure={...identity,stage,message:String(error?.message??error),stack:String(error?.stack??''),attemptedCommand:command?structuredClone(command):null,
   commands:state?.commands?structuredClone(state.commands):[],rawState:raw(state),wallMs:performance.now()-started};
  if(error&&typeof error==='object')error.scanFailure=failure;else{const wrapped=Error(String(error));wrapped.scanFailure=failure;throw wrapped;}
  throw error;
 }
}
