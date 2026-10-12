import test from 'node:test';
import assert from 'node:assert/strict';
import {createWechatPlatform} from '../src/platform/wechat.ts';
import type {WechatHost} from '../src/platform/wechat.ts';

type Call={name:string;success:()=>void;fail:(error:unknown)=>void};
function fixture(loadSubpackage?:WechatHost['loadSubpackage']){
 const host={createCanvas:()=>({width:0,height:0,getContext:()=>({setTransform(){},fillRect(){}})}),getWindowInfo:()=>({windowWidth:360,windowHeight:800,pixelRatio:1}),loadSubpackage} as unknown as WechatHost;
 return createWechatPlatform(host,{requestAnimationFrame:()=>1,now:()=>0});
}
test('cosmetics package is lazy, shares concurrent work and retains completed package readiness',async()=>{
 const calls:Call[]=[];const platform=fixture(options=>{calls.push(options);});
 assert.equal(calls.length,0);
 const first=platform.ensureAssetPackage!('cosmetics'),second=platform.ensureAssetPackage!('cosmetics');
 assert.equal(first,second);assert.equal(calls.length,1);assert.equal(calls[0].name,'cosmetics');
 calls[0].success();await first;await second;await platform.ensureAssetPackage!('cosmetics');assert.equal(calls.length,1);
});
test('failed package request can retry without changing audio or saved selection',async()=>{
 const calls:Call[]=[];const platform=fixture(options=>{calls.push(options);});
 const first=platform.ensureAssetPackage!('cosmetics');calls[0].fail({errMsg:'offline'});await assert.rejects(first,/offline/);
 const retry=platform.ensureAssetPackage!('cosmetics');assert.equal(calls.length,2);calls[1].success();await retry;
});
test('unsupported hosts fail visibly without calling absent APIs or canIUse',async()=>{
 const platform=fixture();assert.equal(typeof platform.ensureAssetPackage,'function');
 await assert.rejects(platform.ensureAssetPackage!('cosmetics'),/不支持.*分包/);
 await assert.rejects(platform.ensureAssetPackage!('other'),/未知.*资源包/);
});
test('synchronous host failure clears inflight state for an explicit retry',async()=>{
 let count=0;const platform=fixture(options=>{if(++count===1)throw Error('host failure');options.success();});
 await assert.rejects(platform.ensureAssetPackage!('cosmetics'),/host failure/);
 await platform.ensureAssetPackage!('cosmetics');assert.equal(count,2);
});
