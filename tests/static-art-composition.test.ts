import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=(name:string)=>readFileSync(new URL(`../src/presentation/${name}.ts`,import.meta.url),'utf8');
test('runtime static artwork uses ready-image composition without painter or surface cache fallback',()=>{
 for(const name of ['warehouse-art','cosmetic-art','tool-art']){
  const code=source(name);
  assert.doesNotMatch(code,/drawCached|createCanvas|drawReferenceBackground|drawColdChain|drawRailFreight|drawPlayfulBackground/,name);
  assert.match(code,/drawStaticArtSprite|drawStaticPreviewBackground/,name);
 }
 assert.doesNotMatch(source('assets'),/drawStructuralForkliftBody|drawThemedForkliftBody|drawPlayfulForkliftBody|drawLogisticsForkliftBody|drawMaterialCrate|drawCrateFrame/);
 assert.doesNotMatch(source('board-theme'),/function drawMaterial|function frameMotif/);
 assert.doesNotMatch(source('renderer')+source('shop-art'),/drawCachedWarehouse|drawCachedCosmetic/);
});

import {createCanvas,loadImage} from '@napi-rs/canvas';
import {STATIC_ART_RESOURCES,STATIC_ART_SCENES,STATIC_ART_PREVIEWS,STATIC_ART_FORKLIFTS,STATIC_ART_CARGO} from '../src/presentation/static-art-manifest.ts';
import {configureStaticArt,prepareStaticArt} from '../src/presentation/static-art-resources.ts';
import {drawStaticArtSprite,drawStaticPreviewBackground,staticPreviewShape} from '../src/presentation/static-art-draw.ts';
import {drawWarehouse} from '../src/presentation/warehouse-art.ts';
import {forklift,cargoBox} from '../src/presentation/assets.ts';
import {CARGO_ATLAS} from '../src/presentation/cargo-atlas.ts';
import {drawThemedBoard} from '../src/presentation/board-theme.ts';
import {drawCosmeticPreview} from '../src/presentation/cosmetic-art.ts';
import {boardGeometry} from '../src/presentation/board-geometry.ts';
import {render} from '../src/presentation/renderer.ts';
import {drawToolIcon,drawToolboxIcon} from '../src/presentation/tool-art.ts';
import {createProfile} from '../src/application/profile.ts';
import type {ThemeId,ForkliftId} from '../src/application/profile.ts';
import type {CargoId} from '../src/domain/types.ts';
import type {ViewState} from '../src/presentation/view-types.ts';
import {createRunV18} from '../src/domain/v18/engine.ts';
import {playableChecksum} from '../src/domain/playable.ts';
import {drawWarehouse as authorWarehouse} from '../scripts/static-art-authoring/src/presentation/warehouse-art.ts';
import {forklift as authorForklift,cargoBox as authorCargo,gradient} from '../scripts/static-art-authoring/src/presentation/assets.ts';
import {drawThemedBoard as authorBoard} from '../scripts/static-art-authoring/src/presentation/board-theme.ts';
import {drawHarborBackground as authorHarbor,drawLogisticsBackground as authorLogistics,drawCosmeticPreview as authorPreview} from '../scripts/static-art-authoring/src/presentation/cosmetic-art.ts';
import {loadCargoAtlas} from '../scripts/static-art-authoring/src/presentation/cargo-atlas.ts';
import {loadBoardMaterialAtlas} from '../scripts/static-art-authoring/src/presentation/board-material-atlas.ts';
import {loadSceneMaterialAtlas} from '../scripts/static-art-authoring/src/presentation/scene-frame-atlas.ts';

