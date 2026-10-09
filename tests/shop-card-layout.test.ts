import './helpers/cargo-atlas-fixture.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createCanvas,type Canvas} from '@napi-rs/canvas';
import type {Rect} from '../src/presentation/layout.ts';
import {getShopControls} from '../src/presentation/economy-ui.ts';
import {render} from '../src/presentation/renderer.ts';
import {createRunV14} from '../src/domain/v14/engine.ts';
import {createProfile} from '../src/application/profile.ts';
import {makeAccountFixture} from './helpers/account-fixtures.ts';
import {COSMETIC_CATALOG} from '../src/application/cosmetics.ts';
import {COSMETIC_SETS} from '../src/application/cosmetic-sets.ts';
import type {ViewState} from '../src/presentation/view-types.ts';
import type {CanvasSurface} from '../src/platform/types.ts';
import {configureCosmeticPreviewCache} from '../src/presentation/cosmetic-preview-cache.ts';
const state=createRunV14({seed:11,mode:'standard'});
const view=(patch:Partial<ViewState>={}):ViewState=>({screen:'shop',shopTab:'cosmetics',shopSection:'sets',selectedPieceId:null,hoverOrigin:null,preview:null,dragPoint:null,paused:false,message:'',saveStatus:'',elapsed:0,animation:null,debug:false,needsResume:false,profile:createProfile(),account:makeAccountFixture({wallet:900}),...patch});
const sectionCards=(v:ViewState)=>getShopControls(v).filter(c=>['previewCosmetic','previewCosmeticSet'].includes(c.action.type));
const disjoint=(a:{x:number;y:number;w:number;h:number},b:{x:number;y:number;w:number;h:number})=>a.x+a.w<=b.x||b.x+b.w<=a.x||a.y+a.h<=b.y||b.y+b.h<=a.y;

test('appearance lists four peer sections with image-sized two-column cards and no pagination or singles layer',()=>{
 const controls=getShopControls(view());
 assert.deepEqual(controls.filter(c=>c.action.type==='selectShopSection').map(c=>c.label),['套装','场景','货箱','叉车']);
 assert.equal(controls.some(c=>['selectCosmeticBrowse','selectCosmeticCategory','selectCosmeticPage','selectCosmeticSetPage'].includes(c.action.type)),false);
 const cards=sectionCards(view());assert.ok(cards.length>=4);assert.deepEqual([...new Set(cards.map(c=>c.rect.x))],[132,552]);assert.ok(cards.every(c=>c.rect.h>=150&&c.rect.w===396));
});

test('item and set details are independent pages with left back, right action and only set member links',()=>{
 for(const patch of [{cosmeticSetPreview:'cold_chain'},{shopSection:'cargo',shopItemDetail:{kind:'cargo',id:'wood'}}] as const){
  const controls=getShopControls(view(patch));assert.equal(controls.some(c=>['selectShopTab','selectShopSection','previewCosmetic','previewCosmeticSet'].includes(c.action.type)),false);
  const back=controls.find(c=>c.action.type==='closeShopDetail'),action=controls.find(c=>['purchaseCosmetic','purchaseCosmeticSet','equipCosmetic','equipCosmeticSet'].includes(c.action.type));
  assert.ok(back);assert.ok(action);assert.ok(back.rect.x+back.rect.w<action.rect.x);assert.equal(back.buttonRole,'secondary');assert.equal(action.buttonRole,'primary');
  assert.equal(controls.filter(c=>c.action.type==='previewCosmeticSetMember').length,'cosmeticSetPreview'in patch?3:0);
 }
});

test('every section scrolls to every catalog item with clipped controls never under 44 CSS pixels or outside viewport',async()=>{
 const layout=await import('../src/presentation/shop-layout.ts').catch(()=>null);assert.ok(layout,'shared shop geometry exists');
 for(const section of ['sets','theme','cargo','forklift'] as const){
  const count=section==='sets'?COSMETIC_SETS.length+1:COSMETIC_CATALOG.filter(c=>c.kind===section).length,seen=new Set<string>(),v=view({shopSection:section});const viewport:Rect=layout.shopListViewport(v)!;
  assert.deepEqual(viewport,{x:132,y:600,w:816,h:1020});assert.equal(layout.shopScrollLimit(v),Math.max(0,Math.ceil(count/2)*364-24-1020));
  for(let offset=0;offset<=layout.shopScrollLimit(v)+150;offset+=50){
   const current={...v,shopScroll:{[section]:offset}},controls=getShopControls(current);
   for(const [i,c]of controls.entries()){
    assert.ok(c.rect.w*320/1080>=44&&c.rect.h*320/1080>=44,c.action.type);for(const other of controls.slice(i+1))assert.ok(disjoint(c.rect,other.rect));
    if(c.action.type==='previewCosmetic'||c.action.type==='previewCosmeticSet'){seen.add(c.action.id);assert.ok(c.rect.y>=viewport.y&&c.rect.y+c.rect.h<=viewport.y+viewport.h);}
   }
  }
  assert.equal(seen.size,count);
 }
 assert.equal(layout.shopListViewport(view({cosmeticSetPreview:'cold_chain'})),null);assert.equal(layout.shopListViewport(view({shopItemDetail:{kind:'cargo',id:'wood'}})),null);
});

