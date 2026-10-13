import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { COSMETIC_CATALOG, HISTORICAL_COSMETIC_CATALOG, FREE_COSMETICS, accountCosmeticState, assertAccountCosmetics, retainAccountCosmetics } from '../src/application/cosmetics.ts';
import { createAccountService, type AccountRequest } from '../src/application/account-service.ts';
import { ACCOUNT_KEYS, encodeAccount } from '../src/application/account-store.ts';
import { upgradeAccountGuides } from '../src/application/account-guides.ts';
import { upgradeEconomy } from '../src/application/economy.ts';
import { createProfile, setProfileCosmetic } from '../src/application/profile.ts';
import { cosmeticShopPage, getShopControls } from '../src/presentation/economy-ui.ts';
import { FaultStorage, makeAccountFixture } from './helpers/account-fixtures.ts';
import { sessionHost } from './helpers/session-fixtures.ts';
import type { ViewState } from '../src/presentation/view-types.ts';

function setup(wallet=900, factory=createAccountService) {
 const storage=new FaultStorage(),account=upgradeAccountGuides(retainAccountCosmetics(upgradeEconomy(makeAccountFixture({wallet}))));
 account.profile.ownedCosmetics!.push('cargo.wood','cargo.reinforced','cargo.insulated');account.profile.ownedCosmetics!.sort();account.profile.cosmetics.cargo='reinforced';account.profile.cargoOutline=true;
 for(const key of [ACCOUNT_KEYS.a,ACCOUNT_KEYS.b])storage.values.set(key,encodeAccount(account));
 const service=factory(storage,{status:'held',release(){}},()=>0);let serial=0;
 const send=(request:Record<string,unknown>)=>service.transact({operationId:`whole-crates.${++serial}`,...request} as AccountRequest,service.getSnapshot()!.generation);
 return {storage,service,send};
}

test('whole-body historical rights retain their IDs, names and prices while only nine cargo styles remain active',()=>{
 const cargo=COSMETIC_CATALOG.filter(item=>item.kind==='cargo');
 assert.equal(COSMETIC_CATALOG.length,29);assert.equal(new Set(COSMETIC_CATALOG.map(item=>item.key)).size,29);
 assert.deepEqual(cargo.map(item=>item.id),['classic','outline','insulated','reinforced','toy_brick','paper_fold','space_case','steam_brass','ocean_relic']);
 for(const [id,name] of [['wood','原木藤箱'],['reinforced','铆接钢箱'],['ice_crystal','冰晶货箱']]){
  const item=HISTORICAL_COSMETIC_CATALOG.find(item=>item.kind==='cargo'&&item.id===id);assert.ok(item);assert.equal(item.key,`cargo.${id}`);assert.equal(item.name,name);assert.equal(item.price,300);assert.equal(item.overlay,undefined);assert.equal(item.achievementId,undefined);
 }
 for(const id of ['wood','ice_crystal','lava_core'])assert.equal(cargo.some(item=>item.id===id),false);
 assert.deepEqual(FREE_COSMETICS,['cargo.classic','cargo.outline','forklift.yellow','theme.day','theme.night']);
});

test('steam cargo ownership buys once, equips independently, retains old rights and wallet across restart and reset',()=>{
 const {storage,service,send}=setup(),before=service.getSnapshot()!;
 assert.equal(send({type:'setCosmetic',kind:'cargo',id:'steam_brass'}).status,'not_committed');
 assert.equal(send({type:'purchaseCosmetic',kind:'cargo',id:'steam_brass'}).status,'acknowledged');
 assert.equal(service.getSnapshot()?.wallet,600);assert.equal(service.getSnapshot()?.profile.cosmetics.cargo,'reinforced');
 assert.equal(send({type:'purchaseCosmetic',kind:'cargo',id:'steam_brass'}).status,'acknowledged');assert.equal(service.getSnapshot()?.wallet,600);
 assert.equal(send({type:'setCosmetic',kind:'cargo',id:'steam_brass'}).status,'acknowledged');
 assert.equal(send({type:'resetResults'}).status,'acknowledged');
 const after=service.getSnapshot()!,restored=createAccountService(storage,{status:'held',release(){}},()=>0);
 assert.deepEqual(restored.getSnapshot(),after);assert.equal(after.wallet,600);assert.equal(after.profile.cosmetics.cargo,'steam_brass');assert.equal(after.profile.cargoOutline,true);
 assert.equal(after.formatVersion,before.formatVersion);assert.deepEqual(Object.keys(after.profile).sort(),Object.keys(before.profile).sort());
 assert.deepEqual(after.profile.ownedCosmetics,[...before.profile.ownedCosmetics!,'cargo.steam_brass'].sort());
 assert.doesNotThrow(()=>assertAccountCosmetics(after.profile));assert.equal(accountCosmeticState(after).cosmetics.cargo,'steam_brass');
 assert.ok(setProfileCosmetic(createProfile(),'cargo','steam_brass').error,'legacy profiles cannot acquire paid rights');
});

