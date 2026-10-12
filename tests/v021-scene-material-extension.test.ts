// Historical authoring contract: hashes and assertions remain unchanged; runtime textures are covered separately.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import type { ThemeId } from '../scripts/static-art-authoring/src/application/profile.ts';
import { boardGeometry } from '../scripts/static-art-authoring/src/presentation/board-geometry.ts';
import { drawThemedBoard } from '../scripts/static-art-authoring/src/presentation/board-theme.ts';
import { SCENE_MATERIAL_ATLAS, loadSceneMaterialAtlas, drawSceneMaterialTile, drawSceneFrame, drawThemedGateShell } from '../scripts/static-art-authoring/src/presentation/scene-frame-atlas.ts';

const digest = (data: Uint8ClampedArray | Buffer) => createHash('sha256').update(data).digest('hex');
const loader = async (path: string) => await loadImage(path) as unknown as CanvasImageSource;
const NEW_THEMES = ['forest_depot', 'ice_vault'] as const;
type Baseline = { entries: { theme: ThemeId; index: number; framePixelSha256: string; tilePixelSha256: string[]; renders: { loaded: string; fallback: string } }[] };

test('v0.21 appends forest and crystal scenes with explicit offsets and at most 50KiB growth', async () => {
 const png = await readFile(SCENE_MATERIAL_ATLAS.src), manifest = JSON.parse(await readFile('assets/scene-materials.manifest.json', 'utf8'));
 assert.deepEqual(SCENE_MATERIAL_ATLAS.themes.slice(-2), NEW_THEMES);
 assert.equal(SCENE_MATERIAL_ATLAS.themes.length, 15);
 assert.equal(SCENE_MATERIAL_ATLAS.width, 512); assert.equal(SCENE_MATERIAL_ATLAS.height, 960);
 assert.equal(SCENE_MATERIAL_ATLAS.extensionThemeStart, 13); assert.equal(SCENE_MATERIAL_ATLAS.extensionTileBaseY, 896);
 assert.equal(SCENE_MATERIAL_ATLAS.tileBaseY, 512); assert.equal(SCENE_MATERIAL_ATLAS.tileColumns, 8); assert.equal(SCENE_MATERIAL_ATLAS.frameColumns, 4);
 assert.equal(manifest.extensionThemeStart, 13); assert.equal(manifest.extensionTileBaseY, 896);
 assert.equal(manifest.tileBaseY, 512); assert.equal(manifest.height, 960); assert.equal(manifest.bytes, png.length);
 assert.equal(manifest.sha256, digest(png)); assert.ok(png.length <= 203986 + 50 * 1024);
 assert.equal(await loadSceneMaterialAtlas(loader), true);
 for (const [i, theme] of NEW_THEMES.entries()) {
  const entry = manifest.entries.find((value: { theme: string }) => value.theme === theme);
  assert.deepEqual(entry.frameAtlasOrigin, [(i + 13) % 4 * 128, 384]);
  assert.equal(entry.variants.length, 3);
  const hashes = new Set<string>();
  for (let variant = 0; variant < 3; variant++) {
   const n = i * 3 + variant;
   assert.deepEqual(entry.variants[variant].atlasOrigin, [n % 8 * 64, 896 + Math.floor(n / 8) * 64]);
   const ctx = createCanvas(64, 64).getContext('2d');
   assert.equal(drawSceneMaterialTile(ctx as unknown as CanvasRenderingContext2D, theme, 0, 0, 64, variant), true);
   hashes.add(digest(ctx.getImageData(0, 0, 64, 64).data));
  }
  assert.equal(hashes.size, 3, `${theme}: three source crops stay distinct`);
 }
});

