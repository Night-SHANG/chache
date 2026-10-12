import test from 'node:test';
import assert from 'node:assert/strict';
import {InputController} from '../src/presentation/input.ts';
import {createRunV16} from '../src/domain/v16/engine.ts';
import {previewPlayablePlacement,playableChecksum} from '../src/domain/playable.ts';
import type {GameRun,PlayablePreview,GameCommand} from '../src/domain/playable.ts';
import {placementRisk} from '../src/presentation/placement-risk.ts';
import {cellCenter,getTrayRects} from '../src/presentation/layout.ts';
import {touchDragLift} from '../src/presentation/touch-placement.ts';
import type {ViewState} from '../src/presentation/view-types.ts';

function harness(){
 let state:GameRun=createRunV16({seed:71,mode:'standard'});
 state.candidates=state.candidates.map(piece=>({...piece,shapeId:'shape.single',quarterTurns:0}));
 const view={selectedPieceId:null,hoverOrigin:null,preview:null,dragPoint:null,paused:false,message:'',saveStatus:'',elapsed:0,animation:null,debug:false,needsResume:false,screen:'game'} as ViewState;
 const previews:PlayablePreview[]=[],received:(PlayablePreview|undefined)[]=[],commands:GameCommand[]=[],feedback:string[]=[];
 const input=new InputController({getState:()=>state,getView:()=>view,patchView:patch=>Object.assign(view,patch),preview:(pieceId,origin)=>{const value=previewPlayablePlacement(state,pieceId,origin);previews.push(value);return value;},risk:(pieceId,origin,...extra:PlayablePreview[])=>{received.push(extra[0]);return placementRisk(state,pieceId,origin);},dispatch:command=>commands.push(command),feedback:kind=>feedback.push(kind),togglePause(){},restart(){},resume(){},toggleDebug(){}});
 const tray=(index=0)=>{const rect=getTrayRects(state.candidates.length)[index];return {x:rect.x+rect.w/2,y:rect.y+rect.h/2};};
 return {get state(){return state;},replace(next:GameRun){state=next;},view,previews,received,commands,feedback,input,tray,point:(x=0,y=0)=>cellCenter({x,y},state)};
}

test('same-cell drag reuses preview and risk while updating every drag position',()=>{
 const h=harness(),before=playableChecksum(h.state),point=h.point();h.input.down(h.tray(),4);
 h.input.move(point,4);const preview=h.view.preview,risk=h.view.placementRisk;
 for(let i=0;i<120;i++)h.input.move({x:point.x+i%8,y:point.y+i%5},4);
 assert.equal(h.previews.length,1);assert.equal(h.received.length,1);assert.equal(h.received[0],preview);
 assert.equal(h.view.preview,preview);assert.equal(h.view.placementRisk,risk);
 assert.deepEqual(h.view.dragPoint,{x:point.x+119%8,y:point.y+119%5});assert.equal(playableChecksum(h.state),before);
});

test('cross-cell and off-board transitions never reuse a different origin',()=>{
 const h=harness();h.input.down(h.tray());h.input.move(h.point());h.input.move(h.point(1,0));assert.equal(h.previews.length,2);
 h.input.move({x:-1,y:-1});assert.equal(h.view.preview,null);assert.equal(h.view.placementRisk,null);
 h.input.move(h.point(1,0));assert.equal(h.previews.length,3);h.input.move(h.point(1,0));assert.equal(h.previews.length,3);
});

test('replacement run or selected piece invalidates the same-cell result',()=>{
 const h=harness();h.input.down(h.tray());h.input.move(h.point());
 h.replace({...h.state,board:[...h.state.board]});h.input.move(h.point());assert.equal(h.previews.length,2);
 h.view.selectedPieceId=h.state.candidates[1].id;h.input.move(h.point());assert.equal(h.previews.length,3);
});

test('pointer cancellation and a fresh drag do not retain preview state',()=>{
 const h=harness();h.input.down(h.tray(),1);h.input.move(h.point(),1);h.input.cancel(2);h.input.move(h.point(),1);assert.equal(h.previews.length,1);
 h.input.cancel(1);h.input.down(h.tray(),1);h.input.move(h.point(),1);assert.equal(h.previews.length,2);
 h.input.up(h.point(),2);assert.equal(h.commands.length,0);
});

