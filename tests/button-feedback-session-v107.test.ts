import test from 'node:test';
import assert from 'node:assert/strict';
import {sessionHost,startInbound} from './helpers/session-fixtures.ts';
import {getUiControls} from '../src/presentation/ui.ts';
import {L} from '../src/presentation/layout.ts';
import type {UiAction} from '../src/presentation/ui-types.ts';
function fixture(){const h=sessionHost();let haptics=0;h.platform.vibrate=()=>{haptics++;};return {...h,haptics:()=>haptics};}
function click(h:ReturnType<typeof fixture>,type:UiAction['type']){const c=getUiControls(h.session.state,h.session.view).find(c=>c.action.type===type&&!c.disabled);assert.ok(c,type);const p={x:c.rect.x+c.rect.w/2,y:c.rect.y+c.rect.h/2};h.session.input.down(p);h.session.input.up(p);}
test('valid button at initial time zero emits one UI click after stopSounds, double up does not replay',()=>{
 const h=fixture(),order:string[]=[];h.platform.playSound=n=>{order.push(n);};h.platform.stopSounds=()=>{order.push('stop');};click(h,'settings');assert.equal(order[order.length-1],'ui_click');assert.equal(order.filter(x=>x==='ui_click').length,1);assert.ok(order.indexOf('stop')<order.indexOf('ui_click'));h.session.input.up({x:1,y:1});assert.equal(order.filter(x=>x==='ui_click').length,1);assert.equal(h.haptics(),0);
});
test('turning sound off and back on is silent for that gesture, subsequent normal click sounds',()=>{
 const h=fixture();h.session.action({type:'settings'});click(h,'toggleSound');assert.equal(h.session.profile.settings.sound,false);assert.deepEqual(h.sounds,[]);h.time(200);click(h,'toggleSound');assert.equal(h.session.profile.settings.sound,true);assert.deepEqual(h.sounds,[]);h.time(400);click(h,'back');assert.deepEqual(h.sounds,['ui_click']);
});
test('vibration toggle persists and is never itself a vibration, major start obeys it',()=>{
 const h=fixture();h.session.action({type:'settings'});click(h,'toggleVibration');assert.equal(h.session.profile.settings.vibration,false);assert.equal(h.haptics(),0);h.time(200);click(h,'back');h.time(400);click(h,'chooseInbound');h.time(600);click(h,'newRun');assert.equal(h.haptics(),0);assert.equal(h.session.view.account?.profile.settings.vibration,false);
});
test('default major starts vibrate while ordinary navigation does not; cancel stays silent',()=>{
 const h=fixture();click(h,'chooseInbound');assert.equal(h.haptics(),0);h.time(200);click(h,'newRun');assert.equal(h.haptics(),1);
 const c=getUiControls(h.session.state,h.session.view).find(c=>!c.disabled)!;h.session.input.down({x:c.rect.x+10,y:c.rect.y+10});h.session.input.cancel();const n=h.sounds.length;h.session.input.up({x:c.rect.x+10,y:c.rect.y+10});assert.equal(h.sounds.length,n);assert.equal(h.haptics(),1);
});
test('ordinary fast taps are audio rate limited without dropping actions',()=>{
 const h=fixture();click(h,'settings');h.time(10);click(h,'back');assert.equal(h.session.view.screen,'menu');assert.equal(h.sounds.filter(x=>x==='ui_click').length,1);h.time(70);click(h,'settings');assert.equal(h.sounds.filter(x=>x==='ui_click').length,2);
});
test('pause icon retains audible click after gameplay feedback is cleared',()=>{
 const h=fixture();startInbound(h.session);h.sounds.length=0;h.time(100);const p={x:L.pause.x+L.pause.w/2,y:L.pause.y+L.pause.h/2};h.session.input.down(p);h.session.input.up(p);assert.equal(h.session.view.paused,true);assert.deepEqual(h.sounds,['ui_click']);assert.equal(h.haptics(),0);
});
