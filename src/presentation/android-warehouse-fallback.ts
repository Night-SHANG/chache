import type {ThemeId} from '../application/profile.ts';
import type {Rect} from './layout.ts';
import {STATIC_ART_SCENES} from './static-art-manifest.ts';
import {androidWarehouseBands} from './android-warehouse-background.ts';

// Emergency-only structural tones from the existing authored scenery. No image,
// material atlas or runtime canvas can change this frame after a failed decode.
const TONES:Partial<Record<ThemeId,readonly [string,string,string,string]>>={
 day:['#243345','#111b25','#273a4d','#a77233'],night:['#111c35','#080d1b','#273a4d','#a77233'],
 cold_chain:['#344b55','#182d38','#47616a','#8caaa9'],rail_freight:['#304650','#132632','#425b65','#84918b'],
 toy_workshop:['#344b54','#192d37','#405759','#a5a88b'],paper_warehouse:['#344b54','#192d37','#7a7965','#b6aa8b'],
 space_cargo:['#344b54','#192d37','#344f59','#7a8d82'],steam_foundry:['#393b3b','#212a31','#807155','#ae9470'],
 ocean_vault:['#29484c','#163038','#3f6667','#8b9680'],
};

/** A bounded simplification of the existing architecture for failed/timed-out
 * Android startup only. It uses the SAME source-to-native band mapping as PNGs,
 * fills the whole native viewport and never calls the legacy full-detail painter.
 * The startup resource service keeps failed images failed until explicit retry or
 * theme change, so late PNG/shared-atlas arrivals cannot replace this fallback. */
