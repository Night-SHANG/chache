import './helpers/static-art-fixture.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createCanvas} from '@napi-rs/canvas';
import {mkdirSync,writeFileSync} from 'node:fs';
import {createRun} from '../src/domain/engine.ts';
import {createPlayableRun,applyPlayableCommand,playableChecksum,type GameRun} from '../src/domain/playable.ts';
import {createRunV16} from '../src/domain/v16/engine.ts';
import {refreshOrdersV16} from '../src/domain/v16/generation.ts';
import {boardGeometry} from '../src/presentation/board-geometry.ts';
import {dockPosition} from '../src/presentation/motion.ts';
import {L,mapClientPoint,hitTestPoint} from '../src/presentation/layout.ts';
import {PALETTE} from '../src/presentation/assets.ts';
import {getUiControls} from '../src/presentation/ui.ts';
import {render} from '../src/presentation/renderer.ts';
import type {ViewState} from '../src/presentation/view-types.ts';

const view=(patch:Partial<ViewState>={}):ViewState=>({screen:'game',selectedPieceId:null,hoverOrigin:null,preview:null,dragPoint:null,paused:false,message:'',saveStatus:'',elapsed:0,animation:null,debug:false,needsResume:false,...patch});
const neutral=()=>createRun(1,'standard',3);
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
 return {canvas,ctx,labels,words:labels.map(label=>label.value).join(''),scale,ox,oy};
}

test('home has one help entry between both modes and shop/settings',()=>{
 const state=neutral(),current=view({screen:'menu'}),controls=getUiControls(state,current);
 capture(state,current,360,800,'home');
 assert.deepEqual(controls.map(control=>control.action.type),['chooseInbound','chooseColorTier','helpMenu','shop','settings']);
 assert.equal(controls.filter(control=>control.label==='玩法说明').length,1);
 assert.ok(controls[2].rect.y>=controls[1].rect.y+controls[1].rect.h);
 assert.ok(controls[3].rect.y>=controls[2].rect.y+controls[2].rect.h);
});

test('help chooser opens all three help topics and returns home',()=>{
 const current=view({screen:'helpMenu'}),controls=getUiControls(neutral(),current);
 assert.deepEqual(controls.map(control=>control.action),[{type:'selectHelp',topic:'inbound'},{type:'selectHelp',topic:'outbound'},{type:'selectHelp',topic:'tools'},{type:'helpBack'}]);
 const labels=capture(neutral(),current,360,800,'help-chooser').words;
 assert.match(labels,/玩法说明/);assert.match(labels,/入库/);assert.match(labels,/出库/);assert.match(labels,/道具说明/);
});

test('home help follows selected topic over the untouched neutral placeholder',()=>{
 const state=neutral(),before=playableChecksum(state);
 const inbound=view({screen:'colorIntro',helpFromHome:true,helpTopic:'inbound'}),outbound=view({screen:'colorIntro',helpFromHome:true,helpTopic:'outbound'});
 assert.deepEqual(getUiControls(state,inbound).map(control=>control.label),['特殊货物与加急','返回']);
 assert.deepEqual(getUiControls(state,outbound).map(control=>control.label),['返回']);
 const first=capture(state,inbound,360,800,'inbound-help'),second=capture(state,outbound,360,800,'outbound-help');
 assert.match(first.words,/五班共30单，完成后可继续无限。/);assert.match(second.words,/放置后.*出货后.*机械2件留下/);
 // Nine-by-nine cells in both before/after diagrams, regardless of the 7×7 background.
 const pitches:number[]=[];const ctx=createCanvas(1080,1920).getContext('2d'),rect=ctx.fillRect.bind(ctx);
 ctx.fillRect=(x,y,w,h)=>{if(Math.abs(y-106)<.01&&Math.abs(h-(224/9-2))<.01)pitches.push(x);rect(x,y,w,h);};
 render(ctx as unknown as CanvasRenderingContext2D,state,outbound);assert.equal(pitches.length,18);
 assert.equal(playableChecksum(state),before);
 assert.equal(getUiControls(createRunV16({seed:1,mode:'standard'}),view({screen:'colorIntro',paused:true})).find(c=>c.action.type==='helpBack')?.label,'返回游戏');
});

