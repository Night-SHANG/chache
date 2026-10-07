import {legacyTutorial,storeLegacyRun,resumeStoredLegacy,startCurrentRun} from './helpers/legacy-session-fixtures.ts';
import {legacyState} from './helpers/session-fixtures.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import {getUiControls} from '../src/presentation/ui.ts';
import {L} from '../src/presentation/layout.ts';
import {loadPlayableRun,runLifecycleKeysFor} from '../src/application/run-lifecycle.ts';
import {GameSession} from '../src/application/session.ts';
import {createRun,findLegalMoves,applyCommand} from '../src/domain/engine.ts';
import {checksum} from '../src/domain/replay.ts';
import {encodeRun,decodeRun,SAVE_KEYS} from '../src/application/save.ts';
import {PROFILE_KEYS,createProfile,encodeProfile} from '../src/application/profile.ts';
import type {Platform} from '../src/platform/types.ts';
import type {UiAction} from '../src/presentation/ui-types.ts';
const COLOR='warehouse.color_exit.run.v4',ACTIVE='warehouse.active-mode.v1';
function host(initial=new Map<string,string>()){
 let now=0,failKey='',readFail='',readSkips=0,failAfterWrite='';const data=new Map(initial),writes:string[]=[];if(!data.has(SAVE_KEYS.main)){const tutorial=legacyTutorial();tutorial.runSerial=1;storeLegacyRun(data,tutorial);}if(!data.has(COLOR)){const pure=createRun(123,'color_exit',4);pure.runSerial=2;storeLegacyRun(data,pure);}
 const port={storage:{get:(key:string)=>{if(key===readFail){if(readSkips>0)readSkips--;else{readFail='';throw Error('read failure');}}return data.get(key)??null;},set:(key:string,value:string)=>{if(key===failKey)throw Error('quota');data.set(key,value);writes.push(key);if(key===failAfterWrite){failAfterWrite='';readFail=key;}},remove:(key:string)=>{data.delete(key);writes.push(key);}},writerLease:{status:'held',release(){}},now:()=>now,wallTime:()=>Date.parse('2026-10-06T00:00:00Z'),playSound:()=>{},stopSounds:()=>{}} as unknown as Platform;
 return {data,writes,port,time:(value:number)=>{now=value;},fail:(key:string)=>{failKey=key;},failReadOnce:(key:string,afterReads=0)=>{readFail=key;readSkips=afterReads;},failReadbackOnce:(key:string)=>{failAfterWrite=key;}};
}
const action=(s:GameSession,value:unknown)=>s.action(value as UiAction);
function switchTo(s:GameSession,variant:'orders'|'color_exit'){
 action(s,{type:'switchMode',variant});assert.equal(s.view.confirmation?.kind,'switchMode');s.action({type:'confirm'});
}
function color(s:GameSession){switchTo(s,'color_exit');assert.equal(s.state.mode,'color_exit');assert.equal(s.view.screen,'colorIntro');action(s,{type:'introStart'});assert.equal(s.view.screen,'game');}

test('switch confirmation cancel performs no storage writes or state changes',()=>{
 const h=host(),s=resumeStoredLegacy(h.port,{seed:123,mode:'tutorial'});s.hide();
 const raw=JSON.stringify([...h.data]),state=JSON.stringify(s.state),profile=JSON.stringify(s.profile),writes=h.writes.length;
 action(s,{type:'switchMode',variant:'color_exit'});assert.equal(s.view.confirmation?.kind,'switchMode');
 assert.equal(h.writes.length,writes);s.action({type:'cancel'});
 assert.equal(JSON.stringify([...h.data]),raw);assert.equal(JSON.stringify(s.state),state);assert.equal(JSON.stringify(s.profile),profile);
});

