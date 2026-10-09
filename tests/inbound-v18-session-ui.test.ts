import test from 'node:test';
import assert from 'node:assert/strict';
import {createCanvas} from '@napi-rs/canvas';
import {mkdirSync,writeFileSync} from 'node:fs';
import {GameSession} from '../src/application/session.ts';
import {accountDailyAvailability} from '../src/application/account-service.ts';
import {createRunV16} from '../src/domain/v16/engine.ts';
import {createRunV18,applyCommandV18,findLegalMovesV18} from '../src/domain/v18/engine.ts';
import {scaledScoreV18} from '../src/domain/v18/content.ts';
import {CARGO} from '../src/domain/rulesets/v1/content.ts';
import {PALETTE} from '../src/presentation/assets.ts';
import {boardGeometry} from '../src/presentation/board-geometry.ts';
import {dockPosition} from '../src/presentation/motion.ts';
import {getUiControls} from '../src/presentation/ui.ts';
import {render} from '../src/presentation/renderer.ts';
import {L,mapClientPoint,hitTestPoint} from '../src/presentation/layout.ts';
import {findPlayableMoves,type GameRun} from '../src/domain/playable.ts';
import type {UiAction} from '../src/presentation/ui-types.ts';
import type {ViewState} from '../src/presentation/view-types.ts';
import {makeAccountRun} from './helpers/account-fixtures.ts';
import {sessionHost} from './helpers/session-fixtures.ts';

const sizes=[[360,800],[540,960],[1200,900]] as const;
const rushSentence='加急数字按后续成功放置次数倒数，不是倒计时';
type Label={value:string;left:number;right:number;top:number;bottom:number};
function capture(state:GameRun,current:ViewState,width=1080,height=1920,name?:string){
 const canvas=createCanvas(width,height),ctx=canvas.getContext('2d'),labels:Label[]=[],fill=ctx.fillText.bind(ctx);
 const scale=Math.min(width/L.width,height/L.height),ox=(width-L.width*scale)/2,oy=(height-L.height*scale)/2;
 ctx.translate(ox,oy);ctx.scale(scale,scale);
 ctx.fillText=(value,x,y)=>{const m=ctx.measureText(value),t=ctx.getTransform();labels.push({value,left:t.a*(x-m.actualBoundingBoxLeft)+t.e,right:t.a*(x+m.actualBoundingBoxRight)+t.e,top:t.d*(y-m.actualBoundingBoxAscent)+t.f,bottom:t.d*(y+m.actualBoundingBoxDescent)+t.f});fill(value,x,y);};
 render(ctx as unknown as CanvasRenderingContext2D,state,current);
 const directory=process.env.WAREHOUSE_UI_CAPTURE_DIR;
 if(directory&&name){mkdirSync(directory,{recursive:true});writeFileSync(`${directory}/${name}-${width}x${height}.png`,canvas.toBuffer('image/png'));}
 return {canvas,ctx,labels,words:labels.map(label=>label.value).join('\n'),scale,ox,oy};
}
function start(session:GameSession,mode:'standard'|'endless'|'daily',tier?:'hard'|'expert'){
 session.action({type:'newRun',mode,...(tier?{inboundDifficulty:tier}:{})});
 if(session.view.confirmation)session.action({type:'confirm'});
 if(session.view.screen==='prepareTools')session.action({type:'prepareNext'});
 assert.equal(session.view.screen,'game');assert.equal(session.view.needsResume,false);
}

