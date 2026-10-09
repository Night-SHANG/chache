import type {CanvasSurface} from '../platform/types.ts';
import type {Rect} from './layout.ts';
import type {CosmeticPreviewOptions} from './cosmetic-art.ts';

// A scrolling list is one static-artwork composite. Never retain more than 5 surfaces / 5 MB of RGBA.
const MAX_SURFACES=5,MAX_BYTES=5_000_000;
type Paint=(ctx:CanvasRenderingContext2D,rect:Rect,options:CosmeticPreviewOptions)=>void;
interface Entry {
 surface:CanvasSurface;context:CanvasRenderingContext2D;bytes:number;used:number;
 width:number;height:number;scaleX:number;scaleY:number;phaseX:number;phaseY:number;
 theme:string;cargo:string;forklift:string;outline:boolean;category:string;identity:string;revision:number;
}
let createSurface:(()=>CanvasSurface)|undefined;
let entries:Entry[]=[],retainedBytes=0,sequence=0,revision=0,unavailable=false,paintDepth=0;
function release(surface:CanvasSurface):void {
 // Zero dimensions reset some Mini Game/native hosts to a large default canvas.
 try{surface.width=1;surface.height=1;}catch{/* A failed context must never interrupt gameplay. */}
}
function discard(index:number):void {
 const entry=entries[index];retainedBytes-=entry.bytes;release(entry.surface);entries.splice(index,1);
}
/** Readiness and restored contexts invalidate pixels, never account or gameplay state. */
export function invalidateCosmeticPreviewCache():void {
 for(const entry of entries)release(entry.surface);
 entries=[];retainedBytes=0;sequence=0;revision++;unavailable=false;
}
export function configureCosmeticPreviewCache(factory?:()=>CanvasSurface):void {
 invalidateCosmeticPreviewCache();createSurface=factory;
}
/** Returns false whenever exact, optional caching is unavailable; caller paints the original artwork. */
export function drawCachedCosmeticSetPreview(ctx:CanvasRenderingContext2D,rect:Rect,options:CosmeticPreviewOptions,paint:Paint,identity='set'):boolean {
 if(paintDepth||!createSurface||unavailable||typeof ctx.getTransform!=='function')return false;
 // Group opacity/blending would change per-primitive compositing. Those uncommon callers stay uncached.
 if(ctx.globalAlpha!==1||ctx.globalCompositeOperation!=='source-over'||(ctx.filter&&ctx.filter!=='none')||ctx.shadowBlur!==0||ctx.shadowOffsetX!==0||ctx.shadowOffsetY!==0)return false;
 const transform=ctx.getTransform(),sx=transform.a,sy=transform.d;
 if(transform.b!==0||transform.c!==0||!Number.isFinite(sx)||!Number.isFinite(sy)||sx<=0||sy<=0)return false;
 const x=rect.x*sx+transform.e,y=rect.y*sy+transform.f,left=Math.floor(x),top=Math.floor(y);
 const width=Math.ceil(x+rect.w*sx)-left,height=Math.ceil(y+rect.h*sy)-top,bytes=width*height*4;
 if(!Number.isSafeInteger(bytes)||width<1||height<1||bytes>MAX_BYTES)return false;
 const phaseX=x-left,phaseY=y-top,theme=options.theme??'day',cargo=options.cargoStyle??'classic',forklift=options.forklift??'yellow',outline=options.cargoOutline??false,category=options.category??'set';
 let entry:Entry|undefined;
 for(const candidate of entries)if(candidate.width===rect.w&&candidate.height===rect.h&&candidate.scaleX===sx&&candidate.scaleY===sy&&candidate.phaseX===phaseX&&candidate.phaseY===phaseY&&candidate.theme===theme&&candidate.cargo===cargo&&candidate.forklift===forklift&&candidate.outline===outline&&candidate.category===category&&candidate.identity===identity&&candidate.revision===revision){entry=candidate;break;}
 if(entry&&entry.context.isContextLost?.()){invalidateCosmeticPreviewCache();return false;}
 if(!entry){
  // Evict before allocation, so even the cold peak stays within both bounds.
  while(entries.length>=MAX_SURFACES||retainedBytes+bytes>MAX_BYTES){let oldest=0;for(let i=1;i<entries.length;i++)if(entries[i].used<entries[oldest].used)oldest=i;discard(oldest);}
  let surface:CanvasSurface|undefined;
  try{
   surface=createSurface();surface.width=width;surface.height=height;
   const context=surface.getContext('2d');if(!context||context.isContextLost?.())throw Error('Preview context unavailable');
   context.setTransform(sx,0,0,sy,phaseX,phaseY);
   // Native target scale and pixel phase avoid resampling, including narrow high-DPR screens.
   paintDepth++;try{paint(context,{x:0,y:0,w:rect.w,h:rect.h},options);}finally{paintDepth--;}
   surface.addEventListener?.('contextlost',invalidateCosmeticPreviewCache);
   surface.addEventListener?.('contextrestored',invalidateCosmeticPreviewCache);
   entry={surface,context,bytes,used:++sequence,width:rect.w,height:rect.h,scaleX:sx,scaleY:sy,phaseX,phaseY,theme,cargo,forklift,outline,category,identity,revision};
   entries.push(entry);retainedBytes+=bytes;
  }catch{if(surface)release(surface);unavailable=true;return false;}
 }
 entry.used=++sequence;
 ctx.save();
 try{
  ctx.setTransform(1,0,0,1,0,0);ctx.drawImage(entry.surface as unknown as CanvasImageSource,left,top);return true;
 }catch{invalidateCosmeticPreviewCache();unavailable=true;return false;}
 finally{ctx.restore();}
}

/** The complete clipped art layer is cached once; nested previews paint into it without allocating. */
export function drawCachedCosmeticComposite(ctx:CanvasRenderingContext2D,rect:Rect,options:CosmeticPreviewOptions,paint:Paint,identity:string):void {
 if(drawCachedCosmeticSetPreview(ctx,rect,options,paint,identity))return;
 paintDepth++;try{paint(ctx,rect,options);}finally{paintDepth--;}
}
