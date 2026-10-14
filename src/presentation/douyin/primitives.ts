import type {Rect} from '../layout.ts';

type Point=readonly [number,number];
/** Clip a finite polygon geometrically; no context interception or clip stack. */
export function fillBoundedPolygon(ctx:CanvasRenderingContext2D,points:readonly Point[],rect:Readonly<Rect>):void {
 let result=[...points];
 for(const [axis,edge,sign] of [[0,rect.x,1],[0,rect.x+rect.w,-1],[1,rect.y,1],[1,rect.y+rect.h,-1]] as const){
  const input=result;result=[];if(!input.length)return;
  let previous=input[input.length-1],previousInside=(previous[axis]-edge)*sign>=0;
  for(const current of input){
   const inside=(current[axis]-edge)*sign>=0;
   if(inside!==previousInside){const t=(edge-previous[axis])/(current[axis]-previous[axis]);result.push(axis===0?[edge,previous[1]+t*(current[1]-previous[1])]:[previous[0]+t*(current[0]-previous[0]),edge]);}
   if(inside)result.push(current);previous=current;previousInside=inside;
  }
 }
 if(result.length<3)return;
 // Keep subpixel edge arithmetic on the inside of the finite rectangle.
 const epsilon=1/32;
 ctx.beginPath();result.forEach(([x,y],i)=>{x=Math.max(rect.x+epsilon,Math.min(rect.x+rect.w-epsilon,x));y=Math.max(rect.y+epsilon,Math.min(rect.y+rect.h-epsilon,y));if(i)ctx.lineTo(x,y);else ctx.moveTo(x,y);});ctx.closePath();ctx.fill();
}

export function drawBoundedHazard(ctx:CanvasRenderingContext2D,rect:Readonly<Rect>,vertical=false):void {
 if(![rect.x,rect.y,rect.w,rect.h].every(Number.isFinite)||rect.w<=0||rect.h<=0)return;
 const {x,y,w,h}=rect;ctx.save();
 ctx.fillStyle='#d4a03f';ctx.fillRect(x,y,w,h);ctx.fillStyle='#26313b';
 if(vertical){for(let n=y-35;n<y+h+35;n+=54)fillBoundedPolygon(ctx,[[x,n],[x+w,n+24],[x+w,n+50],[x,n+26]],rect);}
 else{for(let n=x-35;n<x+w+35;n+=54)fillBoundedPolygon(ctx,[[n,y],[n+27,y],[n+7,y+h],[n-20,y+h]],rect);}
 ctx.fillStyle='rgba(255,240,186,.25)';ctx.fillRect(x,y,w,Math.min(3,h));ctx.restore();
}

/** The strip endpoints sit outside the inset rectangle, so butt/round caps
 * cannot affect it. The quad has exactly the original perpendicular width. */
export function drawBoundedEntryStripes(ctx:CanvasRenderingContext2D,x:number,y:number,cell:number,scale:number):void {
 const rect={x:x+5,y:y+5,w:cell-10,h:cell-10},normal=7*scale/2/Math.SQRT2;
 ctx.save();ctx.fillStyle='rgba(158,223,255,.22)';
 for(let offset=-cell;offset<cell*2;offset+=24*scale){
  const ax=x+offset,ay=y+cell,bx=ax+cell,by=y;
  fillBoundedPolygon(ctx,[[ax+normal,ay+normal],[bx+normal,by+normal],[bx-normal,by-normal],[ax-normal,ay-normal]],rect);
 }
 ctx.restore();
}

type RoundedPath=(ctx:CanvasRenderingContext2D,x:number,y:number,w:number,h:number,r:number)=>void;
/** The existing rounded quadratic silhouette, filled directly. Its top band
 * is an exact subdivision of the same curve rather than a rectangular mask. */
export function drawBoundedPressedOverlay(ctx:CanvasRenderingContext2D,rect:Readonly<Rect>,rounded:RoundedPath):void {
 const {x,y,w,h}=rect,r=Math.min(18,h/4,w/2);
 if(![x,y,w,h].every(Number.isFinite)||w<=0||h<=0)return;
 ctx.save();rounded(ctx,x,y,w,h,r);ctx.fillStyle='rgba(5,12,20,.19)';ctx.fill();
 const band=Math.min(6,h),t=Math.min(1,Math.sqrt(band/r)),inset=r*(1-t)*(1-t),curveY=y+Math.min(band,r);
 ctx.beginPath();ctx.moveTo(x+r,y);ctx.lineTo(x+w-r,y);
 ctx.quadraticCurveTo(x+w-r+r*t,y,x+w-inset,curveY);
 if(band>r)ctx.lineTo(x+w,y+band);
 ctx.lineTo(band>r?x:x+inset,y+band);
 if(band>r)ctx.lineTo(x,y+r);
 ctx.quadraticCurveTo(x+r-r*t,y,x+r,y);ctx.closePath();ctx.fillStyle='rgba(2,7,12,.25)';ctx.fill();
 // r <=18 proves x+9..right-9 lies inside the curve at h-4..h-2.
 if(w>18&&h>=6){ctx.fillStyle='rgba(255,244,208,.20)';ctx.fillRect(x+9,y+h-4,w-18,2);}
 ctx.restore();
}
