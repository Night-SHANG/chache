import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import * as saves from '../src/application/save.ts';
import * as slots from '../src/application/run-slots.ts';
import * as profiles from '../src/application/profile.ts';
import { closeRun, closedSerialFloor, loadPlayableRun, runLifecycleKeysFor } from '../src/application/run-lifecycle.ts';
import { createRun } from '../src/domain/engine.ts';
import { findLegalMovesV6 } from '../src/domain/v6/engine.ts';
import { applyCommandV8, createRunV8 } from '../src/domain/v8/engine.ts';
import type { Command, OutboundDifficulty, RunState } from '../src/domain/types.ts';

const difficulties=['easy','normal','hard','expert'] as const;
const legacySlots=['orders','color_exit','color_exit_entry','color_exit_middle','color_exit_late','outbound_easy','outbound_normal','outbound_hard','outbound_expert','inbound_endless'] as const;
function storage(){const data=new Map<string,string>();return {data,get:(key:string)=>data.get(key)??null,set:(key:string,value:string)=>{data.set(key,value);},remove:(key:string)=>{data.delete(key);}};}
function outbound(difficulty:OutboundDifficulty='easy',serial=1,version:6|8=8,terminal=false):RunState {
 const state={...createRun(19,'color_exit',6,difficulty),rulesetVersion:version,runConfigId:`run.outbound9_v${version}.${difficulty}`,runSerial:serial};
 if(!terminal)return state;
 state.board[76]='cargo.food';
 return {...state,phase:'result',result:'failed',endReason:'blocked',completedOrders:4,score:400,maxChain:2,maxOccupancy:1};
}
function allRuns():RunState[]{return [createRun(19,'standard',3),createRun(19,'color_exit',4),...(['entry','middle','late'] as const).map(tier=>createRun(19,'color_exit',5,tier)),...difficulties.map(difficulty=>outbound(difficulty,1,6)),createRun(19,'endless',7),...difficulties.map(difficulty=>outbound(difficulty))].map((state,index)=>({...state,runSerial:index+1}));}
function envelope(state:RunState,schemaVersion=state.rulesetVersion):string {
 const body=JSON.stringify(state);let hash=2166136261;for(let i=0;i<body.length;i++){hash^=body.charCodeAt(i);hash=Math.imul(hash,16777619);}
 return JSON.stringify({schemaVersion,digest:(hash>>>0).toString(16).padStart(8,'0'),state});
}
function legacyFields(profile:profiles.Profile){const {outboundV8:ignored,nextRunSerial:serial,...legacy}=profile;void ignored;void serial;return legacy;}
function faultAt(s:ReturnType<typeof storage>,failAt:number):saves.StoragePort {
 let count=0;const check=()=>{if(++count===failAt)throw Error('injected storage fault');};
 return {get:key=>{check();return s.get(key);},set:(key,value)=>{check();s.set(key,value);},remove:key=>{check();s.remove(key);}};
}

test('v8 identities add four independent slots while default outbound routing stays v6',()=>{
 assert.deepEqual(slots.RUN_SLOTS,[...legacySlots,'outbound8_easy','outbound8_normal','outbound8_hard','outbound8_expert']);
 assert.equal(new Set(slots.RUN_SLOTS.flatMap(slot=>Object.values(saves.saveKeysFor(slot)))).size,42);
 for(const difficulty of difficulties){
  assert.equal(slots.slotForDifficulty(difficulty),`outbound_${difficulty}`);
  assert.equal(slots.slotForDifficulty(difficulty,6),`outbound_${difficulty}`);
  assert.equal(slots.slotForDifficulty(difficulty,8),`outbound8_${difficulty}`);
  for(const version of [6,8] as const){const slot=slots.slotForRun(outbound(difficulty,1,version));assert.equal(slots.difficultyForSlot(slot),difficulty);assert.equal(slots.outboundRulesForSlot(slot),version);assert.deepEqual(saves.saveKeysFor(slot),{main:`warehouse.outbound9.${difficulty}.run.v${version}`,backup:`warehouse.outbound9.${difficulty}.run.backup.v${version}`,temp:`warehouse.outbound9.${difficulty}.run.temp.v${version}`});}
 }
 assert.equal(slots.outboundRulesForSlot('orders'),undefined);
 assert.equal(slots.outboundRulesForSlot('inbound_endless'),undefined);
 assert.throws(()=>slots.slotForDifficulty('easy',7 as never));
 assert.throws(()=>slots.outboundRulesForSlot('outbound8_missing' as never));
});

