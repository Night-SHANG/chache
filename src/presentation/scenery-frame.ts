import type {ThemeId} from '../application/profile.ts';
import {drawHarborBackground,drawLogisticsBackground} from './cosmetic-art.ts';
import {L} from './layout.ts';
import type {Rect} from './layout.ts';

/** Original classic rack geometry. Shared with its unchanged drawing routine. */
export const CLASSIC_RACKS=Object.freeze({origins:[-56,963] as const,bodyWidth:185,shelfOffset:-1,shelfWidth:184});
const left=Math.min(...CLASSIC_RACKS.origins)+CLASSIC_RACKS.shelfOffset;
const right=Math.max(...CLASSIC_RACKS.origins)+CLASSIC_RACKS.bodyWidth;
/** [-57,1148], derived from actual classic art, not the window's width. */
export const CLASSIC_SCENERY_FRAME:Readonly<Rect>=Object.freeze({x:left,y:0,w:right-left,h:L.height});

/** Draw one original theme in the classic finite frame; never paint the outside. */
export function drawThemedSceneryFrame(ctx:CanvasRenderingContext2D,theme:ThemeId,viewport?:Rect):boolean {
 if(theme==='day'||theme==='night')return false;
 ctx.save();
 // Respect the existing usable area, especially WeChat left/right safe insets.
 if(viewport&&[viewport.x,viewport.y,viewport.w,viewport.h,viewport.x+viewport.w].every(Number.isFinite)&&viewport.w>0&&viewport.h>0&&viewport.x<=0&&viewport.x+viewport.w>=L.width){
  ctx.beginPath();ctx.rect(viewport.x,0,viewport.w,L.height);ctx.clip();
 }
 ctx.translate(CLASSIC_SCENERY_FRAME.x,0);ctx.scale(CLASSIC_SCENERY_FRAME.w/L.width,1);
 // Keep the helper rect at its original size: its rect.w controls BOTH axes.
 // The outer transform alone changes x, preserving every vertical landmark.
 const rect={x:0,y:0,w:L.width,h:L.height};
 const painted=theme==='harbor'?(drawHarborBackground(ctx,rect),true):drawLogisticsBackground(ctx,rect,theme);
 ctx.restore();return painted;
}
