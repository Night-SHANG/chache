import assert from 'node:assert/strict';
import test from 'node:test';
import { accountCosmeticState, COSMETIC_CATALOG, FREE_COSMETICS, getCosmetic, HISTORICAL_COSMETIC_CATALOG, retainAccountCosmetics } from '../src/application/cosmetics.ts';
import { COSMETIC_SETS, getCosmeticSet, quoteCosmeticSetPurchase } from '../src/application/cosmetic-sets.ts';
import { accountDisplayProfile, createAccountService, type AccountRequest } from '../src/application/account-service.ts';
import { upgradeAccountGuides } from '../src/application/account-guides.ts';
import { assertAccountSnapshot } from '../src/application/account-profile.ts';
import { ACCOUNT_KEYS, decodeAccount, encodeAccount, loadAccount } from '../src/application/account-store.ts';
import { upgradeEconomy } from '../src/application/economy.ts';
import { FaultStorage, makeAccountFixture, makeAccountRun } from './helpers/account-fixtures.ts';

const retired = [
  ['ice_vault', 'ice_crystal', 'ice'],
  ['forest_depot', 'wood', 'timber'],
  ['lava_forge', 'lava_core', 'lava'],
] as const;
const kinds = ['theme', 'cargo', 'forklift'] as const;
const retiredKeys = retired.flatMap(triple => kinds.map((kind, index) => `${kind}.${triple[index]}`));
const retained = { theme: 'night', cargo: 'insulated', forklift: 'white' } as const;
const fallback = { theme: 'day', cargo: 'classic', forklift: 'yellow' } as const;

function fixture(triple: typeof retired[number], version: 3 | 4 = 4, mask = 7, active = true) {
  let account = retainAccountCosmetics(upgradeEconomy(makeAccountFixture({
    wallet: 6321, inventory: { rotate: 2, clear: 3, wildcard: 1 },
    ...(active ? { run: makeAccountRun(), nextRunSerial: 2 } : {}),
  })));
  if (version === 4) account = upgradeAccountGuides(account);
  account.profile.settings = { sound: false, reducedMotion: true, music: false, vibration: false };
  account.profile.ownedCosmetics = HISTORICAL_COSMETIC_CATALOG.map(item => item.key).sort();
  account.profile.cosmetics = {
    theme: mask & 1 ? triple[0] : retained.theme,
    cargo: mask & 2 ? triple[1] : retained.cargo,
    forklift: mask & 4 ? triple[2] : retained.forklift,
  };
  account.profile.cargoOutline = true;
  account.profile.results['outbound.v8.normal'] = { runs: 2, units: 4, maxUnits: 3, score: 400, wins: 1, retirements: 0, maxChain: 1, best: { score: 300, units: 3, chain: 1 } };
  // Persist the actual historical equipment, bypassing the new runtime projection.
  const raw = encodeAccount(account), storage = new FaultStorage();
  for (const key of [ACCOUNT_KEYS.a, ACCOUNT_KEYS.b]) storage.values.set(key, raw);
  const service = createAccountService(storage, { status: 'held', release() {} }, () => 0);
  storage.resetFault();
  return { account, raw, storage, service };
}
function expectedCosmetics(mask: number) {
  return Object.fromEntries(kinds.map((kind, index) => [kind, mask & (1 << index) ? fallback[kind] : retained[kind]]));
}

test('three v116 retired families remove exactly nine active cosmetics while preserving all 53 historical identifiers', () => {
  assert.equal(HISTORICAL_COSMETIC_CATALOG.length, 53);
  assert.equal(COSMETIC_CATALOG.length, 29);
  assert.deepEqual(kinds.map(kind => COSMETIC_CATALOG.filter(item => item.kind === kind).length), [9, 9, 11]);
  assert.equal(COSMETIC_SETS.length, 7);
  for (const triple of retired) assert.equal(getCosmeticSet(triple[0]), undefined);
  for (const key of retiredKeys) {
    const [kind, id] = key.split('.');
    assert.equal(getCosmetic(kind, id), undefined);
    assert.ok(HISTORICAL_COSMETIC_CATALOG.some(item => item.key === key));
  }
  assert.deepEqual(FREE_COSMETICS, ['cargo.classic', 'cargo.outline', 'forklift.yellow', 'theme.day', 'theme.night']);
});

