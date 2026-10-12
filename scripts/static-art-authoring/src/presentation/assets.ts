import type { CargoId, CellTrait } from '../domain/types.ts';
import type { CargoStyleId, ForkliftId } from '../application/profile.ts';
import type { Rect } from './layout.ts';
import { CARGO_ATLAS, drawCargoAtlas } from './cargo-atlas.ts';
import { drawThemedForkliftBody } from './themed-forklift-art.ts';
import { drawStructuralForkliftBody } from './structural-forklift-art.ts';

type Context = CanvasRenderingContext2D;
export const INK = '#111b27';
export const CREAM = '#fff0cf';
export const MUTED = '#aab9c7';
export const PALETTE: Record<CargoId, { light: string; mid: string; dark: string; ink: string }> = {
  'cargo.food': { light: '#ff9a74', mid: '#e9584b', dark: '#8d3030', ink: '#6b2122' },
  'cargo.machine': { light: '#bed989', mid: '#76a74d', dark: '#3c622e', ink: '#284425' },
  'cargo.chem': { light: '#ffe594', mid: '#efb938', dark: '#a86a1b', ink: '#684717' },
  'cargo.electronic': { light: '#c1adf8', mid: '#8f70d1', dark: '#514283', ink: '#3a3166' },
  'cargo.cold': { light: '#b0e5ff', mid: '#59b5e7', dark: '#276a9d', ink: '#204e75' },
};

export function roundedPath(ctx: Context, x: number, y: number, w: number, h: number, r = 12): void {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r); ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h); ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r); ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
}

export function gradient(ctx: Context, x: number, y: number, h: number, top: string, bottom: string): CanvasGradient {
  const g = ctx.createLinearGradient(x, y, x, y + h); g.addColorStop(0, top); g.addColorStop(1, bottom); return g;
}

export function text(ctx: Context, value: string, x: number, y: number, size: number, color = CREAM,
  align: CanvasTextAlign = 'left', weight = 700): void {
  ctx.fillStyle = color; ctx.font = `${weight} ${size}px "Noto Sans CJK SC", "PingFang SC", "Microsoft YaHei", sans-serif`;
  ctx.textAlign = align; ctx.textBaseline = 'middle'; ctx.fillText(value, x, y);
}

export function outlinedText(ctx: Context, value: string, x: number, y: number, size: number,
  color = CREAM, align: CanvasTextAlign = 'left'): void {
  ctx.font = `900 ${size}px "Noto Sans CJK SC", "PingFang SC", "Microsoft YaHei", sans-serif`;
  ctx.textAlign = align; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
  ctx.strokeStyle = '#0c131d'; ctx.lineWidth = Math.max(8, size * .13); ctx.strokeText(value, x + 2, y + 6);
  ctx.strokeStyle = '#453026'; ctx.lineWidth = Math.max(3, size * .045); ctx.strokeText(value, x, y);
  ctx.fillStyle = color; ctx.fillText(value, x, y);
}

