import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {existsSync,mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createRun,applyCommand,findLegalMoves,previewPlacement} from '../src/domain/engine.ts';
import {checksum} from '../src/domain/replay.ts';
import type {RunState,Command} from '../src/domain/types.ts';
// @ts-expect-error The headless CLI is JavaScript, outside the production TypeScript build.
import * as simulator from '../scripts/simulate.mjs';

const F='cargo.food',M='cargo.machine';
function emptyFixture():RunState {
 const state=createRun(3,'standard',3);state.board.fill(null);state.cellTraits!.fill(null);
 state.orders=[{id:'order.test',dockId:'dock.north',cargo:F,amount:3,baseScore:100}];
 state.candidates=[{id:'piece.large',shapeId:'shape.domino_h',cargo:M},{id:'piece.small',shapeId:'shape.single',cargo:M}];
 return state;
}
function sum(values:Record<string,number>):number{return Object.values(values).reduce((a,b)=>a+b,0);}

test('simulator exposes exactly random, greedy, and route policies and rejects misspellings',()=>{
 assert.deepEqual(simulator.STRATEGIES,['random','greedy','route']);
 assert.throws(()=>simulator.chooseMove(emptyFixture(),'typo'),/strategy/i);
});

test('random policy advances only its own reproducible RNG and samples legal moves',()=>{
 assert.equal(typeof simulator.createBotRandom,'function');
 const state=emptyFixture(),before=JSON.stringify(state),legal=findLegalMoves(state);
 const a=simulator.createBotRandom(55),b=simulator.createBotRandom(55),c=simulator.createBotRandom(56);
 const sequence=(rng:unknown)=>Array.from({length:30},()=>simulator.chooseMove(state,'random',rng));
 const first=sequence(a);assert.deepEqual(first,sequence(b));assert.notDeepEqual(first,sequence(c));
 assert.ok(new Set(first.map((move:{pieceId:string;origin:{x:number;y:number}})=>JSON.stringify(move))).size>1);
 for(const move of first)assert.ok(legal.some(m=>JSON.stringify(m)===JSON.stringify(move)));
 assert.equal(JSON.stringify(state),before);
 // Extra random bot choices must not change a fixed gameplay command's draw sequence.
 const command:Command={type:'place',...legal[0]};
 assert.deepEqual(applyCommand(state,command),applyCommand(JSON.parse(before) as RunState,command));
});

test('greedy maximizes actual freed cells before shipment score, including upgrade extra clearance',()=>{
 const state=emptyFixture();state.board[8]=F;state.board[9]=F;
 state.candidates=[{id:'piece.food',shapeId:'shape.single',cargo:F},{id:'piece.machine',shapeId:'shape.single',cargo:M}];
 const move=simulator.chooseMove(state,'greedy'),selected=previewPlacement(state,move.pieceId,move.origin);
 const delta=(preview:ReturnType<typeof previewPlacement>)=>preview.cells.length-new Set(preview.shipments.flatMap(s=>[...s.cells,...(s.extraClearedCells??[])])).size;
 assert.equal(delta(selected),Math.min(...findLegalMoves(state).map(m=>delta(previewPlacement(state,m.pieceId,m.origin)))));
 const noShipment=simulator.chooseMove(emptyFixture(),'greedy');assert.equal(noShipment.pieceId,'piece.small');
 // A high-score shipment can clear less physical space than a low-score one.
 const competing=emptyFixture();competing.board[8]=F;competing.board[9]=F;competing.board[40]=M;competing.board[41]=M;competing.board[47]=M;
 competing.orders=[{id:'expensive',dockId:'dock.north',cargo:F,amount:3,baseScore:10000},{id:'spacious',dockId:'dock.east',cargo:M,amount:4,baseScore:1}];
 competing.candidates=[{id:'f',shapeId:'shape.single',cargo:F},{id:'m',shapeId:'shape.single',cargo:M}];
 const chosen=simulator.chooseMove(competing,'greedy');assert.equal(chosen.pieceId,'m');
});

