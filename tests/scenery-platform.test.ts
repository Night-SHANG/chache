import test from 'node:test';
import assert from 'node:assert/strict';
import {createCanvas} from '@napi-rs/canvas';
import {createBrowserPlatform} from '../src/platform/browser.ts';
import {createWechatPlatform} from '../src/platform/wechat.ts';
import type {WechatHost} from '../src/platform/wechat.ts';
const clock={requestAnimationFrame:()=>1,now:()=>0};
for(const dpr of [1,2,3])test(`browser side bounds follow resize without changing input transform at DPR ${dpr}`,()=>{
 const previous=Object.getOwnPropertyDescriptor(globalThis,'window'),screen=createCanvas(1,1),r={left:19,top:31,width:512,height:768};let resize=()=>{};
 Object.assign(screen,{getBoundingClientRect:()=>r});Object.defineProperty(globalThis,'window',{configurable:true,value:{devicePixelRatio:dpr,addEventListener:(name:string,fn:()=>void)=>{if(name==='resize')resize=fn;}}});
 try{const p=createBrowserPlatform(screen as unknown as HTMLCanvasElement);assert.deepEqual(p.backgroundBounds?.(),{x:-100,y:0,w:1280,h:1920});p.beginFrame();let m=screen.getContext('2d').getTransform();assert.ok(Math.abs(m.a-.4*dpr)<1e-6);assert.equal(m.e,40*dpr);
  r.width=390;r.height=844;resize();assert.deepEqual(p.backgroundBounds?.(),{x:0,y:0,w:1080,h:1920});p.beginFrame();m=screen.getContext('2d').getTransform();assert.equal(m.e,0);assert.ok(Math.abs(m.f-75.33333333333333*dpr)<1e-4);
  r.width=0;r.height=0;resize();assert.equal(p.backgroundBounds?.(),undefined);
 }finally{if(previous)Object.defineProperty(globalThis,'window',previous);else Reflect.deleteProperty(globalThis,'window');}
});
for(const dpr of [1,2,3])test(`wechat excludes all safe-area insets from scenery bounds at DPR ${dpr}`,()=>{
 const screen=createCanvas(1,1),info={windowWidth:560,windowHeight:840,pixelRatio:dpr,safeArea:{left:17,top:24,width:512,height:768}};let resize=()=>{};
 const host={createCanvas:()=>screen,getWindowInfo:()=>info,onWindowResize:(fn:()=>void)=>{resize=fn;}} as unknown as WechatHost;
 const p=createWechatPlatform(host,clock);assert.deepEqual(p.backgroundBounds?.(),{x:-100,y:0,w:1280,h:1920});p.beginFrame();let m=screen.getContext('2d').getTransform();assert.equal(m.e,57*dpr);assert.equal(m.f,24*dpr);
 info.safeArea.width=390;info.safeArea.height=768;resize();assert.deepEqual(p.backgroundBounds?.(),{x:0,y:0,w:1080,h:1920});p.beginFrame();m=screen.getContext('2d').getTransform();assert.equal(m.e,17*dpr);assert.ok(m.f>24*dpr);
});