test('explicit legacy mode switch preserves separate runs and intro consumes no commands or RNG',()=>{
 const h=host(),s=resumeStoredLegacy(h.port,{seed:123,mode:'tutorial'});
 s.dispatch({type:'place',pieceId:s.state.candidates[0].id,origin:{x:1,y:1}});const old=checksum(legacyState(s));s.hide();const oldRaw=h.data.get(SAVE_KEYS.main);
 switchTo(s,'color_exit');assert.equal(s.state.rulesetVersion,4);assert.equal(s.view.screen,'colorIntro');const fresh=checksum(legacyState(s)),commands=s.state.commandIndex;
 s.dispatch({type:'place',...findLegalMoves(legacyState(s))[0]});assert.equal(s.state.commandIndex,commands);action(s,{type:'introStart'});assert.equal(checksum(legacyState(s)),fresh);
 s.dispatch({type:'place',...findLegalMoves(legacyState(s))[0]});const next=checksum(legacyState(s));assert.notEqual(next,fresh);assert.ok(h.data.has(COLOR));assert.equal(h.data.get(SAVE_KEYS.main),oldRaw);
 switchTo(s,'orders');assert.equal(checksum(legacyState(s)),old);assert.equal(s.state.mode,'tutorial');
 switchTo(s,'color_exit');assert.equal(checksum(legacyState(s)),next);assert.equal(h.data.get(ACTIVE),'color_exit');
 const reloaded=new GameSession(h.port,{seed:9,mode:'tutorial'});assert.equal(reloaded.state.mode,'color_exit');assert.equal(checksum(legacyState(reloaded)),next);assert.equal(reloaded.view.needsResume,true);
});

test('legacy color restart confirms ending and preserves both old slots before a current-game start',()=>{
 const h=host(),s=resumeStoredLegacy(h.port,{seed:7,mode:'tutorial'});color(s);s.dispatch({type:'place',...findLegalMoves(legacyState(s))[0]});s.hide();
 const old=h.data.get(SAVE_KEYS.main),active=h.data.get(COLOR),before=checksum(legacyState(s));s.restart();assert.equal(s.view.confirmation?.kind,'leaveRun');s.action({type:'cancel'});assert.equal(checksum(legacyState(s)),before);assert.equal(h.data.get(COLOR),active);
 s.restart();s.action({type:'confirm'});assert.equal(s.view.screen,'colorTiers');assert.equal(s.state.rulesetVersion,4);assert.equal(h.data.get(COLOR),active);assert.equal(h.data.get(SAVE_KEYS.main),old);
 startCurrentRun(s,'color_exit');assert.equal(s.state.rulesetVersion,12);assert.equal(s.state.commandIndex,0);assert.equal(h.data.get(SAVE_KEYS.main),old);assert.equal(h.data.get(COLOR),active);
});

test('target save or active-pointer failure keeps the current mode and its saved progress',()=>{
 for(const key of [COLOR,ACTIVE]){
  const h=host(),s=resumeStoredLegacy(h.port,{seed:3,mode:'tutorial'});s.hide();const current=checksum(legacyState(s)),saved=h.data.get(SAVE_KEYS.main);
  h.fail(key);action(s,{type:'switchMode',variant:'color_exit'});s.action({type:'confirm'});
  assert.equal(s.state.mode,'tutorial');assert.equal(checksum(legacyState(s)),current);assert.equal(h.data.get(SAVE_KEYS.main),saved);assert.match(s.view.saveStatus,/失败|无法/);
 }
});

test('a corrupt color slot is isolated and can return to intact order mode without overwriting it',()=>{
 const h=host(),s=resumeStoredLegacy(h.port,{seed:8,mode:'tutorial'});s.hide();const order=h.data.get(SAVE_KEYS.main);h.data.set(COLOR,'broken-color-原文');
 switchTo(s,'color_exit');assert.equal(s.view.needsResume,true);assert.ok(s.view.recoveryError);assert.equal(h.data.get(COLOR),'broken-color-原文');assert.equal(h.data.get(SAVE_KEYS.main),order);
 s.action({type:'home'});assert.equal(s.view.screen,'menu');action(s,{type:'switchMode',variant:'orders'});s.action({type:'confirm'});assert.equal(s.state.mode,'tutorial');assert.equal(h.data.get(COLOR),'broken-color-原文');
});

test('new serials consider both saved modes even when the profile counter is behind',()=>{
 const old=createRun(123,'standard',3);old.runSerial=80;const p=createProfile();p.tutorialComplete=true;
 const h=host(new Map([[SAVE_KEYS.main,encodeRun(old)],[PROFILE_KEYS.main,encodeProfile(p)]])),s=resumeStoredLegacy(h.port,{seed:1,mode:'tutorial'});startCurrentRun(s,'color_exit');assert.ok((s.view.account?.run?.identity.serial??0)>80);assert.equal(s.view.account?.migration.legacySerialCeiling,80);assert.equal(s.view.account?.wallet,0);
});

