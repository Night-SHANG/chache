import test from 'node:test';
import assert from 'node:assert/strict';
import {createCanvas,loadImage} from '@napi-rs/canvas';
import type {Canvas} from '@napi-rs/canvas';
import {render} from '../src/presentation/renderer.ts';
import {configureWarehouseCache,invalidateWarehouseCache} from '../src/presentation/warehouse-cache.ts';
import {createRunV18} from '../src/domain/v18/engine.ts';
import {createProfile} from '../src/application/profile.ts';
import type {ThemeId} from '../src/application/profile.ts';
import {COSMETIC_CATALOG} from '../src/application/cosmetics.ts';
import type {CanvasSurface} from '../src/platform/types.ts';
import type {ViewState} from '../src/presentation/view-types.ts';
import type {Rect} from '../src/presentation/layout.ts';
import {loadCargoAtlas} from '../src/presentation/cargo-atlas.ts';
import {loadBoardMaterialAtlas} from '../src/presentation/board-material-atlas.ts';
import {loadSceneMaterialAtlas} from '../src/presentation/scene-frame-atlas.ts';
import {loadThemedForkliftAtlas} from '../src/presentation/themed-forklift-art.ts';
const state=createRunV18({mode:'standard',seed:17,inboundDifficulty:'hard'});
const base:ViewState={screen:'game',selectedPieceId:null,hoverOrigin:null,preview:null,dragPoint:null,paused:false,message:'',saveStatus:'',elapsed:0,animation:null,debug:false,needsResume:false};
const backdrop='#0c131c';
function frame(canvas:Canvas,view=base,s=1,x=0,y=0,bounds?:Rect,cached=true){
 const ctx=canvas.getContext('2d');ctx.setTransform(1,0,0,1,0,0);ctx.fillStyle=backdrop;ctx.fillRect(0,0,canvas.width,canvas.height);ctx.setTransform(s,0,0,s,x,y);
 render(ctx as unknown as CanvasRenderingContext2D,state,view,bounds,{x:-x/s,y:-y/s,w:canvas.width/s,h:canvas.height/s},cached?backdrop:undefined);
 return ctx.getImageData(0,0,canvas.width,canvas.height).data;
}
const fixture=()=>{const surfaces:Canvas[]=[];configureWarehouseCache(()=>{const c=createCanvas(1,1);surfaces.push(c);return c as unknown as CanvasSurface;});return surfaces;};

test('production renderer opts in once while all later warehouse frames use that surface',()=>{
 const surfaces=fixture(),canvas=createCanvas(360,800);frame(canvas,base,1/3,0,80);for(let i=0;i<10;i++)frame(canvas,{...base,elapsed:i*16},1/3,0,80);
 assert.equal(surfaces.length,1);configureWarehouseCache();
});

test('all themes preserve complete original cold and warm frame pixels at native scale, phase, bounds and overlay',async()=>{
 for(const load of [loadCargoAtlas,loadBoardMaterialAtlas,loadSceneMaterialAtlas,loadThemedForkliftAtlas])assert.equal(await load(async path=>await loadImage(path) as unknown as CanvasImageSource),true);
 for(const theme of [...COSMETIC_CATALOG.filter(item=>item.kind==='theme').map(item=>item.id as ThemeId),'express_sorting'] as ThemeId[])for(const [w,h,s,x,y] of [[360,800,1/3,0,80],[540,1000,.5,0,20.3],[800,1000,.5,130.25,20.3],[1080,2340,1,0,210]]){
  const view={...base,profile:{...createProfile(),cosmetics:{theme,cargo:'classic',forklift:'yellow'} as const},paused:theme==='night'},bounds={x:-60,y:0,w:1200,h:1920};
  configureWarehouseCache();const expected=frame(createCanvas(w,h),view,s,x,y,bounds,false),surfaces=fixture(),actual=createCanvas(w,h);
  for(let i=0;i<2;i++)assert.deepEqual(frame(actual,view,s,x,y,bounds),expected,`${theme}/${w}/${s}/${x}/${y}/${i}`);
  assert.equal(surfaces.length,1);configureWarehouseCache();
 }
});

test('unconfigured renderer and caller without platform backdrop always retain original artwork',()=>{
 const canvas=createCanvas(360,800);configureWarehouseCache();const expected=frame(canvas,base,1/3,0,80,undefined,false),surfaces=fixture();
 assert.deepEqual(frame(canvas,base,1/3,0,80,undefined,false),expected);assert.equal(surfaces.length,0);configureWarehouseCache();
});

test('resource completion and hide/show invalidation release stale warehouse pixels before the next frame',async()=>{
 const view={...base,profile:{...createProfile(),cosmetics:{theme:'forest_depot',cargo:'classic',forklift:'yellow'} as const}},canvas=createCanvas(360,800);
 await loadSceneMaterialAtlas(async()=>{throw Error('loading');});const surfaces=fixture(),before=frame(canvas,view,1/3,0,80);
 assert.equal(await loadSceneMaterialAtlas(async path=>await loadImage(path) as unknown as CanvasImageSource).then(result=>{invalidateWarehouseCache();return result;}),true);
 assert.equal(surfaces[0].width,1);const after=frame(canvas,view,1/3,0,80);assert.notDeepEqual(after,before);assert.equal(surfaces.length,2);
 for(const lifecycle of ['hide','show']){invalidateWarehouseCache();assert.ok(surfaces.every(s=>s.width===1),lifecycle);assert.deepEqual(frame(canvas,view,1/3,0,80),after);}
 configureWarehouseCache();
});
