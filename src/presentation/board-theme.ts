import type { ThemeId } from '../application/profile.ts';
import type { BoardGeometry } from './board-geometry.ts';
import { artDot, artLine, artPolygon, artRect, gradient, hazard, panel, rivet } from './assets.ts';
import { drawBoardMaterialTile, drawBoardMaterialVariant } from './board-material-atlas.ts';
import { drawSceneFrame } from './scene-frame-atlas.ts';

type Context = CanvasRenderingContext2D;
type Material = 'concrete' | 'steel' | 'frost' | 'planks' | 'belt' | 'plastic' | 'paper' | 'alloy' | 'brass' | 'circuit' | 'basalt' | 'ocean' | 'marble' | 'tread';
interface BoardTheme {
 material: Material;
 top: string; bottom: string; seam: string;
 frame: string; rim: string; trim: string; edge: string;
}

/** Fixed quiet colors belong to scenery, never to semantic cargo, doors or warnings. */
const THEMES: Readonly<Record<ThemeId, BoardTheme>> = Object.freeze({
 day: { material: 'concrete', top: '#a19884', bottom: '#8c826f', seam: '#453e34', frame: '#56616a', rim: '#829098', trim: '#d4a03f', edge: '#26313b' },
 night: { material: 'concrete', top: '#5b6776', bottom: '#445264', seam: '#293342', frame: '#364657', rim: '#728496', trim: '#8995a0', edge: '#243343' },
 harbor: { material: 'steel', top: '#586c7d', bottom: '#455b70', seam: '#2e4154', frame: '#3b5665', rim: '#879997', trim: '#85836b', edge: '#294451' },
 cold_chain: { material: 'frost', top: '#7e989e', bottom: '#6f8890', seam: '#596f7b', frame: '#708993', rim: '#bbcbc8', trim: '#a5b9b8', edge: '#405e6a' },
 rail_freight: { material: 'planks', top: '#92826b', bottom: '#7d6f5e', seam: '#494d46', frame: '#545d57', rim: '#979986', trim: '#9b987a', edge: '#394944' },
 express_sorting: { material: 'belt', top: '#748881', bottom: '#617870', seam: '#354c4a', frame: '#455c61', rim: '#8fa599', trim: '#93a491', edge: '#33494d' },
 toy_workshop: { material: 'plastic', top: '#a6a389', bottom: '#939179', seam: '#6b6f61', frame: '#778376', rim: '#c0c0a0', trim: '#aeb196', edge: '#556b62' },
 paper_warehouse: { material: 'paper', top: '#b0a289', bottom: '#9d8f78', seam: '#726857', frame: '#8e826c', rim: '#c1b196', trim: '#b5a88c', edge: '#6d6659' },
 space_cargo: { material: 'alloy', top: '#778894', bottom: '#637683', seam: '#3a515f', frame: '#465d70', rim: '#a3b5b7', trim: '#9bafae', edge: '#2f495a' },
 steam_foundry: { material: 'brass', top: '#97866c', bottom: '#80725b', seam: '#564b3f', frame: '#715b43', rim: '#b9a078', trim: '#a38a61', edge: '#554733' },
 neon_depot: { material: 'circuit', top: '#536973', bottom: '#455b68', seam: '#263d4b', frame: '#2e4354', rim: '#698e99', trim: '#5b94a0', edge: '#223642' },
 lava_forge: { material: 'basalt', top: '#716867', bottom: '#5c5354', seam: '#3b3335', frame: '#514343', rim: '#917362', trim: '#956c54', edge: '#403539' },
 ocean_vault: { material: 'ocean', top: '#698b86', bottom: '#567572', seam: '#355452', frame: '#3b5b5f', rim: '#91aaa0', trim: '#939578', edge: '#2e4c50' },
 royal_store: { material: 'marble', top: '#a09b8e', bottom: '#8c8579', seam: '#635c53', frame: '#6a5f51', rim: '#b8a67e', trim: '#a6936c', edge: '#564c42' },
 field_station: { material: 'tread', top: '#838872', bottom: '#6d7562', seam: '#434e43', frame: '#4b584c', rim: '#a3aa8b', trim: '#94997a', edge: '#36453c' },
 forest_depot: { material: 'planks', top: '#79836b', bottom: '#636e59', seam: '#3d493a', frame: '#6c5234', rim: '#b39a68', trim: '#789255', edge: '#3a482e' },
 ice_vault: { material: 'frost', top: '#758fa5', bottom: '#617d94', seam: '#3e5b71', frame: '#31698b', rim: '#a1cbd6', trim: '#75b5cd', edge: '#284b6e' },
});

