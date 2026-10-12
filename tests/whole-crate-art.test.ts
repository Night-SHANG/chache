// Historical authoring contract: hashes and assertions remain unchanged; runtime textures are covered separately.
import './helpers/cargo-atlas-fixture.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createCanvas } from '@napi-rs/canvas';
import { cargoBox } from '../scripts/static-art-authoring/src/presentation/assets.ts';
import type { CargoStyleId } from '../scripts/static-art-authoring/src/application/profile.ts';
import type { CargoId, CellTrait } from '../scripts/static-art-authoring/src/domain/types.ts';

const CARGOS:CargoId[]=['cargo.food','cargo.machine','cargo.chem','cargo.electronic','cargo.cold'];
const SIZES=[110*7/9/3,110/3,110];
const CHANGED:CargoStyleId[]=['wood','insulated','reinforced','taped','toy_brick','paper_fold','space_case','ice_crystal','steam_brass','neon_circuit','lava_core','ocean_relic','royal_gold','field_supply'];
const UNCHANGED:CargoStyleId[]=['classic','outline'];
const TRAITS:(CellTrait|undefined)[]=[undefined,{kind:'rush',remaining:3},{kind:'rush',remaining:2},{kind:'rush',remaining:1},{kind:'hazard'},{kind:'pallet'},{kind:'wildcard'},{kind:'waste'}];
const baseline=JSON.parse(readFileSync(new URL('./fixtures/whole-crates-v017.json',import.meta.url),'utf8')) as Record<string,string>;
function render(style:CargoStyleId,cargo:CargoId,size:number,trait?:CellTrait,outline=false) {
 const ctx=createCanvas(140,140).getContext('2d');cargoBox(ctx as unknown as CanvasRenderingContext2D,cargo,10,10,size,1,trait,style,true,outline);return ctx.getImageData(0,0,140,140).data;
}
function digest(style:CargoStyleId){const hash=createHash('sha256');for(const size of SIZES)for(const cargo of CARGOS)for(const trait of TRAITS)for(const outline of [false,true])hash.update(render(style,cargo,size,trait,outline));return hash.digest('hex');}

test('approved wood and steel replace the v0.17 whole body at board and shop scale',()=>{
 for(const style of ['wood','reinforced'] as const)assert.notEqual(digest(style),baseline[style],`${style} must not retain the old shell`);
});
test('ice crystals are their own material and preserve the five full-face cargo colors',()=>{
 for(const size of SIZES)for(const cargo of CARGOS){const ice=render('ice_crystal',cargo,size);assert.notDeepEqual(ice,render('space_case',cargo,size),'new style must not fall through to space case');
  const middle=(cargo==='cargo.food'?[233,88,75]:cargo==='cargo.machine'?[118,167,77]:cargo==='cargo.chem'?[239,185,56]:cargo==='cargo.electronic'?[143,112,209]:[89,181,231]);
  for(const style of CHANGED){const data=render(style,cargo,size);let hue=0,solid=0;
   for(let i=0;i<data.length;i+=4){if(data[i+3]<240)continue;solid++;const rgb=[data[i],data[i+1],data[i+2]],hi=middle.indexOf(Math.max(...middle)),lo=middle.indexOf(Math.min(...middle));if(rgb[hi]-rgb[lo]>25&&rgb[hi]>rgb[(hi+1)%3]-12&&rgb[hi]>rgb[(hi+2)%3]-12)hue++;}
   assert.ok(hue/solid>.32,`${style}/${cargo}/${size}: the cargo hue must cover a substantial whole body, ${hue}/${solid}`);
  }
 }
});
test('all unmodified materials retain frozen pixels in every color and state with authorized waste wording',()=>{
 for(const style of UNCHANGED)assert.equal(digest(style),baseline[style],style);
});
test('whole crates fit the original 110-unit cell with the original outline and restore caller context',()=>{
 for(const style of CHANGED)for(const size of SIZES)for(const trait of TRAITS)for(const outline of [false,true]){
  const data=render(style,'cargo.cold',size,trait,outline),base=render('classic','cargo.cold',size,trait,outline);let occupied=0;
  for(let i=0;i<data.length;i+=4)if(data[i+3]>0){occupied++;const x=i/4%140,y=Math.floor(i/4/140);assert.ok(base[i+3]>0||(x>=10&&y>=10&&x<10+Math.ceil(size)&&y<10+Math.ceil(size)),`${style}/${size}: spill ${x},${y}`);}
  assert.ok(occupied>size*size*.65);
  const ctx=createCanvas(160,160).getContext('2d');ctx.globalAlpha=.7;ctx.lineWidth=6;ctx.lineCap='square';ctx.lineJoin='bevel';ctx.translate(3,4);const state=ctx.getTransform(),alpha=ctx.globalAlpha;
  cargoBox(ctx as unknown as CanvasRenderingContext2D,'cargo.food',10,10,size,.5,trait,style,true,outline);
  assert.equal(ctx.globalAlpha,alpha);assert.equal(ctx.lineWidth,6);assert.equal(ctx.lineCap,'square');assert.equal(ctx.lineJoin,'bevel');assert.deepEqual(ctx.getTransform(),state);
 }
});