test('v8 occupied-entry terminal snapshots round trip despite remaining legal placements',()=>{
 for(const difficulty of difficulties){const s=storage(),state=outbound(difficulty,4,8,true);assert.ok(findLegalMovesV6(state).length>100);const raw=saves.encodeRun(state);assert.equal(raw,envelope(state,8));assert.equal(saves.encodeRun(saves.decodeRun(raw)),raw);assert.equal(saves.saveRun(s,state).ok,true);assert.deepEqual(saves.loadRun(s,slots.slotForDifficulty(difficulty,8)).state,state);assert.equal(saves.loadRun(s,slots.slotForDifficulty(difficulty)).source,'empty');}
});

test('v8 rejects crossed schemas and incomplete outbound identity before storage changes',()=>{
 const patches:Record<string,unknown>[]=[{rulesetVersion:6},{runConfigId:'run.outbound9_v6.easy'},{runConfigId:'run.outbound9_v8.hard'},{difficultyId:'missing'},{difficultyId:undefined},{boardSize:7},{boardSize:undefined},{mode:'standard'},{colorTier:'entry'},{colorTier:undefined}];
 for(const patch of patches){const s=storage(),state={...outbound(),...patch};assert.throws(()=>slots.slotForRun(state));assert.throws(()=>saves.encodeRun(state));assert.equal(saves.saveRun(s,state).ok,false);assert.deepEqual([...s.data],[]);}
 assert.throws(()=>saves.decodeRun(envelope(outbound(),6)));
 assert.throws(()=>saves.decodeRun(envelope(outbound('easy',1,6),8)));
});

test('v8 retains frozen candidate geometry, terminal boundaries, and dimension validation',()=>{
 const valid=outbound();valid.candidates[0]={id:'piece.valid',shapeId:'shape.i4_h',cargo:'cargo.food',cellCargos:['cargo.food','cargo.food','cargo.chem','cargo.chem']};assert.deepEqual(saves.decodeRun(saves.encodeRun(valid)),valid);
 for(const patch of [{board:Array(49).fill(null)},{cellTraits:Array(49).fill(null)},{maxOccupancy:82},{score:11},{overtime:true},{tutorialStep:1},{completedOrders:30},{completedOrders:33},{challengeDay:'2026-10-06'},{upgrades:['upgrade.small_parcels']}])assert.throws(()=>saves.encodeRun({...outbound(),...patch}));
 for(const cellCargos of [['cargo.food','cargo.chem','cargo.food','cargo.chem'],['cargo.food','cargo.food','cargo.food','cargo.chem'],['cargo.food','cargo.food','cargo.cold','cargo.cold']]){const state=outbound();state.candidates[0]={id:'piece.invalid',shapeId:'shape.i4_h',cargo:'cargo.food',cellCargos} as RunState['candidates'][number];assert.throws(()=>saves.encodeRun(state));}
 for(const completedOrders of [30,31,32]){const state={...outbound(),phase:'result',result:'won',endReason:'completed',completedOrders,shift:5} as RunState;state.candidates.pop();assert.deepEqual(saves.decodeRun(saves.encodeRun(state)),state);state.candidates.push({id:'piece.extra',shapeId:'shape.single',cargo:'cargo.food'});assert.throws(()=>saves.encodeRun(state));}
 const edge=outbound();edge.commands=[{type:'place',pieceId:'piece.1',origin:{x:8,y:8}}];edge.commandIndex=1;assert.deepEqual(saves.decodeRun(saves.encodeRun(edge)),edge);edge.commands[0]={type:'place',pieceId:'piece.1',origin:{x:9,y:8}};assert.throws(()=>saves.encodeRun(edge));
});

