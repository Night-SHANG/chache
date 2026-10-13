import test from 'node:test';
import assert from 'node:assert/strict';
import { COSMETIC_CATALOG, HISTORICAL_COSMETIC_CATALOG, FREE_COSMETICS, accountCosmeticState, assertAccountCosmetics, getCosmetic, retainAccountCosmetics } from '../src/application/cosmetics.ts';
import { createAccountService, type AccountRequest } from '../src/application/account-service.ts';
import { ACCOUNT_KEYS, encodeAccount } from '../src/application/account-store.ts';
import { createProfile, setProfileCosmetic } from '../src/application/profile.ts';
import { FaultStorage, makeAccountFixture } from './helpers/account-fixtures.ts';
import { sessionHost } from './helpers/session-fixtures.ts';
import { getShopControls, selectedShopCosmetic } from '../src/presentation/economy-ui.ts';
import { playableChecksum } from '../src/domain/playable.ts';
import { build } from 'esbuild';

const NEW = [
 ['theme', 'steam_foundry', '蒸汽工场', 900],
 ['theme', 'ocean_vault', '深海货库', 900],
 ['cargo', 'steam_brass', '蒸汽机匣', 300],
 ['cargo', 'ocean_relic', '深海珊瑚箱', 300],
 ['forklift', 'steam', '锅炉叉车', 600],
 ['forklift', 'diving', '潜航叉车', 600],
] as const;

function setup(wallet = 3600) {
 const storage = new FaultStorage(), raw = encodeAccount(makeAccountFixture({ wallet }));
 storage.values.set(ACCOUNT_KEYS.a, raw); storage.values.set(ACCOUNT_KEYS.b, raw);
 const service = createAccountService(storage, { status: 'held', release() {} }, () => 0);
 let serial = 0;
 const transact = (request: Record<string, unknown>) => service.transact({ operationId: `reference.${++serial}`, ...request } as AccountRequest, service.getSnapshot()!.generation);
 return { storage, service, transact, raw };
}

test('two remaining image-reference sets retain six independently priced cosmetics without removing old entitlements', () => {
 const original47 = HISTORICAL_COSMETIC_CATALOG.slice(0, 47);
 assert.equal(original47.length, 47);
 assert.equal(new Set(original47.map(item => item.key)).size, 47);
 assert.deepEqual(['theme', 'cargo', 'forklift'].map(kind => original47.filter(item => item.kind === kind).length), [15, 16, 16]);
 assert.equal(COSMETIC_CATALOG.length, 29);
 assert.equal(new Set(COSMETIC_CATALOG.map(item => item.key)).size, 29);
 for (const [kind, id, name, price] of NEW) {
  const item = getCosmetic(kind, id);
  assert.ok(item, `${kind}.${id}`); assert.equal(item.name, name); assert.equal(item.price, price);
  assert.equal(item.overlay, undefined); assert.equal(item.achievementId, undefined);
 }
 assert.deepEqual(FREE_COSMETICS, ['cargo.classic', 'cargo.outline', 'forklift.yellow', 'theme.day', 'theme.night']);
 for (const [kind, ids] of [
  ['theme', ['day', 'night', 'cold_chain', 'rail_freight', 'toy_workshop', 'paper_warehouse', 'space_cargo']],
  ['cargo', ['classic', 'outline', 'insulated', 'reinforced', 'toy_brick', 'paper_fold', 'space_case']],
  ['forklift', ['yellow', 'blue', 'red', 'white', 'electric', 'heavy', 'toy', 'paper', 'space']],
 ] as const) assert.deepEqual(COSMETIC_CATALOG.filter(item => item.kind === kind).slice(0, ids.length).map(item => item.id), ids);
});