const base:ViewState={screen:'game',selectedPieceId:null,hoverOrigin:null,preview:null,dragPoint:null,paused:false,message:'',saveStatus:'',elapsed:0,animation:null,debug:false,needsResume:false};
const shared=['cargo.core','tools.core','forklift.base','forklift.styled','frame.classic','material.board','material.cargo','material.scene'];
const imageLoader=async(path:string)=>await loadImage(new URL('../'+(Object.values(STATIC_ART_RESOURCES).find(r=>r.src===path)?.sourcePath??path),import.meta.url).pathname) as unknown as CanvasImageSource;
configureStaticArt(imageLoader);
for(const load of [loadCargoAtlas,loadBoardMaterialAtlas,loadSceneMaterialAtlas])assert.equal(await load(imageLoader),true);
async function ready(theme:ThemeId='day',previews:string[]=[]){assert.equal((await prepareStaticArt({scene:`scene.${theme}`,shared,previews})).status,'ready');}
function surface(w:number,h:number){const canvas=createCanvas(w,h);return {canvas,ctx:canvas.getContext('2d') as unknown as CanvasRenderingContext2D};}
const pixels=(s:ReturnType<typeof surface>)=>s.ctx.getImageData(0,0,s.canvas.width,s.canvas.height).data;
function difference(a:Uint8ClampedArray,b:Uint8ClampedArray){let total=0,max=0,changed=0,intersection=0,union=0;for(let i=0;i<a.length;i++){const delta=Math.abs(a[i]-b[i]);total+=delta;max=Math.max(max,delta);if(delta)changed++;if(i%4===3){if(a[i]>16||b[i]>16)union++;if(a[i]>16&&b[i]>16)intersection++;}}return {mean:total/a.length,max,changed,maskOverlap:union?intersection/union:1};}

test('preview architecture selects only the four exact authored aspect families',()=>{
 for(const [shape,w,h] of [['card',360,246],['item',816,232],['set',816,840],['classic',816,780]] as const){assert.equal(staticPreviewShape({x:9,y:11,w,h}),shape);assert.equal(staticPreviewShape({x:9,y:11,w:w/3,h:h/3}),shape);}
 for(const [w,h] of [[360,230],[1080,1920],[0,246],[NaN,246],[816,-232]])assert.equal(staticPreviewShape({x:0,y:0,w,h}),null);
});

test('all 12 active finite scenes preserve native source pixels, transparency and caller state with one image blit',async()=>{
 assert.equal(Object.keys(STATIC_ART_SCENES).length,12);
 for(const theme of Object.keys(STATIC_ART_SCENES) as ThemeId[]){
  await ready(theme);const actual=surface(1205,1920),expected=surface(1205,1920),view={...base,profile:{...createProfile(),cosmetics:{theme,cargo:'classic',forklift:'yellow'} as const}};
  for(const s of [actual,expected]){s.ctx.translate(57,0);s.ctx.lineWidth=13;}
  let draws=0;const draw=actual.ctx.drawImage.bind(actual.ctx);actual.ctx.drawImage=((...args:Parameters<CanvasRenderingContext2D['drawImage']>)=>{draws++;draw(...args);}) as CanvasRenderingContext2D['drawImage'];
  drawWarehouse(actual.ctx,view);authorWarehouse(expected.ctx,view);assert.equal(draws,1,theme);assert.equal(actual.ctx.lineWidth,13);assert.equal(difference(pixels(actual),pixels(expected)).changed,0,theme);
  if(theme==='day'||theme==='night'){assert.equal(actual.ctx.getImageData(0,0,1,1).data[3],0);assert.ok(actual.ctx.getImageData(0,242,1,1).data[3]>0);}
 }
});

test('all 12 item preview background variants retain native aspect-dependent architecture and clipping',async()=>{
 let count=0;
 for(const theme of Object.keys(STATIC_ART_PREVIEWS) as ThemeId[])for(const sprite of Object.values(STATIC_ART_PREVIEWS[theme]??{})){
  if(!sprite)continue;count++;await ready('day',[sprite.resource]);const {w,h}=sprite.destination,rect={x:7,y:9,w,h},a=surface(w+14,h+18),b=surface(w+14,h+18);
  assert.equal(drawStaticPreviewBackground(a.ctx,rect,theme),true);
  if(theme==='harbor')authorHarbor(b.ctx,rect);else if(!authorLogistics(b.ctx,rect,theme)){b.ctx.fillStyle=gradient(b.ctx,rect.x,rect.y,rect.h,theme==='night'?'#111c35':'#243345',theme==='night'?'#080d1b':'#111b25');b.ctx.fillRect(rect.x,rect.y,rect.w,rect.h);}
  const diff=difference(pixels(a),pixels(b));assert.ok(diff.mean<.05,`${theme}/${w}x${h}: ${JSON.stringify(diff)}`);assert.equal(a.ctx.getImageData(0,0,1,1).data[3],0);
 }
 assert.equal(count,12);
});