test('current inbound menu has exactly two top tiers and one start in each of its three cards',()=>{
 const h=sessionHost();h.session.action({type:'chooseInbound'});
 assert.equal(h.session.view.inboundDifficulty,'hard');
 const controls=getUiControls(h.session.state,h.session.view),tiers=controls.filter(c=>c.action.type==='selectInboundDifficulty'),starts=controls.filter(c=>c.action.type==='newRun');
 assert.deepEqual(tiers.map(c=>c.label),['困难','专业']);assert.deepEqual(tiers.map(c=>c.selected),[true,false]);
 assert.deepEqual(starts.map(c=>c.action),[{type:'newRun',mode:'standard',inboundDifficulty:'hard'},{type:'newRun',mode:'endless',inboundDifficulty:'hard'},{type:'newRun',mode:'rush'}]);
 assert.ok(Math.max(...tiers.map(c=>c.rect.y+c.rect.h))<Math.min(...starts.map(c=>c.rect.y)));
 const words=capture(h.session.state,h.session.view).words;assert.match(words,/困难 · 五班/);assert.match(words,/困难 · 无限/);assert.match(words,/加急模式/);assert.doesNotMatch(words,/困难加急|专业加急/);assert.doesNotMatch(words,/普通五班|倍率|×1\.5|×2|挑战开关/);
});

test('tier selection changes only the view and rejects stale normal and malformed selections',()=>{
 const h=sessionHost();h.session.action({type:'chooseInbound'});const account=h.session.view.account,state=h.session.state,before=[...h.data],rng=structuredClone(state.rngState);h.storage.resetFault();
 h.session.action({type:'selectInboundDifficulty',inboundDifficulty:'expert'});
 for(const value of ['normal',null,['hard'],'bogus'])h.session.action({type:'selectInboundDifficulty',inboundDifficulty:value} as UiAction);
 assert.equal(h.session.view.inboundDifficulty,'expert');assert.equal(h.session.view.account,account);assert.equal(h.session.state,state);assert.deepEqual(h.session.state.rngState,rng);assert.deepEqual([...h.data],before);assert.equal(h.storage.operations.filter(o=>o.kind==='set'||o.kind==='remove').length,0);
 const controls=getUiControls(state,h.session.view);assert.deepEqual(controls.filter(c=>c.action.type==='selectInboundDifficulty').map(c=>c.selected),[false,true]);
 assert.ok(controls.filter(c=>c.action.type==='newRun'&&c.action.mode!=='rush').every(c=>c.action.type==='newRun'&&c.action.inboundDifficulty==='expert'));
 const rush=controls.find(c=>c.action.type==='newRun'&&c.action.mode==='rush')?.action;assert.ok(rush?.type==='newRun');assert.equal(rush.inboundDifficulty,undefined);
});

for(const mode of ['standard','endless'] as const)for(const tier of ['hard','expert'] as const)test(`new ${tier} ${mode} starts direct rules18 and restores its bound tier`,()=>{
 const h=sessionHost();h.session.action({type:'chooseInbound'});h.session.action({type:'selectInboundDifficulty',inboundDifficulty:tier});start(h.session,mode);
 assert.equal(h.session.state.rulesetVersion,18);assert.equal(h.session.state.mode,mode);assert.equal('inboundDifficulty' in h.session.state&&h.session.state.inboundDifficulty,tier);assert.equal(h.session.state.shift,1);assert.equal(h.session.state.phase,'input');assert.equal(h.session.state.commandIndex,0);assert.equal('guided' in h.session.state&&h.session.state.guided,false);assert.equal(h.session.view.guide,null);
 const saved=structuredClone(h.session.state),restored=new GameSession(h.platform,{seed:99,mode:'standard'});assert.deepEqual(restored.state,saved);assert.equal(restored.view.needsResume,true);restored.resume();assert.deepEqual(restored.state,saved);
 restored.restart();assert.equal(restored.view.confirmation?.inboundDifficulty,tier);restored.action({type:'cancel'});assert.deepEqual(restored.state,saved);restored.restart();restored.action({type:'confirm'});restored.action({type:'prepareNext'});assert.equal(restored.state.rulesetVersion,18);assert.equal('inboundDifficulty' in restored.state&&restored.state.inboundDifficulty,tier);assert.equal(restored.state.mode,mode);
});

