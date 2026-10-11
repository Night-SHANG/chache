import assert from 'node:assert/strict';
import test from 'node:test';
import {connectAndroidHost,startAndroidSession} from '../src/platform/android-host.ts';
import {androidHost} from './helpers/android-platform-fixture.ts';
import {androidSessionFixture,nativeHostFixture} from './helpers/android-host-fixture.ts';
import {startInbound} from './helpers/session-fixtures.ts';

const settle=()=>new Promise<void>(resolve=>setImmediate(resolve));
test('native state listener is installed before snapshot and a newer event wins a delayed stale snapshot',async()=>{
 const native=nativeHostFixture();let complete!:(state:typeof androidHost)=>void;native.plugin.getState=()=>new Promise(resolve=>{complete=resolve;native.order.push('getState');});
 const pending=connectAndroidHost(native.plugin);await settle();assert.deepEqual(native.order,['state','getState']);native.setState({...androidHost,active:false});complete(androidHost);const host=await pending;assert.equal(host.state.active,false);
 const received:boolean[]=[];const off=host.subscribe(state=>received.push(state.active));assert.deepEqual(received,[]);native.setState(androidHost);assert.deepEqual(received,[true]);off();native.setState({...androidHost,active:false});assert.deepEqual(received,[true]);await host.disconnect();assert.equal(native.removed,1);
});
test('native and DOM visibility use AND, deduplicate hide/show and preserve paused run without catch-up',async()=>{
 const f=androidSessionFixture(),native=nativeHostFixture();try{
  const host=await connectAndroidHost(native.plugin),runtime=await startAndroidSession(f.canvas,host,f.bridge,f.visibility),s=runtime.session;startInbound(s);let now=1000;runtime.platform.now=()=>now;s.show();now=1100;assert.equal(runtime.frame(now,()=>{}),true);const elapsed=s.view.elapsed;
  let hides=0,shows=0;const hide=s.hide.bind(s),show=s.show.bind(s);s.hide=()=>{hides++;hide();};s.show=()=>{shows++;show();};runtime.platform.playSound('pick');
  native.setState({...androidHost,active:false});const saved=[...f.values];native.setState({...androidHost,active:false});f.setHidden(true);f.setHidden(false);assert.equal(hides,1);assert.equal(shows,0);assert.equal(s.view.paused,true);assert.equal(runtime.frame(70000,()=>{}),false);assert.equal(s.view.elapsed,elapsed);assert.deepEqual([...f.values],saved);assert.ok(f.audio.every(audio=>!audio.audible));
  now=70000;native.setState(androidHost);native.setState(androidHost);assert.equal(shows,1);assert.equal(s.view.paused,true);runtime.frame(70000,()=>{});assert.equal(s.view.elapsed,elapsed);assert.equal(s.view.account?.run?.state.commandIndex,s.state.commandIndex);
  s.action({type:'toggleMusic'});assert.equal(s.view.profile?.settings.music,false);f.setHidden(true);now=80000;f.setHidden(false);assert.equal(s.view.profile?.settings.music,false);assert.ok(f.audio.every(audio=>!audio.audible));runtime.dispose();await host.disconnect();
 }finally{f.restore();}
});
test('owner loss immediately blocks input and all account mutation, stale owner=true never revives the lease',async()=>{
 const f=androidSessionFixture(),native=nativeHostFixture();try{
  const host=await connectAndroidHost(native.plugin),runtime=await startAndroidSession(f.canvas,host,f.bridge,f.visibility),s=runtime.session;startInbound(s);f.pointer('pointerdown',300,900);assert.equal(f.captured.size,1);
  native.setState({...androidHost,owner:false});assert.equal(runtime.lease.status,'busy');assert.equal(s.view.accountBlocked,true);assert.equal(f.captured.size,0);const saved=[...f.values];s.action({type:'newRun',mode:'standard'});s.action({type:'confirm'});s.action({type:'toggleSound'});assert.deepEqual([...f.values],saved);
  native.setState(androidHost);assert.equal(runtime.lease.status,'busy');assert.equal(runtime.frame(90000,()=>{}),false);f.pointer('pointerdown',300,900);assert.equal(f.captured.size,0);runtime.dispose();await host.disconnect();
 }finally{f.restore();}
});
test('transient zero geometry pauses safely and waits for fresh measured native geometry',async()=>{
 const f=androidSessionFixture(),native=nativeHostFixture();try{
  const host=await connectAndroidHost(native.plugin),runtime=await startAndroidSession(f.canvas,host,f.bridge,f.visibility);startInbound(runtime.session);native.setState({...androidHost,widthPx:0,heightPx:0});assert.equal(runtime.frame(10000,()=>{}),false);assert.equal(runtime.lease.status,'held');assert.equal(runtime.session.view.paused,true);native.setState(androidHost);assert.equal(runtime.frame(11000,()=>{}),true);assert.equal(runtime.session.view.paused,true);runtime.dispose();await host.disconnect();
 }finally{f.restore();}
});
test('system back pauses then minimizes the task once per press without closing the account run',async()=>{
 const f=androidSessionFixture(),native=nativeHostFixture();try{
  const host=await connectAndroidHost(native.plugin),runtime=await startAndroidSession(f.canvas,host,f.bridge,f.visibility);startInbound(runtime.session);const run=runtime.session.view.account?.run?.identity.runId;native.emit('backButton');assert.equal(runtime.session.view.paused,true);assert.equal(native.minimized,0);native.emit('backButton');await settle();assert.equal(native.minimized,1);assert.equal(runtime.session.view.account?.run?.identity.runId,run);runtime.dispose();await host.disconnect();native.emit('backButton');assert.equal(native.minimized,1);
 }finally{f.restore();}
});