export function rivet(ctx: Context, x: number, y: number, r = 4): void {
  ctx.fillStyle = '#0d1620'; ctx.beginPath(); ctx.arc(x + 1, y + 2, r + 1, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#8b9da8'; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#394953'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x - r / 2, y + r / 2); ctx.lineTo(x + r / 2, y - r / 2); ctx.stroke();
}

export function panel(ctx: Context, rect: Rect, color = '#26394e', rim = '#657c90', radius = 18): void {
  const { x, y, w, h } = rect;
  roundedPath(ctx, x, y + 7, w, h, radius); ctx.fillStyle = '#090f17'; ctx.fill();
  roundedPath(ctx, x, y, w, h, radius); ctx.fillStyle = gradient(ctx, x, y, h, color, '#111d2a'); ctx.fill();
  ctx.strokeStyle = '#090f18'; ctx.lineWidth = 7; ctx.stroke();
  roundedPath(ctx, x + 2, y + 2, w - 4, h - 4, radius - 2); ctx.strokeStyle = rim; ctx.lineWidth = 2.5; ctx.stroke();
  ctx.strokeStyle = 'rgba(232,246,255,.14)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x + radius, y + 7); ctx.lineTo(x + w - radius, y + 7); ctx.stroke();
}

export function button(ctx: Context, rect: Rect, label: string, primary = true): void {
  const { x, y, w, h } = rect;
  roundedPath(ctx, x, y + 7, w, h, 20); ctx.fillStyle = '#0a111b'; ctx.fill();
  roundedPath(ctx, x, y, w, h, 20); ctx.fillStyle = gradient(ctx, x, y, h, primary ? '#ffdf65' : '#4a627c', primary ? '#eda92c' : '#263c53'); ctx.fill();
  ctx.lineWidth = 5; ctx.strokeStyle = primary ? '#925619' : '#13212f'; ctx.stroke();
  roundedPath(ctx, x + 5, y + 5, w - 10, h - 10, 16); ctx.lineWidth = 2; ctx.strokeStyle = primary ? '#fff2aa' : '#90a5ba'; ctx.stroke();
  text(ctx, label, x + w / 2, y + h / 2, 40, primary ? '#493016' : CREAM, 'center', 900);
}

export function hazard(ctx: Context, rect: Rect, vertical = false): void {
  const { x, y, w, h } = rect;
  ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  ctx.fillStyle = '#d4a03f'; ctx.fillRect(x, y, w, h); ctx.fillStyle = '#26313b';
  if (vertical) {
    for (let n = y - 35; n < y + h + 35; n += 54) {
      ctx.beginPath(); ctx.moveTo(x, n); ctx.lineTo(x + w, n + 24); ctx.lineTo(x + w, n + 50); ctx.lineTo(x, n + 26); ctx.closePath(); ctx.fill();
    }
  } else {
    for (let n = x - 35; n < x + w + 35; n += 54) {
      ctx.beginPath(); ctx.moveTo(n, y); ctx.lineTo(n + 27, y); ctx.lineTo(n + 7, y + h); ctx.lineTo(n - 20, y + h); ctx.closePath(); ctx.fill();
    }
  }
  ctx.fillStyle = 'rgba(255,240,186,.25)'; ctx.fillRect(x, y, w, Math.min(3, h)); ctx.restore();
}

/** Purpose-built symbols stay legible without relying on system emoji fonts. */
export function icon(ctx: Context, cargo: CargoId, x: number, y: number, size: number, color = '#fff6dd', outline = '#243644'): void {
  ctx.save(); ctx.translate(x, y); ctx.scale(size / 100, size / 100);
  ctx.fillStyle = color; ctx.strokeStyle = outline; ctx.lineWidth = 4; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  if (cargo === 'cargo.machine') {
    ctx.beginPath();
    for (let i = 0; i < 40; i++) {
      const a = i / 40 * Math.PI * 2 - Math.PI / 2, r = [43, 43, 34, 34, 43][i % 5];
      const px = Math.cos(a) * r, py = Math.sin(a) * r;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, 15, 0, Math.PI * 2); ctx.fillStyle = outline; ctx.fill();
    ctx.strokeStyle = color; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 0, 21, 0, Math.PI * 2); ctx.stroke();
  } else if (cargo === 'cargo.food') {
    ctx.beginPath(); ctx.moveTo(0, -25); ctx.bezierCurveTo(-38, -52, -54, -2, -30, 29);
    ctx.bezierCurveTo(-12, 52, -8, 33, 0, 36); ctx.bezierCurveTo(16, 48, 25, 40, 36, 19);
    ctx.bezierCurveTo(57, -21, 27, -46, 0, -25); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.lineWidth = 7; ctx.beginPath(); ctx.moveTo(0, -26); ctx.quadraticCurveTo(-3, -39, 6, -47); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(8, -37); ctx.quadraticCurveTo(14, -60, 35, -49); ctx.quadraticCurveTo(24, -29, 8, -37); ctx.closePath(); ctx.fillStyle = '#bada83'; ctx.fill(); ctx.lineWidth = 3; ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,.65)'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(-22, -15); ctx.quadraticCurveTo(-32, -2, -25, 13); ctx.stroke();
  } else if (cargo === 'cargo.cold') {
    ctx.strokeStyle = outline; ctx.lineWidth = 11; snowflake(ctx); ctx.strokeStyle = color; ctx.lineWidth = 6; snowflake(ctx);
    ctx.beginPath(); ctx.arc(0, 0, 9, 0, Math.PI * 2); ctx.fill();
  } else if (cargo === 'cargo.electronic') {
    ctx.strokeStyle = color; ctx.lineWidth = 6;
    for (let n = -20; n <= 20; n += 20) {
      ctx.beginPath(); ctx.moveTo(n, -47); ctx.lineTo(n, 47); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-47, n); ctx.lineTo(47, n); ctx.stroke();
    }
    ctx.strokeStyle = outline; ctx.lineWidth = 4; roundedPath(ctx, -34, -34, 68, 68, 7); ctx.fill(); ctx.stroke();
    ctx.fillStyle = outline; roundedPath(ctx, -20, -20, 40, 40, 3); ctx.fill();
    ctx.strokeStyle = color; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-12, 10); ctx.lineTo(-12, -10); ctx.lineTo(7, -10); ctx.lineTo(7, 3); ctx.lineTo(14, 3); ctx.stroke();
  } else {
    ctx.beginPath(); ctx.moveTo(0, -46); ctx.lineTo(47, 36); ctx.quadraticCurveTo(50, 43, 40, 43); ctx.lineTo(-40, 43); ctx.quadraticCurveTo(-50, 43, -46, 34); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = outline; roundedPath(ctx, -6, -21, 12, 36, 5); ctx.fill(); ctx.beginPath(); ctx.arc(0, 28, 6, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

function snowflake(ctx: Context): void {
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = i * Math.PI / 3; const dx = Math.cos(a), dy = Math.sin(a);
    ctx.moveTo(0, 0); ctx.lineTo(dx * 44, dy * 44);
    for (const sign of [-1, 1]) {
      ctx.moveTo(dx * 27, dy * 27); ctx.lineTo(dx * 19 - dy * sign * 12, dy * 19 + dx * sign * 12);
    }
  }
  ctx.stroke();
}

export function cargoBox(ctx: Context, cargo: CargoId, x: number, y: number, size: number, alpha = 1, trait?: CellTrait | null, style: CargoStyleId = 'classic', largeRushCountdown = false, outlineOverride = false): void {
  const p = PALETTE[cargo];
  ctx.save(); ctx.globalAlpha *= alpha; ctx.translate(x, y); ctx.scale(size / 110, size / 110);
  if (trait?.kind === 'waste') {
    roundedPath(ctx, 6, 13, 103, 97, 10); ctx.fillStyle = 'rgba(9,14,16,.36)'; ctx.fill();
    roundedPath(ctx, 5, 9, 98, 96, 8); ctx.fillStyle = '#727b83'; ctx.fill(); ctx.strokeStyle = '#323d47'; ctx.lineWidth = 4; ctx.stroke();
    ctx.strokeStyle = '#d9dee0'; ctx.lineWidth = 10; ctx.lineCap = 'round'; ctx.beginPath();
    ctx.moveTo(31, 25); ctx.lineTo(78, 66); ctx.moveTo(78, 25); ctx.lineTo(31, 66); ctx.stroke();
    text(ctx, '废弃箱', 54, 87, 20, '#f2f0df', 'center', 900);
    if (style === 'outline' || outlineOverride) drawCargoOutline(ctx);
    ctx.restore(); return;
  }
  roundedPath(ctx, 6, 13, 103, 97, 10); ctx.fillStyle = 'rgba(9,14,16,.36)'; ctx.fill();
  const whole = CARGO_ATLAS.styles.includes(style);
  const classic = style === 'classic' || style === 'outline' || whole && !drawCargoAtlas(ctx, cargo, style);
  ctx.strokeStyle = p.ink; ctx.lineWidth = 3;
  if (classic) {
    drawCrateFrame(ctx, p);
    roundedPath(ctx, 11, 24, 75, 71, 3); ctx.strokeStyle = p.dark; ctx.lineWidth = 2; ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,.42)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(13, 26); ctx.lineTo(83, 26); ctx.moveTo(12, 28); ctx.lineTo(12, 91); ctx.stroke();
    ctx.strokeStyle = p.dark; ctx.lineWidth = 2;
    for (const [sx, sy, ex, ey] of [[14, 30, 28, 42], [82, 30, 69, 42], [14, 90, 27, 78], [82, 90, 70, 78]]) {
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.stroke();
    }
  } else if (!whole) drawMaterialCrate(ctx, p, style as Exclude<CargoStyleId, 'classic' | 'outline'>);
  if (cargo === 'cargo.chem') hazard(ctx, { x: 16, y: 91, w: 64, h: 5 });
  if (cargo === 'cargo.cold') {
    ctx.strokeStyle = 'rgba(213,251,255,.7)'; ctx.beginPath(); ctx.moveTo(19, 11); ctx.lineTo(86, 11); ctx.stroke();
  }
  icon(ctx, cargo, 48, 60, 54, cargo === 'cargo.chem' ? '#fff2ac' : '#fff4da', p.ink);
  if (classic) {
    for (const [sx, sy] of [[10, 22], [87, 22], [10, 98], [87, 98]]) rivet(ctx, sx, sy, 2.2);
    ctx.fillStyle = p.ink; ctx.fillRect(33, 98, 30, 3); ctx.fillStyle = p.light; ctx.fillRect(37, 98, 2, 3); ctx.fillRect(45, 98, 1, 3); ctx.fillRect(51, 98, 3, 3);
  }
  if (trait) drawTraitBadge(ctx, trait, largeRushCountdown);
  if (style === 'outline' || outlineOverride) drawCargoOutline(ctx);
  ctx.restore();
}

