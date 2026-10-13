import test from 'node:test';
import assert from 'node:assert/strict';
import type {PointerEvent,SoundName} from '../src/platform/types.ts';
import {androidFixture,androidHost} from './helpers/android-platform-fixture.ts';
import type {NativeHostState} from '../src/platform/android-viewport.ts';
import {GameSession} from '../src/application/session.ts';
import {startInbound} from './helpers/session-fixtures.ts';
import {findPlayableMoves} from '../src/domain/playable.ts';
import {cellCenter,getTrayRects} from '../src/presentation/layout.ts';
import {touchDragLift} from '../src/presentation/touch-placement.ts';
import {AUDIO_LEVELS} from '../src/shared/audio-levels.ts';
import {MUSIC_LEVELS} from '../src/shared/music-levels.ts';
import {ANDROID_UI_CLICK_GAIN} from '../src/shared/ui-click-level.ts';

test('Android input inverse matches the rendering transform at DPR 1, 2 and 3',()=>{
 for(const dpr of [1,2,3]){
  const f=androidFixture({dpr,rect:{x:17,y:31,w:1080/dpr,h:2400/dpr}});try{
   const events:PointerEvent[]=[];f.platform.onPointer(event=>events.push(event));f.platform.beginFrame();
   assert.equal(f.canvas.width,1080);assert.equal(f.canvas.height,2400);assert.deepEqual(f.fills[f.fills.length-1],[0,0,1080,2400]);assert.deepEqual(f.transforms[f.transforms.length-1],[1,0,0,1,0,250]);
   f.pointer('pointerdown',17+540/dpr,31+1210/dpr);f.pointer('pointerup',17+540/dpr,31+1210/dpr);
   assert.deepEqual(events.map(event=>event.type),['down','up']);for(const event of events){assert.ok(Math.abs(event.point.x-540)<1e-9);assert.ok(Math.abs(event.point.y-960)<1e-9);}assert.equal(f.captured.size,0);
   assert.deepEqual(f.platform.overlayBounds?.(),{x:0,y:-250,w:1080,h:2400});assert.deepEqual(f.platform.backgroundBounds?.(),{x:0,y:-250,w:1080,h:2400});assert.deepEqual(f.platform.contentBounds?.(),{x:0,y:-150,w:1080,h:2220});assert.equal(f.platform.storage,f.storage);assert.equal(f.platform.writerLease,f.lease);
  }finally{f.restore();}
 }
});
test('system edges and contain bars do not start a gesture or capture a pointer',()=>{
 const f=androidFixture();try{const events:PointerEvent[]=[];f.platform.onPointer(event=>events.push(event));for(const y of [0,99,249,2170,2321,2400]){f.pointer('pointerdown',540,y);f.pointer('pointerup',540,y);}assert.deepEqual(events,[]);assert.equal(f.captured.size,0);}finally{f.restore();}
});
test('every active pointer is cancelled once on inset changes and stale moves or ups are ignored',()=>{
 const f=androidFixture();try{
  const events:PointerEvent[]=[];f.platform.onPointer(event=>events.push(event));f.pointer('pointerdown',300,900,1);f.pointer('pointerdown',600,900,2);
  f.updateHost({...androidHost,insetsPx:{...androidHost.insetsPx,top:150}});
  assert.deepEqual(events.map(event=>[event.type,event.id]),[['down',1],['down',2],['cancel',1],['cancel',2]]);assert.equal(f.captured.size,0);
  f.pointer('pointermove',300,900,1);f.pointer('pointerup',300,900,1);f.emit('lostpointercapture',{pointerId:2});assert.equal(events.length,4);
  f.platform.beginFrame();assert.deepEqual(f.transforms[f.transforms.length-1],[1,0,0,1,0,275]);f.pointer('pointerdown',540,1235,3);assert.deepEqual(events[events.length-1]?.point,{x:540,y:960});
 }finally{f.restore();}
});
test('CSS resize, window resize, focus loss and native hide each cancel captured input',()=>{
 const f=androidFixture();try{
  const events:PointerEvent[]=[];f.platform.onPointer(event=>events.push(event));
  f.pointer('pointerdown',300,900);f.setRect({x:10,y:20,w:540,h:1200});f.emit('resize');assert.equal(events[events.length-1]?.type,'cancel');f.platform.beginFrame();assert.deepEqual(f.transforms[f.transforms.length-1],[0.5,0,0,0.5,0,125]);
  f.pointer('pointerdown',280,625,2);f.emit('blur');assert.equal(events[events.length-1]?.id,2);assert.equal(events[events.length-1]?.type,'cancel');
  f.pointer('pointerdown',280,625,3);f.updateHost({...androidHost,active:false});assert.equal(events[events.length-1]?.id,3);assert.equal(events[events.length-1]?.type,'cancel');f.pointer('pointerdown',280,625,4);assert.equal(events[events.length-1]?.id,3);
 }finally{f.restore();}
});
test('invalid geometry cancels input and fails closed until valid native geometry is received',()=>{
 const f=androidFixture();try{
  const events:PointerEvent[]=[];f.platform.onPointer(event=>events.push(event));f.pointer('pointerdown',300,900);
  assert.throws(()=>f.updateHost({...androidHost,widthPx:0}),/viewport|dimension/i);assert.equal(events[events.length-1]?.type,'cancel');f.pointer('pointerdown',300,900,2);assert.equal(events.length,2);assert.throws(()=>f.platform.beginFrame(),/viewport|dimension/i);
  f.updateHost(androidHost);f.pointer('pointerdown',300,900,3);assert.equal(events[events.length-1]?.type,'down');assert.equal(events[events.length-1]?.id,3);
 }finally{f.restore();}
});
test('unowned and released hosts never allow input or manufacture a held lease',()=>{
 const f=androidFixture({host:{...androidHost,owner:false}});try{const events:PointerEvent[]=[];f.platform.onPointer(event=>events.push(event));f.pointer('pointerdown',300,900);assert.equal(events.length,0);f.updateHost(androidHost);f.pointer('pointerdown',300,900);assert.equal(events.length,1);f.lease.release();f.pointer('pointermove',300,900);assert.equal(events[events.length-1]?.type,'cancel');f.pointer('pointerdown',300,900,2);assert.equal(events.length,2);assert.equal(f.platform.writerLease?.status,'busy');}finally{f.restore();}
});
test('normal capture release preserves tap selection and placement through the safe viewport',()=>{
 const f=androidFixture();try{
  const session=new GameSession(f.platform,{seed:123,mode:'standard'});startInbound(session);f.platform.onPointer(event=>{if(event.type==='cancel')session.input.cancel(event.id);else session.input[event.type](event.point,event.id);});
  const tray=getTrayRects(session.state.candidates.length)[0],piece={x:tray.x+tray.w/2,y:tray.y+tray.h/2};
  const move=findPlayableMoves(session.state).find(move=>move.pieceId===session.state.candidates[0].id);assert.ok(move);const target=cellCenter(move.origin,session.state),before=session.state.commandIndex;
  f.pointer('pointerdown',piece.x,piece.y+250);f.pointer('pointerup',piece.x,piece.y+250);assert.equal(session.view.selectedPieceId,session.state.candidates[0].id);
  f.pointer('pointerdown',target.x,target.y+250);f.pointer('pointerup',target.x,target.y+250);assert.equal(session.state.commandIndex,before+1);
  f.pointer('pointerdown',piece.x,piece.y+250);f.updateHost({...androidHost,insetsPx:{...androidHost.insetsPx,bottom:120}});assert.equal(session.view.selectedPieceId,null);f.pointer('pointerup',target.x,target.y+250);assert.equal(session.state.commandIndex,before+1);
 }finally{f.restore();}
});
test('Android uses its click gain, shared other audio levels, cached effects, ducking and optional haptics',async()=>{
 const f=androidFixture();try{
  f.platform.setMusicState?.(true,false);const music=f.audio[0];assert.equal(music.src,'assets/bgm.mp3');assert.equal(music.loop,true);assert.equal(music.volume,MUSIC_LEVELS.normal);music.currentTime=23;
  f.platform.setMusicState?.(true,false,true);assert.equal(music.volume,MUSIC_LEVELS.paused);assert.equal(music.plays,1);assert.equal(music.currentTime,23);
  f.platform.playSound('pick');f.platform.playSound('ui_click');f.platform.playSound('pick');f.platform.playSound('unknown' as SoundName);assert.equal(f.audio.length,3);assert.equal(f.audio[1].volume,AUDIO_LEVELS.browserEffects);assert.equal(f.audio[2].volume,AUDIO_LEVELS.browserEffects*ANDROID_UI_CLICK_GAIN);
  f.platform.vibrate?.();assert.equal(f.vibrations,1);f.platform.stopSounds?.();assert.equal(music.audible,true);assert.equal(f.audio[1].currentTime,0);await new Promise(resolve=>setImmediate(resolve));
 }finally{f.restore();}
});
test('native lifecycle deduplicates hide/show, stops audio before callbacks, and keeps paused settings',()=>{
 const f=androidFixture();try{
  const events:string[]=[];f.platform.onHide(()=>{assert.equal(f.audio[0].audible,false);events.push('hide');f.platform.setMusicState?.(true,true);});f.platform.onShow(()=>{events.push('show');f.platform.setMusicState?.(true,true);});
  f.platform.setMusicState?.(true,false);f.platform.playSound('pick');const music=f.audio[0],sound=f.audio[1];sound.currentTime=0.1;sound.failPause=true;
  f.updateHost({...androidHost,active:false});f.updateHost({...androidHost,active:false});assert.deepEqual(events,['hide']);assert.equal(sound.audible,false);assert.equal(sound.currentTime,0);assert.equal(music.plays,1);
  f.platform.setMusicState?.(true,false);assert.equal(music.plays,1);f.updateHost(androidHost);f.updateHost(androidHost);assert.deepEqual(events,['hide','show']);assert.equal(music.audible,false);assert.equal(music.plays,1);
  f.platform.setMusicState?.(false,false);f.updateHost({...androidHost,active:false});f.updateHost(androidHost);assert.equal(music.plays,1);
 }finally{f.restore();}
});

