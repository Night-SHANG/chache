// Historical authoring contract: hashes and assertions remain unchanged; runtime textures are covered separately.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { CARGO_ATLAS, loadCargoAtlas } from '../scripts/static-art-authoring/src/presentation/cargo-atlas.ts';
import { THEMED_FORKLIFT_ATLAS } from '../scripts/static-art-authoring/src/presentation/themed-forklift-art.ts';
import { cargoBox } from '../scripts/static-art-authoring/src/presentation/assets.ts';

test('v0.21 appends one cargo style and three forklift bodies in stable order', () => {
 assert.equal(CARGO_ATLAS.styles[CARGO_ATLAS.styles.length-1], 'harbor_container');
 assert.equal(CARGO_ATLAS.styles.length, 15);
 assert.equal(CARGO_ATLAS.height, 2010);
 assert.deepEqual(THEMED_FORKLIFT_ATLAS.paints.slice(-3), ['timber', 'ice', 'harbor']);
 assert.equal(THEMED_FORKLIFT_ATLAS.width, 2048);
 assert.deepEqual(THEMED_FORKLIFT_ATLAS.tileColumns,[0,1,2,3,4,5,6,7,8,9,10,11,13,14,15]);
});

test('every original cargo row and forklift crop retains its frozen v0.20 decoded pixels', async () => {
 const baseline = JSON.parse(readFileSync(new URL('./fixtures/v020-protected-art.json', import.meta.url), 'utf8')) as Record<string, {id:string;rect:[number,number,number,number];sha256:string}[]>;
 for (const [key,path] of [['cargo','cargo-materials.png'],['forklifts','themed-forklifts.png']]) {
  const image = await loadImage(new URL('../assets/'+path, import.meta.url).pathname);
  const ctx = createCanvas(image.width,image.height).getContext('2d'); ctx.drawImage(image,0,0);
  for (const entry of baseline[key]) assert.equal(createHash('sha256').update(ctx.getImageData(...entry.rect).data).digest('hex'),entry.sha256,entry.id+' must stay pixel-exact');
 }
});

test('new generated atlas rows obey their incremental byte budgets and preserve source evidence', () => {
 const cargo = JSON.parse(readFileSync(new URL('../assets/cargo-materials.manifest.json',import.meta.url),'utf8'));
 const fork = JSON.parse(readFileSync(new URL('../assets/themed-forklifts.manifest.json',import.meta.url),'utf8'));
 assert.ok(cargo.bytes - 327124 <= 30 * 1024);
 assert.ok(fork.bytes - 46983 <= 25 * 1024);
 assert.equal(cargo.sources[cargo.sources.length-1].style, 'harbor_container');
 assert.equal(cargo.sources[cargo.sources.length-1].cropRects.length,5);
 for (const [left,top,right,bottom] of cargo.sources[cargo.sources.length-1].cropRects) assert.ok((right-left)/(bottom-top)>=1 && (right-left)/(bottom-top)<=1.04, 'harbor boxes stay square without stretching');
 assert.equal(fork.newSource.paints.length,3);
 for (const path of [cargo.sources[cargo.sources.length-1].path, fork.newSource.path]) assert.ok(readFileSync(new URL('../'+path,import.meta.url)).length>100000);
});

test('harbor cargo keeps five semantic colors and distinct live 3/2/1 badges at 29 and 37 pixels', async () => {
 assert.equal(await loadCargoAtlas(async path => await loadImage(new URL('../'+path,import.meta.url).pathname) as unknown as CanvasImageSource),true);
 for (const size of [29,37]) {
  const versions = new Set<string>();
  for (const cargo of CARGO_ATLAS.cargos) {
   const badges = new Set<string>();
   for (const remaining of [3,2,1]) {
    const ctx = createCanvas(size,size).getContext('2d');
    cargoBox(ctx as unknown as CanvasRenderingContext2D,cargo,0,0,size,1,{kind:'rush',remaining},'harbor_container',true);
    const pixels = ctx.getImageData(0,0,size,size).data;
    const hash = createHash('sha256').update(pixels).digest('hex'); badges.add(hash); versions.add(hash);
    assert.ok(pixels.some((value,index) => index%4===3 && value>240),'solid visible box pixels');
   }
   assert.equal(badges.size,3,cargo+'/'+size+' must retain changing countdowns');
  }
  assert.equal(versions.size,15,'all five colors and three countdowns remain distinguishable');
 }
});
