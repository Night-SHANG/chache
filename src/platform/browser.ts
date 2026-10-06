import type { Platform, PointerEvent, SoundName } from './types.ts';
import { SOUND_NAMES } from './types.ts';
import { L, mapClientPoint } from '../presentation/layout.ts';
export function createBrowserPlatform(canvas:HTMLCanvasElement):Platform {
 const ctx=canvas.getContext('2d');if(!ctx)throw Error('无法创建2D画布');
 let rect={x:0,y:0,w:1,h:1},scale=1,dpr=1;
 const resize=()=>{const r=canvas.getBoundingClientRect();rect={x:r.left,y:r.top,w:r.width,h:r.height};dpr=Math.min(window.devicePixelRatio||1,3);canvas.width=Math.round(r.width*dpr);canvas.height=Math.round(r.height*dpr);scale=Math.min(r.width/L.width,r.height/L.height);};
 resize();window.addEventListener('resize',resize);
 const sounds=new Map<SoundName,HTMLAudioElement>();
 const stopSounds=()=>{for(const audio of sounds.values()){
  try{audio.pause();}catch{/* A broken audio handle must not block lifecycle callbacks or the other cues. */}
  try{audio.currentTime=0;}catch{/* Some hosts cannot seek before decoding. */}
 }};
 return {
  storage:{get:key=>window.localStorage.getItem(key),set:(key,value)=>window.localStorage.setItem(key,value),remove:key=>window.localStorage.removeItem(key)},
  beginFrame:()=>{ctx.setTransform(1,0,0,1,0,0);ctx.fillStyle='#0c131c';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.setTransform(scale*dpr,0,0,scale*dpr,(rect.w-L.width*scale)*dpr/2,(rect.h-L.height*scale)*dpr/2);return ctx;},
  frame:callback=>window.requestAnimationFrame(callback),now:()=>performance.now(),wallTime:()=>Date.now(),
  onPointer:callback=>{
   const bind=(name:string,type:PointerEvent['type'])=>canvas.addEventListener(name,event=>{
    const e=event as globalThis.PointerEvent;e.preventDefault();
    if(type==='down')canvas.setPointerCapture(e.pointerId);
    const point=mapClientPoint({x:e.clientX,y:e.clientY},rect)??{x:-1,y:-1};callback({type,point,id:e.pointerId});
    if((type==='up'||type==='cancel')&&canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);
   });
   bind('pointerdown','down');bind('pointermove','move');bind('pointerup','up');bind('pointercancel','cancel');
   canvas.addEventListener('lostpointercapture',event=>callback({type:'cancel',point:{x:-1,y:-1},id:(event as globalThis.PointerEvent).pointerId}));
  },
  onHide:callback=>{const hide=()=>{stopSounds();callback();};document.addEventListener('visibilitychange',()=>{if(document.hidden)hide();});window.addEventListener('pagehide',hide);},
  onShow:callback=>document.addEventListener('visibilitychange',()=>{if(!document.hidden)callback();}),
  playSound:name=>{if(!SOUND_NAMES.includes(name))return;try{let audio=sounds.get(name);if(!audio){audio=new Audio(`assets/${name}.wav`);sounds.set(name,audio);}audio.volume=0.35;audio.currentTime=0;void audio.play().catch(()=>{});}catch{/* Optional audio cannot block a move. */}},
  stopSounds,
  loadImage:path=>new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=reject;image.src=path;}),
 };
}
