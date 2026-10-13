import { drawColorExitGateMarkers } from './color-exit-renderer.ts';
import { drawReservedEntryMarkers } from './board-entry-markers.ts';
import type { CargoStyleId, ForkliftId, ThemeId } from '../application/profile.ts';
import type { Rect } from './layout.ts';
import { cargoBox, forklift, gradient, roundedPath, artRect, artLine, artPolygon, artDot } from './assets.ts';
import { drawThemedBoard } from './board-theme.ts';
import { drawSceneFrame } from './scene-frame-atlas.ts';
import { boardGeometry } from './board-geometry.ts';
import { drawReferenceBackground } from './reference-scenery-art.ts';

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

/** Static logistics architecture. Unsupported themes and invalid bounds have no side effects. */
export function drawLogisticsBackground(ctx: Context, rect: Rect, theme: string): boolean {
  if (theme === 'forest_depot' || theme === 'ice_vault') {
    if (!validRect(rect)) return false;
    ctx.save(); ctx.beginPath(); ctx.rect(rect.x, rect.y, rect.w, rect.h); ctx.clip();
    ctx.translate(rect.x, rect.y); ctx.scale(rect.w / 1080, rect.w / 1080);
    const h = rect.h * 1080 / rect.w, forest = theme === 'forest_depot';
    ctx.fillStyle = gradient(ctx, 0, 0, h, forest ? '#263c2e' : '#233e53', forest ? '#101e1a' : '#101d2d'); ctx.fillRect(0, 0, 1080, h);
    // Actual generated timber/vine or crystalline architecture stays at the
    // outside edge. The open center is quiet behind HUD and gameplay layers.
    ctx.save(); ctx.globalAlpha *= .56;
    if (!drawSceneFrame(ctx, theme, { x: 10, y: 10, w: 1060, h: Math.max(1, h - 20) }, 60)) {
      ctx.fillStyle = forest ? '#5b5839' : '#3f6b83';
      ctx.fillRect(10, 10, 27, Math.max(1, h - 20)); ctx.fillRect(1043, 10, 27, Math.max(1, h - 20));
      ctx.fillRect(10, 10, 1060, Math.min(24, h)); ctx.fillRect(10, Math.max(10, h - 34), 1060, Math.min(24, h));
    }
    ctx.restore(); ctx.restore(); return true;
  }
  if (drawReferenceBackground(ctx, rect, theme)) return true;
  if (!['cold_chain', 'rail_freight', 'express_sorting', 'toy_workshop', 'paper_warehouse', 'space_cargo'].includes(theme) || !validRect(rect)) return false;
  ctx.save(); ctx.beginPath(); ctx.rect(rect.x, rect.y, rect.w, rect.h); ctx.clip();
  ctx.translate(rect.x, rect.y); ctx.scale(rect.w / 1080, rect.w / 1080);
  const h = rect.h * 1080 / rect.w;
  if (theme === 'cold_chain') drawColdChain(ctx, h);
  else if (theme === 'rail_freight') drawRailFreight(ctx, h);
  else if (theme === 'express_sorting') drawExpressSorting(ctx, h);
  else drawPlayfulBackground(ctx, h, theme);
  ctx.restore(); return true;
}

