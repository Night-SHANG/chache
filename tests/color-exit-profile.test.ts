import test from 'node:test';
import assert from 'node:assert/strict';
import * as profiles from '../src/application/profile.ts';
import { COLOR_EXIT_SAVE_KEYS, SAVE_KEYS, saveRun } from '../src/application/save.ts';
import type { StoragePort } from '../src/application/save.ts';
import type { RunState } from '../src/domain/types.ts';
import { createRun, applyCommand, findLegalMoves } from '../src/domain/engine.ts';

type ExtendedProfile=profiles.Profile;
const api=profiles,reset=profiles.resetProfile;
function storage(){const data=new Map<string,string>();return {data,get:(key:string)=>data.get(key)??null,set:(key:string,value:string)=>{data.set(key,value);},remove:(key:string)=>{data.delete(key);}};}
function result(serial=1,mode:'standard'|'color_exit'='color_exit',patch:Partial<RunState>={}):RunState {return {...createRun(42,mode,mode==='color_exit'?4:3),runSerial:serial,phase:'result',result:'failed',endReason:'blocked',completedOrders:4,score:400,lastChain:2,maxChain:2,commandIndex:10,...patch};}
function frozen<T>(value:T):T {if(value&&typeof value==='object'){Object.freeze(value);for(const child of Object.values(value))frozen(child);}return value;}
function oldFields(profile:profiles.Profile){return {stats:profile.stats,bestScores:profile.bestScores,dailyHistory:profile.dailyHistory,achievements:profile.achievements,tutorialComplete:profile.tutorialComplete,lastRecordedRun:profile.lastRecordedRun,resetCursor:profile.resetCursor};}