test('persisted v3/v4 historical equipment projects only retired slots without touching wallet, rights, settings, run, outline or either raw root', () => {
  for (const triple of retired) for (const version of [3, 4] as const) for (let mask = 0; mask < 8; mask++) {
    const { account, raw, storage, service } = fixture(triple, version, mask);
    assert.deepEqual(JSON.parse(raw).account.profile.cosmetics, account.profile.cosmetics);
    assert.doesNotThrow(() => assertAccountSnapshot(account));
    assert.equal(service.getStatus(), 'ready');
    assert.deepEqual(decodeAccount(storage, raw), account);
    assert.deepEqual(loadAccount(storage, assertAccountSnapshot).account, account);
    const projected = accountCosmeticState(service.getSnapshot());
    assert.deepEqual(projected.cosmetics, expectedCosmetics(mask), `${triple[0]}/${version}/${mask}`);
    assert.deepEqual(projected.ownedCosmetics, account.profile.ownedCosmetics);
    assert.equal(projected.cargoOutline, true);
    assert.deepEqual(accountDisplayProfile(account).cosmetics, expectedCosmetics(mask));
    assert.deepEqual(service.getSnapshot(), account);
    assert.deepEqual([...storage.values.values()], [raw, raw]);
    assert.equal(storage.operations.some(op => op.kind === 'set' || op.kind === 'remove'), false);
    assert.deepEqual(accountCosmeticState(createAccountService(storage, { status: 'held', release() {} }, () => 0).getSnapshot()), projected);
  }
});

test('retired member purchase, equip and set commands reject without touching historical roots', () => {
  for (const triple of retired) {
    const { account, raw, storage, service } = fixture(triple, 4, 7, false);
    const requests: AccountRequest[] = kinds.flatMap((kind, index) => [
      { operationId: `retired.purchase.${kind}`, type: 'purchaseCosmetic', kind, id: triple[index] },
      { operationId: `retired.equip.${kind}`, type: 'setCosmetic', kind, id: triple[index] },
    ] as AccountRequest[]);
    requests.push({ operationId: 'retired.set', type: 'equipCosmeticSet', id: triple[0] });
    for (const request of requests) assert.equal(service.transact(request, 0).status, 'not_committed');
    assert.deepEqual(service.getSnapshot(), account);
    assert.deepEqual([...storage.values.values()], [raw, raw]);
    assert.equal(storage.operations.some(op => op.kind === 'set' || op.kind === 'remove'), false);
  }
});

test('a normal settings transaction applies fallback atomically and retains all non-cosmetic state and historical ownership', () => {
  for (const triple of retired) for (const version of [3, 4] as const) {
    const { account, service } = fixture(triple, version);
    const result = service.transact({ operationId: 'retirement.settings', type: 'setSettings', patch: { sound: true } }, 0);
    assert.equal(result.status, 'acknowledged');
    const expected = upgradeAccountGuides(structuredClone(account));
    expected.generation = 1;
    expected.lastOperation = result.account!.lastOperation;
    expected.profile.cosmetics = { ...fallback };
    expected.profile.settings.sound = true;
    assert.deepEqual(result.account, expected);
  }
});

test('interrupted mirror and exact retry preserve retired ownership, wallet and active run while normalizing only the committed equipment', () => {
  for (const triple of retired) {
    const { account, storage, service } = fixture(triple), set = storage.set.bind(storage);
    storage.set = (key, value) => { if (key === ACCOUNT_KEYS.a) throw Error('mirror offline'); set(key, value); };
    const request: AccountRequest = { operationId: 'retirement.retry', type: 'setSettings', patch: { sound: true } };
    assert.equal(service.transact(request, 0).status, 'committed_unmirrored');
    assert.deepEqual(service.getSnapshot(), account);
    const restarted = createAccountService(storage, { status: 'held', release() {} }, () => 0);
    assert.equal(restarted.getSnapshot(), null);
    storage.set = set;
    assert.equal(restarted.retryPending(request.operationId).status, 'acknowledged');
    const after = restarted.getSnapshot()!;
    assert.deepEqual(after.profile.cosmetics, fallback);
    assert.deepEqual(after.profile.ownedCosmetics, account.profile.ownedCosmetics);
    assert.equal(after.wallet, account.wallet);
    assert.deepEqual(after.inventory, account.inventory);
    assert.deepEqual(after.run, account.run);
    assert.deepEqual(after.profile.results, account.profile.results);
    assert.equal(after.profile.cargoOutline, true);
    assert.equal(restarted.transact(request, 0).status, 'acknowledged');
    assert.deepEqual(restarted.getSnapshot(), after);
    assert.equal(storage.values.get(ACCOUNT_KEYS.a), storage.values.get(ACCOUNT_KEYS.b));
  }
});

