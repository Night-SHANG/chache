import test from 'node:test';
import assert from 'node:assert/strict';
import {computeAndroidViewport,type NativeHostState} from '../src/platform/android-viewport.ts';
import {L,mapClientPoint} from '../src/presentation/layout.ts';

const host:NativeHostState={active:true,owner:true,widthPx:1080,heightPx:2400,insetsPx:{top:100,right:0,bottom:80,left:0}};
test('Android uses native safe area once and centers the 1080 by 1920 interaction rectangle',()=>{
 const view=computeAndroidViewport({x:0,y:0,w:1080,h:2400},host);
 assert.deepEqual(view.safeRect,{x:0,y:100,w:1080,h:2220});assert.equal(view.scale,1);assert.deepEqual(view.origin,{x:0,y:250});
 assert.deepEqual(view.overlay,{x:0,y:-250,w:1080,h:2400});
 const logical={x:540,y:960},client={x:view.origin.x+logical.x*view.scale,y:view.origin.y+logical.y*view.scale};
 assert.deepEqual(mapClientPoint(client,view.safeRect),logical);
 for(const point of [{x:540,y:99},{x:540,y:249},{x:540,y:2170},{x:540,y:2321}])assert.equal(mapClientPoint(point,view.safeRect),null);
});
test('native physical pixels convert to actual offset CSS canvas independently of DPR',()=>{
 for(const ratio of [1,2,3]){
  const rect={x:17,y:31,w:1080/ratio,h:2400/ratio},view=computeAndroidViewport(rect,host);
  assert.equal(view.scale,1/ratio);assert.deepEqual(view.origin,{x:17,y:31+250/ratio});
  const point={x:view.origin.x+L.width/2*view.scale,y:view.origin.y+L.height/2*view.scale};
  const mapped=mapClientPoint(point,view.safeRect);assert.ok(mapped);assert.ok(Math.abs(mapped.x-540)<1e-9);assert.ok(Math.abs(mapped.y-960)<1e-9);
  assert.ok(Math.abs(view.overlay.x)<1e-9);assert.ok(Math.abs(view.overlay.y+250)<1e-9);
 }
});
test('side cutouts and a wide window contain the full logical area inside every safe edge',()=>{
 const state={...host,widthPx:2400,heightPx:1080,insetsPx:{top:24,right:120,bottom:60,left:100}};
 const view=computeAndroidViewport({x:4,y:8,w:1200,h:540},state);
 assert.deepEqual(view.safeRect,{x:54,y:20,w:1090,h:498});assert.equal(view.scale,498/1920);
 assert.equal(view.origin.y,20);assert.equal(view.origin.x,54+(1090-1080*view.scale)/2);
 assert.equal(view.overlay.w,1200/view.scale);assert.equal(view.overlay.h,540/view.scale);
 for(const logical of [{x:0,y:0},{x:1079,y:1919},{x:540,y:960}]){
  const mapped=mapClientPoint({x:view.origin.x+logical.x*view.scale,y:view.origin.y+logical.y*view.scale},view.safeRect);assert.ok(mapped);assert.ok(Math.abs(mapped.x-logical.x)<1e-9);assert.ok(Math.abs(mapped.y-logical.y)<1e-9);
 }
});
test('zero, nonfinite, negative and consumed dimensions are rejected rather than becoming a clickable viewport',()=>{
 for(const rect of [{x:0,y:0,w:0,h:2400},{x:NaN,y:0,w:1080,h:2400},{x:0,y:0,w:1080,h:Infinity},{x:0,y:0,w:-1,h:2400}])assert.throws(()=>computeAndroidViewport(rect,host),/viewport|dimension/i);
 for(const state of [{...host,widthPx:0},{...host,heightPx:NaN},{...host,insetsPx:{...host.insetsPx,left:-1}},{...host,insetsPx:{...host.insetsPx,right:Infinity}},{...host,insetsPx:{...host.insetsPx,left:1080}},{...host,insetsPx:{...host.insetsPx,bottom:2300}}])assert.throws(()=>computeAndroidViewport({x:0,y:0,w:1080,h:2400},state),/viewport|dimension|inset/i);
});
