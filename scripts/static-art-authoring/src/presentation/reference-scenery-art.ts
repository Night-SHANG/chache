import type { Rect } from './layout.ts';
import { artDot, artLine, artPolygon, artRect, gradient } from './assets.ts';

type Context = CanvasRenderingContext2D;
const THEMES = ['steam_foundry', 'neon_depot', 'lava_forge', 'ocean_vault', 'royal_store', 'field_station'] as const;
type ReferenceTheme = typeof THEMES[number];
const TONES: Record<ReferenceTheme, readonly [string, string, string, string]> = {
 steam_foundry: ['#393b3b', '#212a31', '#807155', '#ae9470'],
 neon_depot: ['#283c4b', '#162633', '#375c6c', '#729b9e'],
 lava_forge: ['#393337', '#251f28', '#635151', '#986d55'],
 ocean_vault: ['#29484c', '#163038', '#3f6667', '#8b9680'],
 royal_store: ['#414047', '#252936', '#786b57', '#a79970'],
 field_station: ['#3c4541', '#222e30', '#64715a', '#999b7a'],
};

/** A bounded static illustration. All prominent architecture stays in the outer margins. */
export function drawReferenceBackground(ctx: Context, rect: Rect, theme: string): boolean {
 if (!(THEMES as readonly string[]).includes(theme) || ![rect.x, rect.y, rect.w, rect.h].every(Number.isFinite) || rect.w <= 0 || rect.h <= 0) return false;
 const key = theme as ReferenceTheme, tones = TONES[key];
 ctx.save(); ctx.beginPath(); ctx.rect(rect.x, rect.y, rect.w, rect.h); ctx.clip();
 ctx.translate(rect.x, rect.y); ctx.scale(rect.w / 1080, rect.w / 1080); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
 const h = rect.h * 1080 / rect.w;
 artRect(ctx, 0, 0, 1080, h, gradient(ctx, 0, 0, h, tones[0], tones[1]));
 if (key === 'steam_foundry') steam(ctx, h, tones);
 else if (key === 'neon_depot') neon(ctx, h, tones);
 else if (key === 'lava_forge') lava(ctx, h, tones);
 else if (key === 'ocean_vault') ocean(ctx, h, tones);
 else if (key === 'royal_store') royal(ctx, h, tones);
 else field(ctx, h, tones);
 ctx.restore(); return true;
}

type Tones = readonly [string, string, string, string];
function steam(ctx: Context, h: number, tones: Tones): void {
 const top = Math.min(45, h * .1);
 for (const x of [42, 1004]) {
  artRect(ctx, x + 5, top + 10, 36, h - top - 20, '#283033', 16, '#16242b', 5);
  artRect(ctx, x + 10, top + 10, 22, h - top - 20, gradient(ctx, 0, 0, h, tones[3], tones[2]), 10);
  artRect(ctx, x + 11, top + 12, 4, h - top - 24, '#a08b68', 2);
  for (let n = 0; n < 7; n++) {
   const y = top + 38 + n * Math.max(1, h - top - 80) / 7;
   artRect(ctx, x + 2, y, 43, 15, '#4d493d', 3, '#263033', 2); artRect(ctx, x + 4, y + 2, 39, 3, '#9d8964', 1);
  }
 }
 artRect(ctx, 38, top, 1008, 24, '#625640', 10, '#242b2b', 4); artRect(ctx, 48, top + 4, 988, 5, '#aa9270', 2);
 for (const x of [102, 978]) {
  const y = Math.min(h * .22, 170), radius = Math.min(28, h * .05);
  artDot(ctx, x, y, radius + 6, '#766446', '#273032', 4); artDot(ctx, x, y, radius, '#b2ac8c', '#4d4d41', 2);
  for (let n = 0; n < 5; n++) { const a = -.85 * Math.PI + n * .43 * Math.PI; artLine(ctx, [[x + Math.cos(a) * radius * .7, y + Math.sin(a) * radius * .7], [x + Math.cos(a) * radius * .84, y + Math.sin(a) * radius * .84]], '#646653', 2); }
  artLine(ctx, [[x - radius * .4, y + radius * .45], [x + radius * .35, y - radius * .4]], '#5a5142', 3); artDot(ctx, x, y, 3, '#6a5742');
 }
 artRect(ctx, 0, h - 26, 1080, 26, '#3c4240'); artLine(ctx, [[0, h - 23], [1080, h - 23]], '#82785c', 4);
}

