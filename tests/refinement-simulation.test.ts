import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,mkdtempSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createPlayableRun,applyPlayableCommand,playableChecksum} from '../src/domain/playable.ts';
// @ts-expect-error The bounded evidence CLI is JavaScript outside the TypeScript build.
import * as sim from '../scripts/simulate-refinement.mjs';

test('refinement protocol fixes 512 matched baseline cases and 384 independent tool cases',()=>{
 const plan=sim.buildRefinementPlan();assert.equal(plan.cases.length,896);
 assert.equal(new Set(plan.cases.map((c:{id:string})=>c.id)).size,896);
 assert.equal(plan.cases.filter((c:{group:string})=>c.group==='baseline').length,512);
 assert.equal(plan.cases.filter((c:{group:string})=>c.group==='tools').length,384);
 for(const c of plan.cases){assert.equal(c.spec.family,'inbound');assert.equal(c.spec.mode,'standard');assert.equal(c.spec.guided,false);assert.equal(c.maxPlacements,300);}
 for(let seed=1;seed<=64;seed++)assert.equal(plan.cases.filter((c:{group:string;spec:{seed:number}})=>c.group==='baseline'&&c.spec.seed===seed).length,8);
 const bases=new Set(plan.cases.filter((c:{group:string;spec:{rulesetVersion:number}})=>c.group==='baseline'&&c.spec.rulesetVersion===11).map((c:{id:string})=>c.id));
 for(const c of plan.cases.filter((c:{group:string})=>c.group==='tools')){assert.equal(c.spec.rulesetVersion,11);assert.ok(c.spec.seed<=32);assert.ok(bases.has(c.baselineId));}
 assert.throws(()=>sim.buildRefinementPlan({seedEnd:65}),/bounded/i);
 assert.throws(()=>sim.buildRefinementPlan({maxPlacements:301}),/bounded/i);
 assert.throws(()=>sim.buildRefinementPlan({strategies:['route','route']}),/strategy/i);
});

test('refinement bot preserves the frozen visible-only decisions and leaves hidden state unused',()=>{
 for(const rulesetVersion of [9,11] as const){
  let state=createPlayableRun({family:'inbound',mode:'standard',rulesetVersion,seed:17,guided:false,toolCharges:{rotate:0,clear:0,wildcard:0}});
  state=applyPlayableCommand(state,{type:'chooseCleanup',branch:'orders'}).state;
  const before=JSON.stringify(state),hidden={...state,rngState:[1,2,3,4],seed:999,nextId:999,commands:[],commandIndex:99};
  for(const strategy of ['route','greedy'])assert.deepEqual(sim.chooseRefinementMove(state,strategy),sim.chooseRefinementMove(hidden,strategy));
  assert.equal(JSON.stringify(state),before);assert.equal(sim.verifyNeutralGeometry(state),true);
 }
});

test('capped prefixes stay inconclusive, all commands replay, and v11 offers no upgrades',()=>{
 const plan=sim.buildRefinementPlan({profile:'baseline',seedEnd:1,strategies:['route'],maxPlacements:3});
 for(const item of plan.cases){const run=sim.simulateRefinementCase(item);assert.equal(run.metrics.status,'capped');assert.equal(run.metrics.placements,3);assert.equal(run.metrics.failure,0);assert.equal(run.metrics.failureStage,null);
  assert.equal(run.metrics.baseCoins,sim.coinsFor(run.state.completedOrders,run.state.score));assert.equal(sim.verifyRefinementReplay(run).checksum,playableChecksum(run.state));
  assert.equal(run.metrics.commandSteps,run.trace.length);if(item.spec.rulesetVersion===11)assert.deepEqual(run.metrics.upgradeChosen,{});
  const damaged=structuredClone(run);damaged.trace[1].checksum='bad';assert.throws(()=>sim.verifyRefinementReplay(damaged),/checksum/i);
 }
});

test('paired reports use exact seed/policy/cleanup counterparts and retain inconclusive pairs',()=>{
 const baseline=(seed:number,version:number,status:string,orders:number)=>({id:`baseline-v${version}-route-orders-none-s${seed}`,group:'baseline',spec:{rulesetVersion:version,seed},strategy:'route',cleanup:'orders',tools:'none',metrics:{status,completedOrders:orders,score:orders*100,baseCoins:orders,placements:orders+5,commandSteps:orders+6}});
 const old=baseline(1,9,'failed',10),fresh=baseline(1,11,'won',30),cap=baseline(2,11,'capped',20),old2=baseline(2,9,'failed',7);
 const result=sim.comparePairedRuns([old,fresh,old2,cap]);assert.equal(result.baseline.total.pairs,2);assert.equal(result.baseline.total.inconclusivePairs,1);assert.equal(result.baseline.total.oldFailedNewWon,1);assert.equal(result.baseline.total.newWinsMinusOldWins,1);assert.equal(result.baseline.total.winRateDelta,null);
 assert.throws(()=>sim.comparePairedRuns([fresh]),/counterpart/i);
});

