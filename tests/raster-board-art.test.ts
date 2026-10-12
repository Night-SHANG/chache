// Historical authoring contract: hashes and assertions remain unchanged; runtime textures are covered separately.
import './helpers/board-material-atlas-fixture.ts';
import './helpers/scene-material-atlas-fixture.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createCanvas } from '@napi-rs/canvas';
import { BOARD_MATERIAL_ATLAS, drawBoardMaterialTile } from '../scripts/static-art-authoring/src/presentation/board-material-atlas.ts';
import { drawThemedBoard } from '../scripts/static-art-authoring/src/presentation/board-theme.ts';
import { boardGeometry } from '../scripts/static-art-authoring/src/presentation/board-geometry.ts';
import { createProfile } from '../scripts/static-art-authoring/src/application/profile.ts';
import { createRunV18 } from '../scripts/static-art-authoring/src/domain/v18/engine.ts';
import { playableChecksum, reservedEntryCells } from '../scripts/static-art-authoring/src/domain/playable.ts';
import { render } from '../scripts/static-art-authoring/src/presentation/renderer.ts';
import type { ViewState } from '../scripts/static-art-authoring/src/presentation/view-types.ts';

const digest = (data: Uint8ClampedArray) => createHash('sha256').update(data).digest('hex');
test('the shipped raster atlas renders fifteen opaque, distinct materials at 7, 8 and 9-cell densities', () => {
 for (const dimension of [7, 8, 9] as const) {
  const hashes = new Set<string>(), geometry = boardGeometry({ boardSize: dimension });
  for (const theme of BOARD_MATERIAL_ATLAS.themes) {
   const ctx = createCanvas(1080, 1920).getContext('2d');
   drawThemedBoard(ctx as unknown as CanvasRenderingContext2D, geometry, theme);
   const tile = ctx.getImageData(geometry.x + 5, geometry.y + 30, geometry.cell - 10, geometry.cell - 35).data;
   for (let i = 3; i < tile.length; i += 4) assert.equal(tile[i], 255, `${theme}: complete packaged texture`);
   hashes.add(digest(tile));
   const reference = createCanvas(1080, 1920).getContext('2d');
   assert.equal(drawBoardMaterialTile(reference as unknown as CanvasRenderingContext2D, theme, geometry.x + 2, geometry.y + 2, geometry.cell - 4), true);
   assert.notEqual(digest(ctx.getImageData(geometry.x + 16, geometry.y + 31, 22, 22).data), digest(reference.getImageData(geometry.x + 16, geometry.y + 31, 22, 22).data), `${theme}: floor presentation calms texture without rewriting the source artwork`);
  }
  assert.equal(hashes.size, 15);
 }
});

test('all final raster tile interiors meet the same strict luminance limits as the quiet procedural fallback', () => {
 for (const theme of BOARD_MATERIAL_ATLAS.themes) for (const dimension of [7, 8, 9] as const) {
  const ctx = createCanvas(1080, 1920).getContext('2d');
  const geometry = boardGeometry({ boardSize: dimension }), { x, y, cell } = geometry;
  drawThemedBoard(ctx as unknown as CanvasRenderingContext2D, geometry, theme);
  for (let row = 0; row < dimension; row++) for (let col = 0; col < dimension; col++) {
   const pixels = ctx.getImageData(x + col * cell + cell * .1, y + row * cell + cell * .1, cell * .8, cell * .8).data;
   let minimum = 255, maximum = 0;
   for (let i = 0; i < pixels.length; i += 4) { const value = .2126 * pixels[i] + .7152 * pixels[i + 1] + .0722 * pixels[i + 2]; minimum = Math.min(minimum, value); maximum = Math.max(maximum, value); }
   assert.ok(maximum - minimum < 58, `${theme}/${dimension}/${row}/${col}: keep tile relief quiet, got ${maximum - minimum}`);
   assert.ok(maximum < 180, `${theme}/${dimension}/${row}/${col}: reserve highlights for cargo and feedback`);
  }
 }
});

test('final loaded materials leave all forbidden-cell markings byte-identical and keep rule state frozen', () => {
 const run = createRunV18({ seed: 7, mode: 'standard', inboundDifficulty: 'hard' }), geometry = boardGeometry(run), before = playableChecksum(run);
 const reserved = reservedEntryCells(run); assert.equal(reserved.length, 4);
 const baseline = new Map<number, string>();
 for (const theme of BOARD_MATERIAL_ATLAS.themes) {
  const profile = createProfile(); profile.cosmetics.theme = theme;
  const view: ViewState = { screen: 'game', selectedPieceId: null, hoverOrigin: null, preview: null, dragPoint: null, paused: false, message: '', saveStatus: '', elapsed: 0, animation: null, debug: false, needsResume: false, profile };
  const ctx = createCanvas(1080, 1920).getContext('2d'); render(ctx as unknown as CanvasRenderingContext2D, run, view);
  for (const index of reserved) {
   const x = geometry.x + index % geometry.dimension * geometry.cell, y = geometry.y + Math.floor(index / geometry.dimension) * geometry.cell;
   const actual = digest(ctx.getImageData(x + 8, y + 8, geometry.cell - 16, geometry.cell - 16).data);
   if (theme === 'day') baseline.set(index, actual);
   else assert.equal(actual, baseline.get(index), `${theme}: reserved cell remains clearly marked`);
  }
  assert.equal(playableChecksum(run), before);
 }
});
