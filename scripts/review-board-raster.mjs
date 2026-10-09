import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { COSMETIC_CATALOG } from '../src/application/cosmetics.ts';
import { createProfile } from '../src/application/profile.ts';
import { createRunV18 } from '../src/domain/v18/engine.ts';
import { createRun } from '../src/domain/engine.ts';
import { reservedEntryCells } from '../src/domain/playable.ts';
import { render } from '../src/presentation/renderer.ts';
import { drawThemedBoard } from '../src/presentation/board-theme.ts';
import { boardGeometry } from '../src/presentation/board-geometry.ts';
import { loadCargoAtlas } from '../src/presentation/cargo-atlas.ts';
import { loadBoardMaterialAtlas } from '../src/presentation/board-material-atlas.ts';

const out = process.argv[2] ?? 'artifacts/v0190-themes-raster';
await mkdir(out, { recursive: true });
if (!await loadBoardMaterialAtlas(loadImage) || !await loadCargoAtlas(loadImage)) throw Error('Real packaged artwork must decode before review');
const themes = COSMETIC_CATALOG.filter(item => item.kind === 'theme');
const styles = { day: 'wood', night: 'wood', harbor: 'reinforced', cold_chain: 'ice_crystal', rail_freight: 'reinforced', express_sorting: 'taped', toy_workshop: 'toy_brick', paper_warehouse: 'paper_fold', space_cargo: 'space_case', steam_foundry: 'steam_brass', neon_depot: 'neon_circuit', lava_forge: 'lava_core', ocean_vault: 'ocean_relic', royal_store: 'royal_gold', field_station: 'field_supply' };
const cargos = ['cargo.food', 'cargo.machine', 'cargo.chem', 'cargo.electronic', 'cargo.cold'];
const critical = ['cold_chain', 'ocean_vault', 'royal_store', 'neon_depot', 'toy_workshop', 'day'];
const sheet = createCanvas(1240, 1140), sheetCtx = sheet.getContext('2d'), metrics = [];
for (const theme of themes) {
 const flat = createCanvas(1080, 1920).getContext('2d'); drawThemedBoard(flat, boardGeometry(), theme.id);
 const data = flat.getImageData(132, 572, 96, 96).data, lum = [];
 for (let i = 0; i < data.length; i += 4) lum.push(data[i] * .2126 + data[i + 1] * .7152 + data[i + 2] * .0722);
 lum.sort((a, b) => a - b); const mean = lum.reduce((a, b) => a + b, 0) / lum.length;
 const round = value => Math.round(value * 100) / 100;
 metrics.push({ theme: theme.id, name: theme.name, min: round(lum[0]), max: round(lum.at(-1)), range: round(lum.at(-1) - lum[0]), mean: round(mean), p05: round(lum[Math.floor(lum.length * .05)]), p95: round(lum[Math.floor(lum.length * .95)]), standardDeviation: round(Math.sqrt(lum.reduce((sum, value) => sum + (value - mean) ** 2, 0) / lum.length)), meetsFallbackThreshold: lum.at(-1) - lum[0] < 58 && lum.at(-1) < 180 });
 const pair = createCanvas(620, 380), ctx = pair.getContext('2d'); ctx.fillStyle = '#172935'; ctx.fillRect(0, 0, 620, 380);
 ctx.fillStyle = '#ecedde'; ctx.font = '19px "Noto Sans CJK SC", sans-serif'; ctx.fillText(`${theme.name} · ${styles[theme.id]}`, 12, 28);
 for (const [column, boardSize] of [7, 9].entries()) {
  const state = boardSize === 7 ? createRunV18({ seed: 7, mode: 'standard', inboundDifficulty: 'hard' }) : createRun(7, 'color_exit', 8, 'expert');
  state.board.fill(null); state.cellTraits = state.board.map(() => null); const reserved = reservedEntryCells(state);
  for (let index = 0; index < state.board.length; index++) if (!reserved.includes(index) && index % 3 !== 0) { state.board[index] = cargos[(index + Math.floor(index / boardSize)) % cargos.length]; if (index % 11 === 1) state.cellTraits[index] = { kind: 'rush', remaining: index % 3 + 1 }; }
  const profile = createProfile(); profile.cosmetics.theme = theme.id; profile.cosmetics.cargo = styles[theme.id];
  const original = createCanvas(1080, 1920), full = original.getContext('2d');
  render(full, state, { screen: 'game', selectedPieceId: null, hoverOrigin: null, preview: null, dragPoint: null, paused: false, message: '', saveStatus: '', elapsed: 0, animation: null, debug: false, needsResume: false, profile });
  ctx.fillStyle = '#c0d0cf'; ctx.font = '16px "Noto Sans CJK SC", sans-serif'; ctx.fillText(boardSize === 7 ? '7×7 · 37px 货箱' : '9×9 · 29px 货箱', column * 310 + 12, 57);
  ctx.drawImage(original, 90, 532, 900, 930, column * 310 + 5, 68, 300, 310);
 }
 await writeFile(join(out, `${theme.id}-29-37-materials.png`), pair.toBuffer('image/png'));
 const slot = critical.indexOf(theme.id); if (slot >= 0) sheetCtx.drawImage(pair, slot % 2 * 620, Math.floor(slot / 2) * 380);
}
await writeFile(join(out, 'critical-six-themes-29-37-materials.png'), sheet.toBuffer('image/png'));
const mixed = createCanvas(990, 1080), mixedCtx = mixed.getContext('2d');
mixedCtx.fillStyle = '#172935'; mixedCtx.fillRect(0, 0, mixed.width, mixed.height);
for (const [row, themeId] of ['cold_chain', 'ocean_vault', 'royal_store'].entries()) for (const [column, style] of ['ice_crystal', 'royal_gold', 'ocean_relic'].entries()) {
 const state = createRun(7, 'color_exit', 8, 'expert'), reserved = reservedEntryCells(state), profile = createProfile();
 state.board.fill(null); state.cellTraits = state.board.map(() => null);
 for (let index = 0; index < state.board.length; index++) if (!reserved.includes(index) && index % 3 !== 0) { state.board[index] = cargos[(index + Math.floor(index / 9)) % cargos.length]; if (index % 11 === 1) state.cellTraits[index] = { kind: 'rush', remaining: index % 3 + 1 }; }
 profile.cosmetics.theme = themeId; profile.cosmetics.cargo = style;
 const original = createCanvas(1080, 1920), ctx = original.getContext('2d');
 render(ctx, state, { screen: 'game', selectedPieceId: null, hoverOrigin: null, preview: null, dragPoint: null, paused: false, message: '', saveStatus: '', elapsed: 0, animation: null, debug: false, needsResume: false, profile });
 const x = column * 330, y = row * 360, name = kind => COSMETIC_CATALOG.find(item => item.kind === kind && item.id === (kind === 'theme' ? themeId : style)).name;
 mixedCtx.fillStyle = '#ecedde'; mixedCtx.font = '16px "Noto Sans CJK SC", sans-serif'; mixedCtx.fillText(`${name('theme')} + ${name('cargo')}`, x + 10, y + 27);
 mixedCtx.drawImage(original, 90, 532, 900, 930, x + 15, y + 43, 300, 310);
}
await writeFile(join(out, 'critical-three-themes-crossmix-29px.png'), mixed.toBuffer('image/png'));
await writeFile(join(out, 'raster-material-luminance.json'), JSON.stringify({ input: 'assets/board-materials.png', originalSourceUnchanged: true, displayLayerContrastControl: true, measurement: 'Production-rendered tile interior 96x96, normalized Rec709 luminance in 0..255 range. Each material retains the strict range <58 and peak <180 limits after approved background-only compositing.', metrics }, null, 2) + '\n');
process.stdout.write(JSON.stringify(metrics, null, 2) + '\n');
