import test from 'node:test';
import assert from 'node:assert/strict';
import {createBrowserPlatform} from '../src/platform/browser.ts';
import type {WheelEvent as WheelInput} from '../src/platform/types.ts';
import {sessionHost,startInbound} from './helpers/session-fixtures.ts';
import {shopScrollLimit} from '../src/presentation/shop-layout.ts';
import {playableChecksum} from '../src/domain/playable.ts';

function browserFixture(dpr=1,width=320,height=700){
 const previous=Object.getOwnPropertyDescriptor(globalThis,'window');
 const listeners=new Map<string,{callback:(event:unknown)=>void;options:unknown}>(),windowListeners=new Map<string,()=>void>();
 const bounds={left:19,top:31,width,height};
 Object.defineProperty(globalThis,'window',{configurable:true,value:{devicePixelRatio:dpr,addEventListener:(name:string,callback:()=>void)=>windowListeners.set(name,callback)}});
 const canvas={width:0,height:0,getContext:()=>({}),getBoundingClientRect:()=>bounds,addEventListener:(name:string,callback:(event:unknown)=>void,options:unknown)=>listeners.set(name,{callback,options})};
 const platform=createBrowserPlatform(canvas as unknown as HTMLCanvasElement);
 const event=(values:Partial<{clientX:number;clientY:number;deltaY:number;deltaMode:number;ctrlKey:boolean}>={})=>{
  let prevented=false;listeners.get('wheel')?.callback({clientX:bounds.left+bounds.width/2,clientY:bounds.top+bounds.height/2,deltaY:30,deltaMode:0,ctrlKey:false,...values,preventDefault:()=>{prevented=true;}});return prevented;
 };
 return {platform,canvas,bounds,listeners,event,resize:()=>windowListeners.get('resize')?.(),restore:()=>{if(previous)Object.defineProperty(globalThis,'window',previous);else Reflect.deleteProperty(globalThis,'window');}};
}

for(const dpr of [1,2,3])test(`wheel maps narrow CSS coordinates and distances once at DPR ${dpr}`,()=>{
 const f=browserFixture(dpr);try{
  const events:WheelInput[]=[];f.platform.onWheel?.(event=>{events.push(event);return true;});
  assert.equal(f.event(),true);assert.equal(events.length,1);assert.equal(events[0].deltaY,101.25);assert.equal(events[0].point.x,540);assert.ok(Math.abs(events[0].point.y-960)<1e-10);
  assert.deepEqual(f.listeners.get('wheel')?.options,{passive:false});
  assert.equal(f.canvas.width,320*dpr);
 }finally{f.restore();}
});

test('wheel leaves page scrolling and browser zoom alone unless the handler claims the list',()=>{
 const f=browserFixture();try{
  const events:WheelInput[]=[];f.platform.onWheel?.(event=>{events.push(event);return false;});
  assert.equal(f.event(),false);assert.equal(events.length,1);
  f.platform.onWheel?.(event=>{events.push(event);return true;});
  assert.equal(f.event({ctrlKey:true}),false);
  assert.equal(f.event({clientY:32}),false); // Top letterbox, outside the logical canvas.
  assert.equal(f.event({clientX:339}),false); // Exclusive canvas right edge.
  assert.equal(f.event({deltaY:0}),false);assert.equal(f.event({deltaY:NaN}),false);assert.equal(f.event({deltaY:Infinity}),false);
  assert.equal(events.length,1);
 }finally{f.restore();}
});

test('wheel normalizes line and page units and follows resized CSS scale',()=>{
 const f=browserFixture();try{
  const events:WheelInput[]=[];f.platform.onWheel?.(event=>{events.push(event);return true;});
  f.event({deltaY:2,deltaMode:1});f.event({deltaY:1,deltaMode:2});
  assert.equal(events[0]?.deltaY,108);assert.equal(events[1]?.deltaY,2362.5);
  f.bounds.width=540;f.bounds.height=960;f.resize();f.event({deltaY:-10});
  assert.deepEqual(events[2],{point:{x:540,y:960},deltaY:-20});
 }finally{f.restore();}
});

test('browser wheel reaches the real shop session, clamps without saving, and leaves game scrolling alone',()=>{
 const f=browserFixture(3),h=sessionHost({wallet:3000}),s=h.session;try{
  s.action({type:'shop'});s.action({type:'selectShopTab',tab:'cosmetics'});
  const before=[...h.data],checksum=playableChecksum(s.state);f.platform.onWheel?.(event=>s.input.wheel(event.point,event.deltaY));
  assert.equal(f.event(),true);assert.equal(s.view.shopScroll?.sets,101.25);assert.equal(s.view.cosmeticSetPreview,undefined);
  assert.equal(f.event({deltaY:100000}),true);assert.equal(s.view.shopScroll?.sets,shopScrollLimit(s.view));
  assert.equal(f.event({deltaY:-100000}),true);assert.equal(s.view.shopScroll?.sets,0);
  assert.deepEqual([...h.data],before);assert.equal(playableChecksum(s.state),checksum);
  s.action({type:'back'});startInbound(s);const gameChecksum=playableChecksum(s.state);
  assert.equal(f.event(),false);assert.equal(playableChecksum(s.state),gameChecksum);
 }finally{f.restore();}
});
