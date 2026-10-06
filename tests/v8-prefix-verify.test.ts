import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createRun,applyCommand,findLegalMoves} from '../src/domain/engine.ts';
import {checksum} from '../src/domain/replay.ts';
import type {Command,RunState} from '../src/domain/types.ts';

// A missing verifier must fail as a missing behavior, before the implementation exists.
// @ts-expect-error Standalone QA module is intentionally outside the production TypeScript build.
const verify=existsSync('qa/v8-prefix-verify.mjs')?await import('../qa/v8-prefix-verify.mjs'):{};
const sha=(value:string|Buffer)=>createHash('sha256').update(value).digest('hex');
function sample(commands:Command[],seed=17){
 let state=createRun(seed,'color_exit',6,'easy');const initialChecksum=checksum(state),trace=[];
 for(const command of commands){const result=applyCommand(state,command);assert.equal(result.error,undefined);state=result.state;trace.push({commandIndex:state.commandIndex,command,checksum:checksum(state)});}
 return {seed,tier:'easy',status:state.phase==='result'?state.result:'capped',terminal:state.phase==='result',moves:commands.length,initialChecksum,trace,checkpoints:[{commandIndex:0,checksum:initialChecksum},{commandIndex:state.commandIndex,checksum:checksum(state)}],finalChecksum:checksum(state),finalState:state};
}
function entrySequence(){
 const initial=createRun(17,'color_exit',6,'easy');const entry=findLegalMoves(initial).find(move=>move.origin.x===3&&move.origin.y===7)!;
 const first:Command={type:'place',...entry};const next=applyCommand(initial,first).state;
 return [first,{type:'place',...findLegalMoves(next)[0]}] as Command[];
}

// Mutation targets: accidental strategy simulation, altered input budget, identity exclusions that hide gameplay drift.
test('v8 prefix protocol fixes the recorded 400-input scope and exact allowed differences',()=>{
 assert.equal(typeof verify.assertProtocol,'function');assert.equal(verify.assertProtocol(),true);
 assert.equal(verify.PROTOCOL.sourceRulesetVersion,6);assert.equal(verify.PROTOCOL.targetRulesetVersion,8);
 assert.equal(verify.PROTOCOL.recordedRuns,400);assert.equal(verify.PROTOCOL.freshPolicySimulations,0);
 assert.deepEqual(verify.PROTOCOL.identityFields,['rulesetVersion','runConfigId']);
 assert.deepEqual(verify.PROTOCOL.earlyTerminalFields,['phase','result','endReason']);
});

// Mutation target: treating old mutable root-source hashes as the input artifact's integrity check.
test('source-input integrity checks recorded bytes against their original manifest without requiring old root hashes',()=>{
 assert.equal(typeof verify.verifyInputBytes,'function');
 const bytes=Buffer.from(JSON.stringify(sample(entrySequence()))+'\n');
 const manifest={protocol:'outbound-v6-compare-v1',coreSource:{files:{'src/domain/engine.ts':'historical-only'}},outputs:{'runs.jsonl':sha(bytes)}};
 assert.equal(verify.verifyInputBytes(bytes,manifest).length,1);
 assert.throws(()=>verify.verifyInputBytes(Buffer.concat([bytes,Buffer.from(' ')]),manifest),/input.*SHA|input.*hash/i);
});

// Mutation targets: ignoring intermediate legacy checksums, comparing only final boards, or accepting post-terminal input.
test('recorded prefix compares whole state, checks every old checksum, and rejects all remaining commands',()=>{
 assert.equal(typeof verify.verifyRecordedRun,'function');
 const run=sample(entrySequence()),before=JSON.stringify(run),result=verify.verifyRecordedRun(run);
 assert.equal(result.v6CommandChecksumChecks,2);assert.equal(result.v8AcceptedCommands,1);assert.equal(result.earlyEntryStop,true);
 assert.equal(result.avoidedFillingCommands,1);assert.equal(result.remainingCommandRejections,1);
 assert.equal(result.terminalGuardChecks,1);assert.equal(result.nonIdentityStateChecks,2);assert.equal(result.v8End.entryOccupied,true);
 assert.equal(result.v8End.phase,'result');assert.equal(result.v8End.result,'failed');assert.equal(JSON.stringify(run),before);
 const damaged=structuredClone(run);damaged.trace[0].checksum='00000000';assert.throws(()=>verify.verifyRecordedRun(damaged),/v6.*checksum/i);
 const changed=structuredClone(run);changed.finalState.score++;assert.throws(()=>verify.verifyRecordedRun(changed),/v6.*final state/i);
});

// Mutation target: blanket omission of terminal fields, candidates, counters or future gameplay fields.
test('parity guard ignores identity only and requires the occupied-entry predicate before terminal exceptions',()=>{
 assert.equal(typeof verify.assertStateParity,'function');
 const old=createRun(17,'color_exit',6,'easy'),current=createRun(17,'color_exit',8,'easy');
 assert.equal(verify.assertStateParity(old,current),false);
 for(const patch of [{score:1},{nextId:999},{phase:'result'},{newGameplayField:7}])assert.throws(()=>verify.assertStateParity(old,{...current,...patch}));
 const before=applyCommand(old,entrySequence()[0]).state,after=applyCommand(current,entrySequence()[0]).state;
 assert.equal(verify.assertStateParity(before,after),true);
 assert.throws(()=>verify.assertStateParity(before,{...after,endReason:'completed'}));
 assert.throws(()=>verify.assertStateParity(before,{...after,board:after.board.map((cell,index)=>index===76?null:cell)}));
});

// Mutation targets: classifying unchanged complete input as early loss; claiming a win from a short prefix.
test('an unchanged open prefix remains inconclusive and summary reports avoided commands only for early stops',()=>{
 assert.equal(typeof verify.summarizeRuns,'function');
 const old=createRun(17,'color_exit',6,'easy'),command:Command={type:'place',...findLegalMoves(old)[0]};
 const open=verify.verifyRecordedRun(sample([command])),early=verify.verifyRecordedRun(sample(entrySequence()));
 assert.equal(open.earlyEntryStop,false);assert.equal(open.v8End.phase,'input');assert.equal(open.avoidedFillingCommands,0);
 const summary=verify.summarizeRuns([open,early]);assert.equal(summary.recordedRuns,2);assert.equal(summary.earlyEntryStops,1);
 assert.deepEqual(summary.avoidedFillingCommands,{total:1,n:1,min:1,median:1,max:1});
 assert.equal(summary.unchangedCompletedWins,0);
});

// Mutation targets: unsupported legacy router, changed frozen engine files or altered existing fixture traces.
test('v1 through v7 compatibility proof uses stable source fingerprints and the existing fixture commands',()=>{
 assert.equal(typeof verify.verifyLegacyFixtures,'function');const result=verify.verifyLegacyFixtures();
 assert.deepEqual(result.versions,[1,2,3,4,5,6,7]);assert.equal(result.frozenFiles,24);
 assert.ok(result.goldenChecksumChecks>500);assert.ok(result.v7RootParityChecks>20);
 const manifest=JSON.parse(readFileSync('tests/fixtures/outbound-v8-legacy-files.json','utf8')) as Record<string,string>;
 for(const [file,hash] of Object.entries(manifest))assert.equal(sha(readFileSync(file)),hash);
});
