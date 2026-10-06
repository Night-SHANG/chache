import test from 'node:test';
import assert from 'node:assert/strict';
import { closeRun, closedSerialFloor, loadPlayableRun, runLifecycleKeysFor } from '../src/application/run-lifecycle.ts';
import { encodeRun, loadRun, saveKeysFor, saveRun, type StoragePort } from '../src/application/save.ts';
import { RUN_SLOTS, outboundRulesForSlot, difficultyForSlot, tierForSlot, type RunSlot } from '../src/application/run-slots.ts';
import { createRun } from '../src/domain/engine.ts';
import type { RunState } from '../src/domain/types.ts';

function storage() {
 const data=new Map<string,string>();
 return {data,get:(key:string)=>data.get(key)??null,set:(key:string,value:string)=>{data.set(key,value);},remove:(key:string)=>{data.delete(key);}};
}
function run(slot:RunSlot='orders',serial=10):RunState {
 const difficulty=difficultyForSlot(slot),tier=tierForSlot(slot);
 const state=difficulty?createRun(19,'color_exit',outboundRulesForSlot(slot)!,difficulty):tier?createRun(19,'color_exit',5,tier):slot==='color_exit'?createRun(19,'color_exit',4):slot==='inbound_endless'?createRun(19,'endless',7):createRun(19,'standard',3);
 return {...state,runSerial:serial};
}
function assertClosed(s:StoragePort,slot:RunSlot='orders'):void {
 const loaded=loadPlayableRun(s,slot);
 assert.equal(loaded.state,null);assert.equal(loaded.source,'empty');assert.equal(loaded.closed,true);
}

test('missing lifecycle markers preserve every raw load outcome without writes',()=>{
 const s=storage();assert.deepEqual(loadPlayableRun(s,'orders'),loadRun(s,'orders'));
 assert.deepEqual(closedSerialFloor(s),{ok:true,floor:0,message:'已读取结束边界'});
 assert.equal(saveRun(s,run()).ok,true);const before=[...s.data];
 assert.deepEqual(loadPlayableRun(s,'orders'),loadRun(s,'orders'));assert.deepEqual([...s.data],before);
 s.set(saveKeysFor('orders').main,'broken');assert.equal(loadPlayableRun(s,'orders').source,'corrupt');
});

test('explicit close persists two versioned digested copies without changing run profile or state',()=>{
 const s=storage(),state=run(),beforeState=structuredClone(state),keys=saveKeysFor('orders');
 assert.equal(saveRun(s,{...state,score:1}).ok,true);assert.equal(saveRun(s,state).ok,true);
 s.set('warehouse.profile.v1','profile bytes');s.set('warehouse.profile.backup.v1','profile backup');
 const previous=new Map(s.data);assert.equal(closeRun(s,'orders',state).ok,true);assert.deepEqual(state,beforeState);
 for(const [key,value] of previous)assert.equal(s.get(key),value);
 const markers=runLifecycleKeysFor('orders'),raw=s.get(markers.main)!;
 assert.equal(raw,s.get(markers.backup));assert.equal(s.get(markers.temp),null);
 const value=JSON.parse(raw);assert.equal(value.schemaVersion,1);assert.equal(value.slot,'orders');assert.equal(value.reason,'abandoned');assert.equal(value.closedSerial,10);assert.match(value.digest,/^[a-f0-9]{8}$/);
 assertClosed(s);assert.equal(loadRun(s).state?.runSerial,10);assert.equal(s.get(keys.main),previous.get(keys.main));
});

