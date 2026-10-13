import test from 'node:test';
import assert from 'node:assert/strict';
import {createCanvas,loadImage} from '@napi-rs/canvas';
import {createProfile,type ThemeId} from '../src/application/profile.ts';
import {STATIC_ART_RESOURCES,STATIC_ART_SCENES} from '../src/presentation/static-art-manifest.ts';
import {configureStaticArt,prepareStaticArt} from '../src/presentation/static-art-resources.ts';
import {drawWarehouse} from '../src/presentation/warehouse-art.ts';
import type {ViewState} from '../src/presentation/view-types.ts';

const themes=Object.keys(STATIC_ART_SCENES) as ThemeId[];
const view=(theme:ThemeId):ViewState=>({selectedPieceId:null,hoverOrigin:null,preview:null,dragPoint:null,paused:false,message:'',saveStatus:'',elapsed:0,animation:null,debug:false,needsResume:false,profile:{...createProfile(),cosmetics:{theme,cargo:'classic',forklift:'yellow'}},androidContentBounds:{x:0,y:0,w:1080,h:2400}});
const pixels=(ctx:CanvasRenderingContext2D,width:number,height:number)=>Buffer.from(ctx.getImageData(0,0,width,height).data);

// An old 1080x1920 painter fails the lower-edge assertion even at 16:9, because
// the Android frame has negative logical margins and a 1205-wide source frame.
test('Android cold and failed scenery occupies the same native frame at all supported tall ratios',async()=>{
 for(const theme of themes)for(const ratio of [16/9,18/9,20/9,21/9]){
  configureStaticArt(async()=>{throw Error('missing scene PNG');});
  const width=360,height=Math.round(width*ratio),canvas=createCanvas(width,height),ctx=canvas.getContext('2d') as unknown as CanvasRenderingContext2D;
  const scale=.31,bounds={x:-37,y:-113,w:width/scale,h:height/scale};ctx.setTransform(scale,0,0,scale,-bounds.x*scale,-bounds.y*scale);
  drawWarehouse(ctx,view(theme),bounds);
  for(const [x,y] of [[width/2,1],[width/2,height-2],[2,height/2],[width-2,height/2]])assert.equal(ctx.getImageData(x,y,1,1).data[3],255,`${theme}/${ratio}: full cold frame at ${x},${y}`);
  const cold=pixels(ctx,width,height);await prepareStaticArt({scene:`scene.${theme}`,shared:[],previews:[]});ctx.clearRect(bounds.x,bounds.y,bounds.w,bounds.h);drawWarehouse(ctx,view(theme),bounds);
  assert.ok(pixels(ctx,width,height).equals(cold),`${theme}/${ratio}: image failure cannot change fallback`);
 }
});

test('Android cold scenery uses a bounded synchronous frame with no image or backing-canvas dependency',()=>{
 configureStaticArt(async()=>new Promise(()=>{}));
 for(const theme of themes){
  const canvas=createCanvas(360,840),ctx=canvas.getContext('2d') as unknown as CanvasRenderingContext2D;ctx.scale(1/3,1/3);ctx.lineWidth=13;
  let calls=0;for(const name of ['fillRect','fill','stroke','drawImage'] as const){const native=ctx[name].bind(ctx);ctx[name]=((...args:never[])=>{calls++;return (native as (...args:never[])=>unknown)(...args);}) as never;}
  ctx.drawImage=(()=>{throw Error('Cold frame must not use an image');}) as CanvasRenderingContext2D['drawImage'];
  drawWarehouse(ctx,view(theme),{x:0,y:0,w:1080,h:2520});
  assert.ok(calls<=200,`${theme}: ${calls} drawing calls is not a bounded fallback`);assert.equal(ctx.lineWidth,13);
 }
});

test('unrelated shared PNG completions do not alter the Android failed-scene fallback across consecutive frames',async()=>{
 for(const theme of themes){
  configureStaticArt(async path=>{if(path.includes('/scene-'))throw Error('scene failed');return await loadImage(new URL('../'+Object.values(STATIC_ART_RESOURCES).find(r=>r.src===path)!.sourcePath,import.meta.url).pathname) as unknown as CanvasImageSource;});
  const canvas=createCanvas(360,840),ctx=canvas.getContext('2d') as unknown as CanvasRenderingContext2D;ctx.scale(1/3,1/3);
  const bounds={x:0,y:0,w:1080,h:2520};drawWarehouse(ctx,view(theme),bounds);const first=pixels(ctx,360,840);
  for(const shared of ['cargo.core','material.scene','forklift.base']){
   await prepareStaticArt({scene:`scene.${theme}`,shared:[shared],previews:[]});
   for(let frame=0;frame<3;frame++){ctx.clearRect(0,0,1080,2520);drawWarehouse(ctx,view(theme),bounds);assert.ok(pixels(ctx,360,840).equals(first),`${theme}/${shared}/${frame}`);}
  }
 }
});

test('cold structural anchors use the ready PNG source frame and vertical bands at every screen ratio',async()=>{
 const {androidWarehouseBands}=await import('../src/presentation/android-warehouse-background.ts');
 const anchors:Record<string,{color:string;rect:readonly [number,number,number,number]}>= {
  day:{color:'#a77233',rect:[-57,242,184,5]},night:{color:'#a77233',rect:[-57,242,184,5]},
  cold_chain:{color:'#59706d',rect:[0,1497.6,1080,4]},rail_freight:{color:'#425b65',rect:[111,32,861,17]},
  toy_workshop:{color:'#7b8470',rect:[20,20,1040,36]},paper_warehouse:{color:'#9d9678',rect:[0,18,1080,41]},
  space_cargo:{color:'#607872',rect:[0,15,1080,32]},steam_foundry:{color:'#625640',rect:[38,45,1008,24]},
  ocean_vault:{color:'#526f67',rect:[30,32,1020,22]},
 };
 configureStaticArt(async()=>new Promise(()=>{}));
 for(const theme of themes)for(const ratio of [16/9,18/9,20/9,21/9]){
  const bounds={x:-47,y:-137,w:1143,h:1143*ratio},bands=androidWarehouseBands(theme,bounds),canvas=createCanvas(360,840),ctx=canvas.getContext('2d') as unknown as CanvasRenderingContext2D;
  const anchor=anchors[theme],seen:number[][]=[],fill=ctx.fillRect.bind(ctx);
  ctx.fillRect=(...rect:[number,number,number,number])=>{if(ctx.fillStyle===anchor.color)seen.push(rect);fill(...rect);};
  drawWarehouse(ctx,view(theme),bounds);
  const mapY=(sy:number)=>{const band=bands.find(b=>sy<=b.source.y+b.source.h)!;return band.destination.y+(sy-band.source.y)*band.destination.h/band.source.h;};
  const [sx,sy,sw,sh]=anchor.rect,classic=theme==='day'||theme==='night';
  const expected=[bounds.x+(classic?(sx+57)/1205:sx/1080)*bounds.w,mapY(sy),sw/(classic?1205:1080)*bounds.w,mapY(sy+sh)-mapY(sy)];
  assert.ok(seen.some(actual=>actual.every((v,i)=>Math.abs(v-expected[i])<1e-7)),`${theme}/${ratio}: fallback anchor must use the exact ready-PNG transform`);
 }
});
