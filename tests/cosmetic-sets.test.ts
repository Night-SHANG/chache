import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
import { createAccountService, type AccountRequest } from '../src/application/account-service.ts';
import { upgradeAccountGuides } from '../src/application/account-guides.ts';
import { assertAccountSnapshot } from '../src/application/account-profile.ts';
import { ACCOUNT_KEYS, encodeAccount, loadAccount } from '../src/application/account-store.ts';
import { COSMETIC_CATALOG, getCosmetic, retainAccountCosmetics } from '../src/application/cosmetics.ts';
import * as cosmeticSets from '../src/application/cosmetic-sets.ts';
import { upgradeEconomy } from '../src/application/economy.ts';
import { FaultStorage, makeAccountFixture, makeAccountRun } from './helpers/account-fixtures.ts';

const TRIPLES = [
  ['cold_chain', 'insulated', 'electric'],
  ['rail_freight', 'reinforced', 'heavy'],
  ['express_sorting', 'taped', 'compact'],
  ['toy_workshop', 'toy_brick', 'toy'],
  ['paper_warehouse', 'paper_fold', 'paper'],
  ['space_cargo', 'space_case', 'space'],
  ['steam_foundry', 'steam_brass', 'steam'],
  ['neon_depot', 'neon_circuit', 'neon'],
  ['lava_forge', 'lava_core', 'lava'],
  ['ocean_vault', 'ocean_relic', 'diving'],
  ['royal_store', 'royal_gold', 'royal'],
  ['field_station', 'field_supply', 'field'],
  ['forest_depot', 'wood', 'timber'],
  ['ice_vault', 'ice_crystal', 'ice'],
  ['harbor', 'harbor_container', 'harbor'],
] as const;
const members = ([theme, cargo, forklift]: readonly string[]) => [`theme.${theme}`, `cargo.${cargo}`, `forklift.${forklift}`];

function setup(owned = members(TRIPLES[0]), factory = createAccountService, active = false) {
  const account = upgradeAccountGuides(retainAccountCosmetics(upgradeEconomy(makeAccountFixture({
    wallet: 2345, inventory: { rotate: 2, clear: 1, wildcard: 1 },
    ...(active ? { run: makeAccountRun(), nextRunSerial: 2 } : {}),
  }))));
  account.profile.ownedCosmetics = [...new Set([...account.profile.ownedCosmetics!, ...owned])].sort();
  account.profile.cargoOutline = true;
  account.profile.cosmetics.theme = 'night';
  const storage = new FaultStorage(), raw = encodeAccount(account);
  for (const key of [ACCOUNT_KEYS.a, ACCOUNT_KEYS.b]) storage.values.set(key, raw);
  const service = factory(storage, { status: 'held', release() {} }, () => 0);
  storage.resetFault();
  return { account, storage, service, raw };
}
const request = (id: string, operationId = 'set.once'): AccountRequest => ({ type: 'equipCosmeticSet', id, operationId });

test('the immutable set catalogue names exactly fifteen triples and leaves eight independent entries', () => {
  assert.deepEqual(cosmeticSets.COSMETIC_SETS.map(set => [set.theme, set.cargo, set.forklift]), TRIPLES);
  assert.ok(Object.isFrozen(cosmeticSets.COSMETIC_SETS));
  const used = new Set<string>();
  for (const set of cosmeticSets.COSMETIC_SETS) {
    assert.ok(Object.isFrozen(set));
    assert.equal(set.id, set.theme);
    assert.equal(set.name, getCosmetic('theme', set.theme)?.name);
    assert.equal(cosmeticSets.getCosmeticSet(set.id), set);
    for (const kind of ['theme', 'cargo', 'forklift'] as const) {
      const item = getCosmetic(kind, set[kind]);
      assert.ok(item && !item.overlay);
      assert.equal(used.has(item.key), false);
      used.add(item.key);
    }
  }
  assert.equal(COSMETIC_CATALOG.length, 53);
  assert.equal(used.size, 45);
  assert.equal(COSMETIC_CATALOG.filter(item => !used.has(item.key)).length, 8);
  for (const id of ['', 'unknown', '__proto__', 'day', 'outline']) assert.equal(cosmeticSets.getCosmeticSet(id), undefined);
});

