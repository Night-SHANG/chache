import test from 'node:test';
import assert from 'node:assert/strict';
import {createCanvas} from '@napi-rs/canvas';
import {render} from '../src/presentation/renderer.ts';
import {getUiControls} from '../src/presentation/ui.ts';
import {createRunV9,applyCommandV9} from '../src/domain/v9/engine.ts';
import {createProfile} from '../src/application/profile.ts';
import {makeAccountFixture} from './helpers/account-fixtures.ts';
import type {GameRun} from '../src/domain/playable.ts';
import type {ViewState} from '../src/presentation/view-types.ts';
const view=(patch:Partial<ViewState>={}):ViewState=>({screen:'game',selectedPieceId:null,hoverOrigin:null,preview:null,dragPoint:null,paused:false,message:'',saveStatus:'',elapsed:0,animation:null,debug:false,needsResume:false,profile:createProfile(),account:makeAccountFixture({wallet:500,inventory:{rotate:2,clear:1,wildcard:0}}),...patch});
function surface(state:GameRun,v:ViewState){const canvas=createCanvas(1080,1920),ctx=canvas.getContext('2d') as unknown as CanvasRenderingContext2D,labels:string[]=[];const draw=ctx.fillText.bind(ctx);ctx.fillText=(s,x,y)=>{labels.push(s);draw(s,x,y);};render(ctx,state,v);return {canvas,ctx,labels,words:labels.join('\n')};}

test('shop has three explained illustrated item cards with owned quantities and independent prices',()=>{
 const s=createRunV9({seed:1,mode:'standard'}),v=view({screen:'shop'}),out=surface(s,v);
 assert.match(out.words,/旋转选中的货件/);assert.match(out.words,/清除1至2个占用格/);assert.match(out.words.replace(/\n/g,''),/将一件待放货换成万能箱/);assert.match(out.words,/占1格，可代替任意货类/);
 assert.match(out.words,/库存 2/);assert.match(out.words,/库存 1/);assert.match(out.words,/库存 0/);
 const buy=getUiControls(s,v).filter(c=>c.action.type==='purchase');assert.equal(buy.length,3);assert.deepEqual(buy.map(c=>c.disabled),[false,false,false]);
 assert.ok(buy.every(c=>c.rect.x>600&&c.rect.h/3>=44&&c.rect.w/3>=44));
 for(const price of ['80','120','160'])assert.match(out.words,new RegExp(`${price}金币`));
 const regions=[550,850,1150].map(y=>out.ctx.getImageData(168,y,150,150).data);assert.notDeepEqual(regions[0],regions[1],'icons have distinct real pixel artwork');assert.notDeepEqual(regions[1],regions[2]);
});

test('carry cards show selected state and the two-kind limit without hiding unavailable items',()=>{
 const s=createRunV9({seed:1,mode:'standard'}),v=view({screen:'prepareTools',prepareIntent:{spec:{family:'inbound',mode:'standard',rulesetVersion:11,seed:1,guided:false,toolCharges:{rotate:0,clear:0,wildcard:0}},guide:'direct',items:['rotate','clear']}}),out=surface(s,v);
 assert.match(out.words,/已选择/);assert.match(out.words,/最多携带2种/);assert.match(out.words,/库存 0/);
 const items=getUiControls(s,v).filter(c=>c.action.type==='toggleItem');assert.equal(items.length,3);assert.equal(items[2].disabled,true);assert.equal(items[0].selected,true);
});

test('toolbox replaces candidate pixels but leaves board and gates exactly unchanged',()=>{
 const s=applyCommandV9(createRunV9({seed:1,mode:'standard',toolCharges:{rotate:1,clear:0,wildcard:0}}),{type:'chooseCleanup',branch:'orders'}).state;
 const closed=surface(s,view()),opened=surface(s,view({toolboxOpen:true}));
 assert.deepEqual(closed.ctx.getImageData(88,525,920,910).data,opened.ctx.getImageData(88,525,920,910).data);
 assert.notDeepEqual(closed.ctx.getImageData(48,1530,984,272).data,opened.ctx.getImageData(48,1530,984,272).data);
 assert.match(opened.words,/工具箱/);assert.match(opened.words,/可用 1/);assert.match(opened.words,/未携带/);
 assert.equal(opened.labels.includes('待入库'),false);
});