test('all fourteen saves coexist and foreign-slot writes preserve every byte',()=>{
 const s=storage(),runs=allRuns();for(const state of runs)assert.equal(saves.saveRun(s,state).ok,true);
 for(const state of runs){const slot=slots.slotForRun(state);assert.deepEqual(saves.loadRun(s,slot).state,state);for(const foreign of slots.RUN_SLOTS.filter(other=>other!==slot)){const before=[...s.data];assert.equal(saves.saveRun(s,state,foreign).ok,false);assert.deepEqual([...s.data],before);}}
});

test('every v8 save fault either verifies success or keeps the previous stable bytes',()=>{
 for(const difficulty of difficulties)for(let failAt=1;failAt<=20;failAt++){
  const s=storage();for(const state of allRuns())assert.equal(saves.saveRun(s,state).ok,true);
  const state=outbound(difficulty,21);assert.equal(saves.saveRun(s,{...state,score:10}).ok,true);
  const stable=new Map(s.data),slot=slots.slotForRun(state),keys=saves.saveKeysFor(slot),next={...state,score:20};
  const saved=saves.saveRun(faultAt(s,failAt),next);
  if(saved.ok)assert.deepEqual(saves.decodeRun(s.get(keys.main)!),next);else for(const key of [keys.main,keys.backup])assert.equal(s.get(key),stable.get(key));
  for(const foreign of slots.RUN_SLOTS.filter(other=>other!==slot))for(const key of Object.values(saves.saveKeysFor(foreign)))assert.equal(s.get(key),stable.get(key)??null);
 }
});

test('v8 recovery reads only its own stable copies and archives foreign bytes before replacement',()=>{
 for(const difficulty of difficulties){
  const s=storage(),legacy=outbound(difficulty,1,6),state=outbound(difficulty,2),slot=slots.slotForDifficulty(difficulty,8),keys=saves.saveKeysFor(slot);
  assert.equal(saves.saveRun(s,legacy).ok,true);assert.equal(saves.saveRun(s,state).ok,true);assert.equal(saves.saveRun(s,{...state,score:10}).ok,true);
  s.set(keys.main,'broken-v8-main');s.set(keys.temp,saves.encodeRun({...state,score:20}));const before=new Map(s.data);
  assert.deepEqual(saves.loadRun(s,slot).state,state);assert.equal(saves.loadRun(s,slot).source,'backup');assert.deepEqual(s.data,before);
  s.set(keys.backup,saves.encodeRun(legacy));const foreign=s.get(keys.backup)!;assert.equal(saves.loadRun(s,slot).source,'corrupt');
  assert.equal(saves.preserveCorrupt(s,slot).ok,true);assert.ok([...s.data].some(([key,raw])=>key.startsWith(`${keys.main}.corrupt.`)&&raw==='broken-v8-main'));assert.ok([...s.data].some(([key,raw])=>key.startsWith(`${keys.backup}.corrupt.`)&&raw===foreign));
  assert.equal(saves.loadRun(s,slot).source,'empty');assert.equal(saves.loadRun(s,slots.slotForDifficulty(difficulty)).state?.rulesetVersion,6);assert.equal(s.get(saves.saveKeysFor(slots.slotForDifficulty(difficulty)).main),before.get(saves.saveKeysFor(slots.slotForDifficulty(difficulty)).main));
  assert.equal(saves.saveRun(s,state).ok,true);assert.deepEqual(saves.loadRun(s,slot).state,state);
 }
});

