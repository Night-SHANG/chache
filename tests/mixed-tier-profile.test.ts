import test from 'node:test';
import assert from 'node:assert/strict';
import * as profiles from '../src/application/profile.ts';
import * as saves from '../src/application/save.ts';
import { createRun } from '../src/domain/engine.ts';
import type { ColorTier, RunState } from '../src/domain/types.ts';

const tiers:ColorTier[]=['entry','middle','late'];
function storage(){const data=new Map<string,string>();return {data,get:(key:string)=>data.get(key)??null,set:(key:string,value:string)=>{data.set(key,value);},remove:(key:string)=>{data.delete(key);}};}
function run(tier:ColorTier='entry',serial=1,terminal=true):RunState {const state:RunState={...createRun(19,'color_exit',4),rulesetVersion:5,runConfigId:`run.color_exit_mix_v5.${tier}`,colorTier:tier,runSerial:serial,commandIndex:4,commands:Array.from({length:4},()=>({type:'place',pieceId:'piece.1',origin:{x:0,y:0}})),completedOrders:4,score:400,lastChain:2,maxChain:2};return terminal?{...state,phase:'result',result:'failed',endReason:'blocked'}:state;}
function oldFields(p:profiles.Profile){return {stats:p.stats,bestScores:p.bestScores,dailyHistory:p.dailyHistory,achievements:p.achievements,tutorialComplete:p.tutorialComplete,lastRecordedRun:p.lastRecordedRun,resetCursor:p.resetCursor,colorExit:p.colorExit};}
function known(runs:RunState[]=[]){return saves.RUN_SLOTS.map(slot=>({slot,state:runs.find(run=>saves.slotForRun(run)===slot)??null}));}
function freeze<T>(value:T):T {if(value&&typeof value==='object'){Object.freeze(value);for(const child of Object.values(value))freeze(child);}return value;}