/** Presentation-only material contrast. Source sprites, cargo colors and gameplay overlays remain untouched. */
const TEXTURE_OPACITY: Readonly<Record<ThemeId, number>> = Object.freeze({
 day: .28, night: .43, harbor: .29, cold_chain: .36, rail_freight: .38,
 express_sorting: .42, toy_workshop: .30, paper_warehouse: .29, space_cargo: .24,
 steam_foundry: .29, neon_depot: .33, lava_forge: .32, ocean_vault: .29, royal_store: .36, field_station: .28,
 forest_depot: .34, ice_vault: .30,
});

/** Geometry is read-only. Entry reservations, door colors and gameplay feedback draw later. */
export function drawThemedBoard(ctx: Context, geometry: Readonly<BoardGeometry>, theme: ThemeId = 'day'): void {
 const { x, y, size, cell, dimension } = geometry, skin = THEMES[theme] ?? THEMES.day;
 ctx.save(); ctx.lineCap = 'butt'; ctx.lineJoin = 'miter'; ctx.setLineDash([]);
 drawFrame(ctx, x, y, size, theme, skin);
 ctx.fillStyle = skin.seam; ctx.fillRect(x, y, size, size);
 for (let row = 0; row < dimension; row++) for (let col = 0; col < dimension; col++) {
  const px = x + col * cell, py = y + row * cell, tone = (row * 3 + col * 5) % 6;
  const legacy = theme === 'day' || theme === 'night', night = theme === 'night';
  const top = legacy ? (night ? ['#536071', '#5b6776', '#4d5b6c', '#606c79', '#526272', '#586676'] : ['#958d7b', '#a19884', '#928976', '#a69c86', '#9b927d', '#a09680'])[tone] : skin.top;
  const bottom = legacy ? (night ? ['#3c485b', '#445264', '#39465a', '#485769', '#3e4d5e', '#425064'] : ['#817969', '#8c826f', '#807767', '#908571', '#867e6b', '#8b806c'])[tone] : skin.bottom;
  ctx.fillStyle = gradient(ctx, px, py, cell, top, bottom); ctx.fillRect(px + 2, py + 2, cell - 4, cell - 4);
  ctx.save(); ctx.globalAlpha *= TEXTURE_OPACITY[theme] ?? .28;
  const raster = legacy ? drawBoardMaterialTile(ctx, theme, px + 2, py + 2, cell - 4) : drawBoardMaterialVariant(ctx, theme, px + 2, py + 2, cell - 4, row, col); ctx.restore();
  if (!raster && !legacy) { ctx.fillStyle = `rgba(12,26,31,${tone * .009})`; ctx.fillRect(px + 2, py + 2, cell - 4, cell - 4); }
  ctx.fillStyle = 'rgba(248,232,196,.21)'; ctx.fillRect(px + 3, py + 2, cell - 6, 2);
  ctx.fillStyle = 'rgba(35,33,29,.15)'; ctx.fillRect(px + cell - 4, py + 4, 2, cell - 7); ctx.fillRect(px + 3, py + cell - 4, cell - 6, 2);
  if (raster) continue;
  if (legacy) {
   if ((row + col * 2) % 4 === 0) artLine(ctx, [[px + 17, py + 83], [px + 37, py + 72], [px + 49, py + 75]], 'rgba(49,43,36,.12)', 2);
   ctx.fillStyle = 'rgba(255,242,213,.13)'; ctx.fillRect(px + 27 + tone * 5, py + 32 + tone * 3, 2, 2);
  } else {
   ctx.save(); ctx.beginPath(); ctx.rect(px + 4, py + 4, cell - 8, cell - 8); ctx.clip();
   ctx.translate(px, py); ctx.scale(cell / 120, cell / 120); drawMaterial(ctx, skin.material, tone); ctx.restore();
  }
 }
 ctx.fillStyle = gradient(ctx, x, y, 24, 'rgba(32,30,26,.35)', 'rgba(32,30,26,0)'); ctx.fillRect(x, y, size, 24);
 ctx.fillStyle = gradient(ctx, x, y + size - 18, 18, 'rgba(32,30,26,0)', 'rgba(32,30,26,.25)'); ctx.fillRect(x, y + size - 18, size, 18);
 if (theme === 'day' || theme === 'night') for (const row of [0, 1]) for (const col of [0, 1]) rivet(ctx, x - 21 + col * (size + 42), y - 19 + row * (size + 40), 5);
 ctx.restore();
}

