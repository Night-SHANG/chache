/** Strict fixture and exact-snapshot protocol for the combined cosmetic host. */
import assert from 'node:assert/strict';
import {verifyFinalEconomyBinding,createBoundFinalEconomyHost,finalEconomyFixtureStorage} from './final-economy-host-support.mjs';
import {validateResumeStorage} from './growth-host-support.mjs';
import {ACCOUNT_KEYS,encodeAccount} from '../src/application/account-store.ts';
import {retainAccountCosmetics,assertAccountCosmetics,COSMETIC_CATALOG} from '../src/application/cosmetics.ts';
import {makeAccountFixture} from '../tests/helpers/account-fixtures.ts';
import {createProfile,recordResult,setProfileCosmetic,encodeProfile,PROFILE_KEYS} from '../src/application/profile.ts';
import {playableChecksum} from '../src/domain/playable.ts';
import {simulateRun} from './simulate.mjs';

export const verifyCosmeticStage15Binding=verifyFinalEconomyBinding;
export const createBoundCosmeticStage15Host=createBoundFinalEconomyHost;
function applyAppearance(account,{owned=[],cosmetics,outline}={}){
 assert.equal(new Set(owned).size,owned.length,'Duplicate cosmetic rights in fixture');
 assert.ok(owned.every(key=>COSMETIC_CATALOG.some(item=>item.key===key)),'Unknown cosmetic rights in fixture');
 const next=retainAccountCosmetics(account);
 next.profile.ownedCosmetics=[...new Set([...next.profile.ownedCosmetics,...owned])].sort();
 if(cosmetics)next.profile.cosmetics={...cosmetics};
 if(outline!==undefined)next.profile.cargoOutline=outline;
 assertAccountCosmetics(next.profile);return next;
}
function encodeRoots(storage,account){const raw=encodeAccount(account);storage.set(ACCOUNT_KEYS.a,raw);storage.set(ACCOUNT_KEYS.b,raw);validateResumeStorage(storage);return storage;}
export function cosmeticAccountStorage({wallet=0,label,...appearance}={}){
 assert.match(label??'',/^FUNDED: .+/,'Funded account fixture requires explicit FUNDED provenance label');
 return encodeRoots(new Map(),applyAppearance(makeAccountFixture({formatVersion:2,economyVersion:2,dailyRewards:{},epoch:'cosmetic.host.funded',generation:1,wallet,lastOperation:{operationId:'cosmetic.fixture',expectedGeneration:0,requestDigest:'fixture',committedGeneration:1}}),appearance));
}
export function cosmeticResumeStorage(spec,commands=[],options={}){
 const storage=finalEconomyFixtureStorage(spec,commands,options),account=validateResumeStorage(storage).account;
 return encodeRoots(storage,applyAppearance(account,options));
}
/** A real reducer win earns the legacy right before the old profile API equips it. */
export function legacyRedPreviewFixture(){
 const {state}=simulateRun(1,{rulesetVersion:3,strategy:'route'});assert.equal(state.result,'won');state.runSerial=1;
 let profile=recordResult(createProfile(),state);assert.ok(profile.achievements.includes('five_shifts'));
 for(const [kind,id] of [['theme','night'],['cargo','outline'],['forklift','red']]){const changed=setProfileCosmetic(profile,kind,id);assert.equal(changed.error,undefined);profile=changed.profile;}
 const raw=encodeProfile(profile);return {profile,storage:new Map([[PROFILE_KEYS.main,raw],[PROFILE_KEYS.backup,raw]]),commands:state.commands,finalChecksum:playableChecksum(state),provenance:'REPLAY: production rules3 seed1 route-policy 63-command win; recordResult earns legacy rights, setProfileCosmetic equips night/outline/red; no account or funded wallet'};
}
