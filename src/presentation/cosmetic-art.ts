import {drawColorExitGateMarkers} from './color-exit-renderer.ts';
import {drawReservedEntryMarkers} from './board-entry-markers.ts';
import type {CargoStyleId,ForkliftId,ThemeId} from '../application/profile.ts';
import type {Rect} from './layout.ts';
import {cargoBox,forklift,roundedPath} from './assets.ts';
import {drawThemedBoard} from './board-theme.ts';
import {boardGeometry} from './board-geometry.ts';
import {drawStaticPreviewBackground,validArtRect as validRect} from './static-art-draw.ts';

type Context=CanvasRenderingContext2D;
export interface CosmeticPreviewOptions {category?:'theme'|'cargo'|'forklift';theme?:ThemeId;cargoStyle?:CargoStyleId;forklift?:ForkliftId;cargoOutline?:boolean;}
/** Compatibility hooks accept only one of the authored preview aspect families. */
export function drawHarborBackground(ctx:Context,rect:Rect):void {drawStaticPreviewBackground(ctx,rect,'harbor');}
export function drawLogisticsBackground(ctx:Context,rect:Rect,theme:string):boolean {
 if(theme==='day'||theme==='night'||theme==='harbor')return false;
 return drawStaticPreviewBackground(ctx,rect,theme as ThemeId);
}

/** One clear product subject, drawn through the same helpers as real cargo and vehicles. */
export function drawCosmeticPreview(ctx: Context, rect: Rect, options: CosmeticPreviewOptions = {}): void {
  if (!validRect(rect)) return;
  ctx.save(); ctx.beginPath(); ctx.rect(rect.x, rect.y, rect.w, rect.h); ctx.clip();
  const theme = options.theme ?? 'day', category = options.category ?? 'cargo';
  drawStaticPreviewBackground(ctx,rect,theme);
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

/** Static 9 × 9 shop diorama. Geometry, material images, cargo and vehicle art are shared with play. */
export function drawCosmeticSetPreview(ctx:Context,rect:Rect,options:CosmeticPreviewOptions):void {
 if(!validRect(rect))return;
 paintCosmeticSetPreview(ctx,rect,options);
}
function paintCosmeticSetPreview(ctx:Context,rect:Rect,options:CosmeticPreviewOptions):void {
 ctx.save();ctx.lineCap='round';ctx.lineJoin='round';ctx.setLineDash([]);ctx.beginPath();ctx.rect(rect.x,rect.y,rect.w,rect.h);ctx.clip();
 const theme=options.theme??'day';
 drawStaticPreviewBackground(ctx,rect,theme);
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