function drawFrame(ctx: Context, x: number, y: number, size: number, theme: ThemeId, skin: BoardTheme): void {
 if (drawSceneFrame(ctx, theme, { x: x - 26, y: y - 24, w: size + 52, h: size + 54 })) return;
 panel(ctx, { x: x - 26, y: y - 24, w: size + 52, h: size + 54 }, skin.frame, skin.rim, 12);
 if (theme === 'day') {
  hazard(ctx, { x: x - 13, y: y - 13, w: size + 26, h: 14 }); hazard(ctx, { x: x - 13, y: y + size - 1, w: size + 26, h: 14 });
  hazard(ctx, { x: x - 13, y, w: 14, h: size }, true); hazard(ctx, { x: x + size - 1, y, w: 14, h: size }, true); return;
 }
 for (const yy of [y - 13, y + size - 1]) {
  artRect(ctx, x - 13, yy, size + 26, 14, gradient(ctx, 0, yy, 14, skin.trim, skin.edge), 3);
  for (let n = 0; n < 12; n++) frameMotif(ctx, x + 22 + n * (size - 44) / 11, yy + 7, skin);
 }
 for (const xx of [x - 13, x + size - 1]) {
  artRect(ctx, xx, y, 14, size, skin.edge, 3); artRect(ctx, xx + 2, y, 3, size, skin.trim);
  for (let n = 0; n < 11; n++) { ctx.save(); ctx.translate(xx + 7, y + 35 + n * (size - 70) / 10); ctx.rotate(Math.PI / 2); frameMotif(ctx, 0, 0, skin); ctx.restore(); }
 }
}

function frameMotif(ctx: Context, x: number, y: number, skin: BoardTheme): void {
 const { material, edge, rim } = skin;
 if (material === 'paper' || material === 'planks') {
  artLine(ctx, [[x - 17, y + 3], [x + 17, y + 3]], edge, 2); artLine(ctx, [[x + 18, y - 5], [x + 18, y + 5]], edge, 2);
 } else if (material === 'circuit' || material === 'alloy') {
  artRect(ctx, x - 16, y - 2, 25, 3, rim, 1); artDot(ctx, x + 14, y, 2, rim);
 } else if (material === 'basalt') {
  artLine(ctx, [[x - 17, y - 5], [x - 5, y + 3], [x + 4, y - 1], [x + 17, y + 5]], rim, 1.8);
 } else if (material === 'marble') {
  artPolygon(ctx, [[x - 6, y], [x, y - 4], [x + 6, y], [x, y + 4]], rim); artLine(ctx, [[x - 17, y], [x - 9, y]], edge, 1.5);
 } else if (material === 'brass' || material === 'ocean') {
  artRect(ctx, x - 3, y - 6, 6, 12, edge, 1); artRect(ctx, x - 2, y - 5, 2, 10, rim, 1);
 } else if (material === 'plastic') {
  artDot(ctx, x, y, 4.5, edge); artDot(ctx, x, y - 1, 3.5, rim);
 } else {
  artLine(ctx, [[x - 12, y - 4], [x - 5, y + 4], [x + 12, y + 4]], edge, 2); artDot(ctx, x + 15, y - 2, 1.8, rim);
 }
}