test('set status derives all ownership combinations and equipped state without mutating the source', () => {
  assert.equal(typeof cosmeticSets.cosmeticSetStatus, 'function');
  for (const set of cosmeticSets.COSMETIC_SETS) for (let mask = 0; mask < 8; mask++) {
    const keys = members([set.theme, set.cargo, set.forklift]).filter((_, index) => mask & (1 << index));
    const state = { ownedCosmetics: [...keys, ...keys, 'cargo.classic'], cosmetics: { theme: set.theme, cargo: set.cargo, forklift: set.forklift } };
    const before = structuredClone(state);
    Object.freeze(state.ownedCosmetics); Object.freeze(state.cosmetics); Object.freeze(state);
    assert.deepEqual(cosmeticSets.cosmeticSetStatus(set, state), { ownedCount: keys.length, complete: mask === 7, equipped: mask === 7 });
    assert.deepEqual(cosmeticSets.cosmeticSetStatus(set, { ...state, cosmetics: { ...state.cosmetics, cargo: 'classic' } }), { ownedCount: keys.length, complete: mask === 7, equipped: false });
    assert.deepEqual(state, before);
  }
});

test('every owned set equips its exact triple in one generation without changing other account state', () => {
  for (const triple of TRIPLES) for (const active of [false, true]) {
    const [theme, cargo, forklift] = triple, { account, service, storage } = setup(members(triple), createAccountService, active);
    const result = service.transact(request(theme), 0);
    assert.equal(result.status, 'acknowledged', `${theme}/${active}: ${result.message}`);
    const expected = structuredClone(account);
    expected.generation = 1;
    expected.lastOperation = result.account!.lastOperation;
    expected.profile.cosmetics = { theme, cargo, forklift };
    assert.deepEqual(result.account, expected);
    assert.deepEqual(service.getSnapshot(), expected);
    assert.equal(result.operation?.coinDelta, 0);
    assert.equal(storage.operations.filter(op => op.kind === 'set').length, 2, 'one A/B account commit');
    assert.equal(storage.values.get(ACCOUNT_KEYS.a), storage.values.get(ACCOUNT_KEYS.b));
  }
});

test('any missing member rejects the whole set without ownership claims, purchases or storage writes', () => {
  for (const triple of TRIPLES) for (const absent of members(triple)) {
    const { account, service, storage, raw } = setup(members(triple).filter(key => key !== absent));
    const result = service.transact(request(triple[0]), 0);
    assert.equal(result.status, 'not_committed', absent);
    assert.deepEqual(service.getSnapshot(), account);
    assert.deepEqual([...storage.values.values()], [raw, raw]);
    assert.equal(storage.operations.some(op => op.kind === 'set'), false);
    assert.equal(service.getPendingOperationId(), null);
  }
});

test('unknown and malformed set requests fail safely and never write a root', () => {
  for (const patch of [{ id: 'missing' }, { id: '__proto__' }, { id: 'day' }, { id: null }, { id: 3 }, { id: '' }, {}, { id: 'cold_chain', kind: 'theme' }]) {
    const { account, service, storage, raw } = setup();
    const malformed = { operationId: 'set.invalid', type: 'equipCosmeticSet', ...patch } as AccountRequest;
    assert.equal(service.transact(malformed, 0).status, 'not_committed');
    assert.deepEqual(service.getSnapshot(), account);
    assert.deepEqual([...storage.values.values()], [raw, raw]);
    assert.equal(storage.operations.some(op => op.kind === 'set'), false);
  }
});

