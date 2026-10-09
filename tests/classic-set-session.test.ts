import test from 'node:test';
import assert from 'node:assert/strict';
import {GameSession} from '../src/application/session.ts';
import {ACCOUNT_KEYS} from '../src/application/account-store.ts';
import {sessionHost} from './helpers/session-fixtures.ts';
import {playableChecksum} from '../src/domain/playable.ts';
import type {UiAction} from '../src/presentation/ui-types.ts';

const act=(s:GameSession,a:Record<string,unknown>)=>s.action(a as UiAction);
const classic=(s:GameSession)=>{act(s,{type:'shop'});act(s,{type:'selectShopTab',tab:'cosmetics'});act(s,{type:'previewCosmeticSet',id:'classic'});};
const choose=(s:GameSession)=>{act(s,{type:'selectClassicSetVariant',kind:'theme',id:'night'});act(s,{type:'selectClassicSetVariant',kind:'cargo',id:'outline'});act(s,{type:'selectClassicSetVariant',kind:'forklift',id:'white'});};

test('classic preview variants are session-only and root entry resets while internal Back retains them',()=>{
 const h=sessionHost({wallet:600}),s=h.session,before=[...h.data],checksum=playableChecksum(s.state);classic(s);choose(s);
 assert.deepEqual(s.view.classicSetSelection,{theme:'night',cargo:'outline',forklift:'white'});
 act(s,{type:'selectShopTab',tab:'tools'});act(s,{type:'selectShopTab',tab:'cosmetics'});assert.equal(s.view.classicSetSelection?.forklift,'white');
 act(s,{type:'closeShopDetail'});act(s,{type:'previewCosmeticSet',id:'classic'});assert.equal(s.view.classicSetSelection?.forklift,'white');
 act(s,{type:'previewCosmeticSetMember',kind:'forklift'});assert.deepEqual(s.view.shopItemDetail,{kind:'forklift',id:'white',fromSet:'classic'});
 act(s,{type:'back'});assert.equal(s.view.cosmeticSetPreview,'classic');assert.deepEqual(s.view.classicSetSelection,{theme:'night',cargo:'outline',forklift:'white'});
 act(s,{type:'back'});act(s,{type:'back'});act(s,{type:'shop'});assert.deepEqual(s.view.classicSetSelection,{theme:'day',cargo:'classic',forklift:'yellow'});
 assert.deepEqual([...h.data],before);assert.equal(playableChecksum(s.state),checksum);
});

test('classic context purchase retains preview and applies only after separate explicit equip',()=>{
 const h=sessionHost({wallet:600}),s=h.session;classic(s);choose(s);const original=structuredClone(s.view.account?.profile.cosmetics);
 act(s,{type:'equipClassicSet'});assert.deepEqual(s.view.account?.profile.cosmetics,original);assert.equal(s.view.account?.wallet,600);
 act(s,{type:'purchaseCosmetic',kind:'forklift',id:'white'});assert.equal(s.view.confirmation?.kind,'purchaseCosmetic');act(s,{type:'cancel'});assert.equal(s.view.account?.wallet,600);assert.equal(s.view.classicSetSelection?.forklift,'white');
 act(s,{type:'purchaseCosmetic',kind:'forklift',id:'white'});act(s,{type:'confirm'});assert.equal(s.view.account?.wallet,0);assert.deepEqual(s.view.account?.profile.cosmetics,original);assert.equal(s.view.cosmeticSetPreview,'classic');assert.deepEqual(s.view.classicSetSelection,{theme:'night',cargo:'outline',forklift:'white'});
 act(s,{type:'equipClassicSet'});assert.deepEqual(s.view.account?.profile.cosmetics,{theme:'night',cargo:'classic',forklift:'white'});assert.equal(s.view.account?.profile.cargoOutline,true);
 const after=[...h.data],generation=s.view.account!.generation;act(s,{type:'equipClassicSet'});assert.deepEqual([...h.data],after);assert.equal(s.view.account?.generation,generation);
});

test('classic session uncertain apply publishes no partial outfit and retries the original selection',()=>{
 const h=sessionHost(),s=h.session;classic(s);act(s,{type:'selectClassicSetVariant',kind:'theme',id:'night'});act(s,{type:'selectClassicSetVariant',kind:'cargo',id:'outline'});
 const before=s.view.account,set=h.storage.set.bind(h.storage);let fail=true;h.storage.set=(key,value)=>{if(fail&&key===ACCOUNT_KEYS.a)throw Error('mirror');set(key,value);};
 act(s,{type:'equipClassicSet'});assert.equal(s.view.accountBlocked,true);assert.equal(s.view.account,before);
 act(s,{type:'selectClassicSetVariant',kind:'theme',id:'day'});assert.equal(s.view.classicSetSelection?.theme,'night');act(s,{type:'back'});assert.equal(s.view.cosmeticSetPreview,'classic');
 fail=false;act(s,{type:'retrySave'});assert.deepEqual(s.view.account?.profile.cosmetics,{theme:'night',cargo:'classic',forklift:'yellow'});assert.equal(s.view.account?.profile.cargoOutline,true);
 const stable=[...h.data];act(s,{type:'retrySave'});act(s,{type:'equipClassicSet'});assert.deepEqual([...h.data],stable);
 const restored=new GameSession(h.platform,{seed:99,mode:'standard'});assert.equal(restored.view.account?.profile.cargoOutline,true);classic(restored);assert.deepEqual(restored.view.classicSetSelection,{theme:'day',cargo:'classic',forklift:'yellow'});
});

test('hidden, confirming, blocked and malformed classic variant actions are harmless',()=>{
 const h=sessionHost({wallet:600}),s=h.session;classic(s);choose(s);const selected=structuredClone(s.view.classicSetSelection),before=[...h.data];
 for(const action of [{kind:'theme',id:'harbor'},{kind:'cargo',id:'wood'},{kind:'forklift',id:'electric'},{kind:'__proto__',id:'yellow'}])act(s,{type:'selectClassicSetVariant',...action});assert.deepEqual(s.view.classicSetSelection,selected);
 act(s,{type:'purchaseCosmetic',kind:'forklift',id:'white'});act(s,{type:'selectClassicSetVariant',kind:'forklift',id:'yellow'});act(s,{type:'equipClassicSet'});assert.deepEqual(s.view.classicSetSelection,selected);assert.deepEqual([...h.data],before);act(s,{type:'cancel'});
 act(s,{type:'closeShopDetail'});act(s,{type:'selectClassicSetVariant',kind:'forklift',id:'yellow'});act(s,{type:'equipClassicSet'});assert.deepEqual(s.view.classicSetSelection,selected);assert.deepEqual([...h.data],before);
});
