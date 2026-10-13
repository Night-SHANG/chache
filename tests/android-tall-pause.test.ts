import {prepareArt} from './helpers/static-art-fixture.ts';
import assert from 'node:assert/strict';
import test from 'node:test';
import {createCanvas} from '@napi-rs/canvas';
import {createRunV18} from '../src/domain/v18/engine.ts';
import {createProfile} from '../src/application/profile.ts';
import {render} from '../src/presentation/renderer.ts';
import type {ViewState} from '../src/presentation/view-types.ts';
import {computeAndroidViewport} from '../src/platform/android-viewport.ts';
import {getUiControls} from '../src/presentation/ui.ts';

for(const mode of ['standard','endless'] as const)for(const height of [1920,2160,2400,2520])test(`Android ${mode} pause shades actual ${height} viewport and preserves safe board controls`,async()=>{
 await prepareArt('day');const width=540,h=height/2,state=createRunV18({seed:71,mode}),vp=computeAndroidViewport({x:0,y:0,w:width,h},{active:true,owner:true,widthPx:1080,heightPx:height,insetsPx:{top:80,right:24,bottom:60,left:36}});
 const base:ViewState={screen:'game',selectedPieceId:null,hoverOrigin:null,preview:null,dragPoint:null,paused:false,message:'',saveStatus:'',elapsed:0,animation:null,debug:false,needsResume:false,profile:createProfile(),androidContentBounds:vp.content};
 const paint=(paused:boolean)=>{const canvas=createCanvas(width,h),ctx=canvas.getContext('2d');ctx.fillStyle='#0c131c';ctx.fillRect(0,0,width,h);ctx.setTransform(vp.scale,0,0,vp.scale,vp.origin.x,vp.origin.y);render(ctx as unknown as CanvasRenderingContext2D,state,{...base,paused},vp.overlay,vp.overlay,'#0c131c');return ctx;};
 const active=paint(false),paused=paint(true);
 for(const [x,y] of [[2,2],[width-3,2],[2,h-3],[width-3,h-3],[width/2,2],[width/2,h-3]]){
  const a=active.getImageData(x,y,1,1).data,b=paused.getImageData(x,y,1,1).data;
  for(let channel=0;channel<3;channel++)assert.ok(Math.abs(b[channel]-Math.round(a[channel]*.16+[5,11,18][channel]*.84))<=2,`${mode} ${height}: edge ${x},${y} channel${channel} is unshaded`);
 }
 assert.deepEqual(getUiControls(state,{...base,paused:true}),getUiControls(state,{...base,paused:true,androidContentBounds:undefined}));
});
