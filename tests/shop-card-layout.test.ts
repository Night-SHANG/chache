import './helpers/cargo-atlas-fixture.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createCanvas,type Canvas} from '@napi-rs/canvas';
import {getShopControls,cosmeticSetCardRect,COSMETIC_PREVIEW_RECT} from '../src/presentation/economy-ui.ts';
import {render} from '../src/presentation/renderer.ts';
import {createRunV14} from '../src/domain/v14/engine.ts';
import {createProfile} from '../src/application/profile.ts';
import {makeAccountFixture} from './helpers/account-fixtures.ts';
import {COSMETIC_CATALOG} from '../src/application/cosmetics.ts';
import {COSMETIC_SETS,SHOP_COSMETIC_SETS} from '../src/application/cosmetic-sets.ts';
import type {ViewState} from '../src/presentation/view-types.ts';
import type {CanvasSurface} from '../src/platform/types.ts';
import {configureCosmeticPreviewCache} from '../src/presentation/cosmetic-preview-cache.ts';
const state=createRunV14({seed:11,mode:'standard'});
const view=(patch:Partial<ViewState>={}):ViewState=>({screen:'shop',shopTab:'cosmetics',shopSection:'sets',selectedPieceId:null,hoverOrigin:null,preview:null,dragPoint:null,paused:false,message:'',saveStatus:'',elapsed:0,animation:null,debug:false,needsResume:false,profile:createProfile(),account:makeAccountFixture({wallet:900}),...patch});
const sectionCards=(v:ViewState)=>getShopControls(v).filter(c=>['previewCosmetic','previewCosmeticSet'].includes(c.action.type));
const disjoint=(a:{x:number;y:number;w:number;h:number},b:{x:number;y:number;w:number;h:number})=>a.x+a.w<=b.x||b.x+b.w<=a.x||a.y+a.h<=b.y||b.y+b.h<=a.y;

test('appearance lists four peer sections, four page-scoped set cards and four compact item tiles',()=>{
 const controls=getShopControls(view());
 assert.deepEqual(controls.filter(c=>c.action.type==='selectShopSection').map(c=>c.label),['套装','场景','货箱','叉车']);
 assert.equal(controls.some(c=>['selectCosmeticBrowse','selectCosmeticCategory'].includes(c.action.type)),false);
 const cards=sectionCards(view());assert.equal(cards.length,4);assert.deepEqual(cards.map(c=>c.rect),Array.from({length:4},(_,index)=>cosmeticSetCardRect(index)));
 assert.equal(controls.filter(c=>c.action.type==='selectCosmeticSetPage').length,2);
 const itemControls=getShopControls(view({shopSection:'cargo'})),tiles=sectionCards(view({shopSection:'cargo'}));
 assert.deepEqual(tiles.map(c=>c.rect),[{x:132,y:1110,w:396,h:150},{x:552,y:1110,w:396,h:150},{x:132,y:1280,w:396,h:150},{x:552,y:1280,w:396,h:150}]);
 assert.equal(itemControls.filter(c=>c.action.type==='selectCosmeticPage').length,2);assert.deepEqual(COSMETIC_PREVIEW_RECT,{x:132,y:750,w:816,h:232});
});

test('standard set detail keeps global tabs and member links while ordinary items keep Back left and action right',()=>{
 const set=getShopControls(view({cosmeticSetPreview:'cold_chain'}));
 assert.equal(set.filter(c=>c.action.type==='selectShopTab').length,2);assert.equal(set.filter(c=>c.action.type==='selectShopSection').length,4);
 assert.equal(set.some(c=>['previewCosmetic','previewCosmeticSet'].includes(c.action.type)),false);
 const setBack=set.find(c=>c.action.type==='closeShopDetail'),setAction=set.find(c=>c.action.type==='purchaseCosmeticSet');
 assert.ok(setBack);assert.ok(setAction);assert.ok(setBack.rect.x+setBack.rect.w<setAction.rect.x);assert.equal(setBack.buttonRole,'secondary');assert.equal(setAction.buttonRole,'primary');assert.equal(set.filter(c=>c.action.type==='previewCosmeticSetMember').length,3);
 const item=getShopControls(view({shopSection:'cargo',cosmeticPreview:{cargo:'wood'}})),back=item.find(c=>c.action.type==='back'),action=item.find(c=>c.action.type==='purchaseCosmetic');
 assert.equal(item.filter(c=>c.action.type==='selectShopTab').length,2);assert.equal(item.filter(c=>c.action.type==='selectShopSection').length,4);assert.equal(item.filter(c=>c.action.type==='previewCosmetic').length,4);assert.equal(item.some(c=>c.action.type==='closeShopDetail'||c.action.type==='previewCosmeticSetMember'),false);
 assert.ok(back);assert.ok(action);assert.ok(back.rect.x+back.rect.w<action.rect.x);assert.equal(back.buttonRole,'secondary');assert.equal(action.buttonRole,'primary');
});

