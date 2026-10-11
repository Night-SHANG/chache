import test from 'node:test';
import assert from 'node:assert/strict';
import {createBrowserPlatform} from '../src/platform/browser.ts';
import {createWechatPlatform,type WechatHost} from '../src/platform/wechat.ts';
import {UI_CLICK_GAIN} from '../src/shared/ui-click-level.ts';
import {SOUND_NAMES} from '../src/platform/types.ts';

test('browser keeps all original cue assets and their relative mix while raising the fixed SFX gain modestly',()=>{
 const previous=['window','Audio'].map(name=>[name,Object.getOwnPropertyDescriptor(globalThis,name)] as const),audio:{src:string;volume:number;currentTime:number;play:()=>Promise<void>}[]=[];
 Object.defineProperty(globalThis,'window',{configurable:true,value:{devicePixelRatio:1,addEventListener(){}}});Object.defineProperty(globalThis,'Audio',{configurable:true,value:function(src:string){const item={src,volume:1,currentTime:0,play:()=>Promise.resolve()};audio.push(item);return item;}});
 try{const canvas={getContext:()=>({}),getBoundingClientRect:()=>({left:0,top:0,width:1080,height:1920})} as unknown as HTMLCanvasElement,platform=createBrowserPlatform(canvas);for(const name of SOUND_NAMES)platform.playSound(name);assert.deepEqual(audio.map(item=>item.src),SOUND_NAMES.map(name=>`assets/${name}.wav`));assert.ok(audio.every(item=>item.volume===0.45*(item.src==='assets/ui_click.wav'?UI_CLICK_GAIN:1)));}finally{for(const [name,descriptor] of previous){if(descriptor)Object.defineProperty(globalThis,name,descriptor);else Reflect.deleteProperty(globalThis,name);}}
});
test('WeChat explicitly retains the old full SFX level for all existing cues',()=>{
 const audio:{src:string;volume?:number;play:()=>void;stop:()=>void;destroy:()=>void}[]=[],host={createCanvas:()=>({getContext:()=>({})}),getWindowInfo:()=>({windowWidth:1080,windowHeight:1920,pixelRatio:1}),createInnerAudioContext:()=>{const item={src:'',play(){},stop(){},destroy(){}};audio.push(item);return item;}} as unknown as WechatHost;
 const platform=createWechatPlatform(host,{requestAnimationFrame:()=>1,now:()=>0});for(const name of SOUND_NAMES)platform.playSound(name);assert.deepEqual(audio.map(item=>item.src),SOUND_NAMES.map(name=>`assets/${name}.wav`));assert.ok(audio.every(item=>item.volume===(item.src==='assets/ui_click.wav'?UI_CLICK_GAIN:1)));
});
