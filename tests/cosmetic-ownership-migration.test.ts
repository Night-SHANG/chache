import assert from 'node:assert/strict';
import test from 'node:test';
import { accountCosmeticState, COSMETIC_CATALOG, FREE_COSMETICS } from '../src/application/cosmetics.ts';
import { createAccountService, accountDisplayProfile } from '../src/application/account-service.ts';
import { ACCOUNT_KEYS, encodeAccount, decodeAccount, loadAccount, repairAccount } from '../src/application/account-store.ts';
import { assertAccountSnapshot } from '../src/application/account-profile.ts';
import { accountDigest, canonicalStringify, serializeAccount, deserializeAccount, verifyAccountReferences } from '../src/application/history-store.ts';
import { createProfile, encodeProfile, PROFILE_KEYS, localDailyChallenge } from '../src/application/profile.ts';
import { upgradeEconomy } from '../src/application/economy.ts';
import type { AccountSnapshot, ResultBucket } from '../src/application/account-types.ts';
import { FaultStorage, makeAccountFixture, makeAccountRun } from './helpers/account-fixtures.ts';

function setup(account = makeAccountFixture()) {
  const storage = new FaultStorage(), raw = encodeAccount(account);
  storage.values.set(ACCOUNT_KEYS.a, raw); storage.values.set(ACCOUNT_KEYS.b, raw);
  const service = createAccountService(storage, { status: 'held', release() {} }, () => 0);
  return { storage, service, raw };
}
const bucket = (units: number, wins = 0): ResultBucket => ({ runs: 1, units, maxUnits: units, score: units * 100, wins, retirements: 0, maxChain: 1, best: { score: units * 100, units, chain: 1 } });

// Removing the null/legacy branch would lose real pre-account rights or create a preview write.
test('before account creation a pure preview retains only verified legacy rights and worn style', () => {
  const legacy = createProfile(); legacy.cosmetics = { theme: 'night', forklift: 'red', cargo: 'outline' };
  legacy.stats = { runs: 1, orders: 30, wins: 1, maxChain: 1 }; legacy.achievements = ['first_shipment', 'five_shifts'];
  const storage = new FaultStorage(); storage.values.set(PROFILE_KEYS.main, encodeProfile(legacy));
  const before = structuredClone(legacy), bytes = new Map(storage.values);
  const preview = accountCosmeticState(null, legacy);
  assert.equal(preview.cosmetics.cargo, 'classic'); assert.equal(preview.cargoOutline, true);
  assert.ok(preview.ownedCosmetics.includes('forklift.red')); assert.ok(preview.ownedCosmetics.includes('forklift.blue'));
  assert.deepEqual(legacy, before); assert.deepEqual(storage.values, bytes);
  assert.deepEqual(accountCosmeticState(null).ownedCosmetics, FREE_COSMETICS);
});

test('previews and refresh leave account1/2 bytes unchanged until the requested transaction', () => {
  for (const version of [1, 2] as const) {
    const old = makeAccountFixture({ wallet: 500 }); old.profile.cosmetics.cargo = 'outline';
    const account = version === 1 ? old : upgradeEconomy(old), { storage, service, raw } = setup(account);
    storage.resetFault(); const preview = accountCosmeticState(service.getSnapshot());
    assert.equal(preview.cargoOutline, true); service.refresh();
    assert.equal(service.getSnapshot()?.formatVersion, version);
    assert.deepEqual([...storage.values.values()], [raw, raw]);
    assert.equal(storage.operations.some(op => op.kind === 'set'), false);
    const result = service.transact({ operationId: 'migrate', type: 'setSettings', patch: { sound: false } }, 0);
    assert.equal(result.status, 'acknowledged'); assert.equal(result.account?.formatVersion, 4);
    assert.equal(result.account?.economyVersion, 2); assert.equal(result.account?.wallet, 500);
    assert.equal(result.account?.profile.cargoOutline, true); assert.equal(result.account?.profile.cosmetics.cargo, 'classic');
    assert.deepEqual(decodeAccount(storage, storage.values.get(ACCOUNT_KEYS.a)!), result.account);
    assert.deepEqual(deserializeAccount(storage, serializeAccount(result.account!)), result.account);
  }
});

