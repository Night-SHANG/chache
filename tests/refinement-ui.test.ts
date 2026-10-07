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
 assert.match(out.words,/旋转选中的货件/);assert.match(out.words,/清除1至2个占用格/);assert.match(out.words,/候选变为单格万能货/);
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
 assert.match(out.words,/每2单清理旧废物/);assert.match(out.words,/每6次放置清理旧废物/);
 assert.match(out.words,/出库订单/);
});

import {createRunV11,applyCommandV11} from '../src/domain/v11/engine.ts';
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

test('new inbound selector reads v11 record buckets while keeping old records untouched',()=>{
 const account=makeAccountFixture(),bucket=(score:number)=>({runs:1,units:1,maxUnits:1,score,wins:0,retirements:0,maxChain:1,best:{score,units:1,chain:1}});
 account.profile.results={'inbound.standard.v11.plain':bucket(222),'inbound.endless.v11.plain':bucket(333),'inbound.standard.v11.tools':bucket(444),'inbound.endless.v11.tools':bucket(555),'inbound.standard.v9.plain':bucket(999)};
 const before=JSON.stringify(account),out=surface(createRunV11({seed:1,mode:'standard'}),view({screen:'inboundMenu',account}));assert.match(out.words,/五班最高分 222 · 无限最高分 333/);assert.match(out.words,/带工具五班 444 · 无限 555/);assert.equal(JSON.stringify(account),before);
});
