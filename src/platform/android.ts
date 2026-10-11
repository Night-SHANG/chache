import type {StoragePort} from '../application/save.ts';
import {L,hitTestPoint,type Rect} from '../presentation/layout.ts';
import {AUDIO_LEVELS} from '../shared/audio-levels.ts';
import {MUSIC_LEVELS} from '../shared/music-levels.ts';
import {UI_CLICK_GAIN} from '../shared/ui-click-level.ts';
import {computeAndroidViewport,type AndroidViewport,type NativeHostState} from './android-viewport.ts';
import {createMusicController} from './music.ts';
import {SOUND_NAMES,type Platform,type PointerEvent,type SoundName} from './types.ts';
import type {WriterLease} from './writer-lease.ts';

export function createAndroidPlatform(canvas:HTMLCanvasElement,storage:StoragePort,lease:WriterLease,state:NativeHostState):{platform:Platform;updateHost(next:NativeHostState):void} {
 const ctx=canvas.getContext('2d');if(!ctx)throw Error('无法创建2D画布');
 let host=state,rect:Rect={x:0,y:0,w:0,h:0},viewport:AndroidViewport|undefined,dpr=1,visible=false,rejectedHost=false;
 const pointers=new Set<number>(),pointerCallbacks:((event:PointerEvent)=>void)[]=[],hideCallbacks:(()=>void)[]=[],showCallbacks:(()=>void)[]=[];
 const sounds=new Map<SoundName,HTMLAudioElement>();let soundtrack:HTMLAudioElement|undefined;
 const music=createMusicController(onError=>{
  if(!soundtrack){soundtrack=new Audio('assets/bgm.mp3');try{soundtrack.addEventListener('error',onError);}catch{/* Optional host listener. */}}
  soundtrack.loop=true;soundtrack.volume=MUSIC_LEVELS.normal;
  const audio=soundtrack;return {play:()=>audio.play(),pause:()=>audio.pause(),setVolume:(volume:number)=>{audio.volume=volume;}};
 });
 const stopSounds=()=>{for(const audio of sounds.values()){
  try{audio.pause();}catch{/* Other cues and lifecycle must still stop. */}
  try{audio.currentTime=0;}catch{/* A not-yet-decoded handle may reject seeking. */}
 }};
 const dispatch=(event:PointerEvent)=>{for(const callback of pointerCallbacks)callback(event);};
 const release=(id:number)=>{try{if(canvas.hasPointerCapture(id))canvas.releasePointerCapture(id);}catch{/* Native focus/geometry changes may already release capture. */}};
 const cancel=(id:number)=>{if(pointers.delete(id)){dispatch({type:'cancel',point:{x:-1,y:-1},id});release(id);}};
 const cancelAll=()=>{for(const id of [...pointers])cancel(id);};
 const syncVisibility=()=>{
  const next=Boolean(viewport&&host.active&&host.owner&&lease.status==='held');if(next===visible)return;
  visible=next;
  if(!next){cancelAll();music.hide();stopSounds();for(const callback of hideCallbacks)callback();}
  else{for(const callback of showCallbacks)callback();music.show();}
 };
 const measure=()=>{
  if(rejectedHost)throw Error('Invalid Android native viewport dimensions');
  const bounds=canvas.getBoundingClientRect(),nextRect={x:bounds.left,y:bounds.top,w:bounds.width,h:bounds.height};
  let next:AndroidViewport;
  try{next=computeAndroidViewport(nextRect,host);}catch(error){viewport=undefined;cancelAll();syncVisibility();throw error;}
  const ratio=window.devicePixelRatio,nextDpr=Number.isFinite(ratio)&&ratio>0?Math.min(ratio,3):1;
  if(!viewport||nextRect.x!==rect.x||nextRect.y!==rect.y||nextRect.w!==rect.w||nextRect.h!==rect.h||next.scale!==viewport.scale||next.origin.x!==viewport.origin.x||next.origin.y!==viewport.origin.y||nextDpr!==dpr)cancelAll();
  rect=nextRect;viewport=next;dpr=nextDpr;
  const width=Math.round(rect.w*dpr),height=Math.round(rect.h*dpr);
  if(canvas.width!==width)canvas.width=width;if(canvas.height!==height)canvas.height=height;
  syncVisibility();return next;
 };
 const usable=()=>{try{measure();}catch{return false;}return visible;};
 // Hide the controller from the outset when ownership/activity is not usable.
 measure();host={...state,insetsPx:{...state.insetsPx}};if(!visible)music.hide();
 window.addEventListener('resize',()=>{try{measure();}catch{/* Await valid native geometry; inputs remain blocked. */}});
 window.addEventListener('blur',cancelAll);
 const point=(event:globalThis.PointerEvent)=>{
  if(!viewport)return null;const logical={x:(event.clientX-viewport.origin.x)/viewport.scale,y:(event.clientY-viewport.origin.y)/viewport.scale};
  return hitTestPoint(logical,{x:0,y:0,w:L.width,h:L.height})?logical:null;
 };
 for(const [name,type] of [['pointerdown','down'],['pointermove','move'],['pointerup','up'],['pointercancel','cancel']] as const)canvas.addEventListener(name,event=>{
  const e=event as globalThis.PointerEvent;e.preventDefault();if(!pointerCallbacks.length||!usable())return;
  if(type==='cancel'){cancel(e.pointerId);return;}
  const logical=point(e);
  if(type==='down'){
   if(!logical||pointers.has(e.pointerId))return;pointers.add(e.pointerId);
   try{canvas.setPointerCapture(e.pointerId);}catch{cancel(e.pointerId);return;}
   music.gesture(()=>dispatch({type,point:logical,id:e.pointerId}));
  }else{
   if(!pointers.has(e.pointerId))return;
   // A captured drag may leave the interactive rectangle; its sentinel cannot hit game UI.
   if(type==='up')pointers.delete(e.pointerId);
   dispatch({type,point:logical??{x:-1,y:-1},id:e.pointerId});if(type==='up')release(e.pointerId);
  }
 });
 canvas.addEventListener('lostpointercapture',event=>cancel((event as globalThis.PointerEvent).pointerId));
 const platform:Platform={
  storage,writerLease:lease,
  createCanvasSurface:()=>{const surface=document.createElement('canvas');if(surface===canvas)throw Error('Preview surface must be offscreen');return surface;},
  beginFrame:()=>{const view=measure();ctx.setTransform(1,0,0,1,0,0);ctx.fillStyle='#0c131c';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.setTransform(view.scale*dpr,0,0,view.scale*dpr,(view.origin.x-rect.x)*dpr,(view.origin.y-rect.y)*dpr);return ctx;},
  backgroundBounds:()=>viewport?{x:viewport.overlay.x,y:0,w:viewport.overlay.w,h:L.height}:undefined,
  overlayBounds:()=>viewport?{...viewport.overlay}:undefined,
  frame:callback=>window.requestAnimationFrame(callback),now:()=>performance.now(),wallTime:()=>Date.now(),
  onPointer:callback=>{pointerCallbacks.push(callback);},onHide:callback=>{hideCallbacks.push(callback);},onShow:callback=>{showCallbacks.push(callback);},
  playSound:name=>{if(!usable()||!SOUND_NAMES.includes(name))return;try{let audio=sounds.get(name);if(!audio){audio=new Audio(`assets/${name}.wav`);sounds.set(name,audio);}audio.volume=AUDIO_LEVELS.browserEffects*(name==='ui_click'?UI_CLICK_GAIN:1);audio.currentTime=0;void audio.play().catch(()=>{});}catch{/* Optional audio never gates gameplay. */}},
  stopSounds,setMusicState:music.setState,
  vibrate:()=>{if(!usable())return;try{navigator.vibrate?.(15);}catch{/* Optional host haptics. */}},
  loadImage:path=>new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=reject;image.src=path;}),
 };
 const updateHost=(next:NativeHostState)=>{
  try{computeAndroidViewport(rect,next);}catch(error){rejectedHost=true;viewport=undefined;cancelAll();syncVisibility();throw error;}
  rejectedHost=false;
  if(host.widthPx!==next.widthPx||host.heightPx!==next.heightPx||(['top','right','bottom','left'] as const).some(edge=>host.insetsPx?.[edge]!==next.insetsPx?.[edge]))cancelAll();
  host={...next,insetsPx:{...next.insetsPx}};measure();
 };
 return {platform,updateHost};
}