/** Material strokes stay shallow and near tile edges; nothing suggests false occupancy. */
function drawMaterial(ctx: Context, material: Material, tone: number): void {
 const dark = 'rgba(24,38,42,.14)', light = 'rgba(230,238,222,.13)';
 if (material === 'steel' || material === 'brass') {
  artLine(ctx, [[9, 29], [9, 9], [35, 9]], light, 2); artLine(ctx, [[110, 89], [110, 110], [86, 110]], dark, 2);
  for (const [x, y] of [[12, 12], [108, 108], [108, 12], [12, 108]]) { artDot(ctx, x, y, material === 'brass' ? 3 : 2.5, dark); artDot(ctx, x - .5, y - 1, 1.3, light); }
  if (material === 'steel') for (const y of [40, 75]) artLine(ctx, [[13, y], [28, y - 12]], light, 2);
  else { artLine(ctx, [[18, 101], [32, 98], [43, 101]], dark, 1); artLine(ctx, [[82, 23], [95, 20]], light, 1); }
 } else if (material === 'frost') {
  artLine(ctx, [[10, 32], [10, 10], [32, 10]], light, 3); artLine(ctx, [[87, 110], [110, 110], [110, 87]], light, 3);
  artLine(ctx, [[14, 100], [27, 87], [34, 91]], 'rgba(215,239,241,.16)', 1.5);
  artLine(ctx, [[98, 15], [93, 25], [103, 32]], light, 1.5);
 } else if (material === 'planks') {
  for (const y of [15, 103]) { artLine(ctx, [[10 + tone, y], [29, y - 2], [49, y]], dark, 1); artLine(ctx, [[75, y + 3], [94, y + 1], [110, y + 2]], light, 1); }
  artDot(ctx, 12, 12, 1.5, dark); artDot(ctx, 108, 108, 1.5, dark);
 } else if (material === 'belt') {
  for (const y of [18, 45, 72, 99]) for (const x of [8, 101]) { artLine(ctx, [[x, y], [x + 10, y]], dark, 1); artLine(ctx, [[x, y + 2], [x + 10, y + 2]], light, 1); }
  for (const x of [12, 108]) artLine(ctx, [[x, 10], [x, 110]], light, 2);
 } else if (material === 'plastic') {
  for (const x of [15, 105]) for (const y of [15, 105]) { artDot(ctx, x, y, 5, dark); artDot(ctx, x, y - 1, 3.5, light); }
  artLine(ctx, [[34, 10], [86, 10]], light, 2); artLine(ctx, [[35, 109], [85, 109]], dark, 2);
 } else if (material === 'paper') {
  artPolygon(ctx, [[6, 6], [30, 6], [6, 30]], 'rgba(236,225,195,.14)');
  artLine(ctx, [[6, 31], [31, 6]], dark, 1); artLine(ctx, [[88, 114], [114, 88]], dark, 1.5);
  for (const y of [104, 108, 112]) artLine(ctx, [[13, y], [76, y]], 'rgba(61,51,34,.1)', 1);
 } else if (material === 'alloy') {
  artLine(ctx, [[9, 34], [9, 19], [19, 9], [39, 9]], light, 2);
  artLine(ctx, [[81, 111], [101, 111], [111, 101], [111, 81]], dark, 2);
  for (const x of [88, 94, 100]) artRect(ctx, x, 13, 3, 9, dark, 1);
  artLine(ctx, [[14, 90], [21, 90], [28, 98], [38, 98]], light, 1.5);
 } else if (material === 'circuit') {
  const trace = 'rgba(139,210,211,.19)';
  artLine(ctx, [[11, 47], [11, 22], [22, 11], [51, 11]], trace, 2); artDot(ctx, 51, 11, 2.5, trace);
  artLine(ctx, [[109, 72], [109, 97], [97, 109], [73, 109]], trace, 2); artDot(ctx, 73, 109, 2.5, trace);
  artLine(ctx, [[20, 84], [20, 96], [29, 103], [44, 103]], dark, 1.5);
 } else if (material === 'basalt') {
  const fissure = 'rgba(185,139,108,.22)';
  artLine(ctx, [[7, 18 + tone], [25, 22], [35, 14], [50, 20]], dark, 2.5);
  artLine(ctx, [[92, 6], [85, 23], [92, 36], [83, 47]], fissure, 1.5);
  artLine(ctx, [[6, 88], [23, 94], [32, 108], [45, 114]], fissure, 1.5); artLine(ctx, [[103, 101], [92, 97], [84, 107]], dark, 2);
 } else if (material === 'ocean') {
  for (const y of [19, 98]) { ctx.beginPath(); ctx.moveTo(9, y); ctx.bezierCurveTo(25, y - 8, 37, y + 7, 58, y); ctx.bezierCurveTo(81, y - 8, 94, y + 7, 111, y); ctx.strokeStyle = light; ctx.lineWidth = 1.5; ctx.stroke(); }
  for (const [x, y] of [[14, 13], [106, 107]]) { artDot(ctx, x, y, 4, dark); artDot(ctx, x - 1, y - 1, 2, 'rgba(205,209,159,.15)'); }
  artLine(ctx, [[13, 105], [18, 91], [14, 80]], dark, 2);
 } else if (material === 'marble') {
  ctx.strokeStyle = 'rgba(193,175,124,.23)'; ctx.lineWidth = 1.5; ctx.strokeRect(9, 9, 102, 102);
  artLine(ctx, [[13, 39], [24, 32], [31, 35], [43, 26]], 'rgba(227,220,200,.15)', 1);
  artLine(ctx, [[73, 101], [86, 93], [93, 95], [107, 85]], dark, 1);
  for (const [x, y] of [[13, 13], [107, 107]]) artPolygon(ctx, [[x - 4, y], [x, y - 4], [x + 4, y], [x, y + 4]], 'rgba(192,175,128,.21)');
 } else if (material === 'tread') {
  for (const y of [24, 58, 92]) for (const x of [20, 56, 92]) { artLine(ctx, [[x - 6, y + 4], [x + 6, y - 4]], dark, 2); artLine(ctx, [[x - 6, y + 2], [x + 6, y - 6]], light, 1.5); }
  artLine(ctx, [[9, 9], [29, 9]], light, 2); artLine(ctx, [[91, 111], [111, 111]], dark, 2);
 }
}
