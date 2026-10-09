import test from 'node:test';
import assert from 'node:assert/strict';
import {createCanvas} from '@napi-rs/canvas';
import {createRunV12} from '../src/domain/v12/engine.ts';
import {createRunV13} from '../src/domain/v13/engine.ts';
import {createRunV14,applyCommandV14} from '../src/domain/v14/engine.ts';
import {makeAccountFixture} from './helpers/account-fixtures.ts';
import type {ResultBucket} from '../src/application/account-types.ts';
import type {GameRun} from '../src/domain/playable.ts';
import {render} from '../src/presentation/renderer.ts';
import {getUiControls} from '../src/presentation/ui.ts';
import {L,mapClientPoint,hitTestPoint} from '../src/presentation/layout.ts';
import type {ViewState} from '../src/presentation/view-types.ts';

const view=(patch:Partial<ViewState>={}):ViewState=>({selectedPieceId:null,hoverOrigin:null,preview:null,dragPoint:null,paused:false,message:'',saveStatus:'',elapsed:0,animation:null,debug:false,needsResume:false,screen:'colorTiers',...patch});
const difficulties=['easy','normal','hard','expert'] as const;
const scoreBucket=(score:number|null):ResultBucket=>({runs:1,units:0,maxUnits:0,score:score??0,wins:0,retirements:0,maxChain:0,best:score===null?null:{score,units:0,chain:0}});
function surface(){
 const ctx=createCanvas(L.width,L.height).getContext('2d') as unknown as CanvasRenderingContext2D;
 const labels:{text:string;x:number;y:number;width:number;font:string;fill:unknown}[]=[],arcs:{x:number;y:number;r:number}[]=[],paths:{x:number;y:number}[]=[];
 const draw=ctx.fillText.bind(ctx),arc=ctx.arc.bind(ctx),move=ctx.moveTo.bind(ctx);
 ctx.fillText=(text,x,y)=>{labels.push({text,x,y,width:ctx.measureText(text).width,font:ctx.font,fill:ctx.fillStyle});draw(text,x,y);};
 ctx.arc=(x,y,r,start,end,counterclockwise)=>{arcs.push({x,y,r});arc(x,y,r,start,end,counterclockwise);};
 ctx.moveTo=(x,y)=>{paths.push({x,y});move(x,y);};
 return {ctx,labels,arcs,paths,words:()=>labels.map(label=>label.text).join('\n')};
}

test('outbound selection exposes two mode choices and one explicit start per difficulty',()=>{
 const state=createRunV13(1,'expert');
 for(const mode of ['normal','endless'] as const){
  const current=view({outboundSelectionMode:mode}),controls=getUiControls(state,current);
  const choices=controls.filter(c=>c.action.type==='selectOutboundMode');
  assert.deepEqual(choices.map(c=>({label:c.label,action:c.action,selected:c.selected})),[
   {label:'普通',action:{type:'selectOutboundMode',mode:'normal'},selected:mode==='normal'},
   {label:'无限',action:{type:'selectOutboundMode',mode:'endless'},selected:mode==='endless'},
  ]);
  const starts=controls.filter(c=>c.action.type==='newRun');
  assert.deepEqual(starts.map(c=>c.action),difficulties.map(difficultyId=>({type:'newRun',mode:'color_exit',difficultyId,outboundMode:mode})));
  assert.deepEqual(starts.map(c=>c.label),['开始','开始','开始','开始']);
 }
 assert.ok(getUiControls(state,view()).filter(c=>c.action.type==='newRun').every(c=>c.action.type==='newRun'&&c.action.outboundMode==='normal'));
});

test('both selectors and all four starts stay distinct and at least 44 CSS pixels across target viewports',()=>{
 for(const [w,h] of [[360,800],[540,960],[1200,900]]){
  const viewport={x:0,y:0,w,h},scale=Math.min(w/L.width,h/L.height),controls=getUiControls(createRunV12(1,'easy'),view());
  for(const [index,control] of controls.entries()){
   const r=control.rect;
   assert.ok(r.w*scale>=44&&r.h*scale>=44,`${control.label}: ${r.w*scale} × ${r.h*scale}`);
   assert.ok(r.x>=0&&r.y>=0&&r.x+r.w<=L.width&&r.y+r.h<=L.height);
   const point=mapClientPoint({x:(w-L.width*scale)/2+(r.x+r.w/2)*scale,y:(h-L.height*scale)/2+(r.y+r.h/2)*scale},viewport);
   assert.ok(point&&hitTestPoint(point,r));
   assert.equal(controls.filter(c=>point&&hitTestPoint(point,c.rect)).length,1);
   for(const other of controls.slice(index+1)){const b=other.rect;assert.ok(r.x+r.w<=b.x||b.x+b.w<=r.x||r.y+r.h<=b.y||b.y+b.h<=r.y);}
  }
 }
});