test('default route remains compatible with the existing winning host seed and never edits state',()=>{
 let state=createRun(1,'standard',3);const initial=JSON.stringify(state);
 assert.deepEqual(simulator.chooseMove(state),simulator.chooseMove(state,'route'));assert.equal(JSON.stringify(state),initial);
 for(let step=0;step<300&&state.phase!=='result';step++){
  const command:Command=state.phase==='upgrade'?{type:'upgrade',upgradeId:state.upgradeChoices[0]}:{type:'place',...simulator.chooseMove(state)};
  const result=applyCommand(state,command);assert.equal(result.error,undefined);state=result.state;
 }
 assert.equal(state.result,'won');assert.equal(state.completedOrders,30);assert.equal(state.commandIndex,63);
});

test('tutorial telemetry counts effective placements, occupancy, zero chains and finite resolution exactly',()=>{
 assert.equal(typeof simulator.simulateRun,'function');
 const {state,metrics}=simulator.simulateRun(301,{rulesetVersion:3,mode:'tutorial',strategy:'route',maxCommands:10,botSeed:0});
 assert.equal(state.result,'won');assert.equal(metrics.placements,3);assert.equal(metrics.commands,3);assert.equal(metrics.orders,3);
 assert.equal(metrics.firstShipmentPlacements,2);assert.equal(metrics.occupiedCellsSum,12);assert.equal(metrics.occupancySamples,3);
 assert.equal(metrics.meanBoardOccupancy,12/(3*49));assert.equal(metrics.ordersPer100Placements,100);
 assert.deepEqual(metrics.chainDistribution,{'0':1,'1':1,'2':1});assert.equal(metrics.maxResolutionSteps,2);assert.equal(metrics.snapshotChecks,3);
 assert.equal(metrics.finalChecksum,checksum(state));assert.equal(metrics.status,'won');
});

test('real-run metrics reconcile against replayed events and exclude upgrade commands from placement denominators',()=>{
 assert.equal(typeof simulator.simulateRun,'function');
 const {state,metrics}=simulator.simulateRun(1,{rulesetVersion:3,strategy:'route',maxCommands:300,botSeed:0});
 let replay=createRun(1,'standard',3),placements=0,orders=0,first:number|null=null,occupied=0,maxResolution=0;
 const offers:Record<string,number>={},selected:Record<string,number>={},chains:Record<string,number>={};
 for(const command of state.commands as Command[]){
  if(command.type==='upgrade')selected[command.upgradeId]=(selected[command.upgradeId]??0)+1;
  const result=applyCommand(replay,command);assert.equal(result.error,undefined);replay=result.state;
  if(command.type==='place'){
   placements++;const shipments=result.events.filter(e=>e.type==='shipment');orders+=shipments.length;
   if(first===null&&shipments.length)first=placements;
   occupied+=replay.board.filter(c=>c!==null).length;maxResolution=Math.max(maxResolution,shipments.length);
   chains[shipments.length]=(chains[shipments.length]??0)+1;
   if(replay.phase==='upgrade')for(const id of replay.upgradeChoices)offers[id]=(offers[id]??0)+1;
  }
 }
 assert.deepEqual(replay,state);assert.equal(metrics.placements,placements);assert.ok(metrics.commands>placements);
 assert.equal(metrics.orders,orders);assert.equal(metrics.firstShipmentPlacements,first);assert.equal(metrics.occupiedCellsSum,occupied);
 assert.equal(metrics.ordersPer100Placements,100*orders/placements);assert.equal(metrics.maxResolutionSteps,maxResolution);
 assert.deepEqual(metrics.chainDistribution,chains);assert.equal(sum(metrics.upgradeOffered),sum(offers));assert.equal(sum(metrics.upgradeSelected),sum(selected));
 for(const [id,count] of Object.entries(offers))assert.equal(metrics.upgradeOffered[id],count);
 for(const [id,count] of Object.entries(selected))assert.equal(metrics.upgradeSelected[id],count);
});