test('all fourteen slot cutoffs are isolated and the global floor is their maximum',()=>{
 assert.equal(new Set(RUN_SLOTS.flatMap(slot=>Object.values(runLifecycleKeysFor(slot)))).size,42);
 for(const [index,closedSlot] of RUN_SLOTS.entries()){
  const s=storage();for(const slot of RUN_SLOTS)assert.equal(saveRun(s,run(slot,index+1)).ok,true);
  assert.equal(closeRun(s,closedSlot,run(closedSlot,index+1)).ok,true);
  for(const slot of RUN_SLOTS)if(slot===closedSlot)assertClosed(s,slot);else assert.equal(loadPlayableRun(s,slot).state?.runSerial,index+1);
  assert.equal(closedSerialFloor(s).floor,index+1);
 }
 const s=storage();for(const [index,slot] of RUN_SLOTS.entries())assert.equal(closeRun(s,slot,run(slot,index+20)).ok,true);
 assert.equal(closedSerialFloor(s).floor,33);
});

test('either surviving stable lifecycle copy prevents resurrection after a reboot',()=>{
 for(const pointer of ['main','backup'] as const){
  const s=storage();assert.equal(saveRun(s,run()).ok,true);assert.equal(closeRun(s,'orders',run()).ok,true);
  s.remove(runLifecycleKeysFor('orders')[pointer]);
  const reboot={get:s.get,set:s.set,remove:s.remove};assertClosed(reboot);assert.equal(closedSerialFloor(reboot).floor,10);
 }
});

test('same lower and unserialized backups stay closed while a higher serial can resume',()=>{
 for(const slot of RUN_SLOTS){
  const s=storage(),keys=saveKeysFor(slot);assert.equal(closeRun(s,slot,run(slot)).ok,true);
  for(const serial of [10,9,1,undefined])for(const pointer of ['main','backup'] as const){
   const state=run(slot);if(serial===undefined)delete state.runSerial;else state.runSerial=serial;
   s.set(keys.main,'broken main retained');s.set(keys.backup,'broken backup retained');s.set(keys[pointer],encodeRun(state));const before=[...s.data];assertClosed(s,slot);assert.deepEqual([...s.data],before);
  }
  s.set(keys.backup,encodeRun(run(slot,11)));assert.equal(loadPlayableRun(s,slot).state?.runSerial,11);assert.equal(loadPlayableRun(s,slot).source,'backup');
  s.set(keys.main,encodeRun(run(slot,12)));assert.equal(loadPlayableRun(s,slot).state?.runSerial,12);
 }
});

test('repeated or older close is idempotent and never decreases the serial floor',()=>{
 const s=storage();assert.equal(closeRun(s,'orders',run()).ok,true);const before=[...s.data];
 const noWrites={...s,set:()=>{throw Error('must not write');},remove:()=>{throw Error('must not remove');}};
 assert.equal(closeRun(noWrites,'orders',run()).ok,true);assert.equal(closeRun(noWrites,'orders',run('orders',9)).ok,true);
 assert.deepEqual([...s.data],before);assert.equal(closedSerialFloor(s).floor,10);
 assert.equal(closeRun(s,'orders',run('orders',11)).ok,true);assert.equal(closedSerialFloor(s).floor,11);
});

test('a single surviving verified cutoff proves an older close without needing writes',()=>{
 for(const slot of RUN_SLOTS)for(const missing of ['main','backup'] as const){
  const s=storage();assert.equal(closeRun(s,slot,run(slot)).ok,true);s.remove(runLifecycleKeysFor(slot)[missing]);const before=[...s.data];
  const denied:StoragePort={...s,set:()=>{throw Error('write denied');},remove:()=>{throw Error('remove denied');}};
  assert.equal(closeRun(denied,slot,run(slot,9)).ok,true);assert.equal(closeRun(denied,slot,run(slot)).ok,true);assert.deepEqual([...s.data],before);
 }
});

