// Historical authoring contract: hashes and assertions remain unchanged; runtime textures are covered separately.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { cargoBox } from '../scripts/static-art-authoring/src/presentation/assets.ts';
import { loadThemedForkliftAtlas } from '../scripts/static-art-authoring/src/presentation/themed-forklift-art.ts';
import { archivedRasterForklift } from './helpers/archived-raster-forklift.ts';
import { CARGO_ATLAS, loadCargoAtlas } from '../scripts/static-art-authoring/src/presentation/cargo-atlas.ts';
import type { CargoStyleId, ForkliftId } from '../scripts/static-art-authoring/src/application/profile.ts';

const fixture=JSON.parse(readFileSync(new URL('./fixtures/v020-rendered-art.json',import.meta.url),'utf8')) as {
 forklifts:{id:ForkliftId;size:number;sha256:string}[];
 cargo:{id:CargoStyleId;size:number;sha256:string}[];
};

test('archived v020 compositor: all twelve retained raster forklift renders remain exact at 32 headings and five sizes, including the former atlas edge',async()=>{
 assert.equal(await loadThemedForkliftAtlas(async path=>await loadImage(new URL('../'+path,import.meta.url).pathname) as unknown as CanvasImageSource),true);
 for(const entry of fixture.forklifts){
  const hash=createHash('sha256');
  for(let heading=0;heading<32;heading++){
   const ctx=createCanvas(200,200).getContext('2d');
   archivedRasterForklift(ctx as unknown as CanvasRenderingContext2D,100,100,entry.size,heading*Math.PI/16,entry.id);
   hash.update(ctx.getImageData(0,0,200,200).data);
  }
  assert.equal(hash.digest('hex'),entry.sha256,entry.id+'/'+entry.size+' must retain complete v0.20 rendered pixels');
 }
});

test('all fourteen old cargo renders remain exact with five semantic colors and live countdowns at five sizes',async()=>{
 assert.equal(await loadCargoAtlas(async path=>await loadImage(new URL('../'+path,import.meta.url).pathname) as unknown as CanvasImageSource),true);
 for(const entry of fixture.cargo){
  const hash=createHash('sha256');
  for(const cargo of CARGO_ATLAS.cargos)for(const remaining of [undefined,3,2,1]){
   const ctx=createCanvas(140,140).getContext('2d');
   cargoBox(ctx as unknown as CanvasRenderingContext2D,cargo,10,10,entry.size,1,remaining?{kind:'rush',remaining}:undefined,entry.id,true);
   hash.update(ctx.getImageData(0,0,140,140).data);
  }
  assert.equal(hash.digest('hex'),entry.sha256,entry.id+'/'+entry.size+' must retain complete v0.20 rendered pixels');
 }
});
