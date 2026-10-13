import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createCanvas,loadImage} from '@napi-rs/canvas';
import {cargoBox,forklift} from '../src/presentation/assets.ts';
import {drawToolIcon,drawToolboxIcon} from '../src/presentation/tool-art.ts';
import {drawThemedBoard} from '../src/presentation/board-theme.ts';
import {drawWarehouse} from '../src/presentation/warehouse-art.ts';
import {boardGeometry} from '../src/presentation/board-geometry.ts';
import {CARGO_ATLAS} from '../src/presentation/cargo-atlas.ts';
import {SCENE_MATERIAL_ATLAS} from '../src/presentation/scene-frame-atlas.ts';
import {configureStaticArt,prepareStaticArt} from '../src/presentation/static-art-resources.ts';
import {STATIC_ART_CARGO,STATIC_ART_FORKLIFTS,STATIC_ART_RESOURCES,STATIC_ART_SCENES,STATIC_ART_TOOLS} from '../src/presentation/static-art-manifest.ts';
import {drawStaticArtSprite} from '../src/presentation/static-art-draw.ts';
import {createProfile} from '../src/application/profile.ts';
import type {ForkliftId,ThemeId} from '../src/application/profile.ts';
import type {CellTrait} from '../src/domain/types.ts';
import type {ViewState} from '../src/presentation/view-types.ts';
// These checked-in painters are byte-identical to v112 (dd847c3), with no decoded atlases.
import {cargoBox as oldCargo,forklift as oldForklift} from '../scripts/static-art-authoring/src/presentation/assets.ts';
import {drawToolIcon as oldTool,drawToolboxIcon as oldToolbox} from '../scripts/static-art-authoring/src/presentation/tool-art.ts';
import {drawThemedBoard as oldBoard} from '../scripts/static-art-authoring/src/presentation/board-theme.ts';
import {drawWarehouse as oldWarehouse} from '../scripts/static-art-authoring/src/presentation/warehouse-art.ts';

const base:ViewState={screen:'game',selectedPieceId:null,hoverOrigin:null,preview:null,dragPoint:null,paused:false,message:'',saveStatus:'',elapsed:0,animation:null,debug:false,needsResume:false};
const themes:ThemeId[]=['day','night',...SCENE_MATERIAL_ATLAS.themes];
const surface=(w=220,h=220)=>{const canvas=createCanvas(w,h);return {canvas,ctx:canvas.getContext('2d') as unknown as CanvasRenderingContext2D};};
const hash=(s:ReturnType<typeof surface>)=>createHash('sha256').update(s.ctx.getImageData(0,0,s.canvas.width,s.canvas.height).data).digest('hex');
function cold(){configureStaticArt(async()=>{throw Error('missing PNG fixture');});}
function same(a:ReturnType<typeof surface>,b:ReturnType<typeof surface>,label:string){assert.equal(hash(a),hash(b),label);}
function view(theme:ThemeId):ViewState{return {...base,profile:{...createProfile(),cosmetics:{theme,cargo:'classic',forklift:'yellow'}}};}

test('cold cargo restores the complete v112 body, live traits, alpha and final outline for every material',()=>{
 cold();
 const traits:(CellTrait|undefined)[]=[undefined,{kind:'waste'},{kind:'rush',remaining:1},{kind:'pallet'},{kind:'hazard'},{kind:'wildcard'}];
 for(const cargo of CARGO_ATLAS.cargos)for(const style of ['classic','outline',...CARGO_ATLAS.styles] as const)for(const trait of traits){
  const a=surface(),b=surface();a.ctx.globalAlpha=.8;b.ctx.globalAlpha=.8;
  cargoBox(a.ctx,cargo,17,19,110,.65,trait,style,true,true);oldCargo(b.ctx,cargo,17,19,110,.65,trait,style,true,true);
  same(a,b,`${cargo}/${style}/${trait?.kind}`);assert.equal(a.ctx.globalAlpha,.8);
 }
});

test('cold tools and toolbox restore complete v112 equipment silhouettes synchronously',()=>{
 cold();
 for(const size of [37,160]){
  for(const item of ['rotate','clear','wildcard'] as const){const a=surface(),b=surface();drawToolIcon(a.ctx,item,11,13,size);oldTool(b.ctx,item,11,13,size);same(a,b,`${item}/${size}`);}
  const a=surface(),b=surface();drawToolboxIcon(a.ctx,11,13,size);oldToolbox(b.ctx,11,13,size);same(a,b,`toolbox/${size}`);
 }
});

