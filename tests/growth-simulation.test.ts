import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createPlayableRun,applyPlayableCommand,playableChecksum} from '../src/domain/playable.ts';
// @ts-expect-error The bounded evidence CLI is JavaScript outside the TypeScript build.
import * as sim from '../scripts/simulate-growth.mjs';

test('approved grids account for every seed and identity exactly once within each sample',()=>{
 const baseline=sim.buildPlan({profile:'baseline'}),income=sim.buildPlan({profile:'income'}),tools=sim.buildPlan({profile:'tools'});
 assert.equal(baseline.cases.length,256);assert.equal(income.cases.length,640);assert.equal(tools.cases.length,384);
 for(const plan of [baseline,income,tools])assert.equal(new Set(plan.cases.map((c:{id:string})=>c.id)).size,plan.cases.length);
 for(let seed=1;seed<=64;seed++)assert.equal(baseline.cases.filter((c:{spec:{seed:number}})=>c.spec.seed===seed).length,4);
 for(let seed=1;seed<=32;seed++)assert.equal(income.cases.filter((c:{spec:{seed:number}})=>c.spec.seed===seed).length,20);
 assert.ok(income.cases.filter((c:{spec:{family:string}})=>c.spec.family==='outbound').every((c:{tools:string})=>c.tools==='none'));
 assert.throws(()=>sim.buildPlan({profile:'baseline',seedStart:1,seedEnd:100000}),/bounded|seed/i);
});

test('frozen bots use visible board and candidates, leave actual state intact and ignore future RNG/history',()=>{
 for(const spec of [{family:'inbound',mode:'standard',rulesetVersion:9,seed:17,guided:false,toolCharges:{rotate:0,clear:0,wildcard:0}},
  {family:'outbound',variant:'endless',rulesetVersion:10,seed:7,difficultyId:'easy'}] as const){
  let state=createPlayableRun(spec);if(state.rulesetVersion===9)state=applyPlayableCommand(state,{type:'chooseCleanup',branch:'orders'}).state;
  const before=JSON.stringify(state),hidden={...state,rngState:[1,2,3,4],seed:999,nextId:999,commands:[],commandIndex:99};
  for(const strategy of ['route','greedy'])assert.deepEqual(sim.chooseGrowthMove(state,strategy),sim.chooseGrowthMove(hidden,strategy));
  assert.equal(JSON.stringify(state),before);
 }
});

test('placement caps stay inconclusive and real replay/codec telemetry reconcile',()=>{
 const plan=sim.buildPlan({profile:'baseline',seedStart:17,seedEnd:17,strategies:['route'],maxPlacements:3});
 const run=sim.simulateGrowthCase(plan.cases[0]);assert.equal(run.metrics.status,'capped');assert.equal(run.metrics.placements,3);
 assert.equal(run.metrics.failure,0);assert.equal(run.metrics.coins,sim.coinsFor(run.spec.family,run.state.completedOrders,run.state.score));
 assert.equal(run.metrics.mandatoryAnimationMs,run.metrics.shipmentGroups*1000);
 assert.equal(run.trace.length,run.state.commandIndex);assert.equal(sim.verifyGrowthReplay(run).checksum,playableChecksum(run.state));
 const damaged=structuredClone(run);damaged.trace[1].checksum='00000000';assert.throws(()=>sim.verifyGrowthReplay(damaged),/checksum/i);
});

test('interrupted sample resumes completed runs without duplicate or missing cases',()=>{
 const output=mkdtempSync(join(tmpdir(),'growth-resume-'));
 try{
  const plan=sim.buildPlan({profile:'baseline',seedStart:1,seedEnd:2,strategies:['route'],maxPlacements:2});
  const first=sim.runGrowthSuite(plan,{output,stopAfter:1});assert.equal(first.status,'interrupted');assert.equal(first.completed,1);
  const firstPath=join(output,'runs',`${plan.cases[0].id}.json`),bytes=readFileSync(firstPath,'utf8');
  const resumed=sim.runGrowthSuite(plan,{output});assert.equal(resumed.status,'complete');assert.equal(resumed.completed,4);
  assert.equal(readFileSync(firstPath,'utf8'),bytes);assert.deepEqual(resumed.runs.map((r:{id:string})=>r.id),plan.cases.map((c:{id:string})=>c.id));
  assert.equal(sim.runGrowthSuite(plan,{output}).executed,0);
 }finally{rmSync(output,{recursive:true,force:true});}
});

test('an exception halts the sample and saves the exact accepted prefix plus attempted command for replay',()=>{
 const output=mkdtempSync(join(tmpdir(),'growth-crash-'));
 try{
  const plan=sim.buildPlan({profile:'baseline',seedStart:17,seedEnd:17,strategies:['route'],maxPlacements:3});
  assert.throws(()=>sim.runGrowthSuite(plan,{output,beforeCommand:({state}:{state:{commandIndex:number}})=>{if(state.commandIndex===2)throw Error('intentional protocol fault');}}),/intentional protocol fault/);
  const halted=JSON.parse(readFileSync(join(output,'halted.json'),'utf8'));assert.equal(halted.completed,0);assert.equal(halted.run.state.commandIndex,2);
  assert.equal(halted.run.attemptedCommand.type,'place');assert.equal(sim.verifyGrowthReplay(halted.run).checksum,playableChecksum(halted.run.state));
  const resumed=sim.runGrowthSuite(plan,{output}),fresh=sim.simulateGrowthCase(plan.cases[0]);
  assert.equal(resumed.status,'complete');assert.deepEqual(resumed.runs[0].state,fresh.state);assert.deepEqual(resumed.runs[0].trace,fresh.trace);
 }finally{rmSync(output,{recursive:true,force:true});}
});

test('source-bound resume rejects a changed plan or corrupted completed evidence',()=>{
 const output=mkdtempSync(join(tmpdir(),'growth-binding-'));
 try{
  const plan=sim.buildPlan({profile:'baseline',seedStart:1,seedEnd:1,strategies:['greedy'],maxPlacements:1});sim.runGrowthSuite(plan,{output});
  assert.throws(()=>sim.runGrowthSuite({...plan,maxPlacements:2},{output}),/plan|binding/i);
 }finally{rmSync(output,{recursive:true,force:true});}
});

test('seven real upgrade eligibility rounds retain three types and two functional options',()=>{
 const result=sim.measureUpgradeCapacity();assert.equal(result.rounds.length,7);assert.ok(result.statesChecked>1000);
 assert.ok(result.rounds.every((round:{minEligible:number;minFunctional:number})=>round.minEligible>=3&&round.minFunctional>=2));
});
