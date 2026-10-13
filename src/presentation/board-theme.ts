import type { ThemeId } from '../application/profile.ts';
import type { BoardGeometry } from './board-geometry.ts';
import {gradient,artLine,rivet} from './assets.ts';
import {drawBoardFrameFallback,drawBoardMaterialFallback} from './board-fallback.ts';
import type {BoardTheme} from './board-fallback.ts';
import {STATIC_ART_FRAMES,STATIC_ART_FRAME_ORIGIN} from './static-art-manifest.ts';
import {drawStaticArtSprite} from './static-art-draw.ts';
import {getStaticArtImage} from './static-art-resources.ts';
import { drawBoardMaterialTile, drawBoardMaterialVariant } from './board-material-atlas.ts';
import { drawSceneFrame } from './scene-frame-atlas.ts';

type Context = CanvasRenderingContext2D;
/** Fixed quiet colors belong to scenery, never to semantic cargo, doors or warnings. */
const THEMES: Readonly<Record<ThemeId, BoardTheme>> = Object.freeze({
 day: { material: 'concrete', top: '#a19884', bottom: '#8c826f', seam: '#453e34', frame: '#56616a', rim: '#829098', trim: '#d4a03f', edge: '#26313b' },
 night: { material: 'concrete', top: '#5b6776', bottom: '#445264', seam: '#293342', frame: '#364657', rim: '#728496', trim: '#8995a0', edge: '#243343' },
 harbor: { material: 'steel', top: '#586c7d', bottom: '#455b70', seam: '#2e4154', frame: '#3b5665', rim: '#879997', trim: '#85836b', edge: '#294451' },
 cold_chain: { material: 'frost', top: '#7e989e', bottom: '#6f8890', seam: '#596f7b', frame: '#708993', rim: '#bbcbc8', trim: '#a5b9b8', edge: '#405e6a' },
 rail_freight: { material: 'planks', top: '#92826b', bottom: '#7d6f5e', seam: '#494d46', frame: '#545d57', rim: '#979986', trim: '#9b987a', edge: '#394944' },
 express_sorting: { material: 'belt', top: '#748881', bottom: '#617870', seam: '#354c4a', frame: '#455c61', rim: '#8fa599', trim: '#93a491', edge: '#33494d' },
 toy_workshop: { material: 'plastic', top: '#a6a389', bottom: '#939179', seam: '#6b6f61', frame: '#778376', rim: '#c0c0a0', trim: '#aeb196', edge: '#556b62' },
 paper_warehouse: { material: 'paper', top: '#b0a289', bottom: '#9d8f78', seam: '#726857', frame: '#8e826c', rim: '#c1b196', trim: '#b5a88c', edge: '#6d6659' },
 space_cargo: { material: 'alloy', top: '#778894', bottom: '#637683', seam: '#3a515f', frame: '#465d70', rim: '#a3b5b7', trim: '#9bafae', edge: '#2f495a' },
 steam_foundry: { material: 'brass', top: '#97866c', bottom: '#80725b', seam: '#564b3f', frame: '#715b43', rim: '#b9a078', trim: '#a38a61', edge: '#554733' },
 neon_depot: { material: 'circuit', top: '#536973', bottom: '#455b68', seam: '#263d4b', frame: '#2e4354', rim: '#698e99', trim: '#5b94a0', edge: '#223642' },
 lava_forge: { material: 'basalt', top: '#716867', bottom: '#5c5354', seam: '#3b3335', frame: '#514343', rim: '#917362', trim: '#956c54', edge: '#403539' },
 ocean_vault: { material: 'ocean', top: '#698b86', bottom: '#567572', seam: '#355452', frame: '#3b5b5f', rim: '#91aaa0', trim: '#939578', edge: '#2e4c50' },
 royal_store: { material: 'marble', top: '#a09b8e', bottom: '#8c8579', seam: '#635c53', frame: '#6a5f51', rim: '#b8a67e', trim: '#a6936c', edge: '#564c42' },
 field_station: { material: 'tread', top: '#838872', bottom: '#6d7562', seam: '#434e43', frame: '#4b584c', rim: '#a3aa8b', trim: '#94997a', edge: '#36453c' },
 forest_depot: { material: 'planks', top: '#79836b', bottom: '#636e59', seam: '#3d493a', frame: '#6c5234', rim: '#b39a68', trim: '#789255', edge: '#3a482e' },
 ice_vault: { material: 'frost', top: '#758fa5', bottom: '#617d94', seam: '#3e5b71', frame: '#31698b', rim: '#a1cbd6', trim: '#75b5cd', edge: '#284b6e' },
});

/** Presentation-only material contrast. Source sprites, cargo colors and gameplay overlays remain untouched. */
const TEXTURE_OPACITY: Readonly<Record<ThemeId, number>> = Object.freeze({
 day: .28, night: .43, harbor: .29, cold_chain: .36, rail_freight: .38,
 express_sorting: .42, toy_workshop: .30, paper_warehouse: .29, space_cargo: .24,
 steam_foundry: .29, neon_depot: .33, lava_forge: .32, ocean_vault: .29, royal_store: .36, field_station: .28,
 forest_depot: .34, ice_vault: .30,
});

