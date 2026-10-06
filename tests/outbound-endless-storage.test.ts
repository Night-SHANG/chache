import test from 'node:test';
import assert from 'node:assert/strict';
import * as saves from '../src/application/save.ts';
import * as profiles from '../src/application/profile.ts';
import { createRun, applyCommand, findLegalMoves } from '../src/domain/engine.ts';
import type { RunState } from '../src/domain/types.ts';

const difficulties=['easy','normal','hard','expert'] as const;
const oldSlots=['orders','color_exit','color_exit_entry','color_exit_middle','color_exit_late'] as const;
function storage(){const data=new Map<string,string>();return {data,get:(key:string)=>data.get(key)??null,set:(key:string,value:string)=>{data.set(key,value);},remove:(key:string)=>{data.delete(key);}};}
function outbound(difficulty:typeof difficulties[number]='easy',serial=1,terminal=false):RunState {
 const state={...createRun(19,'color_exit',4),rulesetVersion:6,runConfigId:`run.outbound9_v6.${difficulty}`,boardSize:9 as const,difficultyId:difficulty,board:Array(81).fill(null),cellTraits:Array(81).fill(null),runSerial:serial};
 return terminal?{...state,phase:'result',result:'failed',endReason:'blocked',completedOrders:4,score:400,maxChain:2}:state;
}
function endless(serial=1,terminal=false):RunState {
 const state={...createRun(19,'standard',3),rulesetVersion:7,runConfigId:'run.endless_v7',mode:'endless',tutorialStep:3,overtime:false,runSerial:serial} as RunState;
 return terminal?{...state,phase:'result',result:'won',endReason:'retired',completedOrders:140000,score:4000,maxChain:4,commands:[{type:'finishEndless'}],commandIndex:1} as RunState:state;
}
function envelope(state:RunState,schemaVersion=state.rulesetVersion):string {const body=JSON.stringify(state);let hash=2166136261;for(let i=0;i<body.length;i++){hash^=body.charCodeAt(i);hash=Math.imul(hash,16777619);}return JSON.stringify({schemaVersion,digest:(hash>>>0).toString(16).padStart(8,'0'),state});}
function originalFields(profile:profiles.Profile){return {stats:profile.stats,bestScores:profile.bestScores,dailyHistory:profile.dailyHistory,achievements:profile.achievements,tutorialComplete:profile.tutorialComplete,lastRecordedRun:profile.lastRecordedRun,colorExit:profile.colorExit,colorComparisons:profile.colorComparisons};}
function allRuns(){return [createRun(19,'standard',3),createRun(19,'color_exit',4),...(['entry','middle','late'] as const).map(tier=>createRun(19,'color_exit',5,tier)),...difficulties.map((difficulty,index)=>outbound(difficulty,index+6)),endless(10)];}