test('an explicit stale normal new-start action cannot close a run or create ordinary18',()=>{
 for(const active of [false,true]){
  const h=sessionHost();if(active)start(h.session,'standard','expert');const state=h.session.state,before=[...h.data];h.storage.resetFault();
  for(const mode of ['standard','endless'] as const)h.session.action({type:'newRun',mode,inboundDifficulty:'normal'});
  assert.equal(h.session.state,state);assert.equal(h.session.view.confirmation,null);assert.equal(h.session.view.prepareIntent??null,null);assert.deepEqual([...h.data],before);assert.equal(h.storage.operations.filter(o=>o.kind==='set'||o.kind==='remove').length,0);
  h.session.action({type:'newRun',mode:'daily',inboundDifficulty:'normal'});
  if(active){assert.equal((h.session.view as ViewState).confirmation?.mode,'rush');h.session.action({type:'cancel'});}
  else {assert.equal(h.session.view.prepareIntent?.spec.rulesetVersion,21);assert.equal(h.session.view.prepareIntent?.spec.family==='inbound'&&h.session.view.prepareIntent.spec.inboundDifficulty,undefined);h.session.action({type:'back'});}
  assert.equal(h.session.state,state);assert.deepEqual([...h.data],before);assert.equal(h.storage.operations.filter(o=>o.kind==='set'||o.kind==='remove').length,0);
 }
});

test('stale daily action selected under expert starts undated fixed rush21 with cleanup',()=>{
 const h=sessionHost();h.session.action({type:'chooseInbound'});h.session.action({type:'selectInboundDifficulty',inboundDifficulty:'expert'});start(h.session,'daily');
 assert.equal(h.session.state.rulesetVersion,21);assert.equal(h.session.state.mode,'rush');assert.equal('inboundDifficulty' in h.session.state&&h.session.state.inboundDifficulty,'normal');assert.equal(h.session.view.account!.run!.identity.challengeDay,undefined);assert.equal(h.session.state.phase,'cleanup');assert.deepEqual(h.session.state.candidates,[]);assert.deepEqual(h.session.view.account!.run!.reserved,[]);
 const seed=h.session.state.seed;h.session.action({type:'chooseCleanup',branch:'placements'});assert.equal(h.session.state.phase,'input');assert.equal(h.session.state.commandIndex,1);assert.equal(h.session.view.guide,null);
 assert.equal(getUiControls(h.session.state,h.session.view).some(c=>c.action.type==='continueOvertime'),false);start(h.session,'daily');assert.notEqual(h.session.state.seed,seed);assert.equal(h.session.view.account!.run!.identity.inboundDifficulty,'normal');assert.equal(h.session.state.phase,'cleanup');
});

test('menu records isolate tiered rules18 and fixed20 from archived rules19 across tool buckets',()=>{
 const h=sessionHost();h.session.action({type:'chooseInbound'});const account=structuredClone(h.session.view.account!);
 const entries=[['standard',18,'hard','plain',110],['standard',18,'hard','tools',220],['standard',18,'expert','plain',330],['standard',18,'expert','tools',440],['endless',18,'hard','plain',550],['endless',18,'hard','tools',660],['endless',18,'expert','plain',770],['endless',18,'expert','tools',880],['rush',19,'hard','plain',990],['rush',19,'hard','tools',1010],['rush',19,'expert','plain',1110],['rush',19,'expert','tools',1220],['rush',20,'fixed','plain',1330],['rush',20,'fixed','tools',1440],['daily',18,'hard','plain',9999],['standard',16,'hard','plain',9999]] as const;
 for(const [mode,version,tier,tools,score] of entries)account.profile.results[`inbound.${mode}.v${version}.${tier}.${tools}`]={runs:1,units:1,maxUnits:1,score,wins:0,retirements:0,maxChain:1,best:{score,units:1,chain:1}};
 for(const [tier,scores,absent] of [['hard',[110,220,550,660,1330,1440],[330,440,770,880,990,1010,1110,1220]],['expert',[330,440,770,880,1330,1440],[110,220,550,660,990,1010,1110,1220]]] as const){
  const out=capture(h.session.state,{...h.session.view,account,inboundDifficulty:tier}),shown=out.labels.filter(label=>/^无道具最高分 |^使用道具最高分 /.test(label.value)).map(label=>Number(label.value.replace(/^(?:使用道具|无道具)最高分 |,/g,'')));
  assert.deepEqual(shown,scores);for(const score of absent)assert.equal(shown.includes(score),false);assert.doesNotMatch(out.words,/9,999|每日/);assert.match(out.words,/加急模式/);assert.doesNotMatch(out.words,/困难加急|专业加急/);
 }
});