test('cleanup choice uses two equal side-by-side illustrated cards over the actual board',()=>{
 const s=createRunV9({seed:1,mode:'standard'}),v=view(),controls=getUiControls(s,v).filter(c=>c.action.type==='chooseCleanup'),out=surface(s,v);
 assert.equal(controls.length,2);assert.equal(controls[0].rect.y,controls[1].rect.y);assert.equal(controls[0].rect.w,controls[1].rect.w);assert.ok(controls[0].rect.x<controls[1].rect.x);
 assert.match(out.words.replace(/\n/g,''),/每完成2单，清除1格废弃物/);assert.match(out.words.replace(/\n/g,''),/每放置6次，清除1格废弃物/);assert.match(out.words,/本局只能选择一种清扫方式/);assert.doesNotMatch(out.words,/空触发/);
 assert.match(out.words,/出库订单/);
});

import {createRunV11,applyCommandV11} from '../src/domain/v11/engine.ts';
import {createRunV14} from '../src/domain/v14/engine.ts';
import {toolPreview} from '../src/presentation/tool-preview.ts';
import {playableOrderStatus} from '../src/presentation/order-feedback.ts';
import {placementRisk} from '../src/presentation/placement-risk.ts';
import {growthFeedback} from '../src/presentation/growth-feedback.ts';
import {pieceCellsV11} from '../src/domain/v11/board.ts';
import {previewPlayablePlacement} from '../src/domain/playable.ts';

test('v11 tool preview keeps its engine identity and provides real reduced board facts',()=>{
 const s=applyCommandV11(createRunV11({seed:1,mode:'standard',toolCharges:{rotate:0,clear:1,wildcard:0}}),{type:'chooseCleanup',branch:'orders'}).state;
 s.board[0]='cargo.food';const before=JSON.stringify(s),preview=toolPreview(s,{type:'clear',cells:[0]});
 assert.equal(preview.state.rulesetVersion,11);assert.equal(preview.state.runConfigId,'run.inbound_v11');assert.equal(preview.state.board[0],null);assert.equal(JSON.stringify(s),before);
});

test('v11 board help result and cleanup render actual run facts without ordinary upgrade copy',()=>{
 const start=createRunV11({seed:1,mode:'standard'}),s=applyCommandV11(start,{type:'chooseCleanup',branch:'orders'}).state;
 for(const candidate of [start,s,{...s,phase:'result' as const,result:'failed' as const,endReason:'blocked' as const}])for(const screen of ['game','colorIntro','helpDetails'] as const){
  const out=surface(candidate,view({screen}));assert.doesNotMatch(out.words,/升级|扩仓|扩容|侧门|专供/);
 }
 const order=s.orders[0];s.board.fill(null);for(let x=0;x<order.amount;x++)s.board[7+x]=order.cargo;assert.equal(playableOrderStatus(s,order).status,'ready');
 const piece=s.candidates[0],offsets=pieceCellsV11(piece),width=Math.max(...offsets.map(p=>p.x))+1;
 const origin={x:Math.max(0,3-Math.min(width-1,1)),y:0};assert.doesNotThrow(()=>placementRisk(s,piece.id,origin));
 const p=previewPlayablePlacement(s,piece.id,origin);assert.doesNotThrow(()=>growthFeedback(s,p.valid?{...p,stateAfter:p.stateAfter}:null));
});

test('toolbox header remains visible during tool targeting with the real remaining charge count',()=>{
 const s=applyCommandV11(createRunV11({seed:1,mode:'standard',toolCharges:{rotate:1,clear:1,wildcard:0}}),{type:'chooseCleanup',branch:'orders'}).state;
 const out=surface(s,view({toolSelection:{item:'rotate',pieceId:null,cells:[],quarterTurns:0}}));assert.ok(out.labels.includes('工具箱'));
});

