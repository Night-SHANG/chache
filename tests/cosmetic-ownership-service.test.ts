import assert from 'node:assert/strict';
import test from 'node:test';
import { createAccountService, type AccountRequest } from '../src/application/account-service.ts';
import { ACCOUNT_KEYS, encodeAccount } from '../src/application/account-store.ts';
import { setProfileCosmetic, createProfile } from '../src/application/profile.ts';
import type { AccountSnapshot } from '../src/application/account-types.ts';
import { FaultStorage, makeAccountFixture, makeAccountRun } from './helpers/account-fixtures.ts';

function setup(account = makeAccountFixture({ wallet: 1800 })) {
  const storage = new FaultStorage(), raw = encodeAccount(account);
  storage.values.set(ACCOUNT_KEYS.a, raw); storage.values.set(ACCOUNT_KEYS.b, raw);
  const service = createAccountService(storage, { status: 'held', release() {} }, () => 0);
  let serial = 0;
  const transact = (request: Record<string, unknown>) => service.transact({ operationId: `cosmetics.${++serial}`, ...request } as AccountRequest, service.getSnapshot()!.generation);
  return { storage, service, transact, raw };
}
const owned = (account: Readonly<AccountSnapshot> | null) => (account?.profile as AccountSnapshot['profile'] & {ownedCosmetics?: string[]})?.ownedCosmetics;

test('buying wood commits exactly 300 coins and permanent ownership without equipping it', () => {
  const { service, transact, storage } = setup();
  const result = transact({ type: 'purchaseCosmetic', kind: 'cargo', id: 'wood' });
  assert.equal(result.status, 'acknowledged');
  assert.equal(result.account?.wallet, 1500);
  assert.equal(result.account?.formatVersion, 3);
  assert.equal(result.account?.economyVersion, 2);
  assert.ok(owned(result.account)?.includes('cargo.wood'));
  assert.equal(result.account?.profile.cosmetics.cargo, 'classic');
  assert.equal(storage.values.get(ACCOUNT_KEYS.a), storage.values.get(ACCOUNT_KEYS.b));
  assert.equal(transact({ type: 'purchaseCosmetic', kind: 'cargo', id: 'wood' }).status, 'acknowledged');
  assert.equal(service.getSnapshot()?.wallet, 1500);
  assert.equal(transact({ type: 'setCosmetic', kind: 'cargo', id: 'wood' }).status, 'acknowledged');
  assert.equal(service.getSnapshot()?.profile.cosmetics.cargo, 'wood');
});

test('all paid prices are authoritative and exact balance can reach zero', () => {
  const { service, transact } = setup();
  for (const [kind, id, wallet] of [['cargo', 'wood', 1500], ['forklift', 'white', 900], ['theme', 'harbor', 0]] as const) {
    assert.equal(transact({ type: 'purchaseCosmetic', kind, id }).status, 'acknowledged');
    assert.equal(service.getSnapshot()?.wallet, wallet);
  }
  assert.equal(transact({ type: 'purchaseCosmetic', kind: 'theme', id: 'harbor' }).status, 'acknowledged');
  assert.equal(service.getSnapshot()?.wallet, 0);
});

test('unowned paid equip, insufficient coins and unknown purchases leave legacy bytes untouched', () => {
  for (const request of [
    { type: 'setCosmetic', kind: 'cargo', id: 'wood' },
    { type: 'purchaseCosmetic', kind: 'cargo', id: 'wood' },
    { type: 'purchaseCosmetic', kind: 'cargo', id: 'missing' },
    { type: 'purchaseCosmetic', kind: 'forklift', id: 'red' },
    { type: 'purchaseCosmetic', kind: '__proto__', id: 'wood' },
  ]) {
    const { storage, transact, raw } = setup(makeAccountFixture({ wallet: 299 })); storage.resetFault();
    assert.equal(transact(request).status, 'not_committed');
    assert.deepEqual([...storage.values.values()], [raw, raw]);
    assert.equal(storage.operations.some(op => op.kind === 'set'), false);
  }
  assert.ok(setProfileCosmetic(createProfile(), 'cargo', 'wood').error);
});

test('legacy worn red survives reset and can be equipped again after switching away', () => {
  const account = makeAccountFixture(); account.profile.cosmetics.forklift = 'red';
  const { service, transact } = setup(account);
  assert.equal(transact({ type: 'resetResults' }).status, 'acknowledged');
  assert.ok(owned(service.getSnapshot())?.includes('forklift.red'));
  assert.equal(transact({ type: 'setCosmetic', kind: 'forklift', id: 'yellow' }).status, 'acknowledged');
  assert.equal(transact({ type: 'setCosmetic', kind: 'forklift', id: 'red' }).status, 'acknowledged');
  assert.equal(service.getSnapshot()?.profile.cosmetics.forklift, 'red');
});

test('outline migrates to a free independent overlay and remains on wood across reset', () => {
  const account = makeAccountFixture({ wallet: 300 }); account.profile.cosmetics.cargo = 'outline';
  const { service, transact } = setup(account);
  assert.equal(transact({ type: 'purchaseCosmetic', kind: 'cargo', id: 'wood' }).status, 'acknowledged');
  assert.equal(service.getSnapshot()?.profile.cosmetics.cargo, 'classic');
  assert.equal((service.getSnapshot()?.profile as {cargoOutline?: boolean}).cargoOutline, true);
  assert.equal(transact({ type: 'setCosmetic', kind: 'cargo', id: 'wood' }).status, 'acknowledged');
  assert.equal(transact({ type: 'resetResults' }).status, 'acknowledged');
  assert.equal(service.getSnapshot()?.profile.cosmetics.cargo, 'wood');
  assert.equal((service.getSnapshot()?.profile as {cargoOutline?: boolean}).cargoOutline, true);
  assert.equal(transact({ type: 'setCargoOutline', enabled: false }).status, 'acknowledged');
  assert.equal((service.getSnapshot()?.profile as {cargoOutline?: boolean}).cargoOutline, false);
  assert.equal(service.getSnapshot()?.wallet, 0);
});

test('active run purchase rejection preserves the run identity and reserved tool inventory', () => {
  const run = makeAccountRun(), account = makeAccountFixture({ wallet: 1800, nextRunSerial: 2, run });
  const { service, transact, storage, raw } = setup(account);
  assert.equal(transact({ type: 'purchaseCosmetic', kind: 'theme', id: 'harbor' }).status, 'not_committed');
  assert.deepEqual(service.getSnapshot(), account);
  assert.deepEqual([...storage.values.values()], [raw, raw]);
});
