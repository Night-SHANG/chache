import type {ItemId} from '../application/account-types.ts';
import {STATIC_ART_TOOLS} from './static-art-manifest.ts';
import {drawStaticArtSprite} from './static-art-draw.ts';

/** Full equipment silhouettes are authored once; the literal 90° is part of the source image. */
export function drawToolIcon(ctx:CanvasRenderingContext2D,item:ItemId,x:number,y:number,size:number):void {
 drawStaticArtSprite(ctx,STATIC_ART_TOOLS[item==='wildcard'?'repaint':item],{x,y,w:size,h:size});
}
export function drawToolboxIcon(ctx:CanvasRenderingContext2D,x:number,y:number,size:number):void {
 drawStaticArtSprite(ctx,STATIC_ART_TOOLS.toolbox,{x,y,w:size,h:size});
}
