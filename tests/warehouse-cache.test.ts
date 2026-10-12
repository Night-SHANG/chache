import test from 'node:test';
import assert from 'node:assert/strict';
import {createCanvas} from '@napi-rs/canvas';
import type {Canvas} from '@napi-rs/canvas';
import type {CanvasSurface} from '../src/platform/types.ts';
import type {ThemeId} from '../src/application/profile.ts';
import type {Rect} from '../src/presentation/layout.ts';
const cache=await import('../src/presentation/warehouse-cache.ts').catch(()=>assert.fail('native static warehouse cache is not implemented'));
const context=(canvas:Canvas)=>canvas.getContext('2d') as unknown as CanvasRenderingContext2D;
const backdrop='#0c131c';
function fixture(){
 const surfaces:Canvas[]=[],events=new Map<CanvasSurface,Map<string,()=>void>>();let peakBytes=0;
 const factory=()=>{peakBytes=Math.max(peakBytes,bytes(surfaces));const surface=createCanvas(1,1);surfaces.push(surface);const callbacks=new Map<string,()=>void>();events.set(surface as unknown as CanvasSurface,callbacks);(surface as unknown as CanvasSurface).addEventListener=(name,callback)=>{callbacks.set(name,callback);};return surface as unknown as CanvasSurface;};
 cache.configureWarehouseCache(factory);return {surfaces,events,peakBytes:()=>peakBytes};
}
const bytes=(surfaces:Canvas[])=>surfaces.reduce((sum,s)=>sum+(s.width>1?s.width*s.height*4:0),0);
function paint(ctx:CanvasRenderingContext2D){ctx.fillStyle='#243345';ctx.fillRect(0,0,1080,1920);ctx.globalAlpha=.68;ctx.fillStyle='#a77233';ctx.fillRect(-57,62,1205,185);ctx.fillStyle='#101b27';ctx.fillRect(-47,78,1185,99);ctx.globalAlpha=1;}
function frame(ctx:CanvasRenderingContext2D,s=1,x=0,y=0){ctx.setTransform(1,0,0,1,0,0);ctx.fillStyle=backdrop;ctx.fillRect(0,0,ctx.canvas.width,ctx.canvas.height);ctx.setTransform(s,0,0,s,x,y);ctx.clearRect(0,0,1080,1920);}
function draw(ctx:CanvasRenderingContext2D,theme:ThemeId='day',bounds?:Rect,fn=paint){if(!cache.drawCachedWarehouse(ctx,theme,bounds,backdrop,fn))fn(ctx);}

test('unchanged warehouse frames paint once and reuse a single native-pixel layer',()=>{
 const f=fixture(),ctx=context(createCanvas(360,800));let paints=0;const fn=(c:CanvasRenderingContext2D)=>{paints++;paint(c);};
 for(let n=0;n<20;n++){frame(ctx,1/3,0,80);draw(ctx,'day',undefined,fn);}
 assert.equal(paints,1);assert.equal(f.surfaces.length,1);assert.equal(f.surfaces[0].width,360);assert.equal(f.surfaces[0].height,800);cache.configureWarehouseCache();
});

test('static layer preserves native scale, fractional phase, transparent edges and exact canvas bounds',()=>{
 for(const [w,h,s,x,y] of [[360,800,1/3,0,80],[540,1000,.5,0,20.3],[800,1000,.5,130.25,20.3],[1205,1920,1,57,0],[720,1560,2/3,0,140],[1080,2340,1,0,210]]){
  const f=fixture(),expected=createCanvas(w,h),actual=createCanvas(w,h);frame(context(expected),s,x,y);paint(context(expected));
  for(let i=0;i<2;i++){frame(context(actual),s,x,y);draw(context(actual));assert.deepEqual(actual.getContext('2d').getImageData(0,0,w,h).data,expected.getContext('2d').getImageData(0,0,w,h).data,`${w}/${s}/${x}/${y}`);}
  assert.equal(f.surfaces[0].width,w);assert.equal(f.surfaces[0].height,h);cache.configureWarehouseCache();
 }
});

test('theme, bounds, viewport, transform, DPR and asset revision replace and release the retained layer',()=>{
 const f=fixture(),canvas=createCanvas(360,800),ctx=context(canvas);let count=0;
 const check=(theme:ThemeId='day',bounds?:Rect)=>{frame(ctx,1/3);draw(ctx,theme,bounds);assert.equal(f.surfaces.length,++count);assert.ok(f.surfaces.slice(0,-1).every(s=>s.width===1&&s.height===1));};
 check();check('night');check('night',{x:-60,y:0,w:1200,h:1920});check('night',{x:-60,y:1,w:1200,h:1920});
 canvas.width=361;check();canvas.height=801;check();
 for(const s of [.5,2/3,1]){frame(ctx,s,.25,.75);draw(ctx);assert.equal(f.surfaces.length,++count);}
 cache.invalidateWarehouseCache();assert.equal(bytes(f.surfaces),0);check();cache.configureWarehouseCache();assert.equal(bytes(f.surfaces),0);
});

test('cache has a fixed 24 MiB and 4096-edge cap, evicts before allocation and never lowers resolution',()=>{
 const f=fixture(),canvas=createCanvas(1440,3120),ctx=context(canvas);frame(ctx,4/3);draw(ctx);assert.equal(f.surfaces.length,1);assert.equal(bytes(f.surfaces),1440*3120*4);
 draw(ctx,'night');assert.equal(f.peakBytes(),0);assert.equal(f.surfaces[0].width,1);
 canvas.width=2000;canvas.height=4000;frame(ctx);draw(ctx);assert.equal(f.surfaces.length,2);assert.equal(bytes(f.surfaces),0);
 canvas.width=4097;canvas.height=20;frame(ctx);draw(ctx);assert.equal(f.surfaces.length,2);cache.configureWarehouseCache();
});