test('corrupt mode recovery exposes a real pointer route back to mode selection',()=>{
 const h=host(),s=resumeStoredLegacy(h.port,{seed:4,mode:'tutorial'});s.hide();h.data.set(COLOR,'broken-color');switchTo(s,'color_exit');
 s.input.down({x:540,y:1460});s.input.up({x:540,y:1460});
 assert.equal(s.view.screen,'menu');assert.equal(s.view.needsResume,false);assert.equal(h.data.get(COLOR),'broken-color');
});

test('failed mode-pointer write never overwrites an existing target order save',()=>{
 const h=host(),s=resumeStoredLegacy(h.port,{seed:5,mode:'tutorial'});color(s);s.hide();const order=h.data.get(SAVE_KEYS.main),colorRaw=h.data.get(COLOR),pointer=h.data.get(ACTIVE);
 h.fail(ACTIVE);switchTo(s,'orders');
 assert.equal(s.state.mode,'color_exit');assert.equal(h.data.get(SAVE_KEYS.main),order);assert.equal(h.data.get(COLOR),colorRaw);assert.equal(h.data.get(ACTIVE),pointer);
});

 test('switching to a backup requires explicit recovery before accepting placements',()=>{
  const c=createRun(21,'color_exit',4);c.runSerial=50;const h=host(),s=resumeStoredLegacy(h.port,{seed:3,mode:'tutorial'});s.hide();h.data.set(COLOR,'broken-main');h.data.set('warehouse.color_exit.run.backup.v4',encodeRun(c));
  switchTo(s,'color_exit');assert.equal(s.view.needsResume,true);const before=checksum(legacyState(s));s.dispatch({type:'place',...findLegalMoves(legacyState(s))[0]});assert.equal(checksum(legacyState(s)),before);
  s.resume();assert.equal(s.view.needsResume,false);s.dispatch({type:'place',...findLegalMoves(legacyState(s))[0]});assert.equal(s.view.saveStatus,'已保存');assert.ok([...h.data.values()].includes('broken-main'));
 });
 // Immediate daily start reads the old slot once for the menu and twice for preparation before the account transaction.
 test('unavailable target read cannot silently bypass new-run confirmation',()=>{
  const h=host(),s=resumeStoredLegacy(h.port,{seed:1,mode:'tutorial'});color(s);s.hide();const before=JSON.stringify([...h.data]),order=h.data.get(SAVE_KEYS.main),oldColor=h.data.get(COLOR);h.failReadOnce(SAVE_KEYS.main);s.action({type:'newRun',mode:'daily'});
  assert.equal(s.view.confirmation?.kind,'newRun');assert.equal(s.state.mode,'color_exit');assert.equal(JSON.stringify([...h.data]),before);s.action({type:'cancel'});assert.equal(JSON.stringify([...h.data]),before);s.action({type:'newRun',mode:'daily'});assert.equal(s.view.confirmation?.kind,'newRun');h.failReadOnce(SAVE_KEYS.main,3);s.action({type:'confirm'});assert.equal(s.view.accountBlocked,true);assert.equal(s.view.account,null);assert.equal(h.data.get(SAVE_KEYS.main),order);assert.equal(h.data.get(COLOR),oldColor);
 });
 test('profile reset stops on unreadable inactive progress without touching either store',()=>{
  const h=host(),s=resumeStoredLegacy(h.port,{seed:1,mode:'tutorial'});color(s);s.action({type:'settings'});const before=JSON.stringify([...h.data]);h.failReadOnce(SAVE_KEYS.main);s.action({type:'resetProfile'});s.action({type:'confirm'});
  assert.equal(JSON.stringify([...h.data]),before);assert.match(s.view.saveStatus,/无法|未重置|原文已保留|未确认/);assert.equal(s.view.accountBlocked,true);s.action({type:'retrySave'});assert.equal(s.view.accountBlocked,false);assert.equal(s.profile.stats.runs,0);
 });
 test('active mode selector readback failure rolls back the selector and preserves both runs',()=>{
  const h=host(),s=resumeStoredLegacy(h.port,{seed:4,mode:'tutorial'});color(s);switchTo(s,'orders');const before=h.data.get(ACTIVE);assert.ok(before);h.failReadbackOnce(ACTIVE);action(s,{type:'switchMode',variant:'color_exit'});s.action({type:'confirm'});
  assert.equal(s.state.mode,'tutorial');assert.equal(h.data.get(ACTIVE),before);assert.match(s.view.saveStatus,/失败/);
 });

