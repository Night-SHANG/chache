import type {ThemeId} from '../application/profile.ts';
import type {Rect} from './layout.ts';
import type {StaticArtSprite} from './static-art-manifest.ts';
import {STATIC_ART_SCENES} from './static-art-manifest.ts';
import {drawStaticArtSprite,validArtRect} from './static-art-draw.ts';

type Band=readonly [number,number];
const rows=(count:number,start:number,step:number,height:number):Band[]=>Array.from({length:count},(_,index)=>[Math.floor(start+index*step),Math.ceil(start+index*step+height)]);
/** Protected bands are the original caps and recognizable objects. Only the
 * intervening architectural rails expand; no additional top/bottom scene copy.
 * Values are authored source-image coordinates, not screen/UI coordinates. */
const PROTECTED:Readonly<Record<ThemeId,readonly Band[]>>={
 day:[[0,526],[536,680],...rows(5,694,230,216),[1820,1920]],
 night:[[0,526],[536,680],...rows(5,694,230,216),[1820,1920]],
 harbor:[[0,150],[170,961],[1092,1235],[1368,1509],[1642,1784],[1870,1920]],
 cold_chain:[[0,300],[900,980],[1480,1530],[1890,1920]],
 rail_freight:[[0,535],...rows(16,591.25,88.25,10),[1900,1920]],
 express_sorting:[[0,760],...rows(13,783.37,68.37,22),[1680,1710],[1830,1920]],
 toy_workshop:[[0,100],...rows(14,40,(1920-85)/14,16),...rows(8,154,220,12),[1880,1920]],
 paper_warehouse:[[0,70],...rows(5,100,344,126),[1860,1920]],
 space_cargo:[[0,145],...rows(7,70,1770/7,67),...rows(8,175,210,25),[1805,1920]],
 steam_foundry:[[0,210],...rows(7,79,1795/7,23),[1860,1920]],
 neon_depot:[[0,100],...rows(7,106,1740/7,73),[1860,1920]],
 // Basalt slabs, timber and ice are the structural rail itself, not a glyph.
 lava_forge:[[0,80],[1870,1920]],
 ocean_vault:[[0,145],...rows(5,59,1758/5,76),[1720,1920]],
 royal_store:[[0,150],[1860,1920]],
 field_station:[[0,180],...rows(6,116,1745/6,29),[1815,1920]],
 forest_depot:[[0,90],[1830,1920]],
 ice_vault:[[0,90],[1830,1920]],
};

export interface AndroidWarehouseBand {readonly source:Rect;readonly destination:Rect;readonly architecturalRail:boolean}

/** Full source width is fitted once, never cover-cropped. Caps and object bands
 * retain that same uniform scale. Extra height is distributed between them. */
export function androidWarehouseBands(theme:ThemeId,bounds:Readonly<Rect>):readonly AndroidWarehouseBand[] {
 if(!validArtRect(bounds))return [];
 const sprite=STATIC_ART_SCENES[theme],source=sprite.source,scale=bounds.w/source.w;
 if(!Number.isFinite(scale)||bounds.h+1e-7<source.h*scale)return [];
 const protectedBands:Band[]=[];
 for(const [start,end] of [...PROTECTED[theme]].sort((a,b)=>a[0]-b[0])){
  const lo=Math.max(0,start),hi=Math.min(source.h,end),last=protectedBands[protectedBands.length-1];
  if(hi<=lo)continue;
  if(last&&lo<=last[1])protectedBands[protectedBands.length-1]=[last[0],Math.max(last[1],hi)];else protectedBands.push([lo,hi]);
 }
 const fixedHeight=protectedBands.reduce((sum,[start,end])=>sum+end-start,0),railHeight=source.h-fixedHeight;
 const railScale=scale+(bounds.h-source.h*scale)/railHeight;
 if(!Number.isFinite(railScale)||railHeight<=0)return [];
 const output:AndroidWarehouseBand[]=[];let sourceY=0,destinationY=bounds.y;
 const append=(end:number,architecturalRail:boolean):void=>{
  if(end<=sourceY)return;
  const h=end-sourceY,dh=h*(architecturalRail?railScale:scale);
  output.push({source:{x:source.x,y:source.y+sourceY,w:source.w,h},destination:{x:bounds.x,y:destinationY,w:bounds.w,h:dh},architecturalRail});
  sourceY=end;destinationY+=dh;
 };
 for(const [start,end] of protectedBands){append(start,true);append(end,false);}append(source.h,true);
 return output;
}

/** Finite decoded-image composition only; never redraw vector artwork or create
 * a runtime backing canvas. The existing readiness service owns the image. */
export function drawAndroidWarehouse(ctx:CanvasRenderingContext2D,theme:ThemeId,bounds:Readonly<Rect>):boolean {
 const bands=androidWarehouseBands(theme,bounds);if(!bands.length)return false;
 const original=STATIC_ART_SCENES[theme],transform=typeof ctx.getTransform==='function'?ctx.getTransform():undefined;
 // Native viewport scales are fractional. Adjacent fractional drawImage edges
 // otherwise leave one alpha-blended scanline between independently drawn bands.
 const snapY=(y:number):number=>transform&&transform.b===0&&transform.c===0&&transform.d>0&&Number.isFinite(transform.d)&&Number.isFinite(transform.f)?(Math.round(y*transform.d+transform.f)-transform.f)/transform.d:y;
 ctx.save();ctx.beginPath();ctx.rect(bounds.x,bounds.y,bounds.w,bounds.h);ctx.clip();
 for(const band of bands){const d=band.destination,y=snapY(d.y),bottom=snapY(d.y+d.h);const sprite:StaticArtSprite={resource:original.resource,source:band.source,destination:{...d,y,h:bottom-y}};drawStaticArtSprite(ctx,sprite);}
 ctx.restore();return true;
}