function drawColdChain(ctx: Context, h: number): void {
  ctx.fillStyle = gradient(ctx, 0, 0, h, '#344b55', '#182d38'); ctx.fillRect(0, 0, 1080, h);
  // Broad insulated wall panels remain muted behind the separate board layer.
  const floor = h * .78;
  for (let col = 0; col < 10; col++) {
    const x = 15 + col * 107;
    ctx.fillStyle = gradient(ctx, x, 12, floor, '#3c535b', '#263e49'); ctx.fillRect(x, 12, 100, Math.max(1, floor - 12));
    ctx.fillStyle = '#203941'; ctx.fillRect(x, 12, 3, Math.max(1, floor - 12));
    ctx.fillStyle = '#4b6267'; ctx.fillRect(x + 4, 13, 2, Math.max(1, floor - 13));
  }
  ctx.fillStyle = '#152c36'; ctx.fillRect(0, floor, 1080, h - floor);
  ctx.fillStyle = '#59706d'; ctx.fillRect(0, floor, 1080, 4);
  const doorTop = Math.min(h * .22, 240), doorHeight = Math.max(20, floor - doorTop);
  for (const x of [25, 909]) {
    roundedPath(ctx, x, doorTop, 146, doorHeight, 7); ctx.fillStyle = '#182f38'; ctx.fill();
    ctx.strokeStyle = '#526b6d'; ctx.lineWidth = 6; ctx.stroke();
    roundedPath(ctx, x + 12, doorTop + 12, 122, Math.max(5, doorHeight - 15), 3); ctx.fillStyle = gradient(ctx, 0, doorTop, doorHeight, '#47616a', '#2c4651'); ctx.fill();
    ctx.strokeStyle = '#213d47'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x + 73, doorTop + 15); ctx.lineTo(x + 73, floor - 5); ctx.stroke();
    ctx.fillStyle = '#8b9e99'; roundedPath(ctx, x + 108, doorTop + doorHeight * .55, 5, 24, 2); ctx.fill();
  }
  const fanY = Math.min(26, h * .06), fanH = Math.min(90, h * .19);
  roundedPath(ctx, 398, fanY + 5, 284, fanH, 8); ctx.fillStyle = '#1a333d'; ctx.fill();
  roundedPath(ctx, 400, fanY, 280, fanH, 7); ctx.fillStyle = gradient(ctx, 0, fanY, fanH, '#8caaa9', '#57787d'); ctx.fill();
  ctx.strokeStyle = '#324f59'; ctx.lineWidth = 3; ctx.stroke();
  for (const x of [448, 540, 632]) {
    const y = fanY + fanH * .45, radius = Math.min(26, fanH * .3);
    ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.fillStyle = '#486a73'; ctx.fill(); ctx.strokeStyle = '#b0c2b6'; ctx.lineWidth = 3; ctx.stroke();
    ctx.strokeStyle = '#8ea8a1'; ctx.lineWidth = 4;
    for (let spoke = 0; spoke < 4; spoke++) { const angle = Math.PI * spoke / 2 + .5; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(angle) * radius * .78, y + Math.sin(angle) * radius * .78); ctx.stroke(); }
    ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fillStyle = '#bac9ba'; ctx.fill();
  }
  ctx.fillStyle = '#35535e'; for (let i = 0; i < 9; i++) ctx.fillRect(423 + i * 27, fanY + fanH - 10, 17, 3);
}