/** Small static material primitives, shared by crate, vehicle and scenery drawings. */
export function artRect(c: Context,x:number,y:number,w:number,h:number,fill:string|CanvasGradient,r=0,stroke?:string,lw=2):void {roundedPath(c,x,y,w,h,r);c.fillStyle=fill;c.fill();if(stroke){c.strokeStyle=stroke;c.lineWidth=lw;c.stroke();}}
export function artLine(c:Context,p:readonly (readonly number[])[],color:string,width=2):void {c.strokeStyle=color;c.lineWidth=width;c.beginPath();p.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.stroke();}
export function artPolygon(c:Context,p:readonly (readonly number[])[],fill:string|CanvasGradient,stroke?:string,lw=2):void {c.beginPath();p.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.closePath();c.fillStyle=fill;c.fill();if(stroke){c.strokeStyle=stroke;c.lineWidth=lw;c.stroke();}}
export function artDot(c:Context,x:number,y:number,r:number,fill:string|CanvasGradient,stroke?:string,lw=1.3):void {c.beginPath();c.arc(x,y,r,0,Math.PI*2);c.fillStyle=fill;c.fill();if(stroke){c.strokeStyle=stroke;c.lineWidth=lw;c.stroke();}}

/** Shared perspective for the classic crate and straight-sided materials. */
function drawCrateFrame(ctx: Context, p: typeof PALETTE[CargoId], radius = 6): void {
  ctx.strokeStyle = p.ink; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(5, 17); ctx.lineTo(18, 4); ctx.lineTo(104, 4); ctx.lineTo(91, 17); ctx.closePath(); ctx.fillStyle = p.light; ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(92, 17); ctx.lineTo(105, 4); ctx.lineTo(105, 91); ctx.lineTo(92, 104); ctx.closePath(); ctx.fillStyle = p.dark; ctx.fill(); ctx.stroke();
  roundedPath(ctx, 4, 16, 89, 88, radius); ctx.fillStyle = gradient(ctx, 0, 16, 88, p.light, p.mid); ctx.fill(); ctx.stroke();
}