test('every section pages through every catalog entry with disabled bounds, disjoint controls and 44px targets',async()=>{
 const layout=await import('../src/presentation/shop-layout.ts');
 for(const section of ['sets','theme','cargo','forklift'] as const){
  const catalog=section==='sets'?SHOP_COSMETIC_SETS:COSMETIC_CATALOG.filter(c=>c.kind===section),seen:string[]=[],pages=Math.ceil(catalog.length/4);
  for(let page=0;page<pages;page++){
   const current=view(section==='sets'?{shopSection:section,cosmeticSetPage:page}:{shopSection:section,cosmeticPreview:{[section]:catalog[page*4].id}}),controls=getShopControls(current),cards=sectionCards(current);
   assert.equal(layout.shopScrollLimit(current),0);assert.equal(layout.shopScrollOffset({...current,shopScroll:{[section]:500}}),0);assert.equal(cards.length,Math.min(4,catalog.length-page*4));
   for(const [i,c]of controls.entries()){
    assert.ok(c.rect.w*320/1080>=44&&c.rect.h*320/1080>=44,c.action.type);assert.ok(c.rect.x>=0&&c.rect.x+c.rect.w<=1080&&c.rect.y>=0&&c.rect.y+c.rect.h<=1856);for(const other of controls.slice(i+1))assert.ok(disjoint(c.rect,other.rect));
    if(c.action.type==='previewCosmetic'||c.action.type==='previewCosmeticSet')seen.push(c.action.id);
   }
   const previous=controls.find(c=>c.label==='上一页'),next=controls.find(c=>c.label==='下一页');assert.ok(previous);assert.ok(next);assert.equal(!!previous.disabled,page===0);assert.equal(!!next.disabled,page===pages-1);
  }
  assert.deepEqual(seen,catalog.map(item=>item.id));assert.equal(new Set(seen).size,catalog.length);
 }
 // This rectangle remains an internal drag-cancellation boundary, with zero overflow.
 assert.equal(layout.shopListViewport(view({cosmeticSetPreview:'cold_chain'})),null);
});

test('page artwork cache stays bounded, reuses current cards and keeps wallet and item selection live',()=>{
 const surfaces:Canvas[]=[],ctx=createCanvas(320,569).getContext('2d') as unknown as CanvasRenderingContext2D;ctx.scale(320/1080,320/1080);
 configureCosmeticPreviewCache(()=>{const c=createCanvas(1,1);surfaces.push(c);return c as unknown as CanvasSurface;});
 const bounded=()=>{assert.ok(surfaces.filter(s=>s.width>1).length<=5);assert.ok(surfaces.reduce((sum,s)=>sum+(s.width>1?s.width*s.height*4:0),0)<=5_000_000);};
 try{
  const v=view();render(ctx,state,v);const allocated=surfaces.length;assert.equal(allocated,4,'four visible set previews fit the bounded cache');
  for(let i=0;i<5;i++)render(ctx,state,v);assert.equal(surfaces.length,allocated);
  const labels:string[]=[],original=ctx.fillText.bind(ctx);ctx.fillText=(value,x,y)=>{labels.push(value);original(value,x,y);};render(ctx,state,{...v,account:makeAccountFixture({wallet:1234})});assert.ok(labels.includes('金币 1234'));assert.equal(surfaces.length,allocated);
  for(let page=1;page<4;page++){const before:number=surfaces.length;render(ctx,state,view({cosmeticSetPage:page}));assert.equal(surfaces.length,before+Math.min(4,15-page*4));const cold:number=surfaces.length;render(ctx,state,view({cosmeticSetPage:page}));assert.equal(surfaces.length,cold);bounded();}
  const before:number=surfaces.length;render(ctx,state,view({shopSection:'cargo',cosmeticPreview:{cargo:'wood'}}));assert.ok(labels.includes('原木藤箱'));render(ctx,state,view({shopSection:'cargo',cosmeticPreview:{cargo:'insulated'}}));assert.ok(labels.includes('保温周转箱'));assert.equal(surfaces.length,before,'same-screen item banners use their direct painter');bounded();
  render(ctx,state,view({classicSetSelection:{theme:'night',cargo:'outline',forklift:'white'}}));const selected=surfaces.length;render(ctx,state,view({classicSetSelection:{theme:'night',cargo:'outline',forklift:'white'}}));assert.equal(surfaces.length,selected);bounded();
 }finally{configureCosmeticPreviewCache();}
});