function drawRailFreight(ctx: Context, h: number): void {
  ctx.fillStyle = gradient(ctx, 0, 0, h, '#304650', '#132632'); ctx.fillRect(0, 0, 1080, h);
  const horizon = Math.min(h * .45, 470), trainH = Math.min(100, h * .22);
  // Distant freight wagons form one low-contrast silhouette, outside the gameplay grid.
  for (const x of [200, 410, 620]) {
    roundedPath(ctx, x, horizon - trainH, 192, trainH, 4); ctx.fillStyle = gradient(ctx, 0, horizon - trainH, trainH, '#3b5360', '#293f4b'); ctx.fill();
    ctx.strokeStyle = '#1b3341'; ctx.lineWidth = 3; ctx.stroke();
    ctx.strokeStyle = '#243d4a'; ctx.lineWidth = 4;
    for (let rib = 0; rib < 9; rib++) { ctx.beginPath(); ctx.moveTo(x + 12 + rib * 21, horizon - trainH + 8); ctx.lineTo(x + 12 + rib * 21, horizon - 8); ctx.stroke(); }
    ctx.fillStyle = '#142d39'; ctx.fillRect(x + 18, horizon, 26, 9); ctx.fillRect(x + 150, horizon, 26, 9);
  }
  ctx.fillStyle = '#5c6255'; ctx.fillRect(0, horizon + 12, 1080, 7);
  ctx.fillStyle = '#192e3a'; ctx.fillRect(0, horizon + 19, 1080, 13);
  // Rail perspective is confined to the two outside strips; it never suggests board occupancy.
  for (const side of [-1, 1]) {
    const center = side < 0 ? 65 : 1015;
    ctx.strokeStyle = '#535d57'; ctx.lineWidth = 6;
    for (let row = 0; row < 17; row++) {
      const t = row / 16, y = horizon + 38 + t * Math.max(0, h - horizon - 38), half = 19 + t * 39;
      ctx.beginPath(); ctx.moveTo(center - half, y); ctx.lineTo(center + half, y); ctx.stroke();
    }
    for (const rail of [-1, 1]) {
      ctx.strokeStyle = '#182f3b'; ctx.lineWidth = 7; ctx.beginPath(); ctx.moveTo(center + rail * 12, horizon + 28); ctx.lineTo(center + rail * 36, h); ctx.stroke();
      ctx.strokeStyle = '#84918b'; ctx.lineWidth = 2.5; ctx.stroke();
    }
  }
  const crossbar = Math.min(32, h * .06);
  for (const x of [127, 927]) {
    ctx.fillStyle = '#1b3340'; ctx.fillRect(x, crossbar, 26, Math.max(1, horizon + 33 - crossbar));
    ctx.fillStyle = '#4b626b'; ctx.fillRect(x + 4, crossbar, 5, Math.max(1, horizon + 33 - crossbar));
    ctx.strokeStyle = '#455e69'; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(x + 12, crossbar + 12); ctx.lineTo(x + (x < 500 ? 120 : -100), Math.min(horizon, crossbar + 95)); ctx.stroke();
  }
  ctx.fillStyle = '#425b65'; ctx.fillRect(111, crossbar, 861, 17);
  ctx.fillStyle = '#677970'; ctx.fillRect(113, crossbar + 2, 857, 3);
}

function drawExpressSorting(ctx: Context, h: number): void {
  ctx.fillStyle = gradient(ctx, 0, 0, h, '#304953', '#172b37'); ctx.fillRect(0, 0, 1080, h);
  const top = Math.min(60, h * .12), beltTop = h * .37, beltHeight = h * .51;
  for (const x of [45, 1015]) {
    ctx.fillStyle = '#48636b'; ctx.fillRect(x, top, 17, h - top);
    ctx.fillStyle = '#617b7b'; ctx.fillRect(x, top, 3, h - top);
  }
  ctx.fillStyle = '#4e6970'; ctx.fillRect(24, top, 1032, 17); ctx.fillStyle = '#708781'; ctx.fillRect(25, top, 1030, 3);
  roundedPath(ctx, 441, top + 28, 198, Math.min(51, h * .12), 5); ctx.fillStyle = gradient(ctx, 0, top + 28, 51, '#81948b', '#526d6c'); ctx.fill();
  // Three directional chevrons read as routing signs without fake parcels or moving lights.
  ctx.strokeStyle = '#afbbb0'; ctx.lineWidth = 6;
  for (const x of [487, 540, 593]) { const y = top + 49; ctx.beginPath(); ctx.moveTo(x - 9, y - 3); ctx.lineTo(x, y + 6); ctx.lineTo(x + 9, y - 3); ctx.stroke(); }
  for (const x of [20, 930]) {
    roundedPath(ctx, x, beltTop, 130, beltHeight, 6); ctx.fillStyle = '#172f3b'; ctx.fill(); ctx.strokeStyle = '#536f76'; ctx.lineWidth = 4; ctx.stroke();
    for (let row = 0; row < 14; row++) {
      const y = beltTop + 10 + row * Math.max(1, beltHeight - 22) / 14;
      roundedPath(ctx, x + 10, y, 110, Math.min(12, beltHeight / 20), 3); ctx.fillStyle = gradient(ctx, 0, y, 12, '#79908c', '#435e66'); ctx.fill();
    }
    for (const leg of [x + 9, x + 111]) { ctx.fillStyle = '#526c72'; ctx.fillRect(leg, beltTop + beltHeight, 9, h * .08); }
  }
  // Short angled chutes stay in the margins and keep the middle visually quiet.
  for (const side of [-1, 1]) {
    const x = side < 0 ? 154 : 926, y = h * .33;
    ctx.save(); ctx.translate(x, y); ctx.rotate(side * .28);
    roundedPath(ctx, side < 0 ? -10 : -65, 0, 75, Math.min(90, h * .2), 4); ctx.fillStyle = '#2b4753'; ctx.fill(); ctx.strokeStyle = '#637d7e'; ctx.lineWidth = 3; ctx.stroke();
    ctx.strokeStyle = '#47656f'; ctx.lineWidth = 3;
    for (let row = 0; row < 4; row++) { const yy = 10 + row * Math.min(18, h * .04); ctx.beginPath(); ctx.moveTo(side < 0 ? 0 : -55, yy); ctx.lineTo(side < 0 ? 55 : 0, yy); ctx.stroke(); }
    ctx.restore();
  }
  ctx.fillStyle = '#324b53'; ctx.fillRect(0, h - 14, 1080, 14); ctx.fillStyle = '#586e68'; ctx.fillRect(0, h - 14, 1080, 3);
}