test('a stale initial read cannot hide a prior cutoff or invent an already-committed close',()=>{
 for(const slot of RUN_SLOTS)for(const pointer of ['main','backup'] as const)for(const staleKind of ['missing','rolled-back'] as const){
  const s=storage(),keys=runLifecycleKeysFor(slot);assert.equal(saveRun(s,run(slot)).ok,true);assert.equal(closeRun(s,slot,run(slot)).ok,true);const raw=s.get(keys[pointer])!;
  s.remove(keys[pointer==='main'?'backup':'main']);if(staleKind==='rolled-back')s.remove(keys[pointer]);const before=[...s.data];
  const stale=():StoragePort=>{let injected=false;return {...s,get:key=>{if(key===keys[pointer]&&!injected){injected=true;return staleKind==='missing'?null:raw;}return s.get(key);}};};
  const loaded=loadPlayableRun(stale(),slot);assert.equal(loaded.state,null);assert.equal(loaded.source,'unavailable');assert.equal(closedSerialFloor(stale()).ok,false);
  assert.equal(closeRun(stale(),slot,run(slot,staleKind==='missing'?9:10)).ok,false);assert.deepEqual([...s.data],before);
  if(staleKind==='missing'){assertClosed(s,slot);assert.equal(closedSerialFloor(s).floor,10);}
  else assert.equal(loadPlayableRun(s,slot).state?.runSerial,10);
 }
});

test('invalid run identity or missing positive serial is rejected without writes',()=>{
 const s=storage();for(const serial of [undefined,0,-1,1.5,Number.MAX_SAFE_INTEGER+1,NaN]){
  const state={...run(),runSerial:serial};assert.equal(closeRun(s,'orders',state).ok,false);assert.equal(s.data.size,0);
 }
 assert.equal(closeRun(s,'outbound_easy',run()).ok,false);assert.equal(s.data.size,0);
 const bad={...run(),board:[]};assert.equal(closeRun(s,'orders',bad).ok,false);assert.equal(s.data.size,0);
});

test('any invalid stable marker blocks gameplay and serial allocation without altering bytes',()=>{
 const seed=storage();assert.equal(closeRun(seed,'orders',run()).ok,true);
 const keys=runLifecycleKeysFor('orders'),valid=seed.get(keys.main)!,parsed=JSON.parse(valid);
 const invalid=['broken','',JSON.stringify(null),'[]',' '.repeat(513),...[
  {...parsed,schemaVersion:99},{...parsed,slot:'inbound_endless'},{...parsed,reason:'completed'},
  {...parsed,closedSerial:11},{...parsed,closedSerial:0},{...parsed,digest:undefined},{...parsed,extra:1},
 ].map(value=>JSON.stringify(value))];
 for(const pointer of ['main','backup'] as const)for(const raw of invalid){
  const s=storage();s.set(keys.main,valid);s.set(keys.backup,valid);s.set(keys[pointer],raw);assert.equal(saveRun(s,run('orders',20)).ok,true);const before=[...s.data];
  const loaded=loadPlayableRun(s,'orders');assert.equal(loaded.source,'corrupt');assert.equal(loaded.state,null);assert.notEqual(loaded.closed,true);
  assert.equal(closedSerialFloor(s).ok,false);assert.equal(closeRun(s,'orders',run('orders',21)).ok,false);assert.deepEqual([...s.data],before);
 }
});

test('marker or snapshot read denial never becomes empty or permits a blind close',()=>{
 const s=storage();assert.equal(saveRun(s,run()).ok,true);assert.equal(closeRun(s,'orders',run()).ok,true);
 const markers=runLifecycleKeysFor('orders'),snapshots=saveKeysFor('orders');
 for(const key of [markers.main,markers.backup,snapshots.main,snapshots.backup]){
  const before=[...s.data],denied={...s,get:(requested:string)=>{if(requested===key)throw Error('read denied');return s.get(requested);}};
  const loaded=loadPlayableRun(denied,'orders');assert.equal(loaded.source,'unavailable');assert.equal(loaded.state,null);assert.notEqual(loaded.closed,true);
  if(key===markers.main||key===markers.backup){assert.equal(closedSerialFloor(denied).ok,false);assert.equal(closeRun(denied,'orders',run('orders',11)).ok,false);}
  assert.deepEqual([...s.data],before);
 }
 for(const slot of RUN_SLOTS){const denied={...s,get:(key:string)=>{if(key===runLifecycleKeysFor(slot).main)throw Error('read denied');return s.get(key);}};assert.equal(closedSerialFloor(denied).ok,false);}
});

