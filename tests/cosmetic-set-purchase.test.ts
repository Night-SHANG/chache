import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { build } from 'esbuild';
import * as cosmeticSets from '../src/application/cosmetic-sets.ts';
import { COSMETIC_CATALOG, HISTORICAL_COSMETIC_CATALOG, FREE_COSMETICS, getCosmetic, retainAccountCosmetics } from '../src/application/cosmetics.ts';
import { createAccountService, type AccountRequest } from '../src/application/account-service.ts';
import { upgradeAccountGuides } from '../src/application/account-guides.ts';
import { assertAccountSnapshot } from '../src/application/account-profile.ts';
import { ACCOUNT_KEYS, encodeAccount } from '../src/application/account-store.ts';
import { accountDigest, canonicalStringify } from '../src/application/history-store.ts';
import { upgradeEconomy } from '../src/application/economy.ts';
import type { AccountSnapshot } from '../src/application/account-types.ts';
import { FaultStorage, makeAccountFixture, makeAccountRun } from './helpers/account-fixtures.ts';

type API = typeof import('../src/application/cosmetic-sets.ts') & typeof import('../src/application/account-service.ts');
async function compiled(flag: boolean): Promise<API> {
  const result = await build({ stdin: { contents: "export * from './src/application/cosmetic-sets.ts'; export * from './src/application/account-service.ts';", resolveDir: process.cwd(), loader: 'ts' }, bundle: true, write: false, platform: 'node', format: 'esm', define: { __PLAYTEST_FREE_SHOP__: String(flag) } });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`) as Promise<API>;
}
const [free, paid] = await Promise.all([compiled(true), compiled(false)]);
const memberKeys = (set: cosmeticSets.CosmeticSetDefinition) => [`theme.${set.theme}`, `cargo.${set.cargo}`, `forklift.${set.forklift}`];
function open(account: AccountSnapshot, factory = createAccountService) {
  const storage = new FaultStorage(), raw = encodeAccount(account);
  for (const key of [ACCOUNT_KEYS.a, ACCOUNT_KEYS.b]) storage.values.set(key, raw);
  const service = factory(storage, { status: 'held', release() {} }, () => 0);
  storage.resetFault();
  return { account, storage, service, raw };
}
function setup(factory = createAccountService, owned: string[] = [], active = false) {
  const account = upgradeAccountGuides(retainAccountCosmetics(upgradeEconomy(makeAccountFixture({
    wallet: 5000, inventory: { rotate: 2, clear: 1, wildcard: 1 },
    ...(active ? { run: makeAccountRun(), nextRunSerial: 2 } : {}),
  }))));
  account.profile.ownedCosmetics = [...new Set([...account.profile.ownedCosmetics!, ...owned])].sort();
  account.profile.cosmetics.theme = 'night'; account.profile.cargoOutline = true;
  return open(account, factory);
}

test('historical catalog stays byte-identical while seven active internal sets retain independent prices', () => {
  assert.equal(createHash('sha256').update(JSON.stringify(HISTORICAL_COSMETIC_CATALOG.slice(0, 47))).digest('hex'), 'deeb6101976258546aea1ec4e7b0b7d15b9897fcdacf0554a0b1de17ce425d78');
  assert.equal(COSMETIC_CATALOG.length, 29);
  assert.equal(new Set(COSMETIC_CATALOG.map(item => item.key)).size, 29);
  assert.deepEqual(['theme', 'cargo', 'forklift'].map(kind => COSMETIC_CATALOG.filter(item => item.kind === kind).length), [9, 9, 11]);
  assert.equal(cosmeticSets.COSMETIC_SETS.length, 7);
  const used = new Set(cosmeticSets.COSMETIC_SETS.flatMap(memberKeys));
  assert.equal(used.size, 21);
  assert.deepEqual(COSMETIC_CATALOG.filter(item => !used.has(item.key)).map(item => item.key).sort(), [
    'cargo.classic', 'cargo.outline', 'forklift.blue', 'forklift.red', 'forklift.white', 'forklift.yellow', 'theme.day', 'theme.night',
  ]);
  assert.deepEqual(FREE_COSMETICS, ['cargo.classic', 'cargo.outline', 'forklift.yellow', 'theme.day', 'theme.night']);
});

for (const [label, api] of [['source', { ...cosmeticSets, createAccountService }], ['compiled paid', paid], ['compiled free', free]] as const) {
  test(`${label} cannot quote or charge any former bundle at any ownership tier`, () => {
    for (const set of cosmeticSets.COSMETIC_SETS) for (let mask = 0; mask < 8; mask++) {
      const members = memberKeys(set), owned = members.filter((_, index) => mask & (1 << index));
      const state = { ownedCosmetics: [...owned] }, before = structuredClone(state);
      Object.freeze(state.ownedCosmetics); Object.freeze(state);
      assert.equal(api.quoteCosmeticSetPurchase(set.id, state), null);
      assert.equal(api.cosmeticSetDiscountPercent(3 - owned.length), 100);
      assert.equal(api.cosmeticSetDiscountLabel(3 - owned.length), '原价');
      assert.deepEqual(state, before);
      const { account, service, storage, raw } = setup(api.createAccountService, owned);
      const missing = members.filter(key => !owned.includes(key));
      const originalPrice = missing.reduce((sum, key) => sum + COSMETIC_CATALOG.find(item => item.key === key)!.price, 0);
      const formerPrice = Math.ceil(originalPrice * (missing.length === 3 ? 80 : missing.length === 2 ? 90 : 100) / 100);
      for (const quotedPrice of [0, formerPrice, originalPrice]) {
        const request: AccountRequest = { operationId: `retired.bundle.${quotedPrice}`, type: 'purchaseCosmeticSet', id: set.id, quotedKeys: missing, quotedPrice };
        assert.equal(service.transact(request, 0).status, 'not_committed');
        assert.equal(service.getPendingOperationId(), null);
      }
      assert.deepEqual(service.getSnapshot(), account);
      assert.deepEqual([...storage.values.values()], [raw, raw]);
      assert.equal(storage.operations.some(op => op.kind === 'set' || op.kind === 'remove'), false);
    }
    for (const id of ['neon_depot', 'field_station', 'harbor', 'royal_store', 'express_sorting', 'classic', 'missing', '__proto__']) {
      assert.equal(api.quoteCosmeticSetPurchase(id, { ownedCosmetics: [] }), null);
    }
  });

  test(`${label} retired bundle commands leave v1/v2 and active-run saves untouched`, () => {
    for (const version of [1, 2, 4] as const) for (const active of [false, true]) {
      const initial = makeAccountFixture({ wallet: 5000, ...(active ? { run: makeAccountRun(), nextRunSerial: 2 } : {}) });
      initial.profile.cosmetics = { theme: 'night', cargo: 'outline', forklift: 'red' };
      const account = version === 1 ? initial : version === 2 ? upgradeEconomy(initial) : upgradeAccountGuides(retainAccountCosmetics(upgradeEconomy(initial)));
      const { service, storage, raw } = open(account, api.createAccountService);
      const request: AccountRequest = { operationId: 'retired.bundle.legacy', type: 'purchaseCosmeticSet', id: 'cold_chain', quotedKeys: ['theme.cold_chain', 'cargo.insulated', 'forklift.electric'], quotedPrice: 1440 };
      assert.equal(service.transact(request, 0).status, 'not_committed');
      assert.deepEqual(service.getSnapshot(), account);
      assert.deepEqual([...storage.values.values()], [raw, raw]);
      assert.equal(storage.operations.some(op => op.kind === 'set' || op.kind === 'remove'), false);
    }
  });
}

test('a previously committed discounted bundle receipt can still repair a missing mirror without new charges or normalization', () => {
  const { account: older } = setup(), newer = structuredClone(older);
  const request: AccountRequest = { operationId: 'historical.harbor.bundle', type: 'purchaseCosmeticSet', id: 'harbor', quotedKeys: ['theme.harbor', 'cargo.harbor_container', 'forklift.harbor'], quotedPrice: 1440 };
  newer.generation = 1;
  newer.wallet -= request.quotedPrice;
  newer.profile.ownedCosmetics = [...newer.profile.ownedCosmetics!, ...request.quotedKeys].sort();
  newer.profile.cosmetics = { theme: 'harbor', cargo: 'harbor_container', forklift: 'harbor' };
  newer.lastOperation = { operationId: request.operationId, expectedGeneration: 0, committedGeneration: 1, requestDigest: accountDigest(canonicalStringify({ request, expectedGeneration: 0 })) };
  const storage = new FaultStorage(), oldRaw = encodeAccount(older), newRaw = encodeAccount(newer);
  storage.values.set(ACCOUNT_KEYS.a, oldRaw); storage.values.set(ACCOUNT_KEYS.b, newRaw);
  const service = createAccountService(storage, { status: 'held', release() {} }, () => 0);
  assert.equal(service.getStatus(), 'degraded');
  assert.equal(service.getSnapshot(), null);
  assert.equal(service.getPendingOperationId(), request.operationId);
  assert.equal(service.retryPending(request.operationId).status, 'acknowledged');
  assert.deepEqual(service.getSnapshot(), newer);
  assert.deepEqual([...storage.values.values()], [newRaw, newRaw]);
  storage.resetFault();
  assert.equal(service.retryPending(request.operationId).status, 'acknowledged');
  assert.deepEqual(service.getSnapshot(), newer);
  assert.equal(storage.operations.some(op => op.kind === 'set'), false);
});

test('retained steam and ocean cosmetics support exact independent prices, purchase, equip and reload', () => {
  const { account, service, storage } = setup(); let spent = 0;
  const additions = [['theme', 'steam_foundry', 900], ['theme', 'ocean_vault', 900], ['forklift', 'steam', 600], ['forklift', 'diving', 600]] as const;
  for (const [kind, id, price] of additions) {
    assert.equal(getCosmetic(kind, id)?.price, price);
    const generation = service.getSnapshot()!.generation;
    assert.equal(service.transact({ type: 'purchaseCosmetic', kind, id, operationId: `single.buy.${kind}.${id}` }, generation).status, 'acknowledged');
    spent += price;
    assert.equal(service.getSnapshot()!.wallet, account.wallet - spent);
    assert.equal(service.transact({ type: 'setCosmetic', kind, id, operationId: `single.equip.${kind}.${id}` }, generation + 1).status, 'acknowledged');
    assert.equal(service.getSnapshot()!.profile.cosmetics[kind], id);
    assert.doesNotThrow(() => assertAccountSnapshot(service.getSnapshot()));
  }
  const restarted = createAccountService(storage, { status: 'held', release() {} }, () => 0);
  assert.equal(restarted.getStatus(), 'ready');
  assert.deepEqual(restarted.getSnapshot(), service.getSnapshot());
});
