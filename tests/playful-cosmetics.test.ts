import test from 'node:test';
import assert from 'node:assert/strict';
import { COSMETIC_CATALOG, FREE_COSMETICS, accountCosmeticState } from '../src/application/cosmetics.ts';
import { createAccountService, type AccountRequest } from '../src/application/account-service.ts';
import { ACCOUNT_KEYS, encodeAccount } from '../src/application/account-store.ts';
import { createProfile, setProfileCosmetic } from '../src/application/profile.ts';
import { FaultStorage, makeAccountFixture } from './helpers/account-fixtures.ts';

const NEW = [
  ['theme', 'toy_workshop', 900], ['theme', 'paper_warehouse', 900], ['theme', 'space_cargo', 900],
  ['cargo', 'toy_brick', 300], ['cargo', 'paper_fold', 300], ['cargo', 'space_case', 300],
  ['forklift', 'toy', 600], ['forklift', 'paper', 600], ['forklift', 'space', 600],
] as const;
function setup(wallet = 5400) {
  const storage = new FaultStorage(), account = makeAccountFixture({ wallet });
  const raw = encodeAccount(account); storage.values.set(ACCOUNT_KEYS.a, raw); storage.values.set(ACCOUNT_KEYS.b, raw);
  const service = createAccountService(storage, { status: 'held', release() {} }, () => 0);
  let serial = 0;
  const transact = (request: Record<string, unknown>) => service.transact({ operationId: `playful.${++serial}`, ...request } as AccountRequest, service.getSnapshot()!.generation);
  return { storage, service, transact, raw };
}

test('nine independent playful cosmetics extend the exact old catalog in category order at existing price anchors', () => {
  assert.equal(COSMETIC_CATALOG.length, 53);
  assert.equal(new Set(COSMETIC_CATALOG.map(item => item.key)).size, 53);
  for (const [kind, ids] of [
    ['theme', ['day', 'night', 'harbor', 'cold_chain', 'rail_freight', 'express_sorting', 'toy_workshop', 'paper_warehouse', 'space_cargo']],
    ['cargo', ['classic', 'outline', 'wood', 'insulated', 'reinforced', 'taped', 'toy_brick', 'paper_fold', 'space_case', 'ice_crystal']],
    ['forklift', ['yellow', 'blue', 'red', 'white', 'electric', 'heavy', 'compact', 'toy', 'paper', 'space']],
  ] as const) assert.deepEqual(COSMETIC_CATALOG.filter(item => item.kind === kind).slice(0, ids.length).map(item => item.id), ids);
  for (const [kind, id, price] of NEW) {
    const item = COSMETIC_CATALOG.find(item => item.key === `${kind}.${id}`);
    assert.equal(item?.price, price); assert.equal(item?.achievementId, undefined); assert.equal(item?.overlay, undefined);
    assert.ok(item?.name && item.description);
  }
  assert.deepEqual(FREE_COSMETICS, ['cargo.classic', 'cargo.outline', 'forklift.yellow', 'theme.day', 'theme.night']);
  assert.deepEqual(COSMETIC_CATALOG.filter(item => item.achievementId).map(item => [item.key, item.achievementId, item.price]), [
    ['forklift.blue', 'first_shipment', 0], ['forklift.red', 'five_shifts', 0],
  ]);
  for (const [key, price] of [['cargo.wood', 300], ['forklift.white', 600], ['theme.harbor', 900]] as const) assert.equal(COSMETIC_CATALOG.find(item => item.key === key)?.price, price);
});

test('each new item is an independent permanent purchase, equips free, survives reset and restores from both roots', () => {
  for (const [kind, id, price] of NEW) {
    const { storage, service, transact } = setup();
    const initial = service.getSnapshot()!;
    const bought = transact({ type: 'purchaseCosmetic', kind, id });
    assert.equal(bought.status, 'acknowledged', id);
    assert.equal(bought.account?.wallet, initial.wallet - price);
    assert.equal(bought.account?.formatVersion, 4);
    assert.deepEqual(bought.account?.profile.cosmetics, initial.profile.cosmetics, 'purchase never silently equips');
    assert.deepEqual(accountCosmeticState(bought.account).ownedCosmetics, [...FREE_COSMETICS, `${kind}.${id}`].sort());
    assert.equal(transact({ type: 'purchaseCosmetic', kind, id }).status, 'acknowledged');
    assert.equal(service.getSnapshot()?.wallet, initial.wallet - price, 'duplicate purchase never charges');
    assert.equal(transact({ type: 'setCosmetic', kind, id }).status, 'acknowledged');
    assert.equal(service.getSnapshot()?.profile.cosmetics[kind], id);
    assert.equal(service.getSnapshot()?.wallet, initial.wallet - price);
    assert.equal(transact({ type: 'setCargoOutline', enabled: true }).status, 'acknowledged');
    assert.equal(transact({ type: 'resetResults' }).status, 'acknowledged');
    const restored = createAccountService(storage, { status: 'held', release() {} }, () => 0);
    assert.equal(restored.getStatus(), 'ready');
    assert.deepEqual(restored.getSnapshot(), service.getSnapshot());
    assert.equal(restored.getSnapshot()?.profile.cosmetics[kind], kind === 'cargo' ? 'classic' : id, 'explicit outline selection restores classic body');
    assert.equal(restored.getSnapshot()?.profile.cargoOutline, true);
    assert.ok(restored.getSnapshot()?.profile.ownedCosmetics?.includes(`${kind}.${id}`));
    assert.equal(storage.values.get(ACCOUNT_KEYS.a), storage.values.get(ACCOUNT_KEYS.b));
  }
});

