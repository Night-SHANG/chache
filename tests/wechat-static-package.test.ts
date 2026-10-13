import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createWechatPlatform} from '../src/platform/wechat.ts';
import type {WechatHost} from '../src/platform/wechat.ts';

function fixture(extra:Record<string,unknown>={}){
 const host={createCanvas:()=>({width:0,height:0,getContext:()=>({setTransform(){},fillRect(){}})}),getWindowInfo:()=>({windowWidth:360,windowHeight:800,pixelRatio:1}),...extra} as unknown as WechatHost;
 return createWechatPlatform(host,{requestAnimationFrame:()=>1,now:()=>0});
}
test('single-package WeChat host does not expose or invoke a subpackage loader',()=>{
 let calls=0;const platform=fixture({loadSubpackage:()=>{calls++;throw Error('subpackage loading is forbidden');}});
 assert.equal(Reflect.get(platform,'ensureAssetPackage'),undefined);assert.equal(calls,0);
});
test('a host without subpackage support remains valid for the single-package build',()=>{
 const platform=fixture();assert.equal(Reflect.get(platform,'ensureAssetPackage'),undefined);assert.equal(typeof platform.loadImage,'function');
});
test('WeChat implementation contains no subpackage host call or capability requirement',async()=>{
 const source=await readFile(new URL('../src/platform/wechat.ts',import.meta.url),'utf8');
 assert.doesNotMatch(source,/loadSubpackage|cosmeticsLoading|cosmeticsReady|外观分包/);
});
test('all platform entries and image resources have no package-loading compatibility layer',async()=>{
 for(const path of ['src/platform/types.ts','src/browser-main.ts','src/wechat-main.ts','src/android-main.ts','src/presentation/static-art-resources.ts']){
  assert.doesNotMatch(await readFile(path,'utf8'),/ensureAssetPackage|ensurePackage|PackageLoader|private packages/);
 }
});
