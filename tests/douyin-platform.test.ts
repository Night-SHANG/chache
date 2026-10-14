import test from 'node:test';
import assert from 'node:assert/strict';
import {createCanvas,type Canvas} from '@napi-rs/canvas';
import {createDouyinPlatform,DOUYIN_AUDIO_LEVELS,type DouyinHost,type DouyinSystemInfo,type DouyinLaunchOptions,type DouyinTouchEvent} from '../src/platform/douyin.ts';
import {SOUND_NAMES,type PointerEvent} from '../src/platform/types.ts';
import {MUSIC_LEVELS} from '../src/shared/music-levels.ts';

class AudioContext {
 src='';loop=false;volume=1;plays=0;stops=0;pauses=0;playing=false;failStop=false;rejectPlay=false;
 error:()=>void=()=>{};
 play():void|Promise<void>{this.plays++;this.playing=true;if(this.rejectPlay)return Promise.reject(Error('autoplay denied'));}
 pause():void{this.pauses++;this.playing=false;}
 stop():void{this.stops++;if(this.failStop)throw Error('stop failed');this.playing=false;}
 destroy():void{this.playing=false;}
 onError(callback:()=>void):void{this.error=callback;}
}
function fixture(extra:Partial<DouyinHost>={},info:DouyinSystemInfo={windowWidth:400,windowHeight:800,pixelRatio:2}) {
 const calls:string[]=[],canvases:Canvas[]=[],audio:AudioContext[]=[],store=new Map<string,unknown>();
 const touch=new Map<string,(event:DouyinTouchEvent)=>void>();let hide=()=>{},show:(options:DouyinLaunchOptions)=>void=()=>{},resize=()=>{};
 const images:{src:string;onload:(()=>void)|null;onerror:((error:unknown)=>void)|null}[]=[];
 const host:DouyinHost={
  createCanvas:()=>{calls.push('canvas');const canvas=createCanvas(1,1);canvases.push(canvas);return canvas as unknown as ReturnType<DouyinHost['createCanvas']>;},
  getSystemInfoSync:()=>{calls.push('system');return info;},
  getStorageSync:key=>store.get(key)??'',setStorageSync:(key,value)=>{store.set(key,value);},removeStorageSync:key=>{store.delete(key);},
  getStorageInfoSync:()=>({keys:[...store.keys()],currentSize:1.25,limitSize:10240}),
  onTouchStart:callback=>{touch.set('down',callback);},onTouchMove:callback=>{touch.set('move',callback);},onTouchEnd:callback=>{touch.set('up',callback);},onTouchCancel:callback=>{touch.set('cancel',callback);},
  onHide:callback=>{hide=callback;},onShow:callback=>{calls.push('onShow');show=callback;},onWindowResize:callback=>{resize=callback;},
  createInnerAudioContext:()=>{const context=new AudioContext();audio.push(context);return context;},
  createImage:()=>{const image={src:'',onload:null,onerror:null};images.push(image);return image;},...extra,
 };
 const platform=createDouyinPlatform(host,{requestAnimationFrame:callback=>{callback(123);return 9;},now:()=>321});
 return {platform,host,calls,canvases,audio,store,images,info,hide:()=>hide(),show:(options:DouyinLaunchOptions={})=>show(options),resize:()=>resize(),touch:(type:string,event:DouyinTouchEvent)=>touch.get(type)?.(event)};
}
const event=(id=1,x=200,y=400):DouyinTouchEvent=>({changedTouches:[{identifier:id,clientX:x,clientY:y,screenX:x+20,screenY:y+20}]});