test('malformed host updates cancel active input and reject without restoring stale geometry',()=>{
 const f=androidFixture();try{
  const events:PointerEvent[]=[];f.platform.onPointer(event=>events.push(event));f.pointer('pointerdown',300,900);
  assert.throws(()=>f.updateHost(null as unknown as NativeHostState),/viewport|dimension/i);
  assert.deepEqual(events.map(event=>event.type),['down','cancel']);f.pointer('pointerdown',300,900,2);assert.equal(events.length,2);
  f.updateHost(androidHost);f.pointer('pointerdown',300,900,3);assert.equal(events[events.length-1]?.id,3);
 }finally{f.restore();}
});
test('native state snapshots detect a changed physical window even when the resulting CSS transform is identical',()=>{
 const state={...androidHost,insetsPx:{...androidHost.insetsPx}},f=androidFixture({host:state});try{
  const events:PointerEvent[]=[];f.platform.onPointer(event=>events.push(event));f.pointer('pointerdown',300,900);
  state.widthPx*=2;state.heightPx*=2;state.insetsPx.top*=2;state.insetsPx.bottom*=2;f.updateHost(state);
  assert.deepEqual(events.map(event=>event.type),['down','cancel']);
  state.owner=false;f.pointer('pointerdown',300,900,2);assert.equal(events[events.length-1]?.type,'down');assert.equal(events[events.length-1]?.id,2);
 }finally{f.restore();}
});
test('captured dragging outside the interaction area emits no hittable point and loses capture exactly once',()=>{
 const f=androidFixture();try{
  const events:PointerEvent[]=[];f.platform.onPointer(event=>events.push(event));f.pointer('pointermove',300,900,9);f.pointer('pointerup',300,900,9);assert.equal(events.length,0);
  f.pointer('pointerdown',300,900);f.pointer('pointermove',300,100);assert.deepEqual(events[1].point,{x:-1,y:-1});
  f.emit('lostpointercapture',{pointerId:1});f.emit('lostpointercapture',{pointerId:1});f.pointer('pointerup',300,900);assert.deepEqual(events.map(event=>event.type),['down','move','cancel']);
 }finally{f.restore();}
});
test('touches before input subscription cannot capture or start music during startup',()=>{
 const f=androidFixture();try{f.pointer('pointerdown',300,900);assert.equal(f.captured.size,0);assert.equal(f.audio.length,0);}finally{f.restore();}
});

