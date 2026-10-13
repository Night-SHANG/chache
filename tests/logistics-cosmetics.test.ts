import test from 'node:test';
import assert from 'node:assert/strict';
import { COSMETIC_CATALOG, FREE_COSMETICS, accountCosmeticState } from '../src/application/cosmetics.ts';
import { createAccountService, type AccountRequest } from '../src/application/account-service.ts';
import { ACCOUNT_KEYS, encodeAccount } from '../src/application/account-store.ts';
import { createProfile, setProfileCosmetic } from '../src/application/profile.ts';
import { FaultStorage, makeAccountFixture } from './helpers/account-fixtures.ts';

const NEW = [
  ['theme', 'cold_chain', 900], ['theme', 'rail_freight', 900],
  ['cargo', 'insulated', 300], ['cargo', 'reinforced', 300],
  ['forklift', 'electric', 600], ['forklift', 'heavy', 600],
] as const;
function setup(wallet = 3600) {
  const storage = new FaultStorage(), account = makeAccountFixture({ wallet });
  const raw = encodeAccount(account); storage.values.set(ACCOUNT_KEYS.a, raw); storage.values.set(ACCOUNT_KEYS.b, raw);
  const service = createAccountService(storage, { status: 'held', release() {} }, () => 0);
  let serial = 0;
  const transact = (request: Record<string, unknown>) => service.transact({ operationId: `logistics.${++serial}`, ...request } as AccountRequest, service.getSnapshot()!.generation);
  return { storage, service, transact, raw };
}

test('current 29-item catalog preserves active earlier items and logistics price anchors', () => {
  assert.equal(COSMETIC_CATALOG.length, 29);
  assert.equal(new Set(COSMETIC_CATALOG.map(item => item.key)).size, 29);
  for (const [kind, ids] of [
    ['theme', ['day', 'night', 'cold_chain', 'rail_freight']],
    ['cargo', ['classic', 'outline', 'insulated', 'reinforced']],
    ['forklift', ['yellow', 'blue', 'red', 'white', 'electric', 'heavy']],
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

test('a mixed logistics loadout retains all six separately owned items without adding account fields', () => {
  const { service, transact } = setup();
  for (const [kind, id] of NEW) assert.equal(transact({ type: 'purchaseCosmetic', kind, id }).status, 'acknowledged');
  assert.equal(service.getSnapshot()?.wallet, 0);
  for (const [kind, id] of [['theme', 'cold_chain'], ['cargo', 'reinforced'], ['forklift', 'electric']] as const) assert.equal(transact({ type: 'setCosmetic', kind, id }).status, 'acknowledged');
  assert.deepEqual(service.getSnapshot()?.profile.cosmetics, { theme: 'cold_chain', cargo: 'reinforced', forklift: 'electric' });
  assert.equal(service.getSnapshot()?.profile.ownedCosmetics?.length, 11);
  assert.deepEqual(Object.keys(service.getSnapshot()!.profile).sort(), ['settings', 'cosmetics', 'legacyResults', 'results', 'ownedCosmetics', 'cargoOutline'].sort());
});

test('each new category keeps purchase rights private until a failed mirror is repaired and retry charges once', () => {
  for (const [kind, id, price] of [NEW[0], NEW[2], NEW[4]]) {
    const { storage, service } = setup(); const set = storage.set.bind(storage);
    storage.set = (key, value) => { if (key === ACCOUNT_KEYS.a) throw Error('mirror offline'); set(key, value); };
    const request: AccountRequest = { type: 'purchaseCosmetic', operationId: 'logistics.retry', kind, id };
    assert.equal(service.transact(request, 0).status, 'committed_unmirrored');
    assert.equal(accountCosmeticState(service.getSnapshot()).ownedCosmetics.includes(`${kind}.${id}`), false);
    const restored = createAccountService(storage, { status: 'held', release() {} }, () => 0);
    assert.equal(restored.getSnapshot(), null); storage.set = set;
    assert.equal(restored.retryPending('logistics.retry').status, 'acknowledged');
    assert.equal(restored.getSnapshot()?.wallet, 3600 - price);
    assert.equal(restored.transact(request, 0).status, 'acknowledged');
    assert.equal(restored.getSnapshot()?.wallet, 3600 - price);
  }
});
