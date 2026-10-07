import test from 'node:test';import assert from 'node:assert/strict';
import {createAccountService} from '../src/application/account-service.ts';import type {AccountRequest} from '../src/application/account-service.ts';
import {ACCOUNT_KEYS,encodeAccount,loadAccount} from '../src/application/account-store.ts';import {assertAccountSnapshot} from '../src/application/account-profile.ts';import {accountDigest,canonicalStringify} from '../src/application/history-store.ts';
import {sessionHost} from './helpers/session-fixtures.ts';import {FaultStorage,makeAccountFixture} from './helpers/account-fixtures.ts';
const held=()=>({status:'held' as const,release(){}});
test('tutorial preference upgrades only in a transaction and off/on/reset preserve learned facts',()=>{
 const old=makeAccountFixture({wallet:1400});old.guides.inbound={learned:['place','order','route'],skipped:true,authoredStartConsumed:true};const storage=new FaultStorage(),raw=encodeAccount(old);storage.values.set(ACCOUNT_KEYS.a,raw);storage.values.set(ACCOUNT_KEYS.b,raw);const service=createAccountService(storage,held(),()=>0),before=[...storage.values];assert.deepEqual([...storage.values],before);let count=0;
 const tx=(body:object)=>service.transact({operationId:`pref.${++count}`,...body} as AccountRequest,service.getSnapshot()!.generation);
 for(const enabled of [false,true,false]){const result=tx({type:'setTutorialsEnabled',enabled});assert.equal(result.status,'acknowledged',result.message);assert.equal(service.getSnapshot()!.tutorialsEnabled,enabled);assert.deepEqual(service.getSnapshot()!.guides.inbound,old.guides.inbound);assert.equal(service.getSnapshot()!.wallet,1400);}
 assert.equal(tx({type:'resetResults'}).status,'acknowledged');assert.equal(service.getSnapshot()!.tutorialsEnabled,false);assert.deepEqual(service.getSnapshot()!.guides.inbound,old.guides.inbound);assert.equal(createAccountService(storage,held(),()=>0).getSnapshot()!.tutorialsEnabled,false);
});
for(const side of ['a','b'] as const)for(const pref of [undefined,null,0,'false',[],{}])test(`invalid tutorialsEnabled ${JSON.stringify(pref)} root ${side} fails closed`,()=>{
 const h=sessionHost();const service=createAccountService(h.storage,held(),()=>0),upgraded=service.transact({type:'setTutorialsEnabled',enabled:false,operationId:'fixture.explicit.preference'},service.getSnapshot()!.generation);assert.equal(upgraded.status,'acknowledged');const good=structuredClone(upgraded.account!);const bad={...good,generation:good.generation+1,tutorialsEnabled:pref,lastOperation:{operationId:'bad',expectedGeneration:good.generation,committedGeneration:good.generation+1,requestDigest:'bad'}};if(pref===undefined)delete bad.tutorialsEnabled;
 h.data.set(ACCOUNT_KEYS[side],canonicalStringify({formatVersion:1,generation:bad.generation,digest:accountDigest(canonicalStringify(bad)),account:bad}));const before=[...h.data];h.storage.resetFault();assert.equal(loadAccount(h.storage,assertAccountSnapshot).status,'unknown');assert.equal(createAccountService(h.storage,held(),()=>0).getStatus(),'unknown');assert.deepEqual([...h.data],before);assert.equal(h.storage.operations.filter(o=>o.kind==='set'||o.kind==='remove').length,0);
});
test('retired tutorial toggle preserves preference, learned facts, wallet and the active board',()=>{
 const h=sessionHost({wallet:1400}),s=h.session;s.action({type:'newRun',mode:'standard'});assert.equal(s.view.screen,'prepareTools');s.action({type:'prepareNext'});assert.equal(s.view.guide,null);s.action({type:'settings'});
 const before=[...h.data],state=s.state,account=structuredClone(s.view.account);h.storage.resetFault();
 for(let n=0;n<2;n++)s.action({type:'toggleTutorials'});
 assert.equal(s.view.screen,'settings');assert.equal(s.view.guide,null);assert.equal(s.state,state);assert.deepEqual(s.view.account,account);assert.equal(s.view.account?.wallet,1400);assert.deepEqual([...h.data],before);assert.equal(h.storage.operations.filter(o=>o.kind==='set'||o.kind==='remove').length,0);
});
