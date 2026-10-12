import test from 'node:test';
import assert from 'node:assert/strict';
import {createRunV16} from '../src/domain/v16/engine.ts';
import {previewPlayablePlacement,findPlayableMoves,applyPlayableCommand,playableChecksum} from '../src/domain/playable.ts';
import {placementRisk} from '../src/presentation/placement-risk.ts';

test('risk consumes a valid preview without rereading or cloning command history',()=>{
 const state=createRunV16({seed:71,mode:'standard'});state.candidates[0]={...state.candidates[0],shapeId:'shape.single',quarterTurns:0};
 const pieceId=state.candidates[0].id,origin={x:0,y:0},preview=previewPlayablePlacement(state,pieceId,origin),expected=placementRisk(state,pieceId,origin);assert.equal(preview.valid,true);
 let historyReads=0;const observed=new Proxy(state,{get(target,key,receiver){if(key==='commands')historyReads++;return Reflect.get(target,key,receiver);}});
 assert.deepEqual(placementRisk(observed,pieceId,origin,preview),expected);assert.equal(historyReads,0);
});

test('invalid supplied preview produces no risk and performs no command simulation',()=>{
 const state=createRunV16({seed:71,mode:'standard'}),pieceId=state.candidates[0].id,origin={x:0,y:0};let reads=0;
 const observed=new Proxy(state,{get(target,key,receiver){reads++;return Reflect.get(target,key,receiver);}});
 assert.equal(placementRisk(observed,pieceId,origin,{valid:false,cells:[],events:[],shipments:[]}),null);assert.equal(reads,0);
});

import type {GameRun} from '../src/domain/playable.ts';
import {createRun} from '../src/domain/engine.ts';
import {createRunV9} from '../src/domain/v9/engine.ts';
import {createRunV10} from '../src/domain/v10/engine.ts';
import {createRunV11} from '../src/domain/v11/engine.ts';
import {createRunV12} from '../src/domain/v12/engine.ts';
import {createRunV13} from '../src/domain/v13/engine.ts';
import {createRunV14} from '../src/domain/v14/engine.ts';
import {createRunV15} from '../src/domain/v15/engine.ts';
import {createRunV18} from '../src/domain/v18/engine.ts';
import {createRunV19} from '../src/domain/v19/engine.ts';
import {createRunV20} from '../src/domain/v20/engine.ts';
import {createRunV21} from '../src/domain/v21/engine.ts';

const starts:GameRun[]=[
 createRun(17,'standard',1),createRun(17,'standard',2),createRun(17,'standard',3),createRun(17,'color_exit',4),createRun(17,'color_exit',5,'entry'),createRun(17,'color_exit',6,'easy'),createRun(17,'endless',7),createRun(17,'color_exit',8,'normal'),
 createRunV9({seed:17,mode:'standard'}),createRunV10(17,'normal'),createRunV11({seed:17,mode:'standard'}),createRunV12(17,'normal'),createRunV13(17,'normal'),createRunV14({seed:17,mode:'standard'}),createRunV15({seed:17,mode:'standard'}),createRunV16({seed:17,mode:'standard'}),createRunV18({seed:17,mode:'standard',inboundDifficulty:'hard'}),createRunV19({seed:17,mode:'rush'}),createRunV20({seed:17,mode:'rush'}),createRunV21({seed:17,mode:'rush'}),
];
for(const initial of starts)test(`v${initial.rulesetVersion} preview-backed risk matches fresh simulation for every legal opening and progressed move`,()=>{
 let state=initial;
 if(state.phase==='cleanup'){const chosen=applyPlayableCommand(state,{type:'chooseCleanup',branch:'orders'});assert.equal(chosen.error,undefined);state=chosen.state;}
 for(let step=0;step<4&&state.phase==='input';step++){
  const before=playableChecksum(state),moves=findPlayableMoves(state);assert.ok(moves.length);
  for(const {pieceId,origin} of moves){const preview=previewPlayablePlacement(state,pieceId,origin);assert.equal(preview.valid,true);assert.ok(preview.stateAfter);assert.deepEqual(placementRisk(state,pieceId,origin,preview),placementRisk(state,pieceId,origin));}
  assert.equal(playableChecksum(state),before);const next=applyPlayableCommand(state,{type:'place',...moves[Math.floor(moves.length/2)]});assert.equal(next.error,undefined);state=next.state;
 }
});

test('a valid lightweight preview lacking stateAfter preserves the fresh simulation fallback',()=>{
 const state=createRunV16({seed:17,mode:'standard'}),move=findPlayableMoves(state)[0],preview=previewPlayablePlacement(state,move.pieceId,move.origin);
 const {stateAfter,...lightweight}=preview;assert.ok(stateAfter);
 assert.deepEqual(placementRisk(state,move.pieceId,move.origin,lightweight),placementRisk(state,move.pieceId,move.origin));
});

import {sessionHost} from './helpers/session-fixtures.ts';
import {cellCenter,getTrayRects} from '../src/presentation/layout.ts';

test('real session passes its preview to risk instead of duplicating the original state simulation',()=>{
 const {session,storage}=sessionHost(),state=createRunV16({seed:71,mode:'standard'}),move=findPlayableMoves(state)[0];let historyReads=0;
 const observed=new Proxy(state,{get(target,key,receiver){if(key==='commands')historyReads++;return Reflect.get(target,key,receiver);}});
 previewPlayablePlacement(observed,move.pieceId,move.origin);const singlePreviewReads=historyReads;assert.ok(singlePreviewReads>0);
 session.state=observed;Object.assign(session.view,{screen:'game',paused:false,needsResume:false,animation:null,accountBlocked:false});
 const rect=getTrayRects(state.candidates.length)[state.candidates.findIndex(piece=>piece.id===move.pieceId)],point=cellCenter(move.origin,state);session.input.down({x:rect.x+rect.w/2,y:rect.y+rect.h/2});
 historyReads=0;storage.resetFault();for(let i=0;i<10;i++)session.input.move({x:point.x+i%3,y:point.y+i%2});
 assert.equal(historyReads,singlePreviewReads);assert.deepEqual(storage.operations,[]);
});
