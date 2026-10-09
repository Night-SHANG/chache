import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { build } from 'esbuild';
import * as cosmeticSets from '../src/application/cosmetic-sets.ts';
import { COSMETIC_CATALOG, FREE_COSMETICS, accountCosmeticState, getCosmetic, retainAccountCosmetics } from '../src/application/cosmetics.ts';
import { createAccountService, type AccountRequest } from '../src/application/account-service.ts';
import { upgradeAccountGuides } from '../src/application/account-guides.ts';
import { assertAccountSnapshot } from '../src/application/account-profile.ts';
import { ACCOUNT_KEYS, encodeAccount, loadAccount } from '../src/application/account-store.ts';
import { upgradeEconomy } from '../src/application/economy.ts';
import type { AccountSnapshot } from '../src/application/account-types.ts';
import { FaultStorage, makeAccountFixture, makeAccountRun } from './helpers/account-fixtures.ts';

const ADDITIONS = [
  ['theme', 'forest_depot', '林间货仓', 900], ['theme', 'ice_vault', '冰晶货仓', 900],
  ['cargo', 'harbor_container', '海运集装箱', 300],
  ['forklift', 'timber', '林务叉车', 600], ['forklift', 'ice', '冰晶叉车', 600], ['forklift', 'harbor', '码头叉车', 600],
] as const;
const TRIPLES = [
  ['forest_depot', 'wood', 'timber'], ['ice_vault', 'ice_crystal', 'ice'], ['harbor', 'harbor_container', 'harbor'],
] as const;
const memberKeys = (set: cosmeticSets.CosmeticSetDefinition) => [`theme.${set.theme}`, `cargo.${set.cargo}`, `forklift.${set.forklift}`];
type API = typeof import('../src/application/cosmetic-sets.ts') & typeof import('../src/application/account-service.ts');
async function compiled(flag: boolean): Promise<API> {
  const result = await build({ stdin: { contents: "export * from './src/application/cosmetic-sets.ts'; export * from './src/application/account-service.ts';", resolveDir: process.cwd(), loader: 'ts' }, bundle: true, write: false, platform: 'node', format: 'esm', define: { __PLAYTEST_FREE_SHOP__: String(flag) } });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`) as Promise<API>;
}
const [free, paid] = await Promise.all([compiled(true), compiled(false)]);
function setup(factory = createAccountService, owned: string[] = [], wallet = 5000, active = false) {
  const account = upgradeAccountGuides(retainAccountCosmetics(upgradeEconomy(makeAccountFixture({
    wallet, inventory: { rotate: 2, clear: 1, wildcard: 1 },
    ...(active ? { run: makeAccountRun(), nextRunSerial: 2 } : {}),
  }))));
  account.profile.ownedCosmetics = [...new Set([...account.profile.ownedCosmetics!, ...owned])].sort();
  account.profile.cosmetics.theme = 'night'; account.profile.cargoOutline = true;
  return open(account, factory);
}
function open(account: AccountSnapshot, factory = createAccountService) {
  const storage = new FaultStorage(), raw = encodeAccount(account);
  for (const key of [ACCOUNT_KEYS.a, ACCOUNT_KEYS.b]) storage.values.set(key, raw);
  const service = factory(storage, { status: 'held', release() {} }, () => 0);
  storage.resetFault();
  return { account, storage, service, raw };
}
function purchase(api: Pick<API, 'quoteCosmeticSetPurchase'>, account: AccountSnapshot, id = 'cold_chain', operationId = 'set.purchase'): Extract<AccountRequest, { type: 'purchaseCosmeticSet' }> {
  const quote = api.quoteCosmeticSetPurchase(id, accountCosmeticState(account))!;
  return { type: 'purchaseCosmeticSet', id, quotedKeys: quote.missingKeys, quotedPrice: quote.price, operationId };
}

test('three completed series add exactly six cosmetics while preserving every original item and right', () => {
  assert.equal(COSMETIC_CATALOG.length, 53);
  assert.equal(new Set(COSMETIC_CATALOG.map(item => item.key)).size, 53);
  assert.deepEqual(['theme', 'cargo', 'forklift'].map(kind => COSMETIC_CATALOG.filter(item => item.kind === kind).length), [17, 17, 19]);
  for (const [kind, id, name, price] of ADDITIONS) {
    const item = getCosmetic(kind, id);
    assert.ok(item); assert.equal(item.name, name); assert.equal(item.price, price);
    assert.equal(item.overlay, undefined); assert.equal(item.achievementId, undefined);
  }
  const oldCatalog = COSMETIC_CATALOG.slice(0, 47);
  assert.equal(createHash('sha256').update(JSON.stringify(oldCatalog)).digest('hex'), 'deeb6101976258546aea1ec4e7b0b7d15b9897fcdacf0554a0b1de17ce425d78');
  assert.deepEqual(COSMETIC_CATALOG.slice(47).map(item => item.key), ADDITIONS.map(([kind, id]) => `${kind}.${id}`));
  assert.deepEqual(FREE_COSMETICS, ['cargo.classic', 'cargo.outline', 'forklift.yellow', 'theme.day', 'theme.night']);
  assert.equal(cosmeticSets.COSMETIC_SETS.length, 15);
  for (const [theme, cargo, forklift] of TRIPLES) {
    const set = cosmeticSets.getCosmeticSet(theme);
    assert.deepEqual(set, { id: theme, name: getCosmetic('theme', theme)!.name, theme, cargo, forklift });
  }
  const used = new Set(cosmeticSets.COSMETIC_SETS.flatMap(memberKeys));
  assert.equal(used.size, 45);
  assert.deepEqual(COSMETIC_CATALOG.filter(item => !used.has(item.key)).map(item => item.key).sort(), [
    'cargo.classic', 'cargo.outline', 'forklift.blue', 'forklift.red', 'forklift.white', 'forklift.yellow', 'theme.day', 'theme.night',
  ]);
});

for (const [label, api, freeShop] of [['source paid', cosmeticSets, false], ['compiled paid', paid, false], ['compiled free', free, true]] as const) {
  test(`${label} quotes only the missing members for all eight ownership subsets without mutating anything`, () => {
    assert.equal(typeof api.quoteCosmeticSetPurchase, 'function');
    for (const set of cosmeticSets.COSMETIC_SETS) for (let mask = 0; mask < 8; mask++) {
      const all = memberKeys(set), owned = all.filter((_, index) => mask & (1 << index));
      const state = { ownedCosmetics: [...FREE_COSMETICS, ...owned, ...owned] };
      const before = structuredClone(state);
      Object.freeze(state.ownedCosmetics); Object.freeze(state);
      const missingKeys = all.filter(key => !owned.includes(key));
      const originalPrice = missingKeys.reduce((sum, key) => sum + COSMETIC_CATALOG.find(item => item.key === key)!.price, 0);
      assert.deepEqual(api.quoteCosmeticSetPurchase(set.id, state), { missingKeys, originalPrice, price: freeShop ? 0 : Math.ceil(originalPrice * 4 / 5) }, `${set.id}/${mask}`);
      assert.deepEqual(state, before);
    }
    for (const id of ['', 'missing', '__proto__', 'day', 'night', 'classic', 'outline']) assert.equal(api.quoteCosmeticSetPurchase(id, { ownedCosmetics: [] }), null);
  });
}

for (const [label, api, freeShop] of [['paid', paid, false], ['free', free, true]] as const) {
  test(`${label} bundle transactions atomically acquire only missing members for all eight subsets of all fifteen sets`, () => {
    for (const set of cosmeticSets.COSMETIC_SETS) for (let mask = 0; mask < 8; mask++) {
      const owned = memberKeys(set).filter((_, index) => mask & (1 << index));
      const { account, service, storage } = setup(api.createAccountService, owned, freeShop ? 0 : 5000);
      const request = purchase(api, account, set.id), quote = api.quoteCosmeticSetPurchase(set.id, accountCosmeticState(account))!;
      const beforeRequest = structuredClone(request); Object.freeze(request.quotedKeys); Object.freeze(request);
      const result = service.transact(request, 0);
      assert.equal(result.status, 'acknowledged', `${label}/${set.id}/${mask}: ${result.message}`);
      const expected = structuredClone(account);
      if (mask !== 7) {
        expected.generation = 1; expected.lastOperation = result.account!.lastOperation;
        expected.wallet -= quote.price;
        expected.profile.ownedCosmetics = [...new Set([...expected.profile.ownedCosmetics!, ...memberKeys(set)])].sort();
      }
      assert.deepEqual(service.getSnapshot(), expected);
      assert.equal(expected.wallet, freeShop ? account.wallet : account.wallet - Math.ceil(quote.originalPrice * 4 / 5));
      assert.equal(storage.operations.filter(op => op.kind === 'set').length, mask === 7 ? 0 : 2);
      assert.equal(storage.values.get(ACCOUNT_KEYS.a), storage.values.get(ACCOUNT_KEYS.b));
      assert.deepEqual(request, beforeRequest);
      storage.resetFault();
      assert.equal(service.transact(request, 0).status, 'acknowledged', 'same receipt is replay-safe');
      assert.deepEqual(service.getSnapshot(), expected);
      assert.equal(service.transact(purchase(api, expected, set.id, 'set.already-owned'), expected.generation).status, 'acknowledged');
      assert.deepEqual(service.getSnapshot(), expected);
      assert.equal(storage.operations.some(op => op.kind === 'set'), false);
    }
  });

  test(`${label} rejects malformed, mismatched, duplicate and reordered quotes without writes`, () => {
    const keys = ['theme.cold_chain', 'cargo.insulated', 'forklift.electric'];
    for (const patch of [
      { id: 'missing' }, { id: '__proto__' }, { id: 'day' }, { id: null }, { id: 3 },
      { quotedKeys: null }, { quotedKeys: 'theme.cold_chain' }, { quotedKeys: [null] }, { quotedKeys: new Array(3) },
      { quotedKeys: [] }, { quotedKeys: keys.slice(1) }, { quotedKeys: [...keys, keys[0]] },
      { quotedKeys: [...keys].reverse() }, { quotedKeys: [...keys, 'cargo.wood'] },
      { quotedPrice: -1 }, { quotedPrice: 0.1 }, { quotedPrice: NaN }, { quotedPrice: Infinity },
      { quotedPrice: '1440' }, { quotedPrice: freeShop ? 1440 : 0 }, { originalPrice: 1800 },
    ]) {
      const { account, service, storage, raw } = setup(api.createAccountService);
      const request = { ...purchase(api, account), ...patch } as AccountRequest;
      assert.equal(service.transact(request, 0).status, 'not_committed', JSON.stringify(patch));
      assert.deepEqual(service.getSnapshot(), account);
      assert.deepEqual([...storage.values.values()], [raw, raw]);
      assert.equal(storage.operations.some(op => op.kind === 'set'), false);
      assert.equal(service.getPendingOperationId(), null);
    }
    for (const omit of ['id', 'quotedKeys', 'quotedPrice']) {
      const { account, service, storage } = setup(api.createAccountService);
      const request = { ...purchase(api, account) } as Record<string, unknown>; delete request[omit];
      assert.equal(service.transact(request as AccountRequest, 0).status, 'not_committed');
      assert.deepEqual(service.getSnapshot(), account);
      assert.equal(storage.operations.some(op => op.kind === 'set'), false);
    }
  });

  test(`${label} rejects stale ownership even at the current generation and accepts only a freshly confirmed quote`, () => {
    const { account, service, storage } = setup(api.createAccountService);
    const stale = purchase(api, account);
    assert.equal(service.transact({ type: 'purchaseCosmetic', kind: 'cargo', id: 'insulated', operationId: 'single.first' }, 0).status, 'acknowledged');
    const before = service.getSnapshot()!; storage.resetFault();
    const result = service.transact(stale, before.generation);
    assert.equal(result.status, 'not_committed'); assert.equal(result.message, '套装报价已变化，请重新确认');
    assert.deepEqual(service.getSnapshot(), before); assert.equal(storage.operations.some(op => op.kind === 'set'), false);
    const fresh = purchase(api, before, 'cold_chain', 'fresh.quote');
    assert.equal(service.transact(fresh, before.generation).status, 'acknowledged');
    assert.equal(service.getSnapshot()!.wallet, freeShop ? 5000 : 3500, 'prior full-price single purchase is neither repeated nor retroactively refunded');
    assert.deepEqual(service.getSnapshot()!.profile.cosmetics, account.profile.cosmetics);
  });

  test(`${label} active runs reject both missing and already owned bundle purchases without touching run or inventory`, () => {
    for (const owned of [[], ['theme.cold_chain', 'cargo.insulated', 'forklift.electric']]) {
      const { account, service, storage, raw } = setup(api.createAccountService, owned, 5000, true);
      const result = service.transact(purchase(api, account), 0);
      assert.equal(result.status, 'not_committed'); assert.equal(result.message, '当前不能购买套装');
      assert.deepEqual(service.getSnapshot(), account); assert.deepEqual([...storage.values.values()], [raw, raw]);
      assert.equal(storage.operations.some(op => op.kind === 'set'), false);
    }
  });

  test(`${label} previewing and discarding bundle quotes is cancellation-neutral`, () => {
    const { account, service, storage, raw } = setup(api.createAccountService);
    for (const set of cosmeticSets.COSMETIC_SETS) {
      assert.ok(api.quoteCosmeticSetPurchase(set.id, accountCosmeticState(service.getSnapshot())));
      purchase(api, account, set.id);
    }
    assert.deepEqual(service.getSnapshot(), account); assert.deepEqual([...storage.values.values()], [raw, raw]);
    assert.equal(storage.operations.length, 0); assert.equal(service.getPendingOperationId(), null);
  });
}

test('paid bundle rejects insufficient funds and supports the exact discounted balance', () => {
  for (let mask = 0; mask < 7; mask++) {
    const set = cosmeticSets.getCosmeticSet('forest_depot')!, owned = memberKeys(set).filter((_, index) => mask & (1 << index));
    const price = cosmeticSets.quoteCosmeticSetPurchase(set.id, { ownedCosmetics: owned })!.price;
    for (const enough of [false, true]) {
      const { account, service, storage, raw } = setup(createAccountService, owned, price - (enough ? 0 : 1));
      const result = service.transact(purchase(cosmeticSets, account, set.id), 0);
      assert.equal(result.status, enough ? 'acknowledged' : 'not_committed');
      if (enough) assert.equal(service.getSnapshot()!.wallet, 0);
      else {
        assert.equal(result.message, '金币不足'); assert.deepEqual(service.getSnapshot(), account);
        assert.deepEqual([...storage.values.values()], [raw, raw]); assert.equal(storage.operations.some(op => op.kind === 'set'), false);
      }
    }
  }
});

test('a reused bundle operation id rejects changed set, quote or generation without any extra charge', () => {
  const { account, service, storage } = setup(); const request = purchase(cosmeticSets, account);
  assert.equal(service.transact(request, 0).status, 'acknowledged'); const before = service.getSnapshot(); storage.resetFault();
  const changedRequests: [Partial<typeof request>, number][] = [[{ id: 'harbor' }, 0], [{ quotedKeys: [] }, 0], [{ quotedPrice: 0 }, 0], [{}, 1]];
  for (const [patch, generation] of changedRequests) {
    assert.equal(service.transact({ ...request, ...patch }, generation).status, 'not_committed');
    assert.deepEqual(service.getSnapshot(), before);
  }
  assert.equal(storage.operations.some(op => op.kind === 'set'), false);
});

for (const [label, api] of [['paid', paid], ['free', free]] as const) {
  test(`${label} bundle purchase survives every before/after storage fault with whole ownership and one charge`, () => {
    for (const version of [1, 2, 4] as const) {
      const fixture = () => {
        if (version === 4) return setup(api.createAccountService, ['cargo.insulated']);
        const legacy = makeAccountFixture({ wallet: 5000, inventory: { rotate: 2, clear: 1, wildcard: 1 } });
        legacy.profile.cosmetics = { theme: 'night', cargo: 'outline', forklift: 'red' };
        legacy.dailyPaid['2026-10-06'] = { bestBase: 45, paid: 90 };
        return open(version === 2 ? upgradeEconomy(legacy) : legacy, api.createAccountService);
      };
      const baseline = fixture(), request = purchase(api, baseline.account, 'cold_chain', `bundle.fault.v${version}`);
      const success = baseline.service.transact(request, 0);
      assert.equal(success.status, 'acknowledged'); const expected = success.account!, count = baseline.storage.operations.length;
      for (let at = 1; at <= count; at++) for (const timing of ['before', 'after'] as const) {
        const { account, service, storage } = fixture(); storage.resetFault({ at, timing });
        const result = service.transact(request, 0);
        if (result.status !== 'acknowledged') assert.deepEqual(service.getSnapshot(), account, `${label}/v${version}/${at}/${timing} speculative publication`);
        storage.resetFault(); const recovered = loadAccount(storage, assertAccountSnapshot);
        assert.ok(['ready', 'degraded'].includes(recovered.status));
        assert.deepEqual(recovered.account, recovered.account?.generation === 0 ? account : expected, `${label}/v${version}/${at}/${timing} partial root`);
        const retried = service.getPendingOperationId() ? service.retryPending(request.operationId) : service.transact(request, 0);
        assert.equal(retried.status, 'acknowledged', `${label}/v${version}/${at}/${timing}: ${retried.message}`);
        assert.deepEqual(service.getSnapshot(), expected);
        assert.equal(storage.values.get(ACCOUNT_KEYS.a), storage.values.get(ACCOUNT_KEYS.b));
        const restarted = createAccountService(storage, { status: 'held', release() {} }, () => 0);
        assert.equal(restarted.getStatus(), 'ready'); assert.deepEqual(restarted.getSnapshot(), expected);
        storage.resetFault();
        assert.equal(restarted.transact(request, 0).status, 'acknowledged', 'saved free receipt remains replayable after a paid restart');
        assert.deepEqual(restarted.getSnapshot(), expected);
        assert.equal(storage.operations.some(op => op.kind === 'set'), false);
      }
    }
  });

  test(`${label} mirror failure exposes no partial rights and restart repairs the same complete bundle`, () => {
    const { account, service, storage } = setup(api.createAccountService, ['cargo.wood']);
    const request = purchase(api, account, 'forest_depot'), originalSet = storage.set.bind(storage);
    storage.set = (key, value) => { if (key === ACCOUNT_KEYS.a) throw Error('mirror unavailable'); originalSet(key, value); };
    assert.equal(service.transact(request, 0).status, 'committed_unmirrored');
    assert.deepEqual(service.getSnapshot(), account);
    assert.equal(service.transact({ ...request, operationId: 'other.bundle' }, 0).status, 'not_committed');
    const restarted = createAccountService(storage, { status: 'held', release() {} }, () => 0);
    assert.equal(restarted.getSnapshot(), null); assert.equal(restarted.getPendingOperationId(), request.operationId);
    storage.set = originalSet;
    assert.equal(restarted.retryPending(request.operationId).status, 'acknowledged');
    assert.equal(restarted.getSnapshot()!.wallet, account.wallet - request.quotedPrice);
    assert.deepEqual(restarted.getSnapshot()!.profile.ownedCosmetics, [...account.profile.ownedCosmetics!, ...request.quotedKeys].sort());
    assert.deepEqual(restarted.getSnapshot()!.profile.cosmetics, account.profile.cosmetics);
    assert.equal(restarted.getSnapshot()!.profile.cargoOutline, true);
    assert.equal(restarted.transact(request, 0).status, 'acknowledged');
    assert.equal(restarted.getSnapshot()!.generation, 1);
  });

  test(`${label} unknown readback recovers the exact bundle receipt in a paid build without reinterpretation`, () => {
    const { account, service, storage } = setup(api.createAccountService);
    const request = purchase(api, account, 'harbor'), originalSet = storage.set.bind(storage), originalGet = storage.get.bind(storage);
    let blocked = false;
    storage.set = (key, value) => { originalSet(key, value); if (key === ACCOUNT_KEYS.b) blocked = true; };
    storage.get = key => { if (blocked) throw Error('readback unavailable'); return originalGet(key); };
    assert.equal(service.transact(request, 0).status, 'unknown'); assert.deepEqual(service.getSnapshot(), account);
    storage.set = originalSet; storage.get = originalGet;
    const restarted = createAccountService(storage, { status: 'held', release() {} }, () => 0);
    assert.equal(restarted.getStatus(), 'degraded'); assert.equal(restarted.retryPending(request.operationId).status, 'acknowledged');
    assert.equal(restarted.getSnapshot()!.wallet, account.wallet - request.quotedPrice);
    assert.deepEqual(restarted.getSnapshot()!.profile.ownedCosmetics, [...account.profile.ownedCosmetics!, ...request.quotedKeys].sort());
    assert.deepEqual(restarted.getSnapshot()!.profile.cosmetics, account.profile.cosmetics);
    storage.resetFault(); assert.equal(restarted.transact(request, 0).status, 'acknowledged');
    assert.equal(storage.operations.some(op => op.kind === 'set'), false);
  });

  test(`${label} storage quota refusal retains the old account and retry acquires the whole bundle once`, () => {
    const { account, service, storage, raw } = setup(api.createAccountService);
    const request = purchase(api, account, 'ice_vault'); storage.limitBytes = storage.byteUsage();
    assert.equal(service.transact(request, 0).status, 'not_committed');
    assert.deepEqual(service.getSnapshot(), account); assert.deepEqual([...storage.values.values()], [raw, raw]);
    storage.limitBytes = Infinity;
    const result = service.getPendingOperationId() ? service.retryPending(request.operationId) : service.transact(request, 0);
    assert.equal(result.status, 'acknowledged'); assert.equal(service.getSnapshot()!.wallet, account.wallet - request.quotedPrice);
    assert.deepEqual(service.getSnapshot()!.profile.ownedCosmetics, [...account.profile.ownedCosmetics!, ...request.quotedKeys].sort());
    assert.deepEqual(service.getSnapshot()!.profile.cosmetics, account.profile.cosmetics);
  });
}

test('each added cosmetic still supports independent purchase, equip, account parsing and exact reload', () => {
  const { account, service, storage } = setup(); let spent = 0;
  for (const [kind, id, , price] of ADDITIONS) {
    const generation = service.getSnapshot()!.generation;
    assert.equal(service.transact({ type: 'purchaseCosmetic', kind, id, operationId: `new.buy.${kind}.${id}` }, generation).status, 'acknowledged');
    spent += price; assert.equal(service.getSnapshot()!.wallet, account.wallet - spent);
    assert.equal(service.transact({ type: 'setCosmetic', kind, id, operationId: `new.equip.${kind}.${id}` }, generation + 1).status, 'acknowledged');
    assert.equal(service.getSnapshot()!.profile.cosmetics[kind], id);
    assert.doesNotThrow(() => assertAccountSnapshot(service.getSnapshot()));
  }
  const restarted = createAccountService(storage, { status: 'held', release() {} }, () => 0);
  assert.equal(restarted.getStatus(), 'ready'); assert.deepEqual(restarted.getSnapshot(), service.getSnapshot());
});