/** Each material owns its outer shell; shared cargo symbols and traits remain above it. */
function drawMaterialCrate(c: Context, p: typeof PALETTE[CargoId], style: Exclude<CargoStyleId, 'classic' | 'outline'>): void {
  c.save();
  if (style === 'taped' || style === 'paper_fold') drawCrateFrame(c, p, style === 'paper_fold' ? 0 : 1);
  if (style === 'taped') {
    artPolygon(c, [[5, 17], [18, 4], [104, 4], [91, 17]], '#dec38e', '#826440', 2.5);
    for (const y of [19, 89]) artRect(c, 6, y, 85, 12, '#d7b776', 0, '#967247', 1.5);
    artLine(c, [[8, 23], [87, 23]], '#f4da9b', 2);
    artPolygon(c, [[39, 16], [51, 4], [67, 4], [55, 16]], '#f2d9a1', '#ae8a55', 1.5);
    artLine(c, [[95, 28], [103, 20], [103, 85], [95, 93]], '#c4a06c', 6);
  } else if (style === 'toy_brick') {
    artPolygon(c, [[14, 18], [26, 5], [94, 5], [104, 15], [92, 30]], p.light, p.ink, 3);
    artRect(c, 12, 15, 93, 88, p.dark, 15, p.ink, 3);
    artRect(c, 5, 17, 88, 87, gradient(c, 0, 17, 87, p.light, p.mid), 16, p.ink, 3);
    roundedPath(c, 11, 23, 76, 74, 13); c.strokeStyle = p.dark; c.lineWidth = 5; c.stroke();
    for (const [x, y] of [[18, 31], [80, 31], [18, 88], [80, 88]]) {
      artDot(c, x, y + 2, 7.5, p.dark); artDot(c, x, y, 7, p.light, p.ink);
      artLine(c, [[x - 3, y - 3], [x + 1, y - 4]], '#fff4dba8', 2);
    }
    artLine(c, [[99, 31], [99, 77]], p.light, 4);
    artLine(c, [[30, 22], [64, 22]], '#fff9e090', 3.5);
  } else if (style === 'paper_fold') {
    artPolygon(c, [[5, 17], [18, 4], [104, 4], [91, 17]], '#ecd9ad', '#947755', 2.5);
    artPolygon(c, [[94, 18], [105, 5], [105, 89], [94, 103], [97, 59]], '#dbc496', '#8a6e4d', 2);
    artLine(c, [[98, 33], [101, 57], [98, 87]], '#ab8c64', 3);
    artPolygon(c, [[5, 18], [32, 18], [5, 47]], '#f1e2bf', '#937856', 2);
    artLine(c, [[8, 43], [30, 20]], '#fff0ca', 3);
    artPolygon(c, [[68, 101], [92, 75], [92, 101]], '#f1e2bf', '#937856', 2);
    for (const [y, color] of [[101, '#8f704c'], [97, '#ead5a7']] as const) artLine(c, [[9, y], [69, y]], color, 3);
  } else if (style === 'insulated') {
    artPolygon(c, [[6, 18], [18, 4], [102, 4], [104, 17], [93, 30]], '#e9ecdb', '#455b60', 3);
    artRect(c, 12, 16, 93, 87, '#a3b8b3', 8, '#40565c', 3);
    artRect(c, 4, 17, 90, 87, gradient(c, 0, 17, 87, '#f0f1dd', '#c4d2c3'), 10, '#43565a', 3);
    artRect(c, 13, 27, 72, 66, '#314a52', 5);
    artRect(c, 18, 32, 62, 57, gradient(c, 0, 32, 57, p.light, p.mid), 3, p.dark, 2);
    artRect(c, 5, 17, 89, 11, '#eef1df', 6, '#879c96', 2);
    for (const x of [6, 84]) artRect(c, x, 48, 8, 24, '#3c5961', 2);
    artLine(c, [[99, 28], [99, 84]], '#e2e8d4', 5);
  } else {
    // The outside is cut too: never paint the old square underneath this shell.
    artPolygon(c, [[18, 5], [89, 5], [105, 21], [105, 83], [89, 102], [19, 102], [5, 87], [5, 22]], '#384f5e', '#182e3c', 3);
    artPolygon(c, [[22, 16], [76, 16], [93, 33], [93, 87], [76, 104], [22, 104], [5, 87], [5, 33]], '#a7bcbe', '#354e5b', 3);
    artPolygon(c, [[26, 26], [71, 26], [82, 37], [82, 81], [71, 92], [26, 92], [15, 81], [15, 37]], gradient(c, 0, 26, 66, p.light, p.mid), p.dark, 2);
    artPolygon(c, [[20, 6], [89, 6], [98, 15], [14, 15]], '#c6d4cf', '#354e5b', 2);
    for (const x of [7, 83]) { artRect(c, x, 48, 8, 25, '#233b4c', 1); artRect(c, x + 1, 54, 6, 12, '#d3dfd6', 1); }
    artLine(c, [[25, 98], [69, 98]], '#dbe5dc', 3);
    artPolygon(c, [[97, 26], [103, 20], [103, 80], [97, 87]], '#8ca7ab', '#294854', 2);
    artRect(c, 97, 40, 5, 22, '#254552', 1);
  }
  c.restore();
}

