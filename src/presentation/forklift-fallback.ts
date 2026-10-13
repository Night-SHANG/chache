// v112 (dd847c3) complete vehicles, used only when a decoded sprite is missing.
import type {ForkliftId} from '../application/profile.ts';
import {roundedPath,gradient,artRect,artLine,artPolygon,artDot} from './assets.ts';
import {drawThemedForkliftBody} from './themed-forklift-art.ts';
import {drawStructuralForkliftBody} from './structural-forklift-art.ts';
type Context=CanvasRenderingContext2D;

export function drawForkliftFallback(ctx: Context, x: number, y: number, size: number, angle: number, paint: ForkliftId = 'yellow'): void {
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