test('old16 normal resumes unchanged and restart creates default hard18 after confirmation',()=>{
 const state=createRunV16({seed:17,mode:'standard',inboundDifficulty:'normal'});state.runSerial=1;const run=makeAccountRun({state,identity:{runId:'old.normal',serial:1,rulesetVersion:16,inboundDifficulty:'normal',runConfigId:state.runConfigId,mode:'standard',economyVersion:2},history:{seed:state.seed,runConfigId:state.runConfigId,head:null,totalCommands:0,tail:[]}}),h=sessionHost({formatVersion:2,economyVersion:2,dailyRewards:{},nextRunSerial:2,run});
 assert.equal(h.session.view.inboundDifficulty,'hard');assert.deepEqual(h.session.state,state);h.session.resume();assert.deepEqual(h.session.state,state);assert.match(capture(h.session.state,h.session.view).words,/普通五班/);
 h.session.restart();assert.equal(h.session.view.confirmation?.inboundDifficulty,'hard');assert.deepEqual(h.session.state,state);h.session.action({type:'confirm'});h.session.action({type:'prepareNext'});assert.equal(h.session.state.rulesetVersion,18);assert.equal(h.session.view.account!.run!.identity.inboundDifficulty,'hard');
});

test('current home help teaches four adjacent boxes and keeps exact reviewed rush copy',()=>{
 const h=sessionHost();h.session.action({type:'helpMenu'});h.session.action({type:'selectHelp',topic:'inbound'});const out=capture(h.session.state,h.session.view);assert.match(out.words,/食品 4\/4件/);assert.doesNotMatch(out.words,/食品 3\/3件/);
 h.session.action({type:'helpDetails'});const details=capture(h.session.state,h.session.view).words;for(const sentence of [rushSentence,'第5班新补充的货件全部加急。','危险品：按货类凑单，可正常出货。','加急模式中'])assert.ok(details.includes(sentence),sentence);
});

test('two-tier controls and all current menu/help captions fit three viewports',()=>{
 const h=sessionHost();h.session.action({type:'chooseInbound'});
 for(const [width,height] of sizes)for(const tier of ['hard','expert'] as const){const current={...h.session.view,inboundDifficulty:tier},out=capture(h.session.state,current,width,height,`inbound-menu-${tier}`),controls=getUiControls(h.session.state,current);
  for(const label of out.labels)assert.ok(label.left>=-1&&label.right<=width+1&&label.top>=-1&&label.bottom<=height+1,`${width}×${height}: ${JSON.stringify(label)}`);
  for(const [index,c] of controls.entries()){assert.ok(c.rect.h*out.scale>=44,c.label);assert.ok(c.rect.w*out.scale>=44,c.label);for(const other of controls.slice(index+1))assert.equal(c.rect.x<other.rect.x+other.rect.w&&c.rect.x+c.rect.w>other.rect.x&&c.rect.y<other.rect.y+other.rect.h&&c.rect.y+c.rect.h>other.rect.y,false,`${c.label}/${other.label}`);const point=mapClientPoint({x:out.ox+(c.rect.x+c.rect.w/2)*out.scale,y:out.oy+(c.rect.y+c.rect.h/2)*out.scale},{x:0,y:0,w:width,h:height});assert.ok(point&&hitTestPoint(point,c.rect));}
  const top=getUiControls(h.session.state,current).filter(c=>c.action.type==='selectInboundDifficulty');for(const c of top){const t=out.ctx.getImageData(Math.floor(out.ox+(c.rect.x+40)*out.scale),Math.floor(out.oy+(c.rect.y+30)*out.scale),1,1).data;assert.equal(t[0]>150,c.selected,c.label);}
 }
 for(const [width,height] of sizes){const current={...h.session.view,screen:'colorIntro' as const,helpTopic:'inbound' as const,helpFromHome:true};const out=capture(h.session.state,current,width,height,'inbound-help-four');assert.match(out.words,/食品 4\/4件/);for(const label of out.labels)assert.ok(label.left>=-1&&label.right<=width+1&&label.top>=-1&&label.bottom<=height+1,JSON.stringify(label));}
});