test('real v8 reducer routes round trip every saved command including the early occupied-entry result',()=>{
 const fixtures=JSON.parse(readFileSync(new URL('./fixtures/outbound-v8-golden.json',import.meta.url),'utf8')) as {cases:{seed:number;difficulty:OutboundDifficulty;commands:Command[]}[]};
 const cases=[{seed:17,difficulty:'easy' as const,commands:[{type:'place',pieceId:'piece.1',origin:{x:3,y:7}} as Command]},...fixtures.cases];
 let commands=0;
 for(const [index,fixture] of cases.entries()){
  const s=storage(),slot=slots.slotForDifficulty(fixture.difficulty,8);let state:RunState={...createRunV8(fixture.seed,fixture.difficulty),runSerial:index+1};
  assert.equal(saves.saveRun(s,state).ok,true);
  for(const command of fixture.commands){const result=applyCommandV8(state,command);assert.equal(result.error,undefined);state=result.state;commands++;const raw=saves.encodeRun(state);assert.equal(saves.encodeRun(saves.decodeRun(raw)),raw);assert.equal(saves.saveRun(s,state).ok,true);assert.deepEqual(saves.loadRun(s,slot).state,state);}
  assert.equal(state.phase,'result');assert.equal(state.result,'failed');assert.equal(state.endReason,'blocked');assert.ok(state.board[76]);assert.ok(findLegalMovesV6(state).length>0);
  const resumed=saves.loadRun(s,slot).state!,move=findLegalMovesV6(resumed)[0],attempt=applyCommandV8(resumed,{type:'place',...move});assert.ok(attempt.error);assert.equal(attempt.state,resumed);
  const profile=profiles.recordResult(profiles.createProfile(),resumed);assert.equal(profiles.getOutboundProfile(profile,fixture.difficulty,8).stats.runs,1);assert.equal(profiles.getOutboundProfile(profile,fixture.difficulty).stats.runs,0);assert.deepEqual(profiles.decodeProfile(profiles.encodeProfile(profile)),profile);
 }
 assert.ok(commands>30);
});

test('v1 through v7 snapshots and legacy profile preserve old bytes while new profiles enable music',()=>{
 const hashes=['be7b4e0e4a5abd68939eca5a2dc46a0c1470c9bddd8fca6be3054c53fac1ca81','fbe1ee3f73d068ffbff6a25fff3d8c862ab0f2bc7eaeadcb4fd3b08cd40c99a5','cdba5797c9622a84d5d8072c3deb1791294aed1c3c9fe07a762b147d62c4ffe8','d26fafcf6c32691204a48b4e1e8e9c7be7b9e0f0b12690151a0f9015ac78f789','d59540f4129869b299cb5b0912d6a2adf700e5df2c431734a84f7dd888d2718c','52d3ca50d32689f885afdf28ec264a5eba3c9be83ee30277bdc58de30488da1e','4e1f9ee259ee3a87df79fb1a4c934585d79213c49784815d5f4acc1f36927bee'];
 for(let version=1;version<=7;version++){const state=createRun(19,version===4||version===5||version===6?'color_exit':version===7?'endless':'standard',version,version===5?'entry':version===6?'easy':undefined),raw=saves.encodeRun(state);assert.equal(createHash('sha256').update(raw).digest('hex'),hashes[version-1]);assert.equal(saves.encodeRun(saves.decodeRun(raw)),raw);}
 const raw='{"schemaVersion":1,"digest":"a64291e7","profile":{"schemaVersion":1,"settings":{"sound":true,"reducedMotion":false},"cosmetics":{"theme":"day","forklift":"yellow","cargo":"classic"},"tutorialComplete":false,"stats":{"runs":0,"orders":0,"wins":0,"maxChain":0},"bestScores":{},"dailyHistory":{},"achievements":[],"nextRunSerial":1,"lastRecordedRun":null}}';
 const legacy=profiles.decodeProfile(raw),profile=profiles.createProfile(),canonical=profiles.encodeProfile(profile);
 assert.equal(legacy.settings.music,undefined);assert.equal(profile.settings.music,true);assert.equal(legacy.settings.vibration,undefined);assert.equal(profile.settings.vibration,true);
 assert.deepEqual({...legacy,settings:{...legacy.settings,music:true,vibration:true}},profile);
 assert.equal(profiles.encodeProfile(legacy),raw);
 for(const difficulty of difficulties){const first=profiles.getOutboundProfile(profile,difficulty,8),second=profiles.getOutboundProfile(profile,difficulty,8);assert.deepEqual(first.stats,{runs:0,batches:0,wins:0,maxChain:0});first.stats.runs=9;assert.equal(second.stats.runs,0);}
 assert.equal(profiles.encodeProfile(profile),canonical);assert.equal(profiles.encodeProfile(profiles.decodeProfile(raw)),raw);
 assert.throws(()=>profiles.getOutboundProfile(profile,'easy',7 as never));
});