test('v0.21 preserves all thirteen previous frames, tiles and loaded/fallback board pixels exactly', async () => {
 const baseline = JSON.parse(await readFile('tests/fixtures/v021-scene-preservation-baseline.json', 'utf8')) as Baseline;
 const atlasImage = await loadImage(SCENE_MATERIAL_ATLAS.src), atlas = createCanvas(512, 960).getContext('2d'); atlas.drawImage(atlasImage, 0, 0);
 for (const entry of baseline.entries) {
  const i = entry.index;
  assert.equal(digest(atlas.getImageData(i % 4 * 128, Math.floor(i / 4) * 128, 128, 128).data), entry.framePixelSha256, `${entry.theme}: frame`);
  for (let variant = 0; variant < 3; variant++) {
   const n = i * 3 + variant;
   assert.equal(digest(atlas.getImageData(n % 8 * 64, 512 + Math.floor(n / 8) * 64, 64, 64).data), entry.tilePixelSha256[variant], `${entry.theme}: tile ${variant}`);
  }
  for (const loaded of [true, false]) {
   await loadSceneMaterialAtlas(loaded ? loader : async () => { throw Error('fallback'); });
   const ctx = createCanvas(1080, 1920).getContext('2d');
   drawThemedBoard(ctx as unknown as CanvasRenderingContext2D, boardGeometry({ boardSize: 9 }), entry.theme);
   assert.equal(digest(ctx.getImageData(0, 0, 1080, 1920).data), entry.renders[loaded ? 'loaded' : 'fallback'], `${entry.theme}: ${loaded ? 'loaded' : 'fallback'}`);
  }
 }
});

test('new floor interiors keep original strict quiet limits for loaded and missing art in all board sizes', async () => {
 for (const loaded of [true, false]) {
  await loadSceneMaterialAtlas(loaded ? loader : async () => { throw Error('fallback'); });
  for (const theme of NEW_THEMES) for (const dimension of [7, 8, 9] as const) {
   const geometry = boardGeometry({ boardSize: dimension }), { x, y, cell } = geometry;
   const ctx = createCanvas(1080, 1920).getContext('2d');
   drawThemedBoard(ctx as unknown as CanvasRenderingContext2D, geometry, theme);
   for (let row = 0; row < dimension; row++) for (let col = 0; col < dimension; col++) {
    const pixels = ctx.getImageData(x + col * cell + cell * .1, y + row * cell + cell * .1, cell * .8, cell * .8).data;
    let lo = 255, hi = 0;
    for (let i = 0; i < pixels.length; i += 4) { const l = .2126 * pixels[i] + .7152 * pixels[i + 1] + .0722 * pixels[i + 2]; lo = Math.min(lo, l); hi = Math.max(hi, l); }
    assert.ok(hi - lo < 58, `${theme}/${dimension}/${row}/${col}/${loaded}: range ${hi - lo}`);
    assert.ok(hi < 180, `${theme}/${dimension}/${row}/${col}/${loaded}: peak ${hi}`);
   }
  }
 }
});

test('new frame and gate shells leave semantic centers and outside reserved boundaries unpainted', async () => {
 await loadSceneMaterialAtlas(loader);
 for (const theme of NEW_THEMES) {
  const ctx = createCanvas(160, 160).getContext('2d'); ctx.translate(80, 80); ctx.globalAlpha = .7; ctx.lineWidth = 11; const alpha = ctx.globalAlpha;
  assert.equal(drawThemedGateShell(ctx as unknown as CanvasRenderingContext2D, theme), true);
  assert.equal(ctx.globalAlpha, alpha); assert.equal(ctx.lineWidth, 11);
  assert.equal(ctx.getImageData(80, 80, 1, 1).data[3], 0);
  assert.ok(ctx.getImageData(99, 0, 61, 160).data.every(value => value === 0), `${theme}: no board-facing intrusion`);
  ctx.resetTransform(); ctx.clearRect(0, 0, 160, 160);
  assert.equal(drawSceneFrame(ctx as unknown as CanvasRenderingContext2D, theme, { x: 10, y: 10, w: 140, h: 140 }, 28), true);
  assert.ok(ctx.getImageData(38, 38, 84, 84).data.every(value => value === 0), `${theme}: clear inner logical cells`);
 }
 assert.equal(await loadSceneMaterialAtlas(async () => createCanvas(512, 832) as unknown as CanvasImageSource), false);
 for (const theme of NEW_THEMES) assert.equal(drawSceneFrame(createCanvas(100, 100).getContext('2d') as unknown as CanvasRenderingContext2D, theme, { x: 0, y: 0, w: 100, h: 100 }), false);
});