test('Android preserves touch, mouse and pen source for placement adaptation',()=>{
 const f=androidFixture();try{const events:PointerEvent[]=[];f.platform.onPointer(event=>events.push(event));
  for(const [index,pointerType] of ['touch','mouse','pen'].entries())for(const name of ['pointerdown','pointermove','pointerup'])f.emit(name,{pointerId:index+1,pointerType,clientX:400,clientY:1000,preventDefault(){}});
  assert.deepEqual(events.map(event=>event.pointerType),['touch','touch','touch','mouse','mouse','mouse','pen','pen','pen']);
 }finally{f.restore();}
});

for(const interrupt of ['resize','hide'] as const)test(`Android lifted touch drag ${interrupt} cannot commit a stale release`,()=>{
 const f=androidFixture();try{
  const s=new GameSession(f.platform,{seed:123,mode:'standard'});startInbound(s);f.platform.onPointer(event=>{if(event.type==='cancel')s.input.cancel(event.id);else if(event.type==='down')s.input.down(event.point,event.id,event.pointerType);else s.input[event.type](event.point,event.id);});
  const rect=getTrayRects(s.state.candidates.length)[0],move=findPlayableMoves(s.state).find(move=>move.pieceId===s.state.candidates[0].id);assert.ok(move);
  const target=cellCenter(move.origin,s.state),finger={x:target.x,y:target.y+touchDragLift(s.state)},before=s.state.commandIndex;
  const emit=(name:string,x:number,y:number)=>f.emit(name,{pointerId:7,pointerType:'touch',clientX:x,clientY:y+250,preventDefault(){}});
  emit('pointerdown',rect.x+rect.w/2,rect.y+rect.h/2);emit('pointermove',finger.x,finger.y);assert.deepEqual(s.view.hoverOrigin,move.origin);
  f.updateHost(interrupt==='resize'?{...androidHost,insetsPx:{...androidHost.insetsPx,top:150}}:{...androidHost,active:false});
  assert.equal(s.view.selectedPieceId,null);emit('pointerup',finger.x,finger.y);assert.equal(s.state.commandIndex,before);
 }finally{f.restore();}
});


test('only opted-in Android home accepts the safe tall area; system insets still reject and resize cancels',()=>{
 let home=true;const f=androidFixture({useHomeBounds:()=>home});try{
  const events:PointerEvent[]=[];f.platform.onPointer(event=>events.push(event));
  f.pointer('pointerdown',540,150);f.pointer('pointerup',540,150);assert.deepEqual(events.map(e=>e.point.y),[-100,-100]);
  f.pointer('pointerdown',540,2250);assert.equal(events[events.length-1]?.point.y,2000);
  f.updateHost({...androidHost,insetsPx:{...androidHost.insetsPx,bottom:150}});assert.equal(events[events.length-1]?.type,'cancel');
  const count=events.length;f.pointer('pointerup',540,2250);for(const y of [0,99,2399]){f.pointer('pointerdown',540,y);f.pointer('pointerup',540,y);}assert.equal(events.length,count);
  home=false;f.pointer('pointerdown',540,150);f.pointer('pointerup',540,150);assert.equal(events.length,count);
 }finally{f.restore();}
});
