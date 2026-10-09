import test from 'node:test';
import assert from 'node:assert/strict';
import {createBrowserPlatform} from '../src/platform/browser.ts';
import {createWechatPlatform,type WechatHost} from '../src/platform/wechat.ts';
import type {Platform,PointerEvent} from '../src/platform/types.ts';
import {assertProfile,createProfile,decodeProfile,encodeProfile,setProfileSettings,type Profile} from '../src/application/profile.ts';

class AudioHost {
 src='';loop=false;volume=1;currentTime=0;plays=0;pauses=0;stops=0;audible=false;failPlay=false;failPause=false;error:()=>void=()=>{};
 nextPlay:(()=>void|Promise<void>)|undefined;
 play():void|Promise<void>{this.plays++;if(this.failPlay)throw Error('audio unavailable');this.audible=true;return this.nextPlay?.();}
 pause():void{this.pauses++;this.audible=false;if(this.failPause)throw Error('pause unavailable');}
 stop():void{this.stops++;this.pause();this.currentTime=0;}
 destroy():void{}
 addEventListener(name:string,callback:()=>void):void{if(name==='error')this.error=callback;}
 onError(callback:()=>void):void{this.error=callback;}
}
function deferred(){let resolve!:()=>void,reject!:(error:Error)=>void;const promise=new Promise<void>((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};}
const settle=()=>new Promise(resolve=>setImmediate(resolve));
type Fixture={platform:Platform;audio:AudioHost[];down:()=>void;move:()=>void;up:()=>void;hide:()=>void;show:()=>void;pagehide:()=>void;pageshow:()=>void;creationFails:boolean;creationAttempts:number;failSetup:boolean;restore:()=>void};
function fixture(kind:'browser'|'wechat',onPointer:(event:PointerEvent)=>void=()=>{}):Fixture {
 const audio:AudioHost[]=[];const events=new Map<string,(()=>void)[]>();
 const bind=(name:string,callback:()=>void)=>events.set(name,[...events.get(name)??[],callback]);
 const emit=(name:string)=>{for(const callback of events.get(name)??[])callback();};
 const f={audio,creationFails:false,creationAttempts:0,failSetup:false,restore:()=>{}} as Fixture;
 const create=(src='')=>{f.creationAttempts++;if(f.creationFails)throw Error('creation unavailable');const item=new AudioHost();item.src=src;audio.push(item);let volume=1;Object.defineProperty(item,'volume',{get:()=>volume,set:(value:number)=>{if(f.failSetup)throw Error('setup unavailable');volume=value;}});return item;};
 const canvas={width:0,height:0,getContext:()=>({}),getBoundingClientRect:()=>({left:0,top:0,width:1080,height:1920}),setPointerCapture:()=>{},hasPointerCapture:()=>false,releasePointerCapture:()=>{},addEventListener:(name:string,callback:(event:unknown)=>void)=>bind(name,()=>callback({preventDefault:()=>{},pointerId:1,clientX:100,clientY:100}))};
 if(kind==='wechat'){
  const touch=(name:string)=>(callback:(event:unknown)=>void)=>bind(name,()=>callback({changedTouches:[{identifier:1,clientX:100,clientY:100}]}));
  const host={createCanvas:()=>canvas,getWindowInfo:()=>({windowWidth:1080,windowHeight:1920,pixelRatio:1}),onHide:(callback:()=>void)=>bind('hide',callback),onShow:(callback:()=>void)=>bind('show',callback),onTouchStart:touch('down'),onTouchMove:touch('move'),onTouchEnd:touch('up'),onTouchCancel:touch('cancel'),createInnerAudioContext:create} as unknown as WechatHost;
  f.platform=createWechatPlatform(host,{requestAnimationFrame:()=>1,now:()=>0});
  Object.assign(f,{down:()=>emit('down'),move:()=>emit('move'),up:()=>emit('up'),hide:()=>emit('hide'),show:()=>emit('show'),pagehide:()=>emit('hide'),pageshow:()=>emit('show')});
 }else{
  const previous=['window','document','Audio'].map(name=>[name,Object.getOwnPropertyDescriptor(globalThis,name)] as const);
  const doc={hidden:false,addEventListener:(name:string,callback:()=>void)=>bind(name,callback)};
  Object.defineProperty(globalThis,'window',{configurable:true,value:{devicePixelRatio:1,addEventListener:bind}});
  Object.defineProperty(globalThis,'document',{configurable:true,value:doc});
  Object.defineProperty(globalThis,'Audio',{configurable:true,value:function(src:string){return create(src);}});
  f.platform=createBrowserPlatform(canvas as unknown as HTMLCanvasElement);
  Object.assign(f,{down:()=>emit('pointerdown'),move:()=>emit('pointermove'),up:()=>emit('pointerup'),hide:()=>{doc.hidden=true;emit('visibilitychange');},show:()=>{doc.hidden=false;emit('visibilitychange');},pagehide:()=>emit('pagehide'),pageshow:()=>emit('pageshow')});
  f.restore=()=>{for(const [name,descriptor] of previous){if(descriptor)Object.defineProperty(globalThis,name,descriptor);else Reflect.deleteProperty(globalThis,name);}};
 }
 f.platform.onPointer(onPointer);f.platform.onHide(()=>{});f.platform.onShow(()=>{});return f;
}
function state(f:Fixture,enabled=true,paused=false):void{assert.equal(typeof f.platform.setMusicState,'function');f.platform.setMusicState!(enabled,paused);}
for(const kind of ['browser','wechat'] as const){
 test(`${kind} starts one local looping music handle only after pointer down and never per frame`,()=>{
  const f=fixture(kind);try{
   state(f);f.show();f.move();f.up();for(let i=0;i<30;i++)state(f);assert.equal(f.audio.length,0);
   f.down();assert.equal(f.audio.length,1);const music=f.audio[0];assert.equal(music.src,'assets/bgm.mp3');assert.equal(music.loop,true);assert.equal(music.volume,0.18);assert.equal(music.plays,1);
   for(let i=0;i<30;i++){state(f);f.down();}assert.equal(f.audio.length,1);assert.equal(music.plays,1);
  }finally{f.restore();}
 });
 test(`${kind} pointer callback applies a disabled setting before music can start`,()=>{
  const f=fixture(kind,()=>f.platform.setMusicState!(false,false));try{state(f);f.down();assert.equal(f.audio.length,0);}finally{f.restore();}
 });
 test(`${kind} a failure triggered by a pointer callback is retried only on a later interaction`,()=>{
  let enableOnDown=false;const f=fixture(kind,()=>{if(enableOnDown)state(f);});try{
   state(f);f.down();const music=f.audio[0];state(f,false);music.failPlay=true;enableOnDown=true;
   f.down();assert.equal(music.plays,2);for(let i=0;i<20;i++)state(f);assert.equal(music.plays,2);music.failPlay=false;f.down();assert.equal(music.plays,3);
  }finally{f.restore();}
 });
 test(`${kind} music pause preserves position and repeated setting changes are idempotent`,()=>{
  const f=fixture(kind);try{
   state(f);f.down();const music=f.audio[0];music.currentTime=42;state(f,true,true);assert.equal(music.audible,false);assert.equal(music.currentTime,42);const pauses=music.pauses;
   for(let i=0;i<30;i++)state(f,true,true);assert.equal(music.pauses,pauses);state(f);assert.equal(music.plays,2);state(f,false);assert.equal(music.audible,false);state(f,false);state(f);assert.equal(music.plays,3);assert.equal(f.audio.length,1);
  }finally{f.restore();}
 });
 test(`${kind} repeated hide and show pauses before callbacks and resumes once`,()=>{
  const f=fixture(kind);try{
   state(f);f.down();const music=f.audio[0];music.currentTime=17;let hidden=0;f.platform.onHide(()=>{assert.equal(music.audible,false);hidden++;});
   f.hide();f.hide();assert.ok(hidden>0);assert.equal(music.audible,false);assert.equal(music.currentTime,17);for(let i=0;i<30;i++)state(f);assert.equal(music.plays,1);
   f.show();f.show();assert.equal(music.plays,2);assert.equal(music.audible,true);assert.equal(f.audio.length,1);
  }finally{f.restore();}
 });
 test(`${kind} menu music resumes after Session includes hidden in its temporary paused state`,()=>{
  const f=fixture(kind);try{
   f.platform.onHide(()=>state(f,true,true));f.platform.onShow(()=>state(f,true,false));state(f);f.down();const music=f.audio[0];f.hide();assert.equal(music.audible,false);f.show();assert.equal(music.plays,2);assert.equal(music.audible,true);
  }finally{f.restore();}
 });
 test(`${kind} toggling off while hidden prevents automatic resumption until a new gesture`,()=>{
  const f=fixture(kind);try{
   state(f);f.down();const music=f.audio[0];f.hide();state(f,false);state(f);f.show();for(let i=0;i<10;i++)state(f);assert.equal(music.audible,false);assert.equal(music.plays,1);f.down();assert.equal(music.plays,2);
  }finally{f.restore();}
 });
 test(`${kind} show cannot start never-played music or resume a paused Session`,()=>{
  const f=fixture(kind);try{
   state(f,false);f.down();f.hide();state(f);f.show();assert.equal(f.audio.length,0);f.down();const music=f.audio[0];f.hide();f.platform.onShow(()=>state(f,true,true));f.show();assert.equal(music.plays,1);assert.equal(music.audible,false);
  }finally{f.restore();}
 });
 test(`${kind} music and cached sound effects stop independently`,()=>{
  const f=fixture(kind);try{
   state(f);f.down();const music=f.audio[0];f.platform.playSound('pick');const sound=f.audio[1];const pauses=music.pauses;
   f.platform.stopSounds?.();assert.equal(music.pauses,pauses);assert.equal(music.audible,true);f.platform.playSound('pick');const soundPauses=sound.pauses;state(f,false);assert.equal(sound.pauses,soundPauses);assert.equal(sound.plays,2);assert.equal(music.audible,false);
  }finally{f.restore();}
 });
 test(`${kind} rejected autoplay waits for a new gesture and stale rejection cannot cancel newer playback`,async()=>{
  const f=fixture(kind);try{
   state(f);f.down();const music=f.audio[0];state(f,false);const first=deferred();music.nextPlay=()=>first.promise;state(f);first.reject(Error('autoplay denied'));await settle();const count=music.plays;
   for(let i=0;i<20;i++)state(f);f.show();f.move();assert.equal(music.plays,count);
   const stale=deferred();music.nextPlay=()=>stale.promise;f.down();state(f,false);music.nextPlay=undefined;state(f);const current=music.plays;stale.reject(Error('old request'));await settle();state(f);assert.equal(music.plays,current);assert.equal(music.audible,true);
  }finally{f.restore();}
 });
 test(`${kind} a late resolved play is paused after hiding or disabling`,async()=>{
  const f=fixture(kind);try{
   state(f);f.down();const music=f.audio[0];state(f,false);
   for(const stop of [()=>state(f,false),()=>state(f,true,true),()=>f.hide()]){
    const pending=deferred();music.nextPlay=()=>pending.promise;state(f);stop();music.audible=true;pending.resolve();await settle();assert.equal(music.audible,false);const count=music.plays;for(let i=0;i<20;i++)state(f,false);assert.equal(music.plays,count);
   }
  }finally{f.restore();}
 });
 test(`${kind} pending and successful async play never duplicates the handle or retries each frame`,async()=>{
  const f=fixture(kind);try{
   state(f);f.down();const music=f.audio[0];state(f,false);const pending=deferred();music.nextPlay=()=>pending.promise;state(f);
   for(let i=0;i<20;i++){state(f);f.down();}assert.equal(music.plays,2);assert.equal(f.audio.length,1);pending.resolve();await settle();state(f);assert.equal(music.plays,2);assert.equal(music.audible,true);
  }finally{f.restore();}
 });
 test(`${kind} native errors block frame retries and explicit interactions reuse the handle`,()=>{
  const f=fixture(kind);try{
   state(f);f.down();const music=f.audio[0];music.error();for(let i=0;i<20;i++)state(f);f.hide();f.show();assert.equal(music.plays,1);music.nextPlay=undefined;f.down();assert.equal(music.plays,2);assert.equal(f.audio.length,1);
  }finally{f.restore();}
 });
 test(`${kind} creation setup playback and pause failures stay optional and bounded`,()=>{
  const f=fixture(kind);try{
   state(f);f.creationFails=true;assert.doesNotThrow(()=>f.down());for(let i=0;i<20;i++)state(f);assert.equal(f.audio.length,0);assert.equal(f.creationAttempts,1);
   f.creationFails=false;f.failSetup=true;assert.doesNotThrow(()=>f.down());assert.equal(f.audio.length,1);f.failSetup=false;for(let i=0;i<20;i++)state(f);assert.equal(f.audio[0].plays,0);f.down();const music=f.audio[0];assert.equal(music.plays,1);
   state(f,false);music.failPlay=true;assert.doesNotThrow(()=>state(f));for(let i=0;i<20;i++)state(f);assert.equal(music.plays,2);music.failPlay=false;f.down();assert.equal(music.plays,3);music.failPause=true;assert.doesNotThrow(()=>f.hide());assert.equal(f.audio.length,1);
  }finally{f.restore();}
 });
}
test('browser pagehide pauses and pageshow resumes its existing music context',()=>{
 const f=fixture('browser');try{state(f);f.down();const music=f.audio[0];f.pagehide();assert.equal(music.audible,false);f.pageshow();assert.equal(music.plays,2);assert.equal(f.audio.length,1);}finally{f.restore();}
});
test('wechat safely falls back to stop when a host has no pause method',()=>{
 const f=fixture('wechat');try{
  state(f);f.down();const music=f.audio[0];music.currentTime=21;Object.defineProperty(music,'pause',{value:undefined});music.stop=()=>{music.stops++;music.currentTime=0;music.audible=false;};
  state(f,false);assert.equal(music.stops,1);assert.equal(music.audible,false);state(f);assert.equal(music.plays,2);assert.equal(f.audio.length,1);
 }finally{f.restore();}
});
test('new profiles include separate enabled music while legacy two-setting records retain their shape',()=>{
 const fresh=createProfile();assert.deepEqual(fresh.settings,{sound:true,reducedMotion:false,music:true});assert.deepEqual(decodeProfile(encodeProfile(fresh)),fresh);
 const legacy={...fresh,settings:{sound:false,reducedMotion:true}};assertProfile(legacy);assert.deepEqual(decodeProfile(encodeProfile(legacy)).settings,legacy.settings);assert.equal(legacy.settings.sound,false);
 const changed=setProfileSettings(legacy,{music:false});assert.deepEqual(changed.settings,{sound:false,reducedMotion:true,music:false});assert.deepEqual({...changed,settings:legacy.settings},legacy);assert.deepEqual(setProfileSettings(changed,{sound:true}).settings,{sound:true,reducedMotion:true,music:false});
});
test('profile music validation rejects wrong types and unknown fields without schema changes',()=>{
 const profile=createProfile();for(const settings of [{...profile.settings,music:'false'},{...profile.settings,music:undefined},{...profile.settings,unexpected:true}])assert.throws(()=>assertProfile({...profile,settings}));
 assert.throws(()=>setProfileSettings(profile,{music:'false'} as unknown as Partial<Profile['settings']>));assert.equal(profile.schemaVersion,1);
});
