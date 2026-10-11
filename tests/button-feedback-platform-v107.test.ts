import test from 'node:test';
import assert from 'node:assert/strict';
import {createBrowserPlatform} from '../src/platform/browser.ts';
import {createWechatPlatform,type WechatHost} from '../src/platform/wechat.ts';
import type {PointerEvent} from '../src/platform/types.ts';

function browserFixture(navigatorValue:unknown={}) {
 const previous=['window','document','navigator'].map(name=>[name,Object.getOwnPropertyDescriptor(globalThis,name)] as const);
 const events=new Map<string,(event:unknown)=>void>(),windowEvents=new Map<string,()=>void>(),captured=new Set<number>();
 const canvas={width:0,height:0,getContext:()=>({}),getBoundingClientRect:()=>({left:0,top:0,width:1080,height:1920}),
  addEventListener:(name:string,callback:(event:unknown)=>void)=>events.set(name,callback),
  setPointerCapture:(id:number)=>captured.add(id),hasPointerCapture:(id:number)=>captured.has(id),releasePointerCapture:(id:number)=>captured.delete(id)};
 Object.defineProperty(globalThis,'window',{configurable:true,value:{devicePixelRatio:1,addEventListener:(name:string,callback:()=>void)=>windowEvents.set(name,callback)}});
 Object.defineProperty(globalThis,'document',{configurable:true,value:{addEventListener:()=>{}}});
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:navigatorValue});
 return {platform:createBrowserPlatform(canvas as unknown as HTMLCanvasElement),captured,
  pointer:(name:string,id:number)=>events.get(name)?.({pointerId:id,clientX:500,clientY:500,preventDefault(){}}),
  blur:()=>windowEvents.get('blur')?.(),
  restore:()=>{for(const [name,descriptor] of previous){if(descriptor)Object.defineProperty(globalThis,name,descriptor);else Reflect.deleteProperty(globalThis,name);}}};
}
function wechatFixture(extra:Partial<WechatHost>={}) {
 const host={createCanvas:()=>({width:0,height:0,getContext:()=>({})}),getWindowInfo:()=>({windowWidth:1080,windowHeight:1920,pixelRatio:1}),...extra} as unknown as WechatHost;
 return createWechatPlatform(host,{requestAnimationFrame:()=>1,now:()=>0});
}

// Mutation targets: use a long pulse, lose native receiver, or turn a denied capability into a gameplay exception.
test('browser haptic asks for exactly one 15ms pulse with the native receiver',()=>{
 const calls:unknown[]=[];const navigatorValue={vibrate(this:unknown,duration:unknown){assert.equal(this,navigatorValue);calls.push(duration);return false;}};
 const f=browserFixture(navigatorValue);try{
  assert.equal(typeof f.platform.vibrate,'function');assert.doesNotThrow(()=>f.platform.vibrate?.());assert.deepEqual(calls,[15]);
 }finally{f.restore();}
});
test('browser haptic safely tolerates absent, throwing and inaccessible capabilities',()=>{
 for(const navigatorValue of [{},{vibrate(){throw Error('unsupported');}},Object.defineProperty({},'vibrate',{get(){throw Error('blocked');}}),undefined]){
  const f=browserFixture(navigatorValue);try{assert.equal(typeof f.platform.vibrate,'function');assert.doesNotThrow(()=>f.platform.vibrate?.());}finally{f.restore();}
 }
});
test('wechat haptic uses light vibrateShort and absorbs unsupported/failure outcomes without long fallback',()=>{
 const calls:unknown[]=[];
 const platform=wechatFixture({vibrateShort(options){calls.push(options.type);options.fail?.({errMsg:'unsupported'});}});
 assert.equal(typeof platform.vibrate,'function');assert.doesNotThrow(()=>platform.vibrate?.());assert.deepEqual(calls,['light']);
 for(const extra of [{},{vibrateShort(){throw Error('unsupported');}}])assert.doesNotThrow(()=>wechatFixture(extra).vibrate?.());
});
// Mutation target: keep active pressure on focus loss or cancel pointers that already ended.
test('browser blur cancels and releases only still-active pointers exactly once',()=>{
 const f=browserFixture();try{
  const received:PointerEvent[]=[];f.platform.onPointer(event=>received.push(event));
  f.pointer('pointerdown',1);f.pointer('pointerdown',2);f.pointer('pointerup',2);
  f.blur();f.blur();assert.deepEqual(received.map(({type,id})=>({type,id})),[{type:'down',id:1},{type:'down',id:2},{type:'up',id:2},{type:'cancel',id:1}]);assert.equal(f.captured.size,0);
  f.pointer('pointerdown',3);f.pointer('pointercancel',3);f.pointer('pointerdown',4);f.pointer('lostpointercapture',4);f.blur();
  assert.equal(received.filter(event=>event.type==='cancel'&&event.id===3).length,1);assert.equal(received.filter(event=>event.type==='cancel'&&event.id===4).length,1);
 }finally{f.restore();}
});