test('all before/after storage failures retain a whole old or new triple and exact retry converges once', () => {
  const baseline = setup(), operation = request('cold_chain', 'set.fault');
  const success = baseline.service.transact(operation, 0);
  assert.equal(success.status, 'acknowledged');
  const expected = success.account!, count = baseline.storage.operations.length;
  for (let at = 1; at <= count; at++) for (const timing of ['before', 'after'] as const) {
    const { account, storage, service } = setup();
    storage.resetFault({ at, timing });
    const attempted = service.transact(operation, 0);
    if (attempted.status !== 'acknowledged') assert.deepEqual(service.getSnapshot(), account, `${at}/${timing} speculative publication`);
    storage.resetFault();
    const recovered = loadAccount(storage, assertAccountSnapshot);
    assert.ok(['ready', 'degraded'].includes(recovered.status), `${at}/${timing}`);
    assert.deepEqual(recovered.account, recovered.account?.generation === 0 ? account : expected, `${at}/${timing} partial state`);
    const retried = service.getPendingOperationId() ? service.retryPending('set.fault') : service.transact(operation, 0);
    assert.equal(retried.status, 'acknowledged', `${at}/${timing}: ${retried.message}`);
    assert.deepEqual(service.getSnapshot(), expected);
    assert.equal(storage.values.get(ACCOUNT_KEYS.a), storage.values.get(ACCOUNT_KEYS.b));
    storage.resetFault();
    assert.equal(service.transact(operation, 0).status, 'acknowledged');
    assert.deepEqual(service.getSnapshot(), expected);
    assert.equal(storage.operations.some(op => op.kind === 'set'), false, 'exact replay must not commit again');
  }
});

test('mirror failure publishes no partial set and restarted repair retains all three slots and outline', () => {
  const { account, storage, service } = setup(), set = storage.set.bind(storage);
  storage.set = (key, value) => { if (key === ACCOUNT_KEYS.a) throw Error('mirror unavailable'); set(key, value); };
  const operation = request('cold_chain', 'set.mirror');
  assert.equal(service.transact(operation, 0).status, 'committed_unmirrored');
  assert.deepEqual(service.getSnapshot(), account);
  assert.equal(service.transact(request('cold_chain', 'set.other'), 0).status, 'not_committed');
  const restarted = createAccountService(storage, { status: 'held', release() {} }, () => 0);
  assert.equal(restarted.getSnapshot(), null);
  assert.equal(restarted.getPendingOperationId(), 'set.mirror');
  storage.set = set;
  assert.equal(restarted.retryPending('set.mirror').status, 'acknowledged');
  assert.deepEqual(restarted.getSnapshot()?.profile.cosmetics, { theme: 'cold_chain', cargo: 'insulated', forklift: 'electric' });
  assert.equal(restarted.getSnapshot()?.profile.cargoOutline, true);
  assert.deepEqual(restarted.getSnapshot()?.profile.ownedCosmetics, account.profile.ownedCosmetics);
  assert.equal(restarted.getSnapshot()?.wallet, account.wallet);
  assert.equal(restarted.transact(operation, 0).status, 'acknowledged');
  assert.equal(restarted.getSnapshot()?.generation, 1);
});

test('reapplying an equipped set with a fresh request is a no-op and independent mixing remains available', () => {
  const { service, storage } = setup();
  assert.equal(service.transact(request('cold_chain'), 0).status, 'acknowledged');
  const equipped = service.getSnapshot();
  storage.resetFault();
  assert.equal(service.transact(request('cold_chain', 'set.again'), 1).status, 'acknowledged');
  assert.deepEqual(service.getSnapshot(), equipped);
  assert.equal(storage.operations.some(op => op.kind === 'set'), false);
  assert.equal(service.transact({ type: 'setCosmetic', kind: 'theme', id: 'day', operationId: 'mix.theme' }, 1).status, 'acknowledged');
  assert.deepEqual(service.getSnapshot()?.profile.cosmetics, { theme: 'day', cargo: 'insulated', forklift: 'electric' });
  assert.equal(service.getSnapshot()?.profile.cargoOutline, true);
});

