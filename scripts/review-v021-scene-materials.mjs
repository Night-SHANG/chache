// Historical v112 renderer evidence. Frozen painters preserve original pixel contracts; this is not v113 runtime validation.
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { createProfile } from '../src/application/profile.ts';
import { createRunV18 } from '../src/domain/v18/engine.ts';
import { createRun } from '../src/domain/engine.ts';
import { reservedEntryCells } from '../src/domain/playable.ts';
import { render } from './static-art-authoring/src/presentation/renderer.ts';
import { drawLogisticsBackground } from './static-art-authoring/src/presentation/cosmetic-art.ts';
import { drawThemedBoard } from './static-art-authoring/src/presentation/board-theme.ts';
import { boardGeometry } from '../src/presentation/board-geometry.ts';
import { loadCargoAtlas } from './static-art-authoring/src/presentation/cargo-atlas.ts';
import { loadBoardMaterialAtlas } from './static-art-authoring/src/presentation/board-material-atlas.ts';
import { loadSceneMaterialAtlas } from './static-art-authoring/src/presentation/scene-frame-atlas.ts';
import { loadThemedForkliftAtlas } from './static-art-authoring/src/presentation/themed-forklift-art.ts';
const out = process.argv[2] ?? 'artifacts/v0210-scene-review';
await mkdir(out, { recursive: true });
for (const load of [loadSceneMaterialAtlas, loadBoardMaterialAtlas, loadCargoAtlas, loadThemedForkliftAtlas]) if (!await load(loadImage)) throw Error('Packaged artwork failed to decode');
const cargos = ['cargo.food', 'cargo.machine', 'cargo.chem', 'cargo.electronic', 'cargo.cold'];
function game(theme, style, boardSize) {
 const state = boardSize === 7 ? createRunV18({ seed: 7, mode: 'standard', inboundDifficulty: 'hard' }) : createRun(7, 'color_exit', 8, 'expert');
 state.board.fill(null); state.cellTraits = state.board.map(() => null); const reserved = reservedEntryCells(state);
 for (let i = 0; i < state.board.length; i++) if (!reserved.includes(i) && i % 3 !== 0) { state.board[i] = cargos[(i + Math.floor(i / boardSize)) % cargos.length]; if (i % 11 === 1) state.cellTraits[i] = { kind: 'rush', remaining: i % 3 + 1 }; }
 const profile = createProfile(); profile.cosmetics.theme = theme; profile.cosmetics.cargo = style; profile.cosmetics.forklift = theme === 'forest_depot' ? 'timber' : 'ice';
 const canvas = createCanvas(1080, 1920);
 render(canvas.getContext('2d'), state, { screen: 'game', selectedPieceId: null, hoverOrigin: null, preview: null, dragPoint: null, paused: false, message: '', saveStatus: '', elapsed: 0, animation: null, debug: false, needsResume: false, profile });
 return canvas;
}
const title = (ctx, text, x, y, size = 18) => { ctx.fillStyle = '#e9ede2'; ctx.font = `${size}px "Noto Sans CJK SC", sans-serif`; ctx.fillText(text, x, y); };
const sheet = createCanvas(1240, 760), sheetCtx = sheet.getContext('2d'); sheetCtx.fillStyle = '#172935'; sheetCtx.fillRect(0, 0, sheet.width, sheet.height);
const names = { forest_depot: '林间货仓', ice_vault: '冰晶货仓' };
for (const [row, theme] of ['forest_depot', 'ice_vault'].entries()) for (const [pair, style] of ['wood', 'ice_crystal'].entries()) {
 const canvas = createCanvas(620, 380), ctx = canvas.getContext('2d'); ctx.fillStyle = '#172935'; ctx.fillRect(0, 0, 620, 380);
 title(ctx, `${names[theme]} + ${style === 'wood' ? '原木藤箱' : '冰晶箱'} · ${((row === 0) === (pair === 0)) ? '同系列' : '混搭'}`, 12, 27);
 for (const [col, boardSize] of [7, 9].entries()) {
  const source = game(theme, style, boardSize); title(ctx, `${boardSize}×${boardSize} · ${boardSize === 7 ? '37' : '29'}px 货箱`, col * 310 + 12, 56, 16);
  ctx.drawImage(source, 90, 532, 900, 930, col * 310 + 5, 68, 300, 310);
  await writeFile(join(out, `${theme}-${style}-${boardSize}-full-game.png`), source.toBuffer('image/png'));
 }
 await writeFile(join(out, `${theme}-${style}-29-37px.png`), canvas.toBuffer('image/png')); sheetCtx.drawImage(canvas, pair * 620, row * 380);
}
await writeFile(join(out, 'forest-ice-same-and-crossmix-29-37px.png'), sheet.toBuffer('image/png'));
const empty = createCanvas(1240, 380), ctx = empty.getContext('2d'); ctx.fillStyle = '#172935'; ctx.fillRect(0, 0, 1240, 380);
for (const [i, theme] of ['forest_depot', 'rail_freight', 'ice_vault', 'cold_chain'].entries()) {
 const canvas = createCanvas(1080, 1920); drawThemedBoard(canvas.getContext('2d'), boardGeometry({ boardSize: 9 }), theme);
 title(ctx, ({forest_depot: '新增 林间货仓', rail_freight: '原 铁路货场', ice_vault: '新增 冰晶货仓', cold_chain: '原 冷链仓库'})[theme], i * 310 + 12, 28);
 ctx.drawImage(canvas, 90, 532, 900, 930, i * 310 + 5, 50, 300, 310);
}
await writeFile(join(out, 'forest-ice-distinct-empty-scenes-29px.png'), empty.toBuffer('image/png'));
const metrics = [];
for (const theme of ['forest_depot', 'ice_vault']) for (const loaded of [true, false]) {
 await loadSceneMaterialAtlas(loaded ? loadImage : async () => { throw Error('fallback'); });
 for (const dimension of [7, 8, 9]) {
  const geometry = boardGeometry({ boardSize: dimension }), { x, y, cell } = geometry, ctx = createCanvas(1080, 1920).getContext('2d'); drawThemedBoard(ctx, geometry, theme);
  let worstRange = 0, peak = 0;
  for (let row = 0; row < dimension; row++) for (let col = 0; col < dimension; col++) {
   const pixels = ctx.getImageData(x + col * cell + cell * .1, y + row * cell + cell * .1, cell * .8, cell * .8).data; let lo = 255, hi = 0;
   for (let i = 0; i < pixels.length; i += 4) { const l = .2126 * pixels[i] + .7152 * pixels[i + 1] + .0722 * pixels[i + 2]; lo = Math.min(lo, l); hi = Math.max(hi, l); }
   worstRange = Math.max(worstRange, hi - lo); peak = Math.max(peak, hi);
  }
  metrics.push({ theme, loaded, dimension, worstRange: Number(worstRange.toFixed(3)), peak: Number(peak.toFixed(3)), strictLimitPass: worstRange < 58 && peak < 180 });
 }
}
await writeFile(join(out, 'strict-luminance.json'), JSON.stringify({ thresholds: { rangeLessThan: 58, peakLessThan: 180 }, metrics }, null, 2) + '\n');
console.log(JSON.stringify({ out, contactSheet: 'forest-ice-same-and-crossmix-29-37px.png', metrics }, null, 2));

// Full-height and wide previews keep the quiet HUD center review reproducible.
await loadSceneMaterialAtlas(loadImage);
const backdrops = createCanvas(1080, 780), backdropCtx = backdrops.getContext('2d'); backdropCtx.fillStyle = '#172935'; backdropCtx.fillRect(0, 0, 1080, 780);
for (const [i, theme] of ['forest_depot', 'ice_vault'].entries()) {
 title(backdropCtx, i ? '冰晶货仓 · 外围晶体舱边' : '林间货仓 · 外围木梁藤叶', i * 540 + 12, 28, 20);
 drawLogisticsBackground(backdropCtx, { x: i * 540 + 10, y: 42, w: 240, h: 426.6667 }, theme);
 backdropCtx.drawImage(game(theme, i ? 'ice_crystal' : 'wood', 9), i * 540 + 280, 42, 240, 426.6667);
 drawLogisticsBackground(backdropCtx, { x: i * 540 + 10, y: 500, w: 510, h: 250 }, theme);
}
await writeFile(join(out, 'forest-ice-distant-backdrops-and-game.png'), backdrops.toBuffer('image/png'));
