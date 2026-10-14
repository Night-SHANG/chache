import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {createCanvas} from '@napi-rs/canvas';
import type {CanvasSurface} from '../src/platform/types.ts';

const moduleUrl = new URL('../src/presentation/douyin/bounded-painter.ts', import.meta.url);

test('one logical scratch preserves clipped rotated composition within raster edge tolerance without reallocating', async () => {
 assert.ok(existsSync(moduleUrl), 'Douyin bounded painter must exist before compatibility can run');
 const {configureDouyinRendering, withBoundedPainter} = await import(moduleUrl.href);
 let creates=0,widthWrites=0,heightWrites=0;const cleared:number[][]=[];
 configureDouyinRendering(()=>{
  creates++;const canvas=createCanvas(1,1);const context=canvas.getContext('2d'),clear=context.clearRect.bind(context);context.clearRect=(...args)=>{cleared.push(args);clear(...args);};
  for(const key of ['width','height'] as const){const descriptor=Object.getOwnPropertyDescriptor(Object.getPrototypeOf(canvas),key)!;Object.defineProperty(canvas,key,{get(){return descriptor.get!.call(canvas);},set(n:number){if(key==='width')widthWrites++;else heightWrites++;descriptor.set!.call(canvas,n);}});}
  return canvas as unknown as CanvasSurface;
 });
 assert.equal(creates,0,'factory registration cannot create the first/on-screen canvas');
 const a=createCanvas(320,240),b=createCanvas(320,240),rect={x:40,y:30,w:220,h:180};
 const paint=(ctx:CanvasRenderingContext2D)=>{
  ctx.save();ctx.translate(76,123);ctx.rotate(.7);ctx.fillStyle='rgba(255,80,30,.7)';ctx.fillRect(-120,-55,210,110);ctx.fillStyle='rgba(20,150,250,.6)';ctx.fillRect(-30,-90,90,160);ctx.restore();
 };
 for(let frame=0;frame<3;frame++){
  for(const canvas of [a,b]){const c=canvas.getContext('2d');c.globalAlpha=1;c.fillStyle='#173248';c.fillRect(0,0,320,240);c.globalAlpha=.8;}
  const original=a.getContext('2d');original.save();original.beginPath();original.rect(rect.x,rect.y,rect.w,rect.h);original.clip();paint(original as unknown as CanvasRenderingContext2D);original.restore();
  withBoundedPainter(b.getContext('2d') as unknown as CanvasRenderingContext2D,rect,paint);
  const expected=original.getImageData(0,0,320,240).data,actual=b.getContext('2d').getImageData(0,0,320,240).data;
  let max=0,total=0;for(let i=0;i<actual.length;i++){const d=Math.abs(actual[i]-expected[i]);max=Math.max(max,d);total+=d;}
  assert.ok(max<=16 && total/actual.length<.03,`rotated edge raster tolerance: max ${max}, mean ${total/actual.length}`);
  for(let y=0;y<240;y++)for(let x=0;x<320;x++)if(x<rect.x||x>=rect.x+rect.w||y<rect.y||y>=rect.y+rect.h){const i=(y*320+x)*4;assert.deepEqual(actual.slice(i,i+4),expected.slice(i,i+4),'no out-of-bounds pixels');}
  assert.equal(b.getContext('2d').globalAlpha,.8);
 }
 assert.equal(creates,1);assert.equal(widthWrites,1);assert.equal(heightWrites,1);
 assert.deepEqual(cleared,Array.from({length:3},()=>[0,0,221,181]),'only the current source crop and filtering edge need clearing');
 assert.throws(()=>withBoundedPainter(b.getContext('2d'),rect,(c:CanvasRenderingContext2D)=>withBoundedPainter(c,rect,()=>{})),/Nested/);
 for(const r of [{x:20,y:20,w:300,h:200},{x:20,y:20,w:10,h:10},{x:20,y:20,w:300,h:200}]){
  const c=b.getContext('2d');c.globalAlpha=1;c.clearRect(0,0,320,240);withBoundedPainter(c,r,(target:CanvasRenderingContext2D)=>{target.fillStyle='#ff0000';target.fillRect(r.x+r.w+10,r.y,40,40);target.fillStyle='#00ff00';target.fillRect(r.x,r.y,5,5);});
  assert.deepEqual([...c.getImageData(r.x+7,r.y+7,1,1).data],[0,0,0,0],'larger subsequent crop has no old outside pixels');
 }
 assert.equal(creates,1);assert.equal(widthWrites,1);assert.equal(heightWrites,1);
});