for(const tier of ['hard','expert'] as const)test(`${tier} final shipment keeps same run available for overtime and displays the final score once`,()=>{
 // Constructed near-win fixture: only the last shipment is played through the actual Session service.
 const state=createRunV18({seed:17,mode:'standard',inboundDifficulty:tier});state.completedOrders=29;state.shift=5;state.runSerial=1;state.rawScore=101;state.score=scaledScoreV18(state.rawScore,tier);
 state.candidates[0]={id:'last.food',shapeId:'shape.single',cargo:'cargo.food',quarterTurns:0};state.orders=['dock.north','dock.east','dock.south','dock.west'].map((dockId,index)=>({id:`last.order.${index}`,dockId,cargo:CARGO[index].id,amount:index===0?4:6,baseScore:200}));for(const cell of [8,9,10])state.board[cell]='cargo.food';
 const run=makeAccountRun({state,identity:{runId:`test.last.${tier}`,serial:1,rulesetVersion:18,inboundDifficulty:tier,runConfigId:state.runConfigId,mode:'standard',economyVersion:2},history:{seed:state.seed,runConfigId:state.runConfigId,head:null,totalCommands:0,tail:[]}}),h=sessionHost({formatVersion:2,economyVersion:2,dailyRewards:{},nextRunSerial:2,run});
 h.session.resume();h.session.dispatch({type:'place',pieceId:'last.food',origin:{x:4,y:1}});assert.equal(h.session.state.result,'won');assert.equal(h.session.state.completedOrders,30);assert.equal(h.session.view.account?.run?.identity.runId,run.identity.runId);
 h.time(10000);h.session.tick(10000);h.time(20000);h.session.tick(20000);
 const won=h.session.state,raw='rawScore' in won?won.rawScore:NaN,score=won.score,out=capture(won,h.session.view);assert.equal(score,scaledScoreV18(raw,tier));assert.ok(out.labels.some(l=>l.value===String(score).replace(/\B(?=(\d{3})+(?!\d))/g,',')));assert.doesNotMatch(out.words,/倍率|×1\.5|得分.*×2/);assert.ok(getUiControls(won,h.session.view).some(c=>c.action.type==='continueOvertime'));
 h.session.view.inboundDifficulty=tier==='hard'?'expert':'hard';h.session.action({type:'continueOvertime'});assert.equal(h.session.state.phase,'input');assert.equal(h.session.state.overtime,true);assert.equal(h.session.view.account?.run?.identity.runId,run.identity.runId);assert.equal(h.session.view.account?.run?.identity.inboundDifficulty,tier);assert.equal('rawScore' in h.session.state&&h.session.state.rawScore,raw);assert.equal(h.session.state.score,score);assert.equal(h.session.state.mode,'standard');
 const restored=new GameSession(h.platform,{seed:1,mode:'standard'});assert.deepEqual(restored.state,h.session.state);assert.equal(restored.view.account?.run?.identity.inboundDifficulty,tier);
});