test('selected mode alone drives plain and used-tool score rows, preserving zero and absent best',()=>{
 const account=makeAccountFixture();
 for(const [index,difficulty] of difficulties.entries()){
  account.profile.results[`outbound.v12.${difficulty}.plain`]=scoreBucket(index===0?0:1100+index);
  account.profile.results[`outbound.v12.${difficulty}.tools`]=scoreBucket(index===0?null:2100+index);
  account.profile.results[`outboundEndless.v13.${difficulty}.plain`]=scoreBucket(3100+index);
  account.profile.results[`outboundEndless.v13.${difficulty}.tools`]=scoreBucket(4100+index);
 }
 for(const mode of ['normal','endless'] as const){
  const current=view({account,outboundSelectionMode:mode}),out=surface();render(out.ctx,createRunV12(1,'easy'),current);
  const plain=out.labels.filter(label=>label.text.startsWith('无道具最高分 ')).map(label=>label.text),tools=out.labels.filter(label=>label.text.startsWith('使用道具最高分 ')).map(label=>label.text);
  assert.deepEqual(plain,mode==='normal'?['无道具最高分 0','无道具最高分 1,101','无道具最高分 1,102','无道具最高分 1,103']:['无道具最高分 3,100','无道具最高分 3,101','无道具最高分 3,102','无道具最高分 3,103']);
  assert.deepEqual(tools,mode==='normal'?['使用道具最高分 暂无','使用道具最高分 2,101','使用道具最高分 2,102','使用道具最高分 2,103']:['使用道具最高分 4,100','使用道具最高分 4,101','使用道具最高分 4,102','使用道具最高分 4,103']);
  assert.doesNotMatch(out.words(),/倍率|×|工具最高|带工具/);
  const normal=out.labels.find(label=>label.text==='普通')!,endless=out.labels.find(label=>label.text==='无限')!;
  assert.notEqual(normal.fill,endless.fill,'only selected mode has the active visual treatment');
 }
 const absent=surface();render(absent.ctx,createRunV12(1,'easy'),view());
 assert.equal(absent.labels.filter(label=>label.text==='无道具最高分 暂无').length,4);
 assert.equal(absent.labels.filter(label=>label.text==='使用道具最高分 暂无').length,4);
});

test('large scores fit beside their start buttons and labels remain readable at 360 CSS pixels',()=>{
 const account=makeAccountFixture();for(const difficulty of difficulties)for(const suffix of ['plain','tools'])account.profile.results[`outbound.v12.${difficulty}.${suffix}`]=scoreBucket(999999999);
 const current=view({account}),out=surface();render(out.ctx,createRunV12(1,'easy'),current);
 const starts=getUiControls(createRunV12(1,'easy'),current).filter(c=>c.action.type==='newRun');
 const rows=out.labels.filter(label=>/^无道具最高分 |^使用道具最高分 /.test(label.text));assert.equal(rows.length,8);
 for(const label of rows){
  const start=starts.find(c=>label.y>=c.rect.y-50&&label.y<=c.rect.y+c.rect.h+25)!;
  assert.ok(start&&label.x+label.width<=start.rect.x-16,`${label.text} fits before start`);
  assert.ok(Number(label.font.match(/([\d.]+)px/)?.[1])>=30,`${label.text} has at least 10 CSS pixel type`);
 }
});

test('infinite cards retain maximum completed batches independently of the best-score run',()=>{
 const account=makeAccountFixture();account.profile.results['outboundEndless.v13.easy.plain']={...scoreBucket(900),maxUnits:50,best:{score:900,units:15,chain:2}};
 const out=surface();render(out.ctx,createRunV13(1,'easy'),view({account,outboundSelectionMode:'endless'}));
 assert.ok(out.labels.some(label=>label.text==='最多出货 50批'));
 assert.equal(out.labels.filter(label=>label.text==='最多出货 暂无').length,3);
 assert.doesNotMatch(out.words(),/15批/);
});

test('both endless HUDs show open-ended stages and cumulative units without finite bars',()=>{
 const inbound=applyCommandV14(createRunV14({seed:1,mode:'endless'}),{type:'chooseCleanup',branch:'orders'}).state;
 const outbound=createRunV13(1,'normal');
 for(const initial of [inbound,outbound])for(const shift of [1,5]){
  const state={...initial,shift,completedOrders:shift===1?0:37} as GameRun,out=surface();render(out.ctx,state,view({screen:'game'}));
  assert.ok(out.labels.some(label=>label.text===`无限 · 阶段${shift}`));
  assert.doesNotMatch(out.labels.filter(label=>label.y<300).map(label=>label.text).join('\n'),/\/5|\/30|\/\s*6/);
  assert.ok(out.labels.some(label=>label.text===`${state.completedOrders} ${state.mode==='color_exit'?'批':'单'}`));
  assert.equal(out.arcs.filter(a=>a.y===260&&a.r===12).length,0,'no five-node completion bar');
  assert.equal(out.paths.filter(p=>p.y===281&&p.x>=180&&p.x<440).length,0,'no six-batch progress strip');
 }
});

test('ordinary outbound retains finite progress and its five stage markers',()=>{
 const state=createRunV12(1,'normal'),out=surface();render(out.ctx,state,view({screen:'game'}));
 assert.ok(out.labels.some(label=>label.text==='阶段 1/5'));
 assert.ok(out.labels.some(label=>label.text==='0/30 批'));
 assert.equal(out.arcs.filter(a=>a.y===260&&a.r===12).length,5);
 assert.equal(out.paths.filter(p=>p.y===281&&p.x>=180&&p.x<440).length,6);
});
