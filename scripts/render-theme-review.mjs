// Historical v112 renderer evidence. Frozen painters preserve original pixel contracts; this is not v113 runtime validation.
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { COSMETIC_CATALOG } from '../src/application/cosmetics.ts';
import { createProfile } from '../src/application/profile.ts';
import { createRunV18 } from '../src/domain/v18/engine.ts';
import { reservedEntryCells } from '../src/domain/playable.ts';
import { render } from './static-art-authoring/src/presentation/renderer.ts';
import { drawCosmeticPreview } from './static-art-authoring/src/presentation/cosmetic-art.ts';
import { loadCargoAtlas } from './static-art-authoring/src/presentation/cargo-atlas.ts';
import { loadBoardMaterialAtlas } from './static-art-authoring/src/presentation/board-material-atlas.ts';

const out = process.argv[2] ?? 'artifacts/v0190-themes';
await mkdir(out, { recursive: true });
await loadCargoAtlas(loadImage);
const rasterBoardLoaded = await loadBoardMaterialAtlas(loadImage);
const themes = COSMETIC_CATALOG.filter(item => item.kind === 'theme');
const styles = { day: 'wood', night: 'wood', harbor: 'reinforced', cold_chain: 'ice_crystal', rail_freight: 'reinforced', express_sorting: 'taped', toy_workshop: 'toy_brick', paper_warehouse: 'paper_fold', space_cargo: 'space_case', steam_foundry: 'steam_brass', neon_depot: 'neon_circuit', lava_forge: 'lava_core', ocean_vault: 'ocean_relic', royal_store: 'royal_gold', field_station: 'field_supply' };
const full = createCanvas(1800, 2100), sheet = full.getContext('2d');
const previews = createCanvas(1440, 1500), previewSheet = previews.getContext('2d');
const state = createRunV18({ seed: 7, mode: 'standard', inboundDifficulty: 'hard' });
const cargos = ['cargo.machine', 'cargo.food', 'cargo.cold', 'cargo.chem', 'cargo.electronic'];
const reserved = reservedEntryCells(state);
for (const [offset, index] of [8, 9, 10, 12, 16, 17, 19, 22, 24, 25, 30, 32, 37, 39, 40].entries()) {
 if (!reserved.includes(index)) { state.board[index] = cargos[offset % cargos.length]; state.cellTraits[index] = offset === 1 ? { kind: 'rush', remaining: 3 } : null; }
}
sheet.fillStyle = '#0d1923'; sheet.fillRect(0, 0, full.width, full.height);
previewSheet.fillStyle = '#0d1923'; previewSheet.fillRect(0, 0, previews.width, previews.height);
for (const [index, theme] of themes.entries()) {
 const canvas = createCanvas(360, 640), context = canvas.getContext('2d'); context.scale(1 / 3, 1 / 3);
 const profile = createProfile(); profile.cosmetics.theme = theme.id; profile.cosmetics.cargo = styles[theme.id];
 const view = { screen: 'game', selectedPieceId: null, hoverOrigin: null, preview: null, dragPoint: null, paused: false, message: '', saveStatus: '', elapsed: 0, animation: null, debug: false, needsResume: false, profile };
 render(context, state, view);
 await writeFile(join(out, `${theme.id}-360-board.png`), canvas.toBuffer('image/png'));
 const x = index % 5 * 360, y = Math.floor(index / 5) * 700;
 sheet.fillStyle = '#dce4df'; sheet.font = '18px "Noto Sans CJK SC", sans-serif'; sheet.fillText(theme.name, x + 14, y + 27); sheet.drawImage(canvas, x, y + 43);
 const preview = createCanvas(720, 250), previewContext = preview.getContext('2d');
 drawCosmeticPreview(previewContext, { x: 0, y: 0, w: 720, h: 250 }, { category: 'theme', theme: theme.id, cargoStyle: styles[theme.id] });
 const px = index % 3 * 480, py = Math.floor(index / 3) * 300;
 previewSheet.fillStyle = '#dce4df'; previewSheet.font = '20px "Noto Sans CJK SC", sans-serif'; previewSheet.fillText(theme.name, px + 16, py + 33);
 previewSheet.drawImage(preview, px, py + 56, 480, 167);
}
await writeFile(join(out, 'all-15-theme-board-contact.png'), full.toBuffer('image/png'));
await writeFile(join(out, 'all-15-theme-preview-contact.png'), previews.toBuffer('image/png'));
await writeFile(join(out, 'review.json'), JSON.stringify({ purpose: 'Actual renderer and shop preview material QA', syntheticBoard: true, rasterBoardLoaded, themeCount: themes.length, boardViewport: [360, 640], boardRuleset: 18, reservedCells: reserved, assets: themes.map(item => `${item.id}-360-board.png`), note: 'Illustrative fixture contains deliberate mixed cargo. It is not a recorded player game or new balancing evidence.' }, null, 2) + '\n');
process.stdout.write(`Rendered ${themes.length} themed boards and previews to ${out}\n`);