test('new paid styles cannot be equipped unowned, bought with insufficient funds, or smuggled through the legacy profile', () => {
  for (const [kind, id, price] of NEW) {
    const { storage, service, transact, raw } = setup(price - 1); storage.resetFault();
    assert.equal(transact({ type: 'setCosmetic', kind, id }).status, 'not_committed');
    assert.equal(transact({ type: 'purchaseCosmetic', kind, id }).status, 'not_committed');
    assert.deepEqual([...storage.values.values()], [raw, raw]);
    assert.equal(storage.operations.some(op => op.kind === 'set'), false);
    assert.equal(service.getSnapshot()?.wallet, price - 1);
    assert.ok(setProfileCosmetic(createProfile(), kind, id).error);
  }
});

test('a mixed playful loadout retains all nine separately owned items without adding account fields', () => {
  const { service, transact } = setup();
  for (const [kind, id] of NEW) assert.equal(transact({ type: 'purchaseCosmetic', kind, id }).status, 'acknowledged');
  assert.equal(service.getSnapshot()?.wallet, 0);
  for (const [kind, id] of [['theme', 'toy_workshop'], ['cargo', 'paper_fold'], ['forklift', 'space']] as const) assert.equal(transact({ type: 'setCosmetic', kind, id }).status, 'acknowledged');
  assert.deepEqual(service.getSnapshot()?.profile.cosmetics, { theme: 'toy_workshop', cargo: 'paper_fold', forklift: 'space' });
  assert.equal(service.getSnapshot()?.profile.ownedCosmetics?.length, 14);
  assert.deepEqual(Object.keys(service.getSnapshot()!.profile).sort(), ['settings', 'cosmetics', 'legacyResults', 'results', 'ownedCosmetics', 'cargoOutline'].sort());
});

test('each new category keeps purchase rights private until a failed mirror is repaired and retry charges once', () => {
  for (const [kind, id, price] of [NEW[0], NEW[3], NEW[6]]) {
    const { storage, service } = setup(); const set = storage.set.bind(storage);
    storage.set = (key, value) => { if (key === ACCOUNT_KEYS.a) throw Error('mirror offline'); set(key, value); };
    const request: AccountRequest = { type: 'purchaseCosmetic', operationId: 'playful.retry', kind, id };
    assert.equal(service.transact(request, 0).status, 'committed_unmirrored');
    assert.equal(accountCosmeticState(service.getSnapshot()).ownedCosmetics.includes(`${kind}.${id}`), false);
    const restored = createAccountService(storage, { status: 'held', release() {} }, () => 0);
    assert.equal(restored.getSnapshot(), null); storage.set = set;
    assert.equal(restored.retryPending('playful.retry').status, 'acknowledged');
    assert.equal(restored.getSnapshot()?.wallet, 5400 - price);
    assert.equal(restored.transact(request, 0).status, 'acknowledged');
    assert.equal(restored.getSnapshot()?.wallet, 5400 - price);
  }
});

import {GameSession} from '../src/application/session.ts';
import {sessionHost} from './helpers/session-fixtures.ts';
import {getUiControls} from '../src/presentation/ui.ts';
import {SHOP_CARD_HEIGHT,SHOP_CARD_GAP,SHOP_LIST_RECT,shopScrollLimit,shopScrollOffset} from '../src/presentation/shop-layout.ts';
import {playableChecksum} from '../src/domain/playable.ts';

