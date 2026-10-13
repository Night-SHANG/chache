import test from 'node:test';
import assert from 'node:assert/strict';
import {createCanvas,loadImage} from '@napi-rs/canvas';
import {createProfile,type ThemeId} from '../src/application/profile.ts';
import {STATIC_ART_RESOURCES,STATIC_ART_SCENES} from '../src/presentation/static-art-manifest.ts';
import {configureStaticArt,prepareStaticArt} from '../src/presentation/static-art-resources.ts';
import {drawWarehouse} from '../src/presentation/warehouse-art.ts';
import {drawStaticArtSprite} from '../src/presentation/static-art-draw.ts';
import type {ViewState} from '../src/presentation/view-types.ts';
import type {Rect} from '../src/presentation/layout.ts';

const base:ViewState={selectedPieceId:null,hoverOrigin:null,preview:null,dragPoint:null,paused:false,message:'',saveStatus:'',elapsed:0,animation:null,debug:false,needsResume:false};
const themes=Object.keys(STATIC_ART_SCENES) as ThemeId[];
configureStaticArt(async path=>await loadImage(new URL('../'+Object.values(STATIC_ART_RESOURCES).find(r=>r.src===path)!.sourcePath,import.meta.url).pathname) as unknown as CanvasImageSource);
const view=(theme:ThemeId,android=false):ViewState=>({...base,profile:{...createProfile(),cosmetics:{theme,cargo:'classic',forklift:'yellow'}},...(android?{androidContentBounds:{x:0,y:0,w:1080,h:2400}}:{})});
const surface=(w=1080,h=2400)=>{const canvas=createCanvas(w,h);return {canvas,ctx:canvas.getContext('2d') as unknown as CanvasRenderingContext2D};};
const bytes=(ctx:CanvasRenderingContext2D,w:number,h:number)=>ctx.getImageData(0,0,w,h).data;

test('Android theme caps and side identity fill tall bounds rather than retain a 1920-high center picture',async()=>{
 for(const theme of themes){
  await prepareStaticArt({scene:`scene.${theme}`,shared:[],previews:[]});
  const {ctx}=surface();drawWarehouse(ctx,view(theme,true),{x:0,y:0,w:1080,h:2400});
  const sample=(x:number,y:number)=>ctx.getImageData(x,y,1,1).data[3];
  assert.equal(sample(540,2399),255,`${theme}: real scene reaches bottom`);
  assert.equal(sample(540,0),255,`${theme}: real scene reaches top`);
  for(const y of [120,620,1220,1820,2280])assert.ok(sample(70,y)>0,`${theme}: side scenery continues at ${y}`);
 }
});

test('non-Android retains every original scene pixel even when given tall background bounds',async()=>{
 for(const theme of themes){
  await prepareStaticArt({scene:`scene.${theme}`,shared:[],previews:[]});
  const a=surface(1205,2520),b=surface(1205,2520);a.ctx.translate(57,0);b.ctx.translate(57,0);
  drawWarehouse(a.ctx,view(theme),{x:-57,y:-100,w:1205,h:2520});drawStaticArtSprite(b.ctx,STATIC_ART_SCENES[theme]);
  assert.deepEqual(bytes(a.ctx,1205,2520),bytes(b.ctx,1205,2520),theme);
 }
});

test('Android retains exact 16:9 authored pixels when source and target outer frame coincide',async()=>{
 for(const theme of themes){
  await prepareStaticArt({scene:`scene.${theme}`,shared:[],previews:[]});
  const a=surface(1205,1920),b=surface(1205,1920);a.ctx.translate(57,0);b.ctx.translate(57,0);
  drawWarehouse(a.ctx,view(theme,true),{x:-57,y:0,w:1205,h:1920});drawStaticArtSprite(b.ctx,STATIC_ART_SCENES[theme]);
  assert.deepEqual(bytes(a.ctx,1205,1920),bytes(b.ctx,1205,1920),theme);
 }
});

