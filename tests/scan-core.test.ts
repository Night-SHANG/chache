import test from 'node:test';
import assert from 'node:assert/strict';
// @ts-expect-error QA command-line module runs natively in Node.
import {scanRun,campaignSeeds} from '../qa/large-scan/run-core.mjs';
// @ts-expect-error Existing QA command-line module runs natively in Node.
import {simulateRun} from '../scripts/simulate.mjs';
import {checksum} from '../src/domain/replay.ts';
test('campaign uses consecutive paired seeds and separate reproducible placement and upgrade cursors',()=>{assert.deepEqual(campaignSeeds(0),{seed:1,botSeed:(1^0x51f15e)|0,upgradeSeed:(1^0x6a09e667)|0});assert.equal(campaignSeeds(33333).seed,33334);assert.notEqual(campaignSeeds(8).botSeed,campaignSeeds(8).upgradeSeed);assert.throws(()=>campaignSeeds(-1));});
test('legacy policy QA wrapper preserves old standard commands checksums and core metrics for all three strategies',()=>{
 for(const seed of [1,19,101])for(const strategy of ['random','greedy','route']){const botSeed=(seed^0x51f15e)|0;const old=simulateRun(seed,{rulesetVersion:3,strategy,botSeed});const current=scanRun({seedIndex:seed-1,...campaignSeeds(seed-1),strategy,upgradePolicy:'legacy'});assert.deepEqual(current.state.commands,old.state.commands);assert.equal(checksum(current.state),old.metrics.finalChecksum);for(const key of ['status','commands','placements','orders','score','shift','maxChain','maxResolutionSteps','snapshotChecks','occupiedCellsSum','occupancySamples'])assert.equal(current.metrics[key],old.metrics[key],`${strategy} ${key}`);}
});
test('uniform-upgrade campaign is deterministic and observer/emitter cannot alter commands',()=>{
 const options={seedIndex:4,...campaignSeeds(4),strategy:'route'};const a=scanRun(options),emitted:unknown[]=[];const b=scanRun(options,(event:{commandIndex:number;command:{type:string;pieceId?:string}})=>{emitted.push(structuredClone(event));if(event.command.type==='place')event.command.pieceId='tampered';});assert.equal(a.metrics.finalChecksum,b.metrics.finalChecksum);assert.deepEqual(a.state.commands,b.state.commands);assert.equal(emitted.length,b.metrics.commands);assert.equal(b.metrics.replayVerified,true);assert.equal(b.metrics.upgradePolicy,'uniform');
});
test('per-run counters obey shipment, placement, occupancy and generated-content conservation',()=>{
 for(const strategy of ['random','greedy','route']){const {state,metrics:m}=scanRun({seedIndex:0,...campaignSeeds(0),strategy});const histogram=m.chainDistribution as Record<string,number>;assert.equal(Object.values(histogram).reduce((a:number,b:number)=>a+b,0),m.placements);assert.equal(Object.entries(histogram).reduce((a,[chain,n])=>a+Number(chain)*n,0),m.orders);assert.equal(m.occupancySamples,m.placements);assert.ok(m.peakOccupiedCells<=49&&m.occupiedCellsSum<=49*m.placements);assert.equal(m.snapshotChecks,m.commands);assert.equal(m.finalChecksum,checksum(state));assert.ok(m.timings.botMs>=0&&m.timings.engineMs>=0&&m.timings.observerMs>=0&&m.timings.saveMs>=0);assert.equal(m.generatedPieces,state.generatedPieces);}
});
test('capped run fails with original error and raw reproducible state rather than normal defeat',()=>{assert.throws(()=>scanRun({seedIndex:0,...campaignSeeds(0),strategy:'route',maxCommands:1}),(error:unknown)=>{const e=error as {message:string;scanFailure:{stage:string;commands:unknown[];rawState:string;attemptedCommand:unknown}};assert.match(e.message,/command limit/);assert.equal(e.scanFailure.commands.length,1);assert.equal(JSON.parse(e.scanFailure.rawState).commandIndex,1);assert.ok(e.scanFailure.attemptedCommand);return true;});});
test('every instrumented failure stage retains the original error and raw evidence without encodeRun recursion',()=>{
 const services=['createRun','chooseMove','applyCommand','encodeRun','decodeRun','observeInitial','observeCommand'];
 for(const service of services){const boom=Error(`injected ${service}`);assert.throws(()=>scanRun({seedIndex:0,...campaignSeeds(0),strategy:'route'},()=>{},{[service]:()=>{throw boom;}}),(error:unknown)=>{assert.equal(error,boom);const e=error as Error&{scanFailure:{message:string;rawState:string;commands:unknown[]}};assert.equal(e.scanFailure.message,boom.message);assert.equal(typeof e.scanFailure.rawState,'string');assert.ok(Array.isArray(e.scanFailure.commands));return true;});}
});