test('v8 results credit only their own difficulty and version without old achievements or statistics',()=>{
 let profile=profiles.createProfile();for(const difficulty of difficulties)profile=profiles.recordResult(profile,outbound(difficulty,50,6,true));
 const old=legacyFields(profile);
 for(const [index,difficulty] of difficulties.entries()){
  const state=outbound(difficulty,index+10,8,true);profile=profiles.recordResult(profile,state);
  assert.deepEqual(profiles.getOutboundProfile(profile,difficulty,8).stats,{runs:1,batches:4,wins:0,maxChain:2});assert.deepEqual(profiles.getOutboundProfile(profile,difficulty,8).bestScores,{v8:{score:400,chain:2}});assert.deepEqual(profiles.getOutboundProfile(profile,difficulty).bestScores,{v6:{score:400,chain:2}});assert.deepEqual(legacyFields(profile),old);assert.equal(profiles.recordResult(profile,state),profile);
 }
 assert.equal(profile.nextRunSerial,51);const raw=profiles.encodeProfile(profile);assert.equal(profiles.encodeProfile(profiles.decodeProfile(raw)),raw);assert.deepEqual(profile.achievements,[]);
 for(const difficulty of difficulties){const state={...outbound(difficulty,100),phase:'result',result:'won',endReason:'completed',completedOrders:30,shift:5} as RunState;state.candidates.pop();const won=profiles.recordResult(profile,state);assert.equal(profiles.getOutboundProfile(won,difficulty,8).stats.wins,1);assert.deepEqual(legacyFields(won),old);}
});

test('v8 summary validators reject foreign version keys and malformed result identities',()=>{
 const profile=profiles.recordResult(profiles.recordResult(profiles.createProfile(),outbound('easy',1,6,true)),outbound('easy',2,8,true));
 assert.ok(profile.outboundV8?.easy);
 const edits:Array<(p:profiles.Profile)=>void>=[p=>{p.outboundV8!.easy!.bestScores={v6:{score:400,chain:2}};},p=>{p.outboundDifficulties!.easy!.bestScores={v8:{score:400,chain:2}};},p=>{p.outboundV8!.easy!.bestScores={v8:{score:400,chain:2},v6:{score:400,chain:2}};},p=>{(p.outboundV8 as Record<string,unknown>).missing=p.outboundV8!.easy;},p=>{p.outboundV8!.easy!.lastRecordedRun!.serial=p.nextRunSerial;},p=>{p.outboundV8!.easy!.resetCursor={serial:p.nextRunSerial,commandIndex:0};}];
 for(const edit of edits){const changed=structuredClone(profile);edit(changed);assert.throws(()=>profiles.encodeProfile(changed));}
 for(const patch of [{rulesetVersion:3},{runConfigId:'run.outbound9_v6.easy'},{mode:'standard'},{runSerial:undefined},{boardSize:8},{difficultyId:'bad'},{colorTier:undefined},{score:-1},{maxChain:4},{overtime:true},{challengeId:'daily.fake'}])assert.equal(profiles.recordResult(profile,{...outbound('easy',4,8,true),...patch} as RunState),profile);
});

