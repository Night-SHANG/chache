import test from 'node:test';
import assert from 'node:assert/strict';
import {createCanvas} from '@napi-rs/canvas';
import {COSMETIC_CATALOG} from '../src/application/cosmetics.ts';
import type {ThemeId} from '../src/application/profile.ts';
import {drawThemedSceneryFrame,CLASSIC_SCENERY_FRAME} from '../src/presentation/scenery-frame.ts';
import {drawHarborBackground,drawLogisticsBackground} from '../src/presentation/cosmetic-art.ts';

// v106 supersedes v105's full-window wash: one finite original scene, not copies.
// Independent reference uses the approved transform and the unmodified helper.
for(const item of COSMETIC_CATALOG.filter(item=>item.kind==='theme'&&!['day','night'].includes(item.id)))test(`${item.id}: exactly one original background uses horizontal-only classic-frame transform`,()=>{
 const canvases=[createCanvas(1356,660),createCanvas(1356,660)];
 for(const canvas of canvases){const c=canvas.getContext('2d');c.fillStyle='#0c131c';c.fillRect(0,0,1356,660);c.translate(492.375,0);c.scale(660/1920,660/1920);}
 drawThemedSceneryFrame(canvases[0].getContext('2d') as unknown as CanvasRenderingContext2D,item.id as ThemeId);
 const c=canvases[1].getContext('2d');c.translate(-57,0);c.scale(1205/1080,1);
 const rect={x:0,y:0,w:1080,h:1920},ctx=c as unknown as CanvasRenderingContext2D;
 if(item.id==='harbor')drawHarborBackground(ctx,rect);else drawLogisticsBackground(ctx,rect,item.id);
 assert.deepEqual(canvases[0].getContext('2d').getImageData(0,0,1356,660).data,canvases[1].getContext('2d').getImageData(0,0,1356,660).data);
 assert.deepEqual(CLASSIC_SCENERY_FRAME,{x:-57,y:0,w:1205,h:1920});
});
