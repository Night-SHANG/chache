import type {ThemeId} from '../application/profile.ts';
import type {Rect} from './layout.ts';
import {STATIC_ART_PREVIEWS} from './static-art-manifest.ts';
import type {StaticArtSprite} from './static-art-manifest.ts';
import {getStaticArtImage} from './static-art-resources.ts';

export type StaticPreviewShape='card'|'item'|'set'|'classic';
const SHAPES:Readonly<Record<StaticPreviewShape,readonly [number,number]>>={card:[360,246],item:[816,232],set:[816,840],classic:[816,780]};
export const validArtRect=(r:Readonly<Rect>):boolean=>[r.x,r.y,r.w,r.h].every(Number.isFinite)&&r.w>0&&r.h>0;

/** Exact aspect families have distinct authored architecture; never stretch a scene into a preview. */
export function staticPreviewShape(rect:Readonly<Rect>):StaticPreviewShape|null {
 if(!validArtRect(rect))return null;
 for(const shape of Object.keys(SHAPES) as StaticPreviewShape[]){const [w,h]=SHAPES[shape];if(Math.abs(rect.w*h-rect.h*w)<1e-6)return shape;}
 return null;
}

/** Draw ready decoded pixels only. Loading and failures belong to the shared readiness service. */
export function drawStaticArtSprite(ctx:CanvasRenderingContext2D,sprite:StaticArtSprite|undefined,destination?:Readonly<Rect>):boolean {
 if(!sprite)return false;
 const image=getStaticArtImage(sprite.resource),s=sprite.source,d=destination??sprite.destination;
 if(!image||!validArtRect(d))return false;
 ctx.drawImage(image,s.x,s.y,s.w,s.h,d.x,d.y,d.w,d.h);return true;
}

export function drawStaticPreviewBackground(ctx:CanvasRenderingContext2D,rect:Readonly<Rect>,theme:ThemeId):boolean {
 const shape=staticPreviewShape(rect);
 return shape?drawStaticArtSprite(ctx,STATIC_ART_PREVIEWS[theme]?.[shape],rect):false;
}
