import type { CargoId, CellTrait } from '../domain/types.ts';
import type { CargoStyleId, ForkliftId } from '../application/profile.ts';
import type { Rect } from './layout.ts';

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

export function cargoBox(ctx: Context, cargo: CargoId, x: number, y: number, size: number, alpha = 1, trait?: CellTrait | null, style: CargoStyleId = 'classic'): void {
  const p = PALETTE[cargo];
  ctx.save(); ctx.globalAlpha *= alpha; ctx.translate(x, y); ctx.scale(size / 110, size / 110);
  if (trait?.kind === 'waste') {
    roundedPath(ctx, 6, 13, 103, 97, 10); ctx.fillStyle = 'rgba(9,14,16,.36)'; ctx.fill();
    roundedPath(ctx, 5, 9, 98, 96, 8); ctx.fillStyle = '#727b83'; ctx.fill(); ctx.strokeStyle = '#323d47'; ctx.lineWidth = 4; ctx.stroke();
    ctx.strokeStyle = '#d9dee0'; ctx.lineWidth = 10; ctx.lineCap = 'round'; ctx.beginPath();
    ctx.moveTo(31, 25); ctx.lineTo(78, 66); ctx.moveTo(78, 25); ctx.lineTo(31, 66); ctx.stroke();
    text(ctx, '废弃物', 54, 87, 20, '#f2f0df', 'center', 900);
    if (style === 'outline') drawCargoOutline(ctx);
    ctx.restore(); return;
  }
  roundedPath(ctx, 6, 13, 103, 97, 10); ctx.fillStyle = 'rgba(9,14,16,.36)'; ctx.fill();
  ctx.strokeStyle = p.ink; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(5, 17); ctx.lineTo(18, 4); ctx.lineTo(104, 4); ctx.lineTo(91, 17); ctx.closePath(); ctx.fillStyle = p.light; ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(92, 17); ctx.lineTo(105, 4); ctx.lineTo(105, 91); ctx.lineTo(92, 104); ctx.closePath(); ctx.fillStyle = p.dark; ctx.fill(); ctx.stroke();
  roundedPath(ctx, 4, 16, 89, 88, 6); ctx.fillStyle = gradient(ctx, 0, 16, 88, p.light, p.mid); ctx.fill(); ctx.stroke();
  roundedPath(ctx, 11, 24, 75, 71, 3); ctx.strokeStyle = p.dark; ctx.lineWidth = 2; ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,.42)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(13, 26); ctx.lineTo(83, 26); ctx.moveTo(12, 28); ctx.lineTo(12, 91); ctx.stroke();
  ctx.strokeStyle = p.dark; ctx.lineWidth = 2;
  for (const [sx, sy, ex, ey] of [[14, 30, 28, 42], [82, 30, 69, 42], [14, 90, 27, 78], [82, 90, 70, 78]]) {
    ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.stroke();
  }
  if (cargo === 'cargo.chem') hazard(ctx, { x: 16, y: 91, w: 64, h: 5 });
  if (cargo === 'cargo.cold') {
    ctx.strokeStyle = 'rgba(213,251,255,.7)'; ctx.beginPath(); ctx.moveTo(19, 11); ctx.lineTo(86, 11); ctx.stroke();
  }
  icon(ctx, cargo, 48, 60, 54, cargo === 'cargo.chem' ? '#fff2ac' : '#fff4da', p.ink);
  for (const [sx, sy] of [[10, 22], [87, 22], [10, 98], [87, 98]]) rivet(ctx, sx, sy, 2.2);
  ctx.fillStyle = p.ink; ctx.fillRect(33, 98, 30, 3); ctx.fillStyle = p.light; ctx.fillRect(37, 98, 2, 3); ctx.fillRect(45, 98, 1, 3); ctx.fillRect(51, 98, 3, 3);
  if (trait) drawTraitBadge(ctx, trait);
  if (style === 'outline') drawCargoOutline(ctx);
  ctx.restore();
}

function drawCargoOutline(ctx: Context): void {
  roundedPath(ctx, 3, 3, 104, 104, 8); ctx.strokeStyle = '#172635'; ctx.lineWidth = 11; ctx.stroke();
  ctx.strokeStyle = '#fff6d6'; ctx.lineWidth = 5; ctx.stroke();
}

/** Secondary shape and text encode traits independently of base cargo color. */
function drawTraitBadge(ctx: Context, trait: CellTrait): void {
  const kind = trait.kind;
  if (kind === 'pallet') {
    ctx.fillStyle = '#bd8f50'; ctx.strokeStyle = '#483322'; ctx.lineWidth = 3;
    roundedPath(ctx, 2, 90, 105, 18, 3); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#483322'; for (const x of [19, 50, 81]) ctx.fillRect(x, 98, 9, 10);
  }
  const label = kind === 'pallet' ? '×2' : kind === 'rush' ? `余${trait.remaining ?? '?'}次` : kind === 'hazard' ? '危险' : '万能';
  const color = kind === 'rush' && trait.remaining === 1 ? '#ffb392' : kind === 'wildcard' ? '#ddd0ff' : '#ffe393';
  roundedPath(ctx, 14, 7, 84, 29, 5); ctx.fillStyle = '#1b2633'; ctx.fill(); ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.stroke();
  text(ctx, label, 56, 22, kind === 'rush' ? 22 : 24, color, 'center', 900);
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
  const colors = paint === 'blue' ? ['#478ed0', '#9bd8ff', '#254965', '#71bdff'] : paint === 'red' ? ['#d65646', '#ffb290', '#76332e', '#ff846b'] : ['#e4ab36', '#ffe077', '#6a481e', '#ffc857'];
  ctx.fillStyle = colors[0]; ctx.strokeStyle = colors[2]; ctx.lineWidth = 3;
  roundedPath(ctx, -41, -25, 75, 50, 13); ctx.fill(); ctx.stroke();
  ctx.fillStyle = colors[1]; roundedPath(ctx, -38, -22, 25, 44, 8); ctx.fill();
  ctx.fillStyle = '#243541'; roundedPath(ctx, -12, -22, 32, 44, 4); ctx.fill();
  ctx.fillStyle = '#13202b'; roundedPath(ctx, -6, -14, 17, 28, 5); ctx.fill();
  ctx.strokeStyle = colors[3]; ctx.lineWidth = 5; ctx.strokeRect(-13, -27, 35, 54);
  ctx.strokeStyle = '#2d3438'; ctx.lineWidth = 7; ctx.beginPath(); ctx.moveTo(30, -31); ctx.lineTo(30, 31); ctx.stroke();
  ctx.strokeStyle = '#bac1ba'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(31, -17); ctx.lineTo(61, -17); ctx.moveTo(31, 17); ctx.lineTo(61, 17); ctx.stroke();
  ctx.fillStyle = '#fff2a5'; ctx.fillRect(24, -24, 5, 7); ctx.fillRect(24, 17, 5, 7);
  ctx.fillStyle = '#ee6942'; ctx.fillRect(-40, -17, 4, 7); ctx.fillRect(-40, 10, 4, 7);
  ctx.restore();
}

export function arrow(ctx: Context, x: number, y: number, size: number, angle: number, color: string): void {
  ctx.save(); ctx.translate(x, y); ctx.rotate(angle); ctx.fillStyle = color;
  ctx.beginPath(); ctx.moveTo(size / 2, 0); ctx.lineTo(-size / 3, -size / 3); ctx.lineTo(-size / 6, 0); ctx.lineTo(-size / 3, size / 3); ctx.closePath(); ctx.fill(); ctx.restore();
}
