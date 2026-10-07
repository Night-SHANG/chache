import test from 'node:test';
import assert from 'node:assert/strict';
import {sessionHost} from './helpers/session-fixtures.ts';
import {isOutboundToolsRun,isToolRun,findPlayableMoves,playableChecksum} from '../src/domain/playable.ts';
import type {ItemId} from '../src/application/account-types.ts';
import type {GameSession} from '../src/application/session.ts';
import {GameSession as Session} from '../src/application/session.ts';

function start(s:GameSession,mode:'standard'|'endless'|'daily'|'color_exit',items:ItemId[]=[],outboundMode:'normal'|'endless'='normal'){
 s.action({type:'newRun',mode,outboundMode,difficultyId:'easy'});
 if(s.view.screen==='guideOffer')s.action({type:'directStart'});
 if(mode!=='daily'){assert.equal(s.view.screen,'prepareTools');for(const item of items)s.action({type:'toggleItem',item});s.action({type:'prepareNext'});}
 assert.equal(s.view.screen,'game');
 if(mode!=='color_exit'){assert.equal(s.state.rulesetVersion,14);assert.equal(s.state.phase,'cleanup');s.action({type:'chooseCleanup',branch:'orders'});}
 else assert.equal(s.state.rulesetVersion,outboundMode==='endless'?13:12);
 assert.equal(s.state.phase,'input');
}

test('new inbound and outbound starts use reserved-entry identities and freeze pending cleanup',()=>{
 for(const mode of ['standard','endless','daily','color_exit'] as const){const h=sessionHost();start(h.session,mode);}
 const h=sessionHost();start(h.session,'color_exit',[],'endless');
 h.session.action({type:'home'});h.session.action({type:'confirm'});h.session.action({type:'newRun',mode:'standard'});
 if(h.session.view.screen==='guideOffer')h.session.action({type:'directStart'});h.session.action({type:'prepareNext'});
 assert.equal(h.session.state.phase,'cleanup');h.time(60000);h.session.tick(60000);assert.equal(h.session.view.elapsed,0);
});

test('outbound preparation reserves at most two distinct actual inventory tools',()=>{
 const h=sessionHost({inventory:{rotate:1,clear:1,wildcard:1}}),s=h.session;
 start(s,'color_exit',['rotate','clear','wildcard']);
 assert.deepEqual(s.view.account?.run?.reserved,['rotate','clear']);
 assert.deepEqual(s.view.account?.inventory,{rotate:0,clear:0,wildcard:1});
 assert.ok(isOutboundToolsRun(s.state));assert.deepEqual(s.state.toolCharges,{rotate:1,clear:1,wildcard:0});
});

test('outbound wildcard requires an explicit color and confirmation, cancel and no-op spend nothing',()=>{
 const h=sessionHost({inventory:{rotate:0,clear:0,wildcard:1}}),s=h.session;start(s,'color_exit',['wildcard']);
 const before=playableChecksum(s.state),board=[...s.state.board],piece=s.state.candidates.find(p=>p.shapeId!=='shape.single')??s.state.candidates[0];
 s.action({type:'tool',item:'wildcard'});s.action({type:'toolPiece',pieceId:piece.id});
 assert.equal(s.view.toolSelection?.command,undefined);s.action({type:'toolConfirm'});assert.equal(playableChecksum(s.state),before);
 s.action({type:'toolCargo',cargo:'cargo.machine'});assert.ok(s.view.toolSelection?.preview);assert.equal(playableChecksum(s.state),before);
 s.action({type:'toolCancel'});assert.equal(playableChecksum(s.state),before);assert.deepEqual(s.view.account?.run?.reserved,['wildcard']);
 s.action({type:'tool',item:'wildcard'});s.action({type:'toolPiece',pieceId:piece.id});s.action({type:'toolCargo',cargo:'cargo.machine'});s.action({type:'toolConfirm'});
 assert.ok(isOutboundToolsRun(s.state));const converted=s.state.candidates.find(p=>p.id===piece.id)!;
 assert.equal(converted.shapeId,'shape.single');assert.equal(converted.cargo,'cargo.machine');assert.equal(converted.quarterTurns,0);assert.equal(converted.cellCargos,undefined);
 assert.deepEqual(s.state.board,board);assert.equal(s.state.toolCharges.wildcard,0);assert.deepEqual(s.state.usedToolIds,['wildcard']);assert.deepEqual(s.view.account?.run?.reserved,[]);
 const checksum=playableChecksum(s.state),generation=s.view.account!.generation;s.action({type:'toolConfirm'});assert.equal(playableChecksum(s.state),checksum);assert.equal(s.view.account!.generation,generation);
});

