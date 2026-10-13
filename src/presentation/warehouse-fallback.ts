// v112 (dd847c3) synchronous scenery, never a ready-state background layer.
import type {CargoId} from '../domain/types.ts';
import type {Rect} from './layout.ts';
import type {ViewState} from './view-types.ts';
import {cargoBox,gradient} from './assets.ts';
import {CLASSIC_RACKS,drawThemedSceneryFrame} from './scenery-frame.ts';
type Context=CanvasRenderingContext2D;

/** Original warehouse drawing; no cache, state, asset or geometry changes. */
export function drawWarehouseFallback(ctx: Context, view: ViewState, backgroundBounds?:Rect): void {
  if(drawThemedSceneryFrame(ctx,view.profile?.cosmetics.theme??'day',backgroundBounds))return;
  const night = view.profile?.cosmetics.theme === 'night';
  ctx.fillStyle = gradient(ctx, 0, 0, 1920, night ? '#111c35' : '#243345', night ? '#080d1b' : '#111b25'); ctx.fillRect(0, 0, 1080, 1920);
  // Fixed, muted rack silhouettes frame the playable floor rather than competing with it.
  ctx.save(); ctx.globalAlpha = .68;
  for (const sx of CLASSIC_RACKS.origins) {
    for (let row = 0; row < 8; row++) {
      const y = 62 + row * 230;
      ctx.fillStyle = '#101b27'; ctx.fillRect(sx, y, CLASSIC_RACKS.bodyWidth, 185);
      const cargo = (['cargo.machine', 'cargo.chem', 'cargo.cold', 'cargo.food'] as CargoId[])[row % 4];
      cargoBox(ctx, cargo, sx + 12, y + 38, 74, .75); cargoBox(ctx, 'cargo.chem', sx + 80, y + 63, 64, .52);
      ctx.fillStyle = '#3f4f5a'; ctx.fillRect(sx + CLASSIC_RACKS.shelfOffset, y + 180, CLASSIC_RACKS.shelfWidth, 14);
      ctx.fillStyle = '#a77233'; ctx.fillRect(sx + CLASSIC_RACKS.shelfOffset, y + 180, CLASSIC_RACKS.shelfWidth, 5);
      for (const xx of [sx + 4, sx + 157]) {
        ctx.fillStyle = '#273a4d'; ctx.fillRect(xx, y, 16, 217); ctx.fillStyle = '#647184'; ctx.fillRect(xx, y, 3, 217);
        for (let k = 0; k < 6; k++) { ctx.fillStyle = '#111d28'; ctx.fillRect(xx + 7, y + k * 33 + 16, 4, 7); }
      }
    }
  }
  ctx.restore();
  // Upper warehouse joists, electrical conduits and a restrained warm light.
  for (const y of [18, 234, 310, 1470, 1824]) {
    ctx.fillStyle = 'rgba(8,17,25,.7)'; ctx.fillRect(0, y, 1080, 10);
    ctx.fillStyle = 'rgba(138,153,160,.18)'; ctx.fillRect(0, y + 11, 1080, 3);
  }
  ctx.fillStyle = 'rgba(221,158,71,.07)'; ctx.beginPath(); ctx.moveTo(440, 0); ctx.lineTo(180, 520); ctx.lineTo(900, 520); ctx.lineTo(640, 0); ctx.fill();
}