test('release validates current state afresh, rather than committing its cached preview',()=>{
 const h=harness();h.input.down(h.tray());h.input.move(h.point());const before=h.previews.length;
 h.input.up(h.point());assert.equal(h.previews.length,before+1);assert.equal(h.commands.length,1);assert.equal(h.view.preview,null);
 h.input.down(h.tray());h.input.move(h.point());assert.equal(h.previews.length,before+2);
});

test('a changed release origin is checked even without a final move event',()=>{
 const h=harness();h.input.down(h.tray());h.input.move(h.point());h.input.up(h.point(1,0));
 assert.equal(h.previews.length,2);assert.deepEqual(h.commands[0],{type:'place',pieceId:h.state.candidates[0].id,origin:{x:1,y:0}});
});

test('invalid same-cell previews are cached without invoking risk analysis',()=>{
 const h=harness();h.input.down(h.tray());h.input.move(h.point(3,0));assert.equal(h.view.preview?.valid,false);
 h.input.move(h.point(3,0));assert.equal(h.previews.length,1);assert.equal(h.received.length,0);assert.equal(h.view.placementRisk,null);
});

test('pause during a drag clears the preview before resume',()=>{
 const h=harness();h.input.down(h.tray());h.input.move(h.point());h.view.paused=true;h.input.move(h.point());
 assert.equal(h.view.preview,null);h.view.paused=false;h.input.down(h.tray());h.input.move(h.point());assert.equal(h.previews.length,2);
});

test('cached route-ready previews do not repeat feedback but leaving and reentering does',()=>{
 const h=harness();h.state.candidates[0].cargo='cargo.food';h.state.board[1]='cargo.food';h.state.board[2]='cargo.food';h.state.orders=[{id:'order.ready',dockId:'dock.north',cargo:'cargo.food',amount:3,baseScore:100}];
 h.input.down(h.tray());h.input.move(h.point());assert.ok(h.view.preview?.shipments.length);
 for(let i=0;i<8;i++)h.input.move(h.point());assert.equal(h.feedback.filter(kind=>kind==='routeReady').length,1);
 h.input.move({x:-1,y:-1});h.input.move(h.point());assert.equal(h.feedback.filter(kind=>kind==='routeReady').length,2);
});


test('integrated touch projection caches by lifted origin while the drag image follows every move',()=>{
 const h=harness(),target=h.point(),lift=touchDragLift(h.state),finger={x:target.x,y:target.y+lift};
 h.input.down(h.tray(),3,'touch');h.input.move(finger,3);
 const preview=h.view.preview;
 for(let i=0;i<60;i++)h.input.move({x:finger.x+i%8,y:finger.y+i%5},3);
 assert.equal(h.previews.length,1);assert.equal(h.received.length,1);assert.equal(h.view.preview,preview);
 assert.deepEqual(h.view.hoverOrigin,{x:0,y:0});
 assert.deepEqual(h.view.dragPoint,{x:target.x+59%8,y:target.y+59%5});
 h.input.up(finger,3);assert.equal(h.previews.length,2);
 assert.deepEqual(h.commands,[{type:'place',pieceId:h.state.candidates[0].id,origin:{x:0,y:0}}]);
});

test('integrated touch release rejects a cached legal origin after the real board changes',()=>{
 const h=harness(),target=h.point(),finger={x:target.x,y:target.y+touchDragLift(h.state)};
 h.input.down(h.tray(),3,'touch');h.input.move(finger,3);assert.equal(h.view.preview?.valid,true);
 const board=[...h.state.board];board[0]='cargo.food';h.replace({...h.state,board});
 h.input.up(finger,3);assert.equal(h.previews.length,2);assert.equal(h.commands.length,0);assert.equal(h.view.preview,null);
});

test('integrated touch tray cancellation invalidates cached origins before reentry',()=>{
 const h=harness(),target=h.point(),finger={x:target.x,y:target.y+touchDragLift(h.state)};
 h.input.down(h.tray(),3,'touch');h.input.move(finger,3);assert.equal(h.previews.length,1);
 h.input.move(h.tray(),3);assert.equal(h.view.preview,null);assert.equal(h.view.dragPoint,null);
 h.input.move(finger,3);assert.equal(h.previews.length,2);h.input.cancel(3);
 h.input.up(finger,3);assert.equal(h.commands.length,0);
});
