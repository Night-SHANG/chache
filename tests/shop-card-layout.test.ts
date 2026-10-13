import {prepareViewArt} from './helpers/static-art-fixture.ts';
import './helpers/cargo-atlas-fixture.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createCanvas,type Canvas} from '@napi-rs/canvas';
import {getShopControls,COSMETIC_PREVIEW_RECT} from '../src/presentation/economy-ui.ts';
import {render} from '../src/presentation/renderer.ts';
import {createRunV14} from '../src/domain/v14/engine.ts';
import {createProfile} from '../src/application/profile.ts';
import {makeAccountFixture} from './helpers/account-fixtures.ts';
import {COSMETIC_CATALOG} from '../src/application/cosmetics.ts';
import type {ViewState} from '../src/presentation/view-types.ts';
import type {CanvasSurface} from '../src/platform/types.ts';
import {configureCosmeticPreviewCache} from '../src/presentation/cosmetic-preview-cache.ts';
const state=createRunV14({seed:11,mode:'standard'});
const view=(patch:Partial<ViewState>={}):ViewState=>({screen:'shop',shopTab:'cosmetics',shopSection:'theme',selectedPieceId:null,hoverOrigin:null,preview:null,dragPoint:null,paused:false,message:'',saveStatus:'',elapsed:0,animation:null,debug:false,needsResume:false,profile:createProfile(),account:makeAccountFixture({wallet:900}),...patch});
const sectionCards=(v:ViewState)=>getShopControls(v).filter(c=>['previewCosmetic','previewCosmeticSet'].includes(c.action.type));
const disjoint=(a:{x:number;y:number;w:number;h:number},b:{x:number;y:number;w:number;h:number})=>a.x+a.w<=b.x||b.x+b.w<=a.x||a.y+a.h<=b.y||b.y+b.h<=a.y;

test('appearance lists three peer categories and four compact inline tiles without set cards',()=>{
 const controls=getShopControls(view());
 assert.deepEqual(controls.filter(c=>c.action.type==='selectShopSection').map(c=>c.label),['场景','货箱','叉车']);
 assert.deepEqual(controls.filter(c=>c.action.type==='selectShopSection').map(c=>c.rect),[{x:132,y:414,w:256,h:150},{x:412,y:414,w:256,h:150},{x:692,y:414,w:256,h:150}]);
 assert.equal(controls.some(c=>['selectCosmeticBrowse','selectCosmeticCategory','previewCosmeticSet','selectCosmeticSetPage'].includes(c.action.type)),false);
 for(const shopSection of ['theme','cargo','forklift'] as const){
  const itemControls=getShopControls(view({shopSection})),tiles=sectionCards(view({shopSection}));
  assert.deepEqual(tiles.map(c=>c.rect),[{x:132,y:1110,w:396,h:150},{x:552,y:1110,w:396,h:150},{x:132,y:1280,w:396,h:150},{x:552,y:1280,w:396,h:150}]);
  assert.equal(itemControls.filter(c=>c.action.type==='selectCosmeticPage').length,2);
 }
 assert.deepEqual(COSMETIC_PREVIEW_RECT,{x:132,y:750,w:816,h:232});
});

test('inline items retain global tabs and Back left, action right, with no detail route',()=>{
 const item=getShopControls(view({shopSection:'cargo',cosmeticPreview:{cargo:'insulated'}})),back=item.find(c=>c.action.type==='back'),action=item.find(c=>c.action.type==='purchaseCosmetic');
 assert.equal(item.filter(c=>c.action.type==='selectShopTab').length,2);assert.equal(item.filter(c=>c.action.type==='selectShopSection').length,3);assert.equal(item.filter(c=>c.action.type==='previewCosmetic').length,4);
 assert.equal(item.some(c=>['closeShopDetail','previewCosmeticSetMember','purchaseCosmeticSet','equipCosmeticSet','equipClassicSet'].includes(c.action.type)),false);
 assert.ok(back);assert.ok(action);assert.ok(back.rect.x+back.rect.w<action.rect.x);assert.equal(back.buttonRole,'secondary');assert.equal(action.buttonRole,'primary');
 assert.deepEqual(back.rect,{x:132,y:1640,w:264,h:150});assert.deepEqual(action.rect,{x:420,y:1640,w:528,h:150});
});

