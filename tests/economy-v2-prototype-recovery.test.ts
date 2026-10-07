import test from 'node:test';
import assert from 'node:assert/strict';
import { ACCOUNT_KEYS, encodeAccount, loadAccount, repairAccount } from '../src/application/account-store.ts';
import { accountDigest, canonicalStringify, verifyAccountReferences } from '../src/application/history-store.ts';
import { createAccountService } from '../src/application/account-service.ts';
import { GameSession } from '../src/application/session.ts';
import type { Platform } from '../src/platform/types.ts';
import { createRunV12 } from '../src/domain/v12/engine.ts';
import { createRunV13 } from '../src/domain/v13/engine.ts';
import { createRunV11 } from '../src/domain/v11/engine.ts';
import type { AccountRun } from '../src/application/account-types.ts';
import { FaultStorage, makeAccountFixture } from './helpers/account-fixtures.ts';

const held=()=>({status:'held' as const,release(){}});
function fixture(){return makeAccountFixture({generation:1,wallet:70,lastOperation:{operationId:'old.saved',expectedGeneration:0,committedGeneration:1,requestDigest:'old.saved'}});}
function prototype(version:12|13):string {
 const state=(version===12?createRunV12:createRunV13)(1,'normal');
 const run:AccountRun={identity:{runId:'test.epoch.1',serial:1,rulesetVersion:version,runConfigId:state.runConfigId,mode:version===12?'outbound':'outboundEndless',difficultyId:'normal',economyVersion:1},state,history:{seed:1,runConfigId:state.runConfigId,head:null,totalCommands:0,tail:[]},lifecycle:'active',reserved:[],creditedBase:0,earnedCoins:0,resultCursor:null};
 const encoded=JSON.parse(encodeAccount({...fixture(),generation:2,nextRunSerial:2,run,lastOperation:{operationId:'new.saved',expectedGeneration:1,committedGeneration:2,requestDigest:'new.saved'}}));
 delete encoded.account.run.state.rawScore;encoded.digest=accountDigest(canonicalStringify(encoded.account));return canonicalStringify(encoded);
}
function verifyReadOnly(storage:FaultStorage){
 const before=new Map(storage.values),verify=()=>loadAccount(storage,account=>verifyAccountReferences(storage,account));
 assert.equal(verify().status,'unknown');
 const service=createAccountService(storage,held(),()=>0);assert.equal(service.getStatus(),'unknown');assert.equal(service.getSnapshot(),null);assert.equal(service.getPendingOperationId(),null);
 for(const operationId of ['old.saved','new.saved'])assert.equal(service.retryPending(operationId).status,'not_committed');
 assert.equal(service.transact({operationId:'overwrite',type:'start',intent:{spec:{family:'inbound',rulesetVersion:14,mode:'standard',seed:1,guided:false,toolCharges:{rotate:0,clear:0,wildcard:0}},items:[],guide:'direct'}},1).status,'unknown');
 assert.equal(repairAccount(storage,account=>verifyAccountReferences(storage,account)).status,'unknown');
 const platform={storage,writerLease:held(),now:()=>0,wallTime:()=>0,playSound(){},stopSounds(){}} as unknown as Platform;
 const session=new GameSession(platform,{seed:1,mode:'standard'});assert.equal(session.view.accountBlocked,true);assert.equal(session.view.accountStatus,'unknown');
 session.action({type:'retrySave'});session.action({type:'newRun',mode:'standard'});session.hide();session.show();session.resume();
 assert.equal(session.view.accountBlocked,true);assert.equal(session.view.accountStatus,'unknown');
 assert.deepEqual(storage.values,before);assert.equal(storage.operations.some(op=>op.kind==='set'||op.kind==='remove'),false);
}

for(const version of [12,13] as const)for(const side of ['a','b'] as const)test(`unsupported prototype${version} in root${side.toUpperCase()} blocks older-root repair and preserves both bytes`,()=>{
 const storage=new FaultStorage();storage.values.set(ACCOUNT_KEYS.a,encodeAccount(fixture()));storage.values.set(ACCOUNT_KEYS.b,encodeAccount(fixture()));storage.values.set(ACCOUNT_KEYS[side],prototype(version));
 verifyReadOnly(storage);
});
for(const versions of [[12,12],[13,13],[12,13]] as const)test(`two unsupported prototype roots${versions.join('/')} stay untouched`,()=>{
 const storage=new FaultStorage();storage.values.set(ACCOUNT_KEYS.a,prototype(versions[0]));storage.values.set(ACCOUNT_KEYS.b,prototype(versions[1]));verifyReadOnly(storage);
});
for(const side of ['a','b'] as const)test(`released rules11 retains ordinary one-root corruption recovery in${side.toUpperCase()}`,()=>{
 const state=createRunV11({seed:1,mode:'standard'}),run:AccountRun={identity:{runId:'released.1',serial:1,rulesetVersion:11,runConfigId:state.runConfigId,mode:'standard',economyVersion:1},state,history:{seed:1,runConfigId:state.runConfigId,head:null,totalCommands:0,tail:[]},lifecycle:'active',reserved:[],creditedBase:0,earnedCoins:0,resultCursor:null};
 const storage=new FaultStorage(),raw=encodeAccount({...fixture(),nextRunSerial:2,run});storage.values.set(ACCOUNT_KEYS.a,raw);storage.values.set(ACCOUNT_KEYS.b,raw);storage.values.set(ACCOUNT_KEYS[side],'damaged known-format root');
 const service=createAccountService(storage,held(),()=>0);assert.equal(service.getStatus(),'degraded');
 const result=service.retryPending('old.saved');assert.equal(result.status,'acknowledged',result.message);assert.equal(result.account?.wallet,70);assert.equal(result.account?.run?.identity.rulesetVersion,11);
 assert.equal(storage.values.get(ACCOUNT_KEYS.a),raw);assert.equal(storage.values.get(ACCOUNT_KEYS.b),raw);
});
