import test from 'node:test';
import assert from 'node:assert/strict';
import {GameSession} from '../src/application/session.ts';
import {createRun,findLegalMoves} from '../src/domain/engine.ts';
import {checksum} from '../src/domain/replay.ts';
import {encodeRun,SAVE_KEYS,COLOR_EXIT_SAVE_KEYS} from '../src/application/save.ts';
import type {Platform} from '../src/platform/types.ts';
import type {UiAction} from '../src/presentation/ui-types.ts';
const slot=(tier:string)=>`color_exit_${tier}`;
const key=(tier:string)=>`warehouse.color_exit.${tier}.run.v5`;
function host(){const data=new Map<string,string>(),writes:string[]=[];let failure='',readFailure='';const port={storage:{get:(k:string)=>{if(k===readFailure){readFailure='';throw Error('unavailable');}return data.get(k)??null;},set:(k:string,v:string)=>{if(k===failure)throw Error('quota');data.set(k,v);writes.push(k);},remove:(k:string)=>{data.delete(k);writes.push(k);}},now:()=>0,wallTime:()=>Date.parse('2026-10-06'),playSound:()=>{},stopSounds:()=>{}} as unknown as Platform;return{data,writes,port,fail:(k:string)=>{failure=k;},failReadOnce:(k:string)=>{readFailure=k;}};}
const action=(s:GameSession,a:unknown)=>s.action(a as UiAction);
function choose(s:GameSession,tier:string){s.action({type:'home'});action(s,{type:'switchMode',variant:slot(tier)});assert.equal(s.view.confirmation?.kind,'switchMode');s.action({type:'confirm'});assert.equal(s.state.rulesetVersion,5);assert.equal((s.state as unknown as {colorTier:string}).colorTier,tier);action(s,{type:'introStart'});}

test('opening the tier selector changes no run profile or stored bytes',()=>{
 const h=host(),s=new GameSession(h.port,{seed:123,mode:'tutorial'});s.action({type:'home'});const data=JSON.stringify([...h.data]),run=JSON.stringify(s.state);action(s,{type:'chooseColorTier'});
 assert.equal(s.view.screen,'colorTiers');assert.equal(JSON.stringify([...h.data]),data);assert.equal(JSON.stringify(s.state),run);
});
test('all three new tiers use one comparison seed and preserve independent progress plus the order slot',()=>{
 const h=host(),s=new GameSession(h.port,{seed:123,mode:'tutorial'});const original=checksum(s.state),seen=new Map<string,string>();
 for(const tier of ['entry','middle','late']){choose(s,tier);assert.equal(s.state.seed,123);s.dispatch({type:'place',...findLegalMoves(s.state)[0]});seen.set(tier,checksum(s.state));assert.ok(h.data.has(key(tier)));}
 for(const tier of ['entry','middle','late']){choose(s,tier);assert.equal(checksum(s.state),seen.get(tier));}
 s.action({type:'home'});action(s,{type:'switchMode',variant:'orders'});s.action({type:'confirm'});assert.equal(checksum(s.state),original);
 assert.ok(h.data.has(SAVE_KEYS.main));assert.equal(h.data.has(COLOR_EXIT_SAVE_KEYS.main),false);
});
test('switch cancellation and seed preference change never rewrite existing tier runs',()=>{
 const h=host(),s=new GameSession(h.port,{seed:77,mode:'tutorial'});choose(s,'entry');s.action({type:'home'});const old=h.data.get(key('entry')),index=s.state.commandIndex;
 action(s,{type:'switchMode',variant:slot('middle')});s.action({type:'cancel'});assert.equal(h.data.has(key('middle')),false);assert.equal(s.state.commandIndex,index);
 action(s,{type:'chooseColorTier'});action(s,{type:'comparisonSeedNext'});assert.equal(h.data.get(key('entry')),old);assert.equal(s.state.seed,77);
 action(s,{type:'newRun',mode:'color_exit',colorTier:'entry'});assert.equal(s.view.confirmation?.kind,'newRun');s.action({type:'cancel'});assert.equal(h.data.get(key('entry')),old);
 action(s,{type:'newRun',mode:'color_exit',colorTier:'entry'});s.action({type:'confirm'});assert.equal(s.state.seed,78);assert.equal(s.state.commandIndex,0);assert.equal((s.state as unknown as {colorTier:string}).colorTier,'entry');
});
test('a remembered mixed tier restores its own rules identity rather than converting to pure v4',()=>{
 const h=host(),s=new GameSession(h.port,{seed:9,mode:'tutorial'});choose(s,'late');s.dispatch({type:'place',...findLegalMoves(s.state)[0]});const saved=checksum(s.state);
 const reload=new GameSession(h.port,{seed:88,mode:'standard'});assert.equal(reload.state.rulesetVersion,5);assert.equal((reload.state as unknown as {colorTier:string}).colorTier,'late');assert.equal(checksum(reload.state),saved);assert.equal(reload.view.needsResume,true);
});
test('legacy pure v4 remains independently resumable after opening the tier picker',()=>{
 const h=host(),pure=createRun(34,'color_exit',4);pure.runSerial=40;h.data.set(COLOR_EXIT_SAVE_KEYS.main,encodeRun(pure));h.data.set('warehouse.active-mode.v1','color_exit');
 const s=new GameSession(h.port,{seed:123,mode:'tutorial'});s.resume();const before=checksum(s.state);s.action({type:'home'});action(s,{type:'chooseColorTier'});action(s,{type:'switchMode',variant:'color_exit'});s.action({type:'confirm'});assert.equal(s.state.rulesetVersion,4);assert.equal(checksum(s.state),before);
});
test('failed tier target write keeps the previous run and active selector',()=>{
 const h=host(),s=new GameSession(h.port,{seed:5,mode:'tutorial'});choose(s,'entry');s.action({type:'home'});const before=checksum(s.state),pointer=h.data.get('warehouse.active-mode.v1');h.fail(key('middle'));
 action(s,{type:'switchMode',variant:slot('middle')});s.action({type:'confirm'});assert.equal(checksum(s.state),before);assert.equal(h.data.get('warehouse.active-mode.v1'),pointer);assert.match(s.view.saveStatus,/失败/);
});