test('compiled free playtest still rejects any unowned set member and only equips already owned triples', async () => {
  const built = await build({ stdin: { contents: "export {createAccountService} from './src/application/account-service.ts';", resolveDir: process.cwd(), loader: 'ts' }, bundle: true, write: false, platform: 'node', format: 'esm', define: { __PLAYTEST_FREE_SHOP__: 'true' } });
  const free = await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString('base64')}`) as { createAccountService: typeof createAccountService };
  for (const triple of TRIPLES) {
    for (const keys of [[], ...members(triple).map(absent => members(triple).filter(key => key !== absent))]) {
      const { account, service, storage, raw } = setup(keys, free.createAccountService);
      assert.equal(service.transact(request(triple[0]), 0).status, 'not_committed');
      assert.deepEqual(service.getSnapshot(), account);
      assert.deepEqual([...storage.values.values()], [raw, raw]);
      assert.equal(storage.operations.some(op => op.kind === 'set'), false);
    }
    const { account, service } = setup(members(triple), free.createAccountService);
    assert.equal(service.transact(request(triple[0]), 0).status, 'acknowledged');
    assert.deepEqual(service.getSnapshot()?.profile.ownedCosmetics, account.profile.ownedCosmetics);
    assert.equal(service.getSnapshot()?.wallet, account.wallet);
  }
});

test('explicit outline selection restores classic cargo from ice crystal and disabling keeps classic', () => {
  for (const selection of [{ type: 'setCargoOutline', enabled: true }, { type: 'setCosmetic', kind: 'cargo', id: 'outline' }] as const) {
    const { service } = setup(['cargo.ice_crystal']);
    assert.equal(service.transact({ type: 'setCosmetic', kind: 'cargo', id: 'ice_crystal', operationId: 'outline.ice' }, 0).status, 'acknowledged');
    const before = service.getSnapshot()!;
    assert.equal(service.transact({ ...selection, operationId: 'outline.select' }, 1).status, 'acknowledged');
    const after = service.getSnapshot()!;
    assert.deepEqual(after.profile.cosmetics, { ...before.profile.cosmetics, cargo: 'classic' });
    assert.equal(after.profile.cargoOutline, true);
    assert.deepEqual(after.profile.ownedCosmetics, before.profile.ownedCosmetics);
    assert.equal(after.wallet, before.wallet);
    assert.deepEqual(after.inventory, before.inventory);
    assert.equal(service.transact({ type: 'setCargoOutline', enabled: false, operationId: 'outline.disable' }, 2).status, 'acknowledged');
    assert.equal(service.getSnapshot()?.profile.cosmetics.cargo, 'classic');
    assert.equal(service.getSnapshot()?.profile.cargoOutline, false);
  }
});

test('failed outline selection keeps the previous ice crystal until the whole classic outline state is acknowledged', () => {
  for (const selection of [{ type: 'setCargoOutline', enabled: true }, { type: 'setCosmetic', kind: 'cargo', id: 'outline' }] as const) {
    const { service, storage } = setup(['cargo.ice_crystal']);
    assert.equal(service.transact({ type: 'setCosmetic', kind: 'cargo', id: 'ice_crystal', operationId: 'outline.ice' }, 0).status, 'acknowledged');
    assert.equal(service.transact({ type: 'setCargoOutline', enabled: false, operationId: 'outline.off' }, 1).status, 'acknowledged');
    const before = service.getSnapshot(), set = storage.set.bind(storage);
    storage.set = (key, value) => { if (key === ACCOUNT_KEYS.a) throw Error('mirror unavailable'); set(key, value); };
    assert.equal(service.transact({ ...selection, operationId: 'outline.select' }, 2).status, 'committed_unmirrored');
    assert.deepEqual(service.getSnapshot(), before);
    storage.set = set;
    assert.equal(service.retryPending('outline.select').status, 'acknowledged');
    assert.deepEqual(service.getSnapshot()?.profile.cosmetics, { ...before!.profile.cosmetics, cargo: 'classic' });
    assert.equal(service.getSnapshot()?.profile.cargoOutline, true);
    assert.equal(service.getSnapshot()?.wallet, before!.wallet);
    assert.deepEqual(service.getSnapshot()?.profile.ownedCosmetics, before!.profile.ownedCosmetics);
  }
});
