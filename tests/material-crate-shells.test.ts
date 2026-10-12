// Historical authoring contract: hashes and assertions remain unchanged; runtime textures are covered separately.
import './helpers/cargo-atlas-fixture.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { cargoBox, forklift, icon, PALETTE } from '../scripts/static-art-authoring/src/presentation/assets.ts';
import type { CargoStyleId, ForkliftId } from '../scripts/static-art-authoring/src/application/profile.ts';
import type { CargoId, CellTrait } from '../scripts/static-art-authoring/src/domain/types.ts';

const STYLES: CargoStyleId[] = ['wood', 'reinforced', 'taped', 'toy_brick', 'paper_fold', 'insulated', 'space_case', 'ice_crystal','steam_brass','neon_circuit','lava_core','ocean_relic','royal_gold','field_supply','harbor_container'];
const CARGOS: CargoId[] = ['cargo.food', 'cargo.machine', 'cargo.chem', 'cargo.electronic', 'cargo.cold'];
const TRAITS: (CellTrait | undefined)[] = [undefined, {kind:'rush',remaining:3}, {kind:'rush',remaining:2}, {kind:'rush',remaining:1}, {kind:'wildcard'}, {kind:'pallet'}, {kind:'hazard'}, {kind:'waste'}];
const SIZES = [110 * 7 / 9 / 3, 110 / 3, 110];
const PAINTS: ForkliftId[] = ['yellow', 'blue', 'red', 'white', 'electric', 'heavy', 'compact', 'toy', 'paper', 'space'];
const BASE = new URL('./fixtures/material-crate-shells-v016/', import.meta.url);
const hashes = JSON.parse(readFileSync(new URL('hashes.json', BASE), 'utf8')) as {classic: Record<string,string>; forklifts:Record<string,string>};
function surface(width=140,height=140) {const canvas=createCanvas(width,height),ctx=canvas.getContext('2d');return {canvas,ctx,context:ctx as unknown as CanvasRenderingContext2D};}
function crate(style:CargoStyleId,cargo:CargoId='cargo.cold',size=110,trait?:CellTrait,large=false,outline=false,legacyWasteLabel=false) {
 const out=surface();
 // The authorized v0.18 wording is excluded only from the frozen aggregate below.
 // Every non-waste pixel and the entire waste body still use the original hashes.
 if(legacyWasteLabel){const fill=out.ctx.fillText.bind(out.ctx);out.ctx.fillText=(value,x,y)=>fill(value==='废弃箱'?'废弃物':value,x,y);}
 cargoBox(out.context,cargo,10,10,size,1,trait,style,large,outline);return out;
}
const pixels=(out:ReturnType<typeof surface>)=>out.ctx.getImageData(0,0,out.canvas.width,out.canvas.height).data;

test('classic and legacy outline match frozen pixels with only the authorized waste label normalized',()=>{
 for(const size of SIZES)for(const style of ['classic','outline'] as const){const hash=createHash('sha256');
  for(const cargo of CARGOS)for(const trait of TRAITS)for(const large of [false,true])for(const outline of [false,true])hash.update(pixels(crate(style,cargo,size,trait,large,outline,true)));
  assert.equal(hash.digest('hex'),hashes.classic[`${style}/${size}`]);
 }
});

test('actual waste crates paint the new label at the existing position and font size for every shell',()=>{
 for(const style of ['classic','outline',...STYLES] as const)for(const size of SIZES){const out=surface(),labels:{value:string;x:number;y:number;font:string}[]=[],fill=out.ctx.fillText.bind(out.ctx);
  out.ctx.fillText=(value,x,y)=>{labels.push({value,x,y,font:out.ctx.font});fill(value,x,y);};cargoBox(out.context,'cargo.food',10,10,size,1,{kind:'waste'},style);
  assert.deepEqual(labels.map(({value,x,y})=>({value,x,y})),[{value:'废弃箱',x:54,y:87}]);assert.match(labels[0].font,/900 20px/);
 }
});

test('nine retained vector forklifts keep frozen pixels while the approved v024 heavy structure changes at 32 headings and four display sizes',()=>{
 for(const paint of PAINTS){const hash=createHash('sha256');for(const size of [...SIZES,80])for(let heading=0;heading<32;heading++){
  const out=surface(200,200);forklift(out.context,100,100,size,heading*Math.PI/16,paint);hash.update(pixels(out));
 }const actual=hash.digest('hex');
 if(paint==='heavy')assert.notEqual(actual,hashes.forklifts[paint],'approved v024 heavy structure replaces old heavy body');
 else assert.equal(actual,hashes.forklifts[paint],paint);}
});

