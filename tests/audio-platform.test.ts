import test from 'node:test';
import assert from 'node:assert/strict';
import {createBrowserPlatform} from '../src/platform/browser.ts';
import {createWechatPlatform} from '../src/platform/wechat.ts';
import type {WechatHost} from '../src/platform/wechat.ts';
import type {Platform,SoundName} from '../src/platform/types.ts';

const names:SoundName[]=['pick','place','invalid','route_ready','forklift','ship','chain2','chain3','chain4','upgrade','shift','fail'];
class FakeAudio {
 private source='';private level=1;failSetup=false;currentTime=0;plays=0;stops=0;failPlay=false;rejectPlay=false;failStop=false;error:(()=>void)|undefined;
 constructor(src=''){this.source=src;}
 get src():string{return this.source;}
 set src(value:string){if(this.failSetup)throw Error('audio setup unavailable');this.source=value;}
 get volume():number{return this.level;}
 set volume(value:number){if(this.failSetup)throw Error('audio setup unavailable');this.level=value;}
 play():Promise<void>{this.plays++;if(this.failPlay)throw Error('audio unavailable');return this.rejectPlay?Promise.reject(Error('autoplay blocked')):Promise.resolve();}
 pause():void{this.stops++;if(this.failStop)throw Error('pause unavailable');}
 stop():void{this.pause();this.currentTime=0;}
 destroy():void{}
 onError(callback:()=>void):void{this.error=callback;}
}
type Fixture={platform:Platform;audio:FakeAudio[];hide:()=>void;show:()=>void;pagehide:()=>void;failCreation:()=>void;restore:()=>void};
function fixture(kind:'browser'|'wechat',options:{failSetup?:boolean}={}):Fixture {
 const audio:FakeAudio[]=[];let creationFails=false;const failCreation=()=>{creationFails=true;};
 const create=(src='')=>{if(creationFails)throw Error('audio creation unavailable');const item=new FakeAudio(src);item.failSetup=options.failSetup??false;audio.push(item);return item;};
 const canvas={width:0,height:0,getContext:()=>({}),getBoundingClientRect:()=>({left:0,top:0,width:1080,height:1920})};
 if(kind==='wechat'){
  let hide=()=>{},show=()=>{};
  const host={createCanvas:()=>canvas,getWindowInfo:()=>({windowWidth:1080,windowHeight:1920,pixelRatio:1}),onHide:(callback:()=>void)=>{hide=callback;},onShow:(callback:()=>void)=>{show=callback;},createInnerAudioContext:create} as unknown as WechatHost;
  return {platform:createWechatPlatform(host,{requestAnimationFrame:()=>1,now:()=>0}),audio,hide:()=>hide(),show:()=>show(),pagehide:()=>{},failCreation,restore:()=>{}};
 }
 const previous=['window','document','Audio'].map(name=>[name,Object.getOwnPropertyDescriptor(globalThis,name)] as const);
 const windowEvents=new Map<string,()=>void>(),documentEvents=new Map<string,()=>void>();const documentFake={hidden:false,addEventListener:(name:string,callback:()=>void)=>documentEvents.set(name,callback)};
 Object.defineProperty(globalThis,'window',{configurable:true,value:{devicePixelRatio:1,addEventListener:(name:string,callback:()=>void)=>windowEvents.set(name,callback)}});
 Object.defineProperty(globalThis,'document',{configurable:true,value:documentFake});
 Object.defineProperty(globalThis,'Audio',{configurable:true,value:function(src:string){return create(src);}});
 return {platform:createBrowserPlatform(canvas as unknown as HTMLCanvasElement),audio,hide:()=>{documentFake.hidden=true;documentEvents.get('visibilitychange')?.();},show:()=>{documentFake.hidden=false;documentEvents.get('visibilitychange')?.();},pagehide:()=>windowEvents.get('pagehide')?.(),failCreation,restore:()=>{for(const [name,descriptor] of previous){if(descriptor)Object.defineProperty(globalThis,name,descriptor);else Reflect.deleteProperty(globalThis,name);}}};
}
for(const kind of ['browser','wechat'] as const){
 test(`${kind} caches at most the 12 known local audio cues and ignores unknown runtime names`,()=>{
  const f=fixture(kind);try{
   for(let pass=0;pass<30;pass++)for(const name of names)f.platform.playSound(name);
   for(let i=0;i<30;i++)f.platform.playSound(`unknown-${i}` as SoundName);
   assert.equal(f.audio.length,12);assert.deepEqual(f.audio.map(item=>item.src).sort(),names.map(name=>`assets/${name}.wav`).sort());
  }finally{f.restore();}
 });
 test(`${kind} explicit stopSounds stops and rewinds every cached cue without replay on show`,()=>{
  const f=fixture(kind);try{
   for(const name of names)f.platform.playSound(name);for(const item of f.audio)item.currentTime=0.04;
   assert.equal(typeof f.platform.stopSounds,'function');const stops=f.audio.map(item=>item.stops);
   f.platform.stopSounds?.();f.platform.onShow(()=>{});f.show();
   f.audio.forEach((item,index)=>{assert.equal(item.stops,stops[index]+1);assert.equal(item.currentTime,0);assert.equal(item.plays,1);});
   f.platform.playSound('pick');assert.equal(f.audio.length,12);assert.equal(f.audio[0].plays,2);
  }finally{f.restore();}
 });
 test(`${kind} setup failures reuse one bounded handle and recover only on an explicit retry`,()=>{
  const f=fixture(kind,{failSetup:true});try{
   for(let i=0;i<30;i++)assert.doesNotThrow(()=>f.platform.playSound('ship'));
   assert.equal(f.audio.length,1);assert.equal(f.audio[0].plays,0);
   f.audio[0].failSetup=false;f.platform.onShow(()=>{});f.show();assert.equal(f.audio[0].plays,0);
   f.platform.playSound('ship');assert.equal(f.audio.length,1);assert.equal(f.audio[0].plays,1);assert.equal(f.audio[0].src,'assets/ship.wav');
  }finally{f.restore();}
 });
 test(`${kind} a failing stop cannot block other sounds or the hide lifecycle callback`,()=>{
  const f=fixture(kind);try{
   f.platform.playSound('ship');f.platform.playSound('pick');f.audio[0].failStop=true;let hidden=0;f.platform.onHide(()=>hidden++);
   const stops=f.audio[1].stops;assert.doesNotThrow(()=>f.hide());assert.equal(hidden,1);assert.equal(f.audio[1].stops,stops+1);
   const plays=f.audio.map(item=>item.plays);f.platform.onShow(()=>{});f.show();assert.deepEqual(f.audio.map(item=>item.plays),plays);
  }finally{f.restore();}
 });
 test(`${kind} play, callback, and creation failures never escape audio calls`,async()=>{
  const f=fixture(kind);try{
   f.platform.playSound('ship');const item=f.audio[0];item.failPlay=true;assert.doesNotThrow(()=>f.platform.playSound('ship'));
   item.failPlay=false;item.rejectPlay=true;assert.doesNotThrow(()=>f.platform.playSound('ship'));item.error?.();await new Promise(resolve=>setImmediate(resolve));
   f.failCreation();assert.doesNotThrow(()=>f.platform.playSound('upgrade'));
   item.rejectPlay=false;assert.doesNotThrow(()=>f.platform.playSound('ship'));assert.equal(f.audio.length,1);
  }finally{f.restore();}
 });
}
test('browser pagehide stops all cached sounds even when one pause fails',()=>{
 const f=fixture('browser');try{
  f.platform.playSound('ship');f.platform.playSound('pick');f.audio[0].failStop=true;f.audio[1].currentTime=0.08;let hidden=0;f.platform.onHide(()=>hidden++);
  assert.doesNotThrow(()=>f.pagehide());assert.equal(hidden,1);assert.equal(f.audio[1].stops,1);assert.equal(f.audio[1].currentTime,0);
 }finally{f.restore();}
});
