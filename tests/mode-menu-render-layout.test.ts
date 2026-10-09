import test from 'node:test';
import assert from 'node:assert/strict';
import {createCanvas} from '@napi-rs/canvas';
import {render} from '../src/presentation/renderer.ts';
import {panel} from '../src/presentation/assets.ts';
import {getUiControls} from '../src/presentation/ui.ts';
import {createRunV18} from '../src/domain/v18/engine.ts';
import {MODE_MENU_CARD} from '../src/presentation/mode-menu-layout.ts';
import {makeAccountFixture} from './helpers/account-fixtures.ts';
import type {ViewState} from '../src/presentation/view-types.ts';
const state=createRunV18({mode:'standard',seed:17,inboundDifficulty:'hard'});
const base:ViewState={screen:'inboundMenu',selectedPieceId:null,hoverOrigin:null,preview:null,dragPoint:null,paused:false,message:'',saveStatus:'',elapsed:0,animation:null,debug:false,needsResume:false};
test('all three inbound painted cards use outbound card width and keep the shared start-button inset',()=>{
 const canvas=createCanvas(1080,1920),ctx=canvas.getContext('2d');render(ctx as unknown as CanvasRenderingContext2D,state,base);
 const reference=createCanvas(1080,1920).getContext('2d');for(const [y,h]of [[520,300],[840,300],[1160,320]])panel(reference as unknown as CanvasRenderingContext2D,{x:132,y,w:816,h},'#293f51','#718d98',20);
 for(const y of [750,1090,1430])for(const x of [145,935])assert.deepEqual([...ctx.getImageData(x,y,1,1).data],[...reference.getImageData(x,y,1,1).data],`inbound card interior at ${x}/${y}`);
 for(const button of getUiControls(state,base).filter(c=>c.action.type==='newRun'))assert.equal(MODE_MENU_CARD.x+MODE_MENU_CARD.w-button.rect.x-button.rect.w,38);
});
test('inbound record text remains inside the text column before the start buttons even at large scores',()=>{
 const account=makeAccountFixture();for(const mode of ['standard','endless'])for(const kind of ['plain','tools'])account.profile.results[`inbound.${mode}.v18.hard.${kind}`]={best:{score:999999999999,units:999999999999},maxUnits:999999999999} as never;
 const ctx=createCanvas(1080,1920).getContext('2d'),records:{x:number;right:number;y:number}[]=[];ctx.fillText=(value,x,y)=>{if(/最高分|最多完成/.test(value))records.push({x,right:x+ctx.measureText(value).width,y});};render(ctx as unknown as CanvasRenderingContext2D,state,{...base,account});
 assert.equal(records.length,8);for(const line of records){assert.ok(line.x>=MODE_MENU_CARD.x+30);assert.ok(line.right<=664,`${line.right} intrudes into the 16px text/button gutter`);}
});