test('v5 getter returns fresh tier defaults while preserving the original schema one bytes',()=>{
 const original=profiles.createProfile(),raw=profiles.encodeProfile(original);const legacy=profiles.recordResult(original,{...createRun(19,'color_exit',4),runSerial:1,phase:'result',result:'failed',endReason:'blocked',completedOrders:4,score:400,maxChain:2});
 for(const tier of tiers){const a=profiles.getColorExitProfile(legacy,tier),b=profiles.getColorExitProfile(legacy,tier);assert.deepEqual(a.stats,{runs:0,batches:0,wins:0,maxChain:0});a.stats.runs=9;assert.equal(b.stats.runs,0);}assert.equal(profiles.getColorExitProfile(legacy).stats.runs,1);assert.equal('colorComparisons' in legacy,false);assert.equal(profiles.encodeProfile(original),raw);assert.equal(profiles.encodeProfile(profiles.decodeProfile(raw)),raw);
});
test('each v5 result updates only the corresponding frozen tier namespace and shared serial',()=>{
 const original=freeze(profiles.createProfile());let profile=original;
 for(const [index,tier] of tiers.entries()){const prior=freeze(profile);profile=profiles.recordResult(prior,freeze(run(tier,9-index)));assert.deepEqual(profile.colorComparisons?.[tier]?.stats,{runs:1,batches:4,wins:0,maxChain:2});assert.deepEqual(profile.colorComparisons?.[tier]?.bestScores,{v5:{score:400,chain:2}});assert.deepEqual(profile.colorComparisons?.[tier]?.lastRecordedRun,{serial:9-index,batches:4,score:400});assert.deepEqual(oldFields(profile),oldFields(original));for(const previous of tiers.slice(0,index))assert.equal(profile.colorComparisons?.[previous],prior.colorComparisons?.[previous]);assert.equal(profile.nextRunSerial,10);}
 assert.equal('colorComparisons' in original,false);assert.ok(profiles.setProfileCosmetic(profile,'forklift','blue').error);assert.deepEqual(profiles.decodeProfile(profiles.encodeProfile(profile)),profile);
});
test('three tier results arriving out of serial order count once before and after reload',()=>{
 for(const order of [tiers,[...tiers].reverse()]){let profile=profiles.createProfile();for(const tier of order)profile=profiles.recordResult(profile,run(tier,tiers.indexOf(tier)+3));const raw=profiles.encodeProfile(profile);profile=profiles.decodeProfile(raw);for(const tier of [...tiers,...[...tiers].reverse()]){profile=profiles.recordResult(profile,run(tier,tiers.indexOf(tier)+3));}assert.equal(profiles.encodeProfile(profile),raw);for(const tier of tiers)assert.equal(profiles.getColorExitProfile(profile,tier).stats.runs,1);}
});
test('wins allow thirty through thirty-two batches without crediting v4 or order achievements',()=>{
 for(const tier of tiers)for(const count of [30,31,32]){const state={...run(tier),result:'won' as const,endReason:'completed' as const,completedOrders:count,score:1600,maxChain:3};const profile=profiles.recordResult(profiles.createProfile(),state);assert.deepEqual(profiles.getColorExitProfile(profile,tier).stats,{runs:1,batches:count,wins:1,maxChain:3});assert.deepEqual(profile.achievements,[]);assert.equal(profile.colorExit,undefined);assert.equal(profile.stats.runs,0);}
});
test('v5 malformed summary or mismatched identity cannot leak into any profile namespace',()=>{
 const original=profiles.createProfile();const edits:Partial<RunState>[]=[{rulesetVersion:4},{rulesetVersion:3},{mode:'standard'},{runConfigId:'run.color_exit_mix_v5.middle'},{colorTier:undefined},{colorTier:'unknown' as ColorTier},{runSerial:undefined},{score:11},{completedOrders:33},{maxChain:4},{overtime:true},{phase:'input',result:null},{result:'won',endReason:'completed',completedOrders:29}];for(const edit of edits)assert.equal(profiles.recordResult(original,{...run(),...edit}),original);
});
test('profile schema validates only known tier namespaces and v5 best score keys',()=>{
 const profile=profiles.recordResult(profiles.createProfile(),run());assert.ok(profile.colorComparisons?.entry);const edits:Array<(p:profiles.Profile)=>void>=[p=>{(p.colorComparisons as Record<string,unknown>).unknown=p.colorComparisons!.entry;},p=>{p.colorComparisons!.entry!.stats.maxChain=4;},p=>{p.colorComparisons!.entry!.stats.wins=2;},p=>{p.colorComparisons!.entry!.lastRecordedRun!.batches=33;},p=>{p.colorComparisons!.entry!.lastRecordedRun!.serial=p.nextRunSerial;},p=>{p.colorComparisons!.entry!.bestScores={v4:{score:400,chain:2}};},p=>{p.colorComparisons!.entry!.bestScores.v5!.score=11;},p=>{p.colorComparisons!.entry!.resetCursor={serial:p.nextRunSerial,commandIndex:2};},p=>{p.colorExit=p.colorComparisons!.entry;}];for(const edit of edits){const changed=structuredClone(profile);edit(changed);assert.throws(()=>profiles.encodeProfile(changed));}
});
test('reset accepts explicit five slot snapshots including empty states without any run reads',()=>{
 const s=storage(),states=tiers.map((tier,i)=>run(tier,i+1));let profile=profiles.createProfile();for(const state of states)profile=profiles.recordResult(profile,state);assert.equal(profiles.saveProfile(s,profile).ok,true);const allKeys=new Set(saves.RUN_SLOTS.flatMap(slot=>Object.values(saves.saveKeysFor(slot))));const fault={...s,get:(key:string)=>{if(allKeys.has(key))throw Error('explicit snapshot needs no read');return s.get(key);}};const cleared=profiles.resetProfile(fault,1,...known(states));assert.equal(cleared.ok,true);assert.ok(cleared.profile);for(const state of states){const tier=state.colorTier!;assert.deepEqual(profiles.getColorExitProfile(cleared.profile,tier).resetCursor,{serial:state.runSerial,commandIndex:4});assert.equal(profiles.recordResult(cleared.profile,state),cleared.profile);}assert.equal(cleared.profile.nextRunSerial,4);
});
test('reset discovers omitted tier slots and blocks every terminal from resurrecting',()=>{
 const s=storage(),states=tiers.map((tier,i)=>run(tier,9-i));for(const state of states)assert.equal(saves.saveRun(s,state).ok,true);const before=[...s.data];const cleared=profiles.resetProfile(s,1,states[0]);assert.equal(cleared.ok,true);assert.ok(cleared.profile);for(const state of states)assert.equal(profiles.recordResult(cleared.profile,state),cleared.profile);for(const [key,raw] of before)assert.equal(s.get(key),raw);assert.equal(cleared.profile.nextRunSerial,10);
});
test('reset fails closed for every omitted corrupt or unreadable tier and unnumbered terminal',()=>{
 for(const tier of tiers)for(const kind of ['corrupt','unavailable','unnumbered']){const s=storage();assert.equal(profiles.saveProfile(s,profiles.recordResult(profiles.createProfile(),run('entry',4))).ok,true);const key=saves.saveKeysFor(saves.slotForTier(tier)).main;if(kind==='corrupt')s.set(key,'bad run');if(kind==='unnumbered'){const state=run(tier);delete state.runSerial;assert.equal(saves.saveRun(s,state).ok,true);}const before=[...s.data];const fault={...s,get:(name:string)=>{if(kind==='unavailable'&&name===key)throw Error('denied');return s.get(name);}};const cleared=profiles.resetProfile(fault);assert.equal(cleared.ok,false);assert.equal(cleared.profile,undefined);assert.deepEqual([...s.data],before);}
});
test('reset rejects duplicate and mismatched explicit identities before writing',()=>{
 const s=storage();assert.equal(profiles.saveProfile(s,profiles.createProfile()).ok,true);const before=[...s.data];for(const snapshots of [[{slot:'color_exit_entry' as const,state:run('middle')}],[run(),run()],[{slot:'color_exit_entry' as const,state:null},run()]]){assert.equal(profiles.resetProfile(s,1,...snapshots).ok,false);assert.deepEqual([...s.data],before);}
});
test('repeated resets preserve all tier boundaries and later live runs remain independently creditable',()=>{
 const s=storage(),states=tiers.map((tier,i)=>run(tier,9-i,false));const first=profiles.resetProfile(s,1,...known(states));assert.equal(first.ok,true);const second=profiles.resetProfile(s);assert.equal(second.ok,true);assert.ok(second.profile);for(const state of states){const tier=state.colorTier!;assert.deepEqual(profiles.getColorExitProfile(second.profile,tier).resetCursor,profiles.getColorExitProfile(first.profile!,tier).resetCursor);assert.equal(profiles.recordResult(second.profile,{...state,phase:'result',result:'failed',endReason:'blocked'}),second.profile);}let next=second.profile;for(const state of [...states].reverse())next=profiles.recordResult(next,{...state,commandIndex:5,phase:'result',result:'failed',endReason:'blocked'});for(const tier of tiers)assert.equal(profiles.getColorExitProfile(next,tier).stats.runs,1);
});
test('recorded tier cutoff persists through repeated no-snapshot resets',()=>{
 const s=storage();let profile=profiles.createProfile();for(const [i,tier] of tiers.entries())profile=profiles.recordResult(profile,run(tier,i+1));assert.equal(profiles.saveProfile(s,profile).ok,true);assert.equal(profiles.resetProfile(s).ok,true);const second=profiles.resetProfile(s);assert.ok(second.profile);for(const [i,tier] of tiers.entries())assert.equal(profiles.recordResult(second.profile,run(tier,i+1)),second.profile);
});
test('single reset storage faults preserve original namespaces and every run snapshot byte',()=>{
 for(let failAt=1;failAt<=40;failAt++){const s=storage(),states=tiers.map((tier,i)=>run(tier,i+1));let profile=profiles.createProfile();for(const state of states){profile=profiles.recordResult(profile,state);assert.equal(saves.saveRun(s,state).ok,true);}assert.equal(profiles.saveProfile(s,profile).ok,true);assert.equal(profiles.saveProfile(s,profiles.setProfileSettings(profile,{sound:false})).ok,true);const before=new Map(s.data);let calls=0;const fault:saves.StoragePort={get:key=>{if(++calls===failAt)throw Error('read');return s.get(key);},set:(key,value)=>{if(++calls===failAt)throw Error('write');s.set(key,value);},remove:key=>{if(++calls===failAt)throw Error('remove');s.remove(key);}};const cleared=profiles.resetProfile(fault,1,...known(states));if(cleared.ok)assert.deepEqual(profiles.decodeProfile(s.get(profiles.PROFILE_KEYS.main)!),cleared.profile);else for(const key of [profiles.PROFILE_KEYS.main,profiles.PROFILE_KEYS.backup])assert.equal(s.get(key),before.get(key),`fault ${failAt}`);for(const slot of saves.RUN_SLOTS)for(const key of Object.values(saves.saveKeysFor(slot)))assert.equal(s.get(key),before.get(key)??null);}
});

