import test from 'node:test';
import assert from 'node:assert/strict';
import {GameSession} from '../src/application/session.ts';
import {checksum} from '../src/domain/replay.ts';
import {createRun} from '../src/domain/engine.ts';
import {encodeRun,SAVE_KEYS} from '../src/application/save.ts';
import type {Platform} from '../src/platform/types.ts';
import {L,getTrayRects} from '../src/presentation/layout.ts';
function harness(){const data=new Map<string,string>(),sounds:{name:string;time:number}[]=[];let now=0,stops=0;const port={storage:{get:(k:string)=>data.get(k)??null,set:(k:string,v:string)=>{data.set(k,v);},remove:(k:string)=>{data.delete(k);}},now:()=>now,playSound:(name:string)=>{sounds.push({name,time:now});},stopSounds:()=>{stops++;}} as unknown as Platform;return{data,sounds,port,time:(n:number)=>{now=n;},stops:()=>stops};}
const center=(r:{x:number;y:number;w:number;h:number})=>({x:r.x+r.w/2,y:r.y+r.h/2});
const board=(x:number,y:number)=>({x:L.board.x+(x+.5)*L.board.cell,y:L.board.y+(y+.5)*L.board.cell});
function firstTwo(s:GameSession){s.dispatch({type:'place',pieceId:s.state.candidates[0].id,origin:{x:1,y:1}});s.dispatch({type:'place',pieceId:s.state.candidates[0].id,origin:{x:3,y:1}});}
test('pick and route-ready feedback is debounced while repeated preview never changes the run',()=>{
 const h=harness(),s=new GameSession(h.port,{seed:123,mode:'tutorial'});const p=center(getTrayRects(1)[0]);s.input.down(p);s.input.up(board(1,1));const before=checksum(s.state);s.input.down(p);s.input.move(board(3,1));s.input.move(board(3,1));assert.equal(checksum(s.state),before);assert.deepEqual(h.sounds.map(x=>x.name),['pick','place','pick','route_ready']);s.input.up(board(3,1));assert.equal(h.sounds.filter(x=>x.name==='route_ready').length,1);
});
test('invalid drop uses bounce and sound but cancel never emits an invalid cue or command',()=>{
 const h=harness(),s=new GameSession(h.port,{seed:123,mode:'tutorial'}),p=center(getTrayRects(1)[0]);s.input.down(p);s.input.move(board(0,0));s.input.up(board(0,0));assert.equal(s.state.commandIndex,0);assert.equal(s.view.invalidFx?.pieceId,s.state.candidates[0].id);assert.ok(h.sounds.some(x=>x.name==='invalid'));const count=h.sounds.length;s.input.down(p);s.input.move(board(1,1));s.input.cancel();s.input.up(board(1,1));assert.equal(h.sounds.length,count+1);assert.equal(s.state.commandIndex,0);
});
test('shipment cues use route move delivery phases once and presentation clock never changes checksum',()=>{
 const h=harness(),s=new GameSession(h.port,{seed:123,mode:'tutorial'});firstTwo(s);const saved=checksum(s.state);assert.ok(s.view.placementFx);assert.equal(s.view.animation?.progress,0);h.time(100);s.tick(100);assert.equal(s.view.placementFx,null);assert.equal(h.sounds.filter(x=>x.name==='forklift').length,0);h.time(140);s.tick(140);h.time(300);s.tick(300);assert.equal(h.sounds.filter(x=>x.name==='forklift').length,1);h.time(490);s.tick(490);s.tick(490);assert.equal(h.sounds.filter(x=>x.name==='ship').length,1);h.time(650);s.tick(650);assert.equal(s.view.animation,null);assert.equal(checksum(s.state),saved);
});
test('chain delivery selects a capped higher cue and hide discards pending replay audio',()=>{
 const h=harness(),s=new GameSession(h.port,{seed:123,mode:'tutorial'});firstTwo(s);h.time(700);s.tick(700);s.dispatch({type:'place',pieceId:s.state.candidates[0].id,origin:{x:3,y:4}});const before=checksum(s.state);h.time(1400);s.tick(1400);h.time(1900);s.tick(1900);assert.equal(h.sounds.filter(x=>x.name==='chain2').length,1);s.hide();const sounds=h.sounds.length;h.time(10000);s.show();s.tick(10000);assert.equal(h.sounds.length,sounds);assert.equal(checksum(s.state),before);assert.equal(s.view.placementFx,null);
});
test('reduced motion retains delivery feedback with no forklift stage and finishes in 80ms',()=>{
 const h=harness(),s=new GameSession(h.port,{seed:123,mode:'tutorial'});s.action({type:'toggleMotion'});firstTwo(s);assert.equal(s.view.placementFx,null);h.time(79);s.tick(79);assert.ok(s.view.animation);h.time(80);s.tick(80);assert.equal(s.view.animation,null);assert.equal(h.sounds.filter(x=>x.name==='forklift').length,0);assert.equal(h.sounds.filter(x=>x.name==='ship').length,1);
});
test('mute stops currently playing sounds and suppresses subsequent input and dispatch cues',()=>{
 const h=harness(),s=new GameSession(h.port,{seed:123,mode:'tutorial'});s.action({type:'toggleSound'});assert.equal(h.stops(),1);firstTwo(s);h.time(700);s.tick(700);assert.deepEqual(h.sounds,[]);
});
test('new failure briefly presents a neutral bounce before result and never repeats on restore',()=>{
 const h=harness(),state=createRun(2,'standard',3);state.board.fill('cargo.food');state.board[0]=null;state.candidates.forEach(p=>{p.shapeId='shape.single';p.cargo='cargo.machine';});state.orders.forEach(o=>{o.cargo=o.dockId==='dock.north'?'cargo.cold':'cargo.chem';});h.data.set(SAVE_KEYS.main,encodeRun(state));const s=new GameSession(h.port,{seed:2,mode:'standard'});s.resume();s.dispatch({type:'place',pieceId:s.state.candidates[0].id,origin:{x:0,y:0}});assert.equal(s.state.result,'failed');assert.equal(s.view.noticeFx?.kind,'fail');assert.equal(h.sounds.filter(x=>x.name==='fail').length,1);h.time(180);s.tick(180);assert.equal(s.view.noticeFx,null);const again=new GameSession(h.port,{seed:2,mode:'standard'});assert.equal(again.view.noticeFx,undefined);assert.equal(h.sounds.filter(x=>x.name==='fail').length,1);
});
test('background interrupt during forklift movement stops audio and drops remaining delivery cues',()=>{
 const h=harness(),s=new GameSession(h.port,{seed:123,mode:'tutorial'});firstTwo(s);h.time(160);s.tick(160);assert.ok(h.sounds.some(x=>x.name==='forklift'));const before=checksum(s.state);s.hide();const count=h.sounds.length;assert.ok(h.stops()>0);h.time(10000);s.show();s.resume();s.tick(10000);assert.equal(h.sounds.length,count);assert.equal(checksum(s.state),before);assert.equal(s.view.animation,null);assert.equal(s.view.noticeFx,null);
});
test('shift feedback is deferred until the shipment ends and never repeats on further ticks',()=>{
 const h=harness(),state=createRun(1,'standard',3);state.completedOrders=5;state.candidates[0].shapeId='shape.single';state.candidates[0].cargo='cargo.food';state.board[8]='cargo.food';state.board[9]='cargo.food';state.orders[0].cargo='cargo.food';state.orders[0].amount=3;state.orders[1].cargo='cargo.machine';h.data.set(SAVE_KEYS.main,encodeRun(state));const s=new GameSession(h.port,{seed:1,mode:'standard'});s.resume();s.dispatch({type:'place',pieceId:s.state.candidates[0].id,origin:{x:3,y:1}});assert.equal(s.state.shift,2);assert.equal(h.sounds.filter(x=>x.name==='shift').length,0);h.time(650);s.tick(650);assert.equal(s.view.noticeFx?.kind,'shift');assert.equal(h.sounds.filter(x=>x.name==='shift').length,1);h.time(3000);s.tick(3000);assert.equal(s.view.noticeFx,null);assert.equal(h.sounds.filter(x=>x.name==='shift').length,1);
});