test('all reference cosmetics buy once, equip separately, retain mixed ownership and restore through existing account formats', () => {
 const { service, transact, storage } = setup(), before = service.getSnapshot()!;
 for (const [kind, id, , price] of NEW) {
  const wallet = service.getSnapshot()!.wallet;
  assert.equal(transact({ type: 'purchaseCosmetic', kind, id }).status, 'acknowledged', id);
  assert.equal(service.getSnapshot()!.wallet, wallet - price);
  assert.equal(service.getSnapshot()!.profile.cosmetics[kind], before.profile.cosmetics[kind]);
  assert.equal(transact({ type: 'purchaseCosmetic', kind, id }).status, 'acknowledged');
  assert.equal(service.getSnapshot()!.wallet, wallet - price);
 }
 for (const [kind, id] of [['theme', 'ocean_vault'], ['cargo', 'ocean_relic'], ['forklift', 'steam']] as const) {
  assert.equal(transact({ type: 'setCosmetic', kind, id }).status, 'acknowledged');
 }
 assert.equal(transact({ type: 'setCargoOutline', enabled: true }).status, 'acknowledged');
 assert.equal(transact({ type: 'resetResults' }).status, 'acknowledged');
 const reloaded = createAccountService(storage, { status: 'held', release() {} }, () => 0);
 assert.equal(reloaded.getStatus(), 'ready'); assert.deepEqual(reloaded.getSnapshot(), service.getSnapshot());
 assert.equal(reloaded.getSnapshot()!.wallet, 0);
 assert.deepEqual(reloaded.getSnapshot()!.profile.cosmetics, { theme: 'ocean_vault', cargo: 'classic', forklift: 'steam' });
 assert.equal(accountCosmeticState(reloaded.getSnapshot()).ownedCosmetics.length, FREE_COSMETICS.length + 6);
 assert.equal(reloaded.getSnapshot()!.profile.cargoOutline, true);
 assert.equal(storage.values.get(ACCOUNT_KEYS.a), storage.values.get(ACCOUNT_KEYS.b));
});

test('new sets never bypass owned checks, insufficient funds or legacy-profile parsing', () => {
 for (const [kind, id, , price] of NEW) {
  const { service, transact, storage, raw } = setup(price - 1); storage.resetFault();
  assert.equal(transact({ type: 'setCosmetic', kind, id }).status, 'not_committed');
  assert.equal(transact({ type: 'purchaseCosmetic', kind, id }).status, 'not_committed');
  assert.equal(service.getSnapshot()!.wallet, price - 1);
  assert.deepEqual([...storage.values.values()], [raw, raw]);
  assert.equal(storage.operations.some(operation => operation.kind === 'set'), false);
  assert.ok(setProfileCosmetic(createProfile(), kind, id).error);
 }
 const account = retainAccountCosmetics(makeAccountFixture());
 account.profile.ownedCosmetics = COSMETIC_CATALOG.map(item => item.key).sort();
 assert.doesNotThrow(() => assertAccountCosmetics(account.profile));
 account.profile.ownedCosmetics.push('cargo.future_unknown'); account.profile.ownedCosmetics.sort();
 assert.throws(() => assertAccountCosmetics(account.profile), /原记录已保留/);
});

test('paginated reference tiles remain preview-only on the same screen and preserve 44px controls', () => {
 const { session, data, storage } = sessionHost({ wallet: 10800 }), checksum = playableChecksum(session.state);
 session.action({ type: 'shop' }); session.action({ type: 'selectShopTab', tab: 'cosmetics' });
 const before = [...data], account = JSON.stringify(session.view.account);storage.resetFault();
 for (const [kind, id] of NEW) {
  session.action({ type: 'selectShopSection', section: kind });
  const index = COSMETIC_CATALOG.filter(item => item.kind === kind).findIndex(item => item.id === id);
  session.action({ type: 'selectCosmeticPage', page: Math.floor(index / 4) });
  const list = getShopControls(session.view), card = list.find(control => control.action.type === 'previewCosmetic' && control.action.kind === kind && control.action.id === id);
  assert.ok(card, `${kind}.${id} remains reachable by pagination`);
  assert.equal(list.filter(control => control.action.type === 'selectCosmeticPage').length, 2);
  session.action(card.action);
  const controls = getShopControls(session.view), buy = controls.find(control => control.action.type === 'purchaseCosmetic');
  assert.equal(session.view.shopItemDetail, undefined); assert.equal(selectedShopCosmetic(session.view).key, `${kind}.${id}`);
  assert.equal(controls.filter(control => control.action.type === 'selectShopSection').length, 3);assert.equal(controls.some(control => control.action.type === 'closeShopDetail'), false);
  assert.deepEqual(buy?.action, { type: 'purchaseCosmetic', kind, id });
  for (const [index, control] of controls.entries()) {
   assert.ok(control.rect.w / 3 >= 44 && control.rect.h / 3 >= 44);
   for (const other of controls.slice(index + 1)) assert.ok(control.rect.x + control.rect.w <= other.rect.x || other.rect.x + other.rect.w <= control.rect.x || control.rect.y + control.rect.h <= other.rect.y || other.rect.y + other.rect.h <= control.rect.y);
  }
  session.action({type:'selectShopTab',tab:'tools'});session.action({type:'selectShopTab',tab:'cosmetics'});assert.equal(session.view.shopSection, kind);assert.equal(selectedShopCosmetic(session.view).id, id);
  assert.ok(getShopControls(session.view).some(control => control.action.type === 'previewCosmetic' && control.action.id === id && control.selected));
 }
 session.action({type:'back'});assert.equal(session.view.screen,'menu');assert.deepEqual([...data], before);assert.equal(JSON.stringify(session.view.account), account);assert.equal(storage.operations.some(op=>op.kind==='set'||op.kind==='remove'),false);assert.equal(playableChecksum(session.state), checksum);
});

