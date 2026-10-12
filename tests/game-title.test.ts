import './helpers/static-art-fixture.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createCanvas,GlobalFonts} from '@napi-rs/canvas';
import {render} from '../src/presentation/renderer.ts';
import {createRunV18} from '../src/domain/v18/engine.ts';
import type {ViewState} from '../src/presentation/view-types.ts';

GlobalFonts.registerFromPath('/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc','Noto Sans CJK SC');
GlobalFonts.registerFromPath('/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc','Noto Sans CJK SC');
const state=createRunV18({mode:'standard',seed:17,inboundDifficulty:'hard'});
const base:ViewState={screen:'menu',selectedPieceId:null,hoverOrigin:null,preview:null,dragPoint:null,paused:false,message:'',saveStatus:'',elapsed:0,animation:null,debug:false,needsResume:false};
for(const [screen,x,y,size] of [['menu',540,267,151],['game',49,112,115]] as const){
 test(`${screen} paints the renamed title in the existing two-plus-four layout`,()=>{
  const ctx=createCanvas(1080,1920).getContext('2d'),fill=ctx.fillText.bind(ctx),labels:{text:string;x:number;y:number;font:string}[]=[];
  ctx.fillText=(value,x,y,...rest)=>{labels.push({text:String(value),x,y,font:ctx.font});return fill(value,x,y,...rest);};
  render(ctx as unknown as CanvasRenderingContext2D,state,{...base,screen});
  const first=labels.find(row=>row.text==='货箱');assert.ok(first,'The actual renderer must paint 货箱');
  assert.equal(first.x,x);assert.equal(first.y,y);assert.ok(first.font.includes(`${size}px`));
  assert.ok(labels.some(row=>row.text==='最后一格'));assert.ok(labels.every(row=>row.text!=='爆仓'));
 });
}
