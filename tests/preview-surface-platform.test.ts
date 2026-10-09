import test from 'node:test';
import assert from 'node:assert/strict';
import {createCanvas} from '@napi-rs/canvas';
import type {Canvas} from '@napi-rs/canvas';
import {createBrowserPlatform} from '../src/platform/browser.ts';
import {createWechatPlatform} from '../src/platform/wechat.ts';
import type {WechatHost} from '../src/platform/wechat.ts';

const clock={requestAnimationFrame:()=>1,now:()=>0};
test('wechat keeps first canvas as screen and allocates distinct preview canvases only when requested',()=>{
 const surfaces:Canvas[]=[],host={createCanvas:()=>{const c=createCanvas(1,1);surfaces.push(c);return c;},getWindowInfo:()=>({windowWidth:360,windowHeight:640,pixelRatio:2})} as unknown as WechatHost;
 const p=createWechatPlatform(host,clock);assert.equal(surfaces.length,1);assert.equal(typeof p.createCanvasSurface,'function');const surface=p.createCanvasSurface!();assert.equal(surfaces.length,2);assert.notEqual(surface,surfaces[0]);assert.equal(p.beginFrame(),surfaces[0].getContext('2d'));assert.equal(surfaces[0].width,720);
});
test('wechat refuses a broken host that returns screen canvas for offscreen work',()=>{
 const screen=createCanvas(1,1),host={createCanvas:()=>screen,getWindowInfo:()=>({windowWidth:360,windowHeight:640,pixelRatio:1})} as unknown as WechatHost;
 const p=createWechatPlatform(host,clock);assert.equal(typeof p.createCanvasSurface,'function');assert.throws(()=>p.createCanvasSurface!());assert.equal(screen.width,360);assert.equal(screen.height,640);
});
test('browser surface creation is lazy and leaves screen size and context unchanged',()=>{
 const previous=['window','document'].map(name=>[name,Object.getOwnPropertyDescriptor(globalThis,name)] as const),screen=createCanvas(1,1),surfaces:Canvas[]=[];
 Object.assign(screen,{getBoundingClientRect:()=>({left:0,top:0,width:360,height:640})});
 Object.defineProperty(globalThis,'window',{configurable:true,value:{devicePixelRatio:2,addEventListener(){}}});Object.defineProperty(globalThis,'document',{configurable:true,value:{createElement:(tag:string)=>{assert.equal(tag,'canvas');const c=createCanvas(1,1);surfaces.push(c);return c;}}});
 try{const p=createBrowserPlatform(screen as unknown as HTMLCanvasElement);assert.equal(surfaces.length,0);assert.equal(typeof p.createCanvasSurface,'function');assert.equal(p.createCanvasSurface!(),surfaces[0]);assert.equal(screen.width,720);assert.equal(screen.height,1280);assert.equal(p.beginFrame(),screen.getContext('2d'));}
 finally{for(const [name,descriptor]of previous){if(descriptor)Object.defineProperty(globalThis,name,descriptor);else Reflect.deleteProperty(globalThis,name);}}
});
