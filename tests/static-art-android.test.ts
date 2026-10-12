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