test('compiled free-playtest grants every new set without spending and paid-build restart keeps all earned rights', async () => {
 const built = await build({ stdin: { contents: "export {createAccountService} from './src/application/account-service.ts';", resolveDir: process.cwd(), loader: 'ts' }, bundle: true, write: false, platform: 'node', format: 'esm', define: { __PLAYTEST_FREE_SHOP__: 'true' } });
 const free = await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString('base64')}`) as { createAccountService: typeof createAccountService };
 const storage = new FaultStorage(), raw = encodeAccount(makeAccountFixture({ wallet: 57 }));
 for (const key of [ACCOUNT_KEYS.a, ACCOUNT_KEYS.b]) storage.values.set(key, raw);
 const service = free.createAccountService(storage, { status: 'held', release() {} }, () => 0);
 for (const [kind, id] of NEW) {
  const request: AccountRequest = { type: 'purchaseCosmetic', operationId: `free-reference.${kind}.${id}`, kind, id };
  const generation = service.getSnapshot()!.generation;
  assert.equal(service.transact(request, generation).status, 'acknowledged');
  assert.equal(service.transact(request, generation).status, 'acknowledged');
  assert.equal(service.getSnapshot()!.wallet, 57);
  assert.equal(service.transact({ type: 'setCosmetic', operationId: `free-equip.${kind}.${id}`, kind, id }, service.getSnapshot()!.generation).status, 'acknowledged');
 }
 const paid = createAccountService(storage, { status: 'held', release() {} }, () => 0);
 assert.equal(paid.getStatus(), 'ready'); assert.deepEqual(paid.getSnapshot(), service.getSnapshot());
 for (const [kind, id, , price] of NEW) { assert.ok(paid.getSnapshot()!.profile.ownedCosmetics?.includes(`${kind}.${id}`)); assert.equal(getCosmetic(kind, id)?.price, price); }
 assert.equal(paid.getSnapshot()!.wallet, 57);
});

test('a failed mirror never exposes newly claimed reference rights and repairing each category charges once', () => {
 for (const [kind, id, , price] of [NEW[0], NEW[2], NEW[4]]) {
  const { storage, service } = setup(), set = storage.set.bind(storage);
  storage.set = (key, value) => { if (key === ACCOUNT_KEYS.a) throw Error('mirror offline'); set(key, value); };
  const request: AccountRequest = { type: 'purchaseCosmetic', operationId: 'reference.retry', kind, id };
  assert.equal(service.transact(request, 0).status, 'committed_unmirrored');
  assert.equal(accountCosmeticState(service.getSnapshot()).ownedCosmetics.includes(`${kind}.${id}`), false);
  const restored = createAccountService(storage, { status: 'held', release() {} }, () => 0);
  assert.equal(restored.getSnapshot(), null); storage.set = set;
  assert.equal(restored.retryPending('reference.retry').status, 'acknowledged');
  assert.equal(restored.getSnapshot()!.wallet, 3600 - price);
  assert.equal(restored.transact(request, 0).status, 'acknowledged'); assert.equal(restored.getSnapshot()!.wallet, 3600 - price);
 }
});
