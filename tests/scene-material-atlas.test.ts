import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { boardGeometry } from '../src/presentation/board-geometry.ts';
import { drawThemedBoard } from '../src/presentation/board-theme.ts';
import { loadBoardMaterialAtlas } from '../src/presentation/board-material-atlas.ts';
import type { ThemeId } from '../src/application/profile.ts';

const digest = (data: Uint8ClampedArray | Buffer) => createHash('sha256').update(data).digest('hex');
const loader = async (path: string) => await loadImage(path) as unknown as CanvasImageSource;
async function scene() {
 try { return await import('../src/presentation/scene-frame-atlas.ts'); }
 catch { assert.fail('Noninitial scenes require the optional generated material atlas'); }
}

test('v0.20 leaves original board atlas and eight initial loaded/fallback board+frame renders byte-identical', async () => {
 assert.equal(digest(await readFile('assets/board-materials.png')), '5c2bc5fc4d6fbdda2df46e09995a8b5b269cdae16aa763a50b5ed02c03ea66f5');
 const baseline = JSON.parse(await readFile('tests/fixtures/v020-board-material-baseline.json', 'utf8'));
 const { loadSceneMaterialAtlas } = await scene();
 assert.equal(await loadSceneMaterialAtlas(loader), true);
 for (const entry of baseline.entries) {
  await loadBoardMaterialAtlas(entry.loaded ? loader : async () => { throw Error('fallback fixture'); });
  const ctx = createCanvas(1080, 1920).getContext('2d');
  drawThemedBoard(ctx as unknown as CanvasRenderingContext2D, boardGeometry({ boardSize: entry.dimension }), entry.theme);
  assert.equal(digest(ctx.getImageData(0, 0, 1080, 1920).data), entry.pixelSha256, entry.name);
 }
});

test('generated scene atlas has fifteen nonbase materials, three deterministic variants, bounded frame shells and optional decoding', async () => {
 const { SCENE_MATERIAL_ATLAS, loadSceneMaterialAtlas, drawSceneMaterialTile, drawThemedGateShell, drawSceneFrame } = await scene();
 assert.equal(SCENE_MATERIAL_ATLAS.themes.length, 15);
 assert.equal(SCENE_MATERIAL_ATLAS.variants, 3);
 assert.equal(await loadSceneMaterialAtlas(loader), true);
 for (const theme of SCENE_MATERIAL_ATLAS.themes) {
  const hashes = new Set<string>();
  for (let variant = 0; variant < 3; variant++) {
   const ctx = createCanvas(96, 96).getContext('2d');
   assert.equal(drawSceneMaterialTile(ctx as unknown as CanvasRenderingContext2D, theme, 8, 8, 64, variant), true);
   hashes.add(digest(ctx.getImageData(8, 8, 64, 64).data));
   assert.ok(ctx.getImageData(0, 0, 8, 96).data.every(value => value === 0));
  }
  assert.equal(hashes.size, 3, `${theme}: actual distinct source crops`);
  const a = createCanvas(1080, 1920).getContext('2d'), b = createCanvas(1080, 1920).getContext('2d');
  drawThemedBoard(a as unknown as CanvasRenderingContext2D, boardGeometry({ boardSize: 9 }), theme);
  drawThemedBoard(b as unknown as CanvasRenderingContext2D, boardGeometry({ boardSize: 9 }), theme);
  assert.equal(digest(a.getImageData(0, 0, 1080, 1920).data), digest(b.getImageData(0, 0, 1080, 1920).data));
  const ctx = createCanvas(120, 160).getContext('2d');
  ctx.globalAlpha = .7; ctx.lineWidth = 11; ctx.translate(60, 80); const alpha = ctx.globalAlpha;
  assert.equal(drawThemedGateShell(ctx as unknown as CanvasRenderingContext2D, theme), true);
  assert.equal(ctx.globalAlpha, alpha); assert.equal(ctx.lineWidth, 11);
  assert.equal(ctx.getImageData(60, 80, 1, 1).data[3], 0, 'semantic gate center stays untouched');
  assert.equal(ctx.getImageData(10, 10, 1, 1).data[3], 0);
 }
 const ctx = createCanvas(100, 100).getContext('2d') as unknown as CanvasRenderingContext2D;
 for (const theme of ['day', 'night'] as ThemeId[]) {
  assert.equal(drawThemedGateShell(ctx, theme), false);
  assert.equal(drawSceneMaterialTile(ctx, theme, 0, 0, 10, 0), false);
  assert.equal(drawSceneFrame(ctx, theme, { x: 0, y: 0, w: 100, h: 100 }), false);
 }
 assert.equal(await loadSceneMaterialAtlas(async () => createCanvas(1, 1) as unknown as CanvasImageSource), false);
 assert.equal(drawThemedGateShell(ctx, 'harbor'), false);
 assert.equal(await loadSceneMaterialAtlas(async () => { throw Error('missing'); }), false);
});

test('new generated floor interiors retain strict quiet luminance limits at every logical cell density', async () => {
 const { SCENE_MATERIAL_ATLAS, loadSceneMaterialAtlas } = await scene();
 await loadSceneMaterialAtlas(loader);
 for (const theme of SCENE_MATERIAL_ATLAS.themes) for (const dimension of [7, 8, 9] as const) {
  const geometry = boardGeometry({ boardSize: dimension }), { x, y, cell } = geometry;
  const ctx = createCanvas(1080, 1920).getContext('2d');
  drawThemedBoard(ctx as unknown as CanvasRenderingContext2D, geometry, theme);
  for (let row = 0; row < dimension; row++) for (let col = 0; col < dimension; col++) {
   const pixels = ctx.getImageData(x + col * cell + cell * .1, y + row * cell + cell * .1, cell * .8, cell * .8).data;
   let lo = 255, hi = 0;
   for (let i = 0; i < pixels.length; i += 4) { const l = .2126 * pixels[i] + .7152 * pixels[i + 1] + .0722 * pixels[i + 2]; lo = Math.min(lo, l); hi = Math.max(hi, l); }
   assert.ok(hi - lo < 58, `${theme}/${dimension}/${row}/${col}: range ${hi - lo}`);
   assert.ok(hi < 180, `${theme}/${dimension}/${row}/${col}: peak ${hi}`);
  }
 }
});
