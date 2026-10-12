// Historical authoring contract: hashes and assertions remain unchanged; runtime textures are covered separately.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createCanvas } from '@napi-rs/canvas';
import type { ThemeId } from '../scripts/static-art-authoring/src/application/profile.ts';
import { COSMETIC_CATALOG } from '../scripts/static-art-authoring/src/application/cosmetics.ts';
import { boardGeometry } from '../scripts/static-art-authoring/src/presentation/board-geometry.ts';
import { createRunV18 } from '../scripts/static-art-authoring/src/domain/v18/engine.ts';
import { createProfile } from '../scripts/static-art-authoring/src/application/profile.ts';
import { playableChecksum, reservedEntryCells } from '../scripts/static-art-authoring/src/domain/playable.ts';
import { render } from '../scripts/static-art-authoring/src/presentation/renderer.ts';
import type { ViewState } from '../scripts/static-art-authoring/src/presentation/view-types.ts';

const digest = (data: Uint8ClampedArray) => createHash('sha256').update(data).digest('hex');
async function art() {
 try { return await import('../scripts/static-art-authoring/src/presentation/board-theme.ts'); }
 catch { assert.fail('A shared, cosmetic-only board-theme renderer must exist'); }
}

test('each owned theme supplies a distinct muted board floor and frame at every board size', async () => {
 const { drawThemedBoard } = await art();
 const themes = COSMETIC_CATALOG.filter(item => item.kind === 'theme').map(item => item.id as ThemeId);
 for (const dimension of [7, 8, 9] as const) {
  const floors: string[] = [], frames: string[] = [];
  for (const theme of themes) {
   const context = createCanvas(1080, 1920).getContext('2d'), ctx = context as unknown as CanvasRenderingContext2D;
   const geometry = boardGeometry({ boardSize: dimension }), snapshot = JSON.stringify(geometry);
   ctx.globalAlpha = .8; ctx.lineWidth = 7; ctx.fillStyle = '#ffffff';
   drawThemedBoard(ctx, geometry, theme);
   assert.equal(ctx.globalAlpha, .8); assert.equal(ctx.lineWidth, 7); assert.equal(JSON.stringify(geometry), snapshot);
   floors.push(digest(context.getImageData(126, 566, 828, 828).data));
   frames.push(digest(context.getImageData(94, 536, 892, 20).data));
   const pixels = context.getImageData(0, 0, 1080, 1920).data;
   for (const [x, y] of [[20, 20], [90, 536], [988, 536], [1000, 1450]]) assert.equal(pixels[(y * 1080 + x) * 4 + 3], 0, `${theme}: bounded floor`);
   ctx.fillRect(0, 0, 1, 1); assert.deepEqual([...context.getImageData(0, 0, 1, 1).data], [255, 255, 255, 204]);
  }
  assert.equal(new Set(floors).size, themes.length, `${dimension}: unique floor materials`);
  assert.equal(new Set(frames).size, themes.length, `${dimension}: unique outer frames`);
 }
});

test('tile microtexture stays low-contrast and never resembles an occupied cargo square', async () => {
 const { drawThemedBoard } = await art();
 for (const item of COSMETIC_CATALOG.filter(item => item.kind === 'theme')) {
  const ctx = createCanvas(1080, 1920).getContext('2d');
  drawThemedBoard(ctx as unknown as CanvasRenderingContext2D, boardGeometry(), item.id as ThemeId);
  const pixels = ctx.getImageData(132, 572, 96, 96).data, luminance: number[] = [];
  for (let i = 0; i < pixels.length; i += 4) luminance.push(.2126 * pixels[i] + .7152 * pixels[i + 1] + .0722 * pixels[i + 2]);
  assert.ok(Math.max(...luminance) - Math.min(...luminance) < 58, `${item.id}: keep tile relief quiet`);
  assert.ok(Math.max(...luminance) < 180, `${item.id}: reserve highlights for cargo and feedback`);
 }
});

test('real board rendering uses every themed floor without repainting reservations or changing rules', async () => {
 const { drawThemedBoard } = await art(), run = createRunV18({ seed: 7, mode: 'standard', inboundDifficulty: 'hard' });
 const geometry = boardGeometry(run), before = playableChecksum(run), reservationHashes = new Map<number, string>();
 assert.ok(reservedEntryCells(run).length > 0);
 for (const item of COSMETIC_CATALOG.filter(item => item.kind === 'theme')) {
  const profile = createProfile(); profile.cosmetics.theme = item.id as ThemeId;
  const view: ViewState = { screen: 'game', selectedPieceId: null, hoverOrigin: null, preview: null, dragPoint: null, paused: false, message: '', saveStatus: '', elapsed: 0, animation: null, debug: false, needsResume: false, profile };
  const actual = createCanvas(1080, 1920).getContext('2d'), reference = createCanvas(1080, 1920).getContext('2d');
  render(actual as unknown as CanvasRenderingContext2D, run, view);
  drawThemedBoard(reference as unknown as CanvasRenderingContext2D, geometry, item.id as ThemeId);
  assert.deepEqual(actual.getImageData(138, 578, 30, 30).data, reference.getImageData(138, 578, 30, 30).data, `${item.id}: actual game board uses shared material`);
  for (const index of reservedEntryCells(run)) {
   const x = geometry.x + index % geometry.dimension * geometry.cell, y = geometry.y + Math.floor(index / geometry.dimension) * geometry.cell;
   const hash = digest(actual.getImageData(x + 8, y + 8, geometry.cell - 16, geometry.cell - 16).data);
   if (item.id === 'day') reservationHashes.set(index, hash);
   else assert.equal(hash, reservationHashes.get(index), `${item.id}: reserved cell remains clearly marked and visually identical`);
  }
  assert.equal(playableChecksum(run), before);
 }
});
