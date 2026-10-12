import './helpers/static-art-fixture.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createCanvas} from '@napi-rs/canvas';
import {render} from '../src/presentation/renderer.ts';
import {getUiControls} from '../src/presentation/ui.ts';
import {createRunV18} from '../src/domain/v18/engine.ts';
import type {ViewState} from '../src/presentation/view-types.ts';
const base:ViewState={screen:'inboundMenu',selectedPieceId:null,hoverOrigin:null,preview:null,dragPoint:null,paused:false,message:'',saveStatus:'',elapsed:0,animation:null,debug:false,needsResume:false};
test('both mode menus derive equal card edges and start insets from one shared layout',async()=>{

 const {MODE_MENU_CARD,modeMenuStartRect}=await import('../src/presentation/mode-menu-layout.ts');
 assert.deepEqual(MODE_MENU_CARD,{x:132,w:816,rightInset:38});
 const state=createRunV18({mode:'standard',seed:17,inboundDifficulty:'hard'});
 for(const screen of ['inboundMenu','colorTiers'] as const){
  const canvas=createCanvas(1080,1920),ctx=canvas.getContext('2d'),paths:{x:number;y:number;w:number;h:number}[]=[];let points:number[][]=[];
  const begin=ctx.beginPath.bind(ctx),move=ctx.moveTo.bind(ctx),line=ctx.lineTo.bind(ctx),quad=ctx.quadraticCurveTo.bind(ctx),stroke=ctx.stroke.bind(ctx);
  ctx.beginPath=()=>{points=[];begin();};ctx.moveTo=(x,y)=>{points.push([x,y]);move(x,y);};ctx.lineTo=(x,y)=>{points.push([x,y]);line(x,y);};ctx.quadraticCurveTo=(cx,cy,x,y)=>{points.push([cx,cy],[x,y]);quad(cx,cy,x,y);};ctx.stroke=()=>{if(points.length){const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]);paths.push({x:Math.min(...xs),y:Math.min(...ys),w:Math.max(...xs)-Math.min(...xs),h:Math.max(...ys)-Math.min(...ys)});}stroke();};
  render(ctx as unknown as CanvasRenderingContext2D,state,{...base,screen});
  const expected=screen==='inboundMenu'?[[520,300],[840,300],[1160,320]]:[[534,224],[778,224],[1022,224],[1266,224]];
  for(const [y,h] of expected)assert.ok(paths.some(p=>p.x===132&&p.y===y&&p.w===816&&p.h===h),`${screen} real panel at ${y} has shared edges`);
  const starts=getUiControls(state,{...base,screen}).filter(c=>c.action.type==='newRun');
  assert.equal(starts.length,screen==='inboundMenu'?3:4);
  for(const c of starts){assert.equal(c.rect.x+c.rect.w,MODE_MENU_CARD.x+MODE_MENU_CARD.w-MODE_MENU_CARD.rightInset);assert.deepEqual(c.rect,modeMenuStartRect(c.rect.y,c.rect.w,c.rect.h));for(const width of [320,360,540])assert.ok(c.rect.w*width/1080>=44);}
 }
});
