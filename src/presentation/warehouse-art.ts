import type {Rect} from './layout.ts';
import type {ViewState} from './view-types.ts';
import {STATIC_ART_SCENES} from './static-art-manifest.ts';
import {drawStaticArtSprite,validArtRect} from './static-art-draw.ts';

/** One finite image blit preserves the classic racks' transparent exterior gaps. */
export function drawWarehouse(ctx:CanvasRenderingContext2D,view:ViewState,backgroundBounds?:Rect):void {
 const theme=view.profile?.cosmetics.theme??'day';
 ctx.save();
 // Only nonclassic architecture followed the usable-width clip in the original painter.
 if(theme!=='day'&&theme!=='night'&&backgroundBounds&&validArtRect(backgroundBounds)&&Number.isFinite(backgroundBounds.x+backgroundBounds.w)&&backgroundBounds.x<=0&&backgroundBounds.x+backgroundBounds.w>=1080){
  ctx.beginPath();ctx.rect(backgroundBounds.x,0,backgroundBounds.w,1920);ctx.clip();
 }
 drawStaticArtSprite(ctx,STATIC_ART_SCENES[theme]);ctx.restore();
}
