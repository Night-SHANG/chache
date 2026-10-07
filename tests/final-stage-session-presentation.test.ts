import test from 'node:test';
import assert from 'node:assert/strict';
import {createCanvas} from '@napi-rs/canvas';
import {sessionHost} from './helpers/session-fixtures.ts';
import {createRunV15,applyCommandV15} from '../src/domain/v15/engine.ts';
import {inboundGroups,inboundDocks,inboundPieceCells} from '../src/presentation/inbound-helpers.ts';
import {toolPreview} from '../src/presentation/tool-preview.ts';
import {getUiControls} from '../src/presentation/ui.ts';
import {render} from '../src/presentation/renderer.ts';
import type {ViewState} from '../src/presentation/view-types.ts';

const view=(patch:Partial<ViewState>={}):ViewState=>({selectedPieceId:null,hoverOrigin:null,preview:null,dragPoint:null,paused:false,message:'',saveStatus:'',elapsed:0,animation:null,debug:false,needsResume:false,screen:'game',...patch});
for(const mode of ['standard','daily','endless'] as const)test(`new ${mode} UI starts its exact approved rule and cleanup remains untimed`,()=>{
 const h=sessionHost(),s=h.session;s.action({type:'newRun',mode});if(s.view.screen==='guideOffer')s.action({type:'directStart'});if(s.view.screen==='prepareTools')s.action({type:'prepareNext'});
 assert.equal(s.state.rulesetVersion,mode==='endless'?14:15);assert.equal(s.view.screen,'game');assert.equal(s.state.phase,'cleanup');assert.equal(s.state.commandIndex,0);
 h.time(60000);s.tick(60000);assert.equal(s.view.elapsed,0);assert.deepEqual(s.state.candidates,[]);s.action({type:'chooseCleanup',branch:'orders'});assert.equal(s.state.phase,'input');assert.equal(s.state.candidates.length,3);
 h.time(60200);s.tick(60200);assert.equal(s.view.elapsed,200);
});
test('rules15 presentation uses its own geometry and tool reducer without a rules9 or outbound fallback',()=>{
 const s=applyCommandV15(createRunV15({seed:1,mode:'standard',toolCharges:{rotate:0,clear:1,wildcard:0}}),{type:'chooseCleanup',branch:'orders'}).state;
 s.board[0]='cargo.food';assert.equal(inboundGroups(s,'cargo.food')[0].units,1);assert.deepEqual(inboundDocks(s).map(d=>d.entry),[{x:3,y:0},{x:6,y:3},{x:3,y:6},{x:0,y:3}]);
 assert.equal(inboundPieceCells({id:'rush',shapeId:'shape.i3_h',cargo:'cargo.food',trait:'rush',rushTurns:3,quarterTurns:1},15).length,3);
 const result=toolPreview(s,{type:'clear',cells:[0]});assert.equal(result.error,undefined);assert.equal(result.state.rulesetVersion,15);assert.equal(result.state.board[0],null);assert.equal(s.board[0],'cargo.food');
});
test('rules15 keeps readable multi-shape rush and standard overtime controls',()=>{
 const s=applyCommandV15(createRunV15({seed:1,mode:'standard'}),{type:'chooseCleanup',branch:'orders'}).state;
 s.candidates[0]={id:'rush',shapeId:'shape.i3_h',cargo:'cargo.food',trait:'rush',rushTurns:3,quarterTurns:0};
 const ctx=createCanvas(1080,1920).getContext('2d') as unknown as CanvasRenderingContext2D,labels:string[]=[],draw=ctx.fillText.bind(ctx);ctx.fillText=(word,x,y)=>{labels.push(word);draw(word,x,y);};
 render(ctx,s,view());assert.ok(labels.includes('加急 · 食品 · 3次'));
 s.phase='result';s.result='won';s.endReason='completed';s.completedOrders=30;s.shift=5;
 assert.ok(getUiControls(s,view()).some(c=>c.action.type==='continueOvertime'));
});