/** Geometry is read-only. Entry reservations, door colors and gameplay feedback draw later. */
export function drawThemedBoard(ctx: Context, geometry: Readonly<BoardGeometry>, theme: ThemeId = 'day'): void {
 const { x, y, size, cell, dimension } = geometry, skin = THEMES[theme] ?? THEMES.day;
 ctx.save(); ctx.lineCap = 'butt'; ctx.lineJoin = 'miter'; ctx.setLineDash([]);
 const frameReady=drawFrame(ctx,x,y,size,theme,skin);
 ctx.fillStyle = skin.seam; ctx.fillRect(x, y, size, size);
 for (let row = 0; row < dimension; row++) for (let col = 0; col < dimension; col++) {
  const px = x + col * cell, py = y + row * cell, tone = (row * 3 + col * 5) % 6;
  const legacy = theme === 'day' || theme === 'night', night = theme === 'night';
  const top = legacy ? (night ? ['#536071', '#5b6776', '#4d5b6c', '#606c79', '#526272', '#586676'] : ['#958d7b', '#a19884', '#928976', '#a69c86', '#9b927d', '#a09680'])[tone] : skin.top;
  const bottom = legacy ? (night ? ['#3c485b', '#445264', '#39465a', '#485769', '#3e4d5e', '#425064'] : ['#817969', '#8c826f', '#807767', '#908571', '#867e6b', '#8b806c'])[tone] : skin.bottom;
  ctx.fillStyle = gradient(ctx, px, py, cell, top, bottom); ctx.fillRect(px + 2, py + 2, cell - 4, cell - 4);
  ctx.save(); ctx.globalAlpha *= TEXTURE_OPACITY[theme] ?? .28;
  const raster = legacy ? drawBoardMaterialTile(ctx, theme, px + 2, py + 2, cell - 4) : drawBoardMaterialVariant(ctx, theme, px + 2, py + 2, cell - 4, row, col); ctx.restore();
  if (!raster && !legacy) { ctx.fillStyle = `rgba(12,26,31,${tone * .009})`; ctx.fillRect(px + 2, py + 2, cell - 4, cell - 4); }
  ctx.fillStyle = 'rgba(248,232,196,.21)'; ctx.fillRect(px + 3, py + 2, cell - 6, 2);
  ctx.fillStyle = 'rgba(35,33,29,.15)'; ctx.fillRect(px + cell - 4, py + 4, 2, cell - 7); ctx.fillRect(px + 3, py + cell - 4, cell - 6, 2);
  if (raster) continue;
  if (legacy) {
   if ((row + col * 2) % 4 === 0) artLine(ctx, [[px + 17, py + 83], [px + 37, py + 72], [px + 49, py + 75]], 'rgba(49,43,36,.12)', 2);
   ctx.fillStyle = 'rgba(255,242,213,.13)'; ctx.fillRect(px + 27 + tone * 5, py + 32 + tone * 3, 2, 2);
  } else {
   ctx.save(); ctx.beginPath(); ctx.rect(px + 4, py + 4, cell - 8, cell - 8); ctx.clip();
   ctx.translate(px, py); ctx.scale(cell / 120, cell / 120); drawBoardMaterialFallback(ctx, skin.material, tone); ctx.restore();
  }
 }
 ctx.fillStyle = gradient(ctx, x, y, 24, 'rgba(32,30,26,.35)', 'rgba(32,30,26,0)'); ctx.fillRect(x, y, size, 24);
 ctx.fillStyle = gradient(ctx, x, y + size - 18, 18, 'rgba(32,30,26,0)', 'rgba(32,30,26,.25)'); ctx.fillRect(x, y + size - 18, size, 18);
 if(!frameReady&&(theme==='day'||theme==='night'))for(const row of [0,1])for(const col of [0,1])rivet(ctx,x-21+col*(size+42),y-19+row*(size+40),5);
 ctx.restore();
}

/** Day/night strips preserve the exact original fixed-size border and corner rivets. */
function drawFrame(ctx:Context,x:number,y:number,size:number,theme:ThemeId,skin:BoardTheme):boolean {
 if(theme!=='day'&&theme!=='night'){
  if(drawSceneFrame(ctx,theme,{x:x-26,y:y-24,w:size+52,h:size+54}))return true;
  drawBoardFrameFallback(ctx,x,y,size,theme,skin);return false;
 }
 if(!getStaticArtImage(STATIC_ART_FRAMES[theme][0].resource)){drawBoardFrameFallback(ctx,x,y,size,theme,skin);return false;}
 ctx.save();ctx.translate(x-STATIC_ART_FRAME_ORIGIN.x,y-STATIC_ART_FRAME_ORIGIN.y);
 for(const sprite of STATIC_ART_FRAMES[theme]){
  if(!sprite.rotated90){drawStaticArtSprite(ctx,sprite);continue;}
  const image=getStaticArtImage(sprite.resource);if(!image)continue;
  const s=sprite.source,d=sprite.destination;
  // Side strips were packed clockwise. Undo that quarter-turn without allocating a surface.
  ctx.save();ctx.translate(d.x,d.y+d.h);ctx.rotate(-Math.PI/2);
  ctx.drawImage(image,s.x,s.y,s.w,s.h,0,0,d.h,d.w);ctx.restore();
 }
 ctx.restore();return true;
}