test('known cutoff does not downgrade unreadable raw snapshots to a safely replaceable empty slot',()=>{
 const s=storage(),keys=saveKeysFor('orders');assert.equal(closeRun(s,'orders',run()).ok,true);
 s.set(keys.main,'bad main');s.set(keys.backup,'bad backup');const before=[...s.data];
 const loaded=loadPlayableRun(s,'orders');assert.equal(loaded.source,'corrupt');assert.equal(loaded.state,null);assert.notEqual(loaded.closed,true);assert.deepEqual([...s.data],before);
});

test('abandoned staging bytes never close a run or block reading stable lifecycle markers',()=>{
 const s=storage(),keys=runLifecycleKeysFor('orders');assert.equal(saveRun(s,run()).ok,true);assert.equal(closeRun(s,'orders',run()).ok,true);
 const raw=s.get(keys.main)!;s.remove(keys.main);s.remove(keys.backup);s.set(keys.temp,raw);
 assert.equal(loadPlayableRun(s,'orders').state?.runSerial,10);assert.equal(closedSerialFloor(s).floor,0);
 s.set(keys.temp,'broken staging');assert.equal(loadPlayableRun(s,'orders').state?.runSerial,10);assert.equal(closedSerialFloor(s).ok,true);
});

test('every single operation failure either commits or preserves the playable board in all fourteen slots',()=>{
 for(const slot of RUN_SLOTS)for(const previousSerial of [0,10]){
  const operations:string[]=[],baseline=storage(),state=run(slot,11);
  if(previousSerial)assert.equal(closeRun(baseline,slot,run(slot,previousSerial)).ok,true);
  const traced:StoragePort={get:key=>{operations.push('get');return baseline.get(key);},set:(key,value)=>{operations.push('set');baseline.set(key,value);},remove:key=>{operations.push('remove');baseline.remove(key);}};
  assert.equal(closeRun(traced,slot,state).ok,true);
  for(let failAt=1;failAt<=operations.length;failAt++)for(const when of ['before','after'] as const){
   const s=storage(),keys=runLifecycleKeysFor(slot);
   if(previousSerial)assert.equal(closeRun(s,slot,run(slot,previousSerial)).ok,true);
   assert.equal(saveRun(s,state).ok,true);s.set('warehouse.profile.v1','profile bytes');
   const before=new Map(s.data);let count=0;
   const fault:StoragePort={get:key=>{if(++count===failAt)throw Error('read');return s.get(key);},set:(key,value)=>{const failing=++count===failAt;if(failing&&when==='before')throw Error('write');s.set(key,value);if(failing)throw Error('write after persistence');},remove:key=>{const failing=++count===failAt;if(failing&&when==='before')throw Error('remove');s.remove(key);if(failing)throw Error('remove after persistence');}};
   const result=closeRun(fault,slot,state),label=`${slot}, prior ${previousSerial}, operation ${failAt}, ${when}`;
   assert.notEqual(result.uncertain,true,label);
   if(result.ok){assertClosed(s,slot);assert.equal(closedSerialFloor(s).floor,11,label);}
   else {for(const pointer of ['main','backup'] as const)assert.equal(s.get(keys[pointer]),before.get(keys[pointer])??null,label);assert.equal(loadPlayableRun(s,slot).state?.runSerial,11,label);assert.equal(closedSerialFloor(s).floor,previousSerial,label);}
   for(const [key,value] of before)if(key!==keys.main&&key!==keys.backup)assert.equal(s.get(key),value,label);
   assert.equal(closeRun(s,slot,state).ok,true);assertClosed(s,slot);
  }
 }
});

