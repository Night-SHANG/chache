import type { Platform, PointerEvent, SoundName } from './types.ts';
import { SOUND_NAMES } from './types.ts';
import { L, mapClientPoint } from '../presentation/layout.ts';
interface MiniCanvas {width:number;height:number;getContext(type:'2d'):CanvasRenderingContext2D|null}
interface WindowInfo {windowWidth:number;windowHeight:number;pixelRatio:number;safeArea?:{left:number;top:number;width:number;height:number}}
interface MiniTouch {identifier:number;clientX:number;clientY:number}
interface TouchEvent {changedTouches:MiniTouch[]}
interface MiniAudio {src:string;play():void|Promise<void>;stop():void;destroy():void;onError?(callback:()=>void):void}
interface MiniImage {src:string;onload:(()=>void)|null;onerror:((error:unknown)=>void)|null}
export interface WechatHost {
 createCanvas():MiniCanvas;getWindowInfo?():WindowInfo;getSystemInfoSync?():WindowInfo;
 getStorageSync(key:string):unknown;setStorageSync(key:string,value:string):void;removeStorageSync(key:string):void;
 onTouchStart(callback:(event:TouchEvent)=>void):void;onTouchMove(callback:(event:TouchEvent)=>void):void;
 onTouchEnd(callback:(event:TouchEvent)=>void):void;onTouchCancel(callback:(event:TouchEvent)=>void):void;
 onHide(callback:()=>void):void;onShow(callback:()=>void):void;onWindowResize?(callback:()=>void):void;
 createInnerAudioContext():MiniAudio;createImage():MiniImage;
}
export function createWechatPlatform(host:WechatHost,clock:{requestAnimationFrame:(callback:(time:number)=>void)=>number;now:()=>number}):Platform {
 // The first call is deliberately the screen canvas. No imported module creates a canvas.
 const canvas=host.createCanvas();
 const ctx=canvas.getContext('2d');if(!ctx)throw Error('无法创建2D画布');
 let dpr=1,scale=1,offsetX=0,offsetY=0;
 let viewport={x:0,y:0,w:1080,h:1920};
 const resize=()=>{
  const info=host.getWindowInfo?host.getWindowInfo():host.getSystemInfoSync?.();
  if(!info)throw Error('缺少窗口尺寸接口');
  dpr=Math.min(Math.max(info.pixelRatio||1,1),3);
  canvas.width=Math.round(info.windowWidth*dpr);canvas.height=Math.round(info.windowHeight*dpr);
  const safe=info.safeArea;
  viewport=safe?{x:safe.left,y:safe.top,w:safe.width,h:safe.height}:{x:0,y:0,w:info.windowWidth,h:info.windowHeight};
  scale=Math.min(viewport.w/L.width,viewport.h/L.height);
  offsetX=viewport.x+(viewport.w-L.width*scale)/2;offsetY=viewport.y+(viewport.h-L.height*scale)/2;
 };
 resize();host.onWindowResize?.(resize);
 const sounds=new Map<SoundName,MiniAudio>();
 const stopSounds=()=>{for(const sound of sounds.values())try{sound.stop();}catch{/* One unavailable context cannot block lifecycle callbacks or other cues. */}};
 const platform:Platform={
  storage:{get:key=>{const value=host.getStorageSync(key);if(value===''||value===undefined||value===null)return null;if(typeof value!=='string')throw Error('存储格式无效');return value;},set:(key,value)=>host.setStorageSync(key,value),remove:key=>host.removeStorageSync(key)},
  beginFrame:()=>{ctx.setTransform(1,0,0,1,0,0);ctx.fillStyle='#0c131c';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.setTransform(scale*dpr,0,0,scale*dpr,offsetX*dpr,offsetY*dpr);return ctx;},
  frame:callback=>clock.requestAnimationFrame(()=>callback(clock.now())),now:clock.now,wallTime:()=>Date.now(),
  onPointer:callback=>{
   const convert=(type:PointerEvent['type'])=>(event:TouchEvent)=>{
    if(type==='cancel'){callback({type,point:{x:-1,y:-1},id:event.changedTouches[0]?.identifier??0});return;}
    for(const touch of event.changedTouches){const point=mapClientPoint({x:touch.clientX,y:touch.clientY},viewport)??{x:-1,y:-1};callback({type,point,id:touch.identifier});}
   };
   host.onTouchStart(convert('down'));host.onTouchMove(convert('move'));host.onTouchEnd(convert('up'));host.onTouchCancel(convert('cancel'));
  },
  onHide:callback=>host.onHide(()=>{stopSounds();callback();}),
  onShow:callback=>host.onShow(()=>{resize();callback();}),
  playSound:name=>{
   if(!SOUND_NAMES.includes(name))return;
   try{
    let sound=sounds.get(name);
    if(!sound){
     sound=host.createInnerAudioContext();sounds.set(name,sound);
     try{sound.onError?.(()=>{});}catch{/* Error listeners are optional and registered at most once per handle. */}
    }
    const path=`assets/${name}.wav`;if(sound.src!==path)sound.src=path;
    sound.stop();const playing=sound.play();if(playing)void playing.catch(()=>{});
   }catch{/* Audio never gates offline gameplay. */}
  },
  stopSounds,
  loadImage:path=>new Promise((resolve,reject)=>{const image=host.createImage();image.onload=()=>resolve(image as unknown as CanvasImageSource);image.onerror=reject;image.src=path;}),
 };
 return platform;
}
