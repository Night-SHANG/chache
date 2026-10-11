import test from 'node:test';
import assert from 'node:assert/strict';

const profileApi=await import('../src/application/profile.ts').catch(()=>null);
test('profile starts with independent local defaults and serial one',()=>{
 assert.ok(profileApi,'Profile implementation must exist');
 assert.deepEqual(profileApi.createProfile(),{schemaVersion:1,settings:{sound:true,reducedMotion:false,music:true,vibration:true},cosmetics:{theme:'day',forklift:'yellow',cargo:'classic'},tutorialComplete:false,stats:{runs:0,orders:0,wins:0,maxChain:0},bestScores:{},dailyHistory:{},achievements:[],nextRunSerial:1,lastRecordedRun:null});
 const first=profileApi.createProfile(),second=profileApi.createProfile();first.settings.sound=false;assert.equal(second.settings.sound,true);
});

import type { Profile } from '../src/application/profile.ts';
import type { RunState } from '../src/domain/types.ts';
import type { StoragePort } from '../src/application/save.ts';
import { SAVE_KEYS, encodeRun } from '../src/application/save.ts';
import { createRun } from '../src/domain/engine.ts';
const p=profileApi!;
function storage(){const data=new Map<string,string>();return {data,get:(key:string)=>data.get(key)??null,set:(key:string,value:string)=>{data.set(key,value);},remove:(key:string)=>{data.delete(key);}};}
function result(serial=1,patch:Partial<RunState>={}):RunState{return {...createRun(42),rulesetVersion:3,runSerial:serial,phase:'result',result:'failed',completedOrders:4,score:400,maxChain:2,...patch};}
function frozen<T>(value:T):T {if(value&&typeof value==='object'){Object.freeze(value);for(const child of Object.values(value))frozen(child);}return value;}
function resign(raw:string){const envelope=JSON.parse(raw);const body=JSON.stringify(envelope.profile);let hash=2166136261;for(let i=0;i<body.length;i++){hash^=body.charCodeAt(i);hash=Math.imul(hash,16777619);}envelope.digest=(hash>>>0).toString(16).padStart(8,'0');return JSON.stringify(envelope);}

