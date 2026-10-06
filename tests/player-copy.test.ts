import test from 'node:test';
import assert from 'node:assert/strict';
import {createCanvas} from '@napi-rs/canvas';
import {createRun,previewPlacement} from '../src/domain/engine.ts';
import {createProfile} from '../src/application/profile.ts';
import {render} from '../src/presentation/renderer.ts';
import {getUiControls} from '../src/presentation/ui.ts';
import {colorExitFeedback,colorExitBoardHint} from '../src/presentation/color-exit-renderer.ts';
import {orderFeedback} from '../src/presentation/order-feedback.ts';
import type {RunState} from '../src/domain/types.ts';
import type {ViewState} from '../src/presentation/view-types.ts';

const view=(patch:Partial<ViewState>={}):ViewState=>({screen:'game',selectedPieceId:null,hoverOrigin:null,preview:null,dragPoint:null,paused:false,message:'',saveStatus:'进度已保存',profileStatus:'长期记录已保存',elapsed:0,animation:null,debug:false,needsResume:false,profile:createProfile(),dailyLabel:'2031-04-07',...patch});
const outbound=():RunState=>createRun(7,'color_exit',8,'normal');
const inbound=():RunState=>createRun(7,'standard',3);
const denied=/seed|种子|百分比|%|概率|实验|开发版|规则\s*v\d|北京|UTC|离线|无在线排行|旧版|7×7|9×9|进度已保存|长期记录已保存|共同对比|形状等级|本局固定/i;
function capture(state:RunState,current:ViewState,width=1080,height=1920){
 const canvas=createCanvas(width,height),ctx=canvas.getContext('2d') as unknown as CanvasRenderingContext2D;
 const scale=Math.min(width/1080,height/1920);ctx.translate((width-1080*scale)/2,(height-1920*scale)/2);ctx.scale(scale,scale);
 const labels:{value:string;left:number;right:number;top:number;bottom:number}[]=[];
 const fill=ctx.fillText.bind(ctx);ctx.fillText=(value,x,y)=>{const m=ctx.measureText(value),t=ctx.getTransform();const left=x-m.actualBoundingBoxLeft,right=x+m.actualBoundingBoxRight,top=y-m.actualBoundingBoxAscent,bottom=y+m.actualBoundingBoxDescent;labels.push({value,left:t.a*left+t.c*top+t.e,right:t.a*right+t.c*bottom+t.e,top:t.b*left+t.d*top+t.f,bottom:t.b*right+t.d*bottom+t.f});fill(value,x,y);};
 render(ctx,state,current);return {words:labels.map(l=>l.value).join('\n'),labels};
}

for(const screen of ['menu','inboundMenu','colorTiers','settings','colorIntro'] as const)test(`${screen} shows player copy without development or probability details`,()=>{
 const s=outbound(),v=view({screen,modeSlots:{color_exit:'saved',color_exit_entry:'saved'}}),out=capture(s,v);
 assert.doesNotMatch(out.words,denied);
 assert.equal(getUiControls(s,v).some(c=>['chooseLegacy','comparisonSeedNext'].includes(c.action.type)),false);
});

test('game, pause, recovery, results and confirmations retain short player identities',()=>{
 for(const base of [outbound(),inbound(),createRun(7,'color_exit',5,'middle')])for(const patch of [{},{paused:true},{needsResume:true},{confirmation:{kind:'newRun' as const,mode:'color_exit' as const,difficultyId:'normal' as const}},{confirmation:{kind:'leaveRun' as const,nextScreen:'colorTiers' as const}},{confirmation:{kind:'resetProfile' as const}}])assert.doesNotMatch(capture(base,view(patch)).words,denied);
 for(const base of [outbound(),inbound()])assert.doesNotMatch(capture({...base,phase:'result',result:'failed'},view()).words,denied);
 const upgrade={...inbound(),phase:'upgrade' as const,upgradeChoices:['upgrade.side_gate','upgrade.pallet_pass','upgrade.light_orders']};assert.doesNotMatch(capture(upgrade,view()).words,denied);
 assert.doesNotMatch(capture(createRun(7,'tutorial',3),view()).words,denied);
});

