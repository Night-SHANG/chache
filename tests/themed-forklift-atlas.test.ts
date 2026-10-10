import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { forklift } from '../src/presentation/assets.ts';
import type { ForkliftId } from '../src/application/profile.ts';

async function art() {
 try { return await import('../src/presentation/themed-forklift-art.ts'); }
 catch { assert.fail('A shared bounded raster body renderer must exist for all fifteen themed forklifts'); }
}
test('the fifteen-theme forklift atlas has stable order and rejects absent or incorrectly sized artwork', async () => {
 const { THEMED_FORKLIFT_ATLAS, loadThemedForkliftAtlas, drawThemedForkliftBody } = await art();
 assert.equal(THEMED_FORKLIFT_ATLAS.src, 'assets/themed-forklifts.png');
 assert.deepEqual([THEMED_FORKLIFT_ATLAS.width, THEMED_FORKLIFT_ATLAS.height, THEMED_FORKLIFT_ATLAS.tileSize], [2048, 128, 128]);
 assert.deepEqual(THEMED_FORKLIFT_ATLAS.paints, ['electric', 'heavy', 'compact', 'toy', 'paper', 'space', 'steam', 'neon', 'lava', 'diving', 'royal', 'field', 'timber', 'ice', 'harbor']);
 const canvas = createCanvas(200, 200), ctx = canvas.getContext('2d') as unknown as CanvasRenderingContext2D;
 for (const outcome of [() => Promise.reject(Error('offline')), () => Promise.resolve(createCanvas(128, 128) as unknown as CanvasImageSource)]) {
  assert.equal(await loadThemedForkliftAtlas(outcome), false);
  assert.equal(drawThemedForkliftBody(ctx, 'steam'), false);
 }
 assert.ok(canvas.getContext('2d').getImageData(0, 0, 200, 200).data.every(value => value === 0));
});

test('generated body sampling maps only to the existing body envelope and leaves the four protected models untouched', async () => {
 const { THEMED_FORKLIFT_ATLAS, loadThemedForkliftAtlas, drawThemedForkliftBody } = await art();
 const atlas = createCanvas(2048, 128), source = atlas.getContext('2d');
 const colors = ['#805030', '#308090', '#704030', '#207060', '#908050', '#607030', '#306080', '#804090', '#908070', '#807060', '#708060', '#609080', '#6d5030', '#408090', '#305070'];
 colors.forEach((color, index) => { source.fillStyle = color; source.fillRect(THEMED_FORKLIFT_ATLAS.tileColumns[index] * 128, 0, 128, 128); });
 assert.equal(await loadThemedForkliftAtlas(async () => atlas as unknown as CanvasImageSource), true);
 for (const [index, paint] of THEMED_FORKLIFT_ATLAS.paints.entries()) {
  const ctx = createCanvas(200, 200).getContext('2d'); ctx.translate(100, 100); ctx.globalAlpha = .8; ctx.lineWidth = 9;
  assert.equal(drawThemedForkliftBody(ctx as unknown as CanvasRenderingContext2D, paint), true);
  assert.equal(ctx.globalAlpha, .8); assert.equal(ctx.lineWidth, 9);
  const pixel = [...ctx.getImageData(100, 100, 1, 1).data];
  const expected = [1, 3, 5].map(offset => parseInt(colors[index].slice(offset, offset + 2), 16));
  pixel.slice(0, 3).forEach((value, channel) => assert.ok(Math.abs(value - expected[channel]) <= 1, 'allow only alpha premultiplication rounding')); assert.equal(pixel[3], 204);
  const pixels = ctx.getImageData(0, 0, 200, 200).data;
  for (let y = 0; y < 200; y++) for (let x = 0; x < 200; x++) if (x < 56 || x >= 136 || y < 60 || y >= 140) assert.equal(pixels[(y * 200 + x) * 4 + 3], 0, `${paint}: texture must stay in the fixed square sampling box`);
  assert.equal(ctx.getImageData(100, 62, 1, 1).data[3], 204, 'square 128px source must map to square 80px sampling without vertical squash');
 }
 const ctx = createCanvas(200, 200).getContext('2d');
 for (const paint of ['yellow', 'blue', 'red', 'white'] as const) assert.equal(drawThemedForkliftBody(ctx as unknown as CanvasRenderingContext2D, paint), false);
 assert.ok(ctx.getImageData(0, 0, 200, 200).data.every(value => value === 0));
 assert.equal(await loadThemedForkliftAtlas(async () => { throw Error('decode failed'); }), false);
 assert.equal(drawThemedForkliftBody(ctx as unknown as CanvasRenderingContext2D, 'steam'), false);
});

