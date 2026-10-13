import test from 'node:test';
import assert from 'node:assert/strict';
import {sessionHost} from './helpers/session-fixtures.ts';
import {COSMETIC_CATALOG} from '../src/application/cosmetics.ts';
import {getShopControls} from '../src/presentation/economy-ui.ts';
function fixture(){const x=sessionHost({wallet:5000});x.session.action({type:'shop'});x.session.action({type:'selectShopTab',tab:'cosmetics'});x.session.action({type:'purchaseCosmetic',kind:'theme',id:'cold_chain'});x.session.action({type:'confirm'});x.session.action({type:'previewCosmetic',kind:'theme',id:'cold_chain'});return x;}
const settle=()=>new Promise<void>(r=>setImmediate(r));
test('equip prepares its target before the existing account transaction and ignores duplicate clicks',async()=>{
 const {session,data}=fixture();let release!:(ok:boolean)=>void,calls=0;
 session.setCosmeticScenePreparation(()=>{calls++;return new Promise<boolean>(r=>{release=r;});},()=>{});
 const before=[...data];session.action({type:'equipCosmetic',kind:'theme',id:'cold_chain'});
 assert.deepEqual([...data],before);assert.equal(session.view.account?.profile.cosmetics.theme,'day');assert.ok(getShopControls(session.view).find(c=>c.action.type==='equipCosmetic')?.disabled);
 session.action({type:'equipCosmetic',kind:'theme',id:'cold_chain'});assert.equal(calls,1);release(true);await settle();assert.equal(session.view.account?.profile.cosmetics.theme,'cold_chain');assert.equal(session.view.account?.wallet,5000-COSMETIC_CATALOG.find(x=>x.key==='theme.cold_chain')!.price);
});
test('back or hide cancellation prevents a late equip preparation from writing an account',async()=>{
 for(const cancel of ['back','hide'] as const){const {session,data}=fixture();let release!:(ok:boolean)=>void;
  session.setCosmeticScenePreparation(()=>new Promise<boolean>(r=>{release=r;}),()=>{});const before=[...data];session.action({type:'equipCosmetic',kind:'theme',id:'cold_chain'});
  if(cancel==='back')session.action({type:'back'});else session.cancelCosmeticEquip();release(true);await settle();assert.deepEqual([...data],before);assert.equal(session.view.account?.profile.cosmetics.theme,'day');
 }
});
test('failed equip preparation preserves identity and bytes and an explicit click retries',async()=>{
 const {session,data}=fixture();let calls=0;session.setCosmeticScenePreparation(async()=>++calls>1,()=>{});const before=[...data];session.action({type:'equipCosmetic',kind:'theme',id:'cold_chain'});await settle();assert.deepEqual([...data],before);assert.ok(session.view.cosmeticEquipError);session.action({type:'equipCosmetic',kind:'theme',id:'cold_chain'});await settle();assert.equal(calls,2);assert.equal(session.view.account?.profile.cosmetics.theme,'cold_chain');assert.equal(session.view.cosmeticEquipError,undefined);
});
test('writer lease loss while preparing cannot publish an equip',async()=>{
 const {session,data,platform}=fixture();let release!:(ok:boolean)=>void;session.setCosmeticScenePreparation(()=>new Promise<boolean>(r=>{release=r;}),()=>{});const before=[...data];session.action({type:'equipCosmetic',kind:'theme',id:'cold_chain'});
 Object.assign(platform.writerLease!,{status:'busy'});release(true);await settle();assert.deepEqual([...data],before);assert.equal(session.view.account?.profile.cosmetics.theme,'day');
});
test('uncertain equip save keeps target prepared through hide and uses the existing exact retry',async()=>{
 const {ACCOUNT_KEYS}=await import('../src/application/account-store.ts');const {session,storage}=fixture();let cancellations=0;session.setCosmeticScenePreparation(async()=>true,()=>{cancellations++;});const set=storage.set.bind(storage),wallet=session.view.account!.wallet,generation=session.view.account!.generation;
 storage.set=(key,value)=>{if(key===ACCOUNT_KEYS.a)throw Error('mirror unavailable');set(key,value);};session.action({type:'equipCosmetic',kind:'theme',id:'cold_chain'});await settle();assert.equal(session.view.accountBlocked,true);assert.equal(session.view.account?.profile.cosmetics.theme,'day');session.cancelCosmeticEquip();assert.equal(cancellations,0);
 storage.set=set;session.action({type:'retrySave'});assert.equal(session.view.accountBlocked,false);assert.equal(session.view.account?.profile.cosmetics.theme,'cold_chain');assert.equal(session.view.account?.generation,generation+1);assert.equal(session.view.account?.wallet,wallet);
});
test('hide between acknowledged equip and the next render preserves the already-decoded committed scene',async()=>{
 const {StaticArtGate}=await import('../src/presentation/static-art-gate.ts');const {StaticArtResources}=await import('../src/presentation/static-art-resources.ts');const {STATIC_ART_RESOURCES}=await import('../src/presentation/static-art-manifest.ts');
 const {session}=fixture();let release!:()=>void,loads=0;const targetReady=new Promise<void>(r=>{release=r;});
 const resources=new StaticArtResources(async path=>{const row=Object.values(STATIC_ART_RESOURCES).find(r=>r.src===path)!;if(row.key==='scene.cold_chain'){loads++;await targetReady;}return {width:row.width,height:row.height} as CanvasImageSource;}),gate=new StaticArtGate(session,resources);
 gate.refresh();await settle();assert.equal(gate.isReady(),true);gate.didPaint();session.action({type:'equipCosmetic',kind:'theme',id:'cold_chain'});release();await settle();assert.equal(session.view.account?.profile.cosmetics.theme,'cold_chain');
 // No refresh/render occurs between the account acknowledgement and hide.
 gate.hide();gate.show();assert.equal(gate.isReady(),true);assert.equal(loads,1);assert.ok(resources.getImage('scene.cold_chain'));resources.dispose();
});
