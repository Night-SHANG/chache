/** Exact-snapshot actual-host protocol. Constructed fixtures are never replay evidence. */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createGrowthHost,sha256,verifyEvidenceBinding,mapPort,validateResumeStorage} from './growth-host-support.mjs';
import {createPlayableRun,applyPlayableCommand,isToolRun,isInboundRun} from '../src/domain/playable.ts';
import {makeAccountFixture} from '../tests/helpers/account-fixtures.ts';
import {ACCOUNT_KEYS,encodeAccount} from '../src/application/account-store.ts';
import {stageHistory,verifyAccountReferences} from '../src/application/history-store.ts';
import {baseCoins} from '../src/application/economy.ts';

export function verifyEntranceBinding(binding){
 for(const key of ['commit','expectedCommit'])assert.match(binding[key]??'',/^[a-f0-9]{40}$/,'Owner commit hash must be complete');
 for(const key of ['sourceSha256','expectedSourceSha256','manifestSourceSha256','gameJsSha256','expectedGameJsSha256'])assert.match(binding[key]??'',/^[a-f0-9]{64}$/,`${key} hash must be complete`);
 assert.equal(binding.commit,binding.expectedCommit,'Current commit differs from owner snapshot');
 assert.equal(binding.sourceSha256,binding.expectedSourceSha256,'Current source differs from owner snapshot');
 verifyEvidenceBinding(binding);
}
export async function createBoundEntranceHost(binding,options={}){
 verifyEntranceBinding(binding);
 if(options.storage?.size)validateResumeStorage(options.storage);
 const bytes=await readFile(options.bundlePath??'build/wechat/game.js');
 assert.equal(sha256(bytes),binding.expectedGameJsSha256,'Actual game.js hash differs from owner bytes');
 return createGrowthHost(options);
}
export function entranceFixtureStorage(spec,commands=[],{constructedState,label,inventory={rotate:0,clear:0,wildcard:0},wallet=0,guides}={}){
 assert.ok(spec.family!=='inbound'||spec.mode!=='daily','Daily requires real account start');
 let state=createPlayableRun(spec);
 for(const command of commands){const next=applyPlayableCommand(state,command);assert.equal(next.error,undefined,`Fixture replay rejected ${JSON.stringify(command)}`);state=next.state;}
 if(constructedState){assert.match(label??'',/^CONSTRUCTED: .+/, 'Constructed geometry requires an explicit provenance label');assert.equal(commands.length,0,'Constructed fixtures cannot claim replayed commands');assert.equal(constructedState.rulesetVersion,spec.rulesetVersion);state=structuredClone(constructedState);}
 const storage=new Map(),port=mapPort(storage),mode=isInboundRun(state)?spec.guided?'guided':spec.mode:spec.guided?'outboundGuided':spec.variant==='endless'?'outboundEndless':'outbound';
 const identity={runId:'entrance.host.1',serial:1,rulesetVersion:state.rulesetVersion,runConfigId:state.runConfigId,economyVersion:1,mode,...(spec.family==='outbound'?{difficultyId:spec.difficultyId}:{})};
 const history=stageHistory(port,identity,{seed:state.seed,runConfigId:state.runConfigId,head:null,totalCommands:0,tail:[]},state.commands,state.commandIndex);
 state={...state,runSerial:1,elapsedMs:0,...(state.rulesetVersion>=9?{commands:history.tail,commandBaseIndex:history.commandBaseIndex}:{})};
 const creditedBase=baseCoins(spec.family,state.completedOrders,state.score);
 const account=makeAccountFixture({epoch:'entrance.host',generation:1,nextRunSerial:2,wallet:wallet+creditedBase,inventory,...(guides?{guides}:{}),run:{identity,state,history:history.cursor,lifecycle:'active',reserved:isToolRun(state)?Object.keys(state.toolCharges).filter(item=>state.toolCharges[item]===1):[],creditedBase,earnedCoins:creditedBase,resultCursor:null},lastOperation:{operationId:'entrance.fixture',expectedGeneration:0,requestDigest:'fixture',committedGeneration:1}});
 verifyAccountReferences(port,account);const raw=encodeAccount(account);for(const key of [ACCOUNT_KEYS.a,ACCOUNT_KEYS.b])storage.set(key,raw);validateResumeStorage(storage);return storage;
}