test('all 14 active complete vehicles retain silhouettes, forward forks and rotation anchors at five sizes and 32 headings',async()=>{
 await ready();assert.equal(Object.keys(STATIC_ART_FORKLIFTS).length,14);let worstMean=0,worstOverlap=1;
 for(const paint of Object.keys(STATIC_ART_FORKLIFTS) as ForkliftId[])for(const size of [29,37,44,80,110])for(let heading=0;heading<32;heading++){
  const a=surface(180,180),b=surface(180,180),angle=heading*Math.PI/16;forklift(a.ctx,90,90,size,angle,paint);authorForklift(b.ctx,90,90,size,angle,paint);const diff=difference(pixels(a),pixels(b));worstMean=Math.max(worstMean,diff.mean);worstOverlap=Math.min(worstOverlap,diff.maskOverlap);
  assert.ok(diff.mean<2,`${paint}/${size}/${heading}: mean ${diff.mean}`);assert.ok(diff.maskOverlap>.90,`${paint}/${size}/${heading}: silhouette ${diff.maskOverlap}`);
  assert.equal(a.ctx.getImageData(0,0,1,1).data[3],0);
 }
 assert.ok(worstMean>0,'finite-resolution resampling differences must not be mislabeled pixel identity');assert.ok(worstOverlap>.90);
});

test('classic cargo preserves opaque color and translucent geometry with live waste/countdowns and final outline',async()=>{
 await ready();assert.equal(Object.keys(STATIC_ART_CARGO).length,7);
 for(const cargo of ['cargo.food','cargo.machine','cargo.chem','cargo.electronic','cargo.cold'] as CargoId[])for(const size of [29,37,80,110,178])for(const alpha of [1,.35])for(const trait of [undefined,{kind:'waste'} as const,{kind:'rush',remaining:1} as const]){
  const a=surface(220,220),b=surface(220,220);cargoBox(a.ctx,cargo,15,15,size,alpha,trait,'classic',true,true);authorCargo(b.ctx,cargo,15,15,size,alpha,trait,'classic',true,true);const diff=difference(pixels(a),pixels(b));assert.ok(diff.maskOverlap>.94,`${cargo}/${size}/${alpha}/${trait?.kind}: ${diff.maskOverlap}`);if(alpha===1)assert.ok(diff.mean<2,`${cargo}/${size}/opaque: ${diff.mean}`);
  assert.equal(a.ctx.globalAlpha,1);
 }
 const a=surface(160,160),labels:string[]=[];const fill=a.ctx.fillText.bind(a.ctx);a.ctx.fillText=(value,x,y)=>{labels.push(value);fill(value,x,y);};cargoBox(a.ctx,'cargo.food',10,10,110,1,{kind:'waste'});cargoBox(a.ctx,'cargo.food',10,10,110,1,{kind:'rush',remaining:3},'classic',true);assert.deepEqual(labels,['废弃箱','3']);
});

test('all 15 retained premium cargo bodies keep original image crops, semantic glyphs and live rush digits',async()=>{
 await ready();assert.equal(CARGO_ATLAS.styles.length,15);
 for(const style of CARGO_ATLAS.styles)for(const cargo of CARGO_ATLAS.cargos)for(const size of [29,37,44,80,110])for(const remaining of [undefined,3,2,1]){
  const a=surface(140,140),b=surface(140,140),trait=remaining?{kind:'rush' as const,remaining}:undefined;
  cargoBox(a.ctx,cargo,10,10,size,1,trait,style,true);authorCargo(b.ctx,cargo,10,10,size,1,trait,style,true);
  assert.equal(difference(pixels(a),pixels(b)).changed,0,`${style}/${cargo}/${size}/${remaining}`);
 }
});

test('translucent classic body uses explicit group-image alpha and keeps outline as a separate final layer',async()=>{
 await ready();
 for(const alpha of [1,.8,.7,.65,.35,0])for(const callerAlpha of [1,.6]){
  const a=surface(180,180),b=surface(180,180);a.ctx.globalAlpha=callerAlpha;b.ctx.globalAlpha=callerAlpha;
  cargoBox(a.ctx,'cargo.food',17,19,110,alpha,undefined,'classic',false,true);
  b.ctx.save();b.ctx.globalAlpha*=alpha;b.ctx.translate(17,19);drawStaticArtSprite(b.ctx,STATIC_ART_CARGO['cargo.food']);drawStaticArtSprite(b.ctx,STATIC_ART_CARGO.outline);b.ctx.restore();
  assert.equal(difference(pixels(a),pixels(b)).changed,0,`caller ${callerAlpha}/cargo ${alpha}`);assert.equal(a.ctx.globalAlpha,callerAlpha);
 }
});

