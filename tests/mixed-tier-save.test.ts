import test from 'node:test';
import assert from 'node:assert/strict';
import * as saves from '../src/application/save.ts';
import { createRun, applyCommand, findLegalMoves } from '../src/domain/engine.ts';
import type { CargoId, ColorTier, RunState } from '../src/domain/types.ts';

const tiers:ColorTier[]=['entry','middle','late'];
function storage(){const data=new Map<string,string>();return {data,get:(key:string)=>data.get(key)??null,set:(key:string,value:string)=>{data.set(key,value);},remove:(key:string)=>{data.delete(key);}};}
function run(tier:ColorTier='entry'):RunState{return {...createRun(19,'color_exit',4),rulesetVersion:5,runConfigId:`run.color_exit_mix_v5.${tier}`,colorTier:tier,candidates:[{id:'piece.1',shapeId:'shape.square',cargo:'cargo.food',cellCargos:['cargo.food','cargo.food','cargo.chem','cargo.chem']},{id:'piece.2',shapeId:'shape.single',cargo:'cargo.machine'},{id:'piece.3',shapeId:'shape.domino_h',cargo:'cargo.chem'}]};}
function envelope(state:RunState,schemaVersion=5):string {const body=JSON.stringify(state);let hash=2166136261;for(let i=0;i<body.length;i++){hash^=body.charCodeAt(i);hash=Math.imul(hash,16777619);}return JSON.stringify({schemaVersion,digest:(hash>>>0).toString(16).padStart(8,'0'),state});}

