import type {CanvasSurface} from '../platform/types.ts';
import type {ThemeId} from '../application/profile.ts';
import type {Rect} from './layout.ts';
import {L} from './layout.ts';

// One native-pixel static layer, never gameplay/UI pixels. 1440 × 3120 uses 17.2 MiB.
// Budget is independent of the existing 5 MB shop cache; cold replacement evicts first.
const MAX_BYTES=24*1024*1024,MAX_EDGE=4096;
interface Entry {surface:CanvasSurface;context:CanvasRenderingContext2D;key:string}
let createSurface:(()=>CanvasSurface)|undefined,entry:Entry|undefined,unavailable=false;
const observedScreens=new WeakSet<object>();
function release(surface:CanvasSurface):void {
 // Zero can mean a large default size on a Mini Game host.
 try{surface.width=1;surface.height=1;}catch{/* Optional acceleration cannot interrupt gameplay. */}
}
export function invalidateWarehouseCache():void {
 if(entry)release(entry.surface);entry=undefined;unavailable=false;
}
export function configureWarehouseCache(factory?:()=>CanvasSurface):void {
 invalidateWarehouseCache();createSurface=factory;
}
function observe(surface:CanvasSurface):void {
 surface.addEventListener?.('contextlost',invalidateWarehouseCache);
 surface.addEventListener?.('contextrestored',invalidateWarehouseCache);
}
/**
 * Optional static pre-UI layer. backdrop is an explicit platform beginFrame contract:
 * an opaque uniform frame, followed only by renderScene's logical clearRect. Callers
 * with existing artwork/clipping must omit it. Reproduce that backing and clear in
 * the surface, then COPY native pixels: source-over of grouped transparent racks
 * causes different rounding on wide screens and fractional viewport edges.
 */
export function drawCachedWarehouse(ctx:CanvasRenderingContext2D,theme:ThemeId,bounds:Rect|undefined,backdrop:string|undefined,paint:(context:CanvasRenderingContext2D)=>void):boolean {
 if(!createSurface||unavailable||!backdrop||!/^#[\da-f]{6}$/i.test(backdrop)||typeof ctx.getTransform!=='function')return false;
 if(ctx.globalAlpha!==1||ctx.globalCompositeOperation!=='source-over'||(ctx.filter&&ctx.filter!=='none')||ctx.shadowBlur!==0||ctx.shadowOffsetX!==0||ctx.shadowOffsetY!==0)return false;
 let surface:CanvasSurface|undefined;
 try{
  const canvas=ctx.canvas,transform=ctx.getTransform(),{a,b,c,d,e,f}=transform;
  if(!canvas||b!==0||c!==0||![a,d,e,f].every(Number.isFinite)||a<=0||d<=0)return false;
  if(ctx.isContextLost?.()){invalidateWarehouseCache();return false;}
  const {width,height}=canvas,bytes=width*height*4;
  if(!Number.isSafeInteger(bytes)||width<1||height<1||width>MAX_EDGE||height>MAX_EDGE||bytes>MAX_BYTES){invalidateWarehouseCache();return false;}
  if(bounds&&![bounds.x,bounds.y,bounds.w,bounds.h].every(Number.isFinite)){invalidateWarehouseCache();return false;}
  if(!observedScreens.has(canvas)){observe(canvas);observedScreens.add(canvas);}
  const dash=ctx.getLineDash();
  const key=JSON.stringify([theme,bounds?[bounds.x,bounds.y,bounds.w,bounds.h]:null,backdrop,width,height,a,d,e,f,ctx.lineWidth,ctx.lineCap,ctx.lineJoin,ctx.miterLimit,ctx.lineDashOffset,dash,ctx.imageSmoothingEnabled,ctx.imageSmoothingQuality]);
  if(entry?.context.isContextLost?.()){invalidateWarehouseCache();return false;}
  if(entry?.key!==key){
   invalidateWarehouseCache();
   surface=createSurface();
   if(surface===canvas)throw Error('Warehouse surface must be offscreen');
   surface.width=width;surface.height=height;
   if(surface.width!==width||surface.height!==height)throw Error('Warehouse surface has incorrect resolution');
   const context=surface.getContext('2d');if(!context||context.isContextLost?.())throw Error('Warehouse context unavailable');
   context.setTransform(1,0,0,1,0,0);context.fillStyle=backdrop;context.fillRect(0,0,width,height);
   context.setTransform(a,0,0,d,e,f);context.clearRect(0,0,L.width,L.height);
   context.lineWidth=ctx.lineWidth;context.lineCap=ctx.lineCap;context.lineJoin=ctx.lineJoin;context.miterLimit=ctx.miterLimit;context.lineDashOffset=ctx.lineDashOffset;context.setLineDash(dash);
   context.imageSmoothingEnabled=ctx.imageSmoothingEnabled;context.imageSmoothingQuality=ctx.imageSmoothingQuality;
   paint(context);observe(surface);entry={surface,context,key};surface=undefined;
  }
  ctx.save();
  try{
   ctx.setTransform(1,0,0,1,0,0);ctx.globalCompositeOperation='copy';
   if(ctx.globalCompositeOperation!=='copy')throw Error('Native pixel replacement unavailable');
   ctx.drawImage(entry.surface as unknown as CanvasImageSource,0,0);return true;
  }finally{ctx.restore();}
 }catch{
  if(surface&&surface!==ctx.canvas)release(surface);invalidateWarehouseCache();unavailable=true;return false;
 }
}
