import {L,mapClientPoint,type Rect} from '../presentation/layout.ts';
import {createMusicController} from './music.ts';
import {FRAME_BACKDROP,SOUND_NAMES,type CanvasSurface,type Platform,type PointerEvent,type SoundName} from './types.ts';

/** Douyin keeps the common asset mix; no WeChat asset gain or Android playback boost. */
export const DOUYIN_AUDIO_LEVELS=Object.freeze({effects:1});
const MAX_EFFECT_CONTEXTS=9; // Reserve the tenth concurrently playable context for music.

interface DouyinRect {left:number;top:number;right:number;bottom:number;width:number;height:number}
/** The official declarations return Object here; drawing is narrowed only after requesting 2D. */
interface DouyinCanvas {width:number;height:number;getContext(type:'2d'):object|null}
export interface DouyinSystemInfo {windowWidth:number;windowHeight:number;pixelRatio:number;safeArea?:DouyinRect}
export interface DouyinTouch {identifier:number;clientX?:number;clientY?:number;screenX?:number;screenY?:number}
export interface DouyinTouchEvent {changedTouches:DouyinTouch[]}
interface DouyinAudio {
 // api-typings 1.3.0 omits these documented writable properties. Set them before playback.
 src?:string;loop?:boolean;volume?:number;
 play():void|Promise<void>;pause?():void;stop():void;destroy():void;onError?(callback:()=>void):void;
}
interface DouyinImage {
 src:string;addEventListener?(type:'load'|'error',callback:(event:unknown)=>void):void;
 onload?:(()=>void)|null;onerror?:((error:unknown)=>void)|null;
}
export interface DouyinLaunchOptions {scene?:string;launch_from?:string;location?:string}
interface DouyinResult {errMsg?:string;errNo?:number}
interface SceneOptions {scene:'sidebar';fail?:(error:DouyinResult)=>void}
/** Small structural subset of the official tt API, independent of wx declarations. */
export interface DouyinHost {
 createCanvas():DouyinCanvas;getSystemInfoSync():DouyinSystemInfo;getMenuButtonLayout?():DouyinRect;
 getStorageSync(key:string):unknown;setStorageSync(key:string,value:string):void;removeStorageSync(key:string):void;
 getStorageInfoSync?():{keys:string[];currentSize:number;limitSize:number};
 onTouchStart(callback:(event:DouyinTouchEvent)=>void):void;onTouchMove(callback:(event:DouyinTouchEvent)=>void):void;
 onTouchEnd(callback:(event:DouyinTouchEvent)=>void):void;onTouchCancel(callback:(event:DouyinTouchEvent)=>void):void;
 onHide(callback:()=>void):void;onShow(callback:(options:DouyinLaunchOptions)=>void):void;
 /** Optional host extension, absent from official 1.3.0; onShow always refreshes verified system geometry. */
 onWindowResize?(callback:()=>void):void;
 createInnerAudioContext():DouyinAudio;createImage():DouyinImage;
 vibrateShort?(options:{fail?:(error:unknown)=>void}):void;
 getLaunchOptionsSync?():DouyinLaunchOptions;
 checkScene?(options:SceneOptions&{success?:(result:{isExist:boolean})=>void}):void;
 navigateToScene?(options:SceneOptions&{success?:(result:DouyinResult)=>void}):void;
}
export interface DouyinClock {requestAnimationFrame(callback:(time:number)=>void):number;now():number}
export interface DouyinEntrySource extends DouyinLaunchOptions {fromSidebar:boolean}
export interface DouyinPlatform extends Platform {
 getEntrySource():DouyinEntrySource;
 checkSidebar():Promise<boolean>;
 /** Call only from an explicit UI action. Neither bootstrap nor lifecycle calls this. */
 navigateToSidebar():Promise<boolean>;
}

function entrySource(options:DouyinLaunchOptions={}):DouyinEntrySource {
 return {scene:options.scene,launch_from:options.launch_from,location:options.location,fromSidebar:options.launch_from==='homepage'&&options.location==='sidebar_card'};
}
function validRect(rect:DouyinRect):boolean {
 return [rect.left,rect.top,rect.width,rect.height].every(Number.isFinite)&&rect.width>0&&rect.height>0;
}
function safeViewport(info:DouyinSystemInfo,menu:DouyinRect|undefined):Rect {
 let left=0,top=0,right=info.windowWidth,bottom=info.windowHeight;
 if(info.safeArea&&validRect(info.safeArea)){
  const safe=info.safeArea;
  left=Math.max(left,safe.left);top=Math.max(top,safe.top);right=Math.min(right,safe.left+safe.width);bottom=Math.min(bottom,safe.top+safe.height);
 }
 if(right<=left||bottom<=top){left=0;top=0;right=info.windowWidth;bottom=info.windowHeight;}
 // Reserve the entire capsule row, so the unchanged pause button cannot overlap native UI.
 if(menu&&validRect(menu)&&menu.left<right&&menu.left+menu.width>left){
  const capsuleBottom=menu.top+menu.height;
  if(menu.top>=0&&capsuleBottom>top&&capsuleBottom<bottom)top=capsuleBottom;
 }
 return {x:left,y:top,w:right-left,h:bottom-top};
}