test('profile envelope round trips without depending on current gameplay rules',()=>{
 const profile=p.createProfile();assert.deepEqual(p.decodeProfile(p.encodeProfile(profile)),profile);
 const envelope=JSON.parse(p.encodeProfile(profile));envelope.schemaVersion=2;assert.throws(()=>p.decodeProfile(JSON.stringify(envelope)),/版本/);
 envelope.schemaVersion=1;envelope.profile.schemaVersion=2;assert.throws(()=>p.decodeProfile(resign(JSON.stringify(envelope))),/版本/);
});
test('profile digest rejects changed settings',()=>{const envelope=JSON.parse(p.encodeProfile(p.createProfile()));envelope.profile.settings.sound=false;assert.throws(()=>p.decodeProfile(JSON.stringify(envelope)),/校验/);});
test('profile validation rejects invalid counts, serials and locked cosmetics',()=>{
 for(const change of [(v:Profile)=>{v.stats.orders=-1;},(v:Profile)=>{v.nextRunSerial=1.5;},(v:Profile)=>{v.cosmetics.forklift='blue';},(v:Profile)=>{v.lastRecordedRun={serial:5,orders:1,score:2};},(v:Profile)=>{v.achievements=['unknown'];}]){const profile=p.createProfile();change(profile);assert.throws(()=>p.encodeProfile(profile));}
});
test('profile validation bounds payloads before expensive encoding or parsing',()=>{
 assert.throws(()=>p.decodeProfile(' '.repeat(256001)),/大小/);
 const profile=p.createProfile();profile.achievements=Array(5000).fill('first_shipment');assert.throws(()=>p.encodeProfile(profile));
 const envelope=JSON.parse(p.encodeProfile(p.createProfile()));envelope.profile.extra='x'.repeat(100);assert.throws(()=>p.decodeProfile(resign(JSON.stringify(envelope))));
});
test('profile save uses separate keys and preserves previous valid backup',()=>{
 const s=storage();s.set(SAVE_KEYS.main,'run stays');const first=p.createProfile();assert.equal(p.saveProfile(s,first).ok,true);const next=p.setProfileSettings(first,{sound:false});assert.equal(p.saveProfile(s,next).ok,true);
 assert.equal(p.loadProfile(s).source,'main');assert.equal(p.loadProfile(s).profile.settings.sound,false);assert.equal(p.decodeProfile(s.get(p.PROFILE_KEYS.backup)!).settings.sound,true);assert.equal(s.get(p.PROFILE_KEYS.temp),null);assert.equal(s.get(SAVE_KEYS.main),'run stays');
});
test('empty storage returns defaults but never persists implicitly',()=>{const s=storage();assert.equal(p.loadProfile(s).source,'empty');assert.deepEqual(p.loadProfile(s).profile,p.createProfile());assert.equal(s.data.size,0);});
test('profile main corruption can read verified backup without modifying bytes',()=>{
 const s=storage();s.set(p.PROFILE_KEYS.main,'bad main');s.set(p.PROFILE_KEYS.backup,p.encodeProfile(p.createProfile()));const before=[...s.data];assert.equal(p.loadProfile(s).source,'backup');assert.deepEqual([...s.data],before);assert.equal(p.saveProfile(s,p.createProfile()).ok,false);assert.equal(s.get(p.PROFILE_KEYS.main),'bad main');
});
test('both corrupt copies and future schema return defaults with corrupt status',()=>{
 const s=storage();s.set(p.PROFILE_KEYS.main,'{"schemaVersion":99}');s.set(p.PROFILE_KEYS.backup,'bad backup');const before=[...s.data];const loaded=p.loadProfile(s);assert.equal(loaded.source,'corrupt');assert.deepEqual(loaded.profile,p.createProfile());assert.deepEqual([...s.data],before);
});
test('empty-string stored profile is corrupt rather than an absent save',()=>{const s=storage();s.set(p.PROFILE_KEYS.main,'');assert.equal(p.loadProfile(s).source,'corrupt');assert.equal(p.saveProfile(s,p.createProfile()).ok,false);});
test('save archives an invalid backup before replacing it',()=>{
 const s=storage();p.saveProfile(s,p.createProfile());s.set(p.PROFILE_KEYS.backup,'future profile original');assert.equal(p.saveProfile(s,p.createProfile()).ok,true);assert.ok([...s.data.values()].includes('future profile original'));
});
test('profile read denials and write denials never report success',()=>{
 const denied:StoragePort={get:()=>{throw Error('denied');},set:()=>{throw Error('denied');},remove:()=>{throw Error('denied');}};
 assert.equal(p.loadProfile(denied).source,'unavailable');assert.equal(p.saveProfile(denied,p.createProfile()).ok,false);assert.equal(p.recoverProfile(denied).ok,false);assert.equal(p.resetProfile(denied).ok,false);
});
test('temporary readback failure does not change stable profile copies',()=>{
 const s=storage();p.saveProfile(s,p.createProfile());const previous=s.get(p.PROFILE_KEYS.main);const fault={...s,get:(key:string)=>key===p.PROFILE_KEYS.temp?'wrong':s.get(key)};assert.equal(p.saveProfile(fault,p.createProfile()).ok,false);assert.equal(s.get(p.PROFILE_KEYS.main),previous);
});
test('failed final write preserves exact previous main and backup',()=>{
 const s=storage();p.saveProfile(s,p.createProfile());p.saveProfile(s,p.setProfileSettings(p.createProfile(),{sound:false}));const main=s.get(p.PROFILE_KEYS.main),backup=s.get(p.PROFILE_KEYS.backup);
 const fault={...s,set:(key:string,value:string)=>{if(key===p.PROFILE_KEYS.main)throw Error('quota');s.set(key,value);}};
 assert.equal(p.saveProfile(fault,p.createProfile()).ok,false);assert.equal(s.get(p.PROFILE_KEYS.main),main);assert.equal(s.get(p.PROFILE_KEYS.backup),backup);
});
test('failed final readback restores old values rather than claiming a successful save',()=>{
 const s=storage();p.saveProfile(s,p.createProfile());const main=s.get(p.PROFILE_KEYS.main);let writes=0;
 const fault={...s,set:(key:string,value:string)=>{s.set(key,value);if(key===p.PROFILE_KEYS.main)writes++;},get:(key:string)=>key===p.PROFILE_KEYS.main&&writes===1?'bad readback':s.get(key)};
 assert.equal(p.saveProfile(fault,p.setProfileSettings(p.createProfile(),{sound:false})).ok,false);assert.equal(s.get(p.PROFILE_KEYS.main),main);
});
test('abandoned profile temp never supersedes stable main',()=>{const s=storage();p.saveProfile(s,p.createProfile());s.set(p.PROFILE_KEYS.temp,p.encodeProfile(p.setProfileSettings(p.createProfile(),{sound:false})));assert.equal(p.loadProfile(s).profile.settings.sound,true);});
test('explicit recovery archives exact originals before adopting the valid backup',()=>{
 const s=storage();const backup=p.encodeProfile(p.setProfileSettings(p.createProfile(),{sound:false}));s.set(p.PROFILE_KEYS.main,'broken原文');s.set(p.PROFILE_KEYS.backup,backup);assert.equal(p.recoverProfile(s).ok,true);assert.equal(p.loadProfile(s).source,'main');assert.equal(p.loadProfile(s).profile.settings.sound,false);assert.ok([...s.data.values()].includes('broken原文'));assert.ok([...s.data.entries()].some(([key,raw])=>key.includes('.archive.')&&raw===backup));
});
test('explicit recovery of two corrupt copies preserves both and creates valid defaults',()=>{
 const s=storage();s.set(p.PROFILE_KEYS.main,'bad main');s.set(p.PROFILE_KEYS.backup,'bad backup');assert.equal(p.recoverProfile(s).ok,true);assert.deepEqual(p.loadProfile(s).profile,p.createProfile());for(const raw of ['bad main','bad backup'])assert.ok([...s.data.values()].includes(raw));
});
test('confirmed reset archives old values and leaves active Run keys untouched',()=>{
 const s=storage();const profile=p.recordResult(p.createProfile(),result());p.saveProfile(s,profile);const active=encodeRun({...createRun(99,'standard',3),runSerial:2}),backup=encodeRun({...createRun(98,'standard',3),runSerial:1});s.set(SAVE_KEYS.main,active);s.set(SAVE_KEYS.backup,backup);const original=s.get(p.PROFILE_KEYS.main);const reset=p.resetProfile(s,40);
 assert.equal(reset.ok,true);assert.equal(reset.profile?.nextRunSerial,40);assert.equal(reset.profile?.stats.runs,0);assert.equal(s.get(SAVE_KEYS.main),active);assert.equal(s.get(SAVE_KEYS.backup),backup);assert.ok([...s.data.entries()].some(([key,raw])=>key.includes('.archive.')&&raw===original));
});
test('reset preserves local serial high-water mark even when minimum is omitted',()=>{const s=storage();let profile=p.createProfile();profile=p.allocateRun(profile,90).profile;p.saveProfile(s,profile);assert.equal(p.resetProfile(s).profile?.nextRunSerial,91);});
test('archive write failure cancels recovery and reset without changing old stable bytes',()=>{
 for(const action of [p.recoverProfile,p.resetProfile]){const s=storage();s.set(p.PROFILE_KEYS.main,'broken');s.set(p.PROFILE_KEYS.backup,'also broken');const fault={...s,set:(key:string,value:string)=>{if(key.includes('.archive.'))throw Error('quota');s.set(key,value);}};assert.equal(action(fault).ok,false);assert.equal(s.get(p.PROFILE_KEYS.main),'broken');assert.equal(s.get(p.PROFILE_KEYS.backup),'also broken');}
});
test('failed reset final write returns no profile and retains the original profile',()=>{
 const s=storage();p.saveProfile(s,p.setProfileSettings(p.createProfile(),{sound:false}));const original=s.get(p.PROFILE_KEYS.main);const fault={...s,set:(key:string,value:string)=>{if(key===p.PROFILE_KEYS.main)throw Error('quota');s.set(key,value);}};const reset=p.resetProfile(fault);assert.equal(reset.ok,false);assert.equal(reset.profile,undefined);assert.equal(s.get(p.PROFILE_KEYS.main),original);
});
test('allocation respects serial floor without mutation and rejects exhausted counters',()=>{
 const profile=frozen(p.createProfile());const first=p.allocateRun(profile,10),second=p.allocateRun(first.profile,4);assert.equal(first.serial,10);assert.equal(second.serial,11);assert.equal(second.profile.nextRunSerial,12);assert.equal(profile.nextRunSerial,1);assert.throws(()=>p.allocateRun(profile,-1));assert.throws(()=>p.allocateRun(profile,Number.MAX_SAFE_INTEGER));
});
test('nonterminal and unnumbered runs do not change the profile',()=>{const profile=p.createProfile();for(const patch of [{phase:'input' as const,result:null},{runSerial:undefined},{runSerial:-1},{runSerial:1.5},{completedOrders:-1},{score:NaN}])assert.equal(p.recordResult(profile,result(1,patch)),profile);});
test('formal results count exactly once and stale serials cannot reopen old results',()=>{
 const original=frozen(p.createProfile()),run=frozen(result(2));const first=p.recordResult(original,run);assert.deepEqual(first.stats,{runs:1,orders:4,wins:0,maxChain:2});assert.equal(first.nextRunSerial,3);assert.deepEqual(first.bestScores['standard.v3'],{score:400,chain:2});assert.deepEqual(p.recordResult(first,run),first);assert.equal(p.recordResult(first,result(1,{score:900,completedOrders:50})),first);assert.equal(original.stats.runs,0);
});
test('standard victory and overtime retirement increment only additional orders and separate best scores',()=>{
 const won=result(1,{result:'won',completedOrders:30,score:3000,maxChain:3});const first=p.recordResult(p.createProfile(),won);const overtime=result(1,{overtime:true,result:'won',endReason:'retired',completedOrders:45,score:4500,maxChain:4});const second=p.recordResult(first,overtime);
 assert.deepEqual(second.stats,{runs:1,orders:45,wins:1,maxChain:4});assert.deepEqual(second.bestScores['standard.v3'],{score:3000,chain:3});assert.deepEqual(second.bestScores['overtime.v3'],{score:4500,chain:4});assert.deepEqual(p.recordResult(second,won),second);assert.deepEqual(p.recordResult(second,overtime),second);
});
test('first observed overtime loss still represents one completed five-shift run',()=>{const profile=p.recordResult(p.createProfile(),result(7,{overtime:true,result:'failed',completedOrders:31}));assert.equal(profile.stats.wins,1);assert.ok(profile.achievements.includes('five_shifts'));});
test('tutorial completion does not create formal statistics, bests or achievements',()=>{
 const profile=p.recordResult(p.createProfile(),result(1,{mode:'tutorial',result:'won',completedOrders:3,maxChain:3}));assert.equal(profile.tutorialComplete,true);assert.deepEqual(profile.stats,p.createProfile().stats);assert.deepEqual(profile.bestScores,{});assert.deepEqual(profile.dailyHistory,{});assert.deepEqual(profile.achievements,[]);assert.deepEqual(p.recordResult(profile,result(1,{mode:'tutorial',result:'won'})),profile);
});
test('four achievements and pure cosmetic unlocks use explicit progress thresholds',()=>{
 let profile=p.recordResult(p.createProfile(),result(1,{result:'won',completedOrders:30,maxChain:3}));assert.ok(profile.achievements.includes('first_shipment'));assert.ok(profile.achievements.includes('chain_3'));assert.ok(profile.achievements.includes('five_shifts'));assert.ok(!profile.achievements.includes('ship_100'));
 profile=p.recordResult(profile,result(2,{completedOrders:70}));assert.ok(profile.achievements.includes('ship_100'));assert.equal(p.setProfileCosmetic(profile,'forklift','blue').error,undefined);assert.equal(p.setProfileCosmetic(profile,'forklift','red').error,undefined);assert.equal(p.ACHIEVEMENTS.length,4);
});
test('cosmetics reject unknown and locked ids while default themes and cargo styles are selectable',()=>{
 const profile=frozen(p.createProfile());for(const [kind,id] of [['forklift','blue'],['forklift','red'],['theme','neon'],['unknown','day']]){const changed=p.setProfileCosmetic(profile,kind,id);assert.ok(changed.error);assert.equal(changed.profile,profile);}
 assert.equal(p.setProfileCosmetic(profile,'theme','night').profile.cosmetics.theme,'night');assert.equal(p.setProfileCosmetic(profile,'cargo','outline').profile.cosmetics.cargo,'outline');assert.equal(p.THEMES.length,2);assert.equal(p.FORKLIFTS.length,3);assert.equal(p.CARGO_STYLES.length,2);
});
test('settings patch validates booleans and leaves all other data unchanged',()=>{
 const profile=frozen(p.createProfile()),next=p.setProfileSettings(profile,{sound:false,reducedMotion:true});assert.deepEqual(next.settings,{sound:false,reducedMotion:true,music:true,vibration:true});assert.deepEqual({...next,settings:profile.settings},profile);assert.throws(()=>p.setProfileSettings(profile,{sound:'false'} as unknown as Partial<Profile['settings']>));
});
test('daily challenge uses client UTC+08 midnight and includes rules version in identity and seed',()=>{
 const before=p.localDailyChallenge(Date.parse('2026-10-05T15:59:59.999Z'),3),after=p.localDailyChallenge(Date.parse('2026-10-05T16:00:00.000Z'),3);
 assert.equal(before.day,'2026-10-05');assert.equal(after.day,'2026-10-06');assert.equal(before.id,'daily.2026-10-05.v3');assert.equal(before.timeZone,'Asia/Shanghai');assert.equal(before.localOnly,true);assert.notEqual(before.seed,after.seed);assert.deepEqual(before,p.localDailyChallenge(Date.parse('2026-10-04T16:00:00Z'),3));assert.notEqual(before.seed,p.localDailyChallenge(Date.parse('2026-10-05T00:00:00Z'),2).seed);assert.throws(()=>p.localDailyChallenge(NaN,3));assert.throws(()=>p.localDailyChallenge(0,0));
});
function daily(serial:number,epochMs:number,version=3):RunState {const challenge=p.localDailyChallenge(epochMs,version);return result(serial,{mode:'daily',rulesetVersion:version,seed:challenge.seed,challengeId:challenge.id,challengeDay:challenge.day});}
test('daily records stay grouped by original challenge day and rules, separate from standard scores',()=>{
 const old=daily(1,Date.parse('2026-10-01T00:00:00Z'));let profile=p.recordResult(p.createProfile(),old);assert.equal(profile.dailyHistory[old.challengeId!].day,'2026-10-01');assert.deepEqual(profile.bestScores,{});profile=p.recordResult(profile,daily(2,Date.parse('2026-10-01T00:00:00Z'),2));assert.equal(Object.keys(profile.dailyHistory).length,2);assert.equal(profile.dailyHistory[old.challengeId!].seed,old.seed);
});
test('daily challenge best score does not regress across retries and merges successful completion',()=>{
 const first=daily(1,Date.parse('2026-10-01T00:00:00Z'));let profile=p.recordResult(p.createProfile(),{...first,score:1000,completedOrders:10});profile=p.recordResult(profile,{...first,runSerial:2,result:'won',score:500,completedOrders:30});const history=profile.dailyHistory[first.challengeId!];assert.equal(history.score,1000);assert.equal(history.orders,30);assert.equal(history.won,true);
});
test('daily history retains recent sixty distinct dates with a bounded total across rulesets',()=>{
 let profile=p.createProfile();for(let i=0;i<65;i++)profile=p.recordResult(profile,daily(i+1,Date.parse('2026-01-01T00:00:00Z')+i*86400000));assert.equal(Object.keys(profile.dailyHistory).length,60);assert.equal(profile.dailyHistory['daily.2026-01-01.v3'],undefined);assert.ok(profile.dailyHistory['daily.2026-03-06.v3']);assert.deepEqual(p.decodeProfile(p.encodeProfile(profile)),profile);
});
test('malformed challenge metadata cannot forge a daily history record',()=>{const run=daily(1,Date.parse('2026-10-01T00:00:00Z'));for(const patch of [{challengeId:'__proto__'},{challengeDay:'2026-99-99'},{seed:0}])assert.deepEqual(p.recordResult(p.createProfile(),{...run,...patch}).dailyHistory,{});});
test('profile reducers and date functions do not mutate gameplay RNG or commands',()=>{
 const run=frozen(result()),before=JSON.stringify(run);let profile=p.recordResult(p.createProfile(),run);profile=p.setProfileCosmetic(profile,'forklift','blue').profile;profile=p.setProfileSettings(profile,{sound:false});p.allocateRun(profile);p.localDailyChallenge(0,3);assert.equal(JSON.stringify(run),before);
});

