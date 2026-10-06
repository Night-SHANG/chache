import test from 'node:test';
import assert from 'node:assert/strict';
import { closeRun, closedSerialFloor, loadPlayableRun, runLifecycleKeysFor } from '../src/application/run-lifecycle.ts';
import { encodeRun, loadRun, saveKeysFor, saveRun, type StoragePort } from '../src/application/save.ts';
import { RUN_SLOTS, difficultyForSlot, tierForSlot, type RunSlot } from '../src/application/run-slots.ts';
import { createRun } from '../src/domain/engine.ts';
import type { RunState } from '../src/domain/types.ts';

function storage() {
 const data=new Map<string,string>();
 return {data,get:(key:string)=>data.get(key)??null,set:(key:string,value:string)=>{data.set(key,value);},remove:(key:string)=>{data.delete(key);}};
}
function run(slot:RunSlot='orders',serial=10):RunState {
 const difficulty=difficultyForSlot(slot),tier=tierForSlot(slot);
 const state=difficulty?createRun(19,'color_exit',6,difficulty):tier?createRun(19,'color_exit',5,tier):slot==='color_exit'?createRun(19,'color_exit',4):slot==='inbound_endless'?createRun(19,'endless',7):createRun(19,'standard',3);
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

test('all ten slot cutoffs are isolated and the global floor is their maximum',()=>{
 assert.equal(new Set(RUN_SLOTS.flatMap(slot=>Object.values(runLifecycleKeysFor(slot)))).size,30);
 for(const [index,closedSlot] of RUN_SLOTS.entries()){
  const s=storage();for(const slot of RUN_SLOTS)assert.equal(saveRun(s,run(slot,index+1)).ok,true);
  assert.equal(closeRun(s,closedSlot,run(closedSlot,index+1)).ok,true);
  for(const slot of RUN_SLOTS)if(slot===closedSlot)assertClosed(s,slot);else assert.equal(loadPlayableRun(s,slot).state?.runSerial,index+1);
  assert.equal(closedSerialFloor(s).floor,index+1);
 }
 const s=storage();for(const [index,slot] of RUN_SLOTS.entries())assert.equal(closeRun(s,slot,run(slot,index+20)).ok,true);
 assert.equal(closedSerialFloor(s).floor,29);
});

test('either surviving stable lifecycle copy prevents resurrection after a reboot',()=>{
 for(const pointer of ['main','backup'] as const){
  const s=storage();assert.equal(saveRun(s,run()).ok,true);assert.equal(closeRun(s,'orders',run()).ok,true);
  s.remove(runLifecycleKeysFor('orders')[pointer]);
  const reboot={get:s.get,set:s.set,remove:s.remove};assertClosed(reboot);assert.equal(closedSerialFloor(reboot).floor,10);
 }
});

test('same lower and unserialized backups stay closed while a higher serial can resume',()=>{
 const s=storage(),keys=saveKeysFor('orders');assert.equal(closeRun(s,'orders',run()).ok,true);
 for(const serial of [10,9,1,undefined]){
  const state=run();if(serial===undefined)delete state.runSerial;else state.runSerial=serial;
  s.set(keys.main,'broken main retained');s.set(keys.backup,encodeRun(state));assertClosed(s);
  assert.equal(s.get(keys.main),'broken main retained');
 }
 s.set(keys.backup,encodeRun(run('orders',11)));assert.equal(loadPlayableRun(s,'orders').state?.runSerial,11);assert.equal(loadPlayableRun(s,'orders').source,'backup');
 s.set(keys.main,encodeRun(run('orders',12)));assert.equal(loadPlayableRun(s,'orders').state?.runSerial,12);
});

test('repeated or older close is idempotent and never decreases the serial floor',()=>{
 const s=storage();assert.equal(closeRun(s,'orders',run()).ok,true);const before=[...s.data];
 const noWrites={...s,set:()=>{throw Error('must not write');},remove:()=>{throw Error('must not remove');}};
 assert.equal(closeRun(noWrites,'orders',run()).ok,true);assert.equal(closeRun(noWrites,'orders',run('orders',9)).ok,true);
 assert.deepEqual([...s.data],before);assert.equal(closedSerialFloor(s).floor,10);
 assert.equal(closeRun(s,'orders',run('orders',11)).ok,true);assert.equal(closedSerialFloor(s).floor,11);
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

test('every single transaction fault restores prior stable markers and permits an exact retry in all ten slots',()=>{
 for(const slot of RUN_SLOTS)for(let failAt=1;failAt<=12;failAt++){
  const s=storage(),state=run(slot,10),next=run(slot,11),keys=runLifecycleKeysFor(slot);
  assert.equal(saveRun(s,state).ok,true);assert.equal(closeRun(s,slot,state).ok,true);const before=new Map(s.data);let count=0;
  const fault:StoragePort={get:key=>{if(++count===failAt)throw Error('read');return s.get(key);},set:(key,value)=>{if(++count===failAt)throw Error('write');s.set(key,value);},remove:key=>{if(++count===failAt)throw Error('remove');s.remove(key);}};
  const result=closeRun(fault,slot,next);
  if(result.ok)assert.equal(closedSerialFloor(s).floor,11);
  else {for(const pointer of ['main','backup'] as const)assert.equal(s.get(keys[pointer]),before.get(keys[pointer]),`${slot}, operation ${failAt}, ${pointer}`);assert.equal(closedSerialFloor(s).floor,10);}
  for(const [key,value] of before)if(key!==keys.main&&key!==keys.backup)assert.equal(s.get(key),value);
  assert.equal(closeRun(s,slot,next).ok,true);assert.equal(closedSerialFloor(s).floor,11);
 }
});

test('failed initial closure leaves the unclosed board resumable and retryable',()=>{
 for(let failAt=1;failAt<=8;failAt++){
  const s=storage();assert.equal(saveRun(s,run()).ok,true);const before=new Map(s.data);let count=0;
  const fault:StoragePort={get:key=>{if(++count===failAt)throw Error('read');return s.get(key);},set:(key,value)=>{if(++count===failAt)throw Error('write');s.set(key,value);},remove:s.remove};
  assert.equal(closeRun(fault,'orders',run()).ok,false);assert.equal(loadPlayableRun(s,'orders').state?.runSerial,10,`operation ${failAt}`);assert.equal(closedSerialFloor(s).floor,0);
  for(const [key,value] of before)assert.equal(s.get(key),value);
  assert.equal(closeRun(s,'orders',run()).ok,true);assertClosed(s);
 }
});

test('silently corrupt or dropped marker writes fail readback and restore the old cutoff',()=>{
 for(const pointer of ['temp','backup','main'] as const)for(const mode of ['corrupt','drop','stale-read'] as const){
  const s=storage();assert.equal(closeRun(s,'orders',run()).ok,true);const keys=runLifecycleKeysFor('orders'),before=new Map(s.data);let injected=false,stale=false;
  const fault:StoragePort={...s,set:(key,value)=>{if(key===keys[pointer]&&!injected){injected=true;if(mode==='corrupt'){s.set(key,'bad marker');return;}if(mode==='drop')return;s.set(key,value);stale=true;return;}s.set(key,value);},get:key=>{if(key===keys[pointer]&&stale){stale=false;return before.get(key)??null;}return s.get(key);}};
  assert.equal(closeRun(fault,'orders',run('orders',11)).ok,false,`${pointer}, ${mode}`);
  assert.equal(s.get(keys.main),before.get(keys.main));assert.equal(s.get(keys.backup),before.get(keys.backup));assert.equal(closedSerialFloor(s).floor,10);
  assert.equal(closeRun(s,'orders',run('orders',11)).ok,true);
 }
});

test('partial rollback never exposes a lower cutoff when the sole highest marker is lost',()=>{
 for(const highest of ['main','backup'] as const){
  const s=storage(),keys=runLifecycleKeysFor('orders');assert.equal(closeRun(s,'orders',run('orders',5)).ok,true);const low=s.get(keys.main)!;
  assert.equal(closeRun(s,'orders',run()).ok,true);const high=s.get(keys.main)!;s.set(keys[highest==='main'?'backup':'main'],low);
  assert.equal(saveRun(s,run('orders',9)).ok,true);let attempted=false;
  const fault:StoragePort={...s,set:(key,value)=>{if(key===keys[highest]){if(value!==high){attempted=true;s.remove(key);throw Error('write partially failed');}if(attempted){s.remove(key);return;}}s.set(key,value);}};
  assert.equal(closeRun(fault,'orders',run('orders',11)).ok,false);
  const floor=closedSerialFloor(s);assert.ok(!floor.ok||floor.floor>=10,`${highest} was the sole highest marker`);
  assert.equal(loadPlayableRun(s,'orders').state,null,'a previously closed serial cannot become playable during rollback');
 }
});