test('verified first stable marker is a commit even if every remaining mirror write fails',()=>{
 for(const slot of RUN_SLOTS)for(const mode of ['throw','corrupt','drop'] as const){
  const s=storage(),keys=runLifecycleKeysFor(slot),state=run(slot);assert.equal(saveRun(s,state).ok,true);
  const fault:StoragePort={...s,set:(key,value)=>{if(key===keys.main){if(mode==='corrupt')s.set(key,'broken mirror');if(mode!=='drop')throw Error('mirror write failed');return;}s.set(key,value);}};
  const result=closeRun(fault,slot,state);assert.equal(result.ok,true,`${slot}, ${mode}`);assert.notEqual(result.uncertain,true);
  const loaded=loadPlayableRun(s,slot);assert.equal(loaded.state,null);assert.ok(loaded.closed===true||loaded.source==='corrupt');
  assert.equal(loadRun(s,slot).state?.runSerial,10,'raw snapshots are retained');
 }
});

test('corrupt dropped and stale-read writes produce an honest outcome in all fourteen slots',()=>{
 for(const slot of RUN_SLOTS)for(const previousSerial of [0,10])for(const pointer of ['temp','backup','main'] as const)for(const mode of ['corrupt','drop','stale-read'] as const){
  const s=storage(),keys=runLifecycleKeysFor(slot),state=run(slot,11);
  if(previousSerial)assert.equal(closeRun(s,slot,run(slot,previousSerial)).ok,true);
  assert.equal(saveRun(s,state).ok,true);const before=new Map(s.data);let injected=false,stale=false;
  const fault:StoragePort={...s,set:(key,value)=>{if(key===keys[pointer]&&!injected){injected=true;if(mode==='corrupt'){s.set(key,'bad marker');return;}if(mode==='drop')return;s.set(key,value);stale=true;return;}s.set(key,value);},get:key=>{if(key===keys[pointer]&&stale){stale=false;return before.get(key)??null;}return s.get(key);}};
  const result=closeRun(fault,slot,state),label=`${slot}, prior ${previousSerial}, ${pointer}, ${mode}`;
  assert.notEqual(result.uncertain,true,label);
  if(result.ok){assertClosed(s,slot);assert.equal(closedSerialFloor(s).floor,11,label);}
  else {assert.equal(s.get(keys.main),before.get(keys.main)??null,label);assert.equal(s.get(keys.backup),before.get(keys.backup)??null,label);assert.equal(loadPlayableRun(s,slot).state?.runSerial,11,label);assert.equal(closedSerialFloor(s).floor,previousSerial,label);}
  for(const [key,value] of before)if(key!==keys.main&&key!==keys.backup)assert.equal(s.get(key),value,label);
  assert.equal(closeRun(s,slot,state).ok,true);
 }
});

test('the sole highest cutoff is never overwritten before another stable copy commits',()=>{
 for(const slot of RUN_SLOTS)for(const highest of ['main','backup'] as const){
  const s=storage(),keys=runLifecycleKeysFor(slot);assert.equal(closeRun(s,slot,run(slot,5)).ok,true);const low=s.get(keys.main)!;
  assert.equal(closeRun(s,slot,run(slot)).ok,true);s.set(keys[highest==='main'?'backup':'main'],low);
  assert.equal(saveRun(s,run(slot,9)).ok,true);
  const fault:StoragePort={...s,set:(key,value)=>{if(key===keys[highest]){s.remove(key);throw Error('lost highest pointer');}s.set(key,value);}};
  const result=closeRun(fault,slot,run(slot,11));assert.equal(result.ok,true);
  const floor=closedSerialFloor(s);assert.ok(!floor.ok||floor.floor>=11,`${slot}, ${highest}`);
  assert.equal(loadPlayableRun(s,slot).state,null,'previously closed serials cannot become playable');
 }
});