/** Border architecture leaves the separate board floor and order doors unmodified. */
function drawPlayfulBackground(c:Context,H:number,theme:string):void {
 artRect(c,0,0,1080,H,gradient(c,0,0,H,'#344b54','#192d37'));
 if(theme==='toy_workshop'){
  for(const sx of [14,950]){artRect(c,sx,22,116,H-32,'#405759',14,'#182f39',4);for(let row=0;row<14;row++)for(let col=0;col<3;col++)artDot(c,sx+24+col*32,48+row*(H-85)/14,5,'#203b43','#596f6c');}
  artRect(c,20,20,1040,36,'#7b8470',10,'#314b4d',4);artRect(c,24,23,1032,6,'#b3b294',3);
  for(const xx of [45,165,915,1035]){artDot(c,xx,37,10,'#a5a88b','#5b6e62');artDot(c,xx-2,34,4,'#c4c6a8');}
  for(const xx of [41,1010]){artRect(c,xx,85,28,H-106,'#64796d',8);for(let yy=160;yy<H;yy+=220)artLine(c,[[xx,yy],[xx+28,yy]],'#233e43',4);}
  artRect(c,0,H-24,1080,24,'#7a7055');artRect(c,0,H-24,1080,5,'#a29470');
 }else if(theme==='paper_warehouse'){
  for(const [xx,width,col] of [[9,31,'#7a7965'],[22,24,'#9b9579'],[38,15,'#b6aa8b'],[1027,15,'#b6aa8b'],[1042,24,'#9b9579'],[1062,15,'#7a7965']] as const)artRect(c,xx,26,width,H-40,col);
  artPolygon(c,[[0,18],[1080,18],[1027,59],[53,59]],'#9d9678','#384c4d',3);artLine(c,[[58,35],[1022,35]],'#c5b899',3);
  for(const xx of [21,986])for(let row=0;row<5;row++){const yy=105+row*(H-200)/5;artPolygon(c,[[xx,yy],[xx+72,yy+58],[xx,yy+116]],'#5a6b64','#263e44',2);artLine(c,[[xx+10,yy+23],[xx+50,yy+58]],'#8f937d',2);}
  artPolygon(c,[[0,H-38],[1080,H-38],[1034,H-14],[46,H-14]],'#a39676','#324747',2);artLine(c,[[0,H-9],[1080,H-9]],'#736f5d',7);
 }else{
  for(const side of [0,1]){const xx=side?936:18;artRect(c,xx,22,126,H-42,'#243e4b',9,'#536d73',4);artRect(c,xx+12,31,102,H-60,'#344f59',5);for(let i=0;i<7;i++){const yy=75+i*(H-150)/7;artRect(c,xx+24,yy,77,57,'#1c3543',5,'#546f75',2);for(let j=0;j<3;j++)artRect(c,xx+35+j*20,yy+17,10,22,'#6b8282',2);}}
  artPolygon(c,[[0,15],[1080,15],[1080,47],[1018,69],[62,69],[0,47]],'#607872','#273f49',4);artLine(c,[[63,36],[1017,36]],'#9aaca0',4);
  for(const xx of [47,1002]){artRect(c,xx,100,31,H-195,'#7a8d82',5,'#314d54',4);for(let yy=180;yy<H-100;yy+=210)artRect(c,xx-4,yy,39,15,'#3a5560',2);}
  artRect(c,0,H-24,1080,24,'#425e64');artLine(c,[[0,H-22],[1080,H-22]],'#91a29a',4);
 }
}

