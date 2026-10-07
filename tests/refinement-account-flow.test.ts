import test from 'node:test';
import assert from 'node:assert/strict';
import { createAccountService, accountDisplayProfile, type StartIntent, type AccountRequest } from '../src/application/account-service.ts';
import { ACCOUNT_KEYS, encodeAccount } from '../src/application/account-store.ts';
import { assertAccountSnapshot } from '../src/application/account-profile.ts';
import { FaultStorage, makeAccountFixture } from './helpers/account-fixtures.ts';
import type { AccountSnapshot } from '../src/application/account-types.ts';
import { findPlayableMoves, previewPlayablePlacement } from '../src/domain/playable.ts';
import { baseCoins } from '../src/application/economy.ts';

const held = { status: 'held' as const, release() {} };
function setup(patch: Partial<AccountSnapshot> = {}) {
  const storage = new FaultStorage();
  const account = makeAccountFixture({ generation: 1, lastOperation: { operationId: 'fixture', expectedGeneration: 0, requestDigest: 'fixture', committedGeneration: 1 }, ...patch });
  for (const key of [ACCOUNT_KEYS.a, ACCOUNT_KEYS.b]) storage.values.set(key, encodeAccount(account));
  const service = createAccountService(storage, held, () => Date.parse('2026-10-06T12:00:00Z'));
  return { storage, service };
}
function intent(mode: 'standard'|'daily'|'endless' = 'standard'): StartIntent {
  return { spec: { family: 'inbound', mode, rulesetVersion: 11, seed: 1, guided: false, toolCharges: { rotate: 0, clear: 0, wildcard: 0 } }, items: [], guide: 'direct' } as StartIntent;
}
function send(service: ReturnType<typeof createAccountService>, request: AccountRequest) {
  return service.transact(request, service.getSnapshot()!.generation);
}

test('v11 starts commit a real pending cleanup board and reservations before generating candidates', () => {
  for (const mode of ['standard', 'daily', 'endless'] as const) {
    const { service } = setup({ inventory: { rotate: 1, clear: 1, wildcard: 0 } });
    const request: AccountRequest = { type: 'start', operationId: 'start', intent: { ...intent(mode), items: mode === 'daily' ? [] : ['rotate', 'clear'] } };
    const started = send(service, request);
    assert.equal(started.status, 'acknowledged', started.message);
    const account = started.account!, run = account.run!;
    assert.equal(run.state.rulesetVersion, 11);
    assert.equal(run.state.phase, 'cleanup');
    assert.equal(run.state.commandIndex, 0);
    assert.deepEqual(run.state.candidates, []);
    assert.deepEqual(run.history.tail, []);
    assert.equal(run.state.score, 0);
    assert.equal(account.wallet, 0);
    assert.deepEqual(run.reserved, request.intent.items);
    const chosen = send(service, { type: 'command', operationId: 'cleanup', runId: run.identity.runId, command: { type: 'chooseCleanup', branch: 'placements' } });
    assert.equal(chosen.status, 'acknowledged', chosen.message);
    assert.equal(chosen.account?.run?.state.phase, 'input');
    assert.equal(chosen.account?.run?.state.commandIndex, 1);
    assert.equal(chosen.account?.run?.state.candidates.length, 3);
    assert.deepEqual(chosen.account?.run?.history.tail, [{ type: 'chooseCleanup', branch: 'placements' }]);
    assert.equal(chosen.account?.wallet, 0);
  }
});

test('v11 cleanup start cannot hide a branch command and abandoned pending runs refund once after restart', () => {
  const { storage, service } = setup({ inventory: { rotate: 1, clear: 0, wildcard: 0 } });
  assert.equal(send(service, { type: 'start', operationId: 'hidden', intent: { ...intent(), cleanupBranch: 'orders' } }).status, 'not_committed');
  const started = send(service, { type: 'start', operationId: 'start', intent: { ...intent(), items: ['rotate'] } });
  assert.equal(started.status, 'acknowledged', started.message);
  const restarted = createAccountService(storage, held, () => 0), run = restarted.getSnapshot()!.run!;
  assert.equal(run.state.phase, 'cleanup');
  const request: AccountRequest = { type: 'close', operationId: 'close', runId: run.identity.runId, reason: 'home' };
  const generation = restarted.getSnapshot()!.generation, closed = restarted.transact(request, generation);
  assert.equal(closed.status, 'acknowledged', closed.message);
  assert.equal(closed.account?.inventory.rotate, 1);
  assert.equal(closed.account?.lastClosedResult?.commandIndex, 0);
  assert.deepEqual(closed.account?.lastClosedResult?.history.tail, []);
  assert.equal(restarted.transact(request, generation).account?.inventory.rotate, 1);
});

test('unmirrored pending cleanup start publishes no speculative reservation and retry reserves once', () => {
  const { storage, service } = setup({ inventory: { rotate: 1, clear: 0, wildcard: 0 } });
  const set = storage.set.bind(storage);
  storage.set = (key, value) => { if (key === ACCOUNT_KEYS.a) throw Error('mirror offline'); set(key, value); };
  const result = send(service, { type: 'start', operationId: 'start', intent: { ...intent(), items: ['rotate'] } });
  assert.equal(result.status, 'committed_unmirrored', result.message);
  assert.equal(service.getSnapshot()?.run, null);
  assert.equal(service.getSnapshot()?.inventory.rotate, 1);
  storage.set = set;
  assert.equal(service.retryPending('start').status, 'acknowledged');
  assert.equal(service.getSnapshot()?.inventory.rotate, 0);
  assert.equal(service.getSnapshot()?.run?.state.commandIndex, 0);
  assert.equal(service.retryPending('start').account?.inventory.rotate, 0);
});