test('list artwork cache is bounded, reused while wallet stays live, and keyed by section and scroll',()=>{
 const surfaces:Canvas[]=[],ctx=createCanvas(320,569).getContext('2d') as unknown as CanvasRenderingContext2D;ctx.scale(320/1080,320/1080);
 configureCosmeticPreviewCache(()=>{const c=createCanvas(1,1);surfaces.push(c);return c as unknown as CanvasSurface;});
 try{
  const v=view();render(ctx,state,v);const allocated=surfaces.length;assert.equal(allocated,1,'one composite prevents six-card LRU thrashing');
  for(let i=0;i<5;i++)render(ctx,state,v);assert.equal(surfaces.length,allocated);
  const labels:string[]=[],original=ctx.fillText.bind(ctx);ctx.fillText=(value,x,y)=>{labels.push(value);original(value,x,y);};render(ctx,state,{...v,account:makeAccountFixture({wallet:1234})});assert.ok(labels.includes('金币 1234'));assert.equal(surfaces.length,allocated);
  render(ctx,state,view({shopSection:'cargo'}));assert.equal(surfaces.length,allocated+1);render(ctx,state,view({shopSection:'cargo',shopScroll:{cargo:150}}));assert.equal(surfaces.length,allocated+2);
  assert.ok(surfaces.filter(s=>s.width>1).length<=5);assert.ok(surfaces.reduce((sum,s)=>sum+(s.width>1?s.width*s.height*4:0),0)<=5_000_000);
 }finally{configureCosmeticPreviewCache();}
});

test('classic preset is pinned before the fifteen paid sets without expanding the 53-item catalog',()=>{
 const cards=sectionCards(view());assert.equal(cards[0].action.type,'previewCosmeticSet');assert.equal('id'in cards[0].action?cards[0].action.id:undefined,'classic');assert.match(cards[0].label,/经典套装/);assert.equal(COSMETIC_CATALOG.length,53);assert.equal(COSMETIC_SETS.length,15);
});

test('classic detail has compact preview-only variants and owned-state primary route with 44px targets',()=>{
 const v=view({cosmeticSetPreview:'classic'}),controls=getShopControls(v),variants=controls.filter(c=>c.action.type==='selectClassicSetVariant');
 assert.deepEqual(variants.map(c=>c.action.type==='selectClassicSetVariant'?[c.action.kind,c.action.id]:[]),[['theme','day'],['theme','night'],['cargo','classic'],['cargo','outline'],['forklift','yellow'],['forklift','blue'],['forklift','red'],['forklift','white']]);
 assert.ok(controls.some(c=>c.action.type==='equipClassicSet'));assert.equal(controls.some(c=>c.action.type==='purchaseCosmeticSet'),false);
 for(const [i,c]of controls.entries()){assert.ok(c.rect.w*320/1080>=44&&c.rect.h*320/1080>=44);for(const b of controls.slice(i+1))assert.ok(disjoint(c.rect,b.rect));}
 const missing=getShopControls(view({cosmeticSetPreview:'classic',classicSetSelection:{theme:'night',cargo:'outline',forklift:'white'}}));assert.ok(missing.some(c=>c.action.type==='purchaseCosmetic'&&c.action.kind==='forklift'&&c.action.id==='white'));assert.equal(missing.some(c=>c.action.type==='purchaseCosmeticSet'),false);
});

test('cached card art is exact across cold and warm frames and leaves pixels outside the viewport unchanged',()=>{
 for(const width of [320,360,540])for(const section of ['sets','theme','cargo','forklift'] as const){
  const dpr=width===320?3:2,canvas=createCanvas(width*dpr,Math.ceil(width*1920/1080)*dpr),ctx=canvas.getContext('2d') as unknown as CanvasRenderingContext2D,v=view({shopSection:section,shopScroll:{[section]:183.5}}),scale=width*dpr/1080;ctx.scale(scale,scale);
  const digest=(outside=false)=>{const pixels=ctx.getImageData(0,0,canvas.width,canvas.height).data,hash=createHash('sha256'),left=Math.floor(132*scale),right=Math.ceil(948*scale),top=Math.floor(600*scale),bottom=Math.ceil(1620*scale);
   if(!outside)return hash.update(pixels).digest('hex');for(let y=0;y<canvas.height;y++){const row=y*canvas.width*4;if(y<top||y>=bottom)hash.update(pixels.subarray(row,row+canvas.width*4));else{hash.update(pixels.subarray(row,row+left*4));hash.update(pixels.subarray(row+right*4,row+canvas.width*4));}}return hash.digest('hex');};
  configureCosmeticPreviewCache();render(ctx,state,v);const outside=digest(true);
  configureCosmeticPreviewCache(()=>createCanvas(1,1) as unknown as CanvasSurface);
  // Fractional per-primitive and composite clipping have separately reviewed edge AA differences.
  // Do not introduce a fuzzy pixel tolerance: the protected comparisons below remain exact.
  try{ctx.clearRect(0,0,1080,1920);render(ctx,state,v);assert.equal(digest(true),outside,`${width}/${section} outside`);const cold=digest();ctx.clearRect(0,0,1080,1920);render(ctx,state,v);assert.equal(digest(),cold,`${width}/${section} warm`);}finally{configureCosmeticPreviewCache();}
 }
});

test('individual preview painters normalize inherited stroke state without changing the caller',async()=>{
 const {paintShopItemPreview}=await import('../src/presentation/shop-art.ts');
 for(const category of ['cargo','forklift'] as const){const hashes:string[]=[];for(const style of ['round','miter'] as const){const ctx=createCanvas(400,300).getContext('2d') as unknown as CanvasRenderingContext2D;ctx.lineJoin=style;ctx.lineCap=style==='round'?'round':'square';ctx.setLineDash(style==='round'?[3,2]:[]);paintShopItemPreview(ctx,{x:0,y:0,w:400,h:300},{category,cargoStyle:'classic',forklift:'yellow'});hashes.push(createHash('sha256').update(ctx.getImageData(0,0,400,300).data).digest('hex'));assert.equal(ctx.lineJoin,style);assert.deepEqual(ctx.getLineDash(),style==='round'?[3,2]:[]);}assert.equal(hashes[0],hashes[1],category);}
});
