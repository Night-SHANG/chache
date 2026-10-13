import './helpers/static-art-fixture.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createCanvas} from '@napi-rs/canvas';
import {createRunV18} from '../src/domain/v18/engine.ts';
import {createProfile} from '../src/application/profile.ts';
import {computeAndroidViewport} from '../src/platform/android-viewport.ts';
import {InputController} from '../src/presentation/input.ts';
import {getUiControls} from '../src/presentation/ui.ts';
import {render} from '../src/presentation/renderer.ts';
import {hitTestPoint,type Rect} from '../src/presentation/layout.ts';
import {homeLayout} from '../src/presentation/home-layout.ts';
import type {ViewState} from '../src/presentation/view-types.ts';
import type {UiAction} from '../src/presentation/ui-types.ts';
import {makeAccountFixture} from './helpers/account-fixtures.ts';

const state=createRunV18({mode:'standard',seed:17,inboundDifficulty:'hard'});
const view=(androidContentBounds?:Rect):ViewState=>({screen:'menu',profile:createProfile(),account:makeAccountFixture({wallet:16}),selectedPieceId:null,hoverOrigin:null,preview:null,dragPoint:null,paused:false,message:'',saveStatus:'',elapsed:0,animation:null,debug:false,needsResume:false,...androidContentBounds?{androidContentBounds}:{}});
const originalRects=[{x:210,y:752,w:660,h:176},{x:210,y:990,w:660,h:176},{x:210,y:1220,w:660,h:144},{x:210,y:1420,w:318,h:132},{x:552,y:1420,w:318,h:132}];
const center=(r:Rect)=>({x:r.x+r.w/2,y:r.y+r.h/2});
function safeBounds(height:number,top=0,bottom=0,left=0,right=0):Rect {
 const vp=computeAndroidViewport({x:11,y:23,w:360,h:height/3},{active:true,owner:true,widthPx:1080,heightPx:height,insetsPx:{top,bottom,left,right}});
 return {x:(vp.safeRect.x-vp.origin.x)/vp.scale,y:(vp.safeRect.y-vp.origin.y)/vp.scale,w:vp.safeRect.w/vp.scale,h:vp.safeRect.h/vp.scale};
}
function capture(current:ViewState){
 const safe=current.androidContentBounds??{x:0,y:0,w:1080,h:1920},canvas=createCanvas(1080,Math.ceil(Math.max(1920,safe.h))),ctx=canvas.getContext('2d');
 const labels:{value:string;x:number;y:number;font:string;left:number;right:number;top:number;bottom:number}[]=[],fill=ctx.fillText.bind(ctx);
 ctx.translate(0,-Math.min(0,safe.y));ctx.fillText=(value,x,y)=>{const m=ctx.measureText(value);labels.push({value,x,y,font:ctx.font,left:x-m.actualBoundingBoxLeft,right:x+m.actualBoundingBoxRight,top:y-m.actualBoundingBoxAscent,bottom:y+m.actualBoundingBoxDescent});fill(value,x,y);};
 render(ctx as unknown as CanvasRenderingContext2D,state,current);
 return {labels,canvas};
}

test('Android homepage spreads extra safe height between fixed-size groups while legacy geometry is exact',()=>{
 assert.deepEqual(getUiControls(state,view()).map(c=>c.rect),originalRects);
 for(const height of [1920,2160,2400,2520])for(const inset of [false,true]){
  const safe=safeBounds(height,inset?96:0,inset?72:0),current=view(safe),snapshot=JSON.stringify(current),controls=getUiControls(state,current),extra=Math.max(0,safe.h-1920);
  for(const [index,c]of controls.entries()){
   const old=originalRects[index],step=Math.min(index+3,6),expected=old.y+safe.y+extra*step/7;
   assert.ok(Math.abs(c.rect.y-expected)<1e-8,`${height}, insets ${inset}: ${c.label} y=${c.rect.y}, expected ${expected}`);
   assert.deepEqual({x:c.rect.x,w:c.rect.w,h:c.rect.h},{x:old.x,w:old.w,h:old.h});
   assert.ok(c.rect.y>=safe.y&&c.rect.y+c.rect.h<=safe.y+safe.h,c.label);
   assert.ok(hitTestPoint(center(c.rect),c.rect));
  }
  for(const [i,a]of controls.entries())for(const b of controls.slice(i+1))assert.ok(a.rect.x+a.rect.w<=b.rect.x||b.rect.x+b.rect.w<=a.rect.x||a.rect.y+a.rect.h<=b.rect.y||b.rect.y+b.rect.h<=a.rect.y,'button targets cannot overlap');
  assert.equal(JSON.stringify(current),snapshot,'layout is ephemeral and does not mutate the view');
 }
});