test('ten explicit slot identities retain all five old keys and add independent v6 v7 keys',()=>{
 assert.deepEqual(saves.RUN_SLOTS,[...oldSlots,'outbound_easy','outbound_normal','outbound_hard','outbound_expert','inbound_endless']);
 assert.equal(new Set(saves.RUN_SLOTS.flatMap(slot=>Object.values(saves.saveKeysFor(slot)))).size,30);
 assert.deepEqual(saves.saveKeysFor('orders'),saves.SAVE_KEYS);assert.deepEqual(saves.saveKeysFor('color_exit'),saves.COLOR_EXIT_SAVE_KEYS);
 for(const difficulty of difficulties){const slot=saves.slotForRun(outbound(difficulty));assert.equal(slot,`outbound_${difficulty}`);assert.equal(saves.saveKeysFor(slot).main,`warehouse.outbound9.${difficulty}.run.v6`);}
 assert.equal(saves.slotForRun(endless()),'inbound_endless');assert.equal(saves.saveKeysFor(saves.slotForRun(endless())).main,'warehouse.endless.run.v7');
});
test('v6 and v7 envelopes round trip while every valid old schema remains byte exact',()=>{
 for(const state of [...allRuns(),endless(15,true)]){const raw=saves.encodeRun(state);assert.equal(raw,envelope(state));assert.equal(saves.encodeRun(saves.decodeRun(raw)),raw);}
 for(const version of [1,2]){const state=createRun(11,'standard',version);assert.equal(saves.encodeRun(state),envelope(state));}
});
test('old schemas reject new dimensions and difficulty fields including own undefined fields',()=>{
 for(const state of allRuns().slice(0,5))for(const key of ['boardSize','difficultyId'])for(const value of [undefined,key==='boardSize'?9:'easy']){const changed={...state,[key]:value};assert.throws(()=>saves.encodeRun(changed));assert.throws(()=>saves.slotForRun(changed));if(value!==undefined)assert.throws(()=>saves.decodeRun(envelope(changed)));}
});
test('outbound identity board traits origins and occupancy reject dimension or namespace confusion',()=>{
 const patches:Record<string,unknown>[]=[{rulesetVersion:5},{runConfigId:'run.outbound9_v6.hard'},{difficultyId:'entry'},{difficultyId:undefined},{boardSize:7},{boardSize:undefined},{colorTier:'entry'},{colorTier:undefined},{mode:'standard'},{board:Array(49).fill(null)},{cellTraits:Array(49).fill(null)},{maxOccupancy:82}];
 for(const patch of patches)assert.throws(()=>saves.encodeRun({...outbound(),...patch}));
 const state=outbound();state.maxOccupancy=81;state.commands=[{type:'place',pieceId:'piece.1',origin:{x:8,y:8}}];state.commandIndex=1;assert.deepEqual(saves.decodeRun(saves.encodeRun(state)),state);state.commands[0]={type:'place',pieceId:'piece.1',origin:{x:9,y:8}};assert.throws(()=>saves.encodeRun(state));
});
test('outbound candidate validation accepts connected multishape partitions and rejects old-only or malformed patterns',()=>{
 for(const [shapeId,colors] of [['shape.i4_h',['cargo.food','cargo.food','cargo.chem','cargo.chem']],['shape.p5',['cargo.food','cargo.food','cargo.chem','cargo.chem','cargo.chem']]] as const){const state=outbound();state.candidates[0]={id:'piece.1',shapeId,cargo:colors[0],cellCargos:[...colors]};assert.deepEqual(saves.decodeRun(saves.encodeRun(state)),state);}
 for(const cellCargos of [['cargo.food','cargo.chem','cargo.food','cargo.chem'],['cargo.food','cargo.food','cargo.food','cargo.chem'],['cargo.food','cargo.food','cargo.cold','cargo.cold']]){const state=outbound();state.candidates[0]={id:'piece.1',shapeId:'shape.i4_h',cargo:'cargo.food',cellCargos} as RunState['candidates'][number];assert.throws(()=>saves.encodeRun(state));}
});
test('outbound keeps thirty through thirty-two completion boundaries and exact terminal candidates',()=>{
 for(const completedOrders of [30,31,32]){const state={...outbound(),phase:'result',result:'won',endReason:'completed',completedOrders,shift:5} as RunState;state.candidates.pop();assert.deepEqual(saves.decodeRun(saves.encodeRun(state)),state);state.candidates.push({id:'piece.extra',shapeId:'shape.single',cargo:'cargo.food'});assert.throws(()=>saves.encodeRun(state));}
 for(const patch of [{completedOrders:30},{completedOrders:33},{overtime:true},{challengeDay:'2026-10-06'},{tutorialStep:1},{score:11},{upgrades:['small_parcels']}])assert.throws(()=>saves.encodeRun({...outbound(),...patch}));
});
test('endless accepts large order totals, old traits upgrades and explicit retirement without five-shift completion',()=>{
 const state=endless();state.completedOrders=140000;state.shift=5;state.maxOccupancy=49;state.board[0]='cargo.food';state.cellTraits![0]={kind:'rush',remaining:3,bornAtCommand:0};state.upgrades=['upgrade.small_parcels'];state.commands=[{type:'upgrade',upgradeId:'upgrade.small_parcels'}];state.commandIndex=1;assert.deepEqual(saves.decodeRun(saves.encodeRun(state)),state);
 const retired=endless(3,true);assert.deepEqual(saves.decodeRun(saves.encodeRun(retired)),retired);const blocked={...retired,result:'failed',endReason:'blocked',commands:[],commandIndex:0} as RunState;assert.deepEqual(saves.decodeRun(saves.encodeRun(blocked)),blocked);
});
test('endless rejects daily tutorial overtime v6 identity and mismatched terminal fields',()=>{
 const patches:Record<string,unknown>[]=[{mode:'standard'},{mode:'daily'},{rulesetVersion:3},{runConfigId:'run.standard_v3'},{boardSize:9},{difficultyId:'easy'},{difficultyId:undefined},{colorTier:'entry'},{colorTier:undefined},{board:Array(81).fill(null)},{cellTraits:Array(81).fill(null)},{challengeId:'daily.example'},{challengeDay:'2026-10-06'},{tutorialStep:0},{overtime:true},{maxOccupancy:50},{shift:6}];
 for(const patch of patches)assert.throws(()=>saves.encodeRun({...endless(),...patch}));
 for(const type of ['continueOvertime','finishOvertime'])assert.throws(()=>saves.encodeRun({...endless(),commands:[{type}],commandIndex:1} as RunState));
 for(const patch of [{result:'won',endReason:'completed'},{result:'failed',endReason:'retired'},{result:'won',endReason:'blocked'}])assert.throws(()=>saves.encodeRun({...endless(1,true),...patch} as RunState));
});
test('all ten snapshots save independently and every foreign-slot write is side effect free',()=>{
 const s=storage(),runs=allRuns();for(const run of runs)assert.equal(saves.saveRun(s,run).ok,true);
 for(const run of runs){const slot=saves.slotForRun(run);assert.deepEqual(saves.loadRun(s,slot).state,run);for(const other of saves.RUN_SLOTS.filter(value=>value!==slot)){const before=[...s.data];assert.equal(saves.saveRun(s,run,other).ok,false);assert.deepEqual([...s.data],before);}}
});
test('every new-slot write fault preserves all stable bytes or verifies success',()=>{
 for(const state of allRuns().slice(5))for(let failAt=1;failAt<=20;failAt++){const s=storage();for(const run of allRuns())assert.equal(saves.saveRun(s,run).ok,true);assert.equal(saves.saveRun(s,{...state,score:10}).ok,true);const stable=new Map(s.data),keys=saves.saveKeysFor(saves.slotForRun(state));let count=0;const fault:saves.StoragePort={get:key=>{if(++count===failAt)throw Error('read');return s.get(key);},set:(key,value)=>{if(++count===failAt)throw Error('write');s.set(key,value);},remove:key=>{if(++count===failAt)throw Error('remove');s.remove(key);}};const next={...state,score:20},saved=saves.saveRun(fault,next);if(saved.ok)assert.deepEqual(saves.decodeRun(s.get(keys.main)!),next);else for(const key of [keys.main,keys.backup])assert.equal(s.get(key),stable.get(key));for(const other of saves.RUN_SLOTS.filter(value=>value!==saves.slotForRun(state)))for(const key of Object.values(saves.saveKeysFor(other)))assert.equal(s.get(key),stable.get(key)??null);}
});
test('new profile getters create isolated defaults without changing legacy encoded profiles',()=>{
 const profile=profiles.createProfile(),raw=profiles.encodeProfile(profile);for(const difficulty of difficulties){const a=profiles.getOutboundProfile(profile,difficulty),b=profiles.getOutboundProfile(profile,difficulty);assert.deepEqual(a.stats,{runs:0,batches:0,wins:0,maxChain:0});a.stats.runs=9;assert.equal(b.stats.runs,0);}
 const a=profiles.getEndlessProfile(profile),b=profiles.getEndlessProfile(profile);assert.deepEqual(a.stats,{runs:0,orders:0,score:0,maxChain:0,retirements:0});a.stats.runs=9;assert.equal(b.stats.runs,0);assert.equal(profiles.encodeProfile(profile),raw);assert.equal(profiles.encodeProfile(profiles.decodeProfile(raw)),raw);
});
test('v6 results remain separate per difficulty from every old score and achievement namespace',()=>{
 const original=profiles.createProfile();let profile=original;for(const [index,difficulty] of difficulties.entries()){profile=profiles.recordResult(profile,outbound(difficulty,9-index,true));assert.deepEqual(profiles.getOutboundProfile(profile,difficulty).stats,{runs:1,batches:4,wins:0,maxChain:2});assert.deepEqual(profiles.getOutboundProfile(profile,difficulty).bestScores,{v6:{score:400,chain:2}});assert.deepEqual(originalFields(profile),originalFields(original));}
 assert.equal(profile.nextRunSerial,10);const raw=profiles.encodeProfile(profile);profile=profiles.decodeProfile(raw);for(const [index,difficulty] of difficulties.entries())profile=profiles.recordResult(profile,outbound(difficulty,9-index,true));assert.equal(profiles.encodeProfile(profile),raw);
});
test('endless retirement records score orders and chain without wins or ordinary achievements',()=>{
 const original=profiles.createProfile(),profile=profiles.recordResult(original,endless(7,true)),record=profiles.getEndlessProfile(profile);assert.deepEqual(record.stats,{runs:1,orders:140000,score:4000,maxChain:4,retirements:1});assert.deepEqual(record.bestScores,{v7:{score:4000,chain:4,orders:140000}});assert.deepEqual(originalFields(profile),originalFields(original));assert.equal(profile.nextRunSerial,8);assert.deepEqual(profile.achievements,[]);assert.equal(profiles.recordResult(profile,endless(7,true)),profile);assert.deepEqual(profiles.decodeProfile(profiles.encodeProfile(profile)),profile);
 const failed=profiles.recordResult(profile,{...endless(8,true),result:'failed',endReason:'blocked',commands:[],commandIndex:0});assert.equal(profiles.getEndlessProfile(failed).stats.retirements,1);assert.equal(profiles.getEndlessProfile(failed).stats.runs,2);
});
test('malformed v6 v7 summaries cannot leak into any profile namespace',()=>{
 const original=profiles.createProfile();for(const run of [outbound('easy',1,true),endless(1,true)])for(const patch of [{rulesetVersion:3},{runConfigId:'run.standard_v3'},{mode:'standard'},{colorTier:'entry'},{runSerial:undefined},{boardSize:8},{difficultyId:'bad'},{score:-1},{maxChain:65},{overtime:true},{challengeId:'daily.fake'}])assert.equal(profiles.recordResult(original,{...run,...patch} as RunState),original);
 assert.equal(profiles.recordResult(original,{...endless(1,true),endReason:'completed'}),original);
});
test('profile validation rejects foreign new namespaces score identities and invalid retirement totals',()=>{
 let profile=profiles.recordResult(profiles.createProfile(),outbound('easy',2,true));profile=profiles.recordResult(profile,endless(3,true));
 const edits:Array<(p:profiles.Profile)=>void>=[p=>{(p.outboundDifficulties as Record<string,unknown>).unknown=p.outboundDifficulties!.easy;},p=>{p.outboundDifficulties!.easy!.bestScores={v5:{score:400,chain:2}} as never;},p=>{p.endless!.stats.retirements=2;},p=>{p.endless!.bestScores={v3:{score:400,chain:2}} as never;},p=>{p.endless!.lastRecordedRun!.serial=p.nextRunSerial;},p=>{p.endless!.resetCursor={serial:p.nextRunSerial,commandIndex:0};}];for(const edit of edits){const changed=structuredClone(profile);edit(changed);assert.throws(()=>profiles.encodeProfile(changed));}
});
test('reset discovers all ten slots preserves run bytes and cuts off every previously terminal result',()=>{
 const s=storage(),runs=allRuns().map((run,index)=>run.rulesetVersion===6?outbound(run.difficultyId!,index+1,true):run.rulesetVersion===7?endless(index+1,true):{...run,runSerial:index+1});for(const run of runs)assert.equal(saves.saveRun(s,run).ok,true);let profile=profiles.createProfile();for(const run of runs)profile=profiles.recordResult(profile,run);assert.equal(profiles.saveProfile(s,profile).ok,true);const rawRuns=new Map([...s.data].filter(([key])=>!key.startsWith('warehouse.profile.')));const reset=profiles.resetProfile(s);assert.equal(reset.ok,true);assert.ok(reset.profile);assert.equal(reset.profile.nextRunSerial,11);for(const run of runs.slice(5))assert.equal(profiles.recordResult(reset.profile,run),reset.profile);for(const [key,raw] of rawRuns)assert.equal(s.get(key),raw);assert.equal(profiles.getEndlessProfile(reset.profile).stats.runs,0);for(const difficulty of difficulties)assert.equal(profiles.getOutboundProfile(reset.profile,difficulty).stats.runs,0);
});
test('explicit ten-slot reset snapshots need no run reads and retain cutoff across repeated resets',()=>{
 const s=storage(),runs=allRuns(),snapshots=saves.RUN_SLOTS.map(slot=>({slot,state:runs.find(run=>saves.slotForRun(run)===slot)??null})),runKeys=new Set(saves.RUN_SLOTS.flatMap(slot=>Object.values(saves.saveKeysFor(slot))));const fault={...s,get:(key:string)=>{if(runKeys.has(key))throw Error('no snapshot read');return s.get(key);}};const first=profiles.resetProfile(fault,1,...snapshots);assert.equal(first.ok,true);assert.ok(first.profile);const second=profiles.resetProfile(fault,1,...saves.RUN_SLOTS.map(slot=>({slot,state:null})));assert.equal(second.ok,true);assert.ok(second.profile);for(const difficulty of difficulties)assert.deepEqual(profiles.getOutboundProfile(second.profile,difficulty).resetCursor,profiles.getOutboundProfile(first.profile,difficulty).resetCursor);assert.deepEqual(profiles.getEndlessProfile(second.profile).resetCursor,profiles.getEndlessProfile(first.profile).resetCursor);
});
test('new-slot corrupt or unavailable reads cancel reset before any stable writes',()=>{
 for(const run of allRuns().slice(5))for(const kind of ['corrupt','unavailable']){const s=storage();assert.equal(profiles.saveProfile(s,profiles.createProfile()).ok,true);const key=saves.saveKeysFor(saves.slotForRun(run)).main;if(kind==='corrupt')s.set(key,'bad');const before=[...s.data],fault={...s,get:(name:string)=>{if(kind==='unavailable'&&name===key)throw Error('read denied');return s.get(name);}};assert.equal(profiles.resetProfile(fault).ok,false);assert.deepEqual([...s.data],before);}
});
test('ten-slot reset write faults keep prior stable profile and every active run intact',()=>{
 for(let failAt=1;failAt<=48;failAt++){const s=storage();for(const run of allRuns())assert.equal(saves.saveRun(s,run).ok,true);assert.equal(profiles.saveProfile(s,profiles.recordResult(profiles.createProfile(),endless(11,true))).ok,true);assert.equal(profiles.saveProfile(s,profiles.setProfileSettings(profiles.loadProfile(s).profile,{sound:false})).ok,true);const stable=new Map(s.data);let count=0;const fault:saves.StoragePort={get:key=>{if(++count===failAt)throw Error('read');return s.get(key);},set:(key,value)=>{if(++count===failAt)throw Error('write');s.set(key,value);},remove:key=>{if(++count===failAt)throw Error('remove');s.remove(key);}};const reset=profiles.resetProfile(fault);if(reset.ok)assert.deepEqual(profiles.decodeProfile(s.get(profiles.PROFILE_KEYS.main)!),reset.profile);else for(const key of [profiles.PROFILE_KEYS.main,profiles.PROFILE_KEYS.backup])assert.equal(s.get(key),stable.get(key));for(const [key,raw] of stable)if(!key.startsWith('warehouse.profile.'))assert.equal(s.get(key),raw);}
});


