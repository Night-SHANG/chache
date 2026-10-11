import type {ThemeId} from '../application/profile.ts';
import {gradient} from './assets.ts';
import {L} from './layout.ts';
import type {Rect} from './layout.ts';

type QuietTheme=Exclude<ThemeId,'day'|'night'>;
// These are the existing scene's base tones, without its architecture or props.
const TONES:Record<QuietTheme,readonly [string,string]>={
 harbor:['#263e50','#101f2d'],cold_chain:['#344b55','#182d38'],rail_freight:['#304650','#132632'],
 express_sorting:['#304953','#172b37'],toy_workshop:['#344b54','#192d37'],paper_warehouse:['#344b54','#192d37'],space_cargo:['#344b54','#192d37'],
 steam_foundry:['#393b3b','#212a31'],neon_depot:['#283c4b','#162633'],lava_forge:['#393337','#251f28'],
 ocean_vault:['#29484c','#163038'],royal_store:['#414047','#252936'],field_station:['#3c4541','#222e30'],
 forest_depot:['#263c2e','#101e1a'],ice_vault:['#233e53','#101d2d'],
};
// Continue only low-detail horizontal floor bands that reach the scene edge.
// No doors, columns, machinery, containers, rails or decorative frames are copied.
const FLOOR:Partial<Record<QuietTheme,readonly (readonly [number,number,string])[]>>={
 toy_workshop:[[1896,24,'#7a7055'],[1896,5,'#a29470']],
 paper_warehouse:[[1907.5,7,'#736f5d']],
 space_cargo:[[1896,24,'#425e64'],[1896,4,'#91a29a']],
 steam_foundry:[[1894,26,'#3c4240'],[1895,4,'#82785c']],
 neon_depot:[[1894,26,'#253f4e']],
 lava_forge:[[1894,26,'#423735'],[1893.5,3,'#89604c']],
 ocean_vault:[[1905,15,'#365a5b'],[1905,2,'#6c8373']],
 royal_store:[[1895,25,'#56574f'],[1896,4,'#928261']],
 field_station:[[1896,24,'#3e5145'],[1896.5,3,'#79836a']],
 express_sorting:[[1906,14,'#324b53'],[1906,3,'#586e68']],
};

/** Extend wall/floor atmosphere only; never repeat or scale a complete scene. */
export function drawScenerySides(ctx:CanvasRenderingContext2D,theme:ThemeId,bounds?:Rect):void {
 if(theme==='day'||theme==='night'||!bounds||![bounds.x,bounds.y,bounds.w,bounds.h,bounds.x+bounds.w].every(Number.isFinite)||bounds.w<=0||bounds.h<=0||bounds.x>0||bounds.x+bounds.w<L.width)return;
 const left=-bounds.x,right=bounds.x+bounds.w-L.width;
 if(left<=0&&right<=0)return;
 // A continuous underlay also covers the fractional-pixel boundary. Two
 // adjacent antialiased clips would leave a translucent vertical seam after
 // render's clearRect. The original opaque scene repaints the central area.
 ctx.save();
 const band=(y:number,h:number,color:string)=>{ctx.fillStyle=color;ctx.fillRect(bounds.x,y,bounds.w,h);};
 const wash=(y:number,h:number,top:string,bottom:string)=>{ctx.fillStyle=gradient(ctx,0,y,h,top,bottom);ctx.fillRect(bounds.x,y,bounds.w,h);};
 wash(0,L.height,...TONES[theme]);
 if(theme==='harbor'){
  wash(650,165,'#284655','#1b3546');wash(815,1105,'#20313e','#111f2b');
  band(815,7,'#5c5a45');band(822,10,'#101e2a');
 }else if(theme==='cold_chain'){
  const floor=L.height*.78;band(floor,L.height-floor,'#152c36');band(floor,4,'#59706d');
 }else if(theme==='rail_freight'){
  band(482,7,'#5c6255');band(489,13,'#192e3a');
 }
 for(const [y,h,color] of FLOOR[theme]??[])band(y,h,color);
 ctx.restore();
}