test('fractional 9x9 doorway coordinates preserve the original logical pixel phase',async()=>{
 const {withBoundedPainter}=await import(moduleUrl.href),a=createCanvas(320,240),b=createCanvas(320,240),rect={x:10+2/3,y:10+2/3,w:280+2/3,h:210+2/3};
 const paint=(ctx:CanvasRenderingContext2D)=>{ctx.save();ctx.translate(157.47,117.19);ctx.rotate(.72);ctx.fillStyle='#112233';ctx.fillRect(-36,-25,80,45);ctx.fillStyle='#ffff88';ctx.fillRect(-29,-18,60,30);ctx.font='17px sans-serif';ctx.fillText('4件',-5,35);ctx.restore();};
 const original=a.getContext('2d');original.save();original.beginPath();original.rect(rect.x,rect.y,rect.w,rect.h);original.clip();paint(original as unknown as CanvasRenderingContext2D);original.restore();
 withBoundedPainter(b.getContext('2d'),rect,paint);
 const actual=b.getContext('2d').getImageData(0,0,320,240).data,expected=original.getImageData(0,0,320,240).data;
 let changed=0;for(let i=0;i<actual.length;i++)if(actual[i]!==expected[i])changed++;
 assert.equal(changed,0,'a fractional crop must not render and resample the same pixel phase twice');
});

test('source offsets respect the fixed maximum and the final blit preserves caller transforms',async()=>{
 const {withBoundedPainter}=await import(moduleUrl.href),a=createCanvas(320,240),b=createCanvas(320,240),rect={x:10+2/3,y:10+2/3,w:120,h:80};
 for(const canvas of [a,b])canvas.getContext('2d').setTransform(2,0,0,2,7,9);
 const paint=(ctx:CanvasRenderingContext2D)=>{ctx.fillStyle='#eec542';ctx.fillRect(22,21,10,8);};
 const original=a.getContext('2d');original.save();original.beginPath();original.rect(rect.x,rect.y,rect.w,rect.h);original.clip();paint(original as unknown as CanvasRenderingContext2D);original.restore();
 withBoundedPainter(b.getContext('2d'),rect,paint);
 const actual=b.getContext('2d').getImageData(0,0,320,240).data,expected=original.getImageData(0,0,320,240).data;
 // Logical-1x scratch intentionally resamples at 2x; verify transformed
 // positioning and opacity rather than promising device-pixel identity.
 let alpha=0,xMass=0,yMass=0;for(let y=0;y<240;y++)for(let x=0;x<320;x++){const opacity=actual[(y*320+x)*4+3];alpha+=opacity;xMass+=(x+.5)*opacity;yMass+=(y+.5)*opacity;}
 assert.ok(Math.abs(xMass/alpha-61)<.02);assert.ok(Math.abs(yMass/alpha-59)<.02);
 assert.deepEqual([...actual.slice((58*320+60)*4,(58*320+60)*4+4)],[...expected.slice((58*320+60)*4,(58*320+60)*4+4)]);
 assert.equal(actual[(45*320+45)*4+3],0);
 const transform=b.getContext('2d').getTransform();assert.equal(transform.a,2);assert.equal(transform.d,2);assert.equal(transform.e,7);assert.equal(transform.f,9);
 const canvas=createCanvas(1300,2000),ctx=canvas.getContext('2d'),draw=ctx.drawImage.bind(ctx),sources:number[][]=[];
 ctx.drawImage=((...args:Parameters<typeof ctx.drawImage>)=>{sources.push(args.slice(1,5) as number[]);return draw(...args);}) as typeof ctx.drawImage;
 withBoundedPainter(ctx,{x:.25,y:.75,w:1205,h:1920},(c:CanvasRenderingContext2D)=>{c.fillStyle='#ff0000';c.fillRect(11,11,10,10);});
 assert.deepEqual(sources,[[0,0,1205,1920]],'a maximum crop falls back to its own origin without allocating an extra pixel');
});
