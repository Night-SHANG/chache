import type {Rect} from '../layout.ts';
import type {ViewState} from '../view-types.ts';
import {STATIC_ART_SCENES} from '../static-art-manifest.ts';
import {drawStaticArtSprite,validArtRect} from '../static-art-draw.ts';
import {getStaticArtImage} from '../static-art-resources.ts';
import {drawWarehouseFallback} from '../warehouse-fallback.ts';

/** Warm images go directly to the main canvas. Crop source pixels in the same
 * proportion as the finite destination; no scratch, full-frame copy or mask. */
export function drawWarehouse(ctx:CanvasRenderingContext2D,view:ViewState,backgroundBounds?:Rect):void {
 const theme=view.profile?.cosmetics.theme??'day',sprite=STATIC_ART_SCENES[theme];
 const bounded=theme!=='day'&&theme!=='night'&&backgroundBounds&&validArtRect(backgroundBounds)&&Number.isFinite(backgroundBounds.x+backgroundBounds.w)&&backgroundBounds.x<=0&&backgroundBounds.x+backgroundBounds.w>=1080;
 if(bounded&&sprite){
  const image=getStaticArtImage(sprite.resource);
  if(image){
   const s=sprite.source,d=sprite.destination,x=Math.max(d.x,backgroundBounds.x),right=Math.min(d.x+d.w,backgroundBounds.x+backgroundBounds.w),y=Math.max(0,d.y),bottom=Math.min(1920,d.y+d.h);
   if(right>x&&bottom>y)ctx.drawImage(image,s.x+(x-d.x)*s.w/d.w,s.y+(y-d.y)*s.h/d.h,(right-x)*s.w/d.w,(bottom-y)*s.h/d.h,x,y,right-x,bottom-y);
   return;
  }
 }
 ctx.save();if(!drawStaticArtSprite(ctx,sprite))drawWarehouseFallback(ctx,view,backgroundBounds);ctx.restore();
}
