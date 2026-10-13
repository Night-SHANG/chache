import test from 'node:test';
import assert from 'node:assert/strict';
import {createCanvas,loadImage} from '@napi-rs/canvas';
import {resolve} from 'node:path';
import {drawCosmeticPreview} from '../src/presentation/cosmetic-art.ts';
import {configureStaticArt,prepareStaticArt} from '../src/presentation/static-art-resources.ts';
import {STATIC_ART_RESOURCES} from '../src/presentation/static-art-manifest.ts';
import {staticArtCoreRequirementsForView,staticArtRequirementsForView} from '../src/presentation/static-art-requirements.ts';
import {COSMETIC_CATALOG} from '../src/application/cosmetics.ts';
import {sessionHost} from './helpers/session-fixtures.ts';
const shared=['cargo.core','tools.core','forklift.base','forklift.styled','frame.classic','material.board','material.cargo','material.scene'];
test('optional shared preview atlases have fixed requirements and ordinary shop requires no preview PNG',()=>{
 const {session}=sessionHost();assert.deepEqual(staticArtCoreRequirementsForView(session.view).shared,[...shared].sort());
 session.action({type:'shop'});session.action({type:'selectShopTab',tab:'cosmetics'});
 for(const item of COSMETIC_CATALOG){session.action({type:'previewCosmetic',kind:item.kind,id:item.id});assert.deepEqual(staticArtRequirementsForView(session.view),staticArtCoreRequirementsForView(session.view),item.key);}
});
test('every active cosmetic draws immediately with only fixed shared atlases, without preparation text or preview PNG',async()=>{
 const calls:string[]=[];
 configureStaticArt(async path=>{calls.push(path);const resource=Object.values(STATIC_ART_RESOURCES).find(r=>r.src===path)!;assert.ok(resource);assert.ok(!resource.key.startsWith('preview.'),'ordinary shop must not request preview PNG');return await loadImage(resolve(resource.sourcePath)) as unknown as CanvasImageSource;});
 assert.equal((await prepareStaticArt({scene:'scene.day',shared,previews:[]})).status,'ready');
 const expectedCalls=calls.length;
 for(const item of COSMETIC_CATALOG){
  const canvas=createCanvas(816,232),ctx=canvas.getContext('2d'),texts:string[]=[];
  const text=ctx.fillText.bind(ctx);ctx.fillText=(label:string,...args:[number,number,number?])=>{texts.push(label);text(label,...args);};
  drawCosmeticPreview(ctx as unknown as CanvasRenderingContext2D,{x:0,y:0,w:816,h:232},{category:item.kind,theme:item.kind==='theme'?item.id as never:'day',cargoStyle:item.kind==='cargo'?item.id as never:'classic',forklift:item.kind==='forklift'?item.id as never:'yellow'});
  assert.ok(!texts.some(label=>/加载|准备预览/.test(label)),`${item.key}: ${texts.join('|')}`);
  const bytes=ctx.getImageData(0,0,816,232).data;assert.ok(bytes.some((value,index)=>index%4!==3&&value>0),item.key);
  assert.equal(calls.length,expectedCalls,item.key);
 }
});
