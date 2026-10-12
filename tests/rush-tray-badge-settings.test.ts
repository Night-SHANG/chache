import './helpers/static-art-fixture.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {createCanvas,GlobalFonts} from '@napi-rs/canvas';
import type {Canvas} from '@napi-rs/canvas';
import {render} from '../src/presentation/renderer.ts';
import {getUiControls} from '../src/presentation/ui.ts';
import {getTrayRects,hitTestPoint,L} from '../src/presentation/layout.ts';
import {presentationPieceCells} from '../src/presentation/inbound-helpers.ts';
import {toolPreview} from '../src/presentation/tool-preview.ts';
import {InputController} from '../src/presentation/input.ts';
import type {UiAction} from '../src/presentation/ui-types.ts';
import {createProfile} from '../src/application/profile.ts';
import type {CargoStyleId} from '../src/application/profile.ts';
import {CARGO,SHAPES} from '../src/domain/content.ts';
import {createRunV14} from '../src/domain/v14/engine.ts';
import {createRunV15} from '../src/domain/v15/engine.ts';
import {createRunV16} from '../src/domain/v16/engine.ts';
import {createRunV18} from '../src/domain/v18/engine.ts';
import {createRunV19} from '../src/domain/v19/engine.ts';
import {createRunV20,applyCommandV20} from '../src/domain/v20/engine.ts';
import {fromV20} from '../src/domain/v21/engine.ts';
import {makeAccountFixture} from './helpers/account-fixtures.ts';
import type {GameRun,ToolRun} from '../src/domain/playable.ts';
import type {PieceV16} from '../src/domain/v16/types.ts';
import type {ViewState} from '../src/presentation/view-types.ts';