test('pending back listener teardown removes exactly once and never delivers after unsubscribe',async()=>{
 const native=nativeHostFixture(),add=native.plugin.addListener.bind(native.plugin);let complete!:(value:{remove():Promise<void>})=>void;
 native.plugin.addListener=async(name,callback)=>{const handle=await add(name,callback);if(name==='backButton')return new Promise(resolve=>{complete=resolve;setImmediate(()=>complete(handle));});return handle;};
 const host=await connectAndroidHost(native.plugin);let calls=0;const off=host.onBack(()=>calls++);off();native.emit('backButton');await settle();await settle();assert.equal(calls,0);assert.equal(native.removed,1);await host.disconnect();assert.equal(native.removed,2);
});

test('page teardown after native hide does not hide or save the session twice',async()=>{
 const f=androidSessionFixture(),native=nativeHostFixture();try{const host=await connectAndroidHost(native.plugin),runtime=await startAndroidSession(f.canvas,host,f.bridge,f.visibility);startInbound(runtime.session);let hides=0;const hide=runtime.session.hide.bind(runtime.session);runtime.session.hide=()=>{hides++;hide();};native.setState({...androidHost,active:false});const saved=[...f.values];runtime.dispose();runtime.dispose();assert.equal(hides,1);assert.deepEqual([...f.values],saved);await host.disconnect();}finally{f.restore();}
});

