// Historical authoring contract: hashes and assertions remain unchanged; runtime textures are covered separately.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createCanvas } from '@napi-rs/canvas';
import { drawThemedBoard } from '../scripts/static-art-authoring/src/presentation/board-theme.ts';
import { boardGeometry } from '../scripts/static-art-authoring/src/presentation/board-geometry.ts';
import { HISTORICAL_COSMETIC_CATALOG } from '../scripts/static-art-authoring/src/application/cosmetics.ts';

async function art() {
 try { return await import('../scripts/static-art-authoring/src/presentation/board-material-atlas.ts'); }
 catch { assert.fail('Generated tile artwork must use a bounded, optional packaged atlas'); }
}

test('board material atlas keeps all fifteen theme slots and rejects missing or mismatched images', async () => {
 const { BOARD_MATERIAL_ATLAS, loadBoardMaterialAtlas, drawBoardMaterialTile } = await art();
 assert.equal(BOARD_MATERIAL_ATLAS.src, 'assets/board-materials.png');
 assert.deepEqual([BOARD_MATERIAL_ATLAS.width, BOARD_MATERIAL_ATLAS.height, BOARD_MATERIAL_ATLAS.tileSize], [512, 512, 128]);
 assert.deepEqual(BOARD_MATERIAL_ATLAS.themes, HISTORICAL_COSMETIC_CATALOG.slice(0, 47).filter(item => item.kind === 'theme').map(item => item.id));
 assert.deepEqual(HISTORICAL_COSMETIC_CATALOG.slice(47).filter(item => item.kind === 'theme').map(item => item.id), ['forest_depot', 'ice_vault']);
 const ctx = createCanvas(160, 160).getContext('2d') as unknown as CanvasRenderingContext2D;
 assert.equal(await loadBoardMaterialAtlas(async () => { throw Error('unavailable'); }), false);
 assert.equal(drawBoardMaterialTile(ctx, 'day', 10, 10, 120), false);
 assert.equal(await loadBoardMaterialAtlas(async () => createCanvas(256, 512) as unknown as CanvasImageSource), false);
 assert.equal(drawBoardMaterialTile(ctx, 'day', 10, 10, 120), false);
 assert.ok(ctx.getImageData(0, 0, 160, 160).data.every(value => value === 0));
});

test('all fifteen row-major tile samples keep exact source pixels while board compositing stays in its own layer', async () => {
 const { BOARD_MATERIAL_ATLAS, loadBoardMaterialAtlas, drawBoardMaterialTile } = await art();
 const atlas = createCanvas(512, 512), source = atlas.getContext('2d');
 const colors = BOARD_MATERIAL_ATLAS.themes.map((_, index) => [48 + index * 6, 68 + index * 4, 78 + index * 3]);
 colors.forEach(([r, g, b], index) => { source.fillStyle = `rgb(${r},${g},${b})`; source.fillRect(index % 4 * 128, Math.floor(index / 4) * 128, 128, 128); });
 assert.equal(await loadBoardMaterialAtlas(async () => atlas as unknown as CanvasImageSource), true);
 try {
  for (const [index, theme] of BOARD_MATERIAL_ATLAS.themes.entries()) {
   const ctx = createCanvas(160, 160).getContext('2d'); ctx.lineWidth = 9; ctx.fillStyle = '#ffffff';
   assert.equal(drawBoardMaterialTile(ctx as unknown as CanvasRenderingContext2D, theme, 12, 17, 56), true);
   assert.deepEqual([...ctx.getImageData(32, 37, 1, 1).data], [...colors[index], 255]);
   assert.equal(ctx.lineWidth, 9); ctx.fillRect(0, 0, 1, 1); assert.deepEqual([...ctx.getImageData(0, 0, 1, 1).data], [255, 255, 255, 255]);
   const pixels = ctx.getImageData(0, 0, 160, 160).data;
   for (let y = 1; y < 160; y++) for (let x = 1; x < 160; x++) if (x < 12 || x >= 68 || y < 17 || y >= 73) assert.equal(pixels[(y * 160 + x) * 4 + 3], 0);
   const board = createCanvas(1080, 1920).getContext('2d');
   drawThemedBoard(board as unknown as CanvasRenderingContext2D, boardGeometry(), theme);
   assert.notDeepEqual([...board.getImageData(180, 620, 1, 1).data], [...colors[index], 255], `${theme}: display-layer compositing must calm the floor while the source sampling API remains unmodified`);
   assert.notDeepEqual([...board.getImageData(120, 620, 1, 1).data], [...colors[index], 255], `${theme}: cell seams remain independently visible`);
  }
  const ctx = createCanvas(160, 160).getContext('2d') as unknown as CanvasRenderingContext2D;
  for (const [x, y, size] of [[0, 0, 0], [0, 0, -1], [NaN, 0, 10], [0, Infinity, 10]]) assert.equal(drawBoardMaterialTile(ctx, 'day', x, y, size), false);
 } finally { await loadBoardMaterialAtlas(async () => { throw Error('clear fixture'); }); }
});
