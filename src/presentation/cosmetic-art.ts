import type { CargoStyleId, ForkliftId, ThemeId } from '../application/profile.ts';
import type { Rect } from './layout.ts';
import { cargoBox, forklift, gradient, roundedPath } from './assets.ts';

type Context = CanvasRenderingContext2D;
export interface CosmeticPreviewOptions {
  category?: 'theme' | 'cargo' | 'forklift';
  theme?: ThemeId;
  cargoStyle?: CargoStyleId;
  forklift?: ForkliftId;
  cargoOutline?: boolean;
}

const validRect = (r: Rect): boolean => [r.x, r.y, r.w, r.h].every(Number.isFinite) && r.w > 0 && r.h > 0;

/** Opaque, bounded scenery only. No cargo palette, board floor or gameplay state is changed. */
export function drawHarborBackground(ctx: Context, rect: Rect): void {
  if (!validRect(rect)) return;
  ctx.save(); ctx.beginPath(); ctx.rect(rect.x, rect.y, rect.w, rect.h); ctx.clip();
  ctx.translate(rect.x, rect.y); ctx.scale(rect.w / 1080, rect.w / 1080);
  const h = rect.h * 1080 / rect.w, horizon = Math.min(h * .49, 650), waterBottom = Math.min(h, horizon + Math.min(165, h * .2));
  ctx.fillStyle = gradient(ctx, 0, 0, h, '#263e50', '#101f2d'); ctx.fillRect(0, 0, 1080, h);

  // Distant gantry cranes and container stacks use muted steel, never the five cargo colors.
  ctx.save(); ctx.globalAlpha *= .7;
  drawCrane(ctx, 203, horizon, Math.min(355, horizon * .85), 1);
  drawCrane(ctx, 855, horizon, Math.min(275, horizon * .7), -1);
  ctx.fillStyle = '#344e5e';
  for (const [x, w, rows] of [[72, 122, 2], [321, 140, 1], [632, 140, 2], [812, 166, 1]]) {
    const boxH = Math.min(43, horizon * .12);
    for (let row = 0; row < rows; row++) {
      const y = horizon - (row + 1) * (boxH + 3); ctx.fillRect(x, y, w, boxH);
      ctx.strokeStyle = '#223b4c'; ctx.lineWidth = 3; ctx.beginPath();
      for (let i = 1; i < 8; i++) { ctx.moveTo(x + w * i / 8, y + 3); ctx.lineTo(x + w * i / 8, y + boxH - 3); }
      ctx.stroke();
    }
  }
  ctx.restore();

  ctx.fillStyle = gradient(ctx, 0, horizon, waterBottom - horizon, '#284655', '#1b3546'); ctx.fillRect(0, horizon, 1080, waterBottom - horizon);
  ctx.strokeStyle = 'rgba(130,168,184,.17)'; ctx.lineWidth = 2;
  for (let row = 0; row < 5; row++) {
    const y = horizon + 15 + row * (waterBottom - horizon) / 6;
    ctx.beginPath();
    for (let col = 0; col < 5; col++) {
      const x = col * 225 + row % 2 * 55; ctx.moveTo(x, y); ctx.lineTo(x + 80 + col % 2 * 45, y);
    }
    ctx.stroke();
  }
  // A low cargo barge silhouette makes the water read as a harbor at thumbnail size.
  ctx.fillStyle = '#1b303e'; ctx.beginPath(); ctx.moveTo(430, horizon + 12); ctx.lineTo(739, horizon + 12);
  ctx.lineTo(710, horizon + 37); ctx.lineTo(453, horizon + 37); ctx.closePath(); ctx.fill();
  ctx.fillRect(656, horizon - 21, 39, 33); ctx.fillStyle = '#45606b'; ctx.fillRect(661, horizon - 15, 12, 7);

  ctx.fillStyle = gradient(ctx, 0, waterBottom, Math.max(1, h - waterBottom), '#20313e', '#111f2b'); ctx.fillRect(0, waterBottom, 1080, h - waterBottom);
  ctx.fillStyle = '#5c5a45'; ctx.fillRect(0, waterBottom, 1080, 7);
  ctx.fillStyle = '#101e2a'; ctx.fillRect(0, waterBottom + 7, 1080, 10);

  // Foreground steel portals frame the scene. A fixed count bounds work for any rectangle.
  for (const x of [33, 1030]) {
    ctx.fillStyle = '#102331'; ctx.fillRect(x, 0, 22, h);
    ctx.fillStyle = '#425b69'; ctx.fillRect(x + 3, 0, 4, h);
    ctx.strokeStyle = '#334c5d'; ctx.lineWidth = 9;
    for (let row = 0; row < 7; row++) {
      const y = row * h / 7, direction = x < 500 ? 1 : -1;
      ctx.beginPath(); ctx.moveTo(x + 11, y); ctx.lineTo(x + 11 + direction * 78, y + Math.min(130, h / 7)); ctx.stroke();
      ctx.fillStyle = '#829092'; ctx.fillRect(x + 10, y + 18, 3, 3);
    }
  }
  for (const y of [Math.min(28, h * .1), Math.max(0, h - 45)]) {
    ctx.fillStyle = '#152a39'; ctx.fillRect(0, y, 1080, 17);
    ctx.fillStyle = '#706044'; ctx.fillRect(0, y + 2, 1080, 3);
    ctx.fillStyle = '#334b59'; ctx.fillRect(0, y + 15, 1080, 2);
  }
  ctx.restore();
}