test('legacy bundle purchase quotes and commands cannot spend currency for any remaining or retired set', () => {
  for (const id of [...COSMETIC_SETS.map(set => set.id), ...retired.map(triple => triple[0]), 'classic']) {
    const { raw, storage, service } = fixture(retired[0], 4, 0, false);
    assert.equal(quoteCosmeticSetPurchase(id, { ownedCosmetics: [...FREE_COSMETICS] }), null);
    const result = service.transact({ operationId: 'bundle.disabled', type: 'purchaseCosmeticSet', id, quotedKeys: [`theme.${id}`, 'cargo.insulated', 'forklift.electric'], quotedPrice: 1440 }, 0);
    assert.equal(result.status, 'not_committed');
    assert.equal(service.getSnapshot()!.wallet, 6321);
    assert.deepEqual([...storage.values.values()], [raw, raw]);
    assert.equal(storage.operations.some(op => op.kind === 'set' || op.kind === 'remove'), false);
  }
});


test('each retired ownership subset remains valid and untouched through restart', () => {
  for (const triple of retired) for (const version of [3, 4] as const) for (let mask = 0; mask < 8; mask++) {
    const { account } = fixture(triple, version, mask, false);
    account.profile.ownedCosmetics = [...new Set([...FREE_COSMETICS, 'cargo.insulated', 'forklift.white', ...kinds.flatMap((kind, index) => mask & (1 << index) ? [`${kind}.${triple[index]}`] : [])])].sort();
    const raw = encodeAccount(account), storage = new FaultStorage();
    for (const key of [ACCOUNT_KEYS.a, ACCOUNT_KEYS.b]) storage.values.set(key, raw);
    const service = createAccountService(storage, { status: 'held', release() {} }, () => 0);
    assert.equal(service.getStatus(), 'ready');
    assert.deepEqual(service.getSnapshot(), account);
    assert.deepEqual(accountCosmeticState(service.getSnapshot()).cosmetics, expectedCosmetics(mask));
    assert.deepEqual(accountCosmeticState(service.getSnapshot()).ownedCosmetics, account.profile.ownedCosmetics);
    assert.deepEqual([...storage.values.values()], [raw, raw]);
    assert.equal(storage.operations.some(op => op.kind === 'set' || op.kind === 'remove'), false);
  }
});

test('shop lists and direct retired previews leave historical equipment, wallet and raw roots unchanged', async () => {
  const { sessionHost } = await import('./helpers/session-fixtures.ts');
  const { cosmeticShopPage, getShopControls } = await import('../src/presentation/economy-ui.ts');
  for (const triple of retired) {
    const { account } = fixture(triple, 4, 7, false), { session, data, storage } = sessionHost(account);
    const before = structuredClone(session.view.account), roots = [...data]; storage.resetFault();
    session.action({ type: 'shop' }); session.action({ type: 'selectShopTab', tab: 'cosmetics' });
    for (const kind of kinds) {
      session.action({ type: 'selectShopSection', section: kind });
      const seen = new Set<string>(), pages = cosmeticShopPage(session.view).pages;
      for (let page = 0; page < pages; page++) {
        session.action({ type: 'selectCosmeticPage', page });
        for (const control of getShopControls(session.view)) if (control.action.type === 'previewCosmetic') {
          const key = `${control.action.kind}.${control.action.id}`;
          assert.equal(retiredKeys.includes(key), false); seen.add(key);
        }
      }
      assert.deepEqual([...seen].sort(), COSMETIC_CATALOG.filter(item => item.kind === kind).map(item => item.key).sort());
    }
    const preview = structuredClone(session.view.cosmeticPreview);
    for (const [index, kind] of kinds.entries()) session.action({ type: 'previewCosmetic', kind, id: triple[index] });
    assert.deepEqual(session.view.cosmeticPreview, preview);
    assert.deepEqual(session.view.account, before);
    assert.deepEqual([...data], roots);
    assert.equal(storage.operations.some(op => op.kind === 'set' || op.kind === 'remove'), false);
  }
});
