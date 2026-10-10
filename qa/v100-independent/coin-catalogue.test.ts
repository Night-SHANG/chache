import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
import { createAccountService, type AccountRequest } from '../../src/application/account-service.ts';
import { ACCOUNT_KEYS, encodeAccount, loadAccount } from '../../src/application/account-store.ts';
import { assertAccountSnapshot } from '../../src/application/account-profile.ts';
import { upgradeAccountGuides } from '../../src/application/account-guides.ts';
import { upgradeEconomy, ITEM_PRICES } from '../../src/application/economy.ts';
import { COSMETIC_CATALOG, FREE_COSMETICS, retainAccountCosmetics, accountCosmeticState } from '../../src/application/cosmetics.ts';
import { COSMETIC_SETS, quoteCosmeticSetPurchase } from '../../src/application/cosmetic-sets.ts';
import type { AccountSnapshot, ItemId } from '../../src/application/account-types.ts';
import { FaultStorage, makeAccountFixture } from '../../tests/helpers/account-fixtures.ts';
import type { UiAction } from '../../src/presentation/ui.ts';

// Separate paid compilation, never patches or loads a real player account.
const compiled = await build({ stdin: { contents: `export {createAccountService} from './src/application/account-service.ts'; export {sessionHost} from './tests/helpers/session-fixtures.ts'; export {getUiControls} from './src/presentation/ui.ts'; export {GameSession} from './src/application/session.ts';`, resolveDir: process.cwd(), loader: 'ts' }, bundle: true, write: false, platform: 'node', format: 'esm', define: { __PLAYTEST_FREE_SHOP__: 'false', __DEV_DIAGNOSTICS__: 'false' } });
const api = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`) as typeof import('../../src/application/account-service.ts') & typeof import('../../tests/helpers/session-fixtures.ts') & typeof import('../../src/presentation/ui.ts') & typeof import('../../src/application/session.ts');
const paid = COSMETIC_CATALOG.filter(x => x.price > 0), items: ItemId[] = ['rotate','clear','wildcard'];
const rootKeys = () => [ACCOUNT_KEYS.a, ACCOUNT_KEYS.b];
function account(wallet = 0, owned: string[] = []): AccountSnapshot {
  const a = upgradeAccountGuides(retainAccountCosmetics(upgradeEconomy(makeAccountFixture({ wallet }))));
  a.profile.ownedCosmetics = [...new Set([...a.profile.ownedCosmetics!, ...owned])].sort();
  return a;
}
function open(a: AccountSnapshot, factory = api.createAccountService) {
  const storage = new FaultStorage(), raw = encodeAccount(a);
  for (const key of rootKeys()) storage.values.set(key,raw);
  const service = factory(storage,{status:'held',release(){}},()=>0); storage.resetFault();
  return { a, storage, service, raw };
}
function same(h: ReturnType<typeof open>) {
  assert.deepEqual(h.service.getSnapshot(),h.a); assert.deepEqual([...h.storage.values.values()],[h.raw,h.raw]);
  assert.equal(h.storage.operations.some(x=>x.kind==='set'||x.kind==='remove'),false);
}
function tx(h: ReturnType<typeof open>, request: Record<string,unknown>, id='review.buy') {
  return h.service.transact({ ...request, operationId:id } as AccountRequest,h.service.getSnapshot()!.generation);
}
function restart(h: ReturnType<typeof open>) {
  const re = api.createAccountService(h.storage,{status:'held',release(){}},()=>0);
  assert.equal(re.getStatus(),'ready'); assert.deepEqual(re.getSnapshot(),h.service.getSnapshot());
  assert.equal(h.storage.values.get(ACCOUNT_KEYS.a),h.storage.values.get(ACCOUNT_KEYS.b));
  assert.doesNotThrow(()=>assertAccountSnapshot(re.getSnapshot())); return re;
}
function openShop(a: AccountSnapshot) {const h=api.sessionHost(a); h.session.action({type:'shop'}); return h;}
const act = (h: ReturnType<typeof openShop>, a:UiAction) => h.session.action(a);

// Authoritative catalogue counts stop this suite silently skipping an item.
test('catalogue consists of 43 paid, 5 free, 2 achievement cosmetics, 3 priced tools, 14 purchasable sets',()=>{
  assert.equal(COSMETIC_CATALOG.length,50); assert.equal(paid.length,43); assert.equal(FREE_COSMETICS.length,5);
  assert.equal(COSMETIC_CATALOG.filter(x=>x.achievementId).length,2); assert.equal(COSMETIC_SETS.length,14);
  assert.deepEqual(items.map(x=>ITEM_PRICES[x]),[80,120,160]);
});
for (const c of paid) {
  test(`single/${c.key}/exact, zero, insufficient, owned, repeat, equip and reload`,()=>{
    for(const wallet of [0,c.price-1]) {const h=open(account(wallet)); assert.equal(tx(h,{type:'purchaseCosmetic',kind:c.kind,id:c.id}).status,'not_committed');same(h);}
    const h=open(account(c.price)); const before=structuredClone(h.a.profile.cosmetics);
    assert.equal(tx(h,{type:'setCosmetic',kind:c.kind,id:c.id},'unowned.equip').status,'not_committed');same(h);
    const request={type:'purchaseCosmetic',kind:c.kind,id:c.id,operationId:'review.buy'} as AccountRequest;
    const r=h.service.transact(request,0);assert.equal(r.status,'acknowledged',r.message);assert.equal(r.account!.wallet,0);
    assert.ok(r.account!.profile.ownedCosmetics!.includes(c.key));assert.deepEqual(r.account!.profile.cosmetics,before);restart(h);
    const bought=structuredClone(h.service.getSnapshot());h.storage.resetFault();
    assert.equal(h.service.transact(request,0).status,'acknowledged');assert.equal(tx(h,request,'owned.fresh').status,'acknowledged');
    assert.deepEqual(h.service.getSnapshot(),bought);assert.equal(h.storage.operations.some(x=>x.kind==='set'),false);
    assert.equal(tx(h,{type:'setCosmetic',kind:c.kind,id:c.id},'equip').status,'acknowledged');
    assert.equal(h.service.getSnapshot()!.profile.cosmetics[c.kind],c.id);assert.equal(h.service.getSnapshot()!.wallet,0);restart(h);
  });
  test(`single/${c.key}/session cancel, double confirm, equip and reload`,()=>{
    const h=openShop(account(c.price)), s=h.session;act(h,{type:'selectShopTab',tab:'cosmetics'});act(h,{type:'selectShopSection',section:c.kind});act(h,{type:'previewCosmetic',kind:c.kind,id:c.id});
    const before=new Map(h.data), appearance=structuredClone(s.view.account!.profile.cosmetics);
    const buy:UiAction={type:'purchaseCosmetic',kind:c.kind,id:c.id};act(h,buy);assert.equal(s.view.confirmation?.kind,'purchaseCosmetic');act(h,{type:'cancel'});act(h,{type:'confirm'});assert.deepEqual(h.data,before);
    act(h,buy);act(h,{type:'confirm'});act(h,{type:'confirm'});assert.equal(s.view.account!.wallet,0);assert.deepEqual(s.view.account!.profile.cosmetics,appearance);
    const after=new Map(h.data);act(h,buy);act(h,{type:'confirm'});assert.deepEqual(h.data,after);
    act(h,{type:'equipCosmetic',kind:c.kind,id:c.id});assert.equal(s.view.account!.profile.cosmetics[c.kind],c.id);
    const re=new api.GameSession(h.platform,{seed:99,mode:'standard'});assert.deepEqual(re.view.account,s.view.account);
  });
}
for(const set of COSMETIC_SETS) for(let mask=0;mask<8;mask++) {
  const keys=(['theme','cargo','forklift'] as const).map(k=>`${k}.${set[k]}`),owned=keys.filter((_,i)=>mask&(1<<i)),missing=keys.filter(k=>!owned.includes(k));
  const original=missing.reduce((s,k)=>s+COSMETIC_CATALOG.find(c=>c.key===k)!.price,0),price=Math.ceil(original*4/5);
  test(`set/${set.id}/ownership-${mask}/exact, zero, insufficient, no refund, repeat, equip, reload`,()=>{
    assert.deepEqual(quoteCosmeticSetPurchase(set.id,{ownedCosmetics:owned}),{missingKeys:missing,originalPrice:original,price});
    if(missing.length) for(const wallet of [0,price-1]) {const h=open(account(wallet,owned));assert.equal(tx(h,{type:'purchaseCosmeticSet',id:set.id,quotedKeys:missing,quotedPrice:price}).status,'not_committed');same(h);}
    const h=open(account(price,owned)), appearance=structuredClone(h.a.profile.cosmetics); const request={type:'purchaseCosmeticSet',id:set.id,quotedKeys:missing,quotedPrice:price,operationId:'review.set'} as AccountRequest;
    assert.equal(h.service.transact(request,0).status,'acknowledged');assert.equal(h.service.getSnapshot()!.wallet,0);
    assert.ok(keys.every(k=>h.service.getSnapshot()!.profile.ownedCosmetics!.includes(k)));assert.deepEqual(h.service.getSnapshot()!.profile.cosmetics,appearance);restart(h);
    const after=structuredClone(h.service.getSnapshot());h.storage.resetFault();
    assert.equal(h.service.transact(request,0).status,'acknowledged');assert.equal(tx(h,{type:'purchaseCosmeticSet',id:set.id,quotedKeys:[],quotedPrice:0},'owned.set').status,'acknowledged');
    assert.deepEqual(h.service.getSnapshot(),after);assert.equal(h.storage.operations.some(x=>x.kind==='set'),false);
    assert.equal(tx(h,{type:'equipCosmeticSet',id:set.id},'equip.set').status,'acknowledged');
    assert.deepEqual(h.service.getSnapshot()!.profile.cosmetics,{theme:set.theme,cargo:set.cargo,forklift:set.forklift});assert.equal(h.service.getSnapshot()!.wallet,0);restart(h);
  });
  test(`set/${set.id}/ownership-${mask}/session cancellation and explicit equipment`,()=>{
    const h=openShop(account(price,owned)),s=h.session;act(h,{type:'selectShopTab',tab:'cosmetics'});act(h,{type:'selectShopSection',section:'sets'});act(h,{type:'previewCosmeticSet',id:set.id});
    const before=new Map(h.data),appearance=structuredClone(s.view.account!.profile.cosmetics);const buy:UiAction={type:'purchaseCosmeticSet',id:set.id};
    act(h,buy);
    if(missing.length){assert.equal(s.view.confirmation?.kind,'purchaseCosmeticSet');assert.equal(s.view.confirmation?.cosmeticSetQuote?.price,price);act(h,{type:'cancel'});act(h,{type:'confirm'});assert.deepEqual(h.data,before);act(h,buy);act(h,{type:'confirm'});}
    act(h,{type:'confirm'});assert.equal(s.view.account!.wallet,0);assert.deepEqual(s.view.account!.profile.cosmetics,appearance);
    assert.ok(keys.every(k=>s.view.account!.profile.ownedCosmetics!.includes(k)));act(h,{type:'equipCosmeticSet',id:set.id});
    assert.deepEqual(s.view.account!.profile.cosmetics,{theme:set.theme,cargo:set.cargo,forklift:set.forklift});
    assert.deepEqual(new api.GameSession(h.platform,{seed:99,mode:'standard'}).view.account,s.view.account);
  });
}
for(const item of items) for(const quantity of [1,2,5,100]) {
  const price=ITEM_PRICES[item]*quantity;
  test(`tool/${item}/quantity-${quantity}/exact, zero, insufficient, repeat, reload and cancel`,()=>{
    const request={type:'purchase',item,quantity,quotedPrice:price,operationId:'review.tool'} as AccountRequest;
    for(const wallet of [0,price-1]){const h=open(account(wallet));assert.equal(h.service.transact(request,0).status,'not_committed');same(h);}
    const h=open(account(price));assert.equal(h.service.transact(request,0).status,'acknowledged');assert.equal(h.service.getSnapshot()!.wallet,0);assert.equal(h.service.getSnapshot()!.inventory[item],quantity);
    const after=structuredClone(h.service.getSnapshot());assert.equal(h.service.transact(request,0).status,'acknowledged');assert.deepEqual(h.service.getSnapshot(),after);restart(h);
    const sh=openShop(account(price)),s=sh.session,before=new Map(sh.data);act(sh,{type:'purchase',item});assert.equal(s.view.confirmation?.kind,'purchase');act(sh,{type:'cancel'});act(sh,{type:'confirm'});assert.deepEqual(sh.data,before);
  });
}
for(const c of COSMETIC_CATALOG.filter(x=>x.price===0))test(`free-or-achievement/${c.key}/gate, ownership and reload`,()=>{
  const h=open(account(9999));const result=tx(h,{type:'purchaseCosmetic',kind:c.kind,id:c.id});assert.equal(result.status,c.achievementId?'not_committed':'acknowledged');same(h);
  if(c.achievementId){assert.equal(tx(h,{type:'setCosmetic',kind:c.kind,id:c.id},'locked.equip').status,'not_committed');same(h);}
  const owned=open(account(0,[c.key]));assert.equal(tx(owned,{type:'setCosmetic',kind:c.kind,id:c.id},'owned.equip').status,'acknowledged');assert.equal(owned.service.getSnapshot()!.wallet,0);restart(owned);
});
for(const theme of ['day','night'] as const)for(const cargo of ['classic','outline'] as const)for(const forklift of ['yellow','blue','red','white'] as const)test(`classic/${theme}/${cargo}/${forklift}/explicit preset, original price, reload`,()=>{
  const h=open(account(600,['forklift.blue','forklift.red','forklift.white']));
  assert.equal(tx(h,{type:'equipClassicSet',selection:{theme,cargo,forklift}}).status,'acknowledged');
  assert.deepEqual(h.service.getSnapshot()!.profile.cosmetics,{theme,cargo:'classic',forklift});assert.equal(h.service.getSnapshot()!.profile.cargoOutline,cargo==='outline');assert.equal(h.service.getSnapshot()!.wallet,600);restart(h);
  if(forklift==='white'){const fresh=open(account(599));assert.equal(tx(fresh,{type:'purchaseCosmetic',kind:'forklift',id:'white'}).status,'not_committed');same(fresh);}
  if(forklift==='blue'||forklift==='red'){const locked=open(account(9999));assert.equal(tx(locked,{type:'equipClassicSet',selection:{theme,cargo,forklift}}).status,'not_committed');same(locked);}
  assert.equal(quoteCosmeticSetPurchase('classic',{ownedCosmetics:[]}),null);
});
for(const c of paid)test(`fault/${c.key}/every before-and-after storage boundary recovers exactly once`,()=>{
  const request={type:'purchaseCosmetic',kind:c.kind,id:c.id,operationId:'review.fault'} as AccountRequest;
  const base=open(account(c.price));assert.equal(base.service.transact(request,0).status,'acknowledged');const expected=base.service.getSnapshot()!,count=base.storage.operations.length;
  for(let at=1;at<=count;at++)for(const timing of ['before','after'] as const){
    const h=open(account(c.price));h.storage.resetFault({at,timing});const r=h.service.transact(request,0);
    if(r.status!=='acknowledged')assert.deepEqual(h.service.getSnapshot(),h.a);
    h.storage.resetFault();const loaded=loadAccount(h.storage,assertAccountSnapshot);assert.ok(['ready','degraded'].includes(loaded.status));assert.deepEqual(loaded.account,loaded.account!.generation===0?h.a:expected);
    const retry=h.service.getPendingOperationId()?h.service.retryPending(request.operationId):h.service.transact(request,0);assert.equal(retry.status,'acknowledged',`${c.key}/${at}/${timing}: ${retry.message}`);assert.deepEqual(h.service.getSnapshot(),expected);restart(h);
  }
});

test('paid restart preserves all existing free-playtest permanent rights without wallet adjustments',()=>{
  const a=account(1234,COSMETIC_CATALOG.map(c=>c.key));a.inventory={rotate:20,clear:20,wildcard:20};const h=open(a);
  for(const c of paid)assert.equal(tx(h,{type:'purchaseCosmetic',kind:c.kind,id:c.id},`old.${c.key}`).status,'acknowledged');
  same(h);restart(h);assert.equal(h.service.getSnapshot()!.profile.ownedCosmetics!.length,50);
});

test('all three retired rights remain readable and neither buy nor equip can reactivate them',()=>{
  const retired=['theme.express_sorting','cargo.taped','forklift.compact'];const h=open(account(9999,retired));
  for(const key of retired){const [kind,id]=key.split('.');for(const type of ['purchaseCosmetic','setCosmetic'])assert.equal(tx(h,{type,kind,id},`old.${type}.${key}`).status,'not_committed');}
  for(const type of ['purchaseCosmeticSet','equipCosmeticSet'])assert.equal(tx(h,{type,id:'express_sorting',...(type==='purchaseCosmeticSet'?{quotedKeys:retired,quotedPrice:1440}:{})},`old.${type}`).status,'not_committed');
  same(h);restart(h);assert.ok(retired.every(k=>accountCosmeticState(h.service.getSnapshot()).ownedCosmetics.includes(k)));
});

const freeCompiled = await build({stdin:{contents:"export {createAccountService} from './src/application/account-service.ts';",resolveDir:process.cwd(),loader:'ts'},bundle:true,write:false,platform:'node',format:'esm',define:{__PLAYTEST_FREE_SHOP__:'true'}});
const freeApi=await import(`data:text/javascript;base64,${Buffer.from(freeCompiled.outputFiles[0].text).toString('base64')}`) as typeof import('../../src/application/account-service.ts');
for(const c of paid)test(`compat/free-to-paid/${c.key}/preserve old free receipt and permanent ownership`,()=>{
  const h=open(account(8765),freeApi.createAccountService),request={type:'purchaseCosmetic',kind:c.kind,id:c.id,operationId:'review.free'} as AccountRequest;
  assert.equal(h.service.transact(request,0).status,'acknowledged');assert.equal(h.service.getSnapshot()!.wallet,8765);const before=structuredClone(h.service.getSnapshot()),raw=new Map(h.storage.values);h.storage.resetFault();
  const re=api.createAccountService(h.storage,{status:'held',release(){}},()=>0);assert.deepEqual(re.getSnapshot(),before);assert.equal(re.transact(request,0).status,'acknowledged');
  assert.deepEqual(re.getSnapshot(),before);assert.deepEqual(h.storage.values,raw);assert.equal(h.storage.operations.some(x=>x.kind==='set'||x.kind==='remove'),false);
});
for(const set of COSMETIC_SETS)test(`compat/free-to-paid/set-${set.id}/preserve zero-price receipt`,()=>{
  const h=open(account(8765),freeApi.createAccountService),keys=(['theme','cargo','forklift'] as const).map(k=>`${k}.${set[k]}`),request={type:'purchaseCosmeticSet',id:set.id,quotedKeys:keys,quotedPrice:0,operationId:'review.free'} as AccountRequest;
  assert.equal(h.service.transact(request,0).status,'acknowledged');const before=structuredClone(h.service.getSnapshot()),raw=new Map(h.storage.values);h.storage.resetFault();
  const re=api.createAccountService(h.storage,{status:'held',release(){}},()=>0);assert.equal(re.transact(request,0).status,'acknowledged');assert.deepEqual(re.getSnapshot(),before);assert.deepEqual(h.storage.values,raw);assert.equal(re.getSnapshot()!.wallet,8765);
});
for(const item of items)test(`compat/free-to-paid/tool-${item}/preserve free batch receipt`,()=>{
  const h=open(account(8765),freeApi.createAccountService),request={type:'purchase',item,quantity:3,quotedPrice:0,operationId:'review.free'} as AccountRequest;
  assert.equal(h.service.transact(request,0).status,'acknowledged');const before=structuredClone(h.service.getSnapshot()),raw=new Map(h.storage.values);h.storage.resetFault();
  const re=api.createAccountService(h.storage,{status:'held',release(){}},()=>0);assert.equal(re.transact(request,0).status,'acknowledged');assert.deepEqual(re.getSnapshot(),before);assert.deepEqual(h.storage.values,raw);assert.equal(re.getSnapshot()!.wallet,8765);assert.equal(re.getSnapshot()!.inventory[item],3);
});
for(const item of items)test(`safe-integer/${item}/invalid quantities, largest paid total, overflow and stock capacity`,()=>{
  const LIMIT=Number.MAX_SAFE_INTEGER;
  for(const quantity of [0,-1,0.5,NaN,Infinity,LIMIT+1,'2',null]){const h=open(account(LIMIT));assert.equal(tx(h,{type:'purchase',item,quantity}).status,'not_committed',`${item}/${quantity}`);same(h);}
  for(const overflow of [false,true]){const h=open(account(LIMIT)),quantity=Math.floor(LIMIT/ITEM_PRICES[item])+(overflow?1:0),r=tx(h,{type:'purchase',item,quantity});assert.equal(r.status,overflow?'not_committed':'acknowledged');if(overflow)same(h);else{assert.equal(r.account!.wallet,LIMIT-quantity*ITEM_PRICES[item]);assert.equal(r.account!.inventory[item],quantity);restart(h);}}
  for(const overflow of [false,true]){const a=account(ITEM_PRICES[item]*2);a.inventory[item]=LIMIT-1;const h=open(a),quantity=overflow?2:1,r=tx(h,{type:'purchase',item,quantity});assert.equal(r.status,overflow?'not_committed':'acknowledged');if(overflow)same(h);else{assert.equal(r.account!.inventory[item],LIMIT);restart(h);}}
});
for(const set of COSMETIC_SETS)test(`fault/set-${set.id}/every before-and-after storage boundary recovers all missing members`,()=>{
  const own=[`cargo.${set.cargo}`],keys=[`theme.${set.theme}`,`forklift.${set.forklift}`],request={type:'purchaseCosmeticSet',id:set.id,quotedKeys:keys,quotedPrice:1200,operationId:'review.fault'} as AccountRequest;
  const base=open(account(1200,own));assert.equal(base.service.transact(request,0).status,'acknowledged');const expected=base.service.getSnapshot()!,count=base.storage.operations.length;
  for(let at=1;at<=count;at++)for(const timing of ['before','after'] as const){const h=open(account(1200,own));h.storage.resetFault({at,timing});const r=h.service.transact(request,0);if(r.status!=='acknowledged')assert.deepEqual(h.service.getSnapshot(),h.a);h.storage.resetFault();const loaded=loadAccount(h.storage,assertAccountSnapshot);assert.ok(['ready','degraded'].includes(loaded.status));assert.deepEqual(loaded.account,loaded.account!.generation===0?h.a:expected);const retry=h.service.getPendingOperationId()?h.service.retryPending(request.operationId):h.service.transact(request,0);assert.equal(retry.status,'acknowledged',`${set.id}/${at}/${timing}: ${retry.message}`);assert.deepEqual(h.service.getSnapshot(),expected);restart(h);}
});
for(const item of items)test(`fault/tool-${item}/batch every before-and-after storage boundary recovers whole quantity`,()=>{
  const price=ITEM_PRICES[item]*5,request={type:'purchase',item,quantity:5,quotedPrice:price,operationId:'review.fault'} as AccountRequest;
  const base=open(account(price));assert.equal(base.service.transact(request,0).status,'acknowledged');const expected=base.service.getSnapshot()!,count=base.storage.operations.length;
  for(let at=1;at<=count;at++)for(const timing of ['before','after'] as const){const h=open(account(price));h.storage.resetFault({at,timing});const r=h.service.transact(request,0);if(r.status!=='acknowledged')assert.deepEqual(h.service.getSnapshot(),h.a);h.storage.resetFault();const loaded=loadAccount(h.storage,assertAccountSnapshot);assert.ok(['ready','degraded'].includes(loaded.status));assert.deepEqual(loaded.account,loaded.account!.generation===0?h.a:expected);const retry=h.service.getPendingOperationId()?h.service.retryPending(request.operationId):h.service.transact(request,0);assert.equal(retry.status,'acknowledged',`${item}/${at}/${timing}: ${retry.message}`);assert.deepEqual(h.service.getSnapshot(),expected);restart(h);}
});
test('old partially owned v25 session keeps both raw roots, balances, stocks, equipment, achievements and scores on browse/restart',()=>{
  const a=account(5432,['cargo.wood','forklift.white']);a.inventory={rotate:5,clear:7,wildcard:9};a.profile.cosmetics={theme:'night',cargo:'wood',forklift:'white'};a.profile.cargoOutline=true;
  a.profile.legacyResults.stats={...a.profile.legacyResults.stats,orders:10,runs:2,wins:1,maxChain:3};a.profile.legacyResults.achievements=['first_shipment','five_shifts'];
  const h=openShop(a),s=h.session,before=structuredClone(s.view.account),raw=new Map(h.data);h.storage.resetFault();
  act(h,{type:'selectShopTab',tab:'cosmetics'});for(const section of ['sets','theme','cargo','forklift'] as const)act(h,{type:'selectShopSection',section});
  act(h,{type:'back'});act(h,{type:'shop'});assert.deepEqual(s.view.account,before);assert.deepEqual(h.data,raw);assert.equal(h.storage.operations.some(x=>x.kind==='set'||x.kind==='remove'),false);
  const re=new api.GameSession(h.platform,{seed:99,mode:'standard'});assert.deepEqual(re.view.account,before);assert.deepEqual(h.data,raw);
});