test('day/night packed frames and every material floor preserve all 7/8/9 native board pixels',async()=>{
 await ready();
 for(const theme of Object.keys(STATIC_ART_SCENES) as ThemeId[])for(const boardSize of [7,8,9]){
  const a=surface(1080,1520),b=surface(1080,1520),geometry=boardGeometry({boardSize});drawThemedBoard(a.ctx,geometry,theme);authorBoard(b.ctx,geometry,theme);assert.equal(difference(pixels(a),pixels(b)).changed,0,`${theme}/${boardSize}`);
 }
});

test('current composite previews reuse exact variants and selected sprites without surface allocation',async()=>{
 for(const theme of ['day','night','forest_depot','space_cargo'] as const){
  const rect={x:0,y:0,w:816,h:232};await ready(theme,[`preview.${theme}.item`]);const a=surface(rect.w,rect.h),b=surface(rect.w,rect.h),options={theme,cargoStyle:'wood',forklift:'heavy',cargoOutline:true,category:'cargo'} as const;
  drawCosmeticPreview(a.ctx,rect,options);authorPreview(b.ctx,rect,options);
  const diff=difference(pixels(a),pixels(b));assert.ok(diff.mean<3,`${theme}/item: ${diff.mean}`);assert.ok(diff.maskOverlap>.99);
 }
});

test('actual renderer keeps finite scenery, usable safe-area clips and full-screen pause coverage',async()=>{
 const run=createRunV18({seed:17,mode:'standard',inboundDifficulty:'hard'}),checksum=playableChecksum(run);
 for(const theme of ['day','night','cold_chain','ice_vault'] as const){await ready(theme);
  for(const [w,h,scale,x,y] of [[360,800,1/3,0,80],[540,1000,.5,0,20.3],[800,1000,.5,130.25,20.3],[1080,2340,1,0,210],[1440,3120,4/3,0,280]]){
   const a=surface(w,h),view={...base,profile:{...createProfile(),cosmetics:{theme,cargo:'classic',forklift:'yellow'} as const}},bounds={x:-60,y:0,w:1200,h:1920};a.ctx.fillStyle='#0c131c';a.ctx.fillRect(0,0,w,h);a.ctx.setTransform(scale,0,0,scale,x,y);render(a.ctx,run,view,bounds,{x:-x/scale,y:-y/scale,w:w/scale,h:h/scale},'#0c131c');
   const top=a.ctx.getImageData(0,0,1,1).data;assert.deepEqual([...top],[12,19,28,255]);const before=pixels(a);render(a.ctx,run,{...view,paused:true},bounds,{x:-x/scale,y:-y/scale,w:w/scale,h:h/scale},'#0c131c');assert.notDeepEqual([...a.ctx.getImageData(0,0,1,1).data],[...top]);assert.notDeepEqual(pixels(a),before);
  }
 }
 assert.equal(playableChecksum(run),checksum);
});

test('every live tool item, including wildcard, and toolbox produces one complete ready-image blit',async()=>{
 await ready();const a=surface(600,180);let draws=0;const draw=a.ctx.drawImage.bind(a.ctx);a.ctx.drawImage=((...args:Parameters<CanvasRenderingContext2D['drawImage']>)=>{draws++;draw(...args);}) as CanvasRenderingContext2D['drawImage'];
 for(const [index,item] of (['rotate','clear','wildcard'] as const).entries()){drawToolIcon(a.ctx,item,index*150,0,150);assert.equal(draws,index+1,item);}
 drawToolboxIcon(a.ctx,450,0,150);assert.equal(draws,4);
});

test('missing decoded static art never invokes a procedural fallback or paints a substitute selection',()=>{
 configureStaticArt(async()=>{throw Error('missing fixture');});const a=surface(160,160);assert.equal(drawStaticArtSprite(a.ctx,STATIC_ART_FORKLIFTS.yellow),false);forklift(a.ctx,80,80,110,0,'yellow');assert.ok(pixels(a).every(value=>value===0));
});