test('Android composition stays finite, uses only static blits, and restores drawing state',async()=>{
 for(const theme of themes){
  await prepareStaticArt({scene:`scene.${theme}`,shared:[],previews:[]});
  const {ctx}=surface(1400,3300);ctx.globalAlpha=.75;ctx.lineWidth=7;
  const alpha=ctx.globalAlpha;let blits=0;const draw=ctx.drawImage.bind(ctx);ctx.drawImage=((...args:Parameters<CanvasRenderingContext2D['drawImage']>)=>{blits++;draw(...args);}) as CanvasRenderingContext2D['drawImage'];
  for(const name of ['fillRect','stroke','fill','createLinearGradient'] as const)ctx[name]=(()=>{throw Error(`${theme}: no live background painter ${name}`);}) as never;
  drawWarehouse(ctx,view(theme,true),{x:0,y:0,w:1205,h:3200});
  assert.ok(blits>1&&blits<=100,`${theme}: ${blits} finite blits`);assert.equal(ctx.globalAlpha,alpha);assert.equal(ctx.lineWidth,7);
 }
});

test('invalid Android bounds use the unchanged original scene',async()=>{
 await prepareStaticArt({scene:'scene.day',shared:[],previews:[]});
 for(const bounds of [undefined,{x:NaN,y:0,w:1080,h:2400},{x:0,y:0,w:0,h:2400},{x:0,y:0,w:1080,h:0}] as (Rect|undefined)[]){const a=surface(),b=surface();drawWarehouse(a.ctx,view('day',true),bounds);drawStaticArtSprite(b.ctx,STATIC_ART_SCENES.day);assert.deepEqual(bytes(a.ctx,1080,2400),bytes(b.ctx,1080,2400));}
});

test('Android static bands have no transparent seam at fractional native viewport scale',async()=>{
 await prepareStaticArt({scene:'scene.ocean_vault',shared:[],previews:[]});
 const {ctx}=surface(432,1008);ctx.setTransform(.37777777777778,0,0,.37777777777778,18,158);
 const bounds={x:-47.647058823529,y:-418.235294117647,w:1143.5294117647,h:2668.23529411763};
 drawWarehouse(ctx,view('ocean_vault',true),bounds);
 const center=ctx.getImageData(216,2,1,1004).data;
 for(let y=0;y<1004;y++)assert.equal(center[y*4+3],255,`opaque continuous scene at native row ${y+2}`);
});

test('classic spotlight and both upper rack rows remain one undistorted authored composition',async()=>{
 const {androidWarehouseBands}=await import('../src/presentation/android-warehouse-background.ts');
 for(const theme of ['day','night'] as const){const bands=androidWarehouseBands(theme,{x:0,y:0,w:1205,h:2800});assert.ok(bands.some(b=>!b.architecturalRail&&b.source.y===0&&b.source.h>=520),`${theme}: spotlight cannot be sliced through extensible rail gaps`);assert.ok(bands.some(b=>!b.architecturalRail&&b.source.y<=1824&&b.source.y+b.source.h>=1838),`${theme}: bottom joist stays thin`);}
});

test('older Canvas hosts without transform introspection still render the complete Android scene',async()=>{
 await prepareStaticArt({scene:'scene.ocean_vault',shared:[],previews:[]});
 const {ctx}=surface();Object.defineProperty(ctx,'getTransform',{value:undefined});
 assert.doesNotThrow(()=>drawWarehouse(ctx,view('ocean_vault',true),{x:0,y:0,w:1080,h:2400}));
 assert.equal(ctx.getImageData(540,2399,1,1).data[3],255);
});

test('all source bands are visited once and protected glyphs survive the smallest supported portrait width',async()=>{
 const {androidWarehouseBands}=await import('../src/presentation/android-warehouse-background.ts');
 for(const theme of themes)for(const width of [240,320,360,432,921,1080])for(const ratio of [16/9,18/9,20/9,21/9]){
  const bounds={x:-17,y:-49,w:width,h:width*ratio},bands=androidWarehouseBands(theme,bounds);let sy=0,dy=bounds.y;
  assert.ok(bands.length>1&&bands.length<=100,theme);
  for(const band of bands){assert.equal(band.source.y,sy);assert.ok(Math.abs(band.destination.y-dy)<1e-7);assert.equal(band.source.w,1205);assert.equal(band.destination.w,width);
   if(!band.architecturalRail){assert.ok(Math.abs(band.destination.h/band.source.h-width/1205)<1e-7);assert.ok(Math.round(band.destination.y+band.destination.h)-Math.round(band.destination.y)>=1,`${theme}: glyph retained at ${width} width`);}
   sy+=band.source.h;dy+=band.destination.h;
  }
  assert.equal(sy,1920);assert.ok(Math.abs(dy-(bounds.y+bounds.h))<1e-7);
 }
});
