import assert from 'node:assert/strict';
import test from 'node:test';
import {createBrowserPlatform} from '../src/platform/browser.ts';
import {createWechatPlatform} from '../src/platform/wechat.ts';
import type {WechatHost} from '../src/platform/wechat.ts';
import type {WriterLease} from '../src/platform/writer-lease.ts';

test('browser platform forwards acquired lease and lists actual local keys',()=>{
 const previous=Object.getOwnPropertyDescriptor(globalThis,'window'),store=new Map([['warehouse.account.history.s1.a','中文'],['other','x']]);
 const localStorage={get length(){return store.size;},key:(i:number)=>[...store.keys()][i]??null,getItem:(key:string)=>store.get(key)??null,setItem:(key:string,value:string)=>store.set(key,value),removeItem:(key:string)=>store.delete(key)};
 Object.defineProperty(globalThis,'window',{configurable:true,value:{devicePixelRatio:1,addEventListener(){},localStorage}});
 try{
  const canvas={getContext:()=>({}),getBoundingClientRect:()=>({left:0,top:0,width:1080,height:1920})} as unknown as HTMLCanvasElement;
  const lease:WriterLease={status:'held',release(){this.status='busy';}},platform=createBrowserPlatform(canvas,lease);
  assert.equal(platform.writerLease,lease);assert.deepEqual(platform.storage.listKeys?.('warehouse.account.'),['warehouse.account.history.s1.a']);
  lease.release();assert.equal(platform.writerLease?.status,'busy');
  assert.equal(createBrowserPlatform(canvas).writerLease?.status,'unsupported');
 }finally{if(previous)Object.defineProperty(globalThis,'window',previous);else Reflect.deleteProperty(globalThis,'window');}
});

test('wechat main context exposes quota and keys, subcontext has no writer lease',()=>{
 const host={createCanvas:()=>({getContext:()=>({}),width:0,height:0}),getWindowInfo:()=>({windowWidth:1080,windowHeight:1920,pixelRatio:1}),getStorageInfoSync:()=>({keys:['warehouse.account.a','other'],currentSize:7,limitSize:10240})} as unknown as WechatHost;
 const clock={requestAnimationFrame:()=>1,now:()=>0},main=createWechatPlatform(host,clock);
 assert.equal(main.writerLease?.status,'held');assert.deepEqual(main.storage.listKeys?.('warehouse.'),['warehouse.account.a']);
 assert.deepEqual(main.storage.capacity?.(),{usedBytes:7*1024,limitBytes:10240*1024});
 assert.equal(createWechatPlatform(host,clock,'sub').writerLease?.status,'unsupported');
});

test('platform metadata read errors stay errors rather than empty keys or free space',()=>{
 const host={createCanvas:()=>({getContext:()=>({}),width:0,height:0}),getWindowInfo:()=>({windowWidth:1080,windowHeight:1920,pixelRatio:1}),getStorageInfoSync:()=>{throw Error('quota unavailable');}} as unknown as WechatHost;
 const platform=createWechatPlatform(host,{requestAnimationFrame:()=>1,now:()=>0});
 assert.throws(()=>platform.storage.listKeys?.('warehouse.'),/quota unavailable/);assert.throws(()=>platform.storage.capacity?.(),/quota unavailable/);
});