test('v11 achievement projection includes classic buckets without mixing endless, guide or outbound', () => {
  const account = makeAccountFixture();
  const bucket = (units: number) => ({ runs: 1, units, maxUnits: units, score: 10, wins: 1, retirements: 0, maxChain: 3, best: { score: 10, units, chain: 3 } });
  account.profile.results = { 'inbound.standard.v9.plain': bucket(2), 'inbound.standard.v11.plain': bucket(3), 'inbound.daily.v11.tools': bucket(4), 'inbound.endless.v11.plain': bucket(100), 'inbound.guided.v11.plain': bucket(100), 'outbound.v8.easy': bucket(100) };
  assert.doesNotThrow(() => assertAccountSnapshot(account));
  const profile = accountDisplayProfile(account);
  assert.equal(profile.stats.orders, 9);
  assert.equal(profile.stats.runs, 3);
  assert.equal(profile.stats.wins, 3);
  assert.ok(profile.achievements.includes('five_shifts'));
  assert.equal(profile.achievements.includes('ship_100'), false);
});

test('pending v11 cleanup rejects invented elapsed time before the first acknowledged branch', () => {
  const { service } = setup();
  const started = send(service, { type: 'start', operationId: 'start', intent: intent() }).account!;
  const runId = started.run!.identity.runId;
  assert.equal(send(service, { type: 'saveElapsed', operationId: 'clock', runId, elapsedMs: 1 }).status, 'not_committed');
  assert.equal(send(service, { type: 'command', operationId: 'branch.clock', runId, command: { type: 'chooseCleanup', branch: 'orders' }, elapsedMs: 1 }).status, 'not_committed');
  assert.equal(service.getSnapshot()?.run?.state.commandIndex, 0);
  assert.equal(service.getSnapshot()?.run?.state.elapsedMs, 0);
});

test('already bound v9 and v11 daily runs retain the old income formula and capped ledger', () => {
  for (const version of [9, 11] as const) {
    const { service: fresh } = setup();
    const spec = { ...intent('daily').spec, rulesetVersion: version };
    const started = send(fresh, { type: 'start', operationId: `start.${version}`, intent: { ...intent('daily'), spec, ...(version === 9 ? { cleanupBranch: 'orders' as const } : {}) } as StartIntent });
    assert.equal(started.status, 'acknowledged', started.message);
    const legacy = structuredClone(started.account!);
    legacy.formatVersion = 1; legacy.economyVersion = 1; delete legacy.dailyRewards; delete legacy.guides.daily;
    // Reconstruct the historical profile shape; a format3 profile cannot be relabeled as format1.
    const { settings, cosmetics, legacyResults, results } = legacy.profile;
    legacy.profile = { settings, cosmetics, legacyResults, results };
    legacy.dailyPaid = { '2026-10-06': { bestBase: 60, paid: 120 } };
    assert.doesNotThrow(() => assertAccountSnapshot(legacy));
    const { service } = setup(legacy);
    assert.equal(service.getSnapshot()?.formatVersion, 1);
    const runId = legacy.run!.identity.runId, wallet = legacy.wallet;
    assert.equal(service.getSnapshot()?.run?.identity.economyVersion, 1);
    if (version === 11) assert.equal(send(service, { type: 'command', operationId: 'branch.11', runId, command: { type: 'chooseCleanup', branch: 'orders' } }).status, 'acknowledged');
    for (let i = 0; i < 20 && service.getSnapshot()!.run!.state.completedOrders === 0; i++) {
      const state = service.getSnapshot()!.run!.state;
      const move = findPlayableMoves(state).map(move => ({ move, preview: previewPlayablePlacement(state, move.pieceId, move.origin) }))
        .sort((a, b) => b.preview.shipments.reduce((n, event) => n + event.score, 0) - a.preview.shipments.reduce((n, event) => n + event.score, 0))[0]?.move;
      assert.ok(move);
      const placed = send(service, { type: 'command', operationId: `place.${version}.${i}`, runId, command: { type: 'place', ...move } });
      assert.equal(placed.status, 'acknowledged', placed.message);
    }
    const account = service.getSnapshot()!, state = account.run!.state, base = baseCoins('inbound', state.completedOrders, state.score);
    assert.ok(state.completedOrders > 0);
    assert.equal(account.formatVersion, 4);
    assert.equal(account.run!.identity.economyVersion, 1);
    assert.equal(account.run!.earnedCoins, base);
    assert.equal(account.wallet - wallet, base);
    assert.deepEqual(account.dailyPaid, { '2026-10-06': { bestBase: 60, paid: 120 } });
    const closed = send(service, { type: 'close', operationId: `finish.${version}`, runId, reason: 'retired' });
    assert.equal(closed.status, 'acknowledged', closed.message);
    assert.equal(closed.account?.profile.results[`inbound.daily.v${version}.plain`]?.units, state.completedOrders);
    assert.deepEqual(closed.account?.dailyPaid, legacy.dailyPaid);
    const blocked = send(service, { type: 'start', operationId: `blocked.${version}`, intent: { ...intent('daily'), spec, ...(version === 9 ? { cleanupBranch: 'orders' as const } : {}) } as StartIntent });
    assert.equal(blocked.status, 'not_committed');
    assert.equal(service.getSnapshot()?.wallet, account.wallet);
  }
});
