import assert from 'node:assert/strict';
import test from 'node:test';
import { createAccountService, type AccountRequest, type TransactionResult } from '../src/application/account-service.ts';
import { ACCOUNT_KEYS, encodeAccount, loadAccount } from '../src/application/account-store.ts';
import { assertAccountSnapshot } from '../src/application/account-profile.ts';
import { upgradeEconomy } from '../src/application/economy.ts';
import { accountCosmeticState } from '../src/application/cosmetics.ts';
import { FaultStorage, makeAccountFixture } from './helpers/account-fixtures.ts';

function setup(version: 1 | 2 = 1) {
  const account = makeAccountFixture({ wallet: 1800, inventory: { rotate: 2, clear: 1, wildcard: 1 } });
  account.profile.cosmetics = { theme: 'night', forklift: 'red', cargo: 'outline' };
  account.dailyPaid['2026-10-06'] = { bestBase: 45, paid: 90 };
  const old = version === 2 ? upgradeEconomy(account) : account;
  const storage = new FaultStorage(), raw = encodeAccount(old);
  storage.values.set(ACCOUNT_KEYS.a, raw); storage.values.set(ACCOUNT_KEYS.b, raw);
  const service = createAccountService(storage, { status: 'held', release() {} }, () => 0);
  storage.resetFault(); return { storage, service, old };
}

test('every before/after purchase I/O atomically migrates and charges with ownership, then exact retry converges once', () => {
  for (const version of [1, 2] as const) for (const [kind, id, price] of [['cargo', 'wood', 300], ['forklift', 'white', 600], ['theme', 'harbor', 900]] as const) {
    const request: AccountRequest = { type: 'purchaseCosmetic', operationId: 'fault.purchase', kind, id }, baseline = setup(version);
    const success = baseline.service.transact(request, 0); assert.equal(success.status, 'acknowledged');
    const expected = success.account!, count = baseline.storage.operations.length;
    for (let at = 1; at <= count; at++) for (const timing of ['before', 'after'] as const) {
      const { storage, service, old } = setup(version); storage.resetFault({ at, timing });
      const attempted = service.transact(request, 0);
      if (attempted.status !== 'acknowledged') assert.deepEqual(service.getSnapshot(), old, `${version}/${kind}/${at}/${timing} speculative publication`);
      storage.resetFault(); const recovered = loadAccount(storage, assertAccountSnapshot);
      assert.ok(['ready', 'degraded'].includes(recovered.status), `${version}/${kind}/${at}/${timing}`);
      assert.deepEqual(recovered.account, recovered.account?.generation === 0 ? old : expected);
      const retried: TransactionResult = service.getPendingOperationId() ? service.retryPending('fault.purchase') : service.transact(request, 0);
      assert.equal(retried.status, 'acknowledged', `${version}/${kind}/${at}/${timing}: ${retried.message}`);
      assert.deepEqual(service.getSnapshot(), expected);
      assert.equal(service.getSnapshot()?.wallet, 1800 - price);
      assert.equal(storage.values.get(ACCOUNT_KEYS.a), storage.values.get(ACCOUNT_KEYS.b));
      assert.equal(service.transact(request, 0).status, 'acknowledged');
      assert.equal(service.getSnapshot()?.wallet, 1800 - price);
      assert.deepEqual(service.getSnapshot()?.inventory, old.inventory);
      assert.deepEqual(service.getSnapshot()?.dailyPaid, old.dailyPaid);
      assert.equal(service.getSnapshot()?.profile.cargoOutline, true);
      assert.ok(accountCosmeticState(service.getSnapshot()).ownedCosmetics.includes('forklift.red'));
    }
  }
});

test('mirror failure hides new paid rights until repair and restart retains the exact purchase receipt', () => {
  const { storage, service, old } = setup(), set = storage.set.bind(storage);
  storage.set = (key, value) => { if (key === ACCOUNT_KEYS.a) throw Error('mirror unavailable'); set(key, value); };
  const request: AccountRequest = { operationId: 'wood.once', type: 'purchaseCosmetic', kind: 'cargo', id: 'wood' };
  assert.equal(service.transact(request, 0).status, 'committed_unmirrored');
  assert.deepEqual(service.getSnapshot(), old);
  assert.equal(accountCosmeticState(service.getSnapshot()).ownedCosmetics.includes('cargo.wood'), false);
  assert.equal(service.transact({ ...request, operationId: 'wood.other' }, 0).status, 'not_committed');
  const restarted = createAccountService(storage, { status: 'held', release() {} }, () => 0);
  assert.equal(restarted.getSnapshot(), null); assert.equal(restarted.getPendingOperationId(), 'wood.once');
  storage.set = set;
  assert.equal(restarted.retryPending('wood.once').status, 'acknowledged');
  assert.equal(restarted.getSnapshot()?.wallet, 1500);
  assert.ok(restarted.getSnapshot()?.profile.ownedCosmetics?.includes('cargo.wood'));
  assert.equal(restarted.transact({ ...request, operationId: 'wood.again' }, 1).status, 'acknowledged');
  assert.equal(restarted.getSnapshot()?.wallet, 1500);
});

test('paid ownership survives a later tool purchase, active reservation, equip and result reset without board changes', () => {
  const { service } = setup(2);
  let op = 0;
  const transact = (request: Record<string, unknown>) => service.transact({ operationId: `isolation.${++op}`, ...request } as AccountRequest, service.getSnapshot()!.generation);
  assert.equal(transact({ type: 'purchaseCosmetic', kind: 'cargo', id: 'wood' }).status, 'acknowledged');
  assert.equal(transact({ type: 'purchase', item: 'rotate' }).status, 'acknowledged');
  const start = transact({ type: 'start', intent: { spec: { family: 'inbound', rulesetVersion: 14, mode: 'standard', seed: 7, guided: false, toolCharges: { rotate: 0, clear: 0, wildcard: 0 } }, items: ['rotate', 'clear'], guide: 'direct' } });
  assert.equal(start.status, 'acknowledged'); const before = start.account!;
  assert.deepEqual(before.run?.reserved, ['rotate', 'clear']);
  assert.equal(before.run?.identity.economyVersion, 2);
  for (const request of [{ type: 'setCosmetic', kind: 'cargo', id: 'wood' }, { type: 'setCargoOutline', enabled: true }] as const) {
    assert.equal(transact(request).status, 'acknowledged');
    assert.deepEqual(service.getSnapshot()?.run, before.run);
    assert.deepEqual(service.getSnapshot()?.inventory, before.inventory);
    assert.equal(service.getSnapshot()?.wallet, before.wallet);
  }
  const reset = transact({ type: 'resetResults' }); assert.equal(reset.status, 'acknowledged');
  assert.equal(reset.account?.profile.cosmetics.cargo, 'wood'); assert.equal(reset.account?.profile.cargoOutline, true);
  assert.ok(reset.account?.profile.ownedCosmetics?.includes('cargo.wood'));
  assert.deepEqual(reset.account?.run?.identity, before.run?.identity);
  assert.deepEqual(reset.account?.run?.state, before.run?.state);
  assert.deepEqual(reset.account?.run?.reserved, before.run?.reserved);
  assert.deepEqual(reset.account?.inventory, before.inventory);
  assert.deepEqual(reset.account?.dailyPaid, before.dailyPaid);
});