test('current inbound special help separates shared tools and retains complete rush details',()=>{
 for(const state of [neutral(),...(['standard','endless','daily'] as const).map(mode=>createRunV16({seed:1,mode}))]){
  const current=view({screen:'helpDetails',helpTopic:'inbound',helpFromHome:state.rulesetVersion===3,paused:state.rulesetVersion!==3}),before=playableChecksum(state);
  const result=capture(state,current,360,800,'special-daily-help');
  for(const word of ['特殊货物与加急','双倍箱','万能','加急模式','每完成2单','每成功放置6次',rushSentence,'第5班新补充的货件全部加急。','待放区','归零变为废弃箱','清扫1格旧废弃箱','没有废弃箱','整组货物旁1格废弃箱'])assert.ok(result.words.includes(word),`${state.mode}: ${word}`);
  assert.ok(result.words.includes('加急模式中'));assert.doesNotMatch(result.words,/旋转|清障|每种1件/);const tools=capture(state,{...current,screen:'toolsHelp'},360,800,'shared-tools-help');for(const word of ['道具说明','旋转','清障','万能','每种1件','未用的结束后退回'])assert.ok(tools.words.includes(word),word);assert.equal(playableChecksum(state),before);
 }
});

test('obsolete guide and practice views cannot expose tutorial controls or forced hints',()=>{
 const state=createRunV16({seed:1,mode:'standard',guided:true});
 const patches:Partial<ViewState>[]=[{screen:'settings'},{screen:'guideOffer'},{screen:'tutorialPracticeSelect'},{confirmation:{kind:'startPractice',practiceKind:'inbound'}},{practice:{kind:'daily',completed:true}},{practice:{kind:'inbound',completed:false},paused:true},{guide:{step:'place',text:'强制落格',allowedOrigins:[{x:1,y:1}],expectedCommand:{type:'place',pieceId:'piece.1',origin:{x:1,y:1}}}}];
 for(const patch of patches){const current=view(patch),controls=getUiControls(state,current),output=capture(state,current);assert.equal(controls.some(c=>['skipTutorial','guidedStart','directStart','toggleTutorials','openPracticeSelect','startPractice','exitPractice','pausePractice'].includes(c.action.type)),false);assert.doesNotMatch(output.words,/新手教程|重新体验教程|开始引导|跳过引导|跳过教学|练习完成|继续练习|结束练习|教学练习|强制教学|强制落格/);}
 const legacy=createRun(1,'tutorial',3);assert.equal(getUiControls(legacy,view()).some(c=>c.action.type==='skipTutorial'),false);assert.doesNotMatch(capture(legacy,view()).words,/食品 ×2|跳过教学/);
});

function gateRegion(state:GameRun,dockId:string,current=view()){
 const result=capture(state,current),dock=boardGeometry(state).docks.find(d=>d.id===dockId)!;
 const p=dockPosition(dock,state);return {pixels:result.ctx.getImageData(p.x-38,p.y-38,76,76).data,result};
}
function containsColor(pixels:Uint8ClampedArray,color:string){const rgb=color.replace('#','').match(/../g)!.map(c=>Number.parseInt(c,16));for(let i=0;i<pixels.length;i+=4)if(rgb.every((c,j)=>pixels[i+j]===c))return true;return false;}
test('all four reserved inbound doors are visible with two colored and two closed at opening',()=>{
 for(const version of [14,15,16] as const){
  const opened=createPlayableRun({family:'inbound',rulesetVersion:version,seed:1,mode:'standard',guided:false,toolCharges:{rotate:0,clear:0,wildcard:0}}),state=opened.phase==='cleanup'?applyPlayableCommand(opened,{type:'chooseCleanup',branch:'orders'}).state:opened,before=playableChecksum(state);
  const doors=boardGeometry(state).docks;assert.equal(state.orders.length,2);
  capture(state,view(),360,800,`ports-opening-v${version}`);
  for(const dock of doors){const order=state.orders.find(o=>o.dockId===dock.id),{pixels}=gateRegion(state,dock.id);if(order)assert.ok(containsColor(pixels,PALETTE[order.cargo].mid),dock.id);else {assert.ok(containsColor(pixels,'#4b535b'),`${dock.id} closed gray shutter`);assert.equal(Object.values(PALETTE).some(p=>containsColor(pixels,p.mid)),false,`${dock.id} must not use cargo colors`);}}
  assert.equal(playableChecksum(state),before);
 }
});

