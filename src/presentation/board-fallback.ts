// v112 (dd847c3) native frame and tile details, only for unavailable PNGs.
import type {ThemeId} from '../application/profile.ts';
import {panel,hazard,gradient,artRect,artLine,artPolygon,artDot} from './assets.ts';
type Context=CanvasRenderingContext2D;
type Material = 'concrete' | 'steel' | 'frost' | 'planks' | 'belt' | 'plastic' | 'paper' | 'alloy' | 'brass' | 'circuit' | 'basalt' | 'ocean' | 'marble' | 'tread';
export interface BoardTheme {
 material: Material;
 top: string; bottom: string; seam: string;
 frame: string; rim: string; trim: string; edge: string;
}

export function drawBoardFrameFallback(ctx: Context, x: number, y: number, size: number, theme: ThemeId, skin: BoardTheme): void {
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
export function drawBoardMaterialFallback(ctx: Context, material: Material, tone: number): void {
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