GlobalFonts.registerFromPath('/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc','Noto Sans CJK SC');
GlobalFonts.registerFromPath('/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc','Noto Sans CJK SC');
const view=(patch:Partial<ViewState>={}):ViewState=>({screen:'game',selectedPieceId:null,hoverOrigin:null,preview:null,dragPoint:null,paused:false,message:'',saveStatus:'',elapsed:0,animation:null,debug:false,needsResume:false,profile:createProfile(),...patch});
const rushPiece=(patch:Partial<PieceV16>={}):PieceV16=>({id:'rush.fixture',shapeId:'shape.l3_ne',cargo:'cargo.machine',trait:'rush',rushTurns:3,quarterTurns:0,...patch});
function fixture(){
 const state=applyCommandV20(createRunV20({seed:17,mode:'rush',toolCharges:{rotate:1,clear:0,wildcard:0}}),{type:'chooseCleanup',branch:'orders'}).state;
 state.candidates=[rushPiece(),{id:'plain.1',shapeId:'shape.domino_v',cargo:'cargo.food',quarterTurns:0},{id:'plain.2',shapeId:'shape.domino_h',cargo:'cargo.cold',quarterTurns:0}];
 state.board[8]='cargo.machine';state.cellTraits[8]={kind:'rush',remaining:3,bornAtPlacement:state.successfulPlacements};return state;
}
type Viewport={w:number;h:number;safe:number;dpr:number};
const viewports:Viewport[]=[{w:360,h:800,safe:24,dpr:2},{w:540,h:960,safe:0,dpr:1},{w:1200,h:900,safe:0,dpr:1}];
type Label={value:string;x:number;y:number;left:number;right:number;top:number;bottom:number;font:string;matrix:{a:number;d:number;e:number;f:number};painted:number};
const surfaces=new Map<string,Canvas>();
function capture(state:GameRun,current:ViewState,name='',viewport:Viewport={w:1080,h:1920,safe:0,dpr:1},root?:{scale:number;x:number;y:number}){
 const {w,h,safe,dpr}=viewport,key=`${w}x${h}@${dpr}`,canvas=surfaces.get(key)??createCanvas(w*dpr,h*dpr);surfaces.set(key,canvas);
 const ctx=canvas.getContext('2d'),labels:Label[]=[],fill=ctx.fillText.bind(ctx);ctx.reset();
 const scale=Math.min(w/L.width,(h-safe)/L.height),ox=(w-L.width*scale)/2,oy=safe+(h-safe-L.height*scale)/2;
 if(root){ctx.translate(root.x,root.y);ctx.scale(root.scale,root.scale);}else{ctx.translate(ox*dpr,oy*dpr);ctx.scale(scale*dpr,scale*dpr);}
 ctx.fillText=(value,x,y)=>{
  const m=ctx.measureText(value),t=ctx.getTransform(),left=t.a*(x-m.actualBoundingBoxLeft)+t.e,right=t.a*(x+m.actualBoundingBoxRight)+t.e,top=t.d*(y-m.actualBoundingBoxAscent)+t.f,bottom=t.d*(y+m.actualBoundingBoxDescent)+t.f;
  const isBadge=/^[0-3]$/.test(value)&&x===56&&y===25&&ctx.font.includes('34px'),px=Math.max(0,Math.floor(left)),py=Math.max(0,Math.floor(top)),pw=Math.max(1,Math.ceil(right)-px),ph=Math.max(1,Math.ceil(bottom)-py);
  const before=isBadge&&px<canvas.width&&py<canvas.height&&right>0&&bottom>0?ctx.getImageData(px,py,Math.min(pw,canvas.width-px),Math.min(ph,canvas.height-py)).data:null;fill(value,x,y);let painted=0;
  if(before){const after=ctx.getImageData(px,py,Math.min(pw,canvas.width-px),Math.min(ph,canvas.height-py)).data;for(let n=0;n<after.length;n+=4)if(after[n]!==before[n]||after[n+1]!==before[n+1]||after[n+2]!==before[n+2])painted++;}
  labels.push({value,x:t.a*x+t.e,y:t.d*y+t.f,left,right,top,bottom,font:ctx.font,matrix:{a:t.a,d:t.d,e:t.e,f:t.f},painted});
 };
 render(ctx as unknown as CanvasRenderingContext2D,state,current);
 ctx.fillText=fill;
 const dir=process.env.WAREHOUSE_V016_UI_CAPTURE_DIR;
 if(dir&&name){mkdirSync(dir,{recursive:true});const stem=`${dir}/${name}-${w}x${h}${safe?`-safe${safe}-dpr${dpr}`:''}`;writeFileSync(`${stem}.png`,canvas.toBuffer('image/png'));writeFileSync(`${stem}.json`,JSON.stringify({viewport,labels},null,2));}
 return {canvas,ctx,labels,scale,ox,oy,dpr,words:labels.map(l=>l.value).join('\n')};
}
function trayBadges(out:ReturnType<typeof capture>,value='3'){
 return out.labels.filter(l=>l.value===value&&l.font.includes('34px')&&l.painted>0&&l.y>(out.oy+1500*out.scale)*out.dpr);
}

test('every pending rush crate paints the actual board-style numeric badge before placement',()=>{
 const state=fromV20(fixture()),saved=structuredClone(state),out=capture(state,view(),'pending-rush-before-placement');
 assert.equal(trayBadges(out).length,3,'all three pending rush cells must paint a large numeric 3');
 assert.match(out.words,/加急 · 机械 · 3次/);assert.deepEqual(state,saved,'rendering cannot change state or RNG');
 const tray=trayBadges(out)[0],board=out.labels.find(l=>l.value==='3'&&l.font.includes('34px')&&l.y<1400)!;
 const x=Math.ceil(tray.matrix.e+34*tray.matrix.a),y=Math.ceil(tray.matrix.f+7*tray.matrix.d),w=Math.floor(42*tray.matrix.a),h=Math.floor(32*tray.matrix.d);
 const actual=out.ctx.getImageData(x,y,w,h).data,ratio=tray.matrix.a/board.matrix.a,normalized=capture(state,view(),'',undefined,{scale:ratio,x:tray.matrix.e-board.matrix.e*ratio,y:tray.matrix.f-board.matrix.f*ratio});
 const expected=normalized.ctx.getImageData(x,y,w,h).data;
 let delta=0;for(let i=0;i<actual.length;i++)delta+=Math.abs(actual[i]-expected[i]);
 assert.ok(delta/actual.length<1,`normalized board/tray badge pixel difference ${delta/actual.length}`);
 for(const turns of [1,2,3]){state.candidates[0].rushTurns=turns;assert.equal(trayBadges(capture(state,view()),String(turns)).length,3,'the numeral comes from rushTurns, never a decorative constant');}
});

