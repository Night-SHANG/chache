import assert from 'node:assert/strict';
import test from 'node:test';
import {handleAndroidBack} from '../src/platform/android-back.ts';
import {sessionHost,startInbound} from './helpers/session-fixtures.ts';

const unchanged=(h:ReturnType<typeof sessionHost>)=>({wallet:h.session.view.account?.wallet,inventory:h.session.view.account?.inventory,run:h.session.view.account?.run?.identity.runId,command:h.session.state.commandIndex});
test('Android back cancels the top purchase confirmation without spending or settling',()=>{
 const h=sessionHost({wallet:160}),s=h.session;s.action({type:'shop'});s.action({type:'purchase',item:'rotate'});assert.ok(s.view.confirmation);
 const before=[...h.data],snapshot=unchanged(h);assert.equal(handleAndroidBack(s),'handled');assert.equal(s.view.confirmation,null);assert.deepEqual([...h.data],before);assert.deepEqual(unchanged(h),snapshot);assert.equal(s.view.screen,'shop');
});
test('Android back dismisses tool selection and toolbox ahead of the running game',()=>{
 for(const selection of [false,true]){const h=sessionHost(),s=h.session;startInbound(s);s.view.toolboxOpen=!selection;s.view.toolSelection=selection?{item:'rotate',pieceId:null,cells:[],quarterTurns:0}:null;
 const before=[...h.data];assert.equal(handleAndroidBack(s),'handled');assert.equal(s.view.toolSelection,null);assert.equal(s.view.toolboxOpen,false);assert.equal(s.view.paused,false);assert.deepEqual([...h.data],before);}
});
test('Android back cancels supply selection before pause',()=>{
 const h=sessionHost(),s=h.session;startInbound(s);s.view.supplyUpgrade='cargo_supply';const before=[...h.data];assert.equal(handleAndroidBack(s),'handled');assert.equal(s.view.supplyUpgrade,null);assert.equal(s.view.paused,false);assert.deepEqual([...h.data],before);
});
test('Android back leaves inline cosmetic previews without a removed set navigation layer',()=>{
 const h=sessionHost(),s=h.session;s.action({type:'shop'});s.action({type:'selectShopTab',tab:'cosmetics'});s.action({type:'previewCosmetic',kind:'theme',id:'cold_chain'});const before=[...h.data];
 assert.equal(handleAndroidBack(s),'handled');assert.equal(s.view.screen,'menu');assert.deepEqual([...h.data],before);
});
test('Android back follows existing help, settings, preparation and selection back paths',()=>{
 const h=sessionHost(),s=h.session;s.action({type:'helpMenu'});s.action({type:'selectHelp',topic:'inbound'});s.action({type:'helpDetails'});assert.equal(s.view.screen,'helpDetails');assert.equal(handleAndroidBack(s),'handled');assert.equal(s.view.screen,'helpMenu');assert.equal(handleAndroidBack(s),'handled');assert.equal(s.view.screen,'menu');
 s.action({type:'settings'});assert.equal(handleAndroidBack(s),'handled');assert.equal(s.view.screen,'menu');s.action({type:'chooseInbound'});assert.equal(handleAndroidBack(s),'handled');assert.equal(s.view.screen,'menu');
 s.action({type:'newRun',mode:'standard'});assert.equal(s.view.screen,'prepareTools');const before=[...h.data];assert.equal(handleAndroidBack(s),'handled');assert.equal(s.view.screen,'inboundMenu');assert.equal(s.view.prepareIntent,null);assert.deepEqual([...h.data],before);
});
test('Android back pauses an actual account run then backgrounds without another commit or settlement',()=>{
 const h=sessionHost(),s=h.session;startInbound(s);h.time(1000);s.tick(1000);const snapshot=unchanged(h);assert.equal(handleAndroidBack(s),'handled');assert.equal(s.view.paused,true);assert.deepEqual(unchanged(h),snapshot);const after=[...h.data],generation=s.view.account?.generation;
 for(let n=0;n<5;n++)assert.equal(handleAndroidBack(s),'background');assert.deepEqual([...h.data],after);assert.equal(s.view.account?.generation,generation);assert.deepEqual(unchanged(h),snapshot);assert.equal(s.view.screen,'game');
});
test('Android back backgrounds menu and recovery screens without creating or closing a run',()=>{
 const h=sessionHost(),s=h.session,before=[...h.data];assert.equal(handleAndroidBack(s),'background');assert.deepEqual([...h.data],before);startInbound(s);s.view.needsResume=true;const saved=[...h.data];assert.equal(handleAndroidBack(s),'background');assert.deepEqual([...h.data],saved);assert.equal(s.view.needsResume,true);
});

import {ACCOUNT_KEYS} from '../src/application/account-store.ts';
test('Android Back backgrounds a real failed purchase without retrying or changing pending account bytes',()=>{
 const h=sessionHost({wallet:160}),s=h.session,set=h.storage.set.bind(h.storage);h.storage.set=(key,value)=>{if(key===ACCOUNT_KEYS.a)throw Error('mirror write unavailable');set(key,value);};s.action({type:'shop'});s.action({type:'purchase',item:'rotate'});s.action({type:'confirm'});assert.equal(s.view.accountBlocked,true);assert.equal(s.view.screen,'shop');
 const before=[...h.data],operations=h.storage.operations.length;for(let n=0;n<4;n++)assert.equal(handleAndroidBack(s),'background');assert.deepEqual([...h.data],before);assert.equal(h.storage.operations.length,operations);assert.equal(s.view.account?.wallet,160);assert.equal(s.view.account?.inventory.rotate,0);
});
test('Android Back backgrounds a newly revoked actual writer instead of claiming a blocked action was handled',()=>{
 const h=sessionHost(),s=h.session;startInbound(s);h.platform.writerLease!.status='busy';const before=[...h.data];assert.equal(s.view.accountBlocked,false);assert.equal(handleAndroidBack(s),'background');assert.equal(s.view.accountBlocked,true);assert.deepEqual([...h.data],before);assert.equal(handleAndroidBack(s),'background');
});
