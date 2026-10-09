import test from 'node:test';
import assert from 'node:assert/strict';
import {GameSession} from '../src/application/session.ts';
import {playableChecksum} from '../src/domain/playable.ts';
import {shopScrollLimit} from '../src/presentation/shop-layout.ts';
import {sessionHost} from './helpers/session-fixtures.ts';
import type {UiAction} from '../src/presentation/ui-types.ts';

const act=(session:GameSession,action:Record<string,unknown>)=>session.action(action as UiAction);
const appearance=(session:GameSession)=>{act(session,{type:'shop'});act(session,{type:'selectShopTab',tab:'cosmetics'});};
const browseSnapshot=(session:GameSession)=>structuredClone({tab:session.view.shopTab,section:session.view.shopSection,scroll:session.view.shopScroll,set:session.view.cosmeticSetPreview,item:session.view.shopItemDetail});

test('home entry resets inbound to hard but internal preparation and settings Back retain expert',()=>{
 const h=sessionHost(),s=h.session,before=[...h.data];
 act(s,{type:'chooseInbound'});act(s,{type:'selectInboundDifficulty',inboundDifficulty:'expert'});
 act(s,{type:'newRun',mode:'standard'});act(s,{type:'back'});
 assert.equal(s.view.screen,'inboundMenu');assert.equal(s.view.inboundDifficulty,'expert');
 act(s,{type:'settings'});act(s,{type:'back'});assert.equal(s.view.inboundDifficulty,'expert');
 act(s,{type:'home'});act(s,{type:'chooseInbound'});
 assert.equal(s.view.inboundDifficulty,'hard');assert.deepEqual([...h.data],before);
});

test('home entry resets outbound to normal but internal preparation and settings Back retain endless',()=>{
 const h=sessionHost(),s=h.session,before=[...h.data];
 act(s,{type:'chooseColorTier'});act(s,{type:'selectOutboundMode',mode:'endless'});
 act(s,{type:'newRun',mode:'color_exit',difficultyId:'expert',outboundMode:'endless'});act(s,{type:'back'});
 assert.equal(s.view.screen,'colorTiers');assert.equal(s.view.outboundSelectionMode,'endless');
 act(s,{type:'settings'});act(s,{type:'back'});assert.equal(s.view.outboundSelectionMode,'endless');
 act(s,{type:'home'});act(s,{type:'chooseColorTier'});
 assert.equal(s.view.outboundSelectionMode,'normal');assert.deepEqual([...h.data],before);
});

test('active inbound expert survives pause, cancel home, retry, continue, crash resume and restart',()=>{
 const h=sessionHost(),s=h.session;
 act(s,{type:'chooseInbound'});act(s,{type:'selectInboundDifficulty',inboundDifficulty:'expert'});
 act(s,{type:'newRun',mode:'standard'});act(s,{type:'prepareNext'});
 const identity=structuredClone(s.view.account?.run?.identity),checksum=playableChecksum(s.state);
 s.togglePause();act(s,{type:'home'});act(s,{type:'cancel'});act(s,{type:'retrySave'});act(s,{type:'continue'});
 assert.equal(s.view.inboundDifficulty,'expert');assert.deepEqual(s.view.account?.run?.identity,identity);assert.equal(playableChecksum(s.state),checksum);
 const restored=new GameSession(h.platform,{seed:101,mode:'standard'});assert.equal(restored.view.inboundDifficulty,'expert');
 restored.resume();restored.restart();act(restored,{type:'confirm'});
 assert.equal(restored.view.prepareIntent?.spec.family==='inbound'&&restored.view.prepareIntent.spec.inboundDifficulty,'expert');
 act(restored,{type:'prepareNext'});assert.equal('inboundDifficulty' in restored.state&&restored.state.inboundDifficulty,'expert');
});

test('active outbound endless survives pause, cancel home, retry, continue, crash resume and restart',()=>{
 const h=sessionHost(),s=h.session;
 act(s,{type:'chooseColorTier'});act(s,{type:'selectOutboundMode',mode:'endless'});
 act(s,{type:'newRun',mode:'color_exit',difficultyId:'expert',outboundMode:'endless'});act(s,{type:'prepareNext'});
 const identity=structuredClone(s.view.account?.run?.identity),checksum=playableChecksum(s.state);
 s.togglePause();act(s,{type:'home'});act(s,{type:'cancel'});act(s,{type:'retrySave'});act(s,{type:'continue'});
 assert.equal(s.view.outboundSelectionMode,'endless');assert.deepEqual(s.view.account?.run?.identity,identity);assert.equal(playableChecksum(s.state),checksum);
 const restored=new GameSession(h.platform,{seed:101,mode:'standard'});assert.equal(restored.view.outboundSelectionMode,'endless');
 restored.resume();restored.restart();act(restored,{type:'confirm'});
 assert.equal(restored.view.prepareIntent?.spec.family==='outbound'&&restored.view.prepareIntent.spec.variant,'endless');
 act(restored,{type:'prepareNext'});assert.equal(restored.state.rulesetVersion,13);assert.equal('difficultyId' in restored.state&&restored.state.difficultyId,'expert');
});

