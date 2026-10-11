import test from 'node:test';
import assert from 'node:assert/strict';
import {createCanvas} from '@napi-rs/canvas';
import {COSMETIC_CATALOG} from '../src/application/cosmetics.ts';
import {createProfile} from '../src/application/profile.ts';
import type {ThemeId} from '../src/application/profile.ts';
import {createRunV18} from '../src/domain/v18/engine.ts';
import {render} from '../src/presentation/renderer.ts';
import type {ViewState} from '../src/presentation/view-types.ts';

for(const [width,height]of [[1356,660],[446,694]])for(const item of COSMETIC_CATALOG.filter(item=>item.kind==='theme'&&!['day','night'].includes(item.id)))test(`${item.id} ${width}x${height}: both fractional scene boundaries are fully opaque`,()=>{
 const context=createCanvas(width,height).getContext('2d'),scale=height/1920,offset=(width-1080*scale)/2;
 context.fillStyle='#0c131c';context.fillRect(0,0,width,height);context.translate(offset,0);context.scale(scale,scale);
 const profile=createProfile();profile.cosmetics.theme=item.id as ThemeId;
 const view:ViewState={screen:'menu',selectedPieceId:null,hoverOrigin:null,preview:null,dragPoint:null,paused:false,message:'',saveStatus:'',elapsed:0,animation:null,debug:false,needsResume:false,profile};
 render(context as unknown as CanvasRenderingContext2D,createRunV18({seed:105,mode:'standard',inboundDifficulty:'hard'}),view,{x:-offset/scale,y:0,w:width/scale,h:1920});
 for(const x of [Math.floor(offset),Math.floor(width-offset)]){
  const pixels=context.getImageData(x,0,1,height).data;
  for(let y=0;y<height;y++)assert.equal(pixels[y*4+3],255,`${item.id}: transparent seam at ${x},${y}`);
 }
});
