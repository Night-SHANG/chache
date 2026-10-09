import test from 'node:test';
import assert from 'node:assert/strict';
import {createCanvas} from '@napi-rs/canvas';
import type {Canvas} from '@napi-rs/canvas';
const cacheModule=await import('../src/presentation/cosmetic-preview-cache.ts').catch(()=>assert.fail('bounded cosmetic preview cache must be implemented')); 
import {drawCosmeticSetPreview} from '../src/presentation/cosmetic-art.ts';
import type {CanvasSurface} from '../src/platform/types.ts';
import type {CosmeticPreviewOptions} from '../src/presentation/cosmetic-art.ts';

const asContext=(canvas:Canvas)=>canvas.getContext('2d') as unknown as CanvasRenderingContext2D;
const rect={x:12,y:18,w:360,h:246};
const options:CosmeticPreviewOptions={theme:'cold_chain',cargoStyle:'insulated',forklift:'electric',cargoOutline:false};
function fixture(){
 const surfaces:Canvas[]=[],events=new Map<CanvasSurface,Map<string,()=>void>>();
 const factory=()=>{const canvas=createCanvas(1,1),surface=canvas as unknown as CanvasSurface;surfaces.push(canvas);const callbacks=new Map<string,()=>void>();events.set(surface,callbacks);surface.addEventListener=(name,callback)=>{callbacks.set(name,callback);};return surface;};
 cacheModule.configureCosmeticPreviewCache(factory);
 return {surfaces,events,factory};
}
function draw(ctx:CanvasRenderingContext2D,patch:CosmeticPreviewOptions={}){drawCosmeticSetPreview(ctx,rect,{...options,...patch});}
const bytes=(surfaces:Canvas[])=>surfaces.reduce((sum,s)=>sum+(s.width>1?s.width*s.height*4:0),0);

test('static set cache reuses one allocated artwork composite for unchanged warm frames',()=>{
 const f=fixture(),canvas=createCanvas(420,300),ctx=asContext(canvas);draw(ctx);assert.equal(f.surfaces.length,1);const cold=canvas.getContext('2d').getImageData(0,0,420,300).data;
 for(let frame=0;frame<20;frame++){ctx.clearRect(0,0,420,300);draw(ctx);}
 assert.equal(f.surfaces.length,1);assert.deepEqual(canvas.getContext('2d').getImageData(0,0,420,300).data,cold);cacheModule.configureCosmeticPreviewCache();
});

test('keys include every appearance component, dimensions, exact render scale and pixel phase',()=>{
 const f=fixture(),ctx=asContext(createCanvas(1080,1920));draw(ctx);let previous=f.surfaces.length;
 for(const patch of [{theme:'night'},{cargoStyle:'classic'},{forklift:'yellow'},{cargoOutline:true}] as const){draw(ctx,patch);assert.equal(f.surfaces.length,++previous);}
 drawCosmeticSetPreview(ctx,{...rect,w:361},options);assert.equal(f.surfaces.length,++previous);
 ctx.setTransform(.5,0,0,.5,0,0);draw(ctx);assert.equal(f.surfaces.length,++previous);
 ctx.setTransform(1/3,0,0,1/3,0,0);draw(ctx);assert.equal(f.surfaces.length,++previous);
 ctx.setTransform(1/3,0,0,1/3,.25,0);draw(ctx);assert.equal(f.surfaces.length,++previous);
 cacheModule.configureCosmeticPreviewCache();
});

test('LRU retains recently used previews and releases evicted backing stores within count and byte limits',()=>{
 const f=fixture(),ctx=asContext(createCanvas(1080,1920));const themes=['day','night','harbor','cold_chain','rail_freight'] as const;
 for(const theme of themes)draw(ctx,{theme});assert.equal(f.surfaces.length,5);draw(ctx,{theme:'day'});draw(ctx,{theme:'express_sorting'});
 assert.equal(f.surfaces[0].width,360);assert.equal(f.surfaces[1].width,1);assert.equal(f.surfaces[1].height,1);assert.equal(f.surfaces.filter(s=>s.width>1).length,5);
 for(const theme of themes){drawCosmeticSetPreview(ctx,{x:0,y:0,w:816,h:840},{...options,theme});assert.ok(bytes(f.surfaces)<=5_000_000);assert.ok(f.surfaces.filter(s=>s.width>1).length<=5);}
 cacheModule.configureCosmeticPreviewCache();assert.equal(bytes(f.surfaces),0);
});

test('asset readiness invalidation frees fallback composites and redraws them with newly ready artwork',()=>{
 const f=fixture(),ctx=asContext(createCanvas(420,300));draw(ctx);const previous=f.surfaces[0];cacheModule.invalidateCosmeticPreviewCache();assert.equal(previous.width,1);draw(ctx);assert.equal(f.surfaces.length,2);cacheModule.configureCosmeticPreviewCache();
});

