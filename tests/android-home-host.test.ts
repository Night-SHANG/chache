import assert from 'node:assert/strict';
import test from 'node:test';
import {connectAndroidHost,startAndroidSession} from '../src/platform/android-host.ts';
import {androidSessionFixture,nativeHostFixture} from './helpers/android-host-fixture.ts';
import {androidHost} from './helpers/android-platform-fixture.ts';

test('Android host shares safe content geometry with presentation and enables extended input only on home',async()=>{
 const f=androidSessionFixture(),native=nativeHostFixture();let events=0;
 try{
  const host=await connectAndroidHost(native.plugin),runtime=await startAndroidSession(f.canvas,host,f.bridge,f.visibility,{onPointer:()=>{events++;return true;}});
  assert.equal(runtime.session.view.screen,'menu');assert.deepEqual(runtime.session.view.androidContentBounds,{x:0,y:-150,w:1080,h:2220});
  f.pointer('pointerdown',540,150);f.pointer('pointerup',540,150);assert.equal(events,2);
  runtime.session.view.confirmation={kind:'resetProfile'};f.pointer('pointerdown',540,150);f.pointer('pointerup',540,150);assert.equal(events,2);
  runtime.session.view.confirmation=null;runtime.session.view.screen='game';f.pointer('pointerdown',540,150);f.pointer('pointerup',540,150);assert.equal(events,2);
  runtime.session.view.screen='menu';native.setState({...androidHost,insetsPx:{...androidHost.insetsPx,top:200}});runtime.frame(16,()=>{});
  assert.deepEqual(runtime.session.view.androidContentBounds,{x:0,y:-100,w:1080,h:2120});
  f.pointer('pointerdown',540,199);f.pointer('pointerup',540,199);assert.equal(events,2);
  f.pointer('pointerdown',540,210);f.pointer('pointerup',540,210);assert.equal(events,4);
  runtime.dispose();await host.disconnect();
 }finally{f.restore();}
});