test('new inbound selector reads v14 record buckets while keeping old records untouched',()=>{
 const account=makeAccountFixture(),bucket=(score:number)=>({runs:1,units:1,maxUnits:1,score,wins:0,retirements:0,maxChain:1,best:{score,units:1,chain:1}});
 account.profile.results={'inbound.standard.v11.plain':bucket(222),'inbound.endless.v11.plain':bucket(333),'inbound.standard.v11.tools':bucket(444),'inbound.endless.v11.tools':bucket(555),'inbound.standard.v9.plain':bucket(999)};
 Object.assign(account.profile.results,{'inbound.standard.v14.plain':bucket(122),'inbound.endless.v14.plain':bucket(133),'inbound.standard.v14.tools':bucket(144),'inbound.endless.v14.tools':bucket(155)});
 const before=JSON.stringify(account),out=surface(createRunV14({seed:1,mode:'standard'}),view({screen:'inboundMenu',account}));assert.match(out.words,/五班最高分 122 · 无限最高分 133/);assert.match(out.words,/带工具五班 144 · 无限 155/);assert.doesNotMatch(out.words,/222|333|444|555|999/);assert.equal(JSON.stringify(account),before);
});

import {INBOUND_GUIDE_V11} from '../src/application/inbound-guide-v11.ts';
import {advanceGuide,isGuideComplete} from '../src/application/tutorials.ts';
import {applyPlayableCommand} from '../src/domain/playable.ts';
import type {GuideProgress} from '../src/application/account-types.ts';

test('real completed v11 tutorial result offers outbound while old v9 still requires upgrade learning',()=>{
 for(const commands of Object.values(INBOUND_GUIDE_V11.branches)){
  let state:GameRun=createRunV11({seed:INBOUND_GUIDE_V11.seed,mode:'standard',guided:true});
  let progress:GuideProgress={learned:[],skipped:false,authoredStartConsumed:true};
  for(const command of commands){const next=applyPlayableCommand(state,command);assert.equal(next.error,undefined);progress=advanceGuide('inbound',progress,state,command,next);state=next.state;}
  assert.equal(isGuideComplete('inbound',progress,11),true);assert.equal(progress.learned.includes('upgrade'),false);
  const finished=applyPlayableCommand(state,{type:'finish'});assert.equal(finished.error,undefined);assert.equal(finished.state.phase,'result');
  const account=makeAccountFixture();account.guides.inbound=progress;
  assert.ok(getUiControls(finished.state,view({account})).some(c=>c.action.type==='chooseColorTier'));
  const old=createRunV9({seed:1,mode:'standard'});old.phase='result';old.result='failed';old.endReason='blocked';
  assert.equal(getUiControls(old,view({account})).some(c=>c.action.type==='chooseColorTier'),false);
  account.guides.inbound={...progress,learned:[...progress.learned,'upgrade']};assert.ok(getUiControls(old,view({account})).some(c=>c.action.type==='chooseColorTier'));
 }
});

import {CLEANUP_RECTS,economyCardRect} from '../src/presentation/economy-ui.ts';