test('seed scans are reproducible across policy order and report caps separately from gameplay failures',()=>{
 assert.equal(typeof simulator.runSimulation,'function');
 const options={runs:2,seedStart:7,botSeed:91,rulesetVersion:3,maxCommands:2,strategies:['random','greedy','route']};
 const a=simulator.runSimulation(options),b=simulator.runSimulation(options);
 assert.deepEqual(a,b);assert.equal(a.totalRuns,6);assert.equal(a.largeScaleCoverage,false);
 assert.deepEqual(a.strategies.random,simulator.runSimulation({...options,strategies:['random']}).strategies.random);
 for(const name of options.strategies){const r=a.strategies[name];assert.equal(r.runs,2);assert.equal(r.capped,2);assert.equal(r.failures,0);assert.equal(r.errors.length,0);assert.equal(r.firstShipment.observed+r.firstShipment.censored,2);assert.equal(sum(r.chainDistribution),r.placements);}
 for(const rulesetVersion of [1,2,3]){const r=simulator.runSimulation({runs:1,rulesetVersion,maxCommands:1,strategies:['random']});assert.equal(r.rulesetVersion,rulesetVersion);assert.equal(r.strategies.random.runs,1);}
});

test('CLI preserves positional arguments, validates inputs, creates output directories and is byte-reproducible',()=>{
 const dir=mkdtempSync(join(tmpdir(),'warehouse-sim-'));
 try{
  const output=join(dir,'nested','report.json'),args=['scripts/simulate.mjs','2','3','--strategy','random','--seed-start','17','--bot-seed','55','--max-commands','3','--output',output];
  const first=spawnSync(process.execPath,args,{encoding:'utf8'});assert.equal(first.status,2,first.stderr);
  assert.ok(existsSync(output),'CLI must honor --output and create its parent directory');
  const contents=readFileSync(output,'utf8'),second=spawnSync(process.execPath,args,{encoding:'utf8'});assert.equal(second.status,2,second.stderr);
  assert.equal(contents,readFileSync(output,'utf8'));assert.equal(first.stdout,second.stdout);
  const parsed=JSON.parse(contents);assert.equal(parsed.seedStart,17);assert.equal(parsed.runsPerStrategy,2);assert.equal(parsed.strategies.random.capped,2);
  for(const invalid of [['--runs','0'],['--ruleset','4'],['--strategy','typo'],['--max-commands','NaN'],['--seed-start','2147483647','--runs','2'],['--wat','1']]){
   const result=spawnSync(process.execPath,['scripts/simulate.mjs',...invalid,'--output',output],{encoding:'utf8'});assert.equal(result.status,1,invalid.join(' '));
  }
 }finally{rmSync(dir,{recursive:true,force:true});}
});


test('CLI returns an inconclusive exit code for capped runs instead of reporting success',()=>{
 const dir=mkdtempSync(join(tmpdir(),'warehouse-cap-'));
 try{
  const result=spawnSync(process.execPath,['scripts/simulate.mjs','--runs','1','--strategy','random','--max-commands','1','--output',join(dir,'report.json')],{encoding:'utf8'});
  assert.equal(result.status,2);const report=JSON.parse(result.stdout);assert.equal(report.strategies.random.capped,1);assert.equal(report.strategies.random.failures,0);
 }finally{rmSync(dir,{recursive:true,force:true});}
});

