import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
import { createAccountService, type AccountRequest } from '../src/application/account-service.ts';
import { upgradeAccountGuides } from '../src/application/account-guides.ts';
import { assertAccountSnapshot } from '../src/application/account-profile.ts';
import { ACCOUNT_KEYS, encodeAccount, loadAccount } from '../src/application/account-store.ts';
import type { AccountSnapshot, ItemId } from '../src/application/account-types.ts';
import { retainAccountCosmetics } from '../src/application/cosmetics.ts';
import { ITEM_PRICES, upgradeEconomy } from '../src/application/economy.ts';
import { accountDigest, canonicalStringify } from '../src/application/history-store.ts';
import { FaultStorage, makeAccountFixture, makeAccountRun } from './helpers/account-fixtures.ts';

const ITEMS: readonly ItemId[] = ['rotate', 'clear', 'wildcard'];
const LIMIT = Number.MAX_SAFE_INTEGER;
const held = () => ({ status: 'held' as const, release() {} });
async function compiled(free: boolean): Promise<typeof createAccountService> {
  const result = await build({ stdin: { contents: "export {createAccountService} from './src/application/account-service.ts';", resolveDir: process.cwd(), loader: 'ts' }, bundle: true, write: false, platform: 'node', format: 'esm', define: { __PLAYTEST_FREE_SHOP__: String(free) } });
  return (await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`)).createAccountService;
}
const [paidFactory, freeFactory] = await Promise.all([compiled(false), compiled(true)]);
function setup(patch: Partial<AccountSnapshot> = {}, factory = createAccountService) {
  const account = upgradeAccountGuides(retainAccountCosmetics(upgradeEconomy(makeAccountFixture({ wallet: 5000, inventory: { rotate: 2, clear: 3, wildcard: 4 }, ...patch }))));
  const storage = new FaultStorage(), raw = encodeAccount(account);
  storage.values.set(ACCOUNT_KEYS.a, raw); storage.values.set(ACCOUNT_KEYS.b, raw);
  const service = factory(storage, held(), () => 0); storage.resetFault();
  return { account, storage, raw, service };
}
function purchase(item: ItemId = 'rotate', quantity = 3, quotedPrice?: number, operationId = 'tools.batch'): AccountRequest {
  return { type: 'purchase', item, quantity, ...(quotedPrice === undefined ? {} : { quotedPrice }), operationId } as AccountRequest;
}
function unchanged(fixture: ReturnType<typeof setup>): void {
  assert.deepEqual(fixture.service.getSnapshot(), fixture.account);
  assert.deepEqual([...fixture.storage.values.values()], [fixture.raw, fixture.raw]);
  assert.equal(fixture.storage.operations.some(op => op.kind === 'set'), false);
  assert.equal(fixture.service.getPendingOperationId(), null);
}

for (const [label, factory, free] of [['source paid', createAccountService, false], ['compiled paid', paidFactory, false], ['compiled free', freeFactory, true]] as const) {
  test(`${label} atomically buys exact quantities of all three tools with one receipt and one mirrored commit`, () => {
    for (const item of ITEMS) for (const quantity of [1, 2, 7]) for (const quoted of [false, true]) {
      const { account, service, storage } = setup({}, factory), total = free ? 0 : ITEM_PRICES[item] * quantity;
      const request = purchase(item, quantity, quoted ? total : undefined), original = structuredClone(request); Object.freeze(request);
      const result = service.transact(request, 0);
      assert.equal(result.status, 'acknowledged', `${item}/${quantity}/${quoted}: ${result.message}`);
      const expected = { ...account, generation: 1, lastOperation: result.account!.lastOperation, wallet: account.wallet - total, inventory: { ...account.inventory, [item]: account.inventory[item] + quantity } };
      assert.deepEqual(service.getSnapshot(), expected); assert.deepEqual(request, original);
      assert.equal(result.account!.lastOperation!.requestDigest, accountDigest(canonicalStringify({ request, expectedGeneration: 0 })));
      assert.equal(storage.operations.filter(op => op.kind === 'set').length, 2);
      assert.equal(storage.values.get(ACCOUNT_KEYS.a), storage.values.get(ACCOUNT_KEYS.b));
      storage.resetFault();
      assert.equal(service.transact(request, 0).status, 'acknowledged');
      assert.deepEqual(service.getSnapshot(), expected); assert.equal(storage.operations.some(op => op.kind === 'set'), false);
    }
  });

  test(`${label} rejects invalid quantities and quotes without coercion, writes, or a pending operation`, () => {
    const badValues: unknown[] = [undefined, null, false, true, '', '3', 0, -1, -0, 0.5, 1.5, NaN, Infinity, -Infinity, LIMIT + 1, 1e100, {}, [], [3]];
    for (const quantity of badValues) {
      const fixture = setup({}, factory);
      const request = { ...purchase(), quantity } as AccountRequest;
      assert.equal(fixture.service.transact(request, 0).status, 'not_committed', `quantity ${String(quantity)}`); unchanged(fixture);
    }
    for (const quotedPrice of [undefined, null, false, '', '240', -1, 0.5, NaN, Infinity, LIMIT + 1, free ? 240 : 0, free ? 1 : 80]) {
      const fixture = setup({}, factory);
      const request = { ...purchase(), quotedPrice } as AccountRequest;
      assert.equal(fixture.service.transact(request, 0).status, 'not_committed', `quote ${String(quotedPrice)}`); unchanged(fixture);
    }
    for (const patch of [{ item: '__proto__' }, { item: null }, { extra: true }]) {
      const fixture = setup({}, factory);
      assert.equal(fixture.service.transact({ ...purchase(), ...patch } as AccountRequest, 0).status, 'not_committed'); unchanged(fixture);
    }
  });

  test(`${label} fills the last inventory slot and refuses any overflow for each item`, () => {
    for (const item of ITEMS) for (const room of [0, 1, 3]) for (const quantity of [1, 3, 4]) {
      const fixture = setup({ inventory: { rotate: 0, clear: 0, wildcard: 0, [item]: LIMIT - room } }, factory);
      const total = free ? 0 : ITEM_PRICES[item] * quantity;
      const result = fixture.service.transact(purchase(item, quantity, total), 0);
      assert.equal(result.status, quantity <= room ? 'acknowledged' : 'not_committed', `${item}/${room}/${quantity}`);
      if (quantity <= room) {
        assert.equal(result.account!.inventory[item], LIMIT - room + quantity);
        assert.equal(result.account!.wallet, fixture.account.wallet - total);
      } else unchanged(fixture);
    }
  });

  test(`${label} batches remain forbidden during an active run`, () => {
    const fixture = setup({ run: makeAccountRun(), nextRunSerial: 2 }, factory);
    assert.equal(fixture.service.transact(purchase('clear', 3, free ? 0 : 360), 0).status, 'not_committed'); unchanged(fixture);
  });

  test(`${label} duplicate operation IDs reject changed quantity, quote, item, and generation without charging again`, () => {
    const { service, storage } = setup({}, factory), request = purchase('rotate', 3, free ? 0 : 240);
    assert.equal(service.transact(request, 0).status, 'acknowledged'); const expected = service.getSnapshot();
    const noQuote = purchase('rotate', 3);
    const changes: [AccountRequest, number][] = [[{ ...request, quantity: 4 } as AccountRequest, 0], [{ ...request, quotedPrice: 1 } as AccountRequest, 0], [{ ...request, item: 'clear' } as AccountRequest, 0], [noQuote, 0], [request, 1]];
    for (const restart of [false, true]) {
      const current = restart ? factory(storage, held(), () => 0) : service; storage.resetFault();
      for (const [changed, generation] of changes) {
        const result = current.transact(changed, generation); assert.equal(result.status, 'not_committed');
        assert.equal(result.message, '同一操作的内容已改变'); assert.deepEqual(current.getSnapshot(), expected);
      }
      assert.equal(current.transact(request, 0).status, 'acknowledged');
      assert.deepEqual(current.getSnapshot(), expected); assert.equal(storage.operations.some(op => op.kind === 'set'), false);
    }
  });
}

test('paid batches require the whole total and allow exact funds for every tool', () => {
  for (const item of ITEMS) for (const enough of [false, true]) {
    const quantity = 5, total = ITEM_PRICES[item] * quantity;
    const fixture = setup({ wallet: total - (enough ? 0 : 1) });
    const result = fixture.service.transact(purchase(item, quantity, total), 0);
    assert.equal(result.status, enough ? 'acknowledged' : 'not_committed');
    if (enough) { assert.equal(result.account!.wallet, 0); assert.equal(result.account!.inventory[item], fixture.account.inventory[item] + quantity); }
    else { assert.equal(result.message, '金币不足'); unchanged(fixture); }
  }
});

test('paid price multiplication accepts the largest safe batch total and rejects overflow', () => {
  for (const item of ITEMS) for (const overflow of [false, true]) {
    const quantity = Math.floor(LIMIT / ITEM_PRICES[item]) + (overflow ? 1 : 0);
    const fixture = setup({ wallet: LIMIT, inventory: { rotate: 0, clear: 0, wildcard: 0 } });
    const result = fixture.service.transact(purchase(item, quantity), 0);
    assert.equal(result.status, overflow ? 'not_committed' : 'acknowledged');
    if (overflow) unchanged(fixture);
    else { assert.equal(result.account!.wallet, LIMIT - ITEM_PRICES[item] * quantity); assert.equal(result.account!.inventory[item], quantity); }
  }
});

test('free batches preserve zero wallet and support the existing safe-integer inventory ceiling', () => {
  for (const item of ITEMS) {
    const fixture = setup({ wallet: 0, inventory: { rotate: 0, clear: 0, wildcard: 0 } }, freeFactory);
    const result = fixture.service.transact(purchase(item, LIMIT, 0), 0);
    assert.equal(result.status, 'acknowledged', result.message); assert.equal(result.account!.wallet, 0); assert.equal(result.account!.inventory[item], LIMIT);
    const restarted = createAccountService(fixture.storage, held(), () => 0); fixture.storage.resetFault();
    assert.equal(restarted.transact(purchase(item, LIMIT, 0), 0).status, 'acknowledged');
    assert.deepEqual(restarted.getSnapshot(), result.account); assert.equal(fixture.storage.operations.some(op => op.kind === 'set'), false);
  }
});

test('legacy single-tool requests retain their original digest and replay after restart without default-field mutation', () => {
  for (const item of ITEMS) {
    const fixture = setup(), request: AccountRequest = { type: 'purchase', item, operationId: 'tools.legacy' };
    Object.freeze(request); const original = structuredClone(request);
    const result = fixture.service.transact(request, 0); assert.equal(result.status, 'acknowledged');
    assert.equal(result.account!.wallet, fixture.account.wallet - ITEM_PRICES[item]);
    assert.equal(result.account!.inventory[item], fixture.account.inventory[item] + 1); assert.deepEqual(request, original);
    assert.equal(result.account!.lastOperation!.requestDigest, accountDigest(canonicalStringify({ request: original, expectedGeneration: 0 })));
    const restarted = createAccountService(fixture.storage, held(), () => 0); fixture.storage.resetFault();
    assert.equal(restarted.transact(request, 0).status, 'acknowledged'); assert.deepEqual(restarted.getSnapshot(), result.account);
    assert.equal(restarted.transact({ ...request, quantity: 1 } as AccountRequest, 0).status, 'not_committed');
    assert.equal(restarted.transact({ ...request, quantity: undefined } as AccountRequest, 0).status, 'not_committed');
    assert.equal(restarted.transact({ ...request, quotedPrice: undefined } as AccountRequest, 0).status, 'not_committed');
    assert.equal(fixture.storage.operations.some(op => op.kind === 'set'), false);
  }
});

for (const [label, factory, free] of [['paid', paidFactory, false], ['free', freeFactory, true]] as const) {
  test(`${label} every before/after I/O fault keeps whole batch state and exact retry charges and grants only once`, () => {
    for (const item of ITEMS) {
      const request = purchase(item, 5, free ? 0 : ITEM_PRICES[item] * 5), baseline = setup({}, factory);
      const success = baseline.service.transact(request, 0); assert.equal(success.status, 'acknowledged');
      const expected = success.account!, count = baseline.storage.operations.length;
      for (let at = 1; at <= count; at++) for (const timing of ['before', 'after'] as const) {
        const fixture = setup({}, factory); fixture.storage.resetFault({ at, timing });
        const attempted = fixture.service.transact(request, 0);
        if (attempted.status !== 'acknowledged') assert.deepEqual(fixture.service.getSnapshot(), fixture.account, `${item}/${at}/${timing} speculative publication`);
        fixture.storage.resetFault();
        const loaded = loadAccount(fixture.storage, assertAccountSnapshot);
        assert.ok(['ready', 'degraded'].includes(loaded.status));
        assert.deepEqual(loaded.account, loaded.account!.generation === 0 ? fixture.account : expected, `${item}/${at}/${timing} partial batch`);
        const retry = fixture.service.getPendingOperationId() ? fixture.service.retryPending(request.operationId) : fixture.service.transact(request, 0);
        assert.equal(retry.status, 'acknowledged', `${item}/${at}/${timing}: ${retry.message}`); assert.deepEqual(fixture.service.getSnapshot(), expected);
        assert.equal(fixture.storage.values.get(ACCOUNT_KEYS.a), fixture.storage.values.get(ACCOUNT_KEYS.b));
        const restarted = createAccountService(fixture.storage, held(), () => 0); fixture.storage.resetFault();
        assert.equal(restarted.transact(request, 0).status, 'acknowledged'); assert.deepEqual(restarted.getSnapshot(), expected);
        assert.equal(fixture.storage.operations.some(op => op.kind === 'set'), false);
      }
    }
  });

  test(`${label} a failed mirror remains unpublished and restart repairs the complete receipt once`, () => {
    const fixture = setup({}, factory), request = purchase('clear', 4, free ? 0 : 480), originalSet = fixture.storage.set.bind(fixture.storage);
    fixture.storage.set = (key, value) => { if (key === ACCOUNT_KEYS.a) throw Error('mirror unavailable'); originalSet(key, value); };
    assert.equal(fixture.service.transact(request, 0).status, 'committed_unmirrored'); assert.deepEqual(fixture.service.getSnapshot(), fixture.account);
    assert.equal(fixture.service.transact(purchase('wildcard', 2, free ? 0 : 320, 'tools.other'), 0).status, 'not_committed');
    fixture.storage.set = originalSet;
    const restarted = createAccountService(fixture.storage, held(), () => 0);
    assert.equal(restarted.getSnapshot(), null); assert.equal(restarted.getPendingOperationId(), request.operationId);
    const repaired = restarted.retryPending(request.operationId); assert.equal(repaired.status, 'acknowledged');
    assert.equal(repaired.account!.wallet, fixture.account.wallet - (free ? 0 : 480));
    assert.deepEqual(repaired.account!.inventory, { ...fixture.account.inventory, clear: fixture.account.inventory.clear + 4 });
    assert.equal(restarted.transact(request, 0).status, 'acknowledged'); assert.equal(restarted.getSnapshot()!.generation, 1);
    assert.equal(fixture.storage.values.get(ACCOUNT_KEYS.a), fixture.storage.values.get(ACCOUNT_KEYS.b));
  });

  test(`${label} either corrupt mirror recovers the persisted whole batch without reinterpreting its price`, () => {
    for (const damaged of [ACCOUNT_KEYS.a, ACCOUNT_KEYS.b]) {
      const fixture = setup({}, factory), request = purchase('wildcard', 6, free ? 0 : 960);
      const result = fixture.service.transact(request, 0); assert.equal(result.status, 'acknowledged');
      fixture.storage.values.set(damaged, 'corrupt mirror');
      const restarted = createAccountService(fixture.storage, held(), () => 0);
      assert.equal(restarted.getStatus(), 'degraded'); assert.equal(restarted.getSnapshot(), null);
      const repaired = restarted.retryPending(request.operationId); assert.equal(repaired.status, 'acknowledged'); assert.deepEqual(repaired.account, result.account);
      assert.equal(fixture.storage.values.get(ACCOUNT_KEYS.a), fixture.storage.values.get(ACCOUNT_KEYS.b)); fixture.storage.resetFault();
      assert.equal(restarted.transact(request, 0).status, 'acknowledged'); assert.deepEqual(restarted.getSnapshot(), result.account);
      assert.equal(fixture.storage.operations.some(op => op.kind === 'set'), false);
    }
  });
}