test('scheduled Android frames cancel on merged hide and restart once on valid show',async()=>{
 const f=androidSessionFixture(),native=nativeHostFixture();try{
  const host=await connectAndroidHost(native.plugin),runtime=await startAndroidSession(f.canvas,host,f.bridge,f.visibility);let paints=0;runtime.startFrames(()=>paints++);assert.equal(f.pendingFrames,1);f.nextFrame(1000);assert.equal(paints,1);assert.equal(f.pendingFrames,1);
  const cancelledId=f.requestedFrames;native.setState({...androidHost,active:false});assert.equal(f.pendingFrames,0);assert.ok(f.cancelledFrames.includes(cancelledId));const requests=f.requestedFrames;f.setHidden(true);f.setHidden(false);f.nextFrame(5000);f.fireFrame(cancelledId,5000);assert.equal(f.requestedFrames,requests);assert.equal(paints,1);
  native.setState(androidHost);native.setState(androidHost);assert.equal(f.pendingFrames,1);assert.equal(f.requestedFrames,requests+1);f.nextFrame(6000);assert.equal(paints,2);assert.equal(f.pendingFrames,1);f.setHidden(true);assert.equal(f.pendingFrames,0);const hiddenRequests=f.requestedFrames;native.setState(androidHost);f.setHidden(true);f.nextFrame(9000);assert.equal(f.requestedFrames,hiddenRequests);f.setHidden(false);assert.equal(f.pendingFrames,1);assert.equal(f.requestedFrames,hiddenRequests+1);runtime.dispose();await host.disconnect();
 }finally{f.restore();}
});
test('pending frames stay suspended through zero geometry and permanently stop on owner loss or dispose',async()=>{
 const f=androidSessionFixture(),native=nativeHostFixture();try{
  const host=await connectAndroidHost(native.plugin),runtime=await startAndroidSession(f.canvas,host,f.bridge,f.visibility);let paints=0;runtime.startFrames(()=>paints++);native.setState({...androidHost,widthPx:0,heightPx:0});assert.equal(f.pendingFrames,0);const invalidRequests=f.requestedFrames;f.nextFrame();assert.equal(f.requestedFrames,invalidRequests);native.setState(androidHost);assert.equal(f.pendingFrames,1);native.setState({...androidHost,owner:false});assert.equal(f.pendingFrames,0);const lostRequests=f.requestedFrames;native.setState(androidHost);f.nextFrame();assert.equal(f.requestedFrames,lostRequests);assert.equal(paints,0);runtime.dispose();runtime.startFrames(()=>paints++);assert.equal(f.pendingFrames,0);await host.disconnect();
 }finally{f.restore();}
 const other=androidSessionFixture(),active=nativeHostFixture();try{const host=await connectAndroidHost(active.plugin),runtime=await startAndroidSession(other.canvas,host,other.bridge,other.visibility);runtime.startFrames(()=>{});const oldId=other.requestedFrames;runtime.dispose();assert.equal(other.pendingFrames,0);const requests=other.requestedFrames;other.fireFrame(oldId,10000);active.setState(androidHost);other.setHidden(true);other.setHidden(false);assert.equal(other.requestedFrames,requests);assert.equal(other.pendingFrames,0);await host.disconnect();}finally{other.restore();}
});

test('a CSS-zero scheduled frame does not reschedule until a valid resize shows the platform again',async()=>{
 const f=androidSessionFixture(),native=nativeHostFixture();try{const host=await connectAndroidHost(native.plugin),runtime=await startAndroidSession(f.canvas,host,f.bridge,f.visibility);let paints=0;runtime.startFrames(()=>paints++);f.setRect({x:0,y:0,w:0,h:0});const requests=f.requestedFrames;f.nextFrame(1000);assert.equal(paints,0);assert.equal(f.pendingFrames,0);assert.equal(f.requestedFrames,requests);f.setRect({x:0,y:0,w:1080,h:2400});f.emit('resize');assert.equal(f.pendingFrames,1);assert.equal(f.requestedFrames,requests+1);f.nextFrame(2000);assert.equal(paints,1);runtime.dispose();await host.disconnect();}finally{f.restore();}
});

import {sessionHost} from './helpers/session-fixtures.ts';
import {ACCOUNT_KEYS} from '../src/application/account-store.ts';
test('native Back minimizes a real faulted purchase repeatedly without retrying the pending account',async()=>{
 const f=androidSessionFixture(),native=nativeHostFixture();try{
  for(const [key,value] of sessionHost({wallet:160}).data)f.values.set(key,value);const host=await connectAndroidHost(native.plugin),runtime=await startAndroidSession(f.canvas,host,f.bridge,f.visibility),s=runtime.session,set=f.bridge.set.bind(f.bridge);
  f.bridge.set=(key,value)=>key===ACCOUNT_KEYS.a?JSON.stringify({v:1,ok:false,code:'IO_ERROR'}):set(key,value);s.action({type:'shop'});s.action({type:'purchase',item:'rotate'});s.action({type:'confirm'});assert.equal(s.view.accountBlocked,true);const saved=[...f.values],writes=f.writes.length;for(let n=0;n<4;n++)native.emit('backButton');await settle();assert.equal(native.minimized,4);assert.deepEqual([...f.values],saved);assert.equal(f.writes.length,writes);assert.equal(s.view.account?.wallet,160);runtime.dispose();await host.disconnect();
 }finally{f.restore();}
});