function drawCrane(ctx: Context, x: number, baseline: number, height: number, direction: number): void {
  const top = baseline - height, reach = Math.min(345, height * 1.12), end = x + reach * direction;
  ctx.strokeStyle = '#3e5867'; ctx.lineWidth = 13; ctx.beginPath();
  ctx.moveTo(x - 35, baseline); ctx.lineTo(x - 10, top); ctx.lineTo(x + 10, top); ctx.lineTo(x + 36, baseline);
  ctx.moveTo(x - direction * 52, top + 25); ctx.lineTo(end, top + 25); ctx.stroke();
  ctx.strokeStyle = '#526675'; ctx.lineWidth = 4; ctx.beginPath();
  ctx.moveTo(x, top - height * .18); ctx.lineTo(end, top + 25); ctx.moveTo(x, top - height * .18); ctx.lineTo(x - direction * 52, top + 25);
  ctx.moveTo(x - 25, baseline - height * .22); ctx.lineTo(x + 20, baseline - height * .5); ctx.lineTo(x - 14, top + height * .25); ctx.lineTo(x + 10, top + 35);
  ctx.moveTo(end - direction * 25, top + 25); ctx.lineTo(end - direction * 25, top + height * .63); ctx.stroke();
  ctx.strokeStyle = '#81704c'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x - direction * 50, top + 22); ctx.lineTo(end, top + 22); ctx.stroke();
  ctx.fillStyle = '#293f4f'; ctx.fillRect(x - 18, top + 26, 39, 30);
  ctx.fillStyle = '#586f78'; ctx.fillRect(x - 12, top + 31, 24, 10);
}

/** One clear product subject, drawn through the same helpers as real cargo and vehicles. */
export function drawCosmeticPreview(ctx: Context, rect: Rect, options: CosmeticPreviewOptions = {}): void {
  if (!validRect(rect)) return;
  ctx.save(); ctx.beginPath(); ctx.rect(rect.x, rect.y, rect.w, rect.h); ctx.clip();
  const theme = options.theme ?? 'day', category = options.category ?? 'cargo';
  if (theme === 'harbor') drawHarborBackground(ctx, rect);
  else {
    ctx.fillStyle = gradient(ctx, rect.x, rect.y, rect.h, theme === 'night' ? '#111c35' : '#243345', theme === 'night' ? '#080d1b' : '#111b25');
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  }
  const scale = Math.min(rect.w / 720, rect.h / 250);
  ctx.translate(rect.x + (rect.w - 720 * scale) / 2, rect.y + (rect.h - 250 * scale) / 2); ctx.scale(scale, scale);
  const style = options.cargoStyle ?? 'classic', paint = options.forklift ?? 'yellow', outline = options.cargoOutline ?? false;
  ctx.fillStyle = 'rgba(12,23,33,.55)'; roundedPath(ctx, 65, 208, 590, 18, 8); ctx.fill();
  if (category === 'forklift') {
    // Front points right exactly as in transport; the generous margins include the fork tips.
    forklift(ctx, 340, 124, 257, 0, paint);
  } else if (category === 'theme') {
    if (theme !== 'harbor') {
      for (const x of [63, 516]) {
        ctx.fillStyle = '#34495c'; ctx.fillRect(x, 38, 13, 158); ctx.fillRect(x + 126, 38, 13, 158);
        ctx.fillStyle = '#716044'; ctx.fillRect(x, 75, 139, 5); ctx.fillRect(x, 160, 139, 5);
      }
    }
    cargoBox(ctx, 'cargo.food', 98, 98, 107, 1, undefined, style, false, outline);
    cargoBox(ctx, 'cargo.cold', 504, 134, 75, 1, undefined, style, false, outline);
    forklift(ctx, 357, 172, 106, 0, paint);
  } else {
    cargoBox(ctx, 'cargo.machine', 113, 62, 139, 1, undefined, style, false, outline);
    cargoBox(ctx, 'cargo.food', 285, 28, 178, 1, undefined, style, false, outline);
    cargoBox(ctx, 'cargo.cold', 498, 74, 126, 1, { kind: 'rush', remaining: 3 }, style, true, outline);
  }
  ctx.restore();
}