test('current catalog retains five free rights, 38 active unique identifiers and exact independent prices', () => {
  assert.deepEqual(FREE_COSMETICS, ['cargo.classic', 'cargo.outline', 'forklift.yellow', 'theme.day', 'theme.night']);
  assert.equal(COSMETIC_CATALOG.length, 38);
  assert.equal(new Set(COSMETIC_CATALOG.map(item => item.key)).size, 38);
  assert.deepEqual(COSMETIC_CATALOG.filter(item => item.price > 0).map(item => [item.key, item.price]).sort(), [
    ['forklift.timber', 600], ['forklift.ice', 600], ['theme.forest_depot', 900], ['theme.ice_vault', 900],
    ['cargo.ice_crystal', 300], ['cargo.lava_core', 300], ['cargo.ocean_relic', 300], ['cargo.steam_brass', 300], ['cargo.insulated', 300], ['cargo.paper_fold', 300], ['cargo.reinforced', 300], ['cargo.space_case', 300], ['cargo.toy_brick', 300], ['cargo.wood', 300],
    ['forklift.diving', 600], ['forklift.lava', 600], ['forklift.steam', 600], ['forklift.electric', 600], ['forklift.heavy', 600], ['forklift.paper', 600], ['forklift.space', 600], ['forklift.toy', 600], ['forklift.white', 600],
    ['theme.lava_forge', 900], ['theme.ocean_vault', 900], ['theme.steam_foundry', 900], ['theme.cold_chain', 900], ['theme.paper_warehouse', 900], ['theme.rail_freight', 900], ['theme.space_cargo', 900], ['theme.toy_workshop', 900],
  ].sort());
});

test('inbound formal proof unlocks blue, only standard win unlocks red, and erased history stays erased', () => {
  for (const key of ['outbound.v8.normal', 'outbound.v12.normal.plain', 'outboundEndless.v13.normal.plain', 'inbound.guided.v15.plain', 'inbound.endless.v14.plain']) {
    const account = makeAccountFixture(); account.profile.results[key] = bucket(30, 1);
    assert.deepEqual(accountCosmeticState(account).ownedCosmetics, FREE_COSMETICS, key);
  }
  const daily = makeAccountFixture(); daily.profile.results['inbound.daily.v15.plain'] = bucket(30, 1);
  assert.equal(accountCosmeticState(daily).ownedCosmetics.includes('forklift.blue'), true);
  assert.equal(accountCosmeticState(daily).ownedCosmetics.includes('forklift.red'), false);
  const standard = makeAccountFixture(); standard.profile.results['inbound.standard.v15.tools'] = bucket(30, 1);
  const { service } = setup(standard);
  const reset = service.transact({ operationId: 'reset', type: 'resetResults' }, 0);
  assert.equal(reset.status, 'acknowledged');
  assert.deepEqual(accountDisplayProfile(reset.account!).achievements, []);
  assert.ok(reset.account?.profile.ownedCosmetics?.includes('forklift.blue'));
  assert.ok(reset.account?.profile.ownedCosmetics?.includes('forklift.red'));
  assert.deepEqual(accountCosmeticState(makeAccountFixture()).ownedCosmetics, FREE_COSMETICS);
});

test('migration leaves old bound run economy and daily safety records intact', () => {
  const old = makeAccountFixture({ nextRunSerial: 2, run: makeAccountRun() });
  const day = localDailyChallenge(0, 14).day;
  old.dailyPaid[day] = { bestBase: 45, paid: 90 };
  const { service, storage } = setup(old), run = structuredClone(old.run);
  const result = service.transact({ operationId: 'settings', type: 'setSettings', patch: { sound: false } }, 0);
  assert.equal(result.status, 'acknowledged'); assert.equal(result.account?.formatVersion, 4);
  assert.deepEqual(result.account?.run, run); assert.equal(result.account?.run?.identity.economyVersion, 1);
  assert.deepEqual(result.account?.dailyPaid, old.dailyPaid);
  verifyAccountReferences(storage, result.account!);
});

