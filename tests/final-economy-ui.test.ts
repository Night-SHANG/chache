import test from 'node:test';
import assert from 'node:assert/strict';
import {createCanvas} from '@napi-rs/canvas';
import {mkdirSync,writeFileSync} from 'node:fs';
import {createRunV14,applyCommandV14} from '../src/domain/v14/engine.ts';
import {createRunV11} from '../src/domain/v11/engine.ts';
import {getUiControls} from '../src/presentation/ui.ts';
import {render} from '../src/presentation/renderer.ts';
import {presentationPieceCells} from '../src/presentation/inbound-helpers.ts';
import {L} from '../src/presentation/layout.ts';
import {createProfile} from '../src/application/profile.ts';
import type {ViewState} from '../src/presentation/view-types.ts';
import type {GameRun} from '../src/domain/playable.ts';

const view=(patch:Partial<ViewState>={}):ViewState=>({selectedPieceId:null,hoverOrigin:null,preview:null,dragPoint:null,paused:false,message:'',saveStatus:'',elapsed:0,animation:null,debug:false,needsResume:false,profile:createProfile(),dailyLabel:'2026-10-07',...patch});
const current=()=>applyCommandV14(createRunV14({seed:1,mode:'daily'}),{type:'chooseCleanup',branch:'orders'}).state;
const rushButton=(state:GameRun,value:ViewState)=>getUiControls(state,value).find(c=>c.action.type==='newRun'&&c.action.mode==='rush')!;

test('historical daily completion keeps rush start and retry available with navigation',()=>{
 const state=current(),locked=view({dailyLocked:true,screen:'inboundMenu'});
 assert.notEqual(rushButton(state,locked).disabled,true);
 assert.equal(rushButton(state,locked).label,'开始');
 const result={...state,phase:'result' as const,result:'won' as const,endReason:'completed' as const};
 assert.notEqual(rushButton(result,{...locked,screen:'game'}).disabled,true);
 assert.ok(getUiControls(result,{...locked,screen:'game'}).some(c=>c.action.type==='home'&&!c.disabled));
 for(const dailyLocked of [false,true]){assert.equal(rushButton(result,view({screen:'game',dailyLocked})).label,'再来一局');assert.notEqual(rushButton(result,view({screen:'game',dailyLocked})).disabled,true);}
});

test('locked daily preparations cannot expose an enabled next step or cleanup choice',()=>{
 const state=current(),prepareIntent={spec:{family:'inbound' as const,mode:'daily' as const,rulesetVersion:14 as const,seed:1,guided:false,toolCharges:{rotate:0 as const,clear:0 as const,wildcard:0 as const}},items:[],guide:'direct' as const};
 for(const screen of ['prepareTools','prepareCleanup'] as const){
  const controls=getUiControls(state,view({screen,prepareIntent,dailyLocked:true}));
  assert.ok(controls.some(c=>c.action.type==='back'&&!c.disabled));
  assert.ok(controls.filter(c=>c.action.type!=='back').every(c=>c.disabled));
 }
});

const sizes=[{w:360,h:800,y:24,safeH:752},{w:540,h:960,y:0,safeH:960},{w:1200,h:900,y:0,safeH:900}];
function capture(state:GameRun,value:ViewState,index:number,name:string){
 const viewport=sizes[index],canvas=createCanvas(viewport.w,viewport.h),ctx=canvas.getContext('2d') as unknown as CanvasRenderingContext2D;
 const scale=Math.min(viewport.w/L.width,viewport.safeH/L.height),offset={x:(viewport.w-L.width*scale)/2,y:viewport.y+(viewport.safeH-L.height*scale)/2};
 ctx.setTransform(scale,0,0,scale,offset.x,offset.y);
 const labels:{value:string;color:string;width:number;height:number;left:number;right:number;top:number;bottom:number}[]=[];
 const draw=ctx.fillText.bind(ctx);ctx.fillText=(text,x,y)=>{const m=ctx.measureText(text),t=ctx.getTransform();labels.push({value:text,color:String(ctx.fillStyle),width:m.width*t.a,height:(m.actualBoundingBoxAscent+m.actualBoundingBoxDescent)*t.d,left:(x-m.actualBoundingBoxLeft)*t.a+t.e,right:(x+m.actualBoundingBoxRight)*t.a+t.e,top:(y-m.actualBoundingBoxAscent)*t.d+t.f,bottom:(y+m.actualBoundingBoxDescent)*t.d+t.f});draw(text,x,y);};
 render(ctx,state,value);
 if(process.env.UI_CAPTURE_DIR){mkdirSync(process.env.UI_CAPTURE_DIR,{recursive:true});writeFileSync(`${process.env.UI_CAPTURE_DIR}/${name}-${viewport.w}x${viewport.h}.png`,canvas.toBuffer('image/png'));}
 return labels;
}

