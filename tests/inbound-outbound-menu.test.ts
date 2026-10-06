import test from 'node:test';
import assert from 'node:assert/strict';
import {createCanvas} from '@napi-rs/canvas';
import {createRun} from '../src/domain/engine.ts';
import {createProfile, getOutboundProfile, getEndlessProfile} from '../src/application/profile.ts';
import {getUiControls,runSlotLabel} from '../src/presentation/ui.ts';
import {render} from '../src/presentation/renderer.ts';
import type {ViewState} from '../src/presentation/view-types.ts';
import type {RunState} from '../src/domain/types.ts';
import type {Rect} from '../src/presentation/layout.ts';

const view=(patch:Partial<ViewState>={}):ViewState=>({selectedPieceId:null,hoverOrigin:null,preview:null,dragPoint:null,paused:false,message:'',saveStatus:'',elapsed:0,animation:null,debug:false,needsResume:false,screen:'game',profile:createProfile(),...patch});
const inbound=()=>createRun(97,'standard',3),outbound=()=>createRun(97,'color_exit',8,'expert'),endless=()=>createRun(97,'endless',7);
function surface(){
 const ctx=createCanvas(1080,1920).getContext('2d') as unknown as CanvasRenderingContext2D;
 const labels:{text:string;x:number;y:number;font:string}[]=[],fills:{style:unknown}[]=[];
 const draw=ctx.fillText.bind(ctx),fill=ctx.fill.bind(ctx);
 ctx.fillText=(text,x,y)=>{labels.push({text,x,y,font:ctx.font});draw(text,x,y);};
 ctx.fill=()=>{fills.push({style:ctx.fillStyle});fill();};
 return{ctx,labels,fills,words:()=>labels.map(label=>label.text).join('\n')};
}
const overlap=(a:Rect,b:Rect)=>a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y;