test('reset scans all fourteen slots and retains separate old and v8 terminal cutoffs',()=>{
 const s=storage(),runs=allRuns().map(state=>state.rulesetVersion===6||state.rulesetVersion===8?outbound(state.difficultyId!,state.runSerial,state.rulesetVersion,true):state);
 for(const state of runs)assert.equal(saves.saveRun(s,state).ok,true);
 let profile=profiles.createProfile();for(const state of runs)profile=profiles.recordResult(profile,state);assert.equal(profiles.saveProfile(s,profile).ok,true);
 const stable=new Map(s.data),reset=profiles.resetProfile(s);assert.equal(reset.ok,true);assert.ok(reset.profile);assert.equal(reset.profile.nextRunSerial,15);
 for(const state of runs.filter(state=>state.rulesetVersion===6||state.rulesetVersion===8)){assert.equal(profiles.recordResult(reset.profile,state),reset.profile);assert.equal(profiles.getOutboundProfile(reset.profile,state.difficultyId!,state.rulesetVersion as 6|8).stats.runs,0);}
 for(const [key,raw] of stable)if(!key.startsWith('warehouse.profile.'))assert.equal(s.get(key),raw);
 const second=profiles.resetProfile(s,1,...slots.RUN_SLOTS.map(slot=>({slot,state:null})));assert.equal(second.ok,true);assert.ok(second.profile);
 for(const difficulty of difficulties)for(const version of [6,8] as const){const prior:{serial:number;commandIndex:number}=profiles.getOutboundProfile(reset.profile,difficulty,version).resetCursor!,current:{serial:number;commandIndex:number}=profiles.getOutboundProfile(second.profile,difficulty,version).resetCursor!;assert.equal(current.serial,prior.serial);assert.ok(current.commandIndex>=prior.commandIndex);assert.equal(profiles.recordResult(second.profile,outbound(difficulty,current.serial,version,true)),second.profile);}
});

test('unreadable v8 slots prevent reset writes and reset write faults preserve all run bytes',()=>{
 for(const difficulty of difficulties)for(const unavailable of [false,true]){
  const s=storage();assert.equal(profiles.saveProfile(s,profiles.createProfile()).ok,true);const key=`warehouse.outbound9.${difficulty}.run.v8`;if(!unavailable)s.set(key,'corrupt');
  const before=[...s.data],fault={...s,get:(name:string)=>{if(unavailable&&name===key)throw Error('unavailable');return s.get(name);}};assert.equal(profiles.resetProfile(fault).ok,false);assert.deepEqual([...s.data],before);
 }
 for(let failAt=1;failAt<=55;failAt++){
  const s=storage();for(const state of allRuns())assert.equal(saves.saveRun(s,state).ok,true);
  assert.equal(profiles.saveProfile(s,profiles.recordResult(profiles.createProfile(),outbound('expert',20,8,true))).ok,true);assert.equal(profiles.saveProfile(s,profiles.setProfileSettings(profiles.loadProfile(s).profile,{sound:false})).ok,true);
  const stable=new Map(s.data),reset=profiles.resetProfile(faultAt(s,failAt));if(reset.ok)assert.deepEqual(profiles.decodeProfile(s.get(profiles.PROFILE_KEYS.main)!),reset.profile);else for(const key of [profiles.PROFILE_KEYS.main,profiles.PROFILE_KEYS.backup])assert.equal(s.get(key),stable.get(key));
  for(const [key,raw] of stable)if(!key.startsWith('warehouse.profile.'))assert.equal(s.get(key),raw);
 }
});

test('v8 abandonment markers participate in serial floors without closing legacy runs',()=>{
 const s=storage();for(const state of allRuns())assert.equal(saves.saveRun(s,state).ok,true);
 for(const [index,difficulty] of difficulties.entries()){
  const state=outbound(difficulty,index+80),slot=slots.slotForDifficulty(difficulty,8);assert.equal(saves.saveRun(s,state).ok,true);const raw=s.get(saves.saveKeysFor(slot).main);
  assert.equal(closeRun(s,slot,state).ok,true);assert.equal(loadPlayableRun(s,slot).closed,true);assert.equal(s.get(saves.saveKeysFor(slot).main),raw);assert.equal(loadPlayableRun(s,slots.slotForDifficulty(difficulty)).state?.rulesetVersion,6);assert.equal(closedSerialFloor(s).floor,index+80);
 }
 assert.equal(closedSerialFloor(s).floor,83);
 const keys=runLifecycleKeysFor(slots.slotForDifficulty('easy',8));s.set(keys.main,'corrupt');assert.equal(closedSerialFloor(s).ok,false);
});