for(let index=0;index<sizes.length;index++){
 test(`unlocked rush label and selected outbound mode fit viewport ${sizes[index].w}`,()=>{
  const state=current(),labels=capture(state,view({screen:'inboundMenu',dailyLocked:true}),index,'daily-locked');
  const starts=labels.filter(l=>l.value==='开始');assert.equal(starts.length,3);const rush=starts[2];assert.ok(rush);assert.notEqual(rush.color,'#a2b1be');assert.equal(labels.some(l=>/每日|今日已完成|2026-10-07/.test(l.value)),false);
  const choices=capture(state,view({screen:'colorTiers'}),index,'difficulty');
  assert.equal(choices.some(l=>/×1|×1.25|×1.5|×2/.test(l.value)),false);const mode=choices.find(l=>l.value==='普通');assert.ok(mode);assert.ok(choices.some(l=>l.value==='无限'));
  for(const label of [rush,mode]){assert.ok(label.left>=0&&label.right<=sizes[index].w);assert.ok(label.top>=0&&label.bottom<=sizes[index].h);}
  assert.equal(choices.some(l=>/概率|种子|%/.test(l.value)),false);
 });
 test(`multi-cell rush countdowns and candidate timer stay readable at viewport ${sizes[index].w}`,()=>{
  const state=current();state.board.fill(null);state.cellTraits.fill(null);
  for(const cell of [16,17,24]){state.board[cell]='cargo.food';state.cellTraits[cell]={kind:'rush',remaining:1,bornAtPlacement:2};}
  state.candidates[0]={id:state.candidates[0].id,shapeId:'shape.l3_ne',cargo:'cargo.food',quarterTurns:0,trait:'rush',rushTurns:3};
  assert.equal(presentationPieceCells(state.candidates[0],state.rulesetVersion).length,3);
  const labels=capture(state,view({screen:'game'}),index,'rush');
  const timers=labels.filter(l=>l.value==='1'&&l.color==='#ffb392');assert.equal(timers.length,3);assert.ok(timers.every(l=>l.height>=7));
  const candidate=labels.find(l=>l.value==='加急 · 食品 · 3次');assert.ok(candidate);assert.ok(candidate.width<110*sizes[index].w/360);
  assert.equal(labels.some(l=>l.value==='余3次'),false,'small candidate cells use one legible shared label');
 });
}

test('legacy rush countdown wording remains version-correct',()=>{
 const state=createRunV11({seed:1,mode:'standard'});state.phase='input';state.board[16]='cargo.food';state.cellTraits[16]={kind:'rush',remaining:2,bornAtPlacement:1};
 assert.ok(capture(state,view({screen:'game'}),1,'legacy-rush').some(l=>l.value==='余2次'));
});

import {createRunV12} from '../src/domain/v12/engine.ts';
import {createRunV13} from '../src/domain/v13/engine.ts';
import {sessionHost} from './helpers/session-fixtures.ts';
import {makeAccountFixture,makeAccountRun} from './helpers/account-fixtures.ts';
import {refreshOrdersV14} from '../src/domain/v14/generation.ts';

for(let index=0;index<sizes.length;index++)test(`resolved scores and actual daily reward retain their original identity at viewport ${sizes[index].w}`,()=>{
 for(const create of [createRunV12,createRunV13]){
  const state=create(1,'normal');state.score=625;state.rawScore=500;state.phase='result';state.result='failed';state.endReason='blocked';
  const labels=capture(state,view({screen:'game'}),index,`outbound-result-v${state.rulesetVersion}`);
  assert.ok(labels.some(l=>l.value==='625'));
  assert.ok(labels.some(l=>l.value==='累计出货 50件'));
  assert.equal(labels.some(l=>l.value==='累计出货 62.5件'),false);
 }
 const started=current(),state=refreshOrdersV14({...started,runSerial:1,score:1445,completedOrders:30,shift:5,phase:'result',result:'won',endReason:'completed'});
 const run=makeAccountRun({state,identity:{runId:'test.daily-render',serial:1,rulesetVersion:14,runConfigId:state.runConfigId,mode:'daily',challengeDay:'2026-10-05',economyVersion:2},history:{seed:state.seed,runConfigId:state.runConfigId,head:null,totalCommands:state.commandIndex,tail:[...state.commands]}});
 const {session:s}=sessionHost({formatVersion:2,economyVersion:2,dailyRewards:{},nextRunSerial:2,wallet:700,run});
 const labels=capture(s.state,{...s.view,animation:null,noticeFx:null},index,'daily-result');
 assert.ok(labels.some(l=>l.value==='最高占用  0/45格'),'reserved entrance cells are excluded from playable capacity');
 assert.ok(labels.some(l=>l.value==='每日挑战 · 2026-10-05'));
 assert.equal(labels.some(l=>l.value==='每日挑战 · 2026-10-06'),false);
 const reward=labels.find(l=>l.value==='本局金币 +36 · 余额 736');assert.ok(reward);
 assert.ok(reward.left>=0&&reward.right<=sizes[index].w&&reward.top>=0&&reward.bottom<=sizes[index].h);
 assert.equal(labels.some(l=>/本局金币 \+108/.test(l.value)),false);
});