test('settings rows including music are vertically centered and their painted labels match hitboxes',()=>{
 const state=fixture();
 for(const recovery of [false,true])for(const viewport of viewports){
  const current=view({screen:'settings',profileNeedsRecovery:recovery,saveStatus:'保存失败，请重试',profileStatus:'游戏记录异常，原记录已保护'}),out=capture(state,current,`settings-${recovery?'recovery':'normal'}`,viewport),controls=getUiControls(state,current);
  const top=controls[0].rect.y,last=controls[controls.length-1],bottom=last.rect.y+last.rect.h;
  assert.equal((top+bottom)/2,960);assert.equal(bottom-top,controls.length*144+(controls.length-1)*36);
  assert.deepEqual(controls.map(c=>c.action.type),['toggleMusic','toggleSound','toggleVibration','toggleMotion',...(recovery?['recoverProfile']:[]),'resetProfile','back']);
  controls.forEach((c,index)=>{assert.deepEqual(c.rect,{x:132,y:960-(controls.length*144+(controls.length-1)*36)/2+index*180,w:816,h:144});assert.ok(hitTestPoint({x:c.rect.x+c.rect.w/2,y:c.rect.y+c.rect.h/2},c.rect));assert.ok(c.rect.h*out.scale>=44);
   const label=out.labels.find(l=>l.value===c.label)!;assert.ok(label,`painted ${c.label}`);assert.ok(label.left>=(out.ox+c.rect.x*out.scale)*viewport.dpr&&label.right<=(out.ox+(c.rect.x+c.rect.w)*out.scale)*viewport.dpr);assert.ok(label.top>=(out.oy+c.rect.y*out.scale)*viewport.dpr&&label.bottom<=(out.oy+(c.rect.y+c.rect.h)*out.scale)*viewport.dpr);
  });
  const heading=out.labels.find(l=>l.value==='游玩设置')!;assert.ok(heading.bottom<(out.oy+top*out.scale)*viewport.dpr);assert.ok((out.oy+top*out.scale)*viewport.dpr-heading.bottom<60*out.scale*viewport.dpr);
  for(const label of out.labels)assert.ok(label.left>=0&&label.right<=viewport.w*viewport.dpr&&label.top>=viewport.safe*viewport.dpr&&label.bottom<=viewport.h*viewport.dpr,JSON.stringify(label));
 }
});

test('music defaults on independently of effects and each settings state paints its actual value',()=>{
 const state=fixture();
 for(const music of [undefined,true,false])for(const sound of [true,false])for(const reducedMotion of [false,true]){
  const profile=createProfile();profile.settings={sound,reducedMotion,...music===undefined?{}:{music}};
  const current=view({screen:'settings',profile}),controls=getUiControls(state,current),out=capture(state,current,`settings-music-${music??'legacy'}-sound-${sound}-motion-${reducedMotion}`,viewports[0]);
  const musicControl=controls.find(c=>c.action.type==='toggleMusic');assert.equal(musicControl?.label,`音乐：${music!==false?'开':'关'}`);assert.equal(musicControl?.selected,music!==false);assert.equal(controls.find(c=>c.action.type==='toggleSound')?.label,`音效：${sound?'开':'关'}`);
  assert.ok(out.words.includes(musicControl!.label));assert.match(out.words,new RegExp(`简化动效：${reducedMotion?'开':'关'}`));
 }
});

test('current rush card removes triple-reward copy and keeps the fixed score bucket and countdown help',()=>{
 const state=fixture(),account=makeAccountFixture();
 account.profile.results['inbound.rush.v20.fixed.plain']={runs:1,units:30,maxUnits:30,score:555,wins:1,retirements:0,maxChain:1,best:{score:555,units:30,chain:1}};
 for(const viewport of viewports){const out=capture(state,view({screen:'inboundMenu',account}),'inbound-menu',viewport);assert.doesNotMatch(out.words,/×3|三倍|金币.*3倍/);assert.match(out.words,/最高分 555/);assert.match(out.words,/五班|完成30单/);}
 const help=capture(state,view({screen:'helpDetails',helpFromHome:true,helpTopic:'inbound'}));assert.ok(help.words.includes('加急数字按后续成功放置次数倒数，不是倒计时'));
});