test('suite resumes exact cases without duplicate execution and validates completed evidence',()=>{
 const output=mkdtempSync(join(tmpdir(),'refinement-resume-'));
 try{const plan=sim.buildRefinementPlan({profile:'baseline',seedEnd:1,strategies:['route'],maxPlacements:2});
  const first=sim.runRefinementSuite(plan,{output,stopAfter:1});assert.equal(first.status,'interrupted');assert.equal(first.completed,1);
  const path=join(output,'runs',`${plan.cases[0].id}.json`),bytes=readFileSync(path,'utf8');writeFileSync(join(output,'active.json'),bytes);
  const resumed=sim.runRefinementSuite(plan,{output});assert.equal(resumed.status,'complete');assert.equal(resumed.completed,4);assert.equal(readFileSync(path,'utf8'),bytes);assert.equal(existsSync(join(output,'active.json')),false);
  assert.equal(sim.runRefinementSuite(plan,{output}).executed,0);
  assert.throws(()=>sim.runRefinementSuite({...plan,maxPlacements:3},{output}),/plan|binding/i);
  const broken=JSON.parse(bytes);broken.run.trace[0].checksum='bad';writeFileSync(path,JSON.stringify(broken));assert.throws(()=>sim.runRefinementSuite(plan,{output}),/hash|corrupt/i);
 }finally{rmSync(output,{recursive:true,force:true});}
});

test('failure dumps accepted prefix and resumes the exact attempted decision',()=>{
 const output=mkdtempSync(join(tmpdir(),'refinement-fault-'));
 try{const plan=sim.buildRefinementPlan({profile:'baseline',seedEnd:1,strategies:['route'],maxPlacements:3});
  assert.throws(()=>sim.runRefinementSuite(plan,{output,beforeCommand:({state}:{state:{commandIndex:number}})=>{if(state.commandIndex===2)throw Error('intentional interruption');}}),/intentional interruption/);
  const halted=JSON.parse(readFileSync(join(output,'halted.json'),'utf8'));assert.equal(halted.run.state.commandIndex,2);assert.equal(halted.run.attemptedCommand.type,'place');assert.equal(sim.verifyRefinementReplay(halted.run).commands,2);
  const resumed=sim.runRefinementSuite(plan,{output}),fresh=sim.simulateRefinementCase(plan.cases[0]);assert.deepEqual(resumed.runs[0].trace,fresh.trace);
  assert.equal(resumed.sourceBefore.sha256,resumed.sourceAfter.sha256);
 }finally{rmSync(output,{recursive:true,force:true});}
});

test('checkpoint identity includes rule version, charges, cleanup, policy and source binding',()=>{
 const output=mkdtempSync(join(tmpdir(),'refinement-binding-'));
 try{const plan=sim.buildRefinementPlan({profile:'baseline',seedEnd:1,strategies:['greedy'],maxPlacements:3});
  assert.throws(()=>sim.runRefinementSuite(plan,{output,beforeCommand:({state}:{state:{commandIndex:number}})=>{if(state.commandIndex===1)throw Error('fault');}}));
  const path=join(output,'active.json'),original=readFileSync(path,'utf8');
  for(const key of ['strategy','cleanup','sourceHash']){const record=JSON.parse(original);if(key==='sourceHash')record.sourceHash='bad';else record.run[key]='bad';writeFileSync(path,JSON.stringify(record));assert.throws(()=>sim.runRefinementSuite(plan,{output}),/hash|binding|corrupt/i);}
 }finally{rmSync(output,{recursive:true,force:true});}
});

test('v9 rejected upgrade restores its independent cursor, while no run fakes finish',()=>{
 const output=mkdtempSync(join(tmpdir(),'refinement-upgrade-'));
 try{const plan=sim.buildRefinementPlan({profile:'baseline',seedEnd:1,strategies:['greedy'],maxPlacements:80});
  assert.throws(()=>sim.runRefinementSuite(plan,{output,beforeCommand:({state,command}:{state:{phase:string};command:{upgradeId?:string}})=>{if(state.phase==='upgrade')command.upgradeId='invalid-upgrade';}}));
  const resumed=sim.runRefinementSuite(plan,{output}),fresh=sim.simulateRefinementCase(plan.cases[0]);assert.deepEqual(resumed.runs[0].trace,fresh.trace);
  for(const run of resumed.runs)assert.ok(run.trace.every((e:{command:{type:string}})=>!['finish','continueOvertime'].includes(e.command.type)));
 }finally{rmSync(output,{recursive:true,force:true});}
});
