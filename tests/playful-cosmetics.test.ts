import test from 'node:test';
import assert from 'node:assert/strict';
import { COSMETIC_CATALOG, HISTORICAL_COSMETIC_CATALOG, FREE_COSMETICS, accountCosmeticState } from '../src/application/cosmetics.ts';
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
  assert.equal(COSMETIC_CATALOG.length, 29);
  assert.equal(new Set(COSMETIC_CATALOG.map(item => item.key)).size, 29);
  for (const [kind, ids] of [
    ['theme', ['day', 'night', 'cold_chain', 'rail_freight', 'toy_workshop', 'paper_warehouse', 'space_cargo']],
    ['cargo', ['classic', 'outline', 'insulated', 'reinforced', 'toy_brick', 'paper_fold', 'space_case']],
    ['forklift', ['yellow', 'blue', 'red', 'white', 'electric', 'heavy', 'toy', 'paper', 'space']],
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
  for (const [key, price] of [['cargo.insulated', 300], ['forklift.white', 600], ['theme.cold_chain', 900]] as const) assert.equal(COSMETIC_CATALOG.find(item => item.key === key)?.price, price);
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
import {cosmeticShopPage,selectedShopCosmetic} from '../src/presentation/economy-ui.ts';
import {playableChecksum} from '../src/domain/playable.ts';

// Every playful item remains reachable through v23 page controls and same-screen text tiles.
test('v23 paginated item previews cancel, buy, equip, reload and reset each new item through real pointer targets',()=>{
 for(const [kind,id,price] of NEW){
  const h=sessionHost({wallet:price}),s=h.session,checksum=playableChecksum(s.state),initialAccount=structuredClone(s.view.account),stored=[...h.data];h.storage.resetFault();
  const click=(type:string,target?:string|number)=>{const control=getUiControls(s.state,s.view).find(c=>c.action.type===type&&(target===undefined||'id' in c.action&&c.action.id===target||'section' in c.action&&c.action.section===target||'tab' in c.action&&c.action.tab===target||'page' in c.action&&c.action.page===target));assert.ok(control,`${kind}.${id}/${type}/${target}`);assert.equal(!!control.disabled,false);const point={x:control.rect.x+control.rect.w/2,y:control.rect.y+control.rect.h/2};s.input.down(point);s.input.up(point);return control;};
  const options=COSMETIC_CATALOG.filter(item=>item.kind===kind),targetPage=Math.floor(options.findIndex(item=>item.id===id)/4);
  const openItem=()=>{
   click('shop');click('selectShopTab','cosmetics');click('selectShopSection',kind);
   for(let page=1;page<=targetPage;page++){click('selectCosmeticPage',page);assert.equal(cosmeticShopPage(s.view).page,page);}
   click('previewCosmetic',id);assert.equal(s.view.shopItemDetail,undefined);assert.equal(s.view.cosmeticPreview?.[kind],id);assert.equal(selectedShopCosmetic(s.view).id,id);assert.equal(cosmeticShopPage(s.view).page,targetPage);
   const controls=getUiControls(s.state,s.view);assert.equal(controls.filter(c=>c.action.type==='selectShopSection').length,3);assert.equal(controls.filter(c=>c.action.type==='previewCosmetic').length,Math.min(4,options.length-targetPage*4));assert.equal(controls.some(c=>c.action.type==='closeShopDetail'),false);assert.ok(controls.find(c=>c.action.type==='previewCosmetic'&&c.action.id===id)?.selected);
   assert.equal(controls.find(c=>c.action.type==='purchaseCosmetic')?.label,`${price}金币 · 购买`);
  };
  openItem();click('back');assert.equal(s.view.screen,'menu','ordinary preview adds no extra Back layer');openItem();
  assert.deepEqual([...h.data],stored);assert.deepEqual(s.view.account,initialAccount);assert.equal(playableChecksum(s.state),checksum);assert.equal(h.storage.operations.some(op=>op.kind==='set'||op.kind==='remove'),false);
  const before=[...h.data];click('purchaseCosmetic',id);assert.equal(s.view.confirmation?.kind,'purchaseCosmetic');s.action({type:'cancel'});assert.deepEqual([...h.data],before);assert.deepEqual(s.view.account,initialAccount);assert.equal(h.storage.operations.some(op=>op.kind==='set'||op.kind==='remove'),false);
  click('purchaseCosmetic',id);s.action({type:'confirm'});s.action({type:'confirm'});assert.equal(s.view.account?.wallet,0);assert.deepEqual(s.view.account?.profile.cosmetics,initialAccount?.profile.cosmetics,'buying never silently equips');assert.deepEqual(accountCosmeticState(s.view.account).ownedCosmetics,[...FREE_COSMETICS,`${kind}.${id}`].sort());
  click('equipCosmetic',id);assert.equal(s.view.account?.profile.cosmetics[kind],id);assert.equal(s.view.account?.wallet,0,'equipping costs no coins');
  s.action({type:'resetProfile'});s.action({type:'confirm'});const restored=new GameSession(h.platform,{seed:71,mode:'standard'});assert.equal(restored.view.account?.profile.cosmetics[kind],id);assert.equal(restored.view.account?.wallet,0);assert.deepEqual(accountCosmeticState(restored.view.account).ownedCosmetics,[...FREE_COSMETICS,`${kind}.${id}`].sort());assert.equal(h.data.get(ACCOUNT_KEYS.a),h.data.get(ACCOUNT_KEYS.b));assert.equal(playableChecksum(s.state),checksum);
 }
});

test('all 53 historical rights coexist and every active paginated item retains read-only 44 CSS pixel disjoint controls at 320px',()=>{
 const {service,transact}=setup(COSMETIC_CATALOG.reduce((sum,item)=>sum+item.price,0));
 for(const item of COSMETIC_CATALOG.filter(item=>item.price>0))assert.equal(transact({type:'purchaseCosmetic',kind:item.kind,id:item.id}).status,'acknowledged');
 const account=service.getSnapshot()!;account.profile.ownedCosmetics!.push(...HISTORICAL_COSMETIC_CATALOG.filter(item=>!COSMETIC_CATALOG.includes(item)).map(item=>item.key),'forklift.blue','forklift.red');account.profile.ownedCosmetics!.sort();
 assert.equal(accountCosmeticState(account).ownedCosmetics.length,53);
 const h=sessionHost(account),s=h.session;assert.equal(s.view.account?.profile.ownedCosmetics?.length,53,'all 53 rights reload through real account validation');const before=[...h.data],initialAccount=structuredClone(s.view.account),checksum=playableChecksum(s.state);h.storage.resetFault();s.action({type:'shop'});s.action({type:'selectShopTab',tab:'cosmetics'});
 const seen=new Set<string>();
 const checkControls=()=>{
  const controls=getUiControls(s.state,s.view);
  assert.equal(controls.filter(c=>c.action.type==='selectShopSection').length,3);assert.equal(controls.some(c=>c.action.type==='purchaseCosmetic'||c.action.type==='closeShopDetail'||c.action.type==='selectCosmeticSetPage'),false);assert.equal(s.view.shopItemDetail,undefined);
  for(const [index,control] of controls.entries()){
   assert.ok(control.rect.w*320/1080>=44&&control.rect.h*320/1080>=44,control.action.type);assert.ok(control.rect.x>=0&&control.rect.x+control.rect.w<=1080&&control.rect.y>=0&&control.rect.y+control.rect.h<=1856,control.action.type);for(const other of controls.slice(index+1))assert.ok(control.rect.x+control.rect.w<=other.rect.x||other.rect.x+other.rect.w<=control.rect.x||control.rect.y+control.rect.h<=other.rect.y||other.rect.y+other.rect.h<=control.rect.y,`${control.action.type}/${other.action.type}`);
  }
  return controls;
 };
 for(const kind of ['theme','cargo','forklift'] as const){
  s.action({type:'selectShopSection',section:kind});const options=COSMETIC_CATALOG.filter(item=>item.kind===kind),seenCategory=new Set<string>();
  assert.equal(options.length,kind==='forklift'?11:9);
  for(let page=0;page<Math.ceil(options.length/4);page++){
   s.action({type:'selectCosmeticPage',page});assert.equal(cosmeticShopPage(s.view).page,page);
   const controls=checkControls(),tiles=controls.filter(c=>c.action.type==='previewCosmetic'),expected=options.slice(page*4,page*4+4);
   assert.equal(tiles.length,expected.length);assert.deepEqual(tiles.map(c=>c.action.type==='previewCosmetic'&&c.action.id),expected.map(item=>item.id));
   assert.deepEqual(controls.filter(c=>c.action.type==='selectCosmeticPage').map(c=>[c.label,!!c.disabled]),[['上一页',page===0],['下一页',page===Math.ceil(options.length/4)-1]]);
   for(const [index,control] of tiles.entries()){
    assert.equal(control.action.type,'previewCosmetic');if(control.action.type!=='previewCosmetic')throw Error('Expected a same-screen item tile');
    assert.equal(control.action.kind,kind);assert.ok(control.label.startsWith(`${expected[index].name}\n`));assert.deepEqual(control.rect,{x:132+index%2*420,y:1110+Math.floor(index/2)*170,w:396,h:150});
    const point={x:control.rect.x+control.rect.w/2,y:control.rect.y+control.rect.h/2};s.input.down(point);s.input.up(point);assert.equal(selectedShopCosmetic(s.view).id,control.action.id);assert.equal(cosmeticShopPage(s.view).page,page);checkControls();
    seenCategory.add(control.action.id);seen.add(`${kind}.${control.action.id}`);
   }
  }
  assert.deepEqual([...seenCategory].sort(),options.map(item=>item.id).sort());
 }
 assert.deepEqual([...seen].sort(),COSMETIC_CATALOG.map(item=>item.key).sort());assert.equal(seen.size,29);assert.deepEqual([...h.data],before);assert.deepEqual(s.view.account,initialAccount);assert.equal(playableChecksum(s.state),checksum);assert.equal(h.storage.operations.some(op=>op.kind==='set'||op.kind==='remove'),false);
});