test('unsupported or failing canvas capabilities fall back once without crashing or per-frame allocation retries',()=>{
 const ctx=context(createCanvas(360,800));for(const factory of [undefined,()=>{throw Error('allocation failed');},()=>({width:1,height:1,getContext:()=>null})]){
  let calls=0,paints=0;cache.configureWarehouseCache(factory?()=>{calls++;return factory();}:undefined);
  for(let n=0;n<3;n++){frame(ctx,1/3);draw(ctx,'day',undefined,c=>{paints++;paint(c);});}assert.equal(paints,3);assert.ok(calls<=1);
 }cache.configureWarehouseCache();
});

test('non-source-over, opacity, filters, shadows and unsupported transform never use grouped compositing',()=>{
 const f=fixture(),ctx=context(createCanvas(360,800));
 const patches=[()=>{ctx.globalAlpha=.7;},()=>{ctx.globalCompositeOperation='multiply';},()=>{ctx.filter='blur(1px)';},()=>{ctx.shadowBlur=2;},()=>{ctx.shadowOffsetX=1;},()=>{ctx.shadowColor='#ff0000';ctx.shadowOffsetY=1;},()=>{ctx.rotate(.1);},()=>{ctx.scale(-1,1);}];
 for(const patch of patches){ctx.save();frame(ctx,1/3);patch();assert.equal(cache.drawCachedWarehouse(ctx,'day',undefined,backdrop,paint),false);ctx.restore();}
 frame(ctx,1/3);assert.equal(cache.drawCachedWarehouse(ctx,'day',undefined,undefined,paint),false);assert.equal(f.surfaces.length,0);cache.configureWarehouseCache();
});

test('lost/restored cached or screen contexts release pixels and trigger a fresh paint',()=>{
 const f=fixture(),canvas=createCanvas(360,800),ctx=context(canvas),screenEvents=new Map<string,()=>void>();
 (canvas as unknown as CanvasSurface).addEventListener=(name,callback)=>{screenEvents.set(name,callback);};frame(ctx,1/3);draw(ctx);
 for(const event of ['contextlost','contextrestored']){const prior=f.surfaces[f.surfaces.length-1];f.events.get(prior as unknown as CanvasSurface)!.get(event)!();assert.equal(prior.width,1);draw(ctx);}
 screenEvents.get('contextlost')!();assert.equal(bytes(f.surfaces),0);screenEvents.get('contextrestored')!();draw(ctx);assert.equal(f.surfaces.length,4);
 const live=f.surfaces[f.surfaces.length-1].getContext('2d');Object.defineProperty(live,'isContextLost',{value:()=>true});assert.equal(cache.drawCachedWarehouse(ctx,'day',undefined,backdrop,paint),false);assert.equal(bytes(f.surfaces),0);cache.configureWarehouseCache();
});

test('cache blit failure restores caller state and falls back without poisoning later lifecycle recovery',()=>{
 const f=fixture(),ctx=context(createCanvas(360,800));frame(ctx,1/3,.25,.75);const transform=ctx.getTransform();ctx.lineWidth=7;ctx.setLineDash([4,2]);const original=ctx.drawImage.bind(ctx);ctx.drawImage=()=>{throw Error('blit unavailable');};
 assert.equal(cache.drawCachedWarehouse(ctx,'day',undefined,backdrop,paint),false);assert.deepEqual(ctx.getTransform(),transform);assert.equal(ctx.globalCompositeOperation,'source-over');assert.equal(ctx.lineWidth,7);assert.deepEqual(ctx.getLineDash(),[4,2]);assert.equal(bytes(f.surfaces),0);
 ctx.drawImage=original;cache.invalidateWarehouseCache();assert.equal(cache.drawCachedWarehouse(ctx,'day',undefined,backdrop,paint),true);cache.configureWarehouseCache();
});

test('failed creation cannot shrink a returned screen surface and malformed allocations release their pixels',()=>{
 const canvas=createCanvas(360,800),ctx=context(canvas);frame(ctx,1/3);cache.configureWarehouseCache(()=>canvas as unknown as CanvasSurface);
 assert.equal(cache.drawCachedWarehouse(ctx,'day',undefined,backdrop,paint),false);assert.equal(canvas.width,360);assert.equal(canvas.height,800);
 const surface={width:1,height:1,getContext:()=>({setTransform(){throw Error('unsupported transform');}} as unknown as CanvasRenderingContext2D)};cache.configureWarehouseCache(()=>surface);
 assert.equal(cache.drawCachedWarehouse(ctx,'day',undefined,backdrop,paint),false);assert.equal(surface.width,1);assert.equal(surface.height,1);cache.configureWarehouseCache();
});

test('target context loss, unavailable transform and unsafe bounds skip cached pixels',()=>{
 const f=fixture(),ctx=context(createCanvas(360,800));frame(ctx,1/3);draw(ctx);
 Object.defineProperty(ctx,'isContextLost',{configurable:true,value:()=>true});assert.equal(cache.drawCachedWarehouse(ctx,'day',undefined,backdrop,paint),false);assert.equal(bytes(f.surfaces),0);
 Object.defineProperty(ctx,'isContextLost',{configurable:true,value:()=>false});
 assert.equal(cache.drawCachedWarehouse(ctx,'day',{x:NaN,y:0,w:1080,h:1920},backdrop,paint),false);
 Object.defineProperty(ctx,'getTransform',{value:undefined});assert.equal(cache.drawCachedWarehouse(ctx,'day',undefined,backdrop,paint),false);assert.equal(f.surfaces.length,1);cache.configureWarehouseCache();
});