test('home has two clear mode entries and settings regardless of existing saves',()=>{
 for(const state of [inbound(),outbound(),endless()]){
  const current=view({screen:'menu',modeSlots:{orders:'saved',outbound_expert:'saved',inbound_endless:'result'}});
  const controls=getUiControls(state,current);
  assert.deepEqual(controls.map(control=>control.action),[{type:'chooseInbound'},{type:'chooseColorTier'},{type:'settings'}]);
  assert.match(controls[0].label,/入库模式/);assert.match(controls[1].label,/出库模式/);
  const out=surface();render(out.ctx,state,current);assert.match(out.words(),/按订单配货/);assert.match(out.words(),/同色连出口/);
  assert.doesNotMatch(out.words(),/继续进度|三档比例|订单模式|旧纯色最高分/);
 }
});
test('inbound submenu starts five shifts endless or daily without per-save continue controls',()=>{
 const current=view({screen:'inboundMenu',modeSlots:{orders:'saved',inbound_endless:'saved'}}),controls=getUiControls(inbound(),current);
 assert.deepEqual(controls.map(control=>control.action),[{type:'newRun',mode:'standard'},{type:'newRun',mode:'endless'},{type:'newRun',mode:'daily'},{type:'home'}]);
 assert.equal(controls[0].label,'开始五班');assert.equal(controls[1].label,'开始无限');assert.equal(controls[2].label,'开始挑战');
 const out=surface();render(out.ctx,inbound(),current);assert.match(out.words(),/普通五班/);assert.match(out.words(),/无限入库/);assert.match(out.words(),/每日挑战/);
 assert.ok(controls.slice(0,3).every(control=>/开始/.test(control.label)));
});
test('outbound selector starts four difficulties without probability seed or version details',()=>{
 const current=view({screen:'colorTiers',comparisonSeed:12345,modeSlots:{outbound_easy:'saved',outbound_expert:'result'}}),controls=getUiControls(outbound(),current),out=surface();render(out.ctx,outbound(),current);
 assert.deepEqual(controls.filter(control=>control.action.type==='newRun').map(control=>control.action),['easy','normal','hard','expert'].map(difficultyId=>({type:'newRun',mode:'color_exit',difficultyId})));
 assert.equal(controls.some(control=>control.action.type==='switchMode'),false);
 for(const name of ['简单','中等','困难','专业'])assert.ok(out.labels.some(label=>label.text===name));
 assert.equal(out.labels.filter(label=>label.text==='最高分 0').length,4);
 assert.doesNotMatch(out.words(),/9×9|12345|种子|概率|%|形状等级|继续进度|自动.*升档|旧版/);
 assert.deepEqual(controls.slice(4).map(control=>control.action),[{type:'home'}]);
});
test('legacy saves stay hidden from the new selector while direct compatibility screens remain readable',()=>{
 for(const status of ['empty','unavailable','saved','result','corrupt'] as const){
  const controls=getUiControls(outbound(),view({screen:'colorTiers',modeSlots:{color_exit:status}}));
  assert.equal(controls.some(control=>control.action.type==='chooseLegacy'),false);
 }
 const current=view({screen:'legacyRuns',modeSlots:{color_exit:'corrupt',color_exit_entry:'saved',color_exit_middle:'result',color_exit_late:'empty'}}),controls=getUiControls(outbound(),current),out=surface();render(out.ctx,outbound(),current);
 assert.deepEqual(controls.filter(control=>control.action.type==='switchMode').map(control=>control.action),[{type:'switchMode',variant:'color_exit'},{type:'switchMode',variant:'color_exit_entry'},{type:'switchMode',variant:'color_exit_middle'}]);
 assert.equal(controls.some(control=>control.action.type==='newRun'),false);assert.match(out.words(),/7×7/);assert.match(out.words(),/旧版/);assert.match(out.words(),/存档待处理/);
});
test('paused modes put safe continue first then a restart preserving the current new identity',()=>{
 for(const [state,expected] of [[inbound(),{type:'newRun',mode:'standard'}],[outbound(),{type:'newRun',mode:'color_exit',difficultyId:'expert'}],[endless(),{type:'newRun',mode:'endless'}]] as const){
  const controls=getUiControls(state,view({paused:true}));assert.equal(controls[0].action.type,'continue');assert.match(controls[0].label,/继续游戏/);
  assert.deepEqual(controls.find(control=>control.label==='重新开始')?.action,expected);assert.ok(controls.some(control=>control.action.type==='home'));
  assert.equal(controls.some(control=>control.action.type==='finishEndless'),state.mode==='endless');
 }
});
test('endless settlement cannot skip a pending upgrade',()=>{
 assert.equal(getUiControls({...endless(),phase:'upgrade'},view({paused:true})).some(control=>control.action.type==='finishEndless'),false);
});
test('leave confirmation clearly discards only current board with safe continue first',()=>{
 const current=view({confirmation:{kind:'leaveRun'}}),out=surface();render(out.ctx,endless(),current);
 assert.match(out.words(),/结束本局并返回主页？/);assert.match(out.words(),/本局进度将丢失/);assert.match(out.words(),/历史成绩和设置会保留/);
 assert.deepEqual(getUiControls(endless(),current).map(control=>[control.label,control.action.type]),[['继续游戏','cancel'],['结束本局','confirm']]);
});
test('destructive dialogs visually emphasize the safe continue control',()=>{
 for(const kind of ['leaveRun','newRun','finishEndless'] as const){
  const current=view({confirmation:{kind}}),out=surface();render(out.ctx,endless(),current);
  const [safe,destructive]=getUiControls(endless(),current);
  const safePixel=out.ctx.getImageData(safe.rect.x+20,safe.rect.y+20,1,1).data;
  const destructivePixel=out.ctx.getImageData(destructive.rect.x+20,destructive.rect.y+20,1,1).data;
  assert.ok(safePixel[0]>safePixel[2]+70,'safe choice has the warm primary treatment');
  assert.ok(destructivePixel[2]>destructivePixel[0],'destructive choice has the secondary treatment');
 }
});
test('legacy pause restart redirects through the new difficulty chooser and never creates another legacy run',()=>{
 for(const state of [createRun(97,'color_exit',4),createRun(97,'color_exit',5,'middle'),createRun(97,'color_exit',6,'expert')]){
  const controls=getUiControls(state,view({paused:true}));
  assert.deepEqual(controls.find(control=>control.label==='重新开始')?.action,{type:'chooseColorTier'});
  assert.equal(controls.some(control=>control.action.type==='newRun'),false);
  const current=view({confirmation:{kind:'leaveRun',nextScreen:'colorTiers'}}),out=surface();render(out.ctx,state,current);
  assert.match(out.words(),/结束本局并选择难度？/);
  assert.deepEqual(getUiControls(state,current).map(control=>control.action.type),['cancel','confirm']);
 }
});
test('new run confirmation states current board loss and keeps history and settings safe',()=>{
 const current=view({confirmation:{kind:'newRun',mode:'color_exit',difficultyId:'hard',seed:777}}),out=surface();render(out.ctx,outbound(),current);
 assert.match(out.words(),/重新开始？/);assert.match(out.words(),/本局进度将丢失/);assert.match(out.words(),/历史成绩和设置会保留/);assert.doesNotMatch(out.words(),/9×9|777|种子/);
 assert.equal(getUiControls(outbound(),current)[0].action.type,'cancel');
});
test('endless settlement is an explicit score recording action and retired never means victory',()=>{
 const current=view({confirmation:{kind:'finishEndless'}}),dialog=surface();render(dialog.ctx,endless(),current);assert.match(dialog.words(),/将记录当前分数/);assert.match(dialog.words(),/结束后不能继续本局/);
 const state={...endless(),phase:'result',result:'won',endReason:'retired',completedOrders:42,score:900,shift:5,maxOccupancy:35} as RunState;
 const out=surface();render(out.ctx,state,view());assert.match(out.words(),/无限入库.*结算|无限入库结算/);assert.match(out.words(),/已按当前分数结算/);assert.match(out.words(),/完成订单.*42/);assert.match(out.words(),/最高占用/);assert.match(out.words(),/关键升级/);assert.doesNotMatch(out.words(),/完美收工|五个班次全部完成|通关|30批目标/);
 assert.deepEqual(getUiControls(state,view()).find(control=>control.action.type==='newRun')?.action,{type:'newRun',mode:'endless'});
});
test('endless pause and recovery retain mode score and stage without a finite victory target',()=>{
 for(const patch of [{paused:true},{needsResume:true}]){const out=surface();render(out.ctx,endless(),view(patch));assert.match(out.words(),/阶段 1\/5/);assert.match(out.words(),/无限入库/);assert.match(out.words(),/得分 0/);assert.doesNotMatch(out.words(),/30批|30单.*通关|五班.*过关/);}
});
test('new mode profiles never display legacy or another-difficulty high scores',()=>{
 const profile=createProfile();profile.bestScores['standard.v3']={score:101,chain:1};profile.colorExit={stats:{runs:1,batches:1,wins:0,maxChain:1},bestScores:{v4:{score:9999,chain:1}},lastRecordedRun:null};
 profile.outboundV8={};profile.outboundDifficulties={};for(const [index,id] of (['easy','normal','hard','expert'] as const).entries()){const p=getOutboundProfile(profile,id,8);p.bestScores.v8={score:222+index*111,chain:1};profile.outboundV8[id]=p;const old=getOutboundProfile(profile,id,6);old.bestScores.v6={score:6666+index,chain:1};profile.outboundDifficulties[id]=old;}
 profile.endless=getEndlessProfile(profile);profile.endless.bestScores.v7={score:777,chain:1,orders:10};
 const outboundOut=surface();render(outboundOut.ctx,outbound(),view({screen:'colorTiers',profile}));for(const [index,score] of [222,333,444,555].entries())assert.ok(outboundOut.labels.some(label=>label.text===`最高分 ${score}`&&label.y===546+index*244));assert.doesNotMatch(outboundOut.words(),/9,999|6,66[6-9]|777|101/);
 const inboundOut=surface();render(inboundOut.ctx,endless(),view({screen:'inboundMenu',profile}));assert.match(inboundOut.words(),/无限最高分.*777/);assert.match(inboundOut.words(),/五班最高分.*101/);assert.doesNotMatch(inboundOut.words(),/9,999|555/);
});
test('all new controls fit mobile and landscape viewport with readable labels and no overlaps',()=>{
 for(const current of [view({screen:'menu'}),view({screen:'inboundMenu'}),view({screen:'colorTiers',modeSlots:{color_exit:'saved'}}),view({screen:'legacyRuns',modeSlots:{color_exit:'saved',color_exit_entry:'saved',color_exit_middle:'result',color_exit_late:'corrupt'}}),view({paused:true}),view({confirmation:{kind:'leaveRun'}})]){
  const out=surface();render(out.ctx,endless(),current);const controls=getUiControls(endless(),current);
  for(const [index,c] of controls.entries()){assert.ok(c.rect.x>=0&&c.rect.y>=0&&c.rect.x+c.rect.w<=1080&&c.rect.y+c.rect.h<=1920);for(const other of controls.slice(index+1))assert.equal(overlap(c.rect,other.rect),false);}
  for(const label of out.labels.filter(label=>controls.some(c=>c.label.split('\n').includes(label.text)))){const size=Number(label.font.match(/([\d.]+)px/)?.[1]);assert.ok(size>=28,`${label.text} shrank to ${size}`);}
 }
});
test('resume overlay stays the only recovery flow above all menus',()=>{
 for(const screen of ['menu','inboundMenu','colorTiers','legacyRuns'] as const){const current=view({screen,needsResume:true}),out=surface();assert.deepEqual(getUiControls(outbound(),current),[]);render(out.ctx,outbound(),current);assert.match(out.words(),/继续上次游戏？/);assert.match(out.words(),/出库 · 专业/);assert.match(out.words(),/继续游戏/);assert.doesNotMatch(out.words(),/9×9|选择难度|旧版/);}
});
test('slot labels retain mode and difficulty names without technical details',()=>{assert.equal(runSlotLabel('color_exit_middle'),'出库 · 中段');assert.equal(runSlotLabel('outbound_expert'),'出库 · 专业');assert.equal(runSlotLabel('inbound_endless'),'无限入库');});