/** One clear product subject, drawn through the same helpers as real cargo and vehicles. */
export function drawCosmeticPreview(ctx: Context, rect: Rect, options: CosmeticPreviewOptions = {}): void {
  if (!validRect(rect)) return;
  ctx.save(); ctx.beginPath(); ctx.rect(rect.x, rect.y, rect.w, rect.h); ctx.clip();
  const theme = options.theme ?? 'day', category = options.category ?? 'cargo';
  if (theme === 'harbor') drawHarborBackground(ctx, rect);
  else if (!drawLogisticsBackground(ctx, rect, theme)) {
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
    ctx.save(); ctx.translate(252, -77); ctx.scale(.2, .2); drawThemedBoard(ctx, boardGeometry(), theme); ctx.restore();
    if (theme === 'day' || theme === 'night') {
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

/** Static 9 × 9 shop diorama. Geometry, tile cache, cargo and vehicle art are shared with play. */
export function drawCosmeticSetPreview(ctx:Context,rect:Rect,options:CosmeticPreviewOptions):void {
 if(!validRect(rect))return;
 paintCosmeticSetPreview(ctx,rect,options);
}
function paintCosmeticSetPreview(ctx:Context,rect:Rect,options:CosmeticPreviewOptions):void {
 ctx.save();ctx.lineCap='round';ctx.lineJoin='round';ctx.setLineDash([]);ctx.beginPath();ctx.rect(rect.x,rect.y,rect.w,rect.h);ctx.clip();
 const theme=options.theme??'day';
 if(theme==='harbor')drawHarborBackground(ctx,rect);
 else if(!drawLogisticsBackground(ctx,rect,theme)){ctx.fillStyle=gradient(ctx,rect.x,rect.y,rect.h,theme==='night'?'#111c35':'#243345',theme==='night'?'#080d1b':'#111b25');ctx.fillRect(rect.x,rect.y,rect.w,rect.h);}
 const scale=Math.min(rect.w/980,rect.h/984),geometry=boardGeometry({boardSize:9});
 ctx.translate(rect.x+(rect.w-980*scale)/2-50*scale,rect.y+(rect.h-984*scale)/2-480*scale);ctx.scale(scale,scale);
 drawThemedBoard(ctx,geometry,theme);
 drawReservedEntryMarkers(ctx,geometry,[geometry.entry.entry.y*geometry.dimension+geometry.entry.entry.x]);
 drawColorExitGateMarkers(ctx,geometry,theme,false,false);
 const samples=[{cell:10,cargo:'cargo.food'},{cell:11,cargo:'cargo.food'},{cell:23,cargo:'cargo.machine'},{cell:24,cargo:'cargo.machine'},{cell:37,cargo:'cargo.chem'},{cell:38,cargo:'cargo.chem'},{cell:50,cargo:'cargo.electronic'},{cell:59,cargo:'cargo.electronic'},{cell:64,cargo:'cargo.cold'},{cell:65,cargo:'cargo.cold'}] as const;
 for(const sample of samples){const x=geometry.x+(sample.cell%9)*geometry.cell+(geometry.cell-geometry.boxSize)/2,y=geometry.y+Math.floor(sample.cell/9)*geometry.cell+(geometry.cell-geometry.boxSize)/2;cargoBox(ctx,sample.cargo,x,y,geometry.boxSize,1,sample.cell===65?{kind:'rush',remaining:3}:undefined,options.cargoStyle??'classic',true,options.cargoOutline??false);}
 forklift(ctx,672,1295,120,0,options.forklift??'yellow');
 ctx.restore();
}