test('new selector record buckets keep both tool policy and rules version separate',()=>{
 const account=makeAccountFixture(),bucket=(score:number)=>({runs:1,units:1,maxUnits:1,score,wins:0,retirements:0,maxChain:1,best:{score,units:1,chain:1}});
 account.profile.results={'outbound.v12.normal.plain':bucket(625),'outbound.v12.normal.tools':bucket(875),'outbound.v8.normal.plain':bucket(999999),'inbound.standard.v18.hard.plain':bucket(1200),'inbound.standard.v18.hard.tools':bucket(2400),'inbound.standard.v16.normal.plain':bucket(999999),'inbound.standard.v16.normal.tools':bucket(999999),'inbound.standard.v14.plain':bucket(999999),'inbound.standard.v14.tools':bucket(999999),'inbound.standard.v15.plain':bucket(999999),'inbound.standard.v15.tools':bucket(999999),'inbound.standard.v11.plain':bucket(999999)};
 const out=capture(current(),view({screen:'colorTiers',account}),1,'records-outbound');assert.ok(out.some(l=>l.value==='无道具最高分 625'));assert.ok(out.some(l=>l.value==='使用道具最高分 875'));assert.equal(out.some(l=>/999,999/.test(l.value)),false);
 const inbound=capture(current(),view({screen:'inboundMenu',account}),1,'records-inbound');assert.ok(inbound.some(l=>l.value==='无道具最高分 1,200'));assert.ok(inbound.some(l=>l.value==='使用道具最高分 2,400'));assert.equal(inbound.some(l=>/999,999/.test(l.value)),false);
});

import {createRunV9} from '../src/domain/v9/engine.ts';
import {createRun} from '../src/domain/engine.ts';
test('legacy inbound capacity retains all board cells on the result card',()=>{
 for(const state of [createRunV9({seed:1,mode:'standard'}),createRunV11({seed:1,mode:'standard'}),createRun(1,'tutorial',3)]){
  state.phase='result';state.result='failed';state.endReason='blocked';state.maxOccupancy=4;
  const labels=capture(state,view({screen:'game'}),1,`legacy-capacity-v${state.rulesetVersion}`);assert.ok(labels.some(l=>l.value==='最高占用  4/49格'));
 }
});

import {previewPlayablePlacement} from '../src/domain/playable.ts';
import {getTrayRects,cellCenter} from '../src/presentation/layout.ts';
for(let index=0;index<sizes.length;index++)test(`tool selection owns its hint row after a real invalid entry drop at viewport ${sizes[index].w}`,()=>{
 const h=sessionHost({inventory:{rotate:0,clear:0,wildcard:1}}),s=h.session;
 s.action({type:'newRun',mode:'color_exit',difficultyId:'normal',outboundMode:'endless'});s.action({type:'toggleItem',item:'wildcard'});s.action({type:'prepareNext'});
 let chosen:{pieceId:string;origin:{x:number;y:number}}|undefined;
 for(const piece of s.state.candidates)for(let y=0;y<9;y++)for(let x=0;x<9;x++){const origin={x,y};if(previewPlayablePlacement(s.state,piece.id,origin).reason==='入口需留空')chosen={pieceId:piece.id,origin};}
 assert.ok(chosen);const tray=getTrayRects(3)[s.state.candidates.findIndex(piece=>piece.id===chosen.pieceId)],start={x:tray.x+tray.w/2,y:tray.y+tray.h/2},end=cellCenter(chosen.origin,s.state);
 s.input.down(start);s.input.move(end);s.input.up(end);assert.equal(s.view.message,'入口需留空');
 assert.ok(capture(s.state,s.view,index,'invalid-entry-before-tool').some(label=>label.value==='入口需留空'));
 s.action({type:'tool',item:'wildcard'});s.action({type:'toolPiece',pieceId:chosen.pieceId});s.action({type:'toolCargo',cargo:'cargo.chem'});assert.ok(s.view.toolSelection?.preview);h.time(10000);s.tick(10000);
 const labels=capture(s.state,s.view,index,'selected-color-preview');
 assert.equal(labels.filter(label=>label.value==='万能').length,1);assert.equal(labels.some(label=>label.value==='入口需留空'),false,'stale placement toast must not overlap the tool-selection label');
 const entrance=labels.find(label=>label.value==='叉车入口'),toolLabel=labels.find(label=>label.value==='万能');assert.ok(entrance&&toolLabel);assert.ok(entrance.bottom<=toolLabel.top,'entrance identity and active tool label keep separate glyph bounds');assert.equal(s.view.message,'入口需留空');
 s.action({type:'toolCancel'});assert.ok(capture(s.state,s.view,index,'invalid-entry-after-tool-cancel').some(label=>label.value==='入口需留空'),'cancel retains the original unexpired placement feedback');
});