test('missing color namespace reads as fresh empty records without changing legacy profile bytes',()=>{
 const profile=profiles.createProfile(),raw=profiles.encodeProfile(profile);assert.equal(typeof api.getColorExitProfile,'function');const first=api.getColorExitProfile(profile),second=api.getColorExitProfile(profile);
 assert.deepEqual(first,{stats:{runs:0,batches:0,wins:0,maxChain:0},bestScores:{},lastRecordedRun:null});first.stats.batches=40;assert.equal(second.stats.batches,0);assert.equal('colorExit' in profile,false);assert.equal(profiles.encodeProfile(profiles.decodeProfile(raw)),raw);assert.equal(profiles.encodeProfile(profile),raw);
});
test('color result updates only its own stats best and serial checkpoint without achievements',()=>{
 const original=frozen(profiles.createProfile()),run=frozen(result(4));const recorded=profiles.recordResult(original,run) as ExtendedProfile;
 assert.deepEqual(recorded.colorExit?.stats,{runs:1,batches:4,wins:0,maxChain:2});assert.deepEqual(recorded.colorExit?.bestScores,{v4:{score:400,chain:2}});assert.deepEqual(recorded.colorExit?.lastRecordedRun,{serial:4,batches:4,score:400});assert.deepEqual(oldFields(recorded),oldFields(original));assert.equal(recorded.nextRunSerial,5);assert.ok(profiles.setProfileCosmetic(recorded,'forklift','blue').error);assert.equal('colorExit' in original,false);
});
test('color victory counts 30 to 32 batches without unlocking five-shift achievements',()=>{
 const run=result(1,'color_exit',{result:'won',endReason:'completed',completedOrders:32,score:1600,maxChain:3});const profile=profiles.recordResult(profiles.createProfile(),run) as ExtendedProfile;
 assert.deepEqual(profile.colorExit?.stats,{runs:1,batches:32,wins:1,maxChain:3});assert.deepEqual(profile.achievements,[]);assert.deepEqual(profile.bestScores,{});assert.equal(profile.tutorialComplete,false);assert.ok(profiles.setProfileCosmetic(profile,'forklift','red').error);
});
test('interleaved results with opposite serial order are credited exactly once per mode',()=>{
 for(const [first,second] of [[result(9),result(8,'standard')],[result(9,'standard'),result(8)]] as const){let profile=profiles.recordResult(profiles.createProfile(),first);profile=profiles.recordResult(profile,second);assert.equal(profile.stats.runs,1);assert.equal((profile as ExtendedProfile).colorExit?.stats.runs,1);assert.equal(profile.nextRunSerial,10);
 const raw=profiles.encodeProfile(profile);profile=profiles.decodeProfile(raw);for(const run of [first,second,second,first])profile=profiles.recordResult(profile,run);assert.equal(profiles.encodeProfile(profile),raw);}
});
test('color terminal checkpoints ignore duplicate and older runs even after an order result',()=>{
 let profile=profiles.recordResult(profiles.createProfile(),result(4));profile=profiles.recordResult(profile,result(6,'standard'));const before=profiles.encodeProfile(profile);
 for(const run of [result(4),result(3),result(4,'color_exit',{score:900,completedOrders:9})])assert.equal(profiles.encodeProfile(profiles.recordResult(profile,run)),before);
 const next=profiles.recordResult(profile,result(7));assert.equal((next as ExtendedProfile).colorExit?.stats.runs,2);assert.equal(next.stats.runs,1);
});
test('global allocation keeps shared unique serials while color and orders retain independent score identities',()=>{
 let profile=profiles.createProfile();const first=profiles.allocateRun(profile);profile=first.profile;const second=profiles.allocateRun(profile);profile=second.profile;assert.equal(first.serial,1);assert.equal(second.serial,2);
 profile=profiles.recordResult(profile,result(second.serial,'standard'));profile=profiles.recordResult(profile,result(first.serial));assert.equal(profile.nextRunSerial,3);assert.deepEqual(profile.bestScores,{'standard.v3':{score:400,chain:2}});assert.deepEqual((profile as ExtendedProfile).colorExit?.bestScores,{v4:{score:400,chain:2}});
});
test('color result rejects incompatible rules modes configs or malformed terminal summaries',()=>{
 const profile=profiles.createProfile();for(const patch of [{rulesetVersion:3},{mode:'standard' as const},{runConfigId:'run.standard_v3'},{phase:'input' as const,result:null},{completedOrders:33},{result:'won' as const,endReason:'completed' as const,completedOrders:29},{endReason:'retired' as const},{score:11},{maxChain:4},{runSerial:undefined}])assert.equal(profiles.recordResult(profile,result(1,'color_exit',patch)),profile);
});
test('color namespace validates independently and survives the original envelope schema',()=>{
 const profile=profiles.recordResult(profiles.createProfile(),result()) as ExtendedProfile;assert.ok(profile.colorExit);assert.equal(JSON.parse(profiles.encodeProfile(profile)).schemaVersion,1);assert.deepEqual(profiles.decodeProfile(profiles.encodeProfile(profile)),profile);
 const edits:Array<(p:ExtendedProfile)=>void>=[p=>{p.colorExit!.stats.batches=-1;},p=>{p.colorExit!.stats.wins=2;},p=>{p.colorExit!.stats.maxChain=4;},p=>{p.colorExit!.lastRecordedRun!.serial=p.nextRunSerial;},p=>{p.colorExit!.lastRecordedRun!.batches=33;},p=>{p.colorExit!.lastRecordedRun!.score=11;},p=>{p.colorExit!.bestScores.v4!.chain=4;},p=>{p.colorExit!.bestScores.v4!.score=-1;},p=>{(p.colorExit!.bestScores as Record<string,unknown>).v3={score:1,chain:0};},p=>{(p.colorExit as unknown as Record<string,unknown>).extra=true;},p=>{p.colorExit!.resetCursor={serial:p.nextRunSerial,commandIndex:0};}];
 for(const edit of edits){const invalid=structuredClone(profile);edit(invalid);assert.throws(()=>profiles.encodeProfile(invalid));}
});
test('settings and unlocked order cosmetics can be shared without changing either score namespace',()=>{
 let profile=profiles.recordResult(profiles.createProfile(),result(1,'standard'));profile=profiles.recordResult(profile,result(2));const original=frozen(profile);const updated=profiles.setProfileSettings(profiles.setProfileCosmetic(original,'forklift','blue').profile,{sound:false,reducedMotion:true});
 assert.ok((updated as ExtendedProfile).colorExit);assert.deepEqual((updated as ExtendedProfile).colorExit,(original as ExtendedProfile).colorExit);assert.deepEqual(oldFields(updated),oldFields(original));assert.equal(updated.cosmetics.forklift,'blue');assert.equal(updated.settings.sound,false);
});
test('reset clears both stats atomically and preserves all six run slot bytes',()=>{
 const s=storage();let profile=profiles.recordResult(profiles.createProfile(),result(2,'standard'));profile=profiles.recordResult(profile,result(1));profiles.saveProfile(s,profile);const runEntries=Object.values({...Object.fromEntries(Object.entries(SAVE_KEYS).map(([key,value])=>['orders.'+key,value])),...Object.fromEntries(Object.entries(COLOR_EXIT_SAVE_KEYS).map(([key,value])=>['color.'+key,value]))}).map((key,i)=>[key,'untouched-'+i] as const);for(const [key,raw] of runEntries)s.set(key,raw);
 const before=s.get(profiles.PROFILE_KEYS.main);const changed=reset(s,3,result(2,'standard'),result(1));assert.equal(changed.ok,true);assert.ok(changed.profile?.colorExit);assert.equal(changed.profile?.stats.runs,0);assert.equal(changed.profile.colorExit.stats.runs,0);assert.equal(changed.profile.nextRunSerial,3);for(const [key,raw] of runEntries)assert.equal(s.get(key),raw);assert.ok([...s.data].some(([key,raw])=>key.includes('.archive.')&&raw===before));
});
test('reset records independent command cutoffs and prevents both saved terminals from resurrecting',()=>{
 for(const [first,other] of [[result(12),result(9,'standard')],[result(9,'standard'),result(12)]] as const){const s=storage();let profile=profiles.recordResult(profiles.createProfile(),first);profile=profiles.recordResult(profile,other);profiles.saveProfile(s,profile);const cleared=reset(s,1,first,other).profile!;assert.equal(cleared.nextRunSerial,13);assert.deepEqual(cleared.resetCursor,{serial:9,commandIndex:10});assert.deepEqual(cleared.colorExit?.resetCursor,{serial:12,commandIndex:10});const roundtrip=profiles.decodeProfile(profiles.encodeProfile(cleared));
 for(const run of [first,other,first,other])assert.deepEqual(profiles.recordResult(roundtrip,run),roundtrip);}
});
test('reset without active snapshots blocks both recorded mode results and keeps serial high-water mark',()=>{
 const s=storage();let profile=profiles.recordResult(profiles.createProfile(),result(9));profile=profiles.recordResult(profile,result(6,'standard'));profiles.saveProfile(s,profile);const cleared=reset(s).profile!;
 assert.equal(profiles.recordResult(cleared,result(9)),cleared);assert.equal(profiles.recordResult(cleared,result(6,'standard')),cleared);assert.equal(cleared.nextRunSerial,10);assert.equal(api.getColorExitProfile(cleared).stats.runs,0);
});
test('reset while both modes are running lets each later result count regardless of serial order',()=>{
 const s=storage();const orders=result(8,'standard',{phase:'input',result:null,endReason:null,commandIndex:5}),color=result(9,'color_exit',{phase:'input',result:null,endReason:null,commandIndex:4});const cleared=reset(s,1,color,orders).profile!;
 let profile=profiles.recordResult(cleared,{...color,phase:'result',result:'failed',endReason:'blocked',commandIndex:8});profile=profiles.recordResult(profile,{...orders,phase:'result',result:'failed',endReason:'blocked',commandIndex:9});assert.equal(profile.stats.runs,1);assert.equal((profile as ExtendedProfile).colorExit?.stats.runs,1);
 assert.equal(api.getColorExitProfile(cleared).stats.runs,0);assert.equal(cleared.stats.runs,0);
});
test('a higher color reset cursor does not prevent an earlier order run from finishing overtime',()=>{
 const s=storage(),orders=result(7,'standard',{result:'won',endReason:'completed',completedOrders:30,score:3000}),color=result(8);let profile=profiles.recordResult(profiles.createProfile(),orders);profile=profiles.recordResult(profile,color);profiles.saveProfile(s,profile);const cleared=reset(s,1,color,orders).profile!;
 const recorded=profiles.recordResult(cleared,{...orders,overtime:true,commandIndex:11,completedOrders:34,score:3400,endReason:'retired'});assert.equal(recorded.stats.runs,1);assert.equal(recorded.stats.orders,4);assert.equal(recorded.stats.wins,1);assert.equal(api.getColorExitProfile(recorded).stats.runs,0);
});
test('failed reset leaves both previous namespaces and all run snapshots recoverable',()=>{
 for(let failAt=1;failAt<=24;failAt++){const s=storage();let profile=profiles.recordResult(profiles.createProfile(),result(2));profile=profiles.recordResult(profile,result(1,'standard'));profiles.saveProfile(s,profile);profiles.saveProfile(s,profiles.setProfileSettings(profile,{sound:false}));s.set(SAVE_KEYS.main,'orders');s.set(COLOR_EXIT_SAVE_KEYS.main,'color');const main=s.get(profiles.PROFILE_KEYS.main),backup=s.get(profiles.PROFILE_KEYS.backup);let count=0;const fault:StoragePort={get:key=>{if(++count===failAt)throw Error('read');return s.get(key);},set:(key,value)=>{if(++count===failAt)throw Error('write');s.set(key,value);},remove:key=>{if(++count===failAt)throw Error('remove');s.remove(key);}};
 const changed=reset(fault,1,result(1,'standard'),result(2));if(changed.ok){assert.deepEqual(profiles.decodeProfile(s.get(profiles.PROFILE_KEYS.main)!),changed.profile);assert.equal(changed.profile?.colorExit?.stats.runs,0);}else{assert.equal(s.get(profiles.PROFILE_KEYS.main),main);assert.equal(s.get(profiles.PROFILE_KEYS.backup),backup);}assert.equal(s.get(SAVE_KEYS.main),'orders');assert.equal(s.get(COLOR_EXIT_SAVE_KEYS.main),'color');}
});