test('fourteen slots preserve unique legacy keys and strict run tier identities',()=>{
 assert.deepEqual(saves.RUN_SLOTS,['orders','color_exit','color_exit_entry','color_exit_middle','color_exit_late','outbound_easy','outbound_normal','outbound_hard','outbound_expert','inbound_endless','outbound8_easy','outbound8_normal','outbound8_hard','outbound8_expert']);
 const keys=saves.RUN_SLOTS.flatMap(slot=>Object.values(saves.saveKeysFor(slot)));assert.equal(new Set(keys).size,42);
 for(const tier of tiers){const slot=saves.slotForTier(tier);assert.equal(slot,`color_exit_${tier}`);assert.equal(saves.tierForSlot(slot),tier);assert.equal(saves.slotForRun(run(tier)),slot);assert.equal(saves.saveKeysFor(slot).main,`warehouse.color_exit.${tier}.run.v5`);assert.equal(saves.isRunSlot(slot),true);}
 assert.equal(saves.slotForRun(createRun(19,'color_exit',4)),'color_exit');assert.equal(saves.slotForRun(createRun(19,'standard',3)),'orders');assert.equal(saves.tierForSlot('orders'),undefined);assert.equal(saves.tierForSlot('color_exit'),undefined);assert.equal(saves.isRunSlot('color_exit_unknown'),false);
 assert.throws(()=>saves.slotForTier('unknown' as ColorTier));assert.throws(()=>saves.slotForRun({...run(),colorTier:undefined}));assert.throws(()=>saves.slotForRun({...run(),runConfigId:'run.color_exit_mix_v5.middle'}));
});
test('schema five round trips all tiers and keeps original four schemas byte exact',()=>{
 for(const tier of tiers){const state=run(tier),raw=saves.encodeRun(state);assert.equal(JSON.parse(raw).schemaVersion,5);assert.deepEqual(saves.decodeRun(raw),state);assert.equal(saves.encodeRun(saves.decodeRun(raw)),raw);}
 for(const version of [1,2,3,4]){const state=createRun(19,version===4?'color_exit':'standard',version),raw=envelope(state,version);assert.equal(saves.encodeRun(state),raw);assert.equal(saves.encodeRun(saves.decodeRun(raw)),raw);}
});
test('v5 accepts precisely twelve square band patterns and absent pure cell cargo',()=>{
 const cargo:CargoId[]=['cargo.food','cargo.machine','cargo.chem'];let count=0;
 for(const a of cargo)for(const b of cargo)if(a!==b)for(const cells of [[a,a,b,b],[a,b,a,b]]){const state=run();state.candidates[0]={id:'piece.1',shapeId:'shape.square',cargo:a,cellCargos:cells};assert.deepEqual(saves.decodeRun(saves.encodeRun(state)),state);count++;}
 assert.equal(count,12);const pure=run();delete pure.candidates[0].cellCargos;assert.deepEqual(saves.decodeRun(saves.encodeRun(pure)),pure);
});
test('v5 rejects mixed piece malformed lengths stripes primaries cargos shapes or traits',()=>{
 const edits:Array<(s:RunState)=>void>=[s=>{s.candidates[0].cellCargos=[];},s=>{s.candidates[0].cellCargos!.pop();},s=>{s.candidates[0].cellCargos!.push('cargo.food');},s=>{s.candidates[0].cellCargos=['cargo.food','cargo.chem','cargo.chem','cargo.food'];},s=>{s.candidates[0].cellCargos=['cargo.food','cargo.food','cargo.food','cargo.chem'];},s=>{s.candidates[0].cellCargos=['cargo.food','cargo.chem','cargo.machine','cargo.machine'];},s=>{s.candidates[0].cellCargos=Array(4).fill('cargo.food');},s=>{s.candidates[0].cellCargos=['cargo.food','cargo.food','cargo.cold','cargo.cold'];},s=>{s.candidates[0].cargo='cargo.chem';},s=>{s.candidates[0].shapeId='shape.i4_h';},s=>{s.candidates[0].trait='pallet';},s=>{s.candidates[0].rushTurns=2;}];
 for(const edit of edits){const state=run();edit(state);assert.throws(()=>saves.encodeRun(state),/候选/);assert.throws(()=>saves.decodeRun(envelope(state)),/候选/);}
});
test('v1 through v4 reject reserved per-cell cargo and tier fields without changing valid old bytes',()=>{
 for(const version of [1,2,3,4])for(const field of ['cellCargos','colorTier'])for(const present of [true,false]){const state=createRun(19,version===4?'color_exit':'standard',version);if(field==='cellCargos')state.candidates[0].cellCargos=present?[state.candidates[0].cargo]:undefined;else state.colorTier=present?'entry':undefined;assert.throws(()=>saves.encodeRun(state));if(present)assert.throws(()=>saves.decodeRun(envelope(state,version)));}
});
test('v5 mode version config tier and envelope must all agree',()=>{
 const edits:Array<(s:RunState)=>void>=[s=>{delete s.colorTier;},s=>{s.colorTier='unknown' as ColorTier;},s=>{s.runConfigId='run.color_exit_mix_v5.middle';},s=>{s.runConfigId='run.color_exit_p0_v4';},s=>{s.mode='standard';},s=>{s.rulesetVersion=4;},s=>{s.rulesetVersion=3;}];
 for(const edit of edits){const state=run();edit(state);assert.throws(()=>saves.encodeRun(state));assert.throws(()=>saves.decodeRun(envelope(state)));}assert.throws(()=>saves.decodeRun(envelope(run(),4)),/版本/);
});
test('v5 keeps v4 progress bounds and terminal candidate counts',()=>{
 for(const batches of [30,31,32]){const state=run();Object.assign(state,{phase:'result',result:'won',endReason:'completed',completedOrders:batches,shift:5});state.candidates.pop();assert.deepEqual(saves.decodeRun(saves.encodeRun(state)),state);state.candidates.push({id:'piece.4',shapeId:'shape.single',cargo:'cargo.food'});assert.throws(()=>saves.encodeRun(state),/候选/);}
 for(const edit of [(s:RunState)=>{s.generatedPieces=2;},(s:RunState)=>{s.completedOrders=33;},(s:RunState)=>{s.orders[0].amount=2;},(s:RunState)=>{s.overtime=true;},(s:RunState)=>{s.score=11;}]){const state=run();edit(state);assert.throws(()=>saves.encodeRun(state));}
});
test('automatic five slot writes and cross-slot failures never change other progress bytes',()=>{
 const s=storage(),states=[createRun(19,'standard',3),createRun(19,'color_exit',4),...tiers.map(run)];for(const state of states)assert.equal(saves.saveRun(s,state).ok,true);
 for(const state of states){const slot=saves.slotForRun(state);assert.deepEqual(saves.loadRun(s,slot).state,state);for(const other of saves.RUN_SLOTS.filter(value=>value!==slot)){const before=[...s.data];assert.equal(saves.saveRun(s,state,other).ok,false);assert.deepEqual([...s.data],before);}}
});
test('foreign tier mains and backups stay corrupt until exact-byte archival',()=>{
 for(const tier of tiers){const s=storage(),slot=saves.slotForTier(tier),keys=saves.saveKeysFor(slot),other=tiers.find(value=>value!==tier)!;const foreign=saves.encodeRun(run(other));s.set(keys.main,foreign);s.set(keys.backup,saves.encodeRun(createRun(3,'color_exit',4)));const before=[...s.data];assert.equal(saves.loadRun(s,slot).source,'corrupt');assert.equal(saves.saveRun(s,run(tier)).ok,false);assert.deepEqual([...s.data],before);assert.equal(saves.preserveCorrupt(s,slot).ok,true);for(const [key,raw] of before)assert.ok([...s.data].some(([archive,value])=>archive.startsWith(key+'.corrupt.')&&value===raw));assert.equal(saves.saveRun(s,run(tier)).ok,true);}
});
test('same-tier verified backup recovers corrupt main without any implicit writes',()=>{
 for(const tier of tiers){const s=storage(),slot=saves.slotForTier(tier),keys=saves.saveKeysFor(slot),state=run(tier);s.set(keys.main,'broken');s.set(keys.backup,saves.encodeRun(state));s.set(keys.temp,saves.encodeRun(run(tiers.find(value=>value!==tier)!)));const before=[...s.data];const loaded=saves.loadRun(s,slot);assert.equal(loaded.source,'backup');assert.deepEqual(loaded.state,state);assert.deepEqual([...s.data],before);assert.equal(saves.saveRun(s,state).ok,false);assert.deepEqual([...s.data],before);}
});
test('every single mixed save storage fault retains prior stable copies in all five slots',()=>{
 for(const tier of tiers)for(let failAt=1;failAt<=20;failAt++){const s=storage(),slot=saves.slotForTier(tier),keys=saves.saveKeysFor(slot);for(const state of [createRun(3,'standard',3),createRun(3,'color_exit',4),...tiers.map(run)])assert.equal(saves.saveRun(s,state).ok,true);assert.equal(saves.saveRun(s,{...run(tier),score:10}).ok,true);const stable=new Map(s.data);let count=0;
 const fault:saves.StoragePort={get:key=>{if(++count===failAt)throw Error('read');return s.get(key);},set:(key,value)=>{if(++count===failAt)throw Error('write');s.set(key,value);},remove:key=>{if(++count===failAt)throw Error('remove');s.remove(key);}};const next={...run(tier),score:20},saved=saves.saveRun(fault,next);if(saved.ok)assert.deepEqual(saves.decodeRun(s.get(keys.main)!),next);else for(const key of [keys.main,keys.backup])assert.equal(s.get(key),stable.get(key),`${tier} fault ${failAt}`);for(const other of saves.RUN_SLOTS.filter(value=>value!==slot))for(const key of Object.values(saves.saveKeysFor(other)))assert.equal(s.get(key),stable.get(key)??null);}
});

test('naturally generated v5 runs round-trip each command and retain mixed candidates in the correct tier',()=>{
 let mixedSnapshots=0;
 for(const tier of tiers)for(const seed of [7,19,23,52,101,387]){
  const s=storage();let state=createRun(seed,'color_exit',5,tier);const slot=saves.slotForTier(tier);
  for(let turn=0;turn<160;turn++){
   if(state.candidates.some(piece=>piece.cellCargos))mixedSnapshots++;
   const raw=saves.encodeRun(state);assert.deepEqual(saves.decodeRun(raw),state);assert.equal(saves.saveRun(s,state).ok,true);assert.deepEqual(saves.loadRun(s,slot).state,state);
   for(const other of saves.RUN_SLOTS.filter(value=>value!==slot))assert.equal(saves.loadRun(s,other).source,'empty');
   if(state.phase==='result')break;
   const move=findLegalMoves(state)[0];assert.ok(move);const result=applyCommand(state,{type:'place',...move});assert.equal(result.error,undefined);state=result.state;
  }
  assert.equal(state.phase,'result',`${tier} seed ${seed} must finish within the bounded natural-game sample`);
 }
 assert.ok(mixedSnapshots>18,'sample must exercise actual mixed candidates across every tier');
});
