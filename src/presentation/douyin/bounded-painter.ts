import type {CanvasSurface} from '../../platform/types.ts';
import type {Rect} from '../layout.ts';

/** A single temporary logical-size surface. It is never a retained frame/cache. */
export const DOUYIN_SCRATCH_WIDTH=1205;
export const DOUYIN_SCRATCH_HEIGHT=1920;
let createSurface:(()=>CanvasSurface)|undefined;
let scratch:CanvasSurface|undefined;
let scratchContext:CanvasRenderingContext2D|undefined;
let painting=false;

/** Register only AFTER the platform has created its on-screen canvas. */
export function configureDouyinRendering(factory:()=>CanvasSurface):void {
 if(painting)throw new Error('Cannot reconfigure Douyin rendering during a bounded paint');
 if(scratch&&createSurface!==factory)throw new Error('Douyin rendering already owns its one scratch surface');
 createSurface=factory;
}

/** Explicit call-site crop, not an emulated context/clip stack. Callers must use
 * their unbounded helpers inside this painter; accidental re-entry fails before
 * clearing the in-flight pixels. Main-context transforms apply to the final blit. */
export function withBoundedPainter<T>(ctx:CanvasRenderingContext2D,rect:Readonly<Rect>,paint:(context:CanvasRenderingContext2D)=>T):T|undefined {
 if(![rect.x,rect.y,rect.w,rect.h,rect.x+rect.w,rect.y+rect.h].every(Number.isFinite)||rect.w<=0||rect.h<=0)return undefined;
 if(rect.w>DOUYIN_SCRATCH_WIDTH||rect.h>DOUYIN_SCRATCH_HEIGHT)throw new RangeError('Douyin bounded paint exceeds the fixed logical scratch');
 if(painting)throw new Error('Nested Douyin bounded paint would overwrite the active scratch');
 if(!scratch){
  if(!createSurface)throw new Error('Configure Douyin rendering after creating the main canvas');
  scratch=createSurface();scratch.width=DOUYIN_SCRATCH_WIDTH;scratch.height=DOUYIN_SCRATCH_HEIGHT;
  scratchContext=scratch.getContext('2d')??undefined;
  if(!scratchContext)throw new Error('Douyin scratch 2D context is unavailable');
 }
 // Keep a logical integer origin whenever it fits. A fractional board-door
 // crop then uses a matching fractional source offset instead of rasterizing
 // and filtering the same subpixel phase twice. The exact-maximum-size case
 // falls back to the requested origin rather than growing the fixed surface.
 const floorX=Math.floor(rect.x),floorY=Math.floor(rect.y);
 const originX=rect.x-floorX+rect.w<=DOUYIN_SCRATCH_WIDTH?floorX:rect.x;
 const originY=rect.y-floorY+rect.h<=DOUYIN_SCRATCH_HEIGHT?floorY:rect.y;
 const sourceX=rect.x-originX,sourceY=rect.y-originY;
 const target=scratchContext!;
 painting=true;
 target.save();
 try{
  target.setTransform(1,0,0,1,0,0);
  // Clear the upcoming crop plus one sampling pixel. A later, larger crop
  // clears its own area first, including any prior unbounded-painter spill.
  target.clearRect(0,0,Math.min(DOUYIN_SCRATCH_WIDTH,Math.ceil(sourceX+rect.w)+1),Math.min(DOUYIN_SCRATCH_HEIGHT,Math.ceil(sourceY+rect.h)+1));
  target.translate(-originX,-originY);
  // These are the state fields consumed by the explicitly bounded painters.
  // Alpha is applied per primitive, never twice at the final composite.
  target.globalAlpha=ctx.globalAlpha;target.globalCompositeOperation='source-over';
  target.fillStyle=ctx.fillStyle;target.strokeStyle=ctx.strokeStyle;
  target.lineWidth=ctx.lineWidth;target.lineCap=ctx.lineCap;target.lineJoin=ctx.lineJoin;target.miterLimit=ctx.miterLimit;
  target.font=ctx.font;target.textAlign=ctx.textAlign;target.textBaseline=ctx.textBaseline;
  target.setLineDash(ctx.getLineDash());target.imageSmoothingEnabled=ctx.imageSmoothingEnabled;
  target.shadowColor=ctx.shadowColor;target.shadowBlur=ctx.shadowBlur;target.shadowOffsetX=ctx.shadowOffsetX;target.shadowOffsetY=ctx.shadowOffsetY;
  const value=paint(target);
  ctx.save();
  try{
   ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';
   ctx.shadowColor='rgba(0,0,0,0)';ctx.shadowBlur=0;ctx.shadowOffsetX=0;ctx.shadowOffsetY=0;
   ctx.drawImage(scratch as unknown as CanvasImageSource,sourceX,sourceY,rect.w,rect.h,rect.x,rect.y,rect.w,rect.h);
  }finally{ctx.restore();}
  return value;
 }finally{target.restore();painting=false;}
}

/** Moving unrotated cargo has a conservative, caller-proven art envelope.
 * Interior cargo remains direct; only its small intersection with a doorway
 * uses the shared scratch. No grouping/reordering of board cargo is needed. */
export function withTransportCargoBounds(ctx:CanvasRenderingContext2D,clip:Readonly<Rect>,extent:Readonly<Rect>,paint:(context:CanvasRenderingContext2D)=>void):void {
 if(extent.x>=clip.x&&extent.y>=clip.y&&extent.x+extent.w<=clip.x+clip.w&&extent.y+extent.h<=clip.y+clip.h){paint(ctx);return;}
 const x=Math.max(clip.x,extent.x),y=Math.max(clip.y,extent.y),right=Math.min(clip.x+clip.w,extent.x+extent.w),bottom=Math.min(clip.y+clip.h,extent.y+extent.h);
 if(right>x&&bottom>y)withBoundedPainter(ctx,{x,y,w:right-x,h:bottom-y},paint);
}