test('each approved shell replaces substantial old shell pixels with the same cargo and icon at actual board sizes',async()=>{
 const previous=STYLES.filter(style=>!['ice_crystal','steam_brass','neon_circuit','lava_core','ocean_relic','royal_gold','field_supply','harbor_container'].includes(style)),order:CargoStyleId[]=['classic',...previous,'outline'];
 for(const [index,tag] of ['9x9','7x7','large'].entries()){
  const size=SIZES[index],tile=Math.ceil(size)+20,old=surface(order.length*tile,tile);
  old.ctx.drawImage(await loadImage(new URL(`normal-${tag}.png`,BASE).pathname),0,0);
  for(const style of previous){const before=old.ctx.getImageData(order.indexOf(style)*tile,0,tile,tile).data,after=crate(style,'cargo.cold',size).ctx.getImageData(0,0,tile,tile).data;
   let changed=0;for(let i=0;i<before.length;i+=4)if(Math.max(...[0,1,2,3].map(k=>Math.abs(before[i+k]-after[i+k])))>20)changed++;
   assert.ok(changed>size*size*.12,`${style}/${tag}: broad structure must replace old fine detail, changed ${changed}`);
  }
 }
});

test('generated paper, plastic, ice and metal bodies remain visually distinct',()=>{
 for(const [a,b] of [['taped','paper_fold'],['toy_brick','space_case'],['wood','reinforced'],['insulated','ice_crystal']] as const)for(const size of SIZES)assert.notDeepEqual(pixels(crate(a,'cargo.cold',size)),pixels(crate(b,'cargo.cold',size)));
});

test('all eight shells preserve every opaque original symbol, rush 3/2/1 and warning badge at 29/37/110px',()=>{
 for(const size of SIZES)for(const cargo of CARGOS){const mask=surface();mask.ctx.translate(10,10);mask.ctx.scale(size/110,size/110);icon(mask.context,cargo,48,60,54,cargo==='cargo.chem'?'#fff2ac':'#fff4da',PALETTE[cargo].ink);const glyph=pixels(mask);
  for(const trait of TRAITS)for(const large of [false,true])for(const outline of [false,true]){
   const base=pixels(crate('classic',cargo,size,trait,large,outline)),indices:number[]=[];
   for(let i=0;i<base.length;i+=4){const x=(i/4%140-10)*110/size,y=(Math.floor(i/4/140)-10)*110/size;
    const label=trait&&trait.kind!=='waste'&&(trait.kind==='rush'&&large?x>=36&&x<=76&&y>=8&&y<=40:x>=18&&x<=94&&y>=11&&y<=32);
    if(glyph[i+3]===255||label)indices.push(i);
   }
   assert.ok(indices.length>5,'comparison must contain real glyph/badge pixels');
   for(const style of STYLES){const next=pixels(crate(style,cargo,size,trait,large,outline));
    if(trait?.kind==='waste'){assert.deepEqual(next,base,`${style}: waste short circuit`);continue;}
    for(const i of indices)for(let ch=0;ch<4;ch++)assert.equal(next[i+ch],base[i+ch],`${style}/${cargo}/${trait?.kind}/${large}/${outline}/${size}: foreground ${i}`);
   }
  }
 }
});

test('shells and warnings stay inside the existing canvas envelope and restore caller state',()=>{
 for(const size of SIZES)for(const trait of TRAITS)for(const outline of [false,true]){
  const base=pixels(crate('classic','cargo.cold',size,trait,true,outline));const occupied=[];
  for(let i=0;i<base.length;i+=4)if(base[i+3])occupied.push(i/4);
  const xs=occupied.map(i=>i%140),ys=occupied.map(i=>Math.floor(i/140)),limit={left:Math.min(...xs),right:Math.max(...xs),top:Math.min(...ys),bottom:Math.max(...ys)};
  for(const style of STYLES){const next=crate(style,'cargo.cold',size,trait,true,outline),data=pixels(next);let opaque=0;
   for(let i=0;i<data.length;i+=4)if(data[i+3]){const x=i/4%140,y=Math.floor(i/4/140);assert.ok((x>=limit.left&&x<=limit.right&&y>=limit.top&&y<=limit.bottom)||(STYLES.includes(style)&&x>=10&&y>=10&&x<10+Math.ceil(size)&&y<10+Math.ceil(size)),`${style}: expanded cell envelope`);if(data[i+3]>=240)opaque++;}
   assert.ok(opaque>size*size*.45,`${style}: recognizable body coverage`);
   const state=surface();state.ctx.globalAlpha=.8;state.ctx.lineWidth=7;state.ctx.translate(2,3);const transform=state.ctx.getTransform();cargoBox(state.context,'cargo.food',10,10,size,.6,trait,style,true,outline);
   assert.equal(state.ctx.globalAlpha,.8);assert.equal(state.ctx.lineWidth,7);assert.deepEqual(state.ctx.getTransform(),transform);
  }
 }
});