function neon(ctx: Context, h: number, tones: Tones): void {
 const top = Math.min(40, h * .08);
 for (const x of [14, 966]) {
  artPolygon(ctx, [[x, top + 24], [x + 23, top], [x + 95, top], [x + 100, h - 42], [x + 74, h - 18], [x + 2, h - 18]], '#253c4b', '#142a38', 4);
  artLine(ctx, [[x + 14, h - 42], [x + 14, top + 38], [x + 34, top + 19], [x + 76, top + 19]], tones[2], 7);
  artLine(ctx, [[x + 15, h - 45], [x + 15, top + 39], [x + 35, top + 21]], tones[3], 2);
  for (let n = 0; n < 7; n++) {
   const y = top + 70 + n * Math.max(1, h - top - 140) / 7;
   artPolygon(ctx, [[x + 31, y], [x + 65, y], [x + 82, y + 17], [x + 82, y + 49], [x + 67, y + 65], [x + 31, y + 65]], '#294652', '#456776', 2);
   artLine(ctx, [[x + 41, y + 19], [x + 60, y + 19], [x + 68, y + 28]], '#669098', 3);
   artRect(ctx, x + 42, y + 45, 24, 3, '#467782', 1);
  }
 }
 artPolygon(ctx, [[22, top], [1058, top], [1035, top + 35], [731, top + 35], [708, top + 47], [371, top + 47], [348, top + 35], [46, top + 35]], '#37515f', '#1b303f', 4);
 artLine(ctx, [[46, top + 13], [345, top + 13], [369, top + 25], [710, top + 25], [734, top + 13], [1034, top + 13]], '#638995', 3);
 artRect(ctx, 0, h - 26, 1080, 26, '#253f4e'); artLine(ctx, [[18, h - 20], [1062, h - 20]], '#497989', 3);
}

function lava(ctx: Context, h: number, tones: Tones): void {
 for (const side of [0, 1]) {
  const x = side ? 969 : 0;
  for (let n = 0; n < 8; n++) {
   const y = 15 + n * (h - 30) / 8, height = (h - 30) / 8;
   artPolygon(ctx, [[x + 8, y + 12], [x + 84, y], [x + 110, y + height * .22], [x + 97, y + height * .86], [x + 29, y + height], [x + 1, y + height * .78]], n % 2 ? '#423d40' : '#4b4141', '#292930', 5);
   artLine(ctx, [[x + 20, y + height * .2], [x + 52, y + height * .3], [x + 61, y + height * .5], [x + 91, y + height * .57]], tones[2], 3);
   artLine(ctx, [[x + 52, y + height * .3], [x + 65, y + height * .12]], tones[3], 2);
  }
 }
 artPolygon(ctx, [[0, 12], [1080, 12], [1060, 57], [833, 48], [621, 63], [357, 51], [93, 57], [0, 40]], '#544443', '#302c31', 4);
 artLine(ctx, [[28, 31], [260, 29], [283, 39], [469, 30], [599, 43], [756, 29], [1050, 34]], '#91634d', 3);
 artRect(ctx, 0, h - 26, 1080, 26, '#423735'); artLine(ctx, [[0, h - 25], [1080, h - 25]], '#89604c', 3);
}

function ocean(ctx: Context, h: number, tones: Tones): void {
 const top = Math.min(32, h * .08);
 for (const x of [21, 960]) {
  artRect(ctx, x, top, 98, h - top - 15, '#254950', 25, '#477070', 5);
  for (let n = 0; n < 5; n++) {
   const y = top + 65 + n * Math.max(1, h - top - 130) / 5;
   artDot(ctx, x + 49, y, 33, '#797e64', '#1e3f47', 4); artDot(ctx, x + 49, y, 24, gradient(ctx, 0, y - 24, 48, '#4c7978', '#234c5b'), '#ab9d6b', 2);
   artLine(ctx, [[x + 35, y - 13], [x + 40, y - 18], [x + 55, y - 19]], '#72958c', 2);
   for (let bolt = 0; bolt < 4; bolt++) { const angle = bolt * Math.PI / 2; artDot(ctx, x + 49 + Math.cos(angle) * 29, y + Math.sin(angle) * 29, 2, '#b0a681'); }
  }
 }
 artRect(ctx, 30, top, 1020, 22, '#526f67', 9, '#294a4e', 3); artLine(ctx, [[49, top + 5], [1031, top + 5]], tones[3], 3);
 for (const side of [0, 1]) for (let n = 0; n < 4; n++) {
  const x = side ? 1052 - n * 16 : 25 + n * 16, y = h - 8, stem = Math.min(175, h * .32) * (.6 + n * .1);
  ctx.beginPath(); ctx.moveTo(x, y); ctx.bezierCurveTo(x - 19, y - stem * .35, x + 18, y - stem * .65, x + 4, y - stem); ctx.strokeStyle = n % 2 ? '#406655' : '#58735c'; ctx.lineWidth = 7 - n; ctx.stroke();
  artLine(ctx, [[x + 2, y - stem * .45], [x + 19, y - stem * .63]], '#688073', 3);
 }
 artRect(ctx, 0, h - 15, 1080, 15, '#365a5b'); artLine(ctx, [[0, h - 14], [1080, h - 14]], '#6c8373', 2);
}

