import test from 'node:test';
import assert from 'node:assert/strict';
import {GameSession} from '../src/application/session.ts';
import {ACCOUNT_KEYS} from '../src/application/account-store.ts';
import {playableChecksum} from '../src/domain/playable.ts';
import {sessionHost} from './helpers/session-fixtures.ts';
import type {UiAction} from '../src/presentation/ui-types.ts';
const act=(session:GameSession,action:Record<string,unknown>)=>session.action(action as UiAction);
function wood(session:GameSession){act(session,{type:'shop'});act(session,{type:'selectShopTab',tab:'cosmetics'});act(session,{type:'selectCosmeticCategory',kind:'cargo'});act(session,{type:'previewCosmetic',kind:'cargo',id:'wood'});}

test('shop previews and tabs are ephemeral even before the first account exists',()=>{
 const h=sessionHost({},false),s=h.session,before=[...h.data],checksum=playableChecksum(s.state);h.storage.resetFault();wood(s);
 assert.equal(s.view.shopTab,'cosmetics');assert.equal(s.view.cosmeticCategory,'cargo');assert.equal(s.view.cosmeticPreview?.cargo,'wood');
 act(s,{type:'selectCosmeticCategory',kind:'forklift'});act(s,{type:'previewCosmetic',kind:'forklift',id:'white'});act(s,{type:'back'});assert.equal(s.view.screen,'shop');assert.equal(s.view.shopItemDetail,undefined);act(s,{type:'back'});
 assert.equal(s.view.screen,'menu');assert.equal(s.view.account,null);assert.deepEqual([...h.data],before);assert.equal(playableChecksum(s.state),checksum);assert.equal(h.storage.operations.some(o=>o.kind==='set'||o.kind==='remove'),false);
});
test('cancel purchase keeps balance; confirmed purchase owns wood once and separate equip is free',()=>{
 const h=sessionHost({wallet:300}),s=h.session;wood(s);const before=[...h.data];act(s,{type:'purchaseCosmetic',kind:'cargo',id:'wood'});
 assert.equal(s.view.confirmation?.kind,'purchaseCosmetic');act(s,{type:'cancel'});assert.deepEqual([...h.data],before);
 act(s,{type:'purchaseCosmetic',kind:'cargo',id:'wood'});act(s,{type:'confirm'});act(s,{type:'confirm'});
 assert.equal(s.view.account?.wallet,0);assert.ok(s.view.account?.profile.ownedCosmetics?.includes('cargo.wood'));assert.equal(s.view.account?.profile.cosmetics.cargo,'classic');
 act(s,{type:'equipCosmetic',kind:'cargo',id:'wood'});assert.equal(s.view.account?.profile.cosmetics.cargo,'wood');assert.equal(s.view.account?.wallet,0);
 act(s,{type:'setCargoOutline',enabled:true});assert.equal(s.view.account?.profile.cargoOutline,true);assert.equal(s.view.account?.profile.cosmetics.cargo,'classic');
 act(s,{type:'resetProfile'});act(s,{type:'confirm'});assert.ok(s.view.account?.profile.ownedCosmetics?.includes('cargo.wood'));assert.equal(s.view.account?.profile.cargoOutline,true);
 const restored=new GameSession(h.platform,{seed:71,mode:'standard'});assert.equal(restored.view.account?.profile.cosmetics.cargo,'classic');assert.equal(restored.view.account?.profile.cargoOutline,true);
});
test('unconfirmed cosmetic save blocks interaction and retry publishes the original purchase only once',()=>{
 const h=sessionHost({wallet:300}),s=h.session;wood(s);const before=s.view.account,original=h.storage.set.bind(h.storage);let broken=true;
 h.storage.set=(key,value)=>{if(key===ACCOUNT_KEYS.a&&broken)throw Error('mirror');original(key,value);};
 act(s,{type:'purchaseCosmetic',kind:'cargo',id:'wood'});act(s,{type:'confirm'});assert.equal(s.view.account,before);assert.equal(s.view.accountBlocked,true);
 act(s,{type:'equipCosmetic',kind:'cargo',id:'wood'});act(s,{type:'back'});assert.equal(s.view.screen,'shop');broken=false;act(s,{type:'retrySave'});
 assert.equal(s.view.account?.wallet,0);assert.equal(s.view.account?.profile.cosmetics.cargo,'classic');const generation=s.view.account!.generation;act(s,{type:'retrySave'});act(s,{type:'confirm'});assert.equal(s.view.account?.generation,generation);
});
test('active run and reserved items survive attempted shop access and purchase',()=>{
 const h=sessionHost({wallet:900,inventory:{rotate:1,clear:0,wildcard:0}}),s=h.session;
 act(s,{type:'newRun',mode:'color_exit',difficultyId:'normal',outboundMode:'normal'});act(s,{type:'toggleItem',item:'rotate'});act(s,{type:'prepareNext'});
 const run=s.view.account!.run!,before=[...h.data],checksum=playableChecksum(s.state);assert.deepEqual(run.reserved,['rotate']);
 wood(s);act(s,{type:'purchaseCosmetic',kind:'theme',id:'harbor'});act(s,{type:'confirm'});
 assert.equal(s.view.screen,'game');assert.deepEqual([...h.data],before);assert.equal(playableChecksum(s.state),checksum);assert.equal(s.view.account?.run?.identity.runId,run.identity.runId);assert.deepEqual(s.view.account?.run?.reserved,['rotate']);assert.equal(s.view.account?.inventory.rotate,0);
});

import {getUiControls} from '../src/presentation/ui.ts';
test('native pointer selects preview but an insufficient purchase stays disabled and writes nothing across hide/show',()=>{
 const h=sessionHost({wallet:299}),s=h.session;
 const click=(type:UiAction['type'],id?:string)=>{const control=getUiControls(s.state,s.view).find(c=>c.action.type===type&&(!id||'id' in c.action&&c.action.id===id));assert.ok(control);const point={x:control.rect.x+control.rect.w/2,y:control.rect.y+control.rect.h/2};s.input.down(point);s.input.up(point);return control;};
 click('shop');act(s,{type:'selectShopTab',tab:'cosmetics'});act(s,{type:'selectCosmeticCategory',kind:'cargo'});const before=[...h.data];click('previewCosmetic','wood');
 assert.equal(s.view.cosmeticPreview?.cargo,'wood');assert.equal(click('purchaseCosmetic','wood').disabled,true);assert.equal(s.view.confirmation,null);s.hide();s.show();
 act(s,{type:'equipCosmetic',kind:'cargo',id:'wood'});assert.equal(s.view.account?.profile.cosmetics.cargo,'classic');assert.deepEqual([...h.data],before);
});