test('every single storage failure during reset preserves original stable bytes or reports verified success',()=>{
 for(let failAt=1;failAt<=24;failAt++){
  const s=storage();const first=p.createProfile(),second=p.setProfileSettings(first,{sound:false});p.saveProfile(s,first);p.saveProfile(s,second);const main=s.get(p.PROFILE_KEYS.main),backup=s.get(p.PROFILE_KEYS.backup);let operations=0;
  const fault:StoragePort={get:key=>{if(++operations===failAt)throw Error('read fault');return s.get(key);},set:(key,value)=>{if(++operations===failAt)throw Error('write fault');s.set(key,value);},remove:key=>{if(++operations===failAt)throw Error('remove fault');s.remove(key);}};
  const reset=p.resetProfile(fault);if(reset.ok){assert.deepEqual(p.decodeProfile(s.get(p.PROFILE_KEYS.main)!),reset.profile);}else{assert.equal(s.get(p.PROFILE_KEYS.main),main,`failure ${failAt} changed main`);assert.equal(s.get(p.PROFILE_KEYS.backup),backup,`failure ${failAt} changed backup`);}
 }
});
test('corrupt-byte archive collision is fail closed without erasing the existing archive',()=>{
 const s=storage();s.set(p.PROFILE_KEYS.main,'bad');let archiveKey='';const fault={...s,get:(key:string)=>{if(key.includes('.archive.')){archiveKey=key;return 'different original';}return s.get(key);}};
 assert.equal(p.recoverProfile(fault).ok,false);assert.equal(s.get(p.PROFILE_KEYS.main),'bad');assert.equal(s.get(archiveKey),null);
});
test('daily version groups remain independently bounded on one day',()=>{
 let profile=p.createProfile();for(let version=1;version<=250;version++)profile=p.recordResult(profile,daily(version,Date.parse('2026-10-05T00:00:00Z'),version));assert.equal(Object.keys(profile.dailyHistory).length,240);assert.ok(profile.dailyHistory['daily.2026-10-05.v250']);assert.equal(profile.dailyHistory['daily.2026-10-05.v1'],undefined);assert.deepEqual(p.decodeProfile(p.encodeProfile(profile)),profile);
});
test('record counters remain saveable at numeric limits',()=>{
 const profile=p.createProfile();profile.stats={runs:Number.MAX_SAFE_INTEGER,orders:Number.MAX_SAFE_INTEGER,wins:Number.MAX_SAFE_INTEGER,maxChain:64};const recorded=p.recordResult(profile,result(1,{result:'won'}));assert.equal(recorded.stats.runs,Number.MAX_SAFE_INTEGER);assert.equal(recorded.stats.orders,Number.MAX_SAFE_INTEGER);assert.equal(recorded.stats.wins,Number.MAX_SAFE_INTEGER);assert.deepEqual(p.decodeProfile(p.encodeProfile(recorded)),recorded);
});
test('unknown settings properties and forged daily entries are rejected',()=>{
 assert.throws(()=>p.setProfileSettings(p.createProfile(),{unknown:true} as unknown as Partial<Profile['settings']>));
 const run=daily(1,Date.parse('2026-10-05T00:00:00Z'));const profile=p.recordResult(p.createProfile(),run);profile.dailyHistory[run.challengeId!].seed=0;assert.throws(()=>p.encodeProfile(profile),/标识/);
});