test('primary item and cleanup effect glyphs remain readable and contained at all three viewports',()=>{
 const initial=createRunV11({seed:1,mode:'standard',toolCharges:{rotate:1,clear:1,wildcard:0}}),playing=applyCommandV11(initial,{type:'chooseCleanup',branch:'orders'}).state;
 for(const viewport of [{w:360,h:800},{w:540,h:960},{w:1200,h:900}])for(const screen of ['shop','prepareTools','toolbox','cleanup'] as const){
  const state=screen==='cleanup'?initial:playing,v=view(screen==='toolbox'?{toolboxOpen:true}:screen==='cleanup'?{}:{screen}),canvas=createCanvas(viewport.w,viewport.h),ctx=canvas.getContext('2d') as unknown as CanvasRenderingContext2D;
  const scale=Math.min(viewport.w/1080,viewport.h/1920),offset={x:(viewport.w-1080*scale)/2,y:(viewport.h-1920*scale)/2};ctx.setTransform(scale,0,0,scale,offset.x,offset.y);
  const effects=screen==='cleanup'?[['每完成2单，','清除1格废弃物'],['每放置6次，','清除1格废弃物']]:screen==='toolbox'?[['旋转选中货件'],['清除1至2格'],['改单格万能货']]:[['旋转选中的货件'],['清除1至2个占用格'],['将一件待放货','换成万能箱']];
  const glyphs:{value:string;size:number;left:number;right:number;top:number;bottom:number}[]=[],draw=ctx.fillText.bind(ctx);
  ctx.fillText=(value,x,y)=>{if(effects.flat().includes(value)){const m=ctx.measureText(value);glyphs.push({value,size:Number(ctx.font.match(/([\d.]+)px/)![1]),left:x-m.actualBoundingBoxLeft,right:x+m.actualBoundingBoxRight,top:y-m.actualBoundingBoxAscent,bottom:y+m.actualBoundingBoxDescent});}draw(value,x,y);};
  render(ctx,state,v);assert.equal(glyphs.length,effects.flat().length);
  const controls=getUiControls(state,v).filter(c=>['purchase','toggleItem','tool','chooseCleanup'].includes(c.action.type));
  effects.forEach((lines,index)=>{
   const r=screen==='cleanup'?CLEANUP_RECTS[index]:screen==='toolbox'?controls[index].rect:economyCardRect(index);
   const cardGlyphs=glyphs.filter(glyph=>lines.includes(glyph.value)&&glyph.left>=r.x&&glyph.right<=r.x+r.w);assert.equal(cardGlyphs.length,lines.length);
   cardGlyphs.forEach(glyph=>{assert.ok(glyph.size>=(screen==='shop'||screen==='prepareTools'?34:32),`${screen} primary effect is only ${glyph.size}px`);
   assert.ok(glyph.left>=r.x+12&&glyph.right<=r.x+r.w-12&&glyph.top>=r.y+12&&glyph.bottom<=r.y+r.h-12,`${screen} clips ${glyph.value}`);
   if(screen==='shop'||screen==='prepareTools')assert.ok(glyph.right<=controls[index].rect.x-12,`${screen} overlaps purchase/carry action`);
   assert.ok(offset.x+glyph.left*scale>=0&&offset.x+glyph.right*scale<=viewport.w&&offset.y+glyph.bottom*scale<=viewport.h);});
   for(const [n,glyph] of cardGlyphs.entries())for(const other of cardGlyphs.slice(n+1))assert.ok(glyph.bottom<other.top||other.bottom<glyph.top);
  });
 }
});

test('wildcard main secondary and selected glyphs do not overlap in the carry card',()=>{
 const state=createRunV11({seed:1,mode:'standard'}),r=economyCardRect(2),ctx=createCanvas(1080,1920).getContext('2d') as unknown as CanvasRenderingContext2D,draw=ctx.fillText.bind(ctx),glyphs:{value:string;top:number;bottom:number}[]=[];
 ctx.fillText=(value,x,y)=>{if(x===r.x+210&&y>=r.y+100){const m=ctx.measureText(value);glyphs.push({value,top:y-m.actualBoundingBoxAscent,bottom:y+m.actualBoundingBoxDescent});}draw(value,x,y);};
 render(ctx,state,view({screen:'prepareTools',prepareIntent:{spec:{family:'inbound',mode:'standard',rulesetVersion:11,seed:1,guided:false,toolCharges:{rotate:0,clear:0,wildcard:0}},guide:'direct',items:['wildcard']}}));
 assert.deepEqual(glyphs.map(g=>g.value),['将一件待放货','换成万能箱','占1格，可代替任意货类','已选择']);
 for(const [i,g] of glyphs.entries()){assert.ok(g.bottom<=r.y+r.h-12);if(i)assert.ok(g.top-glyphs[i-1].bottom>=8);}
 const help=surface(state,view({screen:'helpDetails'}));assert.doesNotMatch(help.words,/空触发/);assert.match(help.words,/没有废弃物时也会重新计数/);
});