// Every playful item remains reachable through the real scrolling list and pointer targets.
test('scrolling shop cards open details and cancel, buy, equip, reload and reset each new item',()=>{
 for(const [kind,id,price] of NEW){
  const h=sessionHost({wallet:price}),s=h.session,checksum=playableChecksum(s.state);
  const click=(type:string,target?:string)=>{const control=getUiControls(s.state,s.view).find(c=>c.action.type===type&&(target===undefined||'id' in c.action&&c.action.id===target||'section' in c.action&&c.action.section===target||'tab' in c.action&&c.action.tab===target));assert.ok(control,`${kind}.${id}/${type}/${target}`);const point={x:control.rect.x+control.rect.w/2,y:control.rect.y+control.rect.h/2};s.input.down(point);s.input.up(point);return control;};
  click('shop');click('selectShopTab','cosmetics');click('selectShopSection',kind);
  const options=COSMETIC_CATALOG.filter(item=>item.kind===kind),targetRow=Math.floor(options.findIndex(item=>item.id===id)/2),stored=[...h.data];
  s.action({type:'scrollShop',deltaY:targetRow*(SHOP_CARD_HEIGHT+SHOP_CARD_GAP)});
  const offset=shopScrollOffset(s.view);assert.ok(offset>0);
  assert.equal(getUiControls(s.state,s.view).some(c=>c.action.type==='purchaseCosmetic'),false,'list cards only open details');
  click('previewCosmetic',id);assert.deepEqual(s.view.shopItemDetail,{kind,id});assert.deepEqual([...h.data],stored);
  assert.equal(getUiControls(s.state,s.view).some(c=>c.action.type==='selectShopSection'||c.action.type==='previewCosmetic'),false);
  click('closeShopDetail');assert.equal(s.view.shopItemDetail,undefined);assert.equal(s.view.shopSection,kind);assert.equal(shopScrollOffset(s.view),offset);click('previewCosmetic',id);
  const before=[...h.data];click('purchaseCosmetic',id);assert.equal(s.view.confirmation?.kind,'purchaseCosmetic');s.action({type:'cancel'});assert.deepEqual([...h.data],before);
  click('purchaseCosmetic',id);s.action({type:'confirm'});s.action({type:'confirm'});assert.equal(s.view.account?.wallet,0);click('equipCosmetic',id);assert.equal(s.view.account?.profile.cosmetics[kind],id);
  s.action({type:'resetProfile'});s.action({type:'confirm'});const restored=new GameSession(h.platform,{seed:71,mode:'standard'});assert.equal(restored.view.account?.profile.cosmetics[kind],id);assert.equal(restored.view.account?.wallet,0);assert.equal(playableChecksum(s.state),checksum);
 }
});

test('all 53 rights coexist and every scrolling item retains 44 CSS pixel disjoint controls at 360px',()=>{
 const {service,transact}=setup(COSMETIC_CATALOG.reduce((sum,item)=>sum+item.price,0));
 for(const item of COSMETIC_CATALOG.filter(item=>item.price>0))assert.equal(transact({type:'purchaseCosmetic',kind:item.kind,id:item.id}).status,'acknowledged');
 const account=service.getSnapshot()!;account.profile.ownedCosmetics!.push('forklift.blue','forklift.red');account.profile.ownedCosmetics!.sort();
 assert.equal(accountCosmeticState(account).ownedCosmetics.length,53);
 const h=sessionHost(account),s=h.session;assert.equal(s.view.account?.profile.ownedCosmetics?.length,53,'all 53 rights reload through real account validation');s.action({type:'shop'});s.action({type:'selectShopTab',tab:'cosmetics'});
 const seen=new Set<string>();
 for(const kind of ['theme','cargo','forklift'] as const){
  s.action({type:'selectShopSection',section:kind});const options=COSMETIC_CATALOG.filter(item=>item.kind===kind),limit=shopScrollLimit(s.view),seenCategory=new Set<string>();
  assert.equal(options.length,kind==='forklift'?19:17);
  for(let offset=0;offset<=limit+50;offset+=50){
   s.action({type:'scrollShop',deltaY:offset-shopScrollOffset(s.view)});assert.equal(shopScrollOffset(s.view),Math.min(offset,limit));
   const controls=getUiControls(s.state,s.view);
   assert.equal(controls.some(c=>['selectCosmeticPage','selectCosmeticSetPage','purchaseCosmetic','equipCosmetic'].includes(c.action.type)),false);
   for(const [index,control] of controls.entries()){
    assert.ok(control.rect.w/3>=44&&control.rect.h/3>=44);assert.ok(control.rect.x>=0&&control.rect.x+control.rect.w<=1080&&control.rect.y>=0&&control.rect.y+control.rect.h<=1920);for(const other of controls.slice(index+1))assert.ok(control.rect.x+control.rect.w<=other.rect.x||other.rect.x+other.rect.w<=control.rect.x||control.rect.y+control.rect.h<=other.rect.y||other.rect.y+other.rect.h<=control.rect.y);
    if(control.action.type==='previewCosmetic'){assert.equal(control.action.kind,kind);seenCategory.add(control.action.id);seen.add(`${kind}.${control.action.id}`);assert.ok(control.rect.y>=SHOP_LIST_RECT.y&&control.rect.y+control.rect.h<=SHOP_LIST_RECT.y+SHOP_LIST_RECT.h);}
   }
  }
  assert.deepEqual([...seenCategory].sort(),options.map(item=>item.id).sort());
 }
 assert.deepEqual([...seen].sort(),COSMETIC_CATALOG.map(item=>item.key).sort());
});
