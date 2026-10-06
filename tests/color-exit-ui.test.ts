import test from 'node:test';
import assert from 'node:assert/strict';
import {createRun} from '../src/domain/engine.ts';
import {createProfile} from '../src/application/profile.ts';
import {getUiControls} from '../src/presentation/ui.ts';
import {render} from '../src/presentation/renderer.ts';
import type {ViewState} from '../src/presentation/view-types.ts';
const view=(patch:Partial<ViewState>={}):ViewState=>({selectedPieceId:null,hoverOrigin:null,preview:null,dragPoint:null,paused:false,message:'',saveStatus:'',elapsed:0,animation:null,debug:false,needsResume:false,screen:'game',profile:createProfile(),...patch});
function surface(){const labels:string[]=[],values:Record<string,unknown>={globalAlpha:1};const noop=()=>{};const ctx=new Proxy({}, {get(_t,k){if(k==='fillText')return(s:string)=>labels.push(s);if(k==='createLinearGradient')return()=>({addColorStop:noop});if(k==='measureText')return(s:string)=>({width:s.length*18});return k in values?values[String(k)]:noop;},set(_t,k,v){values[String(k)]=v;return true;}}) as CanvasRenderingContext2D;return{ctx,words:()=>labels.join('\n')};}

test('legacy active state still opens the two new mode selectors without a legacy new-run button',()=>{
 const s=createRun(1,'color_exit',4),v=view({screen:'menu',variant:'color_exit',modeSlots:{orders:'saved',color_exit:'saved'}}),controls=getUiControls(s,v);
 assert.deepEqual(controls.map(c=>c.action.type),['chooseInbound','chooseColorTier','settings']);
 assert.equal(controls.some(c=>c.action.type==='newRun'),false);
 const out=surface();render(out.ctx,s,v);assert.match(out.words(),/入库模式/);assert.match(out.words(),/出库模式/);assert.doesNotMatch(out.words(),/旧纯色最高分/);
});

test('optional color help explains all three conditions and returns without a new-run side effect',()=>{
 const s=createRun(1,'color_exit',4),v=view({screen:'colorIntro'}),out=surface();render(out.ctx,s,v);
 assert.match(out.words(),/至少4件/);assert.match(out.words(),/同色出口/);assert.match(out.words(),/南入口/);assert.match(out.words(),/30批/);
 assert.deepEqual(getUiControls(s,v).map(c=>c.action.type),['helpBack']);
});

test('color gameplay and pause show gate identities and batches with optional mode-specific help',()=>{
 const s=createRun(1,'color_exit',4);
 for(const paused of [false,true]){const out=surface();render(out.ctx,s,view({paused}));assert.match(out.words(),/北·食品/);assert.match(out.words(),/东·化工/);assert.match(out.words(),/西·机械/);assert.match(out.words(),/30批|30 批/);assert.doesNotMatch(out.words(),/每班6单|新单等下一次|托盘1格|加急到期/);}
 const controls=getUiControls(s,view({paused:true}));assert.ok(controls.some(c=>c.action.type==='help'));assert.equal(controls.some(c=>c.action.type==='continueOvertime'||c.action.type==='finishOvertime'),false);
});

test('switch confirmation explicitly preserves both mode saves and has a real cancel',()=>{
 const s=createRun(1,'standard',3),v=view({confirmation:{kind:'switchMode',variant:'color_exit'}}),out=surface();render(out.ctx,s,v);
 assert.match(out.words(),/保留/);assert.match(out.words(),/旧版.*7×7|出库/);assert.match(out.words(),/取消/);
 assert.deepEqual(getUiControls(s,v).map(c=>c.action.type),['cancel','confirm']);
});

test('color result cannot offer overtime or restart an order run',()=>{
 const s=createRun(1,'color_exit',4);Object.assign(s,{phase:'result',result:'won',completedOrders:30,score:1490,shift:5,endReason:'completed'});
 const controls=getUiControls(s,view());assert.ok(controls.some(c=>c.action.type==='chooseColorTier'));assert.equal(controls.some(c=>c.action.type==='newRun'),false);assert.equal(controls.some(c=>c.action.type==='continueOvertime'),false);
 const out=surface();render(out.ctx,s,view());assert.match(out.words(),/旧版.*7×7|出库/);assert.match(out.words(),/出货批次/);assert.match(out.words(),/累计出货.*149件/);assert.doesNotMatch(out.words(),/五个班次全部完成|当前成绩进入订单/);
});

test('recovery screen for color mode identifies the save and offers continue restart and home',()=>{
 const out=surface();render(out.ctx,createRun(1,'color_exit',4),view({needsResume:true}));
 assert.match(out.words(),/继续上次游戏？/);assert.match(out.words(),/出库模式/);assert.match(out.words(),/继续游戏/);assert.match(out.words(),/重新开始/);assert.match(out.words(),/返回主页/);assert.doesNotMatch(out.words(),/同色出口|旧版|7×7|托盘占1格|加急.*废弃物/);
});

test('mode menu surfaces run-save failure even if the shared Profile is healthy',()=>{
 const out=surface();render(out.ctx,createRun(1,'standard',3),view({screen:'menu',saveStatus:'模式切换保存失败，当前进度仍保留',profileStatus:'长期记录已保存'}));
 assert.match(out.words(),/模式切换保存失败/);assert.doesNotMatch(out.words(),/长期记录已保存/);
});
