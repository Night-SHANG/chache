import test from 'node:test';
import assert from 'node:assert/strict';
import {createCanvas,loadImage} from '@napi-rs/canvas';
import {resolve} from 'node:path';
import {COSMETIC_CATALOG} from '../src/application/cosmetics.ts';
import {createProfile,type ThemeId,type ForkliftId} from '../src/application/profile.ts';
import {STATIC_ART_RESOURCES} from '../src/presentation/static-art-manifest.ts';
import {prepareStaticArt,getStaticArtImage} from '../src/presentation/static-art-resources.ts';
import {staticArtStartupRequirementsForView,staticArtCoreRequirementsForView} from '../src/presentation/static-art-requirements.ts';
import {prepareAndroidStartupArt} from '../src/platform/android-startup-art.ts';
import {computeAndroidViewport} from '../src/platform/android-viewport.ts';
import {render} from '../src/presentation/renderer.ts';
import {sessionHost} from './helpers/session-fixtures.ts';
const themes=COSMETIC_CATALOG.filter(c=>c.kind==='theme').map(c=>c.id as ThemeId),forklifts=COSMETIC_CATALOG.filter(c=>c.kind==='forklift').map(c=>c.id as ForkliftId);
const cache=new Map<string,Promise<CanvasImageSource>>();
// Reuse the native surface across the exhaustive matrix rather than retaining hundreds of native allocations until GC.
const canvas=createCanvas(540,1200),ctx=canvas.getContext('2d') as unknown as CanvasRenderingContext2D;
function image(path:string){let value=cache.get(path);if(!value){const resource=Object.values(STATIC_ART_RESOURCES).find(r=>r.src===path)!;value=loadImage(resolve(resource.sourcePath)).then(image=>image as unknown as CanvasImageSource);cache.set(path,value);}return value;}
function fixture(theme:ThemeId,forklift:ForkliftId){
 const {session}=sessionHost();
 const vp=computeAndroidViewport({x:0,y:0,w:540,h:1200},{active:true,owner:true,widthPx:540,heightPx:1200,insetsPx:{top:24,right:0,bottom:18,left:0}});
 const view={...session.view,screen:'menu' as const,needsResume:false,account:null,profile:{...createProfile(),cosmetics:{theme,forklift,cargo:'classic' as const}},androidContentBounds:vp.content};
 return {view,pixels(){ctx.resetTransform();ctx.fillStyle='#0c131c';ctx.fillRect(0,0,540,1200);ctx.setTransform(vp.scale,0,0,vp.scale,vp.origin.x,vp.origin.y);render(ctx,session.state,view,vp.overlay,vp.overlay);return Buffer.from(ctx.getImageData(0,0,540,1200).data);}};
}
test('all 99 current Android menus have identical pixels before and after optional shared images',async()=>{
 for(const theme of themes)for(const forklift of forklifts){const f=fixture(theme,forklift);assert.equal((await prepareAndroidStartupArt(image,staticArtStartupRequirementsForView(f.view))).status,'ready');const first=f.pixels();await prepareStaticArt(staticArtCoreRequirementsForView(f.view));assert.deepEqual(f.pixels(),first,`${theme}/${forklift}`);}
});
test('all 297 scene vehicle and combined failures keep three consecutive complete menu frames stable',async()=>{
 for(const theme of themes)for(const forklift of forklifts)for(const failure of ['scene','vehicle','both']){
  const f=fixture(theme,forklift),required=staticArtStartupRequirementsForView(f.view),failed=new Set([...(failure!=='vehicle'?[STATIC_ART_RESOURCES[required.scene]!.src]:[]),...(failure!=='scene'?required.shared.map(key=>STATIC_ART_RESOURCES[key]!.src):[])]);
  assert.equal((await prepareAndroidStartupArt(path=>failed.has(path)?Promise.reject(Error('Injected startup image failure')):image(path),required)).status,'error');
  const first=f.pixels();await prepareStaticArt(staticArtCoreRequirementsForView(f.view));for(let frame=0;frame<3;frame++)assert.deepEqual(f.pixels(),first,`${theme}/${forklift}/${failure}/${frame}`);
 }
});
test('deadline fallback remains pixel-identical after late scene or forklift onload',async()=>{
 for(const heldKind of ['scene','vehicle']){
  const f=fixture('day','yellow'),required=staticArtStartupRequirementsForView(f.view),heldKey=heldKind==='scene'?required.scene:required.shared[0]!,heldPath=STATIC_ART_RESOURCES[heldKey]!.src;
  await Promise.all(Object.values(STATIC_ART_RESOURCES).map(r=>image(r.src)));let release:((value:CanvasImageSource)=>void)|undefined;
  assert.equal((await prepareAndroidStartupArt(path=>path===heldPath?new Promise(resolve=>{release=resolve;}):image(path),required,5)).status,'error');
  const first=f.pixels();await prepareStaticArt(staticArtCoreRequirementsForView(f.view));release!(await image(heldPath));await new Promise<void>(resolve=>setImmediate(resolve));assert.equal(getStaticArtImage(heldKey),null);for(let frame=0;frame<3;frame++)assert.deepEqual(f.pixels(),first);
 }
});