export function createDouyinPlatform(host:DouyinHost,clock:DouyinClock):DouyinPlatform {
 // The first createCanvas call is the on-screen canvas. All previews remain lazy.
 const canvas=host.createCanvas(),context=canvas.getContext('2d');if(!context)throw Error('无法创建2D画布');
 const ctx=context as CanvasRenderingContext2D;
 const pointers:((event:PointerEvent)=>void)[]=[],hideCallbacks:(()=>void)[]=[],showCallbacks:(()=>void)[]=[];
 const activeTouches=new Set<number>();let hidden=false;
 const emit=(event:PointerEvent)=>{for(const callback of pointers)callback(event);};
 const cancelTouches=(ids=[...activeTouches])=>{for(const id of ids){if(!activeTouches.delete(id))continue;emit({type:'cancel',point:{x:-1,y:-1},id,pointerType:'touch'});}};
 let dpr=1,scale=1,offsetX=0,offsetY=0,viewport:Rect={x:0,y:0,w:L.width,h:L.height};
 const resize=()=>{
  cancelTouches();const info=host.getSystemInfoSync();
  if(!Number.isFinite(info.windowWidth)||info.windowWidth<=0||!Number.isFinite(info.windowHeight)||info.windowHeight<=0)throw Error('抖音窗口尺寸无效');
  let menu:DouyinRect|undefined;try{menu=host.getMenuButtonLayout?.();}catch{/* Optional on older hosts. */}
  dpr=Number.isFinite(info.pixelRatio)?Math.min(Math.max(info.pixelRatio,1),3):1;
  canvas.width=Math.round(info.windowWidth*dpr);canvas.height=Math.round(info.windowHeight*dpr);
  viewport=safeViewport(info,menu);scale=Math.min(viewport.w/L.width,viewport.h/L.height);
  offsetX=viewport.x+(viewport.w-L.width*scale)/2;offsetY=viewport.y+(viewport.h-L.height*scale)/2;
 };
 const sounds=new Map<SoundName,DouyinAudio>();let soundtrack:DouyinAudio|undefined;
 const music=createMusicController(onError=>{
  if(!soundtrack){soundtrack=host.createInnerAudioContext();try{soundtrack.onError?.(onError);}catch{/* Optional listener. */}}
  soundtrack.src='assets/bgm.mp3';soundtrack.loop=true;const audio=soundtrack;
  return {play:()=>audio.play(),pause:()=>{if(audio.pause)audio.pause();else audio.stop();},setVolume:(volume:number)=>{audio.volume=volume;}};
 });
 const stopSounds=()=>{for(const sound of sounds.values())try{sound.stop();}catch{/* Continue stopping the other cues and saving. */}};
 let source=entrySource();try{source=entrySource(host.getLaunchOptionsSync?.());}catch{/* Startup attribution is optional; gameplay is not. */}
 // Register synchronously at bootstrap, before session/art setup, to catch sidebar warm entry.
 host.onShow(options=>{source=entrySource(options);hidden=false;resize();for(const callback of showCallbacks)callback();music.show();});
 host.onHide(()=>{hidden=true;cancelTouches();music.hide();stopSounds();for(const callback of hideCallbacks)callback();});
 resize();try{host.onWindowResize?.(resize);}catch{/* Optional extension; the required onShow path always refreshes geometry. */}
 const convert=(type:PointerEvent['type'])=>(event:DouyinTouchEvent)=>{
  if(hidden)return;
  if(type==='cancel'){cancelTouches(event.changedTouches.length?event.changedTouches.map(touch=>touch.identifier):undefined);return;}
  const dispatch=()=>{for(const touch of event.changedTouches){
   if(type==='down')activeTouches.add(touch.identifier);else if(!activeTouches.has(touch.identifier))continue;
   if(type==='up')activeTouches.delete(touch.identifier);
   const client=Number.isFinite(touch.clientX)&&Number.isFinite(touch.clientY);
   const x=client?touch.clientX:touch.screenX,y=client?touch.clientY:touch.screenY;
   // Both host coordinate forms are logical screen pixels. DPR belongs only to backing-store drawing.
   const point=typeof x==='number'&&typeof y==='number'?mapClientPoint({x,y},viewport):null;
   emit({type,point:point??{x:-1,y:-1},id:touch.identifier,pointerType:'touch'});
  }};
  if(type==='down'&&event.changedTouches.length)music.gesture(dispatch);else dispatch();
 };
 host.onTouchStart(convert('down'));host.onTouchMove(convert('move'));host.onTouchEnd(convert('up'));host.onTouchCancel(convert('cancel'));
 return {
  frameBackdrop:FRAME_BACKDROP,
  createCanvasSurface:()=>{const surface=host.createCanvas();if(surface===canvas)throw Error('Preview surface must be offscreen');return surface as CanvasSurface;},
  writerLease:{status:'held',release(){this.status='unsupported';}},
  storage:{
   get:key=>{const value=host.getStorageSync(key);if(value===''||value===null||value===undefined)return null;if(typeof value!=='string')throw Error('存储格式无效');return value;},
   set:(key,value)=>host.setStorageSync(key,value),remove:key=>host.removeStorageSync(key),
   ...(host.getStorageInfoSync?{
    listKeys:(prefix:string)=>host.getStorageInfoSync!().keys.filter(key=>key.startsWith(prefix)).sort(),
    capacity:()=>{const info=host.getStorageInfoSync!();if(!Number.isFinite(info.currentSize)||info.currentSize<0||!Number.isFinite(info.limitSize)||info.limitSize<=0)throw Error('存储容量信息无效');return {usedBytes:Math.ceil(info.currentSize*1024),limitBytes:Math.floor(info.limitSize*1024)};},
   }:{}),
  },
  beginFrame:()=>{ctx.setTransform(1,0,0,1,0,0);ctx.fillStyle=FRAME_BACKDROP;ctx.fillRect(0,0,canvas.width,canvas.height);ctx.setTransform(scale*dpr,0,0,scale*dpr,offsetX*dpr,offsetY*dpr);return ctx;},
  backgroundBounds:()=>({x:(L.width-viewport.w/scale)/2,y:0,w:viewport.w/scale,h:L.height}),
  contentBounds:()=>({x:0,y:0,w:L.width,h:L.height}),
  overlayBounds:()=>({x:-offsetX/scale,y:-offsetY/scale,w:canvas.width/(scale*dpr),h:canvas.height/(scale*dpr)}),
  frame:callback=>clock.requestAnimationFrame(()=>callback(clock.now())),now:()=>clock.now(),wallTime:()=>Date.now(),
  onPointer:callback=>{pointers.push(callback);},onHide:callback=>{hideCallbacks.push(callback);},onShow:callback=>{showCallbacks.push(callback);},
  playSound:name=>{
   if(hidden||!SOUND_NAMES.includes(name))return;
   try{
    let sound=sounds.get(name);
    if(sound)sounds.delete(name);
    else if(sounds.size>=MAX_EFFECT_CONTEXTS){const oldest=sounds.entries().next().value!;sound=oldest[1];sounds.delete(oldest[0]);}
    else {sound=host.createInnerAudioContext();try{sound.onError?.(()=>{});}catch{/* Optional listener. */}}
    sounds.set(name,sound);sound.stop();const path=`assets/${name}.wav`;if(sound.src!==path)sound.src=path;
    sound.volume=DOUYIN_AUDIO_LEVELS.effects;
    const playing=sound.play();if(playing)void playing.catch(()=>{});
   }catch{/* Optional sound never blocks offline gameplay. */}
  },
  stopSounds,setMusicState:music.setState,
  vibrate:()=>{try{host.vibrateShort?.({fail:()=>{}});}catch{/* Unsupported haptics are silent. */}},
  loadImage:path=>new Promise((resolve,reject)=>{
   if(!/^assets\/[a-zA-Z0-9_./-]+$/.test(path)||path.split('/').some(part=>part==='..'||part==='.')){reject(Error('图片必须使用包内本地路径'));return;}
   const image=host.createImage(),loaded=()=>resolve(image as unknown as CanvasImageSource);
   if(image.addEventListener){image.addEventListener('load',loaded);image.addEventListener('error',reject);}
   else {image.onload=loaded;image.onerror=reject;}
   image.src=path;
  }),
  getEntrySource:()=>({...source}),
  checkSidebar:()=>new Promise(resolve=>{if(!host.checkScene){resolve(false);return;}try{host.checkScene({scene:'sidebar',success:result=>resolve(result.isExist===true),fail:()=>resolve(false)});}catch{resolve(false);}}),
  navigateToSidebar:()=>new Promise(resolve=>{if(!host.navigateToScene){resolve(false);return;}try{host.navigateToScene({scene:'sidebar',success:()=>resolve(true),fail:()=>resolve(false)});}catch{resolve(false);}}),
 };
}