function legacyTerminal(){let state=createRun(30,'standard',1);for(let n=0;n<300&&state.phase!=='result';n++)state=applyCommand(state,state.phase==='upgrade'?{type:'upgrade',upgradeId:state.upgradeChoices[0]}:{type:'place',...findLegalMoves(state)[0]}).state;assert.equal(state.phase,'result');assert.equal(state.runSerial,undefined);return state;}
 test('switching to legacy terminal persists its allocated serial before credit and reboot',()=>{
  const old=legacyTerminal(),c=createRun(21,'color_exit',4);c.runSerial=70;const p=createProfile();p.tutorialComplete=true;p.nextRunSerial=100;
  const h=host(new Map([[SAVE_KEYS.main,encodeRun(old)],[COLOR,encodeRun(c)],[ACTIVE,'color_exit'],[PROFILE_KEYS.main,encodeProfile(p)]])),s=resumeStoredLegacy(h.port,{seed:1,mode:'standard'});s.resume();switchTo(s,'orders');
  assert.equal(s.profile.stats.runs,1);assert.equal(s.view.account?.wallet,0);assert.equal(decodeRun(h.data.get(SAVE_KEYS.main)!).runSerial,s.state.runSerial);
  const again=new GameSession(h.port,{seed:1,mode:'standard'});assert.equal(again.profile.stats.runs,1);
 });
 test('reset refuses an inactive legacy terminal without stable identity until it is opened',()=>{
  const old=legacyTerminal(),h=host(),s=resumeStoredLegacy(h.port,{seed:1,mode:'tutorial'});color(s);h.data.set(SAVE_KEYS.main,encodeRun(old));s.action({type:'settings'});const before=JSON.stringify([...h.data]);
  s.action({type:'resetProfile'});s.action({type:'confirm'});assert.equal(JSON.stringify([...h.data]),before);assert.match(s.view.saveStatus,/旧结算/);
 });
 test('serial allocation fails closed when the inactive slot cannot be read',()=>{
  const h=host(),s=resumeStoredLegacy(h.port,{seed:4,mode:'tutorial'});color(s);s.hide();const before=h.data.get(COLOR),order=h.data.get(SAVE_KEYS.main),serial=s.profile.nextRunSerial;
  s.action({type:'newRun',mode:'color_exit'});const read=h.port.storage.get.bind(h.port.storage);h.port.storage.get=key=>{if(key===SAVE_KEYS.main)throw Error('inactive slot unavailable');return read(key);};s.action({type:'confirm'});if(s.view.screen==='guideOffer')s.action({type:'directStart'});
  assert.equal(h.data.get(COLOR),before);assert.equal(h.data.get(SAVE_KEYS.main),order);assert.equal(s.profile.nextRunSerial,serial);assert.equal(s.view.account,null);assert.equal(h.data.has('warehouse.account.s1.a'),false);assert.equal(h.data.has('warehouse.account.s1.b'),false);assert.match(s.view.saveStatus,/无法|原文已保留|未确认/);
 });