test('both tiers reserve at most two tools, cancel without inventory writes, and return unused tools on restart',()=>{
 for(const tier of ['hard','expert'] as const)for(const mode of ['standard','endless'] as const){
  const h=sessionHost({wallet:777,inventory:{rotate:1,clear:1,wildcard:1}});h.session.action({type:'chooseInbound'});h.session.action({type:'selectInboundDifficulty',inboundDifficulty:tier});const before=[...h.data];h.storage.resetFault();h.session.action({type:'newRun',mode});
  for(const item of ['rotate','clear','wildcard'] as const)h.session.action({type:'toggleItem',item});assert.deepEqual(h.session.view.prepareIntent!.items,['rotate','clear']);assert.deepEqual([...h.data],before);h.session.action({type:'back'});assert.equal(h.session.view.screen,'inboundMenu');assert.deepEqual([...h.data],before);
  h.session.action({type:'newRun',mode});h.session.action({type:'toggleItem',item:'rotate'});h.session.action({type:'toggleItem',item:'clear'});h.session.action({type:'prepareNext'});assert.deepEqual(h.session.view.account?.run?.reserved,['rotate','clear']);assert.deepEqual(h.session.view.account?.inventory,{rotate:0,clear:0,wildcard:1});assert.equal(h.session.view.account?.wallet,777);
  const saved=structuredClone(h.session.state),restored=new GameSession(h.platform,{seed:1,mode:'standard'});assert.deepEqual(restored.state,saved);restored.resume();restored.restart();restored.action({type:'cancel'});assert.deepEqual(restored.state,saved);assert.deepEqual(restored.view.account?.run?.reserved,['rotate','clear']);
  restored.restart();restored.action({type:'confirm'});assert.equal(restored.view.screen,'prepareTools');assert.deepEqual(restored.view.account?.inventory,{rotate:1,clear:1,wildcard:1});assert.equal(restored.view.account?.wallet,777);restored.action({type:'prepareNext'});assert.equal(restored.view.account?.run?.identity.inboundDifficulty,tier);
 }
});

test('new rush cards remain available across Shanghai midnight while preserving the prior daily winner',()=>{
 const time={value:Date.parse('2026-10-06T15:59:59Z')},h=sessionHost({formatVersion:2,economyVersion:2,dailyRewards:{'2026-10-06':{completedRunId:'old16.daily.winner',bonusPaid:20}}});h.platform.wallTime=()=>time.value;h.session.show();h.session.action({type:'chooseInbound'});h.session.action({type:'selectInboundDifficulty',inboundDifficulty:'expert'});
 assert.equal(h.session.view.dailyLabel,'2026-10-06');assert.equal(h.session.view.dailyLocked,true);const rush=getUiControls(h.session.state,h.session.view).find(c=>c.action.type==='newRun'&&c.action.mode==='rush');assert.ok(rush);assert.notEqual(rush.disabled,true);assert.equal(rush.label,'开始');const before=[...h.data],rewards=structuredClone(h.session.view.account!.dailyRewards);h.session.action(rush.action);assert.deepEqual([...h.data],before);assert.equal(h.session.view.screen,'prepareTools');h.session.action({type:'back'});
 time.value=Date.parse('2026-10-06T16:00:01Z');h.session.show();assert.equal(h.session.view.dailyLocked,false);assert.equal(h.session.view.dailyLabel,'2026-10-07');start(h.session,'daily');assert.equal(h.session.view.account?.run?.identity.rulesetVersion,21);assert.equal(h.session.view.account?.run?.identity.inboundDifficulty,'normal');assert.equal(h.session.view.account?.run?.identity.challengeDay,undefined);assert.deepEqual(h.session.view.account?.dailyRewards,rewards);
});

test('old16 daily resume and closed-result labels retain their actual start date across midnight',()=>{
 const opening=Date.parse('2026-10-06T15:59:59Z'),day=accountDailyAvailability(null,opening,16),state=createRunV16({seed:day.seed,mode:'daily'});state.runSerial=1;const run=makeAccountRun({state,identity:{runId:'old.daily',serial:1,rulesetVersion:16,inboundDifficulty:'normal',runConfigId:state.runConfigId,mode:'daily',economyVersion:2,challengeDay:day.day},history:{seed:state.seed,runConfigId:state.runConfigId,head:null,totalCommands:0,tail:[]}}),h=sessionHost({formatVersion:2,economyVersion:2,dailyRewards:{},nextRunSerial:2,run});h.platform.wallTime=()=>Date.parse('2026-10-06T16:00:01Z');h.session.show();assert.equal(h.session.view.dailyLabel,'2026-10-07');h.session.resume();assert.deepEqual(h.session.state,state);assert.equal(h.session.view.account?.run?.identity.challengeDay,'2026-10-06');
 h.session.action({type:'chooseCleanup',branch:'orders'});h.session.dispatch({type:'finish'});assert.equal(h.session.view.account?.run,null);assert.equal(h.session.view.account?.lastClosedResult?.identity.rulesetVersion,16);assert.match(capture(h.session.state,h.session.view).words,/每日挑战 · 2026-10-06/);assert.doesNotMatch(capture(h.session.state,h.session.view).words,/每日挑战 · 2026-10-07/);
});

