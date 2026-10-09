import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createCanvas} from '@napi-rs/canvas';
import {createAccountService, type AccountRequest} from '../src/application/account-service.ts';
import {ACCOUNT_KEYS, encodeAccount} from '../src/application/account-store.ts';
import {retainAccountCosmetics, COSMETIC_CATALOG} from '../src/application/cosmetics.ts';
import {upgradeEconomy, ITEM_PRICES} from '../src/application/economy.ts';
import {upgradeAccountGuides} from '../src/application/account-guides.ts';
import {FaultStorage, makeAccountFixture} from './helpers/account-fixtures.ts';
import type {AccountSnapshot} from '../src/application/account-types.ts';
import type {ViewState} from '../src/presentation/view-types.ts';

type API = typeof import('../src/application/account-service.ts') & typeof import('../src/presentation/economy-ui.ts') & typeof import('../src/presentation/renderer.ts') & typeof import('../src/presentation/ui.ts') & typeof import('./helpers/session-fixtures.ts');
async function compiled(flag?:boolean):Promise<API> {
 const result=await build({stdin:{contents:["export * from './src/application/account-service.ts';","export * from './src/presentation/economy-ui.ts';","export * from './src/presentation/renderer.ts';","export * from './src/presentation/ui.ts';","export * from './tests/helpers/session-fixtures.ts';"].join('\n'),resolveDir:process.cwd(),loader:'ts'},bundle:true,write:false,platform:'node',format:'esm',define:flag===undefined?{}:{__PLAYTEST_FREE_SHOP__:String(flag)}});
 assert.ok(result.outputFiles);
 return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`) as Promise<API>;
}
const [free,paid,fallback]=await Promise.all([compiled(true),compiled(false),compiled()]);
const lease=()=>({status:'held' as const,release(){}});
function setup(api:Pick<API,'createAccountService'>,wallet=0,storage=new FaultStorage()) {
 if(storage.values.size===0){const account=upgradeAccountGuides(retainAccountCosmetics(upgradeEconomy(makeAccountFixture({wallet,generation:1,lastOperation:{operationId:'fixture',expectedGeneration:0,requestDigest:'fixture',committedGeneration:1}}))));for(const key of Object.values(ACCOUNT_KEYS))storage.values.set(key,encodeAccount(account));}
 const service=api.createAccountService(storage,lease(),()=>Date.parse('2026-10-08T12:00:00Z'));storage.resetFault();return {storage,service};
}
const send=(service:ReturnType<typeof createAccountService>,request:AccountRequest)=>service.transact(request,service.getSnapshot()?.generation??0);
const claim:AccountRequest={type:'purchaseCosmetic',kind:'cargo',id:'wood',operationId:'claim.wood'};
function view(account:AccountSnapshot,patch:Partial<ViewState>={}):ViewState{return {screen:'shop',selectedPieceId:null,hoverOrigin:null,preview:null,dragPoint:null,paused:false,message:'',saveStatus:'',elapsed:0,animation:null,debug:false,needsResume:false,account,...patch};}

for(const [name,api] of [['source',{createAccountService}],['compiled false',paid],['compiled absent',fallback]] as const)test(`${name} retains regular prices and achievement gates`,()=>{
 const {service}=setup(api,1000);assert.equal(send(service,{type:'purchase',item:'rotate',operationId:'paid.tool'}).account?.wallet,920);
 assert.equal(send(service,claim).account?.wallet,620);
 const before=service.getSnapshot();assert.equal(send(service,{type:'purchaseCosmetic',kind:'forklift',id:'red',operationId:'locked'}).status,'not_committed');assert.deepEqual(service.getSnapshot(),before);
 assert.deepEqual(ITEM_PRICES,{rotate:80,clear:120,wildcard:160});assert.deepEqual([...new Set(COSMETIC_CATALOG.filter(item=>item.price>0).map(item=>item.price))].sort((a,b)=>a-b),[300,600,900]);
});

test('compiled free tool claims preserve wallet bytes and increment real inventory once per receipt',()=>{
 for(const wallet of [0,57,1000]){const {service,storage}=setup(free,wallet);const before=JSON.stringify(service.getSnapshot()!.wallet);
  for(const item of ['rotate','clear','wildcard'] as const){const request:AccountRequest={type:'purchase',item,operationId:`free.${item}`},generation=service.getSnapshot()!.generation;
   const result=service.transact(request,generation);assert.equal(result.status,'acknowledged',result.message);assert.equal(JSON.stringify(result.account?.wallet),before);assert.equal(result.account?.inventory[item],1);
   const writes=storage.operations.filter(op=>op.kind==='set').length;assert.equal(service.transact(request,generation).status,'acknowledged');assert.equal(service.getSnapshot()?.inventory[item],1);assert.equal(storage.operations.filter(op=>op.kind==='set').length,writes);
  }
 }
});

test('compiled free cosmetics include achievement colors without awarding achievements or equipping',()=>{
 const {service}=setup(free,57),before=service.getSnapshot()!;
 for(const item of COSMETIC_CATALOG.filter(item=>!before.profile.ownedCosmetics!.includes(item.key))){const result=send(service,{type:'purchaseCosmetic',kind:item.kind,id:item.id,operationId:`free.${item.key}`});assert.equal(result.status,'acknowledged',`${item.key}: ${result.message}`);assert.ok(result.account?.profile.ownedCosmetics?.includes(item.key));assert.equal(result.account?.wallet,57);}
 const after=service.getSnapshot()!;assert.deepEqual(after.profile.cosmetics,before.profile.cosmetics);assert.deepEqual(after.profile.legacyResults,before.profile.legacyResults);assert.deepEqual(after.profile.results,before.profile.results);assert.deepEqual(after.guides,before.guides);assert.deepEqual(free.accountDisplayProfile(after).achievements,free.accountDisplayProfile(before).achievements);
});

test('duplicate cosmetic claims with fresh operation ids leave both durable roots and generation unchanged',()=>{
 const {service,storage}=setup(free,1000);assert.equal(send(service,claim).status,'acknowledged');const before=service.getSnapshot(),roots=[...storage.values];storage.resetFault();
 for(let i=0;i<3;i++){const result=send(service,{...claim,operationId:`duplicate.${i}`});assert.equal(result.status,'acknowledged');assert.deepEqual(result.account,before);}
 assert.deepEqual([...storage.values],roots);assert.equal(storage.operations.filter(op=>op.kind==='set'||op.kind==='remove').length,0);
});

test('compiled UI shows free claims at zero wallet, separate equip, and paid fallback shortages',()=>{
 const {service}=setup(free),account=service.getSnapshot()!;
 const tools=free.getShopControls(view(account)).filter(c=>c.action.type==='purchase');assert.equal(tools.length,3);for(const c of tools){assert.equal(c.label,'领取');assert.equal(c.disabled,false);}
 const state=paid.sessionHost({wallet:0}).session.state,ctx=createCanvas(1080,1920).getContext('2d') as unknown as CanvasRenderingContext2D;
 for(const item of COSMETIC_CATALOG.filter(item=>!account.profile.ownedCosmetics!.includes(item.key))){
  const detail=view(account,{shopTab:'cosmetics',shopSection:item.kind,shopItemDetail:{kind:item.kind,id:item.id}}),controls=free.getShopControls(detail),button=controls.find(c=>c.action.type==='purchaseCosmetic');
  assert.deepEqual(controls.map(c=>c.action.type),['closeShopDetail','purchaseCosmetic']);assert.deepEqual(button?.action,{type:'purchaseCosmetic',kind:item.kind,id:item.id});assert.equal(button?.label,'领取');assert.equal(button?.disabled,false);assert.equal(free.cosmeticStatus(item,view(account)),'试玩免费');
  const paidButton=paid.getShopControls(detail).find(c=>c.action.type==='purchaseCosmetic');assert.equal(paidButton?.disabled,true);assert.equal(paidButton?.label,item.achievementId?'成就解锁':`购买\n${item.price}金币`);
  const labels:string[]=[];ctx.fillText=value=>labels.push(value);paid.render(ctx,state,detail);assert.ok(labels.includes(item.achievementId?item.description:`还差${item.price}金币`),`${item.key} keeps its visible purchase restriction`);
 }
 assert.ok(paid.getShopControls(view(account)).filter(c=>c.action.type==='purchase').every(c=>c.disabled&&c.label.includes('还差')));
 assert.equal(send(service,claim).status,'acknowledged');const owned=service.getSnapshot()!,v=view(owned,{shopTab:'cosmetics',shopSection:'cargo',shopItemDetail:{kind:'cargo',id:'wood'}});assert.equal(free.getShopControls(v).find(c=>c.action.type==='equipCosmetic')?.label,'装备');owned.profile.cosmetics.cargo='wood';assert.equal(free.getShopControls(v).find(c=>c.action.type==='equipCosmetic')?.label,'使用中');
});

test('actual compiled Session permits free zero-wallet and achievement claims through confirmation, cancel, and equip',()=>{
 for(const item of [COSMETIC_CATALOG.find(item=>item.key==='cargo.wood')!,COSMETIC_CATALOG.find(item=>item.key==='forklift.red')!]){
  const {session:s,data}=free.sessionHost({wallet:0});s.action({type:'shop'});s.action({type:'selectShopTab',tab:'cosmetics'});s.action({type:'selectShopSection',section:item.kind});s.action({type:'previewCosmetic',kind:item.kind,id:item.id});assert.deepEqual(s.view.shopItemDetail,{kind:item.kind,id:item.id});const before=[...data];
  s.action({type:'purchaseCosmetic',kind:item.kind,id:item.id});assert.equal(s.view.confirmation?.kind,'purchaseCosmetic');assert.equal(free.getUiControls(s.state,s.view).find(c=>c.action.type==='confirm')?.label,'确认领取');
  const ctx=createCanvas(1080,1920).getContext('2d') as unknown as CanvasRenderingContext2D,words:string[]=[];ctx.fillText=(value)=>words.push(value);free.render(ctx,s.state,s.view);assert.ok(words.some(value=>value.includes(`领取${item.name}`)));assert.ok(words.some(value=>value.includes('余额 0 → 0')));assert.equal(words.some(value=>/花费 [1-9]|还差|成就解锁/.test(value)),false);
  s.action({type:'cancel'});assert.deepEqual([...data],before);s.action({type:'purchaseCosmetic',kind:item.kind,id:item.id});s.action({type:'confirm'});assert.equal(s.view.account?.wallet,0);assert.ok(s.view.account?.profile.ownedCosmetics?.includes(item.key));assert.notEqual(s.view.account?.profile.cosmetics[item.kind],item.id);s.action({type:'equipCosmetic',kind:item.kind,id:item.id});assert.equal(s.view.account?.profile.cosmetics[item.kind],item.id);
 }
});

test('free claims retain active-run exclusion and two-tool reservation budget',()=>{
 const {service}=setup(free,1000);for(const item of ['rotate','clear','wildcard'] as const)assert.equal(send(service,{type:'purchase',item,operationId:`stock.${item}`}).status,'acknowledged');
 const intent={spec:{family:'inbound' as const,mode:'rush' as const,rulesetVersion:21 as const,seed:1,guided:false as const,toolCharges:{rotate:0 as const,clear:0 as const,wildcard:0 as const}},items:['rotate','clear','wildcard'] as Array<'rotate'|'clear'|'wildcard'>,guide:'direct' as const};
 assert.equal(send(service,{type:'start',operationId:'over.cap',intent}).status,'not_committed');assert.equal(send(service,{type:'start',operationId:'start',intent:{...intent,items:['rotate','clear']}}).status,'acknowledged');const before=service.getSnapshot();
 for(const request of [claim,{type:'purchase' as const,item:'wildcard' as const,operationId:'active.tool'}])assert.equal(send(service,request).status,'not_committed');assert.deepEqual(service.getSnapshot(),before);
 assert.ok(free.getShopControls(view(before!)).filter(c=>c.action.type==='purchase').every(c=>c.disabled));
});

for(const request of [{type:'purchase' as const,item:'rotate' as const,operationId:'fault.tool'},claim])test(`free ${request.type} unknown readback recovers once after switching to a paid build`,()=>{
 const {service,storage}=setup(free,1000),before=service.getSnapshot()!,originalSet=storage.set.bind(storage),originalGet=storage.get.bind(storage);let blocked=false;
 storage.set=(key,value)=>{originalSet(key,value);if(key===ACCOUNT_KEYS.b)blocked=true;};storage.get=key=>{if(blocked)throw Error('readback unavailable');return originalGet(key);};
 const result=service.transact(request,before.generation);assert.equal(result.status,'unknown');assert.deepEqual(service.getSnapshot(),before);storage.get=originalGet;storage.set=originalSet;
 const restarted=paid.createAccountService(storage,lease(),()=>0);assert.equal(restarted.getStatus(),'degraded');assert.equal(restarted.retryPending(request.operationId).status,'acknowledged');const recovered=restarted.getSnapshot()!;assert.equal(recovered.wallet,1000);assert.equal(recovered.generation,before.generation+1);
 if(request.type==='purchase')assert.equal(recovered.inventory.rotate,1);else assert.equal(recovered.profile.ownedCosmetics?.filter(key=>key==='cargo.wood').length,1);
 const writes=storage.operations.filter(op=>op.kind==='set').length;assert.equal(restarted.transact(request,before.generation).status,'acknowledged');assert.equal(storage.operations.filter(op=>op.kind==='set').length,writes);
 assert.equal(send(restarted,{type:'purchase',item:'clear',operationId:'paid.again'}).account?.wallet,880);if(request.type==='purchaseCosmetic')assert.ok(restarted.getSnapshot()?.profile.ownedCosmetics?.includes('cargo.wood'));
});

test('paid rollback retains free achievement rights, prior ownership and wallet, and charges only new purchases',()=>{
 const {service,storage}=setup(free,1000);assert.equal(send(service,claim).status,'acknowledged');assert.equal(send(service,{type:'purchaseCosmetic',kind:'forklift',id:'red',operationId:'free.red'}).status,'acknowledged');const before=service.getSnapshot()!;
 const restored=paid.createAccountService(storage,lease(),()=>0);assert.deepEqual(restored.getSnapshot(),before);assert.equal(send(restored,{type:'setCosmetic',kind:'forklift',id:'red',operationId:'equip.red'}).status,'acknowledged');assert.equal(send(restored,{type:'purchaseCosmetic',kind:'theme',id:'harbor',operationId:'paid.harbor'}).account?.wallet,100);assert.ok(restored.getSnapshot()?.profile.ownedCosmetics?.includes('cargo.wood'));assert.ok(restored.getSnapshot()?.profile.ownedCosmetics?.includes('forklift.red'));assert.equal(free.accountDisplayProfile(restored.getSnapshot()!).achievements.includes('five_shifts'),false);
});

for(const request of [{type:'purchase' as const,item:'rotate' as const,operationId:'matrix.tool'},claim])test(`free ${request.type} remains atomic through every before/after storage fault and later paid recovery`,()=>{
 const probe=setup(free,57);assert.equal(send(probe.service,request).status,'acknowledged');const operations=probe.storage.operations.length;
 for(const timing of ['before','after'] as const)for(let at=1;at<=operations;at++){
  const {storage,service}=setup(free,57),before=service.getSnapshot()!;storage.resetFault({at,timing});const result=service.transact(request,before.generation);
  assert.ok(['acknowledged','committed_unmirrored','not_committed','unknown'].includes(result.status),`${timing} ${at}: ${result.status}`);if(result.status!=='acknowledged')assert.deepEqual(service.getSnapshot(),before);
  storage.resetFault();const recovery=free.createAccountService(storage,lease(),()=>0);
  if(recovery.getStatus()==='degraded')assert.equal(recovery.retryPending(request.operationId).status,'acknowledged');
  assert.equal(recovery.transact(request,before.generation).status,'acknowledged',`${timing} ${at}`);
  const recovered=recovery.getSnapshot()!;assert.equal(recovered.generation,before.generation+1);assert.equal(recovered.wallet,57);
  if(request.type==='purchase')assert.equal(recovered.inventory.rotate,1);else assert.equal(recovered.profile.ownedCosmetics?.filter(key=>key==='cargo.wood').length,1);
  const rollback=paid.createAccountService(storage,lease(),()=>0);assert.deepEqual(rollback.getSnapshot(),recovered);const writes=storage.operations.filter(op=>op.kind==='set').length;assert.equal(rollback.transact(request,before.generation).status,'acknowledged');assert.equal(storage.operations.filter(op=>op.kind==='set').length,writes);
 }
});
