import test from 'node:test';
import assert from 'node:assert/strict';
import { createWechatPlatform } from '../src/platform/wechat.ts';
import type { WechatHost } from '../src/platform/wechat.ts';
test('wechat uses first canvas for screen, safe-area input, and lifecycle cancellation',()=>{
 const calls:string[]=[];const store=new Map<string,string>();let touch:((e:unknown)=>void)|undefined;let hide:(()=>void)|undefined;
 const context={setTransform:()=>{},fillRect:()=>{},fillStyle:''};
 const host={createCanvas:()=>{calls.push('canvas');return {width:0,height:0,getContext:()=>context};},getWindowInfo:()=>({windowWidth:400,windowHeight:800,pixelRatio:2,safeArea:{left:0,top:20,width:400,height:760}}),getStorageSync:(k:string)=>store.get(k)||'',setStorageSync:(k:string,v:string)=>store.set(k,v),removeStorageSync:(k:string)=>store.delete(k),onTouchStart:(fn:(e:unknown)=>void)=>{touch=fn;},onTouchMove:()=>{},onTouchEnd:()=>{},onTouchCancel:()=>{},onHide:(fn:()=>void)=>{hide=fn;},onShow:()=>{},createInnerAudioContext:()=>({src:'',play:()=>{},stop:()=>{},destroy:()=>{}}),createImage:()=>({}),} as unknown as WechatHost;
 const p=createWechatPlatform(host,{requestAnimationFrame:()=>1,now:()=>5});assert.deepEqual(calls,['canvas']);
 let downX=-1;p.onPointer(e=>{downX=e.point.x;});touch?.({changedTouches:[{identifier:1,clientX:200,clientY:400}]});assert.equal(Math.round(downX),540);
 p.storage.set('test','saved');assert.equal(p.storage.get('test'),'saved');let hidden=false;p.onHide(()=>{hidden=true;});hide?.();assert.equal(hidden,true);
});