test('current version21 board and result keep the fixed unprefixed rush label',()=>{
 const state=fromV20(fixture());
 for(const result of [false,true]){const current=result?{...state,phase:'result' as const,result:'won' as const,endReason:'completed' as const,completedOrders:30,shift:5 as const,score:6000,rawScore:6000}:state;
  for(const viewport of viewports){const out=capture(current,view(),`rush21-${result?'result':'board'}`,viewport);assert.match(out.words,/加急模式/);assert.doesNotMatch(out.words,/普通加急|困难加急|专业加急/);}
 }
});

test('all supported rush generations paint one large numeral on every rotated shape cell',()=>{
 const states:GameRun[]=[createRunV14({seed:17,mode:'daily'}),createRunV15({seed:17,mode:'daily'}),createRunV16({seed:17,mode:'daily'}),createRunV18({seed:17,mode:'daily',inboundDifficulty:'hard'}),createRunV19({seed:17,mode:'rush',inboundDifficulty:'hard'}),fixture(),fromV20(fixture())];
 for(const state of states)for(const shape of SHAPES)for(const quarterTurns of [0,1,2,3] as const){
  const piece=rushPiece({shapeId:shape.id,quarterTurns});state.candidates=[piece];state.phase='input';
  const out=capture(state,view());assert.equal(trayBadges(out).length,shape.cells.length,`v${state.rulesetVersion} ${shape.id} rotation ${quarterTurns}`);
 }
});

test('all cargo styles, colors and outline variants preserve the numeral on 1–5-cell pieces',()=>{
 const styles:CargoStyleId[]=['classic','outline','wood','insulated','reinforced','taped'];
 const shapes=['shape.single','shape.domino_h','shape.l3_ne','shape.t4_n','shape.p5'];
 for(const cargo of CARGO)for(const style of styles)for(const outline of [false,true]){
  const state=fixture(),account=makeAccountFixture();account.profile.cosmetics.cargo=style;account.profile.cargoOutline=outline;
  for(const [index,shapeId] of shapes.entries()){
   const piece=rushPiece({shapeId,cargo:cargo.id,quarterTurns:index%4 as 0|1|2|3});state.candidates=[piece];const before=structuredClone(state);
   const out=capture(state,view({account}),index===4?`rush-${cargo.id}-${style}-${outline?'outline':'plain'}`:'',viewports[0]);assert.equal(trayBadges(out).length,index+1,`${cargo.id}/${style}/${outline}/${shapeId}`);assert.deepEqual(state,before);
  }
 }
});

test('rotated preview, drag, hover, cancel and restored rendering keep real pending turns',()=>{
 const state=fromV20(fixture()),original=structuredClone(state),piece=state.candidates[0],command={type:'rotate' as const,pieceId:piece.id,quarterTurns:1 as const},rotated=toolPreview(state,command);assert.equal(rotated.error,undefined);
 const cases:[string,GameRun,ViewState][]=[['rotated-tool-preview',state,view({selectedPieceId:piece.id,toolSelection:{item:'rotate',pieceId:piece.id,cells:[],quarterTurns:1,command,preview:rotated.state as ToolRun}})],['drag',state,view({selectedPieceId:piece.id,dragPoint:{x:380,y:950}})],['hover',state,view({selectedPieceId:piece.id,hoverOrigin:{x:2,y:3}})],['after-cancel',state,view()],['restored',structuredClone(state),view()]];
 for(const [name,current,currentView] of cases)for(const viewport of viewports){const before=structuredClone(current),out=capture(current,currentView,name,viewport);assert.equal(trayBadges(out).length,3,name);assert.deepEqual(current,before);for(const badge of out.labels.filter(l=>l.value==='3'&&l.font.includes('34px')))assert.ok(badge.painted>0);}
 assert.deepEqual(state,original);assert.deepEqual(presentationPieceCells(rotated.state.candidates[0],state.rulesetVersion),presentationPieceCells({...piece,quarterTurns:1},state.rulesetVersion));
});

