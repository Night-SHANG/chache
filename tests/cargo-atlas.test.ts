import test from 'node:test';
import assert from 'node:assert/strict';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { readFileSync } from 'node:fs';
import { cargoBox } from '../src/presentation/assets.ts';
import { COSMETIC_PREVIEW_RECT } from '../src/presentation/economy-ui.ts';
import type { CargoStyleId } from '../src/application/profile.ts';

const moduleUrl=new URL('../src/presentation/cargo-atlas.ts',import.meta.url).href;
// Dynamic lookup lets the red phase fail on the missing capability, rather than an import error.
const atlas=await import(moduleUrl).catch(()=>null) as null|{loadCargoAtlas:(loader:(path:string)=>Promise<CanvasImageSource>)=>Promise<boolean>};
const imagePath=new URL('../assets/cargo-materials.png',import.meta.url).pathname;
function pixels(style:CargoStyleId,trait?:{kind:'rush';remaining:number}){const ctx=createCanvas(140,140).getContext('2d');cargoBox(ctx as unknown as CanvasRenderingContext2D,'cargo.cold',10,10,110,1,trait,style,true);return ctx.getImageData(0,0,140,140).data;}

test('cold and failed atlas loading use a complete classic crate without losing live countdowns',async()=>{
 assert.ok(atlas,'whole-body atlas loader must exist');
 let release:(value:CanvasImageSource)=>void=()=>{};const pending=atlas.loadCargoAtlas(()=>new Promise(resolve=>{release=resolve;}));
 for(const style of ['wood','reinforced','ice_crystal'] as const)for(const remaining of [3,2,1])assert.deepEqual(pixels(style,{kind:'rush',remaining}),pixels('classic',{kind:'rush',remaining}));
 release(await loadImage(imagePath) as unknown as CanvasImageSource);assert.equal(await pending,true);
 assert.notDeepEqual(pixels('ice_crystal'),pixels('classic'));
 assert.equal(await atlas.loadCargoAtlas(async()=>{throw Error('missing asset');}),false);
 assert.deepEqual(pixels('wood',{kind:'rush',remaining:1}),pixels('classic',{kind:'rush',remaining:1}));
});
test('bundled atlas has transparent cell gutters and its exact path loads all fifteen different bodies',async()=>{
 assert.ok(atlas,'whole-body atlas loader must exist');const paths:string[]=[];
 assert.equal(await atlas.loadCargoAtlas(async path=>{paths.push(path);return await loadImage(imagePath) as unknown as CanvasImageSource;}),true);assert.deepEqual(paths,['assets/cargo-materials.png']);
 const image=await loadImage(imagePath);assert.equal(image.width,670);assert.equal(image.height,2010);
 const c=createCanvas(image.width,image.height).getContext('2d');c.drawImage(image,0,0);const data=c.getImageData(0,0,image.width,image.height).data;
 for(let y=0;y<image.height;y++)for(let x=0;x<image.width;x++)if(x%134<3||x%134>=131||y%134<3||y%134>=131)assert.equal(data[(y*image.width+x)*4+3],0,`transparent atlas gutter ${x},${y}`);
 for(const [a,b] of [['wood','reinforced'],['reinforced','ice_crystal'],['wood','ice_crystal']] as const)assert.notDeepEqual(pixels(a),pixels(b));
});


test('committed raster artwork verifies every generated source and exact encoded atlas',async()=>{
 const {generateCargoAtlas}=await import(new URL('../scripts/generate-cargo-atlas.mjs',import.meta.url).href) as {generateCargoAtlas:(options?:{verifySources:boolean})=>Buffer};
 assert.deepEqual(generateCargoAtlas({verifySources:true}),readFileSync(imagePath));
});

test('atlas completion changes only shop pixels, preserving active session checksum, wallet and storage',async()=>{
 assert.ok(atlas);
 const [{sessionHost},{playableChecksum},{render}]=await Promise.all([import('./helpers/session-fixtures.ts'),import('../src/domain/playable.ts'),import('../src/presentation/renderer.ts')]);
 await atlas.loadCargoAtlas(async()=>{throw Error('not loaded');});
 const {session,data}=sessionHost({wallet:57});session.action({type:'shop'});session.action({type:'selectShopTab',tab:'cosmetics'});session.action({type:'selectShopSection',section:'cargo'});session.action({type:'previewCosmetic',kind:'cargo',id:'ice_crystal'});assert.equal(session.view.shopItemDetail,undefined);assert.equal(session.view.cosmeticPreview?.cargo,'ice_crystal');
 const state=playableChecksum(session.state),account=JSON.stringify(session.view.account),stored=[...data];
 const pixels=()=>{const ctx=createCanvas(1080,1920).getContext('2d');render(ctx as unknown as CanvasRenderingContext2D,session.state,session.view);const {x,y,w,h}=COSMETIC_PREVIEW_RECT;return ctx.getImageData(x,y,w,h).data;};
 const pending=pixels();assert.equal(await atlas.loadCargoAtlas(async()=>await loadImage(imagePath) as unknown as CanvasImageSource),true);assert.notDeepEqual(pixels(),pending);
 assert.equal(playableChecksum(session.state),state);assert.equal(JSON.stringify(session.view.account),account);assert.deepEqual([...data],stored);assert.equal(session.view.account?.wallet,57);
});