test('backup recovery exits through real confirmation taps and closes only the selected run',()=>{
 const c=createRun(21,'color_exit',4);c.runSerial=50;const h=host(),s=resumeStoredLegacy(h.port,{seed:3,mode:'tutorial'});
 h.data.set(COLOR,'broken-main');h.data.set('warehouse.color_exit.run.backup.v4',encodeRun(c));h.data.set('warehouse.color_exit.late.run.v5','untouched-other-bad-main');switchTo(s,'color_exit');
 const order=h.data.get(SAVE_KEYS.main),backup=h.data.get('warehouse.color_exit.run.backup.v4'),before=JSON.stringify([...h.data]),profile=JSON.stringify(s.profile),state=checksum(legacyState(s)),writes=h.writes.length;
 const tap=(rect:{x:number;y:number;w:number;h:number})=>{const point={x:rect.x+rect.w/2,y:rect.y+rect.h/2};s.input.down(point);s.input.up(point);};
 const tapAction=(type:UiAction['type'])=>{const control=getUiControls(s.state,s.view).find(control=>control.action.type===type);assert.ok(control,`missing ${type} control`);tap(control.rect);};
 tap(L.recoveryMenu);assert.equal(s.view.confirmation?.kind,'leaveRun');assert.equal(JSON.stringify([...h.data]),before);tapAction('cancel');
 assert.equal(h.writes.length,writes);assert.equal(checksum(legacyState(s)),state);assert.equal(s.view.needsResume,true);assert.equal(JSON.stringify(s.profile),profile);
 tap(L.recoveryMenu);tapAction('confirm');assert.equal(s.view.screen,'menu');assert.equal(s.view.needsResume,false);assert.equal(s.view.canContinue,false);
 assert.equal(h.data.get(COLOR),'broken-main');assert.equal(h.data.get('warehouse.color_exit.run.backup.v4'),backup);assert.equal(h.data.get(SAVE_KEYS.main),order);assert.equal(h.data.get('warehouse.color_exit.late.run.v5'),'untouched-other-bad-main');
 assert.equal(loadPlayableRun(h.port.storage,'color_exit').closed,true);assert.equal(loadPlayableRun(h.port.storage,'orders').closed,undefined);assert.equal(h.data.has(runLifecycleKeysFor('orders').main),false);assert.equal(h.data.has(runLifecycleKeysFor('color_exit_late').main),false);
 const reload=new GameSession(h.port,{seed:99,mode:'standard'});assert.equal(reload.view.screen,'menu');assert.equal(reload.view.needsResume,false);assert.equal(reload.view.canContinue,false);
 tapAction('chooseInbound');assert.equal(s.view.screen,'inboundMenu');
 const standard=getUiControls(s.state,s.view).find(control=>control.action.type==='newRun'&&control.action.mode==='standard');assert.ok(standard);tap(standard.rect);assert.equal(s.view.screen,'inboundMenu');assert.equal(s.view.account,null);assert.match(s.view.saveStatus,/旧记录无法完整验证/);
 assert.equal(h.data.get(SAVE_KEYS.main),order);assert.equal(h.data.get(COLOR),'broken-main');assert.equal(h.data.get('warehouse.color_exit.late.run.v5'),'untouched-other-bad-main');
});

test('closing a newer account run preserves legacy serials and reserves unassigned inactive slots',()=>{
 const old=legacyTutorial(123),pure=createRun(21,'color_exit',4);pure.runSerial=80;
 const h=host(new Map([[SAVE_KEYS.main,encodeRun(old)],[COLOR,encodeRun(pure)],[ACTIVE,'color_exit']])),s=resumeStoredLegacy(h.port,{seed:1,mode:'standard'});s.action({type:'toggleSound'});
 const reserved=s.view.account!.migration.legacySerials.orders!;assert.ok(reserved>80);assert.equal(s.view.account!.migration.legacySerialCeiling,reserved);const oldRaw=h.data.get(SAVE_KEYS.main);
 startCurrentRun(s,'color_exit');const modern=s.view.account!.run!.identity.serial;assert.ok(modern>reserved);s.action({type:'home'});s.action({type:'confirm'});assert.equal(s.view.account!.closedThroughSerial,modern);assert.equal(h.data.get(SAVE_KEYS.main),oldRaw);
 const reload=new GameSession(h.port,{seed:1,mode:'standard'});switchTo(reload,'orders');assert.equal(legacyState(reload).runSerial,reserved);assert.equal(decodeRun(h.data.get(SAVE_KEYS.main)!).runSerial,reserved);assert.deepEqual(reload.state.board,old.board);assert.equal(reload.state.rulesetVersion,3);
 reload.dispatch({type:'place',pieceId:reload.state.candidates[0].id,origin:{x:1,y:1}});assert.equal(reload.state.commandIndex,1);assert.equal(reload.view.account!.wallet,0);const again=new GameSession(h.port,{seed:9,mode:'standard'});assert.equal(again.view.needsResume,true);assert.equal(legacyState(again).runSerial,reserved);again.resume();assert.equal(again.state.commandIndex,1);
});
