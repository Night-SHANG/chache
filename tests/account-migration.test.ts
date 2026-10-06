import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareLegacyMigration } from '../src/application/legacy-migration.ts';
import { PROFILE_KEYS, createProfile, encodeProfile, recordResult } from '../src/application/profile.ts';
import { saveKeysFor, encodeRun, decodeRun } from '../src/application/save.ts';
import { createRun } from '../src/domain/engine.ts';
import { slotForRun } from '../src/application/run-slots.ts';
import { closedSerialFloor, closeRun } from '../src/application/run-lifecycle.ts';
import { commitAccount } from '../src/application/account-store.ts';
import { verifyAccountReferences } from '../src/application/history-store.ts';
import { FaultStorage } from './helpers/account-fixtures.ts';

test('verified legacy preferences, full results and serial/reset/closure boundaries copy with zero economy and unchanged source bytes',()=>{
 const storage=new FaultStorage(),profile=createProfile();profile.settings.sound=false;profile.cosmetics.theme='night';profile.tutorialComplete=true;profile.stats={runs:4,orders:40,wins:1,maxChain:3};profile.achievements=['first_shipment','chain_3','five_shifts'];profile.nextRunSerial=12;profile.resetCursor={serial:9,commandIndex:25};
 storage.set(PROFILE_KEYS.main,encodeProfile(profile));const old={...createRun(123,'standard',3),runSerial:15};storage.set(saveKeysFor(slotForRun(old)).main,encodeRun(old));assert.equal(closeRun(storage,slotForRun(old),old).ok,true);
 const before=new Map(storage.values),migrated=prepareLegacyMigration(storage);assert.equal(migrated.status,'ready');if(migrated.status!=='ready')return;
 const account=migrated.account;assert.equal(account.wallet,0);assert.deepEqual(account.inventory,{rotate:0,clear:0,wildcard:0});assert.equal(account.legacyImported,true);assert.deepEqual(account.profile.settings,profile.settings);assert.deepEqual(account.profile.legacyResults.stats,profile.stats);assert.equal(account.nextRunSerial,16);assert.equal(account.closedThroughSerial,closedSerialFloor(storage).floor);assert.deepEqual(account.resetCursor,profile.resetCursor);assert.deepEqual(account.guides.inbound.learned,['place','order','route','upgrade']);assert.equal(account.guides.inbound.authoredStartConsumed,true);
 assert.deepEqual(storage.values,before);
 const next={...account,generation:1,lastOperation:{operationId:'migration',expectedGeneration:0,requestDigest:'legacy',committedGeneration:1}};assert.equal(commitAccount(storage,null,next,loaded=>verifyAccountReferences(storage,loaded)).status,'acknowledged');
 const paid={...next,generation:2,wallet:77,lastOperation:{operationId:'coins',expectedGeneration:1,requestDigest:'coin',committedGeneration:2}};assert.equal(commitAccount(storage,next,paid,loaded=>verifyAccountReferences(storage,loaded)).status,'acknowledged');storage.values.set(PROFILE_KEYS.main,'now-corrupt');const again=prepareLegacyMigration(storage);assert.equal(again.status,'ready');if(again.status==='ready')assert.equal(again.account.wallet,77);
});
test('every frozen 1–8 snapshot remains byte-identical and can decode under its original identity after migration',()=>{
 const storage=new FaultStorage();for(const version of [1,2,3,4,5,6,7,8]){const mode=version===7?'endless':version>=4?'color_exit':'standard';const variant=version===5?'entry':version===6||version===8?'normal':undefined;const state=createRun(42,mode,version,variant);const raw=encodeRun(state);const key=saveKeysFor(slotForRun(state)).main;storage.set(key,raw);}
 const before=new Map(storage.values);assert.equal(prepareLegacyMigration(storage).status,'ready');assert.deepEqual(storage.values,before);for(const raw of before.values()){const state=decodeRun(raw);assert.equal(encodeRun(state),raw);}
});
test('corrupt or unknown legacy bytes and any failed read block initialization instead of creating an empty wallet',()=>{
 for(const raw of ['corrupt','{"schemaVersion":999,"profile":{}}']){const storage=new FaultStorage();storage.set(PROFILE_KEYS.main,raw);const before=new Map(storage.values);assert.equal(prepareLegacyMigration(storage).status,'blocked');assert.deepEqual(storage.values,before);}
 const baseline=new FaultStorage();assert.equal(prepareLegacyMigration(baseline).status,'ready');const count=baseline.operations.length;
 for(let at=1;at<=count;at++)for(const timing of ['before','after'] as const){const storage=new FaultStorage();storage.resetFault({at,timing});assert.equal(prepareLegacyMigration(storage).status,'blocked',`${at}/${timing}`);assert.equal(storage.operations.some(op=>op.kind==='set'||op.kind==='remove'),false);}
});
test('a legacy backup high serial or reset watermark survives authoritative main display statistics',()=>{
 const storage=new FaultStorage(),main=createProfile(),backup=createProfile();main.nextRunSerial=5;backup.nextRunSerial=10;backup.resetCursor={serial:8,commandIndex:99};storage.set(PROFILE_KEYS.main,encodeProfile(main));storage.set(PROFILE_KEYS.backup,encodeProfile(backup));
 const result=prepareLegacyMigration(storage);assert.equal(result.status,'ready');if(result.status==='ready'){assert.equal(result.account.nextRunSerial,10);assert.deepEqual(result.account.resetCursor,{serial:8,commandIndex:99});assert.deepEqual(result.account.profile.legacyResults.stats,main.stats);}
});

