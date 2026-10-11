import type {ThemeId} from '../application/profile.ts';
import {drawHarborBackground,drawLogisticsBackground} from './cosmetic-art.ts';
import {L} from './layout.ts';
import type {Rect} from './layout.ts';

/** Extend scenery only. The original composition, previews and classic racks remain untouched. */
export function drawScenerySides(ctx:CanvasRenderingContext2D,theme:ThemeId,bounds?:Rect):void {
 if(theme==='day'||theme==='night'||!bounds||![bounds.x,bounds.y,bounds.w,bounds.h,bounds.x+bounds.w].every(Number.isFinite)||bounds.w<=0||bounds.h<=0||bounds.x>0||bounds.x+bounds.w<L.width)return;
 const scene={x:0,y:0,w:L.width,h:L.height};
 const paint=()=>{if(theme==='harbor')drawHarborBackground(ctx,scene);else drawLogisticsBackground(ctx,scene,theme);};
 const left=-bounds.x,right=bounds.x+bounds.w-L.width;
 for(const side of ['left','right'] as const){
  const width=side==='left'?left:right;if(width<=0)continue;
  // One bounded draw per side, even for an extremely short/wide resized window.
  // Ordinary margins use an unscaled reflection; only a margin wider than a
  // complete scene expands that outside copy. No central pixels enter this path.
  const stretch=Math.max(1,width/L.width);
  ctx.save();ctx.beginPath();ctx.rect(side==='left'?-width:L.width,0,width,L.height);ctx.clip();
  if(side==='right')ctx.translate(L.width*(1+stretch),0);
  ctx.scale(-stretch,1);paint();ctx.restore();
 }
}