export function drawAndroidWarehouseFallback(ctx:CanvasRenderingContext2D,theme:ThemeId,bounds:Readonly<Rect>):boolean {
 const bands=androidWarehouseBands(theme,bounds),sprite=STATIC_ART_SCENES[theme],tones=TONES[theme];
 if(!bands.length||!sprite||!tones)return false;
 const scale=bounds.w/sprite.source.w,classic=theme==='day'||theme==='night';
 const y=(sourceY:number):number=>{
  const band=bands.find(b=>sourceY<=b.source.y+b.source.h)??bands[bands.length-1];
  return band.destination.y+(sourceY-band.source.y)*band.destination.h/band.source.h;
 };
 // Classic painters use x=-57..1148; other themes authored their 1080-wide
 // structure into that full outer frame. Match that frozen generation transform.
 const x=(sourceX:number):number=>bounds.x+(classic?sourceX+57:sourceX*1205/1080)*scale;
 const width=(w:number):number=>w*(classic?1:1205/1080)*scale;
 const rect=(sx:number,sy:number,w:number,h:number,color:string):void=>{ctx.fillStyle=color;ctx.fillRect(x(sx),y(sy),width(w),y(sy+h)-y(sy));};
 const dot=(sx:number,sy:number,r:number,color:string):void=>{ctx.fillStyle=color;ctx.beginPath();ctx.arc(x(sx),y(sy),width(r),0,Math.PI*2);ctx.fill();};
 ctx.save();ctx.beginPath();ctx.rect(bounds.x,bounds.y,bounds.w,bounds.h);ctx.clip();
 const gradient=ctx.createLinearGradient(0,bounds.y,0,bounds.y+bounds.h);gradient.addColorStop(0,tones[0]);gradient.addColorStop(1,tones[1]);
 ctx.fillStyle=gradient;ctx.fillRect(bounds.x,bounds.y,bounds.w,bounds.h);
 if(classic){
  ctx.globalAlpha*=.68;
  for(const sx of [-56,963])for(let row=0;row<8;row++){
   const sy=62+row*230;rect(sx,sy,185,185,'#101b27');
   // Existing muted crate silhouettes, without live icon/material detail.
   rect(sx+12,sy+38,74,74,['#60713f','#90763d','#3d7188','#884d43'][row%4]);rect(sx+80,sy+63,64,64,'#75643a');
   rect(sx-1,sy+180,184,14,'#3f4f5a');rect(sx-1,sy+180,184,5,tones[3]);
   for(const xx of [sx+4,sx+157]){rect(xx,sy,16,217,tones[2]);rect(xx,sy,3,217,'#647184');}
  }
  for(const sy of [18,234,310,1470,1824]){rect(0,sy,1080,10,'#081119');rect(0,sy+11,1080,3,'#3f4f5a');}
 }else if(theme==='cold_chain'){
  for(let col=0;col<10;col++){const sx=15+col*107;rect(sx,12,100,1485,'#2e4650');rect(sx,12,3,1485,'#203941');}
  rect(0,1497.6,1080,422.4,'#152c36');rect(0,1497.6,1080,4,'#59706d');
  for(const sx of [25,909]){rect(sx,240,146,1257.6,'#182f38');rect(sx+12,252,122,1242.6,tones[2]);}
  rect(400,26,280,90,tones[3]);for(const sx of [448,540,632])dot(sx,66.5,26,'#486a73');
 }else if(theme==='rail_freight'){
  for(const sx of [127,927]){rect(sx,32,26,471,'#1b3340');rect(sx+4,32,5,471,'#4b626b');}
  rect(111,32,861,17,tones[2]);rect(0,482,1080,7,'#5c6255');
  for(const center of [65,1015]){for(let row=0;row<17;row++){const t=row/16;rect(center-19-t*39,508+t*1412,38+t*78,6,'#535d57');}for(const offset of [-26,26])rect(center+offset,498,3,1422,tones[3]);}
 }else if(theme==='toy_workshop'){
  for(const sx of [14,950])rect(sx,22,116,1888,tones[2]);
  rect(20,20,1040,36,'#7b8470');rect(24,23,1032,6,'#b3b294');
  for(const sx of [41,1010]){rect(sx,85,28,1814,'#64796d');for(let sy=160;sy<1920;sy+=220)rect(sx,sy,28,4,'#233e43');}rect(0,1896,1080,24,'#7a7055');
 }else if(theme==='paper_warehouse'){
  for(const [sx,w,color] of [[9,31,'#7a7965'],[22,24,'#9b9579'],[38,15,'#b6aa8b'],[1027,15,'#b6aa8b'],[1042,24,'#9b9579'],[1062,15,'#7a7965']] as const)rect(sx,26,w,1880,color);
  rect(0,18,1080,41,'#9d9678');rect(0,1882,1080,24,'#a39676');
  for(const sx of [21,986])for(let row=0;row<5;row++){const sy=105+row*344;ctx.fillStyle='#5a6b64';ctx.beginPath();ctx.moveTo(x(sx),y(sy));ctx.lineTo(x(sx+72),y(sy+58));ctx.lineTo(x(sx),y(sy+116));ctx.closePath();ctx.fill();}
 }else if(theme==='space_cargo'){
  for(const sx of [18,936]){rect(sx,22,126,1878,'#243e4b');rect(sx+12,31,102,1860,tones[2]);for(let row=0;row<7;row++)rect(sx+24,75+row*1770/7,77,57,'#1c3543');}
  for(const sx of [47,1002]){rect(sx,100,31,1725,tones[3]);for(let sy=180;sy<1820;sy+=210)rect(sx-4,sy,39,15,'#3a5560');}
  rect(0,15,1080,32,'#607872');rect(0,1896,1080,24,'#425e64');
 }else if(theme==='steam_foundry'){
  for(const sx of [42,1004]){rect(sx+5,55,36,1855,'#283033');rect(sx+10,55,22,1855,tones[2]);for(let row=0;row<7;row++)rect(sx+2,83+row*1795/7,43,15,'#4d493d');}
  rect(38,45,1008,24,'#625640');rect(0,1894,1080,26,'#3c4240');
 }else if(theme==='ocean_vault'){
  for(const sx of [21,960]){rect(sx,32,98,1873,'#254950');for(let row=0;row<5;row++){const sy=97+row*1758/5;dot(sx+49,sy,33,'#797e64');dot(sx+49,sy,24,'#234c5b');}}
  rect(30,32,1020,22,'#526f67');rect(0,1894,1080,26,tones[2]);
 }
 ctx.restore();return true;
}