test('one reset covers interleaved terminal results in every legacy and comparison slot',()=>{
 const s=storage();const states:RunState[]=[
  {...createRun(19,'standard',3),runSerial:20,phase:'result',result:'failed',endReason:'blocked'},
  {...createRun(19,'color_exit',4),runSerial:19,phase:'result',result:'failed',endReason:'blocked'},
  ...tiers.map((tier,i)=>run(tier,18-i)),
 ];let profile=profiles.createProfile();
 for(const state of states){profile=profiles.recordResult(profile,state);assert.equal(saves.saveRun(s,state).ok,true);}assert.equal(profile.stats.runs,1);assert.equal(profile.colorExit?.stats.runs,1);assert.equal(profiles.saveProfile(s,profile).ok,true);
 const runBytes=saves.RUN_SLOTS.flatMap(slot=>Object.values(saves.saveKeysFor(slot))).map(key=>[key,s.get(key)] as const);const cleared=profiles.resetProfile(s,1,...known(states));assert.equal(cleared.ok,true);assert.ok(cleared.profile);assert.equal(cleared.profile.nextRunSerial,21);assert.equal(cleared.profile.stats.runs,0);assert.equal(cleared.profile.colorExit?.stats.runs,0);for(const tier of tiers)assert.equal(profiles.getColorExitProfile(cleared.profile,tier).stats.runs,0);
 const again=profiles.resetProfile(s);assert.equal(again.ok,true);assert.ok(again.profile);for(const state of [...states].reverse())assert.equal(profiles.recordResult(again.profile,state),again.profile);for(const [key,raw] of runBytes)assert.equal(s.get(key),raw);
});