test('new rush help keeps successful-placement wording, hazard explanation, and four visible ports',()=>{
 const h=sessionHost();start(h.session,'daily');const cleanup=capture(h.session.state,h.session.view).words;assert.match(cleanup,/每成功放置6次/);h.session.action({type:'chooseCleanup',branch:'orders'});h.session.action({type:'help'});h.session.action({type:'helpDetails'});const help=capture(h.session.state,h.session.view).words;for(const sentence of [rushSentence,'第5班新补充的货件全部加急。','危险品：按货类凑单，可正常出货。'])assert.ok(help.includes(sentence));h.session.action({type:'helpBack'});
 const opened=createRunV18({seed:1,mode:'standard'}),state=applyCommandV18(opened,{type:'place',...findLegalMovesV18(opened)[0]}).state;const out=capture(state,{...h.session.view,paused:false,screen:'game',account:null});const gray=[0x4b,0x53,0x5b];
 for(const dock of boardGeometry(state).docks){const p=dockPosition(dock,state),pixels=out.ctx.getImageData(p.x-38,p.y-38,76,76).data,order=state.orders.find(o=>o.dockId===dock.id),rgb=order?PALETTE[order.cargo].mid.replace('#','').match(/../g)!.map(c=>Number.parseInt(c,16)):gray;let found=false;for(let i=0;i<pixels.length;i+=4)if(rgb.every((c,j)=>pixels[i+j]===c))found=true;assert.equal(found,true,dock.id);}
});

test('rush21 cleanup wait does not accrue elapsed time or leak into the first placement',()=>{
 const h=sessionHost();start(h.session,'daily');h.time(50000);h.session.tick(50000);assert.equal(h.session.view.elapsed,0);h.time(90000);h.session.action({type:'chooseCleanup',branch:'orders'});assert.equal(h.session.view.elapsed,0);
 const first=findPlayableMoves(h.session.state)[0];h.session.dispatch({type:'place',...first});assert.equal(h.session.state.elapsedMs,0);h.time(91000);h.session.tick(91000);assert.equal(h.session.view.elapsed,1000);
});

test('large current records fit beside all three start buttons without truncating their scores',()=>{
 const h=sessionHost();h.session.action({type:'chooseInbound'});const account=structuredClone(h.session.view.account!),score=Number.MAX_SAFE_INTEGER,bucket={runs:1,units:1,maxUnits:1,score,wins:0,retirements:0,maxChain:1,best:{score,units:1,chain:1}};
 for(const mode of ['standard','endless','rush'])for(const tools of ['plain','tools'])account.profile.results[mode==='rush'?`inbound.rush.v20.fixed.${tools}`:`inbound.${mode}.v18.hard.${tools}`]=bucket;
 const current={...h.session.view,account},out=capture(h.session.state,current),starts=getUiControls(h.session.state,current).filter(c=>c.action.type==='newRun');
 const records=out.labels.filter(l=>/^无道具最高分 |^使用道具最高分 /.test(l.value));assert.equal(records.length,6);
 for(const label of records){const start=starts.find(c=>label.top<c.rect.y+c.rect.h&&label.bottom>c.rect.y);assert.ok(!start||label.right<=start.rect.x-16,JSON.stringify(label));assert.ok(label.value.includes('9,007,199,254,740,991'));}
});
