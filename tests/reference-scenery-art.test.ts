// Historical authoring contract: hashes and assertions remain unchanged; runtime textures are covered separately.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createCanvas } from '@napi-rs/canvas';
import { drawCosmeticPreview, drawLogisticsBackground } from '../scripts/static-art-authoring/src/presentation/cosmetic-art.ts';
import { drawThemedBoard } from '../scripts/static-art-authoring/src/presentation/board-theme.ts';
import { boardGeometry } from '../scripts/static-art-authoring/src/presentation/board-geometry.ts';
import { COSMETIC_CATALOG } from '../scripts/static-art-authoring/src/application/cosmetics.ts';
import type { ThemeId } from '../scripts/static-art-authoring/src/application/profile.ts';

const THEMES = ['steam_foundry', 'neon_depot', 'lava_forge', 'ocean_vault', 'royal_store', 'field_station'] as const;
const digest = (data: Uint8ClampedArray) => createHash('sha256').update(data).digest('hex');
test('six reference worlds have distinct bounded scenery with no animation or unpainted areas', () => {
 const hashes = [];
 for (const theme of THEMES) {
  const ctx = createCanvas(320, 220).getContext('2d'); ctx.globalAlpha = .8; ctx.lineWidth = 7; ctx.fillStyle = '#ffffff';
  assert.equal(drawLogisticsBackground(ctx as unknown as CanvasRenderingContext2D, { x: 30, y: 25, w: 250, h: 150 }, theme), true);
  const pixels = ctx.getImageData(0, 0, 320, 220).data;
  for (let y = 0; y < 220; y++) for (let x = 0; x < 320; x++) {
   const alpha = pixels[(y * 320 + x) * 4 + 3];
   if (x < 30 || x >= 280 || y < 25 || y >= 175) assert.equal(alpha, 0, `${theme}: scenery clips to its bounds`);
   else assert.ok(alpha > 0, `${theme}: backdrop is opaque before caller alpha`);
  }
  hashes.push(digest(pixels)); assert.equal(ctx.globalAlpha, .8); assert.equal(ctx.lineWidth, 7);
  for (const rect of [{ x: 0, y: 0, w: 0, h: 5 }, { x: 0, y: 0, w: 20, h: -5 }, { x: NaN, y: 0, w: 10, h: 10 }]) assert.equal(drawLogisticsBackground(ctx as unknown as CanvasRenderingContext2D, rect, theme), false);
  ctx.fillRect(0, 0, 1, 1); assert.deepEqual([...ctx.getImageData(0, 0, 1, 1).data], [255, 255, 255, 204]);
 }
 assert.equal(new Set(hashes).size, 6);
});

test('every theme shop preview includes its real board floor and rim while retaining the selected cargo and vehicle composition', () => {
 for (const item of COSMETIC_CATALOG.filter(item => item.kind === 'theme')) {
  const theme = item.id as ThemeId, actual = createCanvas(720, 250).getContext('2d'), expected = createCanvas(720, 250).getContext('2d');
  drawCosmeticPreview(actual as unknown as CanvasRenderingContext2D, { x: 0, y: 0, w: 720, h: 250 }, { category: 'theme', theme });
  expected.translate(252, -77); expected.scale(.2, .2); drawThemedBoard(expected as unknown as CanvasRenderingContext2D, boardGeometry(), theme);
  assert.equal(digest(actual.getImageData(288, 51, 52, 55).data), digest(expected.getImageData(288, 51, 52, 55).data), `${theme}: preview uses real floor instead of a generic warehouse platform`);
  assert.equal(digest(actual.getImageData(293, 31, 30, 3).data), digest(expected.getImageData(293, 31, 30, 3).data), `${theme}: preview shows themed rim`);
 }
});
