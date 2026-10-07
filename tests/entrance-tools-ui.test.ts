import test from 'node:test';
import assert from 'node:assert/strict';
import {createCanvas} from '@napi-rs/canvas';
import {createRun} from '../src/domain/engine.ts';
import {createRunV11,applyCommandV11} from '../src/domain/v11/engine.ts';
import type {GameRun} from '../src/domain/playable.ts';
import {render} from '../src/presentation/renderer.ts';
import {getUiControls} from '../src/presentation/ui.ts';
import {boardHint} from '../src/presentation/order-feedback.ts';
import {colorExitBoardHint} from '../src/presentation/color-exit-renderer.ts';
import {createProfile} from '../src/application/profile.ts';
import type {ViewState} from '../src/presentation/view-types.ts';

const view=():ViewState=>({screen:'game',selectedPieceId:null,hoverOrigin:null,preview:null,dragPoint:null,paused:false,message:'',saveStatus:'',elapsed:0,animation:null,debug:false,needsResume:false,profile:createProfile()});
function outbound(version=12):GameRun{return {...createRun(1,'color_exit',8,'easy'),rulesetVersion:version,toolCharges:{rotate:1,clear:1,wildcard:0},usedToolIds:[],candidates:[{id:'piece.1',shapeId:'shape.domino_h',cargo:'cargo.food',quarterTurns:0}]} as unknown as GameRun;}
function inbound(version=14):GameRun{return {...applyCommandV11(createRunV11({seed:1,mode:'standard'}),{type:'chooseCleanup',branch:'orders'}).state,rulesetVersion:version,board:Array(49).fill(null)} as unknown as GameRun;}
function rendered(state:GameRun,v=view()){const canvas=createCanvas(1080,1920),ctx=canvas.getContext('2d'),labels:string[]=[];const fillText=ctx.fillText.bind(ctx);ctx.fillText=(s,...args)=>{labels.push(s);fillText(s,...args);};render(ctx as unknown as CanvasRenderingContext2D,state,v);return {canvas,labels};}

test('reserved entrance floor labels and free capacity match the new families only',()=>{
 for(const [state,count,free] of [[inbound(),4,45],[outbound(),1,80],[outbound(13),1,80],[inbound(11),0,49],[createRun(1,'color_exit',8,'easy'),0,81]] as const){
  const labels=rendered(state).labels;
  assert.equal(labels.filter(label=>label==='留空').length,count);
  assert.ok(labels.includes(`空位 ${free}`));
 }
});

test('reserved placement previews show the concise domain rejection',()=>{
 const v=view();v.preview={valid:false,cells:[],shipments:[],events:[],reason:'入口需留空'};
 assert.equal(boardHint(inbound(),v),'入口需留空');
 assert.equal(colorExitBoardHint(outbound(),v),'入口需留空');
});

test('outbound toolbox remains visible with zero tools and opens the same disabled drawer',()=>{
 const s=outbound(),v=view();Object.assign(s,{toolCharges:{rotate:0,clear:0,wildcard:0}});
 const entry=getUiControls(s,v).find(c=>c.action.type==='toggleToolbox');assert.equal(entry?.label,'工具箱 · 0');
 v.toolboxOpen=true;const tools=getUiControls(s,v).filter(c=>c.action.type==='tool');assert.equal(tools.length,3);assert.ok(tools.every(c=>c.disabled));
});

test('outbound wildcard reveals three explicit color choices after candidate selection',()=>{
 const s=outbound(),v=view();v.toolSelection={item:'wildcard',pieceId:null,cells:[],quarterTurns:0};
 assert.equal(getUiControls(s,v).filter(c=>c.action.type==='toolCargo').length,0);
 v.toolSelection.pieceId='piece.1';
 const choices=getUiControls(s,v).filter(c=>c.action.type==='toolCargo');assert.equal(choices.length,3);
 assert.deepEqual(choices.map(c=>c.action.type==='toolCargo'?c.action.cargo:null),['cargo.food','cargo.machine','cargo.chem']);
 assert.equal(getUiControls(s,v).find(c=>c.action.type==='toolConfirm')?.disabled,true);
});

test('tool targeting uses highlights and brief names without tutorial paragraphs',()=>{
 const s=inbound(),v=view();v.toolSelection={item:'clear',pieceId:null,cells:[],quarterTurns:0};
 const labels=rendered(s,v).labels;assert.ok(labels.includes('清障'));assert.ok(!labels.some(label=>/点击1至2|选择一个货件|选择一件待放货/.test(label)));
});

import * as pieceHelpers from '../src/presentation/inbound-helpers.ts';
import {pieceCellCargo} from '../src/domain/pieces.ts';
test('outbound rotated offsets retain original index colors in shared presentation geometry',()=>{
 const piece={id:'piece.mixed',shapeId:'shape.square',cargo:'cargo.food' as const,quarterTurns:1 as const,cellCargos:['cargo.food','cargo.food','cargo.machine','cargo.machine'] as const};
 assert.equal(typeof pieceHelpers.presentationPieceCells,'function');
 const cells=pieceHelpers.presentationPieceCells({...piece,cellCargos:[...piece.cellCargos]},12);
 assert.deepEqual(cells.map((p,index)=>({...p,cargo:pieceCellCargo({...piece,cellCargos:[...piece.cellCargos]},index)})),[{x:1,y:0,cargo:'cargo.food'},{x:1,y:1,cargo:'cargo.food'},{x:0,y:0,cargo:'cargo.machine'},{x:0,y:1,cargo:'cargo.machine'}]);
});

test('clear highlights occupied board targets without highlighting empty floor',()=>{
 const s=outbound(),normal=view(),targeting=view();s.board[0]='cargo.food';targeting.toolSelection={item:'clear',pieceId:null,cells:[],quarterTurns:0};
 const before=rendered(s,normal).canvas.getContext('2d'),after=rendered(s,targeting).canvas.getContext('2d');
 assert.notDeepEqual(after.getImageData(126,566,6,70).data,before.getImageData(126,566,6,70).data);
 assert.deepEqual(after.getImageData(220,566,6,70).data,before.getImageData(220,566,6,70).data);
});

import {getTrayRects} from '../src/presentation/layout.ts';
test('rotation highlights changeable candidates while a plain single stays unmarked',()=>{
 const s=outbound(),v=view();s.candidates.push({id:'piece.single',shapeId:'shape.single',cargo:'cargo.food',quarterTurns:0});v.toolSelection={item:'rotate',pieceId:null,cells:[],quarterTurns:0};
 const baseline=view();baseline.toolSelection={item:'clear',pieceId:null,cells:[],quarterTurns:0};const normal=rendered(s,baseline).canvas.getContext('2d'),targeting=rendered(s,v).canvas.getContext('2d'),rects=getTrayRects(2,true);
 const sample=(ctx:ReturnType<ReturnType<typeof createCanvas>['getContext']>,index:number)=>ctx.getImageData(rects[index].x+7,rects[index].y+26,6,70).data;
 assert.notDeepEqual(sample(targeting,0),sample(normal,0));assert.deepEqual(sample(targeting,1),sample(normal,1));
});
