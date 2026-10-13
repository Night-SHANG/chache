import type {Point} from '../domain/types.ts';
import {L,type Rect} from '../presentation/layout.ts';

/** Native window and insets are physical pixels; never CSS safe-area values. */
export interface NativeHostState {
 active:boolean;
 owner:boolean;
 widthPx:number;
 heightPx:number;
 insetsPx:{top:number;right:number;bottom:number;left:number};
}
export interface AndroidViewport {safeRect:Rect;scale:number;origin:Point;overlay:Rect;content:Rect}
/** The client-space transform is shared by Canvas rendering and its exact inverse. */
export function computeAndroidViewport(canvasRect:Rect,state:NativeHostState):AndroidViewport {
 if(!canvasRect||![canvasRect.x,canvasRect.y,canvasRect.w,canvasRect.h].every(Number.isFinite)||canvasRect.w<=0||canvasRect.h<=0)throw Error('Invalid Android canvas viewport dimensions');
 if(!state||typeof state.active!=='boolean'||typeof state.owner!=='boolean'||!Number.isFinite(state.widthPx)||!Number.isFinite(state.heightPx)||state.widthPx<=0||state.heightPx<=0)throw Error('Invalid Android native viewport dimensions');
 const inset=state.insetsPx;
 if(!inset||![inset.top,inset.right,inset.bottom,inset.left].every(value=>Number.isFinite(value)&&value>=0)||inset.left+inset.right>=state.widthPx||inset.top+inset.bottom>=state.heightPx)throw Error('Invalid Android viewport insets');
 const xRatio=canvasRect.w/state.widthPx,yRatio=canvasRect.h/state.heightPx;
 const safeRect={x:canvasRect.x+inset.left*xRatio,y:canvasRect.y+inset.top*yRatio,w:(state.widthPx-inset.left-inset.right)*xRatio,h:(state.heightPx-inset.top-inset.bottom)*yRatio};
 const scale=Math.min(safeRect.w/L.width,safeRect.h/L.height);
 const origin={x:safeRect.x+Math.max(0,safeRect.w-L.width*scale)/2,y:safeRect.y+Math.max(0,safeRect.h-L.height*scale)/2};
 const content={x:(safeRect.x-origin.x)/scale,y:(safeRect.y-origin.y)/scale,w:safeRect.w/scale,h:safeRect.h/scale};
 const overlay={x:(canvasRect.x-origin.x)/scale,y:(canvasRect.y-origin.y)/scale,w:canvasRect.w/scale,h:canvasRect.h/scale};
 if(![safeRect.x,safeRect.y,safeRect.w,safeRect.h,scale,origin.x,origin.y,overlay.x,overlay.y,overlay.w,overlay.h,content.x,content.y,content.w,content.h].every(Number.isFinite)||scale<=0)throw Error('Unrepresentable Android viewport dimensions');
 return {safeRect,scale,origin,overlay,content};
}
