import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { drawLogisticsBackground } from '../src/presentation/cosmetic-art.ts';
import { loadSceneMaterialAtlas } from '../src/presentation/scene-frame-atlas.ts';

const digest = (data: Uint8ClampedArray) => createHash('sha256').update(data).digest('hex');
test('forest and ice provide their own bounded, quiet distant backdrops with optional art', async () => {
 const themeHashes = new Set<string>();
 for (const loaded of [true, false]) {
  await loadSceneMaterialAtlas(loaded ? async path => await loadImage(path) as unknown as CanvasImageSource : async () => { throw Error('missing'); });
  for (const theme of ['forest_depot', 'ice_vault']) {
   const ctx = createCanvas(320, 220).getContext('2d'); ctx.globalAlpha = .8; ctx.lineWidth = 7; const alpha = ctx.globalAlpha;
   assert.equal(drawLogisticsBackground(ctx as unknown as CanvasRenderingContext2D, { x: 30, y: 25, w: 250, h: 150 }, theme), true);
   const pixels = ctx.getImageData(0, 0, 320, 220).data;
   for (let y = 0; y < 220; y++) for (let x = 0; x < 320; x++) {
    const a = pixels[(y * 320 + x) * 4 + 3];
    if (x < 30 || x >= 280 || y < 25 || y >= 175) assert.equal(a, 0, `${theme}: bounded paint`);
    else assert.ok(a > 0, `${theme}: opaque base before caller alpha`);
   }
   const center = ctx.getImageData(70, 60, 170, 80).data;
   for (let i = 0; i < center.length; i += 4) assert.ok(.2126 * center[i] + .7152 * center[i + 1] + .0722 * center[i + 2] < 85, `${theme}: quiet HUD center`);
   themeHashes.add(digest(pixels)); assert.equal(ctx.globalAlpha, alpha); assert.equal(ctx.lineWidth, 7);
   for (const rect of [{ x: 0, y: 0, w: 0, h: 5 }, { x: 0, y: 0, w: 20, h: -5 }, { x: NaN, y: 0, w: 10, h: 10 }]) assert.equal(drawLogisticsBackground(ctx as unknown as CanvasRenderingContext2D, rect, theme), false);
  }
 }
 assert.equal(themeHashes.size, 4, 'both worlds and missing-art fallbacks remain distinct');
});

test('new distant scene branches keep all fifteen previous background results and pixels exact', async () => {
 await loadSceneMaterialAtlas(async path => await loadImage(path) as unknown as CanvasImageSource);
 const baseline = JSON.parse(await readFile('tests/fixtures/v021-background-preservation-baseline.json', 'utf8')) as { entries: { theme: string; result: boolean; pixelSha256: string }[] };
 for (const entry of baseline.entries) {
  const ctx = createCanvas(320, 220).getContext('2d'); ctx.globalAlpha = .8; ctx.lineWidth = 7;
  assert.equal(drawLogisticsBackground(ctx as unknown as CanvasRenderingContext2D, { x: 30, y: 25, w: 250, h: 150 }, entry.theme), entry.result);
  assert.equal(digest(ctx.getImageData(0, 0, 320, 220).data), entry.pixelSha256, entry.theme);
 }
});
