import test from 'node:test';
import assert from 'node:assert/strict';
import {createCanvas} from '@napi-rs/canvas';
import {COSMETIC_CATALOG} from '../src/application/cosmetics.ts';
import type {ThemeId} from '../src/application/profile.ts';
import {drawScenerySides} from '../src/presentation/scenery-sides.ts';

// The user's 1356×660 viewport exposed three repeated warehouses in v1.0.4.
// A full-scene copy (mirrored or otherwise) breaks horizontal uniformity here.
const width=1356,height=660,scale=height/1920,offset=(width-1080*scale)/2;
for(const item of COSMETIC_CATALOG.filter(item=>item.kind==='theme'&&!['day','night'].includes(item.id)))test(`${item.id}: ultra-wide side scenery is quiet wall/floor tone, never repeated architecture`,()=>{
 const ctx=createCanvas(width,height).getContext('2d');
 ctx.fillStyle='#ff00ff';ctx.fillRect(0,0,width,height);ctx.translate(offset,0);ctx.scale(scale,scale);
 drawScenerySides(ctx as unknown as CanvasRenderingContext2D,item.id as ThemeId,{x:-offset/scale,y:0,w:width/scale,h:1920});
 const pixels=ctx.getImageData(0,0,width,height).data;
 for(const [start,end] of [[0,Math.floor(offset)-2],[Math.ceil(width-offset)+2,width]])for(let y=0;y<height;y++){
  const first=(y*width+start)*4;
  assert.notDeepEqual([...pixels.slice(first,first+4)],[255,0,255,255],`unpainted margin y=${y}`);
  for(let x=start+1;x<end;x++)for(let c=0;c<4;c++)assert.ok(Math.abs(pixels[(y*width+x)*4+c]-pixels[first+c])<=1,`${item.id}: repeated architecture or horizontal banding at x=${x}, y=${y}`);
 }
 // Central output is verified through the complete renderer in scenery-width;
 // this quiet underlay may cover its background before the original scene.
});