test('each new shop home visit starts Tools, sets and zero scroll without changing account or board',()=>{
 for(const persisted of [false,true]){
  const h=sessionHost({},persisted),s=h.session,before=[...h.data],checksum=playableChecksum(s.state);h.storage.resetFault();
  appearance(s);act(s,{type:'selectShopSection',section:'cargo'});act(s,{type:'scrollShop',deltaY:350});
  act(s,{type:'previewCosmetic',kind:'cargo',id:'wood'});act(s,{type:'closeShopDetail'});act(s,{type:'back'});
  assert.equal(s.view.screen,'menu');act(s,{type:'shop'});
  assert.equal(s.view.shopTab,'tools');assert.equal(s.view.shopSection,'sets');
  assert.deepEqual(s.view.shopScroll,{sets:0,theme:0,cargo:0,forklift:0});
  assert.equal(s.view.shopItemDetail,undefined);assert.equal(s.view.cosmeticSetPreview,undefined);
  assert.equal(s.view.cosmeticSetNotice,undefined);assert.deepEqual([...h.data],before);assert.equal(playableChecksum(s.state),checksum);
  assert.equal(h.storage.operations.some(o=>o.kind==='set'||o.kind==='remove'),false);
 }
});

test('each shop section retains independent scroll across peer sections and tools tab',()=>{
 const h=sessionHost(),s=h.session,before=[...h.data];appearance(s);
 for(const [section,offset] of [['sets',100],['theme',200],['cargo',300],['forklift',400]] as const){
  act(s,{type:'selectShopSection',section});act(s,{type:'scrollShop',deltaY:offset});assert.equal(s.view.shopScroll?.[section],offset);
 }
 act(s,{type:'selectShopTab',tab:'tools'});act(s,{type:'selectShopTab',tab:'cosmetics'});
 assert.equal(s.view.shopSection,'forklift');assert.deepEqual(s.view.shopScroll,{sets:100,theme:200,cargo:300,forklift:400});
 act(s,{type:'selectShopSection',section:'sets'});assert.equal(s.view.shopScroll?.sets,100);assert.deepEqual([...h.data],before);
});

test('set member detail returns to its set then the same scrolled set list',()=>{
 const h=sessionHost(),s=h.session,before=[...h.data];appearance(s);act(s,{type:'scrollShop',deltaY:480});
 act(s,{type:'previewCosmeticSet',id:'cold_chain'});assert.equal(s.view.cosmeticSetPreview,'cold_chain');assert.equal(s.view.shopItemDetail,undefined);
 act(s,{type:'previewCosmeticSetMember',kind:'cargo'});
 assert.deepEqual(s.view.shopItemDetail,{kind:'cargo',id:'insulated',fromSet:'cold_chain'});assert.equal(s.view.cosmeticSetPreview,undefined);
 assert.equal(s.view.shopSection,'sets');assert.equal(s.view.shopScroll?.sets,480);
 act(s,{type:'closeShopDetail'});assert.equal(s.view.cosmeticSetPreview,'cold_chain');assert.equal(s.view.shopItemDetail,undefined);
 act(s,{type:'closeShopDetail'});assert.equal(s.view.cosmeticSetPreview,undefined);assert.equal(s.view.screen,'shop');
 assert.equal(s.view.shopSection,'sets');assert.equal(s.view.shopScroll?.sets,480);assert.deepEqual([...h.data],before);
});

test('independent item detail returns to the same peer section and scroll',()=>{
 const h=sessionHost(),s=h.session,before=[...h.data];appearance(s);act(s,{type:'selectShopSection',section:'forklift'});act(s,{type:'scrollShop',deltaY:410});
 act(s,{type:'previewCosmetic',kind:'forklift',id:'white'});assert.deepEqual(s.view.shopItemDetail,{kind:'forklift',id:'white'});assert.equal(s.view.cosmeticSetPreview,undefined);
 act(s,{type:'closeShopDetail'});assert.equal(s.view.shopItemDetail,undefined);assert.equal(s.view.shopSection,'forklift');assert.equal(s.view.shopScroll?.forklift,410);assert.deepEqual([...h.data],before);
});

