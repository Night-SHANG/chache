import test from 'node:test';
import assert from 'node:assert/strict';
import {GameSession} from '../src/application/session.ts';
import {playableChecksum} from '../src/domain/playable.ts';
import {shopScrollLimit} from '../src/presentation/shop-layout.ts';
import {COSMETIC_CATALOG} from '../src/application/cosmetics.ts';
import {SHOP_COSMETIC_SETS} from '../src/application/cosmetic-sets.ts';
import {cosmeticSetShopPage,cosmeticShopPage,selectedShopCosmetic} from '../src/presentation/economy-ui.ts';
import {getUiControls} from '../src/presentation/ui.ts';
import {sessionHost} from './helpers/session-fixtures.ts';
import type {UiAction} from '../src/presentation/ui-types.ts';

const act=(session:GameSession,action:Record<string,unknown>)=>session.action(action as UiAction);
const appearance=(session:GameSession)=>{act(session,{type:'shop'});act(session,{type:'selectShopTab',tab:'cosmetics'});};
// Keep this navigation regression filename; shop cases now enforce the v23 pagination contract.
const browseSnapshot=(session:GameSession)=>structuredClone({tab:session.view.shopTab,section:session.view.shopSection,scroll:session.view.shopScroll,set:session.view.cosmeticSetPreview,setPage:session.view.cosmeticSetPage,item:session.view.shopItemDetail,preview:session.view.cosmeticPreview,origin:session.view.cosmeticReturnSet,notice:session.view.cosmeticSetNotice});
const durableSnapshot=(h:ReturnType<typeof sessionHost>)=>({data:[...h.data],checksum:playableChecksum(h.session.state),account:structuredClone(h.session.view.account)});
function assertReadOnly(h:ReturnType<typeof sessionHost>,before:ReturnType<typeof durableSnapshot>) {
 assert.deepEqual([...h.data],before.data);assert.equal(playableChecksum(h.session.state),before.checksum);assert.deepEqual(h.session.view.account,before.account);
 assert.equal(h.storage.operations.some(o=>o.kind==='set'||o.kind==='remove'),false);
}

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

test('v23 each new shop home visit resets Tools, sets, pages and previews without changing account or board',()=>{
 for(const persisted of [false,true]){
  const h=sessionHost({},persisted),s=h.session,before=durableSnapshot(h);h.storage.resetFault();
  appearance(s);act(s,{type:'selectCosmeticSetPage',page:3});act(s,{type:'selectShopSection',section:'cargo'});act(s,{type:'selectCosmeticPage',page:2});
  act(s,{type:'previewCosmetic',kind:'cargo',id:'toy_brick'});act(s,{type:'back'});
  assert.equal(s.view.screen,'menu');act(s,{type:'shop'});
  assert.equal(s.view.shopTab,'tools');assert.equal(s.view.shopSection,'sets');assert.equal(cosmeticSetShopPage(s.view).page,0);
  assert.deepEqual(s.view.shopScroll,{sets:0,theme:0,cargo:0,forklift:0});assert.equal(s.view.cosmeticPreview,undefined);
  assert.equal(s.view.shopItemDetail,undefined);assert.equal(s.view.cosmeticSetPreview,undefined);assert.equal(s.view.cosmeticReturnSet,undefined);
  assert.equal(s.view.cosmeticSetNotice,undefined);assertReadOnly(h,before);if(!persisted)assert.equal(s.view.account,null);
 }
});

test('v23 peer sections and Tools retain independent pages derived from each selected preview',()=>{
 const h=sessionHost(),s=h.session,before=durableSnapshot(h);h.storage.resetFault();appearance(s);
 act(s,{type:'selectCosmeticSetPage',page:3});
 const pages={theme:1,cargo:2,forklift:4} as const;
 for(const kind of ['theme','cargo','forklift'] as const){
  act(s,{type:'selectShopSection',section:kind});act(s,{type:'selectCosmeticPage',page:pages[kind]});
  const options=COSMETIC_CATALOG.filter(item=>item.kind===kind),item=options[pages[kind]*4+1];
  assert.equal(s.view.cosmeticPreview?.[kind],options[pages[kind]*4].id);
  act(s,{type:'previewCosmetic',kind,id:item.id});assert.equal(cosmeticShopPage(s.view).page,pages[kind]);assert.equal(selectedShopCosmetic(s.view).id,item.id);
 }
 const preview=structuredClone(s.view.cosmeticPreview);act(s,{type:'selectShopTab',tab:'tools'});act(s,{type:'selectShopTab',tab:'cosmetics'});
 assert.equal(s.view.shopSection,'forklift');assert.deepEqual(s.view.cosmeticPreview,preview);
 for(const kind of ['theme','cargo','forklift'] as const){act(s,{type:'selectShopSection',section:kind});assert.equal(cosmeticShopPage(s.view).page,pages[kind]);assert.equal(selectedShopCosmetic(s.view).id,preview?.[kind]);}
 act(s,{type:'selectShopSection',section:'sets'});assert.equal(cosmeticSetShopPage(s.view).page,3);
 assert.deepEqual(s.view.shopScroll,{sets:0,theme:0,cargo:0,forklift:0});assertReadOnly(h,before);
});