test('normal gameplay is quiet while persistence warnings remain visible across pages',()=>{
 for(const s of [outbound(),inbound()]){
  const out=capture(s,view()).words;assert.doesNotMatch(out,/固定朝向|不可旋转|拖入货件|给叉车留|每色4件|状态/);
  for(const screen of ['game','menu','inboundMenu','colorTiers','settings'] as const){const warning='保存失败，当前进度尚未保存';assert.match(capture(s,view({screen,saveStatus:warning})).words,/保存失败/);}
 }
});

test('both modes have one optional help entry and inbound details preserve special rules',()=>{
 for(const s of [outbound(),inbound()]){
  const controls=getUiControls(s,view({paused:true}));assert.equal(controls.filter(c=>c.action.type==='help').length,1);assert.doesNotMatch(capture(s,view({paused:true})).words,/每色上下左右|有效落子后查|托盘占1格/);
  const help=view({screen:'colorIntro',paused:true});assert.equal(getUiControls(s,help).filter(c=>c.action.type==='helpBack').length,1);
  const out=capture(s,help).words;assert.match(out,/玩法说明/);assert.match(out,/上下左右/);assert.match(out,/空路/);
 }
 const details=view({screen:'helpDetails' as ViewState['screen'],paused:true});const out=capture(inbound(),details).words;
 for(const word of ['托盘','万能','加急','废弃物','危险','侧门','不计分','新单'])assert.ok(out.includes(word),word);
});

test('interactive tutorial exposes a visible skip control but terminal gameplay does not',()=>{
 const s=createRun(7,'tutorial',3),controls=getUiControls(s,view()),skip=controls.find(c=>c.action.type==='skipTutorial');assert.ok(skip);assert.deepEqual(skip.rect,{x:820,y:1836,w:212,h:60});assert.match(capture(s,view()).words,/跳过教学/);
 const developer=view({developerMode:true}),developerSkip=getUiControls(s,developer).find(c=>c.action.type==='skipTutorial');assert.equal(developerSkip?.rect.x,600);assert.match(capture(s,developer).words,/状态/);
 assert.equal(getUiControls({...s,phase:'result',result:'won'},view()).some(c=>c.action.type==='skipTutorial'),false);
});

test('diagnostics need explicit developer mode, even when debug is already true',()=>{
 for(const developerMode of [undefined,false])assert.doesNotMatch(capture(inbound(),view({developerMode,debug:true} as Partial<ViewState>)).words,/rng_state|诊断|开发版|状态/);
 assert.match(capture(inbound(),view({developerMode:true,debug:true} as Partial<ViewState>)).words,/rng_state|诊断/);
});

test('only v8 terminal occupied entrance gets the unrecoverable obstruction cause',()=>{
 for(const version of [6,8])for(const blocked of [false,true]){
  const s={...outbound(),rulesetVersion:version,runConfigId:`run.outbound9_v${version}.normal`,phase:'result' as const,result:'failed' as const};s.board[76]=blocked?'cargo.food':null;
  const words=capture(s,view()).words;
  assert.match(words,version===8&&blocked?/入口堵塞\n无法继续出货/:/空间不足/);
  assert.equal(getUiControls(s,view()).some(c=>['continue','help','skipTutorial'].includes(c.action.type)),false);
  assert.equal(getUiControls(s,view({paused:true})).some(c=>['continue','help','skipTutorial'].includes(c.action.type)),false);
 }
});

test('outbound chain animation keeps a concise chain notice with no duplicated tray instruction',()=>{
 const s=outbound();s.board.fill(null);s.board[4]='cargo.food';s.board[5]='cargo.food';s.candidates=[{id:'mixed',shapeId:'shape.square',cargo:'cargo.food',cellCargos:['cargo.food','cargo.food','cargo.chem','cargo.chem']}];
 const shipment={...previewPlacement(s,'mixed',{x:4,y:1}).shipments[0],chain:2};assert.equal(shipment.transport,'conveyor');
 const words=capture(s,view({animation:{shipment,progress:.3,board:s.board.slice()},message:'2连出货'})).words;
 assert.equal(words.split('\n').filter(word=>word==='2连出货').length,1);
});