test('missing factory, thrown allocation and missing context use complete uncached artwork without retrying allocation every frame',()=>{
 const expected=createCanvas(420,300);cacheModule.configureCosmeticPreviewCache();draw(asContext(expected));const pixels=expected.getContext('2d').getImageData(0,0,420,300).data;
 for(const factory of [undefined,()=>{throw Error('no offscreen');},()=>({width:0,height:0,getContext:()=>null})]){
  let allocations=0;cacheModule.configureCosmeticPreviewCache(factory?()=>{allocations++;return factory();}:undefined);
  const actual=createCanvas(420,300);for(let i=0;i<3;i++){asContext(actual).clearRect(0,0,420,300);draw(asContext(actual));}
  assert.deepEqual(actual.getContext('2d').getImageData(0,0,420,300).data,pixels);assert.ok(allocations<=1);
 }
 cacheModule.configureCosmeticPreviewCache();
});

test('restored offscreen context invalidates the blank cached surface and safely rebuilds',()=>{
 const f=fixture(),canvas=createCanvas(420,300),ctx=asContext(canvas);draw(ctx);const first=f.surfaces[0],cold=canvas.getContext('2d').getImageData(0,0,420,300).data;
 first.getContext('2d').clearRect(0,0,first.width,first.height);f.events.get(first as unknown as CanvasSurface)?.get('contextrestored')?.();
 ctx.clearRect(0,0,420,300);draw(ctx);assert.equal(f.surfaces.length,2);assert.deepEqual(canvas.getContext('2d').getImageData(0,0,420,300).data,cold);cacheModule.configureCosmeticPreviewCache();
});

test('cached painting restores caller drawing state and unsupported transforms remain uncached',()=>{
 const f=fixture(),canvas=createCanvas(540,960),ctx=asContext(canvas);ctx.setTransform(.5,0,0,.5,3,5);ctx.fillStyle='#123456';ctx.lineWidth=7;ctx.setLineDash([4,2]);const transform=ctx.getTransform();draw(ctx);
 assert.deepEqual(ctx.getTransform(),transform);assert.deepEqual(ctx.getLineDash(),[4,2]);assert.equal(ctx.lineWidth,7);ctx.fillRect(0,0,1,1);
 const allocations=f.surfaces.length;ctx.rotate(.1);draw(ctx);assert.equal(f.surfaces.length,allocations);cacheModule.configureCosmeticPreviewCache();
});

test('320, 360 and 540 CSS pixel render scales use native-resolution surfaces with identical cold and warm pixels',()=>{
 for(const width of [320,360,540])for(const dpr of [1,2,3]){
  const f=fixture(),canvas=createCanvas(width*dpr,Math.round(width*1920/1080)*dpr),ctx=asContext(canvas),scale=width*dpr/1080;ctx.setTransform(scale,0,0,scale,0,0);draw(ctx);assert.equal(f.surfaces.length,1);assert.equal(f.surfaces[0].width,Math.ceil((rect.x+rect.w)*ctx.getTransform().a)-Math.floor(rect.x*ctx.getTransform().a));
  const cold=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;ctx.clearRect(0,0,1080,1920);draw(ctx);assert.deepEqual(canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data,cold);cacheModule.configureCosmeticPreviewCache();
 }
});

test('each actual atlas readiness change replaces stale fallback artwork and loaded warm frames stay identical',async()=>{
 const {loadImage}=await import('@napi-rs/canvas'),{loadCargoAtlas}=await import('../src/presentation/cargo-atlas.ts'),{loadBoardMaterialAtlas}=await import('../src/presentation/board-material-atlas.ts'),{loadSceneMaterialAtlas}=await import('../src/presentation/scene-frame-atlas.ts'),{loadThemedForkliftAtlas}=await import('../src/presentation/themed-forklift-art.ts');
 const loaders=[loadCargoAtlas,loadBoardMaterialAtlas,loadSceneMaterialAtlas,loadThemedForkliftAtlas];for(const load of loaders)await load(async()=>{throw Error('not ready');});
 const f=fixture(),canvas=createCanvas(420,300),ctx=asContext(canvas);
 for(const load of loaders){
  // Legacy day/night use the original board atlas; other themes use the new scene atlas.
  const patch:CosmeticPreviewOptions=load===loadBoardMaterialAtlas?{theme:'day'}:{};
  ctx.clearRect(0,0,420,300);draw(ctx,patch);const before=canvas.getContext('2d').getImageData(0,0,420,300).data,allocations=f.surfaces.length;
  assert.equal(await load(async path=>await loadImage(path) as unknown as CanvasImageSource).then(result=>{cacheModule.invalidateCosmeticPreviewCache();return result;}),true);
  assert.ok(f.surfaces.every(s=>s.width===1&&s.height===1));
  ctx.clearRect(0,0,420,300);draw(ctx,patch);assert.equal(f.surfaces.length,allocations+1);const ready=canvas.getContext('2d').getImageData(0,0,420,300).data;assert.notDeepEqual(ready,before,'a ready actual atlas must replace its cached fallback');
  ctx.clearRect(0,0,420,300);draw(ctx,patch);assert.deepEqual(canvas.getContext('2d').getImageData(0,0,420,300).data,ready);
 }
 assert.equal(f.surfaces.filter(s=>s.width>1).length,1);cacheModule.configureCosmeticPreviewCache();
});

test('oversized DPR surfaces fall back without allocating or degrading source resolution',()=>{
 const f=fixture(),canvas=createCanvas(200,200),ctx=asContext(canvas);ctx.setTransform(3,0,0,3,0,0);drawCosmeticSetPreview(ctx,{x:0,y:0,w:816,h:840},options);assert.equal(f.surfaces.length,0);cacheModule.configureCosmeticPreviewCache();
});