test('real v6 and v7 reducer states round trip after every command in their own slots',()=>{
 let placements=0,upgrades=0,retirements=0;
 const starts=[...difficulties.flatMap(difficulty=>[7,19,101].map(seed=>createRun(seed,'color_exit',6,difficulty))),...[7,19,101].map(seed=>createRun(seed,'endless',7))];
 for(const start of starts){const s=storage();let state=start;for(let turn=0;turn<180;turn++){
  const slot=saves.slotForRun(state),raw=saves.encodeRun(state);assert.equal(saves.encodeRun(saves.decodeRun(raw)),raw);assert.equal(saves.saveRun(s,state).ok,true);assert.deepEqual(saves.loadRun(s,slot).state,state);
  if(state.phase==='result')break;
  if(state.phase==='upgrade'){const result=applyCommand(state,{type:'upgrade',upgradeId:state.upgradeChoices[0]});assert.equal(result.error,undefined);state=result.state;upgrades++;continue;}
  if(state.rulesetVersion===7&&turn>=15){const result=applyCommand(state,{type:'finishEndless'});assert.equal(result.error,undefined);state=result.state;retirements++;continue;}
  const move=findLegalMoves(state)[0];assert.ok(move);const result=applyCommand(state,{type:'place',...move});assert.equal(result.error,undefined);state=result.state;placements++;
 }
 assert.equal(state.phase,'result');}
 assert.ok(placements>100);assert.ok(upgrades>0);assert.ok(retirements>0);
});
test('v6 terminal wins credit only their own difficulty and preserve old score bytes',()=>{
 for(const difficulty of difficulties)for(const completedOrders of [30,31,32]){const state={...outbound(difficulty),phase:'result',result:'won',endReason:'completed',completedOrders,shift:5} as RunState;state.candidates.pop();const original=profiles.createProfile(),next=profiles.recordResult(original,state);assert.equal(profiles.getOutboundProfile(next,difficulty).stats.wins,1);assert.equal(profiles.getOutboundProfile(next,difficulty).stats.batches,completedOrders);assert.deepEqual(originalFields(next),originalFields(original));}
});
test('endless retirement command is terminal and cannot appear in active or failed snapshots',()=>{
 const retired=endless(1,true);for(const patch of [{commands:[],commandIndex:0},{commands:[{type:'finishEndless'},{type:'finishEndless'}],commandIndex:2},{phase:'input',result:null,endReason:null},{result:'failed',endReason:'blocked'}])assert.throws(()=>saves.encodeRun({...retired,...patch} as RunState));
});
