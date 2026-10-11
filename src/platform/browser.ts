import {AUDIO_LEVELS} from '../shared/audio-levels.ts';
import {MUSIC_LEVELS} from '../shared/music-levels.ts';
import {UI_CLICK_GAIN} from '../shared/ui-click-level.ts';
import type { Platform, PointerEvent, SoundName } from './types.ts';
import { SOUND_NAMES } from './types.ts';
import { createMusicController } from './music.ts';
import { L, mapClientPoint } from '../presentation/layout.ts';
import type {WriterLease} from './writer-lease.ts';
export function createBrowserPlatform(canvas:HTMLCanvasElement,writerLease:WriterLease={status:'unsupported',release(){}}):Platform {
 const ctx=canvas.getContext('2d');if(!ctx)throw Error('无法创建2D画布');
 let rect={x:0,y:0,w:1,h:1},scale=1,dpr=1;
 const resize=()=>{const r=canvas.getBoundingClientRect();rect={x:r.left,y:r.top,w:r.width,h:r.height};dpr=Math.min(window.devicePixelRatio||1,3);canvas.width=Math.round(r.width*dpr);canvas.height=Math.round(r.height*dpr);scale=Math.min(r.width/L.width,r.height/L.height);};
 resize();window.addEventListener('resize',resize);
 const sounds=new Map<SoundName,HTMLAudioElement>();
 const showCallbacks:(()=>void)[]=[];
 let soundtrack:HTMLAudioElement|undefined;
 const music=createMusicController(onError=>{
  if(!soundtrack){soundtrack=new Audio('assets/bgm.mp3');try{soundtrack.addEventListener?.('error',onError);}catch{/* Optional host error listener. */}}
  soundtrack.loop=true;soundtrack.volume=MUSIC_LEVELS.normal;
  const audio=soundtrack;return {play:()=>audio.play(),pause:()=>audio.pause(),setVolume:(volume:number)=>{audio.volume=volume;}};
 });
 const stopSounds=()=>{for(const audio of sounds.values()){
  try{audio.pause();}catch{/* A broken audio handle must not block lifecycle callbacks or the other cues. */}
  try{audio.currentTime=0;}catch{/* Some hosts cannot seek before decoding. */}
 }};
 return {
  createCanvasSurface:()=>{const surface=document.createElement('canvas');if(surface===canvas)throw Error('Preview surface must be offscreen');return surface;},
  writerLease,
  storage:{get:key=>window.localStorage.getItem(key),set:(key,value)=>window.localStorage.setItem(key,value),remove:key=>window.localStorage.removeItem(key),listKeys:prefix=>{
   const store=window.localStorage,keys:string[]=[];for(let i=0;i<store.length;i++){const key=store.key(i);if(key!==null&&key.startsWith(prefix))keys.push(key);}return keys.sort();
  }},
  beginFrame:()=>{ctx.setTransform(1,0,0,1,0,0);ctx.fillStyle='#0c131c';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.setTransform(scale*dpr,0,0,scale*dpr,(rect.w-L.width*scale)*dpr/2,(rect.h-L.height*scale)*dpr/2);return ctx;},
  backgroundBounds:()=>scale>0&&Number.isFinite(rect.w/scale)?{x:(L.width-rect.w/scale)/2,y:0,w:rect.w/scale,h:L.height}:undefined,
  overlayBounds:()=>scale>0&&Number.isFinite(canvas.width/(scale*dpr))?{x:(L.width-rect.w/scale)/2,y:(L.height-rect.h/scale)/2,w:canvas.width/(scale*dpr),h:canvas.height/(scale*dpr)}:undefined,
  frame:callback=>window.requestAnimationFrame(callback),now:()=>performance.now(),wallTime:()=>Date.now(),
  onPointer:callback=>{
   const activePointers=new Set<number>();
   const cancel=(id:number)=>{if(activePointers.delete(id))callback({type:'cancel',point:{x:-1,y:-1},id});};
   const bind=(name:string,type:PointerEvent['type'])=>canvas.addEventListener(name,event=>{
    const e=event as globalThis.PointerEvent;e.preventDefault();
    if(type==='down'){activePointers.add(e.pointerId);canvas.setPointerCapture(e.pointerId);}
    else if(type==='up'||type==='cancel')activePointers.delete(e.pointerId);
    const point=mapClientPoint({x:e.clientX,y:e.clientY},rect)??{x:-1,y:-1};const dispatch=()=>callback({type,point,id:e.pointerId});if(type==='down')music.gesture(dispatch);else dispatch();
    if((type==='up'||type==='cancel')&&canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);
   });
   bind('pointerdown','down');bind('pointermove','move');bind('pointerup','up');bind('pointercancel','cancel');
   canvas.addEventListener('lostpointercapture',event=>cancel((event as globalThis.PointerEvent).pointerId));
   window.addEventListener('blur',()=>{for(const id of [...activePointers]){
    cancel(id);try{if(canvas.hasPointerCapture(id))canvas.releasePointerCapture(id);}catch{/* Focus loss may already have released native capture. */}
   }});
  },
  onWheel:callback=>canvas.addEventListener('wheel',event=>{
   if(event.ctrlKey||!Number.isFinite(event.deltaY)||event.deltaY===0||scale<=0)return;
   const point=mapClientPoint({x:event.clientX,y:event.clientY},rect);if(!point)return;
   const pixels=event.deltaY*(event.deltaMode===1?16:event.deltaMode===2?rect.h:1),deltaY=pixels/scale;
   if(Number.isFinite(deltaY)&&callback({point,deltaY}))event.preventDefault();
  },{passive:false}),
  onHide:callback=>{const hide=()=>{music.hide();stopSounds();callback();};document.addEventListener('visibilitychange',()=>{if(document.hidden)hide();});window.addEventListener('pagehide',hide);},
  onShow:callback=>{showCallbacks.push(callback);if(showCallbacks.length!==1)return;const show=()=>{for(const listener of showCallbacks)listener();music.show();};document.addEventListener('visibilitychange',()=>{if(!document.hidden)show();});window.addEventListener('pageshow',show);},
  playSound:name=>{if(!SOUND_NAMES.includes(name))return;try{let audio=sounds.get(name);if(!audio){audio=new Audio(`assets/${name}.wav`);sounds.set(name,audio);}audio.volume=AUDIO_LEVELS.browserEffects*(name==='ui_click'?UI_CLICK_GAIN:1);audio.currentTime=0;void audio.play().catch(()=>{});}catch{/* Optional audio cannot block a move. */}},
  vibrate:()=>{try{if(typeof navigator!=='undefined'&&typeof navigator.vibrate==='function')navigator.vibrate(15);}catch{/* Optional haptics never gate an action. */}},
  stopSounds,setMusicState:music.setState,
  loadImage:path=>new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=reject;image.src=path;}),
 };
}