test('repeated resets retain both prior command boundaries even when no active snapshots are supplied',()=>{
 const s=storage(),color=result(9,'color_exit',{phase:'input',result:null,endReason:null,commandIndex:4}),orders=result(8,'standard',{phase:'input',result:null,endReason:null,commandIndex:5});const first=reset(s,1,color,orders).profile!;const second=reset(s).profile!;
 assert.deepEqual(second.resetCursor,first.resetCursor);assert.deepEqual(second.colorExit?.resetCursor,first.colorExit?.resetCursor);
 for(const run of [{...color,phase:'result' as const,result:'failed' as const,endReason:'blocked' as const},{...orders,phase:'result' as const,result:'failed' as const,endReason:'blocked' as const}])assert.equal(profiles.recordResult(second,run),second);
});

function naturalTerminal(mode:'standard'|'color_exit',serial?:number,version=mode==='color_exit'?4:3):RunState {
 let state=createRun(20,mode,version);if(serial!==undefined)state.runSerial=serial;
 for(let turns=0;state.phase!=='result'&&turns<100;turns++){const command=state.phase==='upgrade'?{type:'upgrade' as const,upgradeId:state.upgradeChoices[0]}:{type:'place' as const,...findLegalMoves(state)[0]};const result=applyCommand(state,command);assert.equal(result.error,undefined);state=result.state;}
 assert.equal(state.phase,'result');return state;
}
test('three-argument reset reads an omitted inactive terminal and blocks it from being credited afterward',()=>{
 for(const mode of ['standard','color_exit'] as const){const s=storage(),active={...createRun(11,mode,mode==='color_exit'?4:3),runSerial:1},inactive=naturalTerminal(mode==='standard'?'color_exit':'standard',2);assert.equal(saveRun(s,active).ok,true);assert.equal(saveRun(s,inactive).ok,true);profiles.saveProfile(s,profiles.createProfile());const beforeRuns=[s.get(SAVE_KEYS.main),s.get(COLOR_EXIT_SAVE_KEYS.main)];
 const cleared=reset(s,1,active);assert.equal(cleared.ok,true);assert.ok(cleared.profile);assert.equal(profiles.recordResult(cleared.profile,inactive),cleared.profile);assert.equal(cleared.profile.nextRunSerial,3);assert.deepEqual([s.get(SAVE_KEYS.main),s.get(COLOR_EXIT_SAVE_KEYS.main)],beforeRuns);}
});
test('reset without run arguments reads both valid terminal slots before clearing the profile',()=>{
 const s=storage(),orders=naturalTerminal('standard',1),color=naturalTerminal('color_exit',2);assert.equal(saveRun(s,orders).ok,true);assert.equal(saveRun(s,color).ok,true);const cleared=reset(s);assert.equal(cleared.ok,true);assert.ok(cleared.profile);
 for(const run of [orders,color])assert.equal(profiles.recordResult(cleared.profile,run),cleared.profile);assert.equal(cleared.profile.nextRunSerial,3);
});
test('reset fails closed when an omitted run slot is unavailable or corrupt',()=>{
 for(const mode of ['standard','color_exit'] as const)for(const kind of ['unavailable','corrupt']){const s=storage(),active={...createRun(11,mode,mode==='color_exit'?4:3),runSerial:1},keys=mode==='standard'?COLOR_EXIT_SAVE_KEYS:SAVE_KEYS;profiles.saveProfile(s,profiles.recordResult(profiles.createProfile(),result(4,'standard')));if(kind==='corrupt')s.set(keys.main,'cannot read old run');const before=[...s.data];
 const fault={...s,get:(key:string)=>{if(kind==='unavailable'&&key===keys.main)throw Error('offline');return s.get(key);}};const cleared=reset(fault,1,active);assert.equal(cleared.ok,false);assert.equal(cleared.profile,undefined);assert.deepEqual([...s.data],before);}
});
test('reset refuses unnumbered terminal snapshots supplied or discovered in storage without assigning identities',()=>{
 const terminal=naturalTerminal('standard',undefined,1),active={...createRun(11,'color_exit',4),runSerial:2};assert.equal(terminal.runSerial,undefined);
 for(const explicit of [false,true]){const s=storage();profiles.saveProfile(s,profiles.createProfile());assert.equal(saveRun(s,terminal).ok,true);const before=[...s.data];const cleared=explicit?reset(s,1,active,terminal):reset(s,1,active);assert.equal(cleared.ok,false);assert.equal(cleared.profile,undefined);assert.deepEqual([...s.data],before);assert.equal(terminal.runSerial,undefined);}
});
test('explicit snapshots for both modes need no further run reads and keep the existing API contract',()=>{
 const s=storage(),orders=result(1,'standard'),color=result(2);profiles.saveProfile(s,profiles.createProfile());const runKeys=new Set([...Object.values(SAVE_KEYS),...Object.values(COLOR_EXIT_SAVE_KEYS)]);const fault={...s,get:(key:string)=>{if(runKeys.has(key))throw Error('run reads are unnecessary');return s.get(key);}};
 const cleared=reset(fault,1,orders,color);assert.equal(cleared.ok,true);assert.ok(cleared.profile);assert.equal(profiles.recordResult(cleared.profile,orders),cleared.profile);assert.equal(profiles.recordResult(cleared.profile,color),cleared.profile);
});