function drawCargoOutline(ctx: Context): void {
  roundedPath(ctx, 3, 3, 104, 104, 8); ctx.strokeStyle = '#172635'; ctx.lineWidth = 11; ctx.stroke();
  ctx.strokeStyle = '#fff6d6'; ctx.lineWidth = 5; ctx.stroke();
}

/** Secondary shape and text encode traits independently of base cargo color. */
function drawTraitBadge(ctx: Context, trait: CellTrait, largeRushCountdown = false): void {
  const kind = trait.kind;
  if (kind === 'pallet') {
    ctx.fillStyle = '#bd8f50'; ctx.strokeStyle = '#483322'; ctx.lineWidth = 3;
    roundedPath(ctx, 2, 90, 105, 18, 3); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#483322'; for (const x of [19, 50, 81]) ctx.fillRect(x, 98, 9, 10);
  }
  const large=kind==='rush'&&largeRushCountdown;
  const label = kind === 'pallet' ? '×2' : kind === 'rush' ? large?String(trait.remaining??'?'):`余${trait.remaining ?? '?'}次` : kind === 'hazard' ? '危险' : '万能';
  const color = kind === 'rush' && trait.remaining === 1 ? '#ffb392' : kind === 'wildcard' ? '#ddd0ff' : '#ffe393';
  roundedPath(ctx, large?32:14, large?4:7, large?48:84, large?40:29, 5); ctx.fillStyle = '#1b2633'; ctx.fill(); ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.stroke();
  text(ctx, label, 56, large?25:22, large?34:kind === 'rush' ? 22 : 24, color, 'center', 900);
  if (kind === 'hazard') {
    ctx.fillStyle = '#ffdb75'; ctx.strokeStyle = '#4a321f'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(88, 69); ctx.lineTo(105, 96); ctx.lineTo(71, 96); ctx.closePath(); ctx.fill(); ctx.stroke();
    text(ctx, '!', 88, 87, 22, '#4a321f', 'center', 900);
  } else if (kind === 'wildcard') {
    ctx.fillStyle = '#e8dcff'; ctx.strokeStyle = '#53416f'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(88, 64); ctx.lineTo(103, 82); ctx.lineTo(88, 100); ctx.lineTo(73, 82); ctx.closePath(); ctx.fill(); ctx.stroke();
    text(ctx, '*', 88, 85, 29, '#53416f', 'center', 900);
  }
}

