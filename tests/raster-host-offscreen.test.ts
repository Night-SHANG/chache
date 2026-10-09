import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createGrowthHost} from '../scripts/growth-host-support.mjs';

test('native host retains its first screen canvas when the actual bundle creates lazy offscreen surfaces',async()=>{
 const out=await mkdtemp(join(tmpdir(),'raster-offscreen-'));
 try{const path=join(out,'game.js');await writeFile(path,`const main=wx.createCanvas(),ctx=main.getContext('2d');for(const name of ['onTouchStart','onTouchMove','onTouchEnd','onTouchCancel','onHide','onShow'])wx[name](()=>{});let surface;function paint(){if(!surface){surface=wx.createCanvas();surface.width=12;surface.height=8;const c=surface.getContext('2d');c.fillStyle='#ff0000';c.fillRect(0,0,12,8);}ctx.fillStyle='#000';ctx.fillRect(0,0,80,60);ctx.drawImage(surface,5,7);ctx.fillStyle='#fff';ctx.fillText('main',25,20);requestAnimationFrame(paint);}requestAnimationFrame(paint);`);
  const h=await createGrowthHost({width:80,height:60,bundlePath:path}),screen=h.canvas,context=h.context;h.frame(0);assert.equal(h.canvas,screen);assert.equal(h.context,context);assert.equal(h.canvasCount,2);assert.deepEqual([h.canvas.width,h.canvas.height],[80,60]);assert.deepEqual([...h.context.getImageData(6,8,1,1).data],[255,0,0,255]);assert.ok(h.labels.some((row:{text:string})=>row.text==='main'));h.frame(16);assert.equal(h.canvasCount,2);
 }finally{await rm(out,{recursive:true,force:true});}
});

test('native raster witness follows actual cached composites without inventing new image requests or warm redraws',async()=>{
 const {attachRasterDrawWitness}=await import('../scripts/raster-art-host-runtime.mjs');
 const {createCanvas}=await import('@napi-rs/canvas');const out=await mkdtemp(join(tmpdir(),'raster-lineage-'));
 try{const source=createCanvas(4,4);source.getContext('2d').fillStyle='#ff0000';source.getContext('2d').fillRect(0,0,4,4);await writeFile(join(out,'atlas.png'),source.toBuffer('image/png'));const path=join(out,'game.js');
  await writeFile(path,`const main=wx.createCanvas(),ctx=main.getContext('2d'),image=wx.createImage();image.src='atlas.png';for(const name of ['onTouchStart','onTouchMove','onTouchEnd','onTouchCancel','onHide','onShow'])wx[name](()=>{});let surface;function paint(){if(!surface){surface=wx.createCanvas();surface.width=12;surface.height=8;surface.getContext('2d').drawImage(image,0,0,4,4,2,1,8,6);}ctx.clearRect(0,0,80,60);ctx.drawImage(surface,5,7);requestAnimationFrame(paint);}requestAnimationFrame(paint);`);
  const h=attachRasterDrawWitness(await createGrowthHost({width:80,height:60,bundlePath:path,deferImageLoads:true}));await h.settleImages();h.frame(0);assert.equal(h.imageTrace.length,1);assert.equal(h.rasterDraws.length,1);assert.equal(h.rasterDraws[0].source,'atlas.png');assert.deepEqual(h.rasterDraws[0].viaSurfaces,[2]);assert.deepEqual(h.rasterDraws[0].transform,[1,0,0,1,5,7]);assert.equal(h.rasterCounters.assetDrawCalls,1);const cold=[...h.context.getImageData(0,0,80,60).data];h.frame(16);assert.deepEqual([...h.context.getImageData(0,0,80,60).data],cold);assert.equal(h.rasterCounters.assetDrawCalls,1);assert.equal(h.rasterComposites.length,1);assert.equal(h.rasterDraws.length,1);assert.equal(h.imageTrace.length,1);
 }finally{await rm(out,{recursive:true,force:true});}
});