test('every section pages through every catalog entry with disabled bounds, disjoint controls and 44px targets',async()=>{
 const layout=await import('../src/presentation/shop-layout.ts');
 for(const section of ['theme','cargo','forklift'] as const){
  const catalog=COSMETIC_CATALOG.filter(c=>c.kind===section),seen:string[]=[],pages=Math.ceil(catalog.length/4);
  for(let page=0;page<pages;page++){
   const current=view({shopSection:section,cosmeticPreview:{[section]:catalog[page*4].id}}),controls=getShopControls(current),cards=sectionCards(current);
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

test('page artwork uses ready images with zero surface allocation while wallet and item selection stay live',async()=>{
 const surfaces:Canvas[]=[],ctx=createCanvas(320,569).getContext('2d') as unknown as CanvasRenderingContext2D;ctx.scale(320/1080,320/1080);
 configureCosmeticPreviewCache(()=>{const c=createCanvas(1,1);surfaces.push(c);return c as unknown as CanvasSurface;});
 const labels:string[]=[],fill=ctx.fillText.bind(ctx);ctx.fillText=(value,x,y)=>{labels.push(value);fill(value,x,y);};
 const paint=async(v:ViewState)=>{await prepareViewArt(v);render(ctx,state,v);assert.equal(surfaces.length,0,'static art never creates an offscreen surface');};
 try{
  const v=view();await paint(v);for(let i=0;i<5;i++)await paint(v);
  await paint({...v,account:makeAccountFixture({wallet:1234})});assert.ok(labels.includes('金币 1234'));
  for(const shopSection of ['theme','cargo','forklift'] as const)for(const item of COSMETIC_CATALOG.filter(item=>item.kind===shopSection)){await paint(view({shopSection,cosmeticPreview:{[shopSection]:item.id}}));}
  await paint(view({shopSection:'cargo',cosmeticPreview:{cargo:'reinforced'}}));assert.ok(labels.includes('铆接钢箱'));
  await paint(view({shopSection:'cargo',cosmeticPreview:{cargo:'insulated'}}));assert.ok(labels.includes('保温周转箱'));
  const selected=view({shopSection:'forklift',cosmeticPreview:{forklift:'white'}});await paint(selected);await paint(selected);
 }finally{configureCosmeticPreviewCache();}
});

test('the reduced catalog exposes exactly 29 individual cosmetics and no classic or set card',()=>{
 assert.equal(COSMETIC_CATALOG.length,29);
 assert.deepEqual(['theme','cargo','forklift'].map(kind=>COSMETIC_CATALOG.filter(item=>item.kind===kind).length),[9,9,11]);
 for(const legacy of [{shopSection:'sets' as const},{cosmeticSetPreview:'classic'},{cosmeticSetPreview:'cold_chain'}]){
  const controls=getShopControls(view(legacy));assert.equal(controls.filter(c=>c.action.type==='previewCosmetic').length,4);
  assert.equal(controls.some(c=>['previewCosmeticSet','selectClassicSetVariant','previewCosmeticSetMember','purchaseCosmeticSet','equipCosmeticSet','equipClassicSet','closeShopDetail'].includes(c.action.type)),false);
 }
});

test('ready page images are exact across repeated frames and ignore legacy surface-cache configuration',async()=>{
 for(const width of [320,360,540])for(const section of ['theme','cargo','forklift'] as const){
  const dpr=width===320?3:2,canvas=createCanvas(width*dpr,Math.ceil(width*1920/1080)*dpr),ctx=canvas.getContext('2d') as unknown as CanvasRenderingContext2D,v=view({shopSection:section,cosmeticPreview:{[section]:COSMETIC_CATALOG.filter(item=>item.kind===section)[4].id}}),scale=width*dpr/1080;ctx.scale(scale,scale);
  const digest=(outside=false)=>{const pixels=ctx.getImageData(0,0,canvas.width,canvas.height).data,hash=createHash('sha256'),left=Math.floor(132*scale),right=Math.ceil(948*scale),top=Math.floor(750*scale),bottom=Math.ceil(982*scale);
   if(!outside)return hash.update(pixels).digest('hex');for(let y=0;y<canvas.height;y++){const row=y*canvas.width*4;if(y<top||y>=bottom)hash.update(pixels.subarray(row,row+canvas.width*4));else{hash.update(pixels.subarray(row,row+left*4));hash.update(pixels.subarray(row+right*4,row+canvas.width*4));}}return hash.digest('hex');};
  await prepareViewArt(v);configureCosmeticPreviewCache();render(ctx,state,v);const outside=digest(true);
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