test('Android homepage drawing uses the same shifted controls and keeps all text inside its safe height',()=>{
 for(const height of [1920,2160,2400,2520])for(const inset of [false,true]){
  const safe=safeBounds(height,inset?96:0,inset?72:0),current=view(safe),{labels}=capture(current),extra=Math.max(0,safe.h-1920),find=(value:string)=>labels.find(l=>l.value===value)!;
  assert.ok(Math.abs(find('货箱').y-(267+safe.y))<1e-8,'title follows the top safe edge');
  assert.ok(Math.abs(find('金币 16').y-(670+safe.y+extra*2/7))<1e-8,'wallet has its own gap');
  assert.ok(Math.abs(find('五班或加急首次出货，解锁蓝色叉车').y-(1650+safe.y+extra))<1e-8,'footer follows the lower safe edge');
  for(const c of getUiControls(state,current))for(const [i,label]of c.label.split('\n').entries())assert.equal(find(label).y,c.rect.y+c.rect.h/2+(i-(c.label.split('\n').length-1)/2)*47);
  for(const label of labels)assert.ok(label.top>=safe.y&&label.bottom<=safe.y+safe.h,JSON.stringify({height,inset,label,safe}));
  for(const [i,a]of labels.entries())for(const b of labels.slice(i+1))assert.ok(a.right<=b.left||b.right<=a.left||a.bottom<=b.top||b.bottom<=a.top,`${a.value} overlaps ${b.value}`);
 }
});

test('pure homepage layout never compresses the authored groups and preserves the title and forklift shapes',()=>{
 const base=homeLayout();
 assert.deepEqual(homeLayout({x:0,y:0,w:1080,h:1600}),base,'shorter available height cannot compress the composition');
 for(const bounds of [undefined,{x:0,y:NaN,w:1080,h:2400},{x:0,y:0,w:1080,h:Infinity}])assert.deepEqual(homeLayout(bounds),base);
 for(const height of [1920,2160,2400,2520]){
  const safe=safeBounds(height),snapshot=JSON.stringify(safe),home=homeLayout(safe);
  assert.ok(Math.abs(home.subtitleY-home.titleY-120)<1e-8);assert.ok(Math.abs(home.stripe.y-home.subtitleY-61)<1e-8);assert.ok(Math.abs(home.shadowY-home.forkliftY-36)<1e-8);
  assert.ok(home.forkliftY-80>=home.stripe.y+home.stripe.h,'the full forklift fits after the title');assert.ok(home.walletY-15>=home.shadowY+33,'wallet clears the forklift shadow');
  assert.ok(home.inbound.y>=home.walletY+15);assert.ok(home.footerY-13>=home.settings.y+home.settings.h);assert.equal(JSON.stringify(safe),snapshot);
 }
});

test('homepage controls remain clickable beyond the old 1920 boundary and invalidate moved held controls',()=>{
 const current=view({x:0,y:-800,w:1080,h:3520}),actions:UiAction[]=[],input=new InputController({getState:()=>state,getView:()=>current,patchView:p=>Object.assign(current,p),preview:()=>({valid:true,events:[],cells:[],shipments:[]}),dispatch:()=>{},togglePause:()=>{},restart:()=>{},resume:()=>{},toggleDebug:()=>{},action:a=>actions.push(a)});
 const settings=getUiControls(state,current).find(c=>c.action.type==='settings')!,point=center(settings.rect);
 assert.ok(point.y>1920,'test covers a newly usable bottom target');input.down(point);input.up(point);assert.deepEqual(actions,[{type:'settings'}]);
 const old=getUiControls(state,current)[0];input.down(center(old.rect));current.androidContentBounds={x:0,y:-120,w:1080,h:2160};input.refresh();input.up(center(old.rect));assert.deepEqual(actions,[{type:'settings'}]);assert.equal(current.pressedControl,null);
});

test('Android metadata leaves other screen controls and legacy homepage glyph sizes and text unchanged',()=>{
 const safe=safeBounds(2520,96,72,24,16);
 for(const screen of ['game','inboundMenu','colorTiers','settings','helpMenu','shop'] as const)assert.deepEqual(getUiControls(state,{...view(safe),screen}),getUiControls(state,{...view(),screen}),screen);
 for(const wallet of [0,Number.MAX_SAFE_INTEGER]){
  const plain={...view(),account:makeAccountFixture({wallet}),saveStatus:'保存暂时不可用，请重试'},android={...plain,androidContentBounds:safe},before=capture(plain).labels,after=capture(android).labels;
  assert.deepEqual(after.map(({value,x,font,left,right})=>({value,x,font,left,right})),before.map(({value,x,font,left,right})=>({value,x,font,left,right})),`wallet ${wallet}: no rewording or font/width change`);
 }
});
