import test from 'node:test';
import assert from 'node:assert/strict';
import {createCanvas,Image} from '@napi-rs/canvas';
import type {Canvas} from '@napi-rs/canvas';
import {build} from 'esbuild';
import {runInNewContext} from 'node:vm';
import {createWechatPlatform} from '../src/platform/wechat.ts';
import type {WechatHost} from '../src/platform/wechat.ts';
import {readFileSync} from 'node:fs';
import {mobileCanvasContext} from './helpers/wechat-canvas-contract.ts';
import {STATIC_ART_RESOURCES} from '../src/presentation/static-art-manifest.ts';

const settle=()=>new Promise<void>(resolve=>setImmediate(resolve));
test('platform explicitly reports the same opaque backdrop its beginFrame actually paints',()=>{
 const screen=createCanvas(1,1),host={createCanvas:()=>screen,getWindowInfo:()=>({windowWidth:360,windowHeight:800,pixelRatio:2})} as unknown as WechatHost;
 const p=createWechatPlatform(host,{requestAnimationFrame:()=>1,now:()=>0});p.beginFrame();assert.equal(p.frameBackdrop,'#0c131c');assert.deepEqual([...screen.getContext('2d').getImageData(0,0,1,1).data],[12,19,28,255]);
});

test('actual WeChat entry paints visible loading/error/retry and exact ready art with one screen canvas only',async()=>{
 const compiled=await build({entryPoints:['src/wechat-main.ts'],bundle:true,format:'iife',platform:'neutral',write:false,define:{__DEV_DIAGNOSTICS__:'false',__PLAYTEST_FREE_SHOP__:'false'}});
 const contracts:ReturnType<typeof mobileCanvasContext>[]=[],surfaces:Canvas[]=[],frames:((now:number)=>void)[]=[],hides:(()=>void)[]=[],shows:(()=>void)[]=[],pending:{image:Image;path:string;load:()=>Promise<void>}[]=[],storage=new Map<string,string>(),labels:string[]=[],touch=new Map<string,(event:unknown)=>void>();let musicPlays=0;
 const wx={createCanvas:()=>{const canvas=createCanvas(1,1),context=canvas.getContext('2d'),fillText=context.fillText.bind(context);context.fillText=(value,...args)=>{labels.push(value);return fillText(value,...args);};const contract=mobileCanvasContext(context as unknown as CanvasRenderingContext2D);contracts.push(contract);Object.defineProperty(canvas,'getContext',{value:()=>contract.context});surfaces.push(canvas);return canvas;},getWindowInfo:()=>({windowWidth:390,windowHeight:844,pixelRatio:3}),
  getStorageSync:(key:string)=>storage.get(key)??'',setStorageSync:(key:string,value:string)=>{storage.set(key,value);},removeStorageSync:(key:string)=>{storage.delete(key);},getStorageInfoSync:()=>({keys:[...storage.keys()],currentSize:0,limitSize:10240}),
  onTouchStart:(fn:(event:unknown)=>void)=>touch.set('down',fn),onTouchMove(){},onTouchEnd:(fn:(event:unknown)=>void)=>touch.set('up',fn),onTouchCancel(){},onWindowResize(){},onHide:(fn:()=>void)=>hides.push(fn),onShow:(fn:()=>void)=>shows.push(fn),
  createImage:()=>{const image=new Image(),setter=Object.getOwnPropertyDescriptor(Image.prototype,'src')!.set!;Object.defineProperty(image,'src',{set(path:string){pending.push({image,path,load:()=>new Promise<void>((resolve,reject)=>{const resource=Object.values(STATIC_ART_RESOURCES).find(resource=>resource.src===path);assert.ok(resource,path);const loaded=image.onload;image.onload=()=>{loaded?.();resolve();};image.onerror=reject;setter.call(image,readFileSync(resource.sourcePath));})});}});return image;},createInnerAudioContext:()=>({src:'',play(){musicPlays++;},stop(){},pause(){},destroy(){},onError(){}})};
 runInNewContext(compiled.outputFiles[0].text,{wx,requestAnimationFrame:(fn:(now:number)=>void)=>{frames.push(fn);return frames.length;},console});assert.equal(surfaces.length,1);assert.ok(musicPlays>0,'original local music starts before any art resolves');frames.shift()!(1);assert.ok(labels.includes('正在加载画面资源'));assert.equal(surfaces.length,1);
 pending.shift()!.image.onerror!(Error('injected failure'));await settle();frames.shift()!(2);assert.ok(labels.includes('画面资源加载失败'));assert.ok(labels.includes('重试加载'));const saved=[...storage];
 // Input coordinates are CSS, scaled by the real platform to logical retry center (540,1160).
 const event={changedTouches:[{identifier:1,clientX:195,clientY:(844-1920*(390/1080))/2+1160*(390/1080)}]};touch.get('down')!(event);touch.get('up')!(event);await settle();assert.ok(pending.length>0);for(let safety=0;pending.length&&safety<20;safety++){await pending.shift()!.load();await settle();}
 labels.length=0;frames.shift()!(3);assert.ok(!labels.includes('正在加载画面资源'));assert.ok(!labels.includes('画面资源加载失败'));assert.equal(surfaces.length,1);assert.deepEqual([...storage],saved,'loading/retry does not modify the selected appearance or save');
 for(const hide of hides)hide();for(const show of shows)show();frames.shift()!(4);assert.equal(surfaces.length,1);assert.equal(pending.length,0);assert.equal(surfaces[0].width,1170);assert.equal(surfaces[0].height,2532);assert.equal(contracts.reduce((sum,contract)=>sum+contract.unsupportedWrites(),0),0);
});

test('all entries use the shared image gate and retain the platform frame backdrop without static surfaces',()=>{
 for(const name of ['browser','wechat','android']){const text=readFileSync(`src/${name}-main.ts`,'utf8');assert.match(text,/configureStaticArt/);assert.match(text,/StaticArtGate/);assert.match(text,/frameBackdrop/);assert.doesNotMatch(text,/configureWarehouseCache|invalidateWarehouseCache|configureCosmeticPreviewCache|invalidateCosmeticPreviewCache|createCanvasSurface/);}
 for(const path of ['static-art-resources','static-art-requirements','static-art-gate'])assert.doesNotMatch(readFileSync(`src/presentation/${path}.ts`,'utf8'),/createCanvas|OffscreenCanvas/);
});