test('v23 set member may change page and selection before returning to the original set and list page',()=>{
 const h=sessionHost(),s=h.session,before=durableSnapshot(h),set=SHOP_COSMETIC_SETS[8];h.storage.resetFault();appearance(s);act(s,{type:'selectCosmeticSetPage',page:2});
 act(s,{type:'previewCosmeticSet',id:set.id});assert.equal(s.view.cosmeticSetPreview,set.id);assert.equal(s.view.shopItemDetail,undefined);
 act(s,{type:'previewCosmeticSetMember',kind:'cargo'});
 assert.equal(s.view.shopItemDetail,undefined);assert.equal(s.view.cosmeticSetPreview,undefined);assert.equal(s.view.cosmeticReturnSet,set.id);
 assert.equal(s.view.shopSection,'cargo');assert.equal(s.view.cosmeticPreview?.cargo,set.cargo);assert.equal(selectedShopCosmetic(s.view).id,set.cargo);
 const targetPage=cosmeticShopPage(s.view).page===0?3:0;act(s,{type:'selectCosmeticPage',page:targetPage});
 assert.equal(cosmeticShopPage(s.view).page,targetPage);assert.equal(s.view.cosmeticReturnSet,set.id);
 const replacement=cosmeticShopPage(s.view).items[1];act(s,{type:'previewCosmetic',kind:'cargo',id:replacement.id});
 assert.equal(selectedShopCosmetic(s.view).id,replacement.id);assert.equal(s.view.cosmeticReturnSet,set.id);
 act(s,{type:'closeShopDetail'});assert.equal(s.view.cosmeticSetPreview,set.id);assert.equal(s.view.shopItemDetail,undefined);assert.equal(s.view.cosmeticReturnSet,undefined);
 act(s,{type:'closeShopDetail'});assert.equal(s.view.cosmeticSetPreview,undefined);assert.equal(s.view.screen,'shop');
 assert.equal(s.view.shopSection,'sets');assert.equal(cosmeticSetShopPage(s.view).page,2);assertReadOnly(h,before);
});

test('v23 independent item preview remains on its page and Back directly returns to every shop caller',()=>{
 for(const entry of [undefined,'chooseInbound','chooseColorTier','settings'] as const){
  const h=sessionHost(),s=h.session,before=durableSnapshot(h);h.storage.resetFault();if(entry)act(s,{type:entry});const caller=s.view.screen;
  appearance(s);act(s,{type:'selectShopSection',section:'forklift'});act(s,{type:'selectCosmeticPage',page:1});
  act(s,{type:'previewCosmetic',kind:'forklift',id:'toy'});
  assert.equal(s.view.shopItemDetail,undefined);assert.equal(s.view.cosmeticSetPreview,undefined);assert.equal(s.view.cosmeticReturnSet,undefined);
  assert.equal(s.view.cosmeticPreview?.forklift,'toy');assert.equal(selectedShopCosmetic(s.view).id,'toy');assert.equal(cosmeticShopPage(s.view).page,1);
  const controls=getUiControls(s.state,s.view);assert.equal(controls.filter(c=>c.action.type==='selectShopSection').length,4);assert.equal(controls.filter(c=>c.action.type==='previewCosmetic').length,4);assert.equal(controls.some(c=>c.action.type==='closeShopDetail'),false);
  act(s,{type:'back'});assert.equal(s.view.screen,caller);assertReadOnly(h,before);
 }
});

test('v23 Back follows member preview to set detail to the same list page before leaving the shop',()=>{
 const h=sessionHost(),s=h.session,before=durableSnapshot(h),set=SHOP_COSMETIC_SETS[12];h.storage.resetFault();appearance(s);act(s,{type:'selectCosmeticSetPage',page:3});act(s,{type:'previewCosmeticSet',id:set.id});act(s,{type:'previewCosmeticSetMember',kind:'theme'});
 assert.equal(s.view.cosmeticReturnSet,set.id);assert.equal(s.view.shopItemDetail,undefined);
 act(s,{type:'back'});assert.equal(s.view.screen,'shop');assert.equal(s.view.cosmeticSetPreview,set.id);assert.equal(s.view.shopItemDetail,undefined);
 act(s,{type:'back'});assert.equal(s.view.screen,'shop');assert.equal(s.view.cosmeticSetPreview,undefined);assert.equal(cosmeticSetShopPage(s.view).page,3);
 act(s,{type:'back'});assert.equal(s.view.screen,'menu');assertReadOnly(h,before);
});

test('v23 legacy closeCosmeticSet alias follows the same member and set Back transition',()=>{
 const h=sessionHost(),s=h.session,before=durableSnapshot(h);h.storage.resetFault();appearance(s);act(s,{type:'previewCosmeticSet',id:'cold_chain'});act(s,{type:'previewCosmeticSetMember',kind:'cargo'});
 act(s,{type:'closeCosmeticSet'});assert.equal(s.view.cosmeticSetPreview,'cold_chain');assert.equal(s.view.shopItemDetail,undefined);assert.equal(s.view.cosmeticReturnSet,undefined);
 act(s,{type:'closeCosmeticSet'});assert.equal(s.view.cosmeticSetPreview,undefined);assert.equal(s.view.shopSection,'sets');assertReadOnly(h,before);
});