test('cold forklifts restore v112 vehicles including forks, rotation and caller state',()=>{
 cold();
 for(const paint of Object.keys(STATIC_ART_FORKLIFTS) as ForkliftId[])for(const angle of [0,Math.PI/2,Math.PI*1.25]){
  const a=surface(),b=surface();a.ctx.lineWidth=13;b.ctx.lineWidth=13;
  forklift(a.ctx,110,110,110,angle,paint);oldForklift(b.ctx,110,110,110,angle,paint);same(a,b,`${paint}/${angle}`);assert.equal(a.ctx.lineWidth,13);
 }
});

test('cold board frames and material floors match v112 at all board sizes and themes',()=>{
 cold();
 for(const theme of themes)for(const boardSize of [7,8,9]){
  const a=surface(1080,1520),b=surface(1080,1520),geometry=boardGeometry({boardSize});
  drawThemedBoard(a.ctx,geometry,theme);oldBoard(b.ctx,geometry,theme);same(a,b,`${theme}/${boardSize}`);
 }
});

test('browser and WeChat cold warehouse scenery still matches v112 without waiting for images',()=>{
 cold();
 for(const theme of themes){
  const a=surface(1205,1920),b=surface(1205,1920),state=view(theme),bounds={x:-57,y:0,w:1205,h:1920};
  a.ctx.translate(57,0);b.ctx.translate(57,0);a.ctx.lineWidth=13;
  drawWarehouse(a.ctx,state,bounds);oldWarehouse(b.ctx,state,bounds);same(a,b,theme);assert.equal(a.ctx.lineWidth,13);
 }
});

test('ready PNG cargo, tools, forklift and scenery keep exact pixels and one-blit drawing',async()=>{
 configureStaticArt(async(path)=>await loadImage(new URL('../'+(Object.values(STATIC_ART_RESOURCES).find(r=>r.src===path)?.sourcePath??path),import.meta.url).pathname) as unknown as CanvasImageSource);
 assert.equal((await prepareStaticArt({scene:'scene.day',shared:['cargo.core','tools.core','forklift.base'],previews:[]})).status,'ready');
 const checks:[string,(ctx:CanvasRenderingContext2D)=>void,(ctx:CanvasRenderingContext2D)=>void][]=[
  ['cargo',ctx=>cargoBox(ctx,'cargo.food',17,19,110,.65),ctx=>{ctx.save();ctx.globalAlpha*=.65;ctx.translate(17,19);drawStaticArtSprite(ctx,STATIC_ART_CARGO['cargo.food']);ctx.restore();}],
  ['tool',ctx=>drawToolIcon(ctx,'rotate',11,13,160),ctx=>{drawStaticArtSprite(ctx,STATIC_ART_TOOLS.rotate,{x:11,y:13,w:160,h:160});}],
  ['toolbox',ctx=>drawToolboxIcon(ctx,11,13,160),ctx=>{drawStaticArtSprite(ctx,STATIC_ART_TOOLS.toolbox,{x:11,y:13,w:160,h:160});}],
  ['forklift',ctx=>forklift(ctx,110,110,110,Math.PI/2,'yellow'),ctx=>{ctx.save();ctx.translate(110,110);ctx.rotate(Math.PI/2);drawStaticArtSprite(ctx,STATIC_ART_FORKLIFTS.yellow);ctx.restore();}],
  ['warehouse',ctx=>drawWarehouse(ctx,view('day')),ctx=>{drawStaticArtSprite(ctx,STATIC_ART_SCENES.day);}],
 ];
 for(const [name,actual,expected] of checks){
  const a=surface(1205,1920),b=surface(1205,1920);let draws=0;const draw=a.ctx.drawImage.bind(a.ctx);
  a.ctx.drawImage=((...args:Parameters<CanvasRenderingContext2D['drawImage']>)=>{draws++;draw(...args);}) as CanvasRenderingContext2D['drawImage'];
  actual(a.ctx);expected(b.ctx);same(a,b,name);assert.equal(draws,1,name);
 }
});

test('invalid tool destinations stay empty instead of triggering a procedural fallback',()=>{
 cold();
 for(const size of [-60,0,NaN]){
  const a=surface(),empty=surface();drawToolIcon(a.ctx,'rotate',110,110,size);drawToolboxIcon(a.ctx,110,110,size);same(a,empty,String(size));
 }
});