test('outbound rotation previews and cancellation are ephemeral and placement remains manual',()=>{
 const h=sessionHost({inventory:{rotate:1,clear:0,wildcard:0}}),s=h.session;start(s,'color_exit',['rotate']);
 const before=playableChecksum(s.state),board=[...s.state.board],piece=s.state.candidates.find(p=>p.shapeId!=='shape.single'&&p.shapeId!=='shape.square')!;assert.ok(piece);
 s.action({type:'toggleToolbox'});assert.equal(s.view.toolboxOpen,true);s.dispatch({type:'place',...findPlayableMoves(s.state)[0]});assert.equal(playableChecksum(s.state),before);
 s.action({type:'tool',item:'rotate'});s.action({type:'toolPiece',pieceId:piece.id});s.action({type:'toolRotate'});assert.ok(s.view.toolSelection?.preview);assert.equal(playableChecksum(s.state),before);
 s.action({type:'toolConfirm'});assert.ok(isToolRun(s.state));assert.deepEqual(s.state.board,board);assert.deepEqual(s.state.usedToolIds,['rotate']);assert.equal(s.state.toolCharges.rotate,0);
});

test('outbound tool selection cancels on hide and restores unused charges after resume',()=>{
 const h=sessionHost({inventory:{rotate:1,clear:0,wildcard:0}}),s=h.session;start(s,'color_exit',['rotate']);
 s.action({type:'tool',item:'rotate'});const checksum=playableChecksum(s.state);s.hide();assert.equal(s.view.toolSelection,null);
 const resumed=new Session(h.platform,{seed:99,mode:'standard'});resumed.resume();assert.equal(playableChecksum(resumed.state),checksum);assert.ok(isToolRun(resumed.state));assert.equal(resumed.state.toolCharges.rotate,1);
});

import {createRunV12} from '../src/domain/v12/engine.ts';
import {makeAccountRun} from './helpers/account-fixtures.ts';
test('confirmed outbound clear animates the actual newly accessible shipment for one second',()=>{
 const state=createRunV12(1,'easy',{rotate:0,clear:1,wildcard:0});state.runSerial=1;
 for(const cell of [4,13,22,31])state.board[cell]='cargo.food';
 for(let cell=36;cell<=44;cell++)state.board[cell]=cell%2?'cargo.chem':'cargo.machine';
 const run=makeAccountRun({state,identity:{runId:'test.clear-shipment',serial:1,rulesetVersion:12,runConfigId:state.runConfigId,mode:'outbound',difficultyId:'easy',economyVersion:1},history:{seed:state.seed,runConfigId:state.runConfigId,head:null,totalCommands:0,tail:[]},reserved:['clear']});
 const h=sessionHost({run,nextRunSerial:2}),s=h.session;s.resume();
 s.action({type:'tool',item:'clear'});s.action({type:'toolCell',cell:40});assert.equal(s.state.board[40],'cargo.machine');assert.equal(s.view.toolSelection?.preview?.board[4],null);
 s.action({type:'toolConfirm'});assert.equal(s.state.board[4],null);assert.equal(s.state.completedOrders,1);assert.equal(s.view.animation?.shipment.cargo,'cargo.food');assert.equal(s.view.animation?.board[40],null,'cleared blocker must not reappear in animation snapshot');
 h.time(500);s.tick(500);assert.ok(s.view.animation);assert.equal(s.view.animation.progress,.5);
 h.time(1000);s.tick(1000);assert.equal(s.view.animation,null);
});

test('choosing the same outbound single color leaves confirmation disabled and preserves the charge',()=>{
 const state=createRunV12(1,'easy',{rotate:0,clear:0,wildcard:1});state.runSerial=1;state.candidates[0]={id:state.candidates[0].id,shapeId:'shape.single',cargo:'cargo.food',quarterTurns:0};
 const run=makeAccountRun({state,identity:{runId:'test.no-op',serial:1,rulesetVersion:12,runConfigId:state.runConfigId,mode:'outbound',difficultyId:'easy',economyVersion:1},history:{seed:state.seed,runConfigId:state.runConfigId,head:null,totalCommands:0,tail:[]},reserved:['wildcard']});
 const h=sessionHost({run,nextRunSerial:2}),s=h.session;s.resume();const before=playableChecksum(s.state),generation=s.view.account!.generation;
 s.action({type:'tool',item:'wildcard'});s.action({type:'toolPiece',pieceId:state.candidates[0].id});s.action({type:'toolCargo',cargo:'cargo.food'});assert.ok(s.view.toolSelection?.error);s.action({type:'toolConfirm'});
 assert.equal(playableChecksum(s.state),before);assert.equal(s.view.account!.generation,generation);assert.deepEqual(s.view.account!.run!.reserved,['wildcard']);
});