test('v23 explicitly changing category clears the set origin before Back exits the shop',()=>{
 const h=sessionHost(),s=h.session,before=durableSnapshot(h);h.storage.resetFault();appearance(s);act(s,{type:'previewCosmeticSet',id:'cold_chain'});act(s,{type:'previewCosmeticSetMember',kind:'cargo'});
 assert.equal(s.view.cosmeticReturnSet,'cold_chain');act(s,{type:'selectShopSection',section:'forklift'});
 assert.equal(s.view.cosmeticReturnSet,undefined);assert.equal(s.view.cosmeticSetPreview,undefined);assert.equal(s.view.shopItemDetail,undefined);
 act(s,{type:'back'});assert.equal(s.view.screen,'menu');assertReadOnly(h,before);
});

test('v23 Tools tab round trip retains item page, set detail and member return origin',()=>{
 const h=sessionHost(),s=h.session,before=durableSnapshot(h);h.storage.resetFault();appearance(s);
 const roundTrip=()=>{const before=browseSnapshot(s);act(s,{type:'selectShopTab',tab:'tools'});act(s,{type:'selectShopTab',tab:'cosmetics'});assert.deepEqual(browseSnapshot(s),before);};
 act(s,{type:'selectShopSection',section:'cargo'});act(s,{type:'selectCosmeticPage',page:2});act(s,{type:'previewCosmetic',kind:'cargo',id:cosmeticShopPage(s.view).items[1].id});roundTrip();
 act(s,{type:'selectShopSection',section:'sets'});act(s,{type:'selectCosmeticSetPage',page:2});act(s,{type:'previewCosmeticSet',id:SHOP_COSMETIC_SETS[8].id});roundTrip();
 act(s,{type:'previewCosmeticSetMember',kind:'cargo'});act(s,{type:'selectCosmeticPage',page:3});roundTrip();assertReadOnly(h,before);
});

test('v23 all legacy scroll actions and wheel inputs leave pages, selection and hidden shop views unchanged',()=>{
 const h=sessionHost(),s=h.session,before=durableSnapshot(h);h.storage.resetFault();appearance(s);
 const assertNoScrolling=()=>{const snapshot=structuredClone(s.view);assert.equal(shopScrollLimit(s.view),0);for(const deltaY of [Number.MAX_SAFE_INTEGER,100,-Number.MAX_SAFE_INTEGER,0,NaN,Infinity,-Infinity]){act(s,{type:'scrollShop',deltaY});assert.equal(s.input.wheel({x:330,y:1185},deltaY),false);assert.deepEqual(s.view,snapshot);}};
 for(const section of ['sets','theme','cargo','forklift'] as const){act(s,{type:'selectShopSection',section});act(s,{type:section==='sets'?'selectCosmeticSetPage':'selectCosmeticPage',page:2});assertNoScrolling();}
 act(s,{type:'previewCosmeticSet',id:'cold_chain'});assertNoScrolling();act(s,{type:'previewCosmeticSetMember',kind:'cargo'});assertNoScrolling();
 act(s,{type:'selectShopTab',tab:'tools'});assertNoScrolling();act(s,{type:'back'});assert.equal(s.view.screen,'menu');assertNoScrolling();assertReadOnly(h,before);
});

test('v23 blocked, confirming and nonshop views reject page, preview and other shop navigation actions',()=>{
 const h=sessionHost({wallet:300}),s=h.session,before=durableSnapshot(h);h.storage.resetFault();appearance(s);act(s,{type:'selectShopSection',section:'cargo'});act(s,{type:'previewCosmetic',kind:'cargo',id:'wood'});
 act(s,{type:'purchaseCosmetic',kind:'cargo',id:'wood'});const confirming=browseSnapshot(s);assert.ok(s.view.confirmation);
 const actions=[{type:'selectShopTab',tab:'tools'},{type:'selectShopSection',section:'sets'},{type:'selectCosmeticPage',page:2},{type:'selectCosmeticSetPage',page:3},{type:'previewCosmetic',kind:'cargo',id:'toy_brick'},{type:'previewCosmeticSet',id:'cold_chain'},{type:'scrollShop',deltaY:100},{type:'closeShopDetail'}];
 for(const action of actions)act(s,action);
 assert.deepEqual(browseSnapshot(s),confirming);act(s,{type:'cancel'});s.view.accountBlocked=true;
 for(const action of actions)act(s,action);
 assert.deepEqual(browseSnapshot(s),confirming);s.view.accountBlocked=false;act(s,{type:'back'});assert.equal(s.view.screen,'menu');const closed=browseSnapshot(s);
 for(const action of actions)act(s,action);
 assert.deepEqual(browseSnapshot(s),closed);assertReadOnly(h,before);
});