test('third and fourth door light only for actual orders and shipping colors, without mutation',()=>{
 const opening=createRunV16({seed:1,mode:'standard'}),snapshots=[opening,...([6,18] as const).map(completedOrders=>refreshOrdersV16({...opening,orders:[],completedOrders,shift:completedOrders===6?2:4}))];
 assert.deepEqual(snapshots.map(state=>state.orders.length),[2,3,4]);
 for(const state of snapshots){const before=playableChecksum(state);for(const dock of boardGeometry(state).docks){const order=state.orders.find(o=>o.dockId===dock.id),{pixels}=gateRegion(state,dock.id);assert.equal(containsColor(pixels,'#4b535b'),!order,`${state.orders.length}: ${dock.id}`);}assert.equal(playableChecksum(state),before);capture(state,view(),360,800,`ports-${state.orders.length}-active`);}
 const advanced={...opening,shift:5 as const};assert.deepEqual(gateRegion(advanced,'dock.south').pixels,gateRegion(opening,'dock.south').pixels,'stage alone does not activate a door');
 const shipping={type:'shipment' as const,boardSize:7 as const,dockId:'dock.south',gateId:'dock.south',orderId:'removed',cargo:'cargo.food' as const,cells:[0],path:[{x:3,y:6}],score:100,chain:1,units:1,extraClearedCells:[]};
 const during=view({animation:{shipment:shipping,progress:.3,board:opening.board}}),before=playableChecksum(opening);
 assert.ok(containsColor(gateRegion(opening,'dock.south',during).pixels,PALETTE['cargo.food'].mid));assert.equal(playableChecksum(opening),before);
});

test('new static help controls meet 44 CSS pixels and all help text fits three viewports',()=>{
 const state=neutral(),screens:ViewState[]=[view({screen:'menu'}),view({screen:'helpMenu'}),view({screen:'colorIntro',helpTopic:'inbound',helpFromHome:true}),view({screen:'colorIntro',helpTopic:'outbound',helpFromHome:true}),view({screen:'helpDetails',helpTopic:'inbound',helpFromHome:true})];
 for(const [width,height] of sizes)for(const current of screens){
  const output=capture(state,current,width,height,`${current.screen}-${current.helpTopic??'home'}`);
  for(const label of output.labels)assert.ok(label.left>=-1&&label.right<=width+1&&label.top>=-1&&label.bottom<=height+1,`${width}×${height}: ${JSON.stringify(label)}`);
  for(const control of getUiControls(state,current)){assert.ok(control.rect.h*output.scale>=44,`${width}×${height}: ${control.label}`);const center={x:output.ox+(control.rect.x+control.rect.w/2)*output.scale,y:output.oy+(control.rect.y+control.rect.h/2)*output.scale},point=mapClientPoint(center,{x:0,y:0,w:width,h:height});assert.ok(point&&hitTestPoint(point,control.rect));}
 }
 for(const [width,height] of sizes)capture(createRunV16({seed:1,mode:'standard'}),view(),width,height,'ports-opening');
});