// Mutation targets: using wx/window geometry, allocating previews first, or multiplying input by DPR.
for(const dpr of [1,2,3])test(`Douyin screen canvas is first and drawing/input agree at DPR ${dpr}`,()=>{
 const f=fixture({}, {windowWidth:400,windowHeight:800,pixelRatio:dpr});
 assert.equal(f.calls[0],'canvas');assert.equal(f.canvases.length,1);assert.equal(f.canvases[0].width,400*dpr);
 const points:PointerEvent[]=[];f.platform.onPointer(e=>points.push(e));f.touch('down',event());
 assert.equal(points[0].point.x,540);assert.equal(points[0].point.y,960);
 const ctx=f.platform.beginFrame(),matrix=ctx.getTransform();assert.ok(Math.abs(matrix.a-400/1080*dpr)<1e-6);
 assert.equal(f.platform.frame(()=>{}),9);assert.equal(f.platform.now(),321);
 const preview=f.platform.createCanvasSurface?.();assert.equal(f.canvases.length,2);assert.notEqual(preview,f.canvases[0]);
 assert.equal(f.platform.beginFrame(),f.canvases[0].getContext('2d'));
});
test('Douyin uses client touch coordinates first and falls back to logical screen coordinates',()=>{
 const f=fixture(),received:PointerEvent[]=[];f.platform.onPointer(e=>received.push(e));
 f.touch('down',event());f.touch('up',event());
 f.touch('down',{changedTouches:[{identifier:2,screenX:200,screenY:400}]});
 assert.deepEqual(received.map(e=>e.point),[{x:540,y:960},{x:540,y:960},{x:540,y:960}]);
 f.touch('down',{changedTouches:[{identifier:3,clientX:NaN,clientY:Infinity,screenX:200,screenY:400}]});assert.deepEqual(received[received.length-1]?.point,{x:540,y:960});
});
test('Douyin safe area and native capsule remain outside game content and resize cancels held touch',()=>{
 const f=fixture({getMenuButtonLayout:()=>({left:300,right:390,top:32,bottom:72,width:90,height:40})},{windowWidth:400,windowHeight:800,pixelRatio:2,safeArea:{left:10,right:390,top:24,bottom:780,width:380,height:756}});
 const received:PointerEvent[]=[];f.platform.onPointer(e=>received.push(e));const matrix=f.platform.beginFrame().getTransform();
 assert.ok(matrix.f/2>=72,'content must be below the capsule');
 const content=f.platform.contentBounds?.();assert.ok(content);assert.equal(content.x,0);assert.equal(content.y,0);assert.equal(content.w,1080);assert.equal(content.h,1920);
 f.touch('down',event(7,200,400));f.info.windowWidth=420;f.resize();
 assert.deepEqual(received[received.length-1],{type:'cancel',point:{x:-1,y:-1},id:7,pointerType:'touch'});
 const count=received.length;f.touch('up',event(7));assert.equal(received.length,count,'stale up must not resurrect a resized gesture');
 assert.equal(f.canvases[0].width,840);
});
test('Douyin tolerates absent or throwing capsule APIs without corrupting the safe viewport',()=>{
 for(const extra of [{},{getMenuButtonLayout:()=>{throw Error('unsupported');}},{getMenuButtonLayout:()=>({left:0,right:0,top:0,bottom:0,width:0,height:0})}]){
  const f=fixture(extra);const matrix=f.platform.beginFrame().getTransform();assert.ok(Number.isFinite(matrix.a));assert.ok(matrix.a>0);
 }
});
test('an unsupported optional resize listener cannot abort bootstrap and onShow still refreshes geometry',()=>{
 const f=fixture({onWindowResize:()=>{throw Error('optional resize API unsupported');}});
 assert.equal(f.canvases[0].width,800);f.info.windowWidth=420;f.show();
 assert.equal(f.canvases[0].width,840);assert.ok(f.platform.beginFrame());
});
test('Douyin refuses invalid screen geometry and a preview alias of the screen',()=>{
 assert.throws(()=>fixture({}, {windowWidth:0,windowHeight:800,pixelRatio:2}),/尺寸/);
 const canvas=createCanvas(1,1);const f=fixture({createCanvas:()=>canvas as unknown as ReturnType<DouyinHost['createCanvas']>});assert.throws(()=>f.platform.createCanvasSurface?.(),/offscreen/);
});
test('Douyin storage preserves string envelopes, missing values and host failures',()=>{
 const f=fixture();assert.equal(f.platform.storage.get('missing'),null);f.platform.storage.set('run','{"v":4}');assert.equal(f.store.get('run'),'{"v":4}');
 for(const value of ['',null,undefined]){f.store.set('empty',value);assert.equal(f.platform.storage.get('empty'),null);}
 for(const value of [1,false,{},[]]){f.store.set('bad',value);assert.throws(()=>f.platform.storage.get('bad'),/格式/);}
 f.store.set('warehouse.z','a');f.store.set('warehouse.a','b');assert.deepEqual(f.platform.storage.listKeys?.('warehouse.'),['warehouse.a','warehouse.z']);
 assert.deepEqual(f.platform.storage.capacity?.(),{usedBytes:1280,limitBytes:10485760});
 f.platform.storage.remove('run');assert.equal(f.platform.storage.get('run'),null);
 const error=Error('quota exceeded');const broken=fixture({setStorageSync:()=>{throw error;},getStorageSync:()=>{throw error;},removeStorageSync:()=>{throw error;}});
 assert.throws(()=>broken.platform.storage.set('run','x'),e=>e===error);assert.throws(()=>broken.platform.storage.get('run'),e=>e===error);assert.throws(()=>broken.platform.storage.remove('run'),e=>e===error);
});
test('Douyin storage capacity rejects malformed host reports instead of claiming available space',()=>{
 for(const [currentSize,limitSize] of [[-1,1],[NaN,1],[1,0],[1,Infinity]]){
  const f=fixture({getStorageInfoSync:()=>({keys:[],currentSize,limitSize})});assert.throws(()=>f.platform.storage.capacity?.(),/容量/);
 }
 const f=fixture({getStorageInfoSync:undefined});assert.equal(f.platform.storage.capacity,undefined);assert.equal(f.platform.storage.listKeys,undefined);
});
test('Douyin hide cancels active touches before saving callbacks and suppresses stale/hidden input',()=>{
 const f=fixture(),trace:string[]=[];f.platform.onPointer(e=>trace.push(`${e.type}:${e.id}`));f.platform.onHide(()=>trace.push('save'));f.platform.onShow(()=>trace.push('show'));
 f.touch('down',event(1));f.touch('down',event(2));f.touch('up',event(2));f.hide();f.touch('move',event(1));f.touch('up',event(1));f.touch('down',event(3));f.show();
 assert.deepEqual(trace,['down:1','down:2','up:2','cancel:1','save','show']);
 f.touch('down',event(4));f.touch('cancel',{changedTouches:[]});assert.equal(trace[trace.length-1],'cancel:4');
});
test('Douyin all thirteen effects use unattenuated common WAV volume with at most nine effects plus one music context',()=>{
 const f=fixture();f.platform.setMusicState?.(true,false);
 for(let pass=0;pass<4;pass++)for(const name of SOUND_NAMES){f.platform.playSound(name);assert.equal(f.audio.find(a=>a.src===`assets/${name}.wav`)?.volume,1,`${name} must use the original WAV at volume 1`);assert.ok(f.audio.filter(a=>a.playing).length<=10);assert.ok(f.audio.length<=10);}
 assert.equal(f.audio.length,10);const music=f.audio.find(a=>a.src==='assets/bgm.mp3');assert.ok(music);assert.equal(music.loop,true);assert.equal(music.volume,MUSIC_LEVELS.normal);
 f.platform.playSound('place');assert.equal(f.audio.find(a=>a.src==='assets/place.wav')?.volume,1);
 f.platform.playSound('ui_click');assert.equal(f.audio.find(a=>a.src==='assets/ui_click.wav')?.volume,1);
 assert.deepEqual(DOUYIN_AUDIO_LEVELS,{effects:1});f.platform.playSound('unknown' as never);assert.equal(f.audio.length,10);
 f.hide();assert.ok(f.audio.every(a=>!a.playing));const plays=f.audio.reduce((n,a)=>n+a.plays,0);f.platform.playSound('ship');assert.equal(f.audio.reduce((n,a)=>n+a.plays,0),plays);
 f.show();assert.equal(music.playing,true);assert.ok(f.audio.filter(a=>a.src!=='assets/bgm.mp3').every(a=>!a.playing));
});
test('Douyin audio failures stay contained and music retries only on a gesture',async()=>{
 const f=fixture();f.platform.setMusicState?.(true,false);const music=f.audio[0];music.error();const plays=music.plays;f.show();f.platform.setMusicState?.(true,false);assert.equal(music.plays,plays);
 f.touch('down',event());assert.equal(music.plays,plays+1);
 f.platform.playSound('ship');f.audio[1].rejectPlay=true;assert.doesNotThrow(()=>f.platform.playSound('ship'));await new Promise(resolve=>setImmediate(resolve));
 f.audio[1].failStop=true;f.platform.playSound('pick');let saved=false;f.platform.onHide(()=>{saved=true;});assert.doesNotThrow(()=>f.hide());assert.equal(saved,true);
});
test('Douyin local images retain their package paths and reject remote or traversing paths',async()=>{
 const f=fixture();const result=f.platform.loadImage('assets/art/home.png');assert.equal(f.images[0].src,'assets/art/home.png');f.images[0].onload?.();assert.equal(await result,f.images[0]);
 for(const path of ['https://example.com/a.png','//example.com/a.png','../art.png','assets/../a.png','/assets/a.png'])await assert.rejects(f.platform.loadImage(path),/本地/);
 assert.equal(f.images.length,1);const failed=f.platform.loadImage('assets/missing.png');f.images[1].onerror?.(Error('missing'));await assert.rejects(failed,/missing/);
});
test('Douyin image loading uses the official addEventListener interface when available',async()=>{
 const listeners=new Map<string,(event:unknown)=>void>();const image={src:'',addEventListener:(type:string,listener:(event:unknown)=>void)=>{listeners.set(type,listener);}};
 const f=fixture({createImage:()=>image});const pending=f.platform.loadImage('assets/art/menu.png');
 assert.equal(listeners.size,2);assert.equal(image.src,'assets/art/menu.png');listeners.get('load')?.({});assert.equal(await pending,image);
 const failed=f.platform.loadImage('assets/art/missing.png');listeners.get('error')?.(Error('image failed'));await assert.rejects(failed,/image failed/);
});
test('Douyin captures launch and latest onShow source synchronously without automatic navigation',async()=>{
 let checks=0,navigations=0;
 const f=fixture({getLaunchOptionsSync:()=>({scene:'021036',launch_from:'homepage',location:'sidebar_card'}),checkScene:options=>{checks++;assert.equal(options.scene,'sidebar');options.success?.({isExist:true});},navigateToScene:options=>{navigations++;assert.equal(options.scene,'sidebar');options.success?.({errMsg:'navigateToScene:ok'});}});
 assert.equal(f.platform.getEntrySource().fromSidebar,true);assert.equal(checks,0);assert.equal(navigations,0);
 f.show({launch_from:'other',location:'sidebar_card'});assert.equal(f.platform.getEntrySource().fromSidebar,false);
 f.show({launch_from:'homepage',location:'sidebar_card'});assert.equal(f.platform.getEntrySource().fromSidebar,true);
 assert.equal(await f.platform.checkSidebar(),true);assert.equal(checks,1);assert.equal(navigations,0);
 assert.equal(await f.platform.navigateToSidebar(),true);assert.equal(navigations,1);
});
test('Douyin optional sidebar and haptic failures degrade without throwing or granting rewards',async()=>{
 for(const extra of [{},{checkScene:()=>{throw Error('unsupported');},navigateToScene:()=>{throw Error('unsupported');},vibrateShort:()=>{throw Error('unsupported');}},{checkScene:(options:Parameters<NonNullable<DouyinHost['checkScene']>>[0])=>options.fail?.({errMsg:'unsupported'}),navigateToScene:(options:Parameters<NonNullable<DouyinHost['navigateToScene']>>[0])=>options.fail?.({errMsg:'unsupported'})}]){
  const f=fixture(extra);assert.equal(await f.platform.checkSidebar(),false);assert.equal(await f.platform.navigateToSidebar(),false);assert.doesNotThrow(()=>f.platform.vibrate?.());
 }
});