test('multiple faults that prevent both commit and rollback verification report uncertainty',()=>{
 for(const slot of RUN_SLOTS)for(const rollback of ['throws','succeeds'] as const){
  const s=storage(),keys=runLifecycleKeysFor(slot);assert.equal(saveRun(s,run(slot)).ok,true);let attempted=false;
  const fault:StoragePort={...s,set:(key,value)=>{if(key===keys.backup)attempted=true;s.set(key,value);},get:key=>{if(key===keys.backup&&attempted)throw Error('cannot read transaction outcome');return s.get(key);},remove:key=>{if(key===keys.backup&&rollback==='throws')throw Error('cannot undo uncertain write');s.remove(key);}};
  const result=closeRun(fault,slot,run(slot));assert.equal(result.ok,false);assert.equal(result.uncertain,true);assert.match(result.message,/无法确认/);
  assert.equal(loadPlayableRun(fault,slot).source,'unavailable');
  if(rollback==='throws')assertClosed(s,slot);else assert.equal(loadPlayableRun(s,slot).state?.runSerial,10);
 }
});

test('failed rollback preserves a sole prior high cutoff and never claims the old bytes were restored',()=>{
 for(const slot of RUN_SLOTS)for(const highest of ['main','backup'] as const)for(const mode of ['lost','corrupt'] as const){
  const s=storage(),keys=runLifecycleKeysFor(slot);assert.equal(closeRun(s,slot,run(slot,5)).ok,true);const low=s.get(keys.main)!;
  assert.equal(closeRun(s,slot,run(slot)).ok,true);const first=highest==='main'?'backup':'main';s.set(keys[first],low);assert.equal(saveRun(s,run(slot,9)).ok,true);
  const fault:StoragePort={...s,set:(key,value)=>{if(key===keys[first]){if(mode==='lost')s.remove(key);else s.set(key,'broken marker');throw Error('write and rollback both fail');}s.set(key,value);}};
  const result=closeRun(fault,slot,run(slot,11));assert.equal(result.ok,false);assert.equal(result.uncertain,true);
  const floor=closedSerialFloor(s);assert.ok(!floor.ok||floor.floor===10);assert.equal(loadPlayableRun(s,slot).state,null);
 }
});

test('one stale rollback read cannot report an ordinary failure while the run remains closed',()=>{
 for(const slot of RUN_SLOTS){
  const s=storage(),keys=runLifecycleKeysFor(slot);assert.equal(saveRun(s,run(slot)).ok,true);let attempted=false,rollbackAttempted=false,stale=false;
  const fault:StoragePort={...s,set:(key,value)=>{if(key===keys.backup)attempted=true;s.set(key,value);},get:key=>{if(key===keys.backup&&attempted){if(!rollbackAttempted)throw Error('commit readback unavailable');if(!stale){stale=true;return null;}}return s.get(key);},remove:key=>{if(key===keys.backup){rollbackAttempted=true;throw Error('rollback did not remove marker');}s.remove(key);}};
  const result=closeRun(fault,slot,run(slot));assert.equal(result.ok,false);assert.equal(result.uncertain,true);assertClosed(s,slot);
 }
});

test('one stale commit read cannot certify dropped stable writes',()=>{
 for(const slot of RUN_SLOTS){
  const s=storage(),keys=runLifecycleKeysFor(slot);assert.equal(saveRun(s,run(slot)).ok,true);let attempted:string|null=null,stale=false;
  const fault:StoragePort={...s,set:(key,value)=>{if(key===keys.backup){attempted=value;return;}if(key===keys.main)return;s.set(key,value);},get:key=>{if(key===keys.backup&&attempted!==null&&!stale){stale=true;return attempted;}return s.get(key);}};
  const result=closeRun(fault,slot,run(slot));assert.equal(result.ok,false);assert.notEqual(result.uncertain,true);assert.equal(closedSerialFloor(s).floor,0);assert.equal(loadPlayableRun(s,slot).state?.runSerial,10);
 }
});