test('actual pointer cancellation restores pending badges and centered settings dispatch only their painted action',()=>{
 const state=fixture(),before=structuredClone(state),actions:UiAction[]=[],current=view(),input=new InputController({getState:()=>state,getView:()=>current,patchView:patch=>Object.assign(current,patch),preview:()=>({valid:false,cells:[],shipments:[],events:[],reason:'fixture'}),dispatch:()=>assert.fail('cancelled input cannot place cargo'),togglePause(){},restart(){},resume(){},toggleDebug(){},action:action=>actions.push(action)});
 const tray=getTrayRects(3)[0];input.down({x:tray.x+tray.w/2,y:tray.y+tray.h/2});input.move({x:380,y:950});assert.ok(current.dragPoint);input.cancel();assert.equal(current.selectedPieceId,null);assert.equal(current.dragPoint,null);assert.equal(trayBadges(capture(state,current,'pointer-cancel',viewports[0])).length,3);assert.deepEqual(state,before);
 current.screen='settings';
 for(const control of getUiControls(state,current)){const p={x:control.rect.x+control.rect.w/2,y:control.rect.y+control.rect.h/2};input.down(p);input.up(p);assert.deepEqual(actions[actions.length-1],control.action);const count=actions.length;input.down(p);input.cancel();input.up(p);assert.equal(actions.length,count,'cancelled setting taps do not dispatch');}
});

test('pending counters wait and rendering shows 3 after placement, then 2 and 1 only on later successful placements',()=>{
 let state=fixture();state.board.fill(null);state.cellTraits.fill(null);state.orders.forEach(order=>order.cargo='cargo.chem');state.candidates=[rushPiece({shapeId:'shape.single'})];
 const waiting=structuredClone(state);for(const elapsed of [0,1000,999999]){const out=capture(state,view({elapsed}));assert.equal(trayBadges(out).length,1);}assert.deepEqual(state,waiting);
 const first=applyCommandV20(state,{type:'place',pieceId:'rush.fixture',origin:{x:1,y:1}});assert.equal(first.error,undefined);state=first.state;assert.equal(state.cellTraits[8]?.remaining,3);
 assert.ok(capture(state,view()).labels.some(l=>l.value==='3'&&l.font.includes('34px')&&l.painted>0&&l.y<1400));
 for(const [turn,x] of [[2,4],[1,5],[0,6]] as const){state.candidates=[{id:`later.${turn}`,shapeId:'shape.single',cargo:'cargo.food',quarterTurns:0}];const next=applyCommandV20(state,{type:'place',pieceId:`later.${turn}`,origin:{x,y:5}});assert.equal(next.error,undefined);state=next.state;const out=capture(state,view());if(turn){assert.equal(state.cellTraits[8]?.remaining,turn);assert.ok(out.labels.some(l=>l.value===String(turn)&&l.font.includes('34px')&&l.painted>0));}else{assert.equal(state.cellTraits[8]?.kind,'waste');assert.ok(!out.labels.some(l=>l.value==='0'&&l.font.includes('34px')));}}
 const shipping=fixture();shipping.board.fill(null);shipping.cellTraits.fill(null);shipping.board[8]='cargo.machine';shipping.cellTraits[8]={kind:'rush',remaining:1,bornAtPlacement:0};shipping.successfulPlacements=1;shipping.orders[0]={...shipping.orders[0],cargo:'cargo.machine',amount:1};shipping.candidates=[{id:'shipment.trigger',shapeId:'shape.single',cargo:'cargo.food',quarterTurns:0}];
 const shipped=applyCommandV20(shipping,{type:'place',pieceId:'shipment.trigger',origin:{x:5,y:5}});assert.equal(shipped.error,undefined);assert.ok(shipped.events.some(event=>event.type==='shipment'&&event.cells.includes(8)));assert.ok(!shipped.events.some(event=>event.type==='rushExpired'&&event.cells.includes(8)));assert.equal(shipped.state.cellTraits[8],null,'shipment resolves before countdown expiry');
});
