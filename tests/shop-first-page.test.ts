import test from 'node:test';
import assert from 'node:assert/strict';
import {GameSession} from '../src/application/session.ts';
import {COSMETIC_CATALOG,retainAccountCosmetics} from '../src/application/cosmetics.ts';
import {upgradeEconomy} from '../src/application/economy.ts';
import {cosmeticShopPage,getShopControls,selectedShopCosmetic} from '../src/presentation/economy-ui.ts';
import {playableChecksum} from '../src/domain/playable.ts';
import {makeAccountFixture} from './helpers/account-fixtures.ts';
import {sessionHost} from './helpers/session-fixtures.ts';

const kinds=['theme','cargo','forklift'] as const;
const first={theme:'day',cargo:'classic',forklift:'yellow'} as const;
const equippedByPage=[
 {theme:'toy_workshop',cargo:'toy_brick',forklift:'electric'},
 {theme:'ocean_vault',cargo:'ocean_relic',forklift:'space'},
] as const;
function equippedHost(page=0,ownAll=false) {
 const account=retainAccountCosmetics(upgradeEconomy(makeAccountFixture({wallet:5000})));
 account.profile.cosmetics={...equippedByPage[page]};
 account.profile.ownedCosmetics=[...new Set([...account.profile.ownedCosmetics!,...(ownAll?COSMETIC_CATALOG.map(item=>item.key):kinds.map(kind=>`${kind}.${account.profile.cosmetics[kind]}`))])].sort();
 return sessionHost(account);
}
function snapshot(h:ReturnType<typeof equippedHost>) {
 return {bytes:JSON.stringify([...h.data]),account:JSON.stringify(h.session.view.account),board:playableChecksum(h.session.state)};
}
function assertReadOnly(h:ReturnType<typeof equippedHost>,before:ReturnType<typeof snapshot>) {
 assert.deepEqual(snapshot(h),before);
 assert.equal(h.storage.operations.some(operation=>operation.kind==='set'||operation.kind==='remove'),false);
}
function openCosmetics(s:GameSession) {
 s.action({type:'shop'});assert.equal(s.view.shopTab,'tools');
 s.action({type:'selectShopTab',tab:'cosmetics'});
}
function assertFirstPage(s:GameSession,kind:typeof kinds[number]) {
 assert.equal(cosmeticShopPage(s.view).page,0);
 assert.equal(selectedShopCosmetic(s.view).id,first[kind]);
 const controls=getShopControls(s.view),selected=controls.filter(control=>control.action.type==='previewCosmetic'&&control.selected);
 assert.equal(selected.length,1);assert.deepEqual(selected[0].action,{type:'previewCosmetic',kind,id:first[kind]});
 assert.equal(controls.find(control=>control.action.type==='selectCosmeticPage'&&control.action.page===-1)?.disabled,true);
}

for(const [equippedPage,equipment] of equippedByPage.entries())for(const kind of kinds){
 test(`cold ${kind} category starts on page one with page ${equippedPage+2} equipment, including a reloaded session`,()=>{
  const h=equippedHost(equippedPage),before=snapshot(h);h.storage.resetFault();
  for(const s of [h.session,new GameSession(h.platform,{seed:71,mode:'standard'})]){
   openCosmetics(s);s.action({type:'selectShopSection',section:kind});
   assert.equal(s.view.account?.profile.cosmetics[kind],equipment[kind]);assertFirstPage(s,kind);
  }
  assertReadOnly(h,before);
 });
}

for(const kind of kinds){
 test(`new shop visit resets ${kind} to page one without changing later-page equipment or account bytes`,()=>{
  const h=equippedHost(1),s=h.session,before=snapshot(h);h.storage.resetFault();openCosmetics(s);
  s.action({type:'selectShopSection',section:kind});s.action({type:'selectCosmeticPage',page:2});
  assert.equal(cosmeticShopPage(s.view).page,2);s.action({type:'back'});assert.equal(s.view.screen,'menu');
  openCosmetics(s);assert.equal(s.view.shopSection,'theme');s.action({type:'selectShopSection',section:kind});assertFirstPage(s,kind);
  assertReadOnly(h,before);
 });

 test(`${kind} keeps an explicit browse selection across peer categories, Tools, and repeated category clicks`,()=>{
  const h=equippedHost(1),s=h.session,before=snapshot(h);h.storage.resetFault();openCosmetics(s);
  s.action({type:'selectShopSection',section:kind});s.action({type:'selectCosmeticPage',page:1});
  const selected=selectedShopCosmetic(s.view).id,other=kind==='theme'?'cargo':'theme';
  s.action({type:'selectShopSection',section:other});assertFirstPage(s,other);
  s.action({type:'selectShopSection',section:kind});s.action({type:'selectShopSection',section:kind});
  s.action({type:'selectShopTab',tab:'tools'});s.action({type:'selectShopTab',tab:'cosmetics'});
  assert.equal(cosmeticShopPage(s.view).page,1);assert.equal(selectedShopCosmetic(s.view).id,selected);assertReadOnly(h,before);
 });

 test(`${kind} purchase cancellation keeps its selected later-page item without writing account bytes`,()=>{
  const h=equippedHost(1),s=h.session,before=snapshot(h);h.storage.resetFault();openCosmetics(s);
  s.action({type:'selectShopSection',section:kind});s.action({type:'selectCosmeticPage',page:1});const item=selectedShopCosmetic(s.view);
  assert.ok(item.price>0);s.action({type:'purchaseCosmetic',kind,id:item.id});assert.equal(s.view.confirmation?.kind,'purchaseCosmetic');
  s.action({type:'cancel'});assert.equal(s.view.confirmation,null);assert.equal(selectedShopCosmetic(s.view).id,item.id);assert.equal(cosmeticShopPage(s.view).page,1);
  assertReadOnly(h,before);
 });

 test(`${kind} equipment changes preserve the selected later page until a new shop visit`,()=>{
  const h=equippedHost(1,true),s=h.session;openCosmetics(s);s.action({type:'selectShopSection',section:kind});s.action({type:'selectCosmeticPage',page:1});
  const item=selectedShopCosmetic(s.view),wallet=s.view.account?.wallet;s.action({type:'equipCosmetic',kind,id:item.id});
  assert.equal(s.view.account?.profile.cosmetics[kind],item.id);assert.equal(s.view.account?.wallet,wallet);
  assert.equal(cosmeticShopPage(s.view).page,1);assert.equal(selectedShopCosmetic(s.view).id,item.id);
  const before=snapshot(h);h.storage.resetFault();s.action({type:'back'});openCosmetics(s);s.action({type:'selectShopSection',section:kind});
  assertFirstPage(s,kind);assertReadOnly(h,before);
 });
}