test('post-placement blocked-tray telemetry counts actual trays and never folds four choices into three',()=>{
 assert.equal(typeof simulator.simulateRun,'function');
 for(const strategy of ['random','route']){
  const {state,metrics}=simulator.simulateRun(strategy==='random'?17:3,{rulesetVersion:3,strategy,maxCommands:300,botSeed:0});
  let replay=createRun(state.seed,'standard',3);const expected:Record<string,{observations:number;allBlocked:number}>={};
  for(const command of state.commands as Command[]){
   replay=applyCommand(replay,command).state;
   if(command.type==='place'&&replay.result!=='won'){
    const key=String(replay.candidates.length),bucket=expected[key]??={observations:0,allBlocked:0};bucket.observations++;
    if(findLegalMoves(replay).length===0)bucket.allBlocked++;
   }
  }
  assert.deepEqual(metrics.candidateBlockage,expected);
  if(strategy==='route'){assert.ok(expected['4'].observations>0);assert.ok(expected['3'].observations>0);}
  if(strategy==='random'){assert.equal(state.result,'failed');assert.equal(sum(Object.fromEntries(Object.entries(expected).map(([key,bucket])=>[key,bucket.allBlocked]))),1);}
 }
 const report=simulator.runSimulation({runs:1,seedStart:3,rulesetVersion:3,maxCommands:300,strategies:['route']}).strategies.route;
 assert.ok(report.candidateBlockage['4'].observations>0);
 assert.deepEqual(report.threeCandidateAllBlocked,report.candidateBlockage['3']);
 for(const bucket of Object.values(report.candidateBlockage) as {observations:number;allBlocked:number;rate:number}[])assert.equal(bucket.rate,bucket.allBlocked/bucket.observations);
});

test('all policies return no command for a blocked board or a non-input phase',()=>{
 const blocked=emptyFixture();blocked.board.fill(M);
 for(const strategy of ['random','greedy','route']){
  assert.equal(simulator.chooseMove(blocked,strategy),null);
  assert.equal(simulator.chooseMove({...emptyFixture(),phase:'upgrade'},strategy),null);
  assert.equal(simulator.chooseMove({...emptyFixture(),phase:'result'},strategy),null);
 }
});

test('Greedy accounts for the physical side-effect cells cleared by Hazard',()=>{
 const state=emptyFixture();state.upgrades=['upgrade.hazard_clearance'];
 state.board[8]=F;state.board[9]=F;state.cellTraits![8]={kind:'hazard'};
 state.board[15]=M;state.board[16]=M;state.cellTraits![15]={kind:'waste'};state.cellTraits![16]={kind:'waste'};
 state.candidates=[{id:'hazard-complete',shapeId:'shape.single',cargo:F}];
 const move=simulator.chooseMove(state,'greedy'),result=applyCommand(state,{type:'place',...move});
 const shipments=result.events.filter(e=>e.type==='shipment');assert.equal(shipments.length,1);assert.equal(shipments[0].extraClearedCells?.length,2);
 const bestOccupied=Math.min(...findLegalMoves(state).map(m=>applyCommand(state,{type:'place',...m}).state.board.filter(c=>c!==null).length));
 assert.equal(result.state.board.filter(c=>c!==null).length,bestOccupied);
});


test('an offered upgrade at a command cap is recorded without fabricating a selection',()=>{
 const {state,metrics}=simulator.simulateRun(1,{rulesetVersion:3,strategy:'route',maxCommands:8});
 assert.equal(state.phase,'upgrade');assert.equal(metrics.status,'capped');assert.equal(sum(metrics.upgradeOffered),3);
 assert.equal(sum(metrics.upgradeSelected),0);assert.equal(metrics.placements,8);assert.equal(metrics.commands,8);
});

test('a crashing seed is retained as an error rather than a gameplay loss or a censored normal run',()=>{
 // Corrupt content only in an isolated process to exercise a real engine exception.
 const result=spawnSync(process.execPath,['--input-type=module','-e',`
  import {SHAPES} from './src/domain/content.ts';
  import {runSimulation} from './scripts/simulate.mjs';
  for(const shape of SHAPES)shape.minShift=99;
  console.log(JSON.stringify(runSimulation({runs:2,seedStart:55,strategies:['random']})));
 `],{encoding:'utf8'});
 assert.equal(result.status,0,result.stderr);const report=JSON.parse(result.stdout).strategies.random;
 assert.equal(report.runs,2);assert.equal(report.failures,0);assert.equal(report.capped,0);assert.equal(report.errors.length,2);
 assert.deepEqual(report.errors.map((error:{seed:number})=>error.seed),[55,56]);
 assert.equal(report.firstShipment.unknown,2);assert.equal(report.firstShipment.censored,0);assert.equal(report.firstShipment.mean,null);
});
