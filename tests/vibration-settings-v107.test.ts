import test from 'node:test';
import assert from 'node:assert/strict';
import {assertProfile,createProfile,encodeProfile,decodeProfile,setProfileSettings} from '../src/application/profile.ts';
import {assertAccountSnapshot} from '../src/application/account-profile.ts';
import {createAccountService} from '../src/application/account-service.ts';
import {ACCOUNT_KEYS,encodeAccount,decodeAccount} from '../src/application/account-store.ts';
import {retainAccountCosmetics} from '../src/application/cosmetics.ts';
import {upgradeAccountGuides} from '../src/application/account-guides.ts';
import {FaultStorage,makeAccountFixture} from './helpers/account-fixtures.ts';
import type {AccountSnapshot} from '../src/application/account-types.ts';

const held=()=>({status:'held' as const,release(){}});
const legacyRaw='{"schemaVersion":1,"digest":"a64291e7","profile":{"schemaVersion":1,"settings":{"sound":true,"reducedMotion":false},"cosmetics":{"theme":"day","forklift":"yellow","cargo":"classic"},"tutorialComplete":false,"stats":{"runs":0,"orders":0,"wins":0,"maxChain":0},"bestScores":{},"dailyHistory":{},"achievements":[],"nextRunSerial":1,"lastRecordedRun":null}}';

// Mutation target: eagerly add the default while decoding and invalidate existing stored digests.
test('vibration defaults enabled on new profiles while old profile bytes remain identical',()=>{
 assert.equal(createProfile().settings.vibration,true);
 const profile=decodeProfile(legacyRaw);assert.equal(profile.settings.vibration,undefined);assert.equal(encodeProfile(profile),legacyRaw);
 const muted=setProfileSettings(profile,{sound:false,music:false,reducedMotion:true,vibration:false});
 assert.deepEqual(muted.settings,{sound:false,reducedMotion:true,music:false,vibration:false});assert.deepEqual(decodeProfile(encodeProfile(muted)),muted);assert.equal(encodeProfile(profile),legacyRaw);
});
test('profile vibration accepts only explicit booleans and rejects malformed optional fields',()=>{
 for(const vibration of [false,true])assert.doesNotThrow(()=>assertProfile({...createProfile(),settings:{sound:true,reducedMotion:false,vibration}}));
 for(const vibration of [undefined,null,0,'false']){
  assert.throws(()=>assertProfile({...createProfile(),settings:{sound:true,reducedMotion:false,vibration}}));
  assert.throws(()=>setProfileSettings(createProfile(),{vibration} as never));
 }
});
function legacyAccount(version:1|2|3|4):AccountSnapshot {
 let account=makeAccountFixture({wallet:555,inventory:{rotate:2,clear:1,wildcard:3},generation:1,lastOperation:{operationId:'fixture',expectedGeneration:0,requestDigest:'fixture',committedGeneration:1}});
 account.profile.settings={sound:false,reducedMotion:true,music:false};
 if(version>=2)account={...account,formatVersion:2,economyVersion:2,dailyRewards:{}};
 if(version>=3)account=retainAccountCosmetics(account);
 if(version===4)account=upgradeAccountGuides(account);
 return account;
}
test('all four old account formats round-trip without setting normalization, writes or financial changes',()=>{
 for(const version of [1,2,3,4] as const){
  const account=legacyAccount(version),storage=new FaultStorage(),raw=encodeAccount(account);storage.values.set(ACCOUNT_KEYS.a,raw);storage.values.set(ACCOUNT_KEYS.b,raw);
  assert.equal(encodeAccount(decodeAccount(storage,raw)),raw);const service=createAccountService(storage,held(),()=>0);assert.equal(service.getStatus(),'ready');assert.deepEqual(service.getSnapshot(),account);
  assert.equal(storage.operations.some(op=>op.kind==='set'),false);assert.equal(service.getSnapshot()?.profile.settings.vibration,undefined);
 }
});
// Mutation target: reject the new setting, reset account assets, or persist a stale value after a restart.
test('vibration toggle persists independently through normal account transactions and restart',()=>{
 const original=legacyAccount(4),storage=new FaultStorage(),raw=encodeAccount(original);storage.values.set(ACCOUNT_KEYS.a,raw);storage.values.set(ACCOUNT_KEYS.b,raw);
 let service=createAccountService(storage,held(),()=>0);
 for(const vibration of [false,true]){
  const before=service.getSnapshot()!,saved=service.transact({operationId:`vibration.${vibration}`,type:'setSettings',patch:{vibration}},before.generation);
  assert.equal(saved.status,'acknowledged',saved.message);const expected={...structuredClone(before),generation:saved.account!.generation,lastOperation:saved.account!.lastOperation};expected.profile.settings.vibration=vibration;
  assert.deepEqual(saved.account,expected);service=createAccountService(storage,held(),()=>0);assert.deepEqual(service.getSnapshot(),saved.account);
 }
});
test('account validator rejects present nonboolean vibration without weakening unknown-field checks',()=>{
 for(const settings of [{vibration:undefined},{vibration:null},{vibration:'false'},{vibration:0},{unrelated:true}]){
  const account=legacyAccount(4);Object.assign(account.profile.settings,settings);assert.throws(()=>assertAccountSnapshot(account));
 }
});