test('partial shipment animation retains the secondary color before and after lifecycle cancellation',()=>{
 const h=host(),state=createRun(31,'color_exit',5,'middle');state.runSerial=8;state.board.fill(null);state.board[3]='cargo.food';state.board[4]='cargo.food';
 state.candidates=[{id:'piece.100',shapeId:'shape.square',cargo:'cargo.food',cellCargos:['cargo.food','cargo.food','cargo.chem','cargo.chem']},...state.candidates.slice(1)];state.nextId=101;state.generatedPieces=100;
 h.data.set(key('middle'),encodeRun(state));h.data.set('warehouse.active-mode.v1',slot('middle'));
 const s=new GameSession(h.port,{seed:31,mode:'standard'});s.resume();s.dispatch({type:'place',pieceId:'piece.100',origin:{x:3,y:1}});
 assert.ok(s.view.animation);assert.equal(s.view.animation.board[10],'cargo.food');assert.equal(s.view.animation.board[17],'cargo.chem');assert.equal(s.view.animation.board[18],'cargo.chem');
 assert.equal(s.state.board[10],null);assert.equal(s.state.board[17],'cargo.chem');const stable=checksum(s.state);s.hide();s.show();assert.equal(s.view.animation,null);assert.equal(checksum(s.state),stable);
 const reload=new GameSession(h.port,{seed:1,mode:'standard'});assert.equal(checksum(reload.state),stable);assert.equal(reload.state.board[17],'cargo.chem');
});
test('every tier restart retains its tier and comparison seed while protecting its current run',()=>{
 for(const tier of ['entry','middle','late']){const h=host(),s=new GameSession(h.port,{seed:19,mode:'tutorial'});choose(s,tier);const before=checksum(s.state);s.restart();assert.equal(s.view.confirmation?.colorTier,tier);s.action({type:'cancel'});assert.equal(checksum(s.state),before);s.restart();s.action({type:'confirm'});assert.equal(s.state.colorTier,tier);assert.equal(s.state.seed,19);assert.equal(s.state.rulesetVersion,5);}
});
test('a corrupt mixed slot keeps the right placeholder identity and returns without overwriting raw input',()=>{
 const h=host(),s=new GameSession(h.port,{seed:9,mode:'tutorial'});h.data.set(key('late'),'bad-late');s.action({type:'home'});action(s,{type:'switchMode',variant:slot('late')});s.action({type:'confirm'});
 assert.equal(s.state.rulesetVersion,5);assert.equal(s.state.colorTier,'late');assert.equal(s.view.needsResume,true);assert.equal(h.data.get(key('late')),'bad-late');s.action({type:'home'});action(s,{type:'switchMode',variant:'orders'});s.action({type:'confirm'});assert.equal(h.data.get(key('late')),'bad-late');
});
test('comparison seed write failure leaves preference and all runs unchanged',()=>{
 const h=host(),s=new GameSession(h.port,{seed:99,mode:'tutorial'});choose(s,'middle');s.action({type:'home'});const before=JSON.stringify([...h.data]);h.fail('warehouse.color_exit.compare_seed.v1');action(s,{type:'comparisonSeedNext'});assert.equal(s.view.comparisonSeed,99);assert.equal(JSON.stringify([...h.data]),before);assert.match(s.view.saveStatus,/失败/);
});
test('profile reset uses the active unsaved terminal boundary and never credits its pre-reset finish later',()=>{
 const h=host(),state=createRun(31,'color_exit',5,'entry');state.runSerial=2;state.completedOrders=29;state.shift=5;state.board.fill(null);for(const cell of [3,4,10])state.board[cell]='cargo.food';state.candidates[0]={id:'piece.1',shapeId:'shape.single',cargo:'cargo.food'};
 h.data.set(key('entry'),encodeRun(state));h.data.set('warehouse.active-mode.v1',slot('entry'));const s=new GameSession(h.port,{seed:31,mode:'standard'});s.resume();h.fail(key('entry'));s.dispatch({type:'place',pieceId:'piece.1',origin:{x:4,y:1}});assert.equal(s.state.phase,'result');s.action({type:'resetProfile'});s.action({type:'confirm'});assert.equal(s.profile.colorComparisons?.entry?.resetCursor?.commandIndex,1);h.fail('');s.hide();assert.equal(s.profile.colorComparisons?.entry?.stats.runs??0,0);
});

test('same-tier new run protects a saved run recovered after a transient startup read failure',()=>{
 const h=host(),saved=createRun(99,'color_exit',5,'late');saved.runSerial=83;h.data.set(key('late'),encodeRun(saved));h.data.set('warehouse.active-mode.v1',slot('late'));h.failReadOnce(key('late'));
 const s=new GameSession(h.port,{seed:1,mode:'standard'});assert.equal(s.view.needsResume,true);const raw=h.data.get(key('late'));action(s,{type:'newRun',mode:'color_exit',colorTier:'late'});assert.equal(s.view.confirmation?.kind,'newRun');s.action({type:'cancel'});assert.equal(h.data.get(key('late')),raw);
});