/** Top-down forklift points to +x. Rotation follows path segment direction. */
export function forklift(ctx: Context, x: number, y: number, size: number, angle: number, paint: ForkliftId = 'yellow'): void {
  ctx.save(); ctx.translate(x, y); ctx.rotate(angle); ctx.scale(size / 110, size / 110);
  ctx.fillStyle = 'rgba(0,0,0,.33)'; ctx.beginPath(); ctx.ellipse(0, 7, 57, 39, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#131920';
  for (const xx of [-32, 19]) for (const yy of [-36, 23]) { roundedPath(ctx, xx, yy, 23, 17, 4); ctx.fill(); }
  const logistics = paint === 'electric' || paint === 'heavy' || paint === 'compact';
  const playful = paint === 'toy' || paint === 'paper' || paint === 'space';
  // Arrow-selected electric/toy/paper/space use their unchanged native vector bodies.
  // All other active premium models have structurally distinct native bodies.
  const structural = drawStructuralForkliftBody(ctx, paint);
  const themed = structural || (!logistics && !playful && drawThemedForkliftBody(ctx, paint));
  if (themed) { /* Verified static body; shared transport geometry follows below. */ }
  else if (playful) drawPlayfulForkliftBody(ctx, paint);
  else if (logistics) drawLogisticsForkliftBody(ctx, paint);
  else {
  const colors = paint === 'blue' ? ['#478ed0', '#9bd8ff', '#254965', '#71bdff'] : paint === 'red' ? ['#d65646', '#ffb290', '#76332e', '#ff846b'] : paint === 'white' ? ['#dce4e8', '#fff9e9', '#60717d', '#f2f0da'] : ['#e4ab36', '#ffe077', '#6a481e', '#ffc857'];
  ctx.fillStyle = colors[0]; ctx.strokeStyle = colors[2]; ctx.lineWidth = 3;
  roundedPath(ctx, -41, -25, 75, 50, 13); ctx.fill(); ctx.stroke();
  ctx.fillStyle = colors[1]; roundedPath(ctx, -38, -22, 25, 44, 8); ctx.fill();
  ctx.fillStyle = '#243541'; roundedPath(ctx, -12, -22, 32, 44, 4); ctx.fill();
  ctx.fillStyle = '#13202b'; roundedPath(ctx, -6, -14, 17, 28, 5); ctx.fill();
  ctx.strokeStyle = colors[3]; ctx.lineWidth = 5; ctx.strokeRect(-13, -27, 35, 54);
  }
  ctx.strokeStyle = '#2d3438'; ctx.lineWidth = 7; ctx.beginPath(); ctx.moveTo(30, -31); ctx.lineTo(30, 31); ctx.stroke();
  ctx.strokeStyle = '#bac1ba'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(31, -17); ctx.lineTo(61, -17); ctx.moveTo(31, 17); ctx.lineTo(61, 17); ctx.stroke();
  ctx.fillStyle = '#fff2a5'; ctx.fillRect(24, -24, 5, 7); ctx.fillRect(24, 17, 5, 7);
  if (!logistics && !playful && !themed) { ctx.fillStyle = '#ee6942'; ctx.fillRect(-40, -17, 4, 7); ctx.fillRect(-40, 10, 4, 7); }
  if (paint === 'white') {
    ctx.fillStyle = '#d5a13d'; ctx.fillRect(-34, -19, 16, 3); ctx.fillRect(-34, 16, 16, 3);
    ctx.fillStyle = '#536575'; for (const y of [-8, -2, 4]) ctx.fillRect(-31, y, 11, 2);
  }
  ctx.restore();
}

/** Playful bodies reuse the shared wheel, mast, fork and load geometry unchanged. */
function drawPlayfulForkliftBody(c:Context,paint:'toy'|'paper'|'space'):void {
 c.save();c.lineJoin='round';
 if(paint==='toy'){
  artRect(c,-41,-25,75,50,gradient(c,0,-25,50,'#f3bc63','#c7823e'),16,'#754729',3);
  artRect(c,-37,-20,24,40,'#f9d68a',11);artLine(c,[[-33,-15],[-33,15]],'#b17e43',1.5);
  for(const xx of [-32,17])for(const yy of [-31,22])artRect(c,xx,yy,xx<0?22:17,9,'#f2c971',4,'#8b6036',1.8);
  artRect(c,-12,-23,35,46,'#ffe6aa',10,'#a77541',2);artRect(c,-7,-17,24,34,'#2c444f',7,'#b29260',2);
  artRect(c,-3,-12,15,24,'#132a37',5);artLine(c,[[-5,-16],[12,-16]],'#628187',2);
  artDot(c,-25,-11,4,'#efb551','#bb8140');artDot(c,-25,11,4,'#efb551','#bb8140');
 }else if(paint==='paper'){
  artPolygon(c,[[-42,-18],[-31,-27],[24,-25],[33,-16],[33,16],[24,25],[-31,27],[-42,18]],'#d8bb87','#725a3e',3);
  artPolygon(c,[[-37,-17],[-29,-22],[-14,-22],[-14,22],[-29,22],[-37,17]],'#f0d7a7','#a58960',2);
  for(const xx of [-39,-36,-33])artLine(c,[[xx,-12],[xx,12]],'#8f7656',1.5);
  for(const yy of [-28,23]){artPolygon(c,[[-33,yy],[-26,yy-5],[-8,yy-5],[-12,yy+5],[-33,yy+5]],'#eddbb6','#8c7658',1.5);artPolygon(c,[[18,yy],[24,yy-4],[34,yy],[34,yy+5],[18,yy+5]],'#eddbb6','#8c7658',1.5);}
  artRect(c,-11,-23,32,46,'#263d48',2);artRect(c,-5,-15,18,30,'#122633',2);
  for(const xx of [-14,21]){artLine(c,[[xx,-25],[xx,25]],'#8f7656',7);artLine(c,[[xx-1,-25],[xx-1,25]],'#f2dfb8',4);}
  artLine(c,[[-14,-26],[21,-26]],'#efdcb4',4);artLine(c,[[-14,26],[21,26]],'#efdcb4',4);
  artPolygon(c,[[-32,-19],[-20,-19],[-32,-7]],'#fff0cd','#ad9064',1);
 }else{
  artPolygon(c,[[-43,-14],[-31,-26],[23,-26],[34,-15],[34,15],[23,26],[-31,26],[-43,14]],'#b1c2bd','#415962',3);
  artPolygon(c,[[-38,-12],[-29,-21],[-16,-21],[-16,21],[-29,21],[-38,12]],'#dce4d5','#607a7b',2);
  for(const yy of [-12,-3,6])artRect(c,-32,yy,11,4,'#526e73',1);
  for(const yy of [-29,21]){artPolygon(c,[[-34,yy],[-23,yy],[-18,yy+7],[-34,yy+7]],'#dce4d5','#6b8684',1.5);artRect(c,14,yy,18,8,'#879f9d',2,'#45616a',1.5);}
  artPolygon(c,[[-13,-17],[-5,-27],[16,-27],[24,-18],[24,18],[16,27],[-5,27],[-13,17]],'#dce6db','#5d777b',2.5);
  artPolygon(c,[[-8,-13],[-2,-20],[13,-20],[18,-13],[18,13],[13,20],[-2,20],[-8,13]],'#253f50','#a4bfbc',2);
  artLine(c,[[-5,-12],[13,-12]],'#526e7c',2);artLine(c,[[3,-20],[3,20]],'#6c8589',2);
  artRect(c,-41,-6,3,12,'#be8c5f',1);
 }
 c.restore();
}

/** Only the body changes. Shared wheels, mast, forks and lamps retain transport geometry. */
function drawLogisticsForkliftBody(ctx: Context, paint: 'electric' | 'heavy' | 'compact'): void {
  ctx.save(); ctx.lineJoin = 'round';
  if (paint === 'electric') {
    ctx.beginPath(); ctx.moveTo(-43, -16); ctx.lineTo(-33, -26); ctx.lineTo(27, -26); ctx.lineTo(34, -18);
    ctx.lineTo(34, 18); ctx.lineTo(27, 26); ctx.lineTo(-33, 26); ctx.lineTo(-43, 16); ctx.closePath();
    ctx.fillStyle = gradient(ctx, 0, -26, 52, '#bad4c7', '#62948f'); ctx.fill(); ctx.strokeStyle = '#38565e'; ctx.lineWidth = 3; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-39, -14); ctx.lineTo(-30, -22); ctx.lineTo(-16, -22); ctx.lineTo(-16, 22); ctx.lineTo(-30, 22); ctx.lineTo(-39, 14); ctx.closePath();
    ctx.fillStyle = gradient(ctx, 0, -22, 44, '#e2ead5', '#9fbbab'); ctx.fill(); ctx.strokeStyle = '#779990'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = '#456b71'; for (const y of [-9, -1, 7]) { ctx.fillRect(-33, y, 6, 3); ctx.fillRect(-25, y, 6, 3); }
    roundedPath(ctx, -11, -24, 34, 48, 6); ctx.fillStyle = '#263d49'; ctx.fill();
    roundedPath(ctx, -6, -17, 20, 34, 5); ctx.fillStyle = '#112633'; ctx.fill();
    roundedPath(ctx, -13, -27, 37, 54, 5); ctx.strokeStyle = '#d3e7d8'; ctx.lineWidth = 4; ctx.stroke();
    ctx.fillStyle = '#f0efd8'; ctx.fillRect(-8, -26, 23, 2); ctx.fillStyle = '#ef966a'; ctx.fillRect(-40, -12, 3, 6); ctx.fillRect(-40, 6, 3, 6);
  } else if (paint === 'heavy') {
    ctx.beginPath(); ctx.moveTo(-41, -13); ctx.lineTo(-31, -28); ctx.lineTo(23, -28); ctx.lineTo(34, -20);
    ctx.lineTo(34, 20); ctx.lineTo(23, 28); ctx.lineTo(-31, 28); ctx.lineTo(-41, 13); ctx.closePath();
    ctx.fillStyle = gradient(ctx, 0, -29, 58, '#dcb87a', '#9d7249'); ctx.fill(); ctx.strokeStyle = '#5c4d3c'; ctx.lineWidth = 3; ctx.stroke();
    roundedPath(ctx, -36, -23, 23, 46, 5); ctx.fillStyle = gradient(ctx, 0, -23, 46, '#e5c995', '#b49a66'); ctx.fill();
    ctx.strokeStyle = '#8d7753'; ctx.lineWidth = 2; ctx.stroke(); ctx.fillStyle = '#7d674d'; for (const y of [-13, -5, 3, 11]) ctx.fillRect(-33, y, 15, 2);
    for (const x of [-33, 17]) for (const y of [-33, 23]) {
      roundedPath(ctx, x, y, x < 0 ? 26 : 17, 10, 2); ctx.fillStyle = '#545b53'; ctx.fill();
      roundedPath(ctx, x + 2, y + 2, x < 0 ? 22 : 13, 5, 1); ctx.fillStyle = '#afb5a0'; ctx.fill();
    }
    roundedPath(ctx, -10, -23, 31, 46, 3); ctx.fillStyle = '#263740'; ctx.fill();
    roundedPath(ctx, -5, -15, 18, 30, 4); ctx.fillStyle = '#14232c'; ctx.fill();
    ctx.strokeStyle = '#efd495'; ctx.lineWidth = 4; ctx.strokeRect(-12, -27, 35, 54);
    ctx.strokeStyle = '#aebbb0'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-10, -13); ctx.lineTo(20, -13); ctx.moveTo(-10, 13); ctx.lineTo(20, 13); ctx.stroke();
    ctx.fillStyle = '#ef8a59'; ctx.fillRect(-41, -12, 3, 6); ctx.fillRect(-41, 6, 3, 6);
  } else {
    ctx.beginPath(); ctx.moveTo(-30, -13); ctx.lineTo(-19, -23); ctx.lineTo(23, -27); ctx.lineTo(34, -18);
    ctx.lineTo(34, 18); ctx.lineTo(23, 27); ctx.lineTo(-19, 23); ctx.lineTo(-30, 13); ctx.closePath();
    ctx.fillStyle = gradient(ctx, 0, -27, 54, '#f0c783', '#bc8141'); ctx.fill(); ctx.strokeStyle = '#76522f'; ctx.lineWidth = 3; ctx.stroke();
    roundedPath(ctx, -26, -12, 12, 24, 4); ctx.fillStyle = gradient(ctx, 0, -12, 24, '#ffe0a1', '#dcab66'); ctx.fill();
    ctx.fillStyle = '#9f794d'; roundedPath(ctx, -22, -8, 5, 16, 2); ctx.fill();
    roundedPath(ctx, -10, -20, 28, 40, 3); ctx.fillStyle = '#29404c'; ctx.fill();
    roundedPath(ctx, -4, -13, 15, 26, 4); ctx.fillStyle = '#142834'; ctx.fill();
    ctx.strokeStyle = '#ffe3a0'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-12, -23); ctx.lineTo(21, -23); ctx.lineTo(21, 23); ctx.lineTo(-12, 23); ctx.stroke();
    ctx.fillStyle = '#fff1be'; for (const y of [-24, 21]) ctx.fillRect(-12, y, 4, 3);
    ctx.fillStyle = '#e9794e'; ctx.fillRect(-28, -10, 2, 5); ctx.fillRect(-28, 5, 2, 5);
  }
  ctx.restore();
}

export function arrow(ctx: Context, x: number, y: number, size: number, angle: number, color: string): void {
  ctx.save(); ctx.translate(x, y); ctx.rotate(angle); ctx.fillStyle = color;
  ctx.beginPath(); ctx.moveTo(size / 2, 0); ctx.lineTo(-size / 3, -size / 3); ctx.lineTo(-size / 6, 0); ctx.lineTo(-size / 3, size / 3); ctx.closePath(); ctx.fill(); ctx.restore();
}
