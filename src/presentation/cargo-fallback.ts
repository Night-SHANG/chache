// v112 (dd847c3) artwork, used only while the corresponding PNG is unavailable.
import type {CargoId} from '../domain/types.ts';
import {PALETTE,roundedPath,gradient,hazard,icon,rivet} from './assets.ts';
type Context=CanvasRenderingContext2D;

export function drawCargoBodyFallback(ctx:Context,cargo:CargoId,waste=false):void {
  const p=PALETTE[cargo];
  if(waste){
    roundedPath(ctx, 6, 13, 103, 97, 10); ctx.fillStyle = 'rgba(9,14,16,.36)'; ctx.fill();
    roundedPath(ctx, 5, 9, 98, 96, 8); ctx.fillStyle = '#727b83'; ctx.fill(); ctx.strokeStyle = '#323d47'; ctx.lineWidth = 4; ctx.stroke();
    ctx.strokeStyle = '#d9dee0'; ctx.lineWidth = 10; ctx.lineCap = 'round'; ctx.beginPath();
    ctx.moveTo(31, 25); ctx.lineTo(78, 66); ctx.moveTo(78, 25); ctx.lineTo(31, 66); ctx.stroke();
    return;
  }
  roundedPath(ctx, 6, 13, 103, 97, 10); ctx.fillStyle = 'rgba(9,14,16,.36)'; ctx.fill();
  ctx.strokeStyle=p.ink;ctx.lineWidth=3;
  drawCrateFrame(ctx, p);
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
}

function drawCrateFrame(ctx: Context, p: typeof PALETTE[CargoId], radius = 6): void {
  ctx.strokeStyle = p.ink; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(5, 17); ctx.lineTo(18, 4); ctx.lineTo(104, 4); ctx.lineTo(91, 17); ctx.closePath(); ctx.fillStyle = p.light; ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(92, 17); ctx.lineTo(105, 4); ctx.lineTo(105, 91); ctx.lineTo(92, 104); ctx.closePath(); ctx.fillStyle = p.dark; ctx.fill(); ctx.stroke();
  roundedPath(ctx, 4, 16, 89, 88, radius); ctx.fillStyle = gradient(ctx, 0, 16, 88, p.light, p.mid); ctx.fill(); ctx.stroke();
}

export function drawCargoOutlineFallback(ctx: Context): void {
  roundedPath(ctx, 3, 3, 104, 104, 8); ctx.strokeStyle = '#172635'; ctx.lineWidth = 11; ctx.stroke();
  ctx.strokeStyle = '#fff6d6'; ctx.lineWidth = 5; ctx.stroke();
}

