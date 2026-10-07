import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import * as support from '../scripts/cosmetic-stage15-host-support.mjs';
import {createHash} from 'node:crypto';
import {validateResumeStorage} from '../scripts/growth-host-support.mjs';
import {ACCOUNT_KEYS} from '../src/application/account-store.ts';
import {canonicalStringify,accountDigest} from '../src/application/history-store.ts';
import {decodeProfile,PROFILE_KEYS} from '../src/application/profile.ts';
import {accountCosmeticState} from '../src/application/cosmetics.ts';
import {createPlayableRun,type RunSpec} from '../src/domain/playable.ts';
const binding=()=>({commit:'a'.repeat(40),expectedCommit:'a'.repeat(40),sourceSha256:'b'.repeat(64),expectedSourceSha256:'b'.repeat(64),manifestSourceSha256:'b'.repeat(64),gameJsSha256:'c'.repeat(64),expectedGameJsSha256:'c'.repeat(64)});
const spec:RunSpec={family:'inbound',mode:'standard',rulesetVersion:15,seed:2,guided:false,toolCharges:{rotate:0,clear:0,wildcard:0}};
const sha256=(bytes:string)=>createHash('sha256').update(bytes).digest('hex');

test('cosmetic host rejects missing or stale owner source and game bindings',()=>{
 assert.equal(typeof support.verifyCosmeticStage15Binding,'function');
 assert.doesNotThrow(()=>support.verifyCosmeticStage15Binding(binding()));
 for(const key of Object.keys(binding())){assert.throws(()=>support.verifyCosmeticStage15Binding({...binding(),[key]:'f'.repeat(key.toLowerCase().includes('commit')?40:64)}));assert.throws(()=>support.verifyCosmeticStage15Binding({...binding(),[key]:undefined}));}
});
test('funded cosmetic fixtures require explicit provenance and create strict account3 with no invented earnings',()=>{
 assert.equal(typeof support.cosmeticAccountStorage,'function');
 assert.throws(()=>support.cosmeticAccountStorage({wallet:1800}),/FUNDED|label/);
 const storage=support.cosmeticAccountStorage({wallet:1800,label:'FUNDED: 1800 test coins for three paid SKUs'}),account=validateResumeStorage(storage).account!;
 assert.equal(account.formatVersion,3);assert.equal(account.economyVersion,2);assert.equal(account.wallet,1800);assert.equal(account.run,null);assert.equal(account.lastClosedResult,null);assert.deepEqual(account.dailyRewards,{});assert.deepEqual(account.profile.results,{});
 assert.equal(storage.get(ACCOUNT_KEYS.a),storage.get(ACCOUNT_KEYS.b));
});
test('cosmetic fixture validation refuses unowned equipment duplicate and unknown rights',()=>{
 assert.equal(typeof support.cosmeticAccountStorage,'function');
 for(const options of [{cosmetics:{theme:'day',cargo:'wood',forklift:'yellow'} as const},{owned:['cargo.wood','cargo.wood']},{owned:['cargo.unknown']}])assert.throws(()=>support.cosmeticAccountStorage({label:'FUNDED: invalid cosmetic fixture',...options}),/cosmetic|外观|owned|duplicate|unknown/i);
 const storage=support.cosmeticAccountStorage({label:'FUNDED: owned combination',owned:['cargo.wood','forklift.white','theme.harbor'],cosmetics:{cargo:'wood',forklift:'white',theme:'harbor'},outline:true});assert.equal(validateResumeStorage(storage).account!.profile.cargoOutline,true);
});
test('cosmetic resume fixture labels constructed boards and preserves run economics and history',()=>{
 assert.equal(typeof support.cosmeticResumeStorage,'function');
 const state=createPlayableRun(spec);state.board[0]='cargo.food';
 assert.throws(()=>support.cosmeticResumeStorage(spec,[],{constructedState:state}),/CONSTRUCTED|label/);
 const storage=support.cosmeticResumeStorage(spec,[],{constructedState:state,label:'CONSTRUCTED: occupied board for cosmetic native pixel comparison',owned:['cargo.wood'],cosmetics:{cargo:'wood',forklift:'yellow',theme:'day'}}),account=validateResumeStorage(storage).account!;
 assert.equal(account.formatVersion,3);assert.equal(account.run!.identity.economyVersion,2);assert.equal(account.run!.state.board[0],'cargo.food');assert.equal(account.run!.creditedBase,0);assert.equal(account.wallet,0);
});
test('cosmetic host validates account3 before executing exact native bundle bytes',async()=>{
 assert.equal(typeof support.createBoundCosmeticStage15Host,'function');
 const dir=await mkdtemp(join(tmpdir(),'cosmetic-host-'));
 try{const bundlePath=join(dir,'game.js'),bytes='throw Error("intentional native cosmetic probe")';await writeFile(bundlePath,bytes);const hashes={...binding(),gameJsSha256:sha256(bytes),expectedGameJsSha256:sha256(bytes)};
 const valid=support.cosmeticAccountStorage({label:'FUNDED: protocol fixture'}),account=validateResumeStorage(valid).account!;account.profile.cosmetics.cargo='wood';const raw=canonicalStringify({formatVersion:1,generation:account.generation,account,digest:accountDigest(canonicalStringify(account))}),invalid=new Map([[ACCOUNT_KEYS.a,raw],[ACCOUNT_KEYS.b,raw]]);
 await assert.rejects(support.createBoundCosmeticStage15Host(hashes,{bundlePath,storage:invalid}),/fixture|account|外观/i);
 await assert.rejects(support.createBoundCosmeticStage15Host(hashes,{bundlePath,storage:valid}),/intentional native cosmetic probe/);
 await writeFile(bundlePath,'globalThis.unbound=true;');await assert.rejects(support.createBoundCosmeticStage15Host(hashes,{bundlePath,storage:valid}),/game.*hash|bytes/i);
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('legacy red preview fixture earns old unlock by replay and equips through valid profile APIs',()=>{
 assert.equal(typeof support.legacyRedPreviewFixture,'function');
 const fixture=support.legacyRedPreviewFixture(),profile=decodeProfile(fixture.storage.get(PROFILE_KEYS.main)!);
 assert.equal(profile.cosmetics.forklift,'red');assert.equal(profile.cosmetics.cargo,'outline');assert.ok(profile.stats.wins>=1);assert.ok(profile.achievements.includes('five_shifts'));
 assert.equal(fixture.storage.has(ACCOUNT_KEYS.a),false);assert.equal(fixture.storage.has(ACCOUNT_KEYS.b),false);assert.ok(fixture.commands.length>30);assert.match(fixture.provenance,/REPLAY/);
 assert.ok(accountCosmeticState(null,profile).ownedCosmetics.includes('forklift.red'));
});
