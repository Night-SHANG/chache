import assert from 'node:assert/strict';
import test from 'node:test';
import {connectAndroidHost,startAndroidSession} from '../src/platform/android-host.ts';
import {androidSessionFixture,nativeHostFixture} from './helpers/android-host-fixture.ts';
import {startInbound} from './helpers/session-fixtures.ts';

test('Android presentation hook owns unseen pointer/back input and freezes only gameplay time',async()=>{
 const f=androidSessionFixture(),native=nativeHostFixture();let blocked=true,pointers=0,backs=0;try{
  const host=await connectAndroidHost(native.plugin),runtime=await startAndroidSession(f.canvas,host,f.bridge,f.visibility,{isBlocked:()=>blocked,onPointer:()=>{pointers++;return true;},onBack:()=>{backs++;return true;}});startInbound(runtime.session);const view=runtime.session.view;runtime.frame(100,()=>{});const elapsed=view.elapsed,saved=[...f.values];runtime.frame(5100,()=>{});assert.equal(view.elapsed,elapsed);assert.deepEqual([...f.values],saved);assert.ok(f.audio.some(audio=>audio.src==='assets/bgm.mp3'&&audio.audible));
  f.pointer('pointerdown',540,950);f.pointer('pointerup',540,950);assert.ok(pointers>=2);native.emit('backButton');assert.equal(backs,1);assert.equal(view.paused,false);blocked=false;runtime.frame(5116,()=>{});assert.equal(view.elapsed,elapsed+16);runtime.dispose();await host.disconnect();
 }finally{f.restore();}
});

test('Android launch cover freezes gameplay until first complete frame and stays dismissed on resume',async()=>{
 const {AndroidLaunchSurface}=await import('../src/platform/android-launch-surface.ts');
 const f=androidSessionFixture(),native=nativeHostFixture(),status={hidden:false,textContent:'正在启动…'},launch=new AndroidLaunchSurface(status);let ready=false,draws=0,pointers=0;
 try{
  const host=await connectAndroidHost(native.plugin),runtime=await startAndroidSession(f.canvas,host,f.bridge,f.visibility,{isBlocked:()=>launch.isCovering||!ready,onPointer:()=>{if(!launch.isCovering)pointers++;return true;}});
  startInbound(runtime.session);const view=runtime.session.view;
  runtime.startFrames(()=>launch.paint(ready?'ready':'loading',()=>{assert.equal(ready,true);draws++;}));f.nextFrame(100);const elapsed=view.elapsed;
  f.pointer('pointerdown',540,950);f.nextFrame(5100);assert.equal(draws,0);assert.equal(view.elapsed,elapsed);assert.equal(pointers,0);
  f.setHidden(true);ready=true;f.nextFrame(5200);assert.equal(draws,0);assert.equal(status.hidden,false);
  f.setHidden(false);f.nextFrame(5300);assert.equal(draws,1);assert.equal(status.hidden,true);assert.equal(view.elapsed,elapsed);
  f.nextFrame(5316);assert.equal(view.elapsed,elapsed);assert.equal(view.paused,true);
  f.setHidden(true);f.nextFrame(6000);assert.equal(draws,2);f.setHidden(false);f.nextFrame(6100);assert.equal(draws,3);assert.equal(status.hidden,true);
  runtime.dispose();await host.disconnect();assert.equal(f.pendingFrames,0);
 }finally{f.restore();}
});