function royal(ctx: Context, h: number, tones: Tones): void {
 const top = Math.min(44, h * .1);
 for (const x of [27, 966]) {
  artRect(ctx, x + 11, top + 17, 65, h - top - 46, gradient(ctx, 0, 0, h, '#7f7764', '#514f4a'), 7, '#343940', 4);
  for (const stripe of [22, 38, 54]) artRect(ctx, x + stripe, top + 38, 5, Math.max(1, h - top - 85), '#9b8f6f', 2);
  artRect(ctx, x, top + 5, 87, 27, '#8d7f5e', 4, '#514c44', 3); artRect(ctx, x + 2, h - 34, 83, 20, '#817354', 3);
  artPolygon(ctx, [[x + 44, top + 57], [x + 53, top + 70], [x + 44, top + 85], [x + 35, top + 70]], '#596b6c', '#b19d6b', 2);
 }
 artPolygon(ctx, [[17, top], [268, top], [298, top - 12], [782, top - 12], [812, top], [1063, top], [1050, top + 24], [30, top + 24]], tones[2], '#424344', 4);
 artLine(ctx, [[45, top + 8], [271, top + 8], [302, top - 2], [778, top - 2], [809, top + 8], [1035, top + 8]], tones[3], 3);
 artPolygon(ctx, [[508, top + 28], [521, top + 9], [540, top - 4], [560, top + 9], [573, top + 28], [540, top + 22]], '#9e8c61', '#555344', 2);
 artDot(ctx, 540, top + 9, 6, '#61767a', '#b1a172', 2);
 artRect(ctx, 0, h - 25, 1080, 25, '#56574f'); artLine(ctx, [[0, h - 22], [1080, h - 22]], '#928261', 4);
}

function field(ctx: Context, h: number, tones: Tones): void {
 const top = Math.min(35, h * .08);
 artPolygon(ctx, [[0, top], [250, top + 14], [540, top - 10], [830, top + 14], [1080, top], [1080, top + 70], [878, top + 61], [665, top + 77], [450, top + 63], [229, top + 77], [0, top + 61]], '#5a6858', '#273b37', 4);
 for (const x of [22, 1024]) {
  artRect(ctx, x, top, 34, h - top - 17, gradient(ctx, 0, 0, h, '#859078', '#495f50'), 3, '#243b36', 3);
  for (let n = 0; n < 6; n++) { const y = top + 86 + n * Math.max(1, h - top - 140) / 6; artRect(ctx, x - 6, y, 46, 19, '#424c40', 3); artRect(ctx, x - 3, y + 3, 40, 5, '#9ca082', 1); }
 }
 for (const side of [0, 1]) {
  const x = side ? 1057 : 23, direction = side ? -1 : 1;
  artLine(ctx, [[x, top + 7], [x + direction * 80, top + 105], [x + direction * 21, h - 29]], '#354b3f', 8);
  artLine(ctx, [[x, top + 7], [x + direction * 80, top + 105], [x + direction * 21, h - 29]], tones[3], 2);
  artRect(ctx, x + direction * 35 - 15, h - 89, 30, 52, '#596956', 3, '#2f453b', 2);
 }
 artLine(ctx, [[24, top + 41], [244, top + 52], [450, top + 41], [666, top + 56], [878, top + 40], [1054, top + 47]], '#79826a', 2);
 artRect(ctx, 0, h - 24, 1080, 24, '#3e5145'); artLine(ctx, [[0, h - 22], [1080, h - 22]], '#79836a', 3);
}