test('Back follows member detail to set detail to list before leaving the shop',()=>{
 const s=sessionHost().session;appearance(s);act(s,{type:'previewCosmeticSet',id:'cold_chain'});act(s,{type:'previewCosmeticSetMember',kind:'theme'});
 act(s,{type:'back'});assert.equal(s.view.screen,'shop');assert.equal(s.view.cosmeticSetPreview,'cold_chain');assert.equal(s.view.shopItemDetail,undefined);
 act(s,{type:'back'});assert.equal(s.view.screen,'shop');assert.equal(s.view.cosmeticSetPreview,undefined);
 act(s,{type:'back'});assert.equal(s.view.screen,'menu');
});

test('legacy closeCosmeticSet alias follows the same detail Back transition',()=>{
 const s=sessionHost().session;appearance(s);act(s,{type:'previewCosmeticSet',id:'cold_chain'});act(s,{type:'previewCosmeticSetMember',kind:'cargo'});
 act(s,{type:'closeCosmeticSet'});assert.equal(s.view.cosmeticSetPreview,'cold_chain');assert.equal(s.view.shopItemDetail,undefined);
 act(s,{type:'closeCosmeticSet'});assert.equal(s.view.cosmeticSetPreview,undefined);assert.equal(s.view.shopSection,'sets');
});

test('tools tab round trip retains current appearance detail and its underlying list',()=>{
 const s=sessionHost().session;appearance(s);act(s,{type:'selectShopSection',section:'cargo'});act(s,{type:'scrollShop',deltaY:350});act(s,{type:'previewCosmetic',kind:'cargo',id:'wood'});
 const before=browseSnapshot(s);act(s,{type:'selectShopTab',tab:'tools'});act(s,{type:'selectShopTab',tab:'cosmetics'});assert.deepEqual(browseSnapshot(s),before);
});

test('scroll clamps current section and ignores nonfinite deltas and hidden list actions',()=>{
 const s=sessionHost().session;appearance(s);act(s,{type:'selectShopSection',section:'cargo'});
 act(s,{type:'scrollShop',deltaY:Number.MAX_SAFE_INTEGER});const end=s.view.shopScroll?.cargo;assert.ok(end&&end>0&&end<Number.MAX_SAFE_INTEGER);assert.equal(end,shopScrollLimit(s.view));
 act(s,{type:'scrollShop',deltaY:100});assert.equal(s.view.shopScroll?.cargo,end);assert.equal(s.view.shopScroll?.sets,0);
 act(s,{type:'scrollShop',deltaY:-Number.MAX_SAFE_INTEGER});assert.equal(s.view.shopScroll?.cargo,0);
 for(const deltaY of [NaN,Infinity,-Infinity])act(s,{type:'scrollShop',deltaY});assert.equal(s.view.shopScroll?.cargo,0);
 act(s,{type:'scrollShop',deltaY:250});act(s,{type:'previewCosmetic',kind:'cargo',id:'wood'});const detail=browseSnapshot(s);
 act(s,{type:'scrollShop',deltaY:100});assert.deepEqual(browseSnapshot(s),detail);
 act(s,{type:'selectShopTab',tab:'tools'});const tools=browseSnapshot(s);act(s,{type:'scrollShop',deltaY:100});assert.deepEqual(browseSnapshot(s),tools);
});

test('blocked, confirming and nonshop views reject new shop navigation actions',()=>{
 const s=sessionHost({wallet:300}).session;appearance(s);act(s,{type:'selectShopSection',section:'cargo'});act(s,{type:'scrollShop',deltaY:200});act(s,{type:'previewCosmetic',kind:'cargo',id:'wood'});
 act(s,{type:'purchaseCosmetic',kind:'cargo',id:'wood'});const confirming=browseSnapshot(s);assert.ok(s.view.confirmation);
 for(const action of [{type:'selectShopSection',section:'sets'},{type:'scrollShop',deltaY:100},{type:'closeShopDetail'}])act(s,action);
 assert.deepEqual(browseSnapshot(s),confirming);act(s,{type:'cancel'});s.view.accountBlocked=true;
 for(const action of [{type:'selectShopSection',section:'sets'},{type:'scrollShop',deltaY:100},{type:'closeShopDetail'}])act(s,action);
 assert.deepEqual(browseSnapshot(s),confirming);s.view.accountBlocked=false;act(s,{type:'closeShopDetail'});act(s,{type:'back'});const closed=browseSnapshot(s);
 for(const action of [{type:'selectShopSection',section:'sets'},{type:'scrollShop',deltaY:100},{type:'closeShopDetail'}])act(s,action);
 assert.deepEqual(browseSnapshot(s),closed);
});