test('simultaneous run and profile save failures stay in view at the bottom of gameplay',()=>{
 const s=inbound(),current=view({saveStatus:'保存失败，上一份有效存档仍保留',profileStatus:'长期记录保存失败，旧记录已保护'}),out=capture(s,current);
 assert.match(out.words,/保存失败，上一份有效存档仍保留/);assert.match(out.words,/长期记录保存失败，旧记录已保护/);
 for(const label of out.labels)assert.ok(label.bottom<=1920,`${label.value}: ${label.bottom}`);
});

test('placement warnings are concise while developer mode preserves the full diagnostic',()=>{
 for(const kind of ['entry-blocked','route-cut'] as const){
  const placementRisk={level:'warning' as const,kind,message:kind==='entry-blocked'?'落子后入口被占：北门':'落子后通路被截断：北门，部分空位叉车无法到达',cells:[3],dockIds:['dock.north']};
  const words=capture(inbound(),view({placementRisk})).words;
  assert.ok(words.includes(kind==='entry-blocked'?'入口堵塞':'通路将被切断'));assert.doesNotMatch(words,/落子后|部分空位/);
  assert.ok(capture(inbound(),view({placementRisk,developerMode:true})).words.includes(placementRisk.message));
 }
});

test('feedback preserves exact shortages, causes, readiness and mixed cargo remainder',()=>{
 const s=createRun(7,'color_exit',5,'middle');s.board.fill(null);const order=s.orders[0];
 assert.equal(colorExitFeedback(s,order,view()).label,'还差4件');
 for(const cell of [3,4])s.board[cell]='cargo.food';s.candidates=[{id:'mixed',shapeId:'shape.square',cargo:'cargo.food',cellCargos:['cargo.food','cargo.food','cargo.chem','cargo.chem']}];
 const p=previewPlacement(s,'mixed',{x:3,y:1}),current=view({selectedPieceId:'mixed',preview:p});assert.ok(p.shipments.length);assert.equal(colorExitBoardHint(s,current),'预计出货：食品4件；留下化工2件');
 const ready=inbound();ready.board.fill(null);ready.orders=[{id:'ready',dockId:'dock.north',cargo:'cargo.food',amount:3,baseScore:100}];for(const cell of [8,9,10])ready.board[cell]='cargo.food';assert.equal(orderFeedback(ready,ready.orders[0],view()).label,'已就绪 · 等待放置');
});

test('shortened player pages have visible text within the canvas at three viewport sizes',()=>{
 for(const [width,height] of [[1080,1920],[390,844],[844,390]])for(const s of [outbound(),inbound(),createRun(7,'endless',7),createRun(7,'tutorial',3)])for(const current of [view(),view({screen:'menu'}),view({screen:'colorTiers'}),view({screen:'inboundMenu'}),view({screen:'colorIntro'}),view({screen:'helpDetails'}),view({paused:true}),view({needsResume:true}),view({needsResume:true,recoveryError:'存档无法读取，原文件已保留'}),view({confirmation:{kind:'leaveRun'}})]){
  for(const label of capture(s,current,width,height).labels)assert.ok(label.left>=-1&&label.right<=width+1&&label.top>=-1&&label.bottom<=height+1,`${width}×${height}: ${label.value} ${JSON.stringify(label)}`);
 }
});

test('recovery restart confirmation still states that current progress is lost',()=>{const out=capture(outbound(),view({recoveryError:'暂时无法读取存档',confirmation:{kind:'newRun',mode:'color_exit',difficultyId:'normal'}})).words;assert.match(out,/本局进度将丢失/);assert.doesNotMatch(out,/已有存档会保留/);assert.match(out,/历史成绩和设置会保留/);});