test('classic preset is pinned before the fourteen paid sets without expanding the 50-item catalog',()=>{
 const cards=sectionCards(view());assert.equal(cards[0].action.type,'previewCosmeticSet');assert.equal('id'in cards[0].action?cards[0].action.id:undefined,'classic');assert.match(cards[0].label,/经典套装/);assert.equal(COSMETIC_CATALOG.length,50);assert.equal(COSMETIC_SETS.length,14);
});

test('classic detail has compact preview-only variants and owned-state primary route with 44px targets',()=>{
 const v=view({cosmeticSetPreview:'classic'}),controls=getShopControls(v),variants=controls.filter(c=>c.action.type==='selectClassicSetVariant');
 assert.deepEqual(variants.map(c=>c.action.type==='selectClassicSetVariant'?[c.action.kind,c.action.id]:[]),[['theme','day'],['theme','night'],['cargo','classic'],['cargo','outline'],['forklift','yellow'],['forklift','blue'],['forklift','red'],['forklift','white']]);
 assert.ok(controls.some(c=>c.action.type==='equipClassicSet'));assert.equal(controls.some(c=>c.action.type==='purchaseCosmeticSet'),false);
 for(const [i,c]of controls.entries()){assert.ok(c.rect.w*320/1080>=44&&c.rect.h*320/1080>=44);for(const b of controls.slice(i+1))assert.ok(disjoint(c.rect,b.rect));}
 const missing=getShopControls(view({cosmeticSetPreview:'classic',classicSetSelection:{theme:'night',cargo:'outline',forklift:'white'}}));assert.ok(missing.some(c=>c.action.type==='purchaseCosmetic'&&c.action.kind==='forklift'&&c.action.id==='white'));assert.equal(missing.some(c=>c.action.type==='purchaseCosmeticSet'),false);
});

test('cached page art is exact across cold and warm frames and leaves pixels outside the art region unchanged',()=>{
 for(const width of [320,360,540])for(const section of ['sets','theme','cargo','forklift'] as const){
  const dpr=width===320?3:2,canvas=createCanvas(width*dpr,Math.ceil(width*1920/1080)*dpr),ctx=canvas.getContext('2d') as unknown as CanvasRenderingContext2D,v=view(section==='sets'?{shopSection:section,cosmeticSetPage:1}:{shopSection:section,cosmeticPreview:{[section]:COSMETIC_CATALOG.filter(item=>item.kind===section)[4].id}}),scale=width*dpr/1080;ctx.scale(scale,scale);
  const digest=(outside=false)=>{const pixels=ctx.getImageData(0,0,canvas.width,canvas.height).data,hash=createHash('sha256'),left=Math.floor((section==='sets'?150:132)*scale),right=Math.ceil((section==='sets'?930:948)*scale),top=Math.floor((section==='sets'?648:750)*scale),bottom=Math.ceil((section==='sets'?1296:982)*scale);
   if(!outside)return hash.update(pixels).digest('hex');for(let y=0;y<canvas.height;y++){const row=y*canvas.width*4;if(y<top||y>=bottom)hash.update(pixels.subarray(row,row+canvas.width*4));else{hash.update(pixels.subarray(row,row+left*4));hash.update(pixels.subarray(row+right*4,row+canvas.width*4));}}return hash.digest('hex');};
  configureCosmeticPreviewCache();render(ctx,state,v);const outside=digest(true);
  configureCosmeticPreviewCache(()=>createCanvas(1,1) as unknown as CanvasSurface);
  // Fractional per-primitive and cached artwork edges can have separately reviewed AA differences.
  // Do not introduce a fuzzy pixel tolerance: the protected comparisons below remain exact.
  try{ctx.clearRect(0,0,1080,1920);render(ctx,state,v);assert.equal(digest(true),outside,`${width}/${section} outside`);const cold=digest();ctx.clearRect(0,0,1080,1920);render(ctx,state,v);assert.equal(digest(),cold,`${width}/${section} warm`);}finally{configureCosmeticPreviewCache();}
 }
});

test('individual preview painters normalize inherited stroke state without changing the caller',async()=>{
 const {paintShopItemPreview}=await import('../src/presentation/shop-art.ts');
 for(const category of ['cargo','forklift'] as const){const hashes:string[]=[];for(const style of ['round','miter'] as const){const ctx=createCanvas(400,300).getContext('2d') as unknown as CanvasRenderingContext2D;ctx.lineJoin=style;ctx.lineCap=style==='round'?'round':'square';ctx.setLineDash(style==='round'?[3,2]:[]);paintShopItemPreview(ctx,{x:0,y:0,w:400,h:300},{category,cargoStyle:'classic',forklift:'yellow'});hashes.push(createHash('sha256').update(ctx.getImageData(0,0,400,300).data).digest('hex'));assert.equal(ctx.lineJoin,style);assert.deepEqual(ctx.getLineDash(),style==='round'?[3,2]:[]);}assert.equal(hashes[0],hashes[1],category);}
});
