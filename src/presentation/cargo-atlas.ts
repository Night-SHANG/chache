import type { CargoId } from '../domain/types.ts';
import type { CargoStyleId } from '../application/profile.ts';

export const CARGO_ATLAS = Object.freeze({
 src:'assets/cargo-materials.png',width:670,height:2010,tileSize:134,padding:3,bodySize:128,
 styles:['wood','insulated','reinforced','taped','toy_brick','paper_fold','space_case','ice_crystal','steam_brass','neon_circuit','lava_core','ocean_relic','royal_gold','field_supply','harbor_container'] as readonly CargoStyleId[],
 cargos:['cargo.food','cargo.machine','cargo.chem','cargo.electronic','cargo.cold'] as readonly CargoId[],
});
let image:CanvasImageSource|undefined;
/** Loading never gates input or touches a save. Missing assets keep the complete classic body. */
export async function loadCargoAtlas(load:(path:string)=>Promise<CanvasImageSource>):Promise<boolean> {
 try {const next=await load(CARGO_ATLAS.src),size=next as {width?:number;height?:number};
  if(size.width!==CARGO_ATLAS.width||size.height!==CARGO_ATLAS.height)throw Error('Cargo atlas dimensions do not match');
  image=next;return true;
 } catch {image=undefined;return false;}
}
export function drawCargoAtlas(ctx:CanvasRenderingContext2D,cargo:CargoId,style:CargoStyleId):boolean {
 const row=CARGO_ATLAS.styles.indexOf(style),col=CARGO_ATLAS.cargos.indexOf(cargo);
 if(!image||row<0||col<0)return false;
 const {tileSize,padding,bodySize}=CARGO_ATLAS;
 ctx.drawImage(image,col*tileSize+padding,row*tileSize+padding,bodySize,bodySize,0,0,110,110);return true;
}