test('active cargo pagination retains steam selection after seven additional set retirements',()=>{
 const {service}=setup(),account=service.getSnapshot()!,view={account,profile:createProfile(),shopTab:'cosmetics',cosmeticCategory:'cargo',cosmeticPreview:{cargo:'steam_brass'}} as ViewState;
 assert.deepEqual(cosmeticShopPage(view).items.map(item=>item.id),['toy_brick','paper_fold','space_case','steam_brass']);assert.equal(cosmeticShopPage(view).page,1);assert.equal(cosmeticShopPage(view).pages,3);
});

test('steam cargo is selected from its cargo page without changing account or wallet or adding a Back layer',()=>{
 const {service}=setup(),{session,data,storage}=sessionHost(service.getSnapshot()!);
 session.action({type:'shop'});session.action({type:'selectShopTab',tab:'cosmetics'});session.action({type:'selectShopSection',section:'cargo'});
 const before=JSON.stringify(session.view.account),stored=[...data],index=COSMETIC_CATALOG.filter(item=>item.kind==='cargo').findIndex(item=>item.id==='steam_brass');storage.resetFault();
 session.action({type:'selectCosmeticPage',page:Math.floor(index/4)});
 const list=getShopControls(session.view),card=list.find(control=>control.action.type==='previewCosmetic'&&control.action.id==='steam_brass');assert.ok(card);assert.equal(cosmeticShopPage(session.view).page,1);
 assert.equal(list.filter(control=>control.action.type==='selectCosmeticPage').length,2);session.action(card.action);assert.equal(session.view.shopItemDetail,undefined);assert.equal(session.view.cosmeticPreview?.cargo,'steam_brass');
 const controls=getShopControls(session.view),buy=controls.find(control=>control.action.type==='purchaseCosmetic');assert.equal(controls.filter(control=>control.action.type==='selectShopSection').length,3);assert.equal(controls.filter(control=>control.action.type==='previewCosmetic').length,4);assert.equal(buy?.label,'300金币 · 购买');assert.equal(buy?.disabled,false);
 assert.ok(controls.find(control=>control.action.type==='previewCosmetic'&&control.action.id==='steam_brass')?.selected);session.action({type:'back'});assert.equal(session.view.screen,'menu');
 assert.equal(JSON.stringify(session.view.account),before);assert.deepEqual([...data],stored);assert.equal(storage.operations.some(op=>op.kind==='set'||op.kind==='remove'),false);
});

test('compiled free-playtest steam cargo claims preserve the wallet and survive paid-build restart',async()=>{
 const built=await build({stdin:{contents:"export {createAccountService} from './src/application/account-service.ts';",resolveDir:process.cwd(),loader:'ts'},bundle:true,write:false,platform:'node',format:'esm',define:{__PLAYTEST_FREE_SHOP__:'true'}});
 const free=await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString('base64')}`) as {createAccountService:typeof createAccountService};
 const {storage,service,send}=setup(57,free.createAccountService),before=service.getSnapshot()!;
 assert.equal(send({type:'purchaseCosmetic',kind:'cargo',id:'steam_brass'}).status,'acknowledged');assert.equal(service.getSnapshot()?.wallet,57);
 assert.equal(send({type:'setCosmetic',kind:'cargo',id:'steam_brass'}).status,'acknowledged');
 const paid=createAccountService(storage,{status:'held',release(){}},()=>0);assert.deepEqual(paid.getSnapshot(),service.getSnapshot());assert.equal(paid.getSnapshot()?.profile.cosmetics.cargo,'steam_brass');assert.equal(paid.getSnapshot()?.wallet,before.wallet);
});
