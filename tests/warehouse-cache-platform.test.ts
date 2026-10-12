import test from 'node:test';
import assert from 'node:assert/strict';
import {createCanvas} from '@napi-rs/canvas';
import type {Canvas} from '@napi-rs/canvas';
import {build} from 'esbuild';
import {runInNewContext} from 'node:vm';
import {createWechatPlatform} from '../src/platform/wechat.ts';
import type {WechatHost} from '../src/platform/wechat.ts';
import {readFileSync} from 'node:fs';
import {mobileCanvasContext} from './helpers/wechat-canvas-contract.ts';

test('platform explicitly reports the same opaque backdrop its beginFrame actually paints',()=>{
 const screen=createCanvas(1,1),host={createCanvas:()=>screen,getWindowInfo:()=>({windowWidth:360,windowHeight:800,pixelRatio:2})} as unknown as WechatHost;
 const p=createWechatPlatform(host,{requestAnimationFrame:()=>1,now:()=>0});p.beginFrame();assert.equal(p.frameBackdrop,'#0c131c');assert.deepEqual([...screen.getContext('2d').getImageData(0,0,1,1).data],[12,19,28,255]);
});

test('actual WeChat entry creates screen first, paints native cache lazily, and invalidates assets and hide/show',async()=>{
 const compiled=await build({entryPoints:['src/wechat-main.ts'],bundle:true,format:'iife',platform:'neutral',write:false,define:{__DEV_DIAGNOSTICS__:'false',__PLAYTEST_FREE_SHOP__:'false'}});
 const contracts:ReturnType<typeof mobileCanvasContext>[]=[],surfaces:Canvas[]=[],frames:((now:number)=>void)[]=[],hides:(()=>void)[]=[],shows:(()=>void)[]=[],images:{onload?:()=>void;onerror?:()=>void;src?:string}[]=[],storage=new Map<string,string>();
 const wx={createCanvas:()=>{const canvas=createCanvas(1,1),contract=mobileCanvasContext(canvas.getContext('2d') as unknown as CanvasRenderingContext2D);contracts.push(contract);Object.defineProperty(canvas,'getContext',{value:()=>contract.context});surfaces.push(canvas);return canvas;},getWindowInfo:()=>({windowWidth:390,windowHeight:844,pixelRatio:3}),
  getStorageSync:(key:string)=>storage.get(key)??'',setStorageSync:(key:string,value:string)=>{storage.set(key,value);},removeStorageSync:(key:string)=>{storage.delete(key);},getStorageInfoSync:()=>({keys:[...storage.keys()],currentSize:0,limitSize:10240}),
  onTouchStart(){},onTouchMove(){},onTouchEnd(){},onTouchCancel(){},onWindowResize(){},onHide:(fn:()=>void)=>hides.push(fn),onShow:(fn:()=>void)=>shows.push(fn),
  createImage:()=>{const image={};images.push(image);return image;},createInnerAudioContext:()=>({src:'',play(){},stop(){},pause(){},destroy(){},onError(){}})};
 runInNewContext(compiled.outputFiles[0].text,{wx,requestAnimationFrame:(fn:(now:number)=>void)=>{frames.push(fn);return frames.length;},console});
 assert.equal(surfaces.length,1,'imports and setup must never take the first screen canvas');assert.equal(surfaces[0].width,1170);
 frames.shift()!(1);assert.equal(surfaces.length,2);assert.equal(surfaces[1].width,1170);assert.equal(surfaces[1].height,2532);
 for(let n=0;n<3;n++)frames.shift()!(n+2);assert.equal(surfaces.length,2);
 for(const image of images)image.onerror!();await new Promise<void>(resolve=>setImmediate(resolve));assert.equal(surfaces[1].width,1,'resource completion releases fallback pixels');
 frames.shift()!(6);assert.equal(surfaces.length,3);for(const hide of hides)hide();assert.equal(surfaces[2].width,1,'hide releases native memory');for(const show of shows)show();frames.shift()!(7);assert.equal(surfaces.length,4);
 assert.equal(surfaces[0].width,1170);assert.equal(surfaces[0].height,2532);assert.equal(contracts.reduce((sum,contract)=>sum+contract.unsupportedWrites(),0),0,'entry must never request unsupported mobile compositing');
});

test('all shared entries wire native cache, resource revision, lifecycle and explicit frame backdrop',()=>{
 for(const name of ['browser','wechat','android']){
  const text=readFileSync(`src/${name}-main.ts`,'utf8');assert.match(text,/configureWarehouseCache/);assert.match(text,/invalidateWarehouseCache/);assert.match(text,/frameBackdrop/);assert.match(text,/onHide\([^;]*invalidateWarehouseCache/s);assert.match(text,/onShow\([^;]*invalidateWarehouseCache/s);
 }
});
