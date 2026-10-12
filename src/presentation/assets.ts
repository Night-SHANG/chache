import type { CargoId, CellTrait } from '../domain/types.ts';
import type { CargoStyleId, ForkliftId } from '../application/profile.ts';
import type { Rect } from './layout.ts';
import { CARGO_ATLAS, drawCargoAtlas } from './cargo-atlas.ts';
import {STATIC_ART_CARGO,STATIC_ART_FORKLIFTS} from './static-art-manifest.ts';
import {drawStaticArtSprite} from './static-art-draw.ts';

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
  ctx.save(); ctx.globalAlpha *= alpha; ctx.translate(x, y); ctx.scale(size / 110, size / 110);
  const waste=trait?.kind==='waste',classic=style==='classic'||style==='outline';
  if(waste){
    drawStaticArtSprite(ctx,STATIC_ART_CARGO.waste);
    text(ctx,'废弃箱',54,87,20,'#f2f0df','center',900);
  }else if(classic)drawStaticArtSprite(ctx,STATIC_ART_CARGO[cargo]);
  else if(CARGO_ATLAS.styles.includes(style)){
    // Existing approved material bodies are unchanged. Semantic symbols stay live above them.
    roundedPath(ctx,6,13,103,97,10);ctx.fillStyle='rgba(9,14,16,.36)';ctx.fill();
    drawCargoAtlas(ctx,cargo,style);ctx.strokeStyle=PALETTE[cargo].ink;ctx.lineWidth=3;
    if(cargo==='cargo.chem')hazard(ctx,{x:16,y:91,w:64,h:5});
    if(cargo==='cargo.cold'){ctx.strokeStyle='rgba(213,251,255,.7)';ctx.beginPath();ctx.moveTo(19,11);ctx.lineTo(86,11);ctx.stroke();}
    icon(ctx,cargo,48,60,54,cargo==='cargo.chem'?'#fff2ac':'#fff4da',PALETTE[cargo].ink);
  }
  if(trait&&!waste)drawTraitBadge(ctx,trait,largeRushCountdown);
  // The high-contrast option is always the last artwork layer, including over dynamic badges.
  if(style==='outline'||outlineOverride)drawStaticArtSprite(ctx,STATIC_ART_CARGO.outline);
  ctx.restore();
}

/** Small static material primitives, shared by crate, vehicle and scenery drawings. */
export function artRect(c: Context,x:number,y:number,w:number,h:number,fill:string|CanvasGradient,r=0,stroke?:string,lw=2):void {roundedPath(c,x,y,w,h,r);c.fillStyle=fill;c.fill();if(stroke){c.strokeStyle=stroke;c.lineWidth=lw;c.stroke();}}
export function artLine(c:Context,p:readonly (readonly number[])[],color:string,width=2):void {c.strokeStyle=color;c.lineWidth=width;c.beginPath();p.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.stroke();}
export function artPolygon(c:Context,p:readonly (readonly number[])[],fill:string|CanvasGradient,stroke?:string,lw=2):void {c.beginPath();p.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.closePath();c.fillStyle=fill;c.fill();if(stroke){c.strokeStyle=stroke;c.lineWidth=lw;c.stroke();}}
export function artDot(c:Context,x:number,y:number,r:number,fill:string|CanvasGradient,stroke?:string,lw=1.3):void {c.beginPath();c.arc(x,y,r,0,Math.PI*2);c.fillStyle=fill;c.fill();if(stroke){c.strokeStyle=stroke;c.lineWidth=lw;c.stroke();}}

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

/** Complete current vehicle, including shadow and forks; transport/load anchors remain unchanged. */
export function forklift(ctx:Context,x:number,y:number,size:number,angle:number,paint:ForkliftId='yellow'):void {
 ctx.save();ctx.translate(x,y);ctx.rotate(angle);ctx.scale(size/110,size/110);
 drawStaticArtSprite(ctx,STATIC_ART_FORKLIFTS[paint]);ctx.restore();
}

export function arrow(ctx: Context, x: number, y: number, size: number, angle: number, color: string): void {
  ctx.save(); ctx.translate(x, y); ctx.rotate(angle); ctx.fillStyle = color;
  ctx.beginPath(); ctx.moveTo(size / 2, 0); ctx.lineTo(-size / 3, -size / 3); ctx.lineTo(-size / 6, 0); ctx.lineTo(-size / 3, size / 3); ctx.closePath(); ctx.fill(); ctx.restore();
}