test('an untouched legacy board suppresses another authored start without inventing learned mechanics',()=>{
 const storage=new FaultStorage(),run=createRun(42,'standard',3);storage.values.set(saveKeysFor(slotForRun(run)).main,encodeRun(run));const migration=prepareLegacyMigration(storage);assert.equal(migration.status,'ready');if(migration.status==='ready'){assert.equal(migration.account.guides.inbound.authoredStartConsumed,true);assert.deepEqual(migration.account.guides.inbound.learned,[]);}
});

test('migration reserves legacy serials before the new epoch without rewriting old boards',()=>{
 const storage=new FaultStorage(),profile=createProfile();profile.nextRunSerial=80;
 const unassigned=createRun(7,'standard',1),assigned={...createRun(12,'color_exit',8,'easy'),runSerial:90};
 storage.values.set(PROFILE_KEYS.main,encodeProfile(profile));storage.values.set(saveKeysFor('orders').main,encodeRun(unassigned));storage.values.set(saveKeysFor('outbound8_easy').main,encodeRun(assigned));
 const before=new Map(storage.values),result=prepareLegacyMigration(storage);assert.equal(result.status,'ready');if(result.status!=='ready')return;
 assert.deepEqual(result.account.migration.legacySerials,{orders:91});assert.equal(result.account.migration.legacySerialCeiling,91);assert.equal(result.account.nextRunSerial,92);assert.deepEqual(storage.values,before);
 const again=prepareLegacyMigration(storage);assert.equal(again.status,'ready');if(again.status==='ready')assert.deepEqual(again.account.migration.legacySerials,result.account.migration.legacySerials);
});

test('backup reset and recorded boundaries remain attached to each legacy score namespace',()=>{
 const storage=new FaultStorage(),main=createProfile(),backup=createProfile();main.nextRunSerial=5;backup.nextRunSerial=10;backup.resetCursor={serial:8,commandIndex:99};backup.lastRecordedRun={serial:8,orders:7,score:800};
 backup.outboundV8={easy:{stats:{runs:0,batches:0,wins:0,maxChain:0},bestScores:{},resetCursor:{serial:9,commandIndex:50},lastRecordedRun:{serial:9,batches:4,score:160}}};
 storage.set(PROFILE_KEYS.main,encodeProfile(main));storage.set(PROFILE_KEYS.backup,encodeProfile(backup));
 const result=prepareLegacyMigration(storage);assert.equal(result.status,'ready');if(result.status!=='ready')return;
 const legacy={...result.account.profile.legacyResults,schemaVersion:1 as const,settings:result.account.profile.settings,cosmetics:result.account.profile.cosmetics,tutorialComplete:false,nextRunSerial:result.account.nextRunSerial};
 assert.deepEqual(legacy.resetCursor,{serial:8,commandIndex:99});assert.equal(legacy.lastRecordedRun?.serial,8);
 assert.deepEqual(legacy.outboundV8?.easy?.resetCursor,{serial:9,commandIndex:50});assert.equal(legacy.outboundV8?.easy?.lastRecordedRun?.serial,9);
 assert.deepEqual(legacy.stats,main.stats);
 const old={...createRun(1,'standard',1),runSerial:8,phase:'result' as const,result:'failed' as const,commandIndex:40,completedOrders:3,score:300};
 assert.deepEqual(recordResult(legacy,old).stats,main.stats);
});

test('an older ignored reset backup cannot make a counted continuation count twice',()=>{
 const storage=new FaultStorage(),main=createProfile();main.nextRunSerial=10;main.resetCursor={serial:8,commandIndex:99};main.lastRecordedRun={serial:8,orders:8,score:900};main.stats={runs:1,orders:1,wins:0,maxChain:0};
 const backup=structuredClone(main);backup.lastRecordedRun={serial:8,orders:7,score:800,ignored:true};backup.stats={runs:0,orders:0,wins:0,maxChain:0};
 storage.set(PROFILE_KEYS.main,encodeProfile(main));storage.set(PROFILE_KEYS.backup,encodeProfile(backup));const migration=prepareLegacyMigration(storage);assert.equal(migration.status,'ready');if(migration.status!=='ready')return;
 const legacy={...migration.account.profile.legacyResults,schemaVersion:1 as const,settings:main.settings,cosmetics:main.cosmetics,tutorialComplete:false,nextRunSerial:migration.account.nextRunSerial};
 assert.equal(legacy.lastRecordedRun?.ignored,undefined);
 const same={...createRun(1,'standard',1),runSerial:8,phase:'result' as const,result:'failed' as const,commandIndex:100,completedOrders:8,score:900};
 assert.deepEqual(recordResult(legacy,same).stats,recordResult(main,same).stats);assert.equal(recordResult(legacy,same).stats.runs,1);
});