function envelope(account: unknown): string {
  return canonicalStringify({ formatVersion: 1, generation: (account as AccountSnapshot).generation, account, digest: accountDigest(canonicalStringify(account)) });
}

test('digest-valid illegal owned ids, duplicates, unsorted ids and unowned equips block both-root repair', () => {
  const { service } = setup();
  const account = service.transact({ operationId: 'migrate', type: 'setSettings', patch: {} }, 0).account!;
  const invalidProfiles = [
    { ...account.profile, ownedCosmetics: [...account.profile.ownedCosmetics!, 'cargo.missing'].sort() },
    { ...account.profile, ownedCosmetics: [...account.profile.ownedCosmetics!, 'cargo.classic'].sort() },
    { ...account.profile, ownedCosmetics: [...account.profile.ownedCosmetics!].reverse() },
    { ...account.profile, ownedCosmetics: undefined },
    { ...account.profile, cargoOutline: 'yes' },
    { ...account.profile, cosmetics: { ...account.profile.cosmetics, cargo: 'wood' } },
    { ...account.profile, cosmetics: { ...account.profile.cosmetics, cargo: 'outline' } },
    { ...account.profile, cosmetics: { ...account.profile.cosmetics, forklift: 'constructor' } },
  ];
  for (const profile of invalidProfiles) {
    const changed = { ...account, profile }; assert.throws(() => assertAccountSnapshot(changed));
    for (const badSide of ['a', 'b'] as const) {
      const storage = new FaultStorage(); storage.values.set(ACCOUNT_KEYS.a, encodeAccount(account)); storage.values.set(ACCOUNT_KEYS.b, encodeAccount(account)); storage.values.set(ACCOUNT_KEYS[badSide], envelope(changed));
      const before = new Map(storage.values);
      assert.equal(loadAccount(storage, assertAccountSnapshot).status, 'unknown');
      assert.equal(repairAccount(storage, assertAccountSnapshot).status, 'unknown');
      assert.deepEqual(storage.values, before); assert.equal(storage.operations.some(op => op.kind === 'set'), false);
    }
  }
});

test('future account and unsupported economy formats retain original bytes beside a valid root', () => {
  const { service } = setup(), account = service.transact({ operationId: 'migrate', type: 'setSettings', patch: {} }, 0).account!;
  for (const patch of [{ formatVersion: 5, economyVersion: 2 }, { formatVersion: 3, economyVersion: 3 }]) {
    const storage = new FaultStorage(); storage.values.set(ACCOUNT_KEYS.a, encodeAccount(account)); storage.values.set(ACCOUNT_KEYS.b, envelope({ ...account, ...patch }));
    const bytes = new Map(storage.values); assert.equal(repairAccount(storage, assertAccountSnapshot).status, 'unknown'); assert.deepEqual(storage.values, bytes);
  }
});

test('format4 preserves newly imported legacy daily completion across a later record reset', () => {
  const initial = setup();
  const canonical = initial.service.transact({ operationId: 'canonical', type: 'setSettings', patch: {} }, 0).account!;
  const daily = localDailyChallenge(0, 3);
  canonical.profile.legacyResults.dailyHistory[daily.id] = { day: daily.day, seed: daily.seed, rulesetVersion: 3, score: 100, orders: 30, won: true };
  const { service } = setup(canonical);
  const result = service.transact({ operationId: 'reset.later', type: 'resetResults' }, canonical.generation);
  assert.equal(result.status, 'acknowledged');
  assert.equal(result.account?.formatVersion, 4);
  assert.equal(result.account?.dailyRewards?.[daily.day]?.completedRunId, `legacy.${daily.day}`);
});