test('current native forklift dispatch with atlas loaded retains complete shared forward forks and original envelope at 32 headings and five sizes', async () => {
 const { loadThemedForkliftAtlas, THEMED_FORKLIFT_ATLAS } = await art();
 function vehicle(paint: ForkliftId, size = 110, angle = 0) {
  const ctx = createCanvas(200, 200).getContext('2d');
  forklift(ctx as unknown as CanvasRenderingContext2D, 100, 100, size, angle, paint);
  return ctx.getImageData(0, 0, 200, 200).data;
 }
 function bounds(data: Uint8ClampedArray) {
  const result = { left: 200, top: 200, right: -1, bottom: -1 };
  for (let y = 0; y < 200; y++) for (let x = 0; x < 200; x++) if (data[(y * 200 + x) * 4 + 3]) {
   result.left = Math.min(result.left, x); result.top = Math.min(result.top, y); result.right = Math.max(result.right, x); result.bottom = Math.max(result.bottom, y);
  }
  return result;
 }
 const legacy = ['yellow', 'blue', 'red', 'white'] as const;
 const before = legacy.map(paint => vehicle(paint));
 assert.equal(await loadThemedForkliftAtlas(async path => await loadImage(new URL(`../${path}`, import.meta.url).pathname) as unknown as CanvasImageSource), true, 'decode the shipped PNG through the production loader');
 for (const [index, paint] of legacy.entries()) assert.deepEqual(vehicle(paint), before[index], `${paint}: installing new artwork cannot alter an existing model`);
 for (const size of [29, 37, 44, 80, 110]) for (let step = 0; step < 32; step++) {
  const angle = step * Math.PI / 16, original = vehicle('yellow', size, angle), limit = bounds(original);
  for (const paint of THEMED_FORKLIFT_ATLAS.paints) {
   const next = vehicle(paint, size, angle), extent = bounds(next);
   assert.ok(extent.left >= limit.left && extent.right <= limit.right && extent.top >= limit.top && extent.bottom <= limit.bottom, `${paint}/${size}/${step}: active body must stay inside the original footprint`);
   let forkPixels = 0, changed = 0;
   for (let y = 0; y < 200; y++) for (let x = 0; x < 200; x++) {
    const pixel = (y * 200 + x) * 4;
    if (next[pixel] !== original[pixel] || next[pixel + 1] !== original[pixel + 1] || next[pixel + 2] !== original[pixel + 2]) changed++;
    const localX = ((x + .5 - 100) * Math.cos(angle) + (y + .5 - 100) * Math.sin(angle)) * 110 / size;
    if (localX < 39) continue;
    for (let channel = 0; channel < 4; channel++) assert.equal(next[pixel + channel], original[pixel + channel], `${paint}/${size}/${step}: exact fork/load-space pixel ${x},${y}/${channel}`);
    if (original[pixel + 3] >= 64) forkPixels++;
   }
   assert.ok(forkPixels > 2, 'comparison includes visible front-fork pixels');
   assert.ok(changed > size * size / 12, `${paint}/${size}/${step}: style body is visibly distinct`);
  }
 }
});

const protectedHashes = {
 yellow: '1d03099b9b1f2520d49f83083c272630e8b3b87e00071aefe3c2cd62d54a08f9',
 blue: '9714724682937d794f2096836bfcb5965beea96583e6e2dd320f1064d75fc09a',
 red: 'a16cd30992db4fff25138774167493d1773aabda3f3519bd0819ca8005cb7caf',
 white: '8d57103db1bf9a10424a87f3c6f8c71d02a389fd1eaef68127d3c3aec454c4c0',
};
for (const [paint, expected] of Object.entries(protectedHashes)) test(`${paint}: exact v0.19 protected pixels at four board sizes and four directions`, async () => {
 const { loadThemedForkliftAtlas } = await art();
 assert.equal(await loadThemedForkliftAtlas(async path => await loadImage(new URL(`../${path}`, import.meta.url).pathname) as unknown as CanvasImageSource), true);
 const canvas = createCanvas(384, 384), ctx = canvas.getContext('2d');
 for (let i = 0; i < 16; i++) forklift(ctx as unknown as CanvasRenderingContext2D, 48 + i % 4 * 96, 48 + Math.floor(i / 4) * 96, [29, 37, 44, 80][i % 4], Math.floor(i / 4) * Math.PI / 2, paint as ForkliftId);
 assert.equal(createHash('sha256').update(ctx.getImageData(0, 0, 384, 384).data).digest('hex'), expected);
});

test('shipped fifteen-body atlas has real alpha, coherent occupied widths, reproducible manifest and a 100KiB budget', async () => {
 const { THEMED_FORKLIFT_ATLAS } = await art();
 const bytes = readFileSync(new URL('../assets/themed-forklifts.png', import.meta.url));
 const manifest = JSON.parse(readFileSync(new URL('../assets/themed-forklifts.manifest.json', import.meta.url), 'utf8'));
 assert.equal(manifest.width, 2048); assert.equal(manifest.height, 128);
 assert.deepEqual(manifest.paints, THEMED_FORKLIFT_ATLAS.paints);
 assert.deepEqual(manifest.tileColumns, THEMED_FORKLIFT_ATLAS.tileColumns);
 assert.equal(manifest.cropRects.length, 15);
 assert.equal(manifest.sha256, createHash('sha256').update(bytes).digest('hex'));
 assert.equal(manifest.bytes, bytes.length); assert.ok(bytes.length <= 100 * 1024);
 const image = await loadImage(bytes), canvas = createCanvas(image.width, image.height), ctx = canvas.getContext('2d');
 ctx.drawImage(image, 0, 0);
 assert.ok(ctx.getImageData(1536,0,128,128).data.every(value=>value===0), 'separator must contain no neighboring sprite pixels');
 for (let index = 0; index < 15; index++) {
  const data = ctx.getImageData(THEMED_FORKLIFT_ATLAS.tileColumns[index] * 128, 0, 128, 128).data;
  let opaque = 0, translucent = 0, left = 128, right = -1, top = 128, bottom = -1;
  for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) {
   const alpha = data[(y * 128 + x) * 4 + 3];
   if (alpha >= 128) { opaque++; left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y); }
   if (alpha > 0 && alpha < 255) translucent++;
   if (x === 0 || x === 127 || y < 20 || y >= 108) assert.equal(alpha, 0, 'transparent gutters cannot contain a background or detached mark');
  }
  assert.ok(opaque > 6800 && opaque < 10000); assert.ok(translucent > 40, 'preserve generated anti-aliasing');
  assert.ok(right - left >= 116 && right - left <= 123, 'same maximum body width, no stretched per-theme geometry');
  assert.ok(bottom - top >= 68 && bottom - top <= 81, 'coherent broad body ratio');
 }
});
