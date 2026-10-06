import assert from 'node:assert/strict';
import test from 'node:test';
import { createAccountService, type AccountRequest, type StartIntent } from '../src/application/account-service.ts';
import { ACCOUNT_KEYS, encodeAccount } from '../src/application/account-store.ts';
import { makeAccountFixture, FaultStorage } from './helpers/account-fixtures.ts';
import type { AccountSnapshot } from '../src/application/account-types.ts';
import type { WriterLease } from '../src/platform/writer-lease.ts';
import { playableChecksum } from '../src/domain/playable.ts';
import { createRunV8, applyCommandV8 } from '../src/domain/v8/engine.ts';
import { findLegalMovesV8 } from '../src/domain/v8/engine.ts';
import { encodeRun, saveKeysFor } from '../src/application/save.ts';

const held = (): WriterLease => ({ status: 'held', release() { this.status = 'busy'; } });
const intent = (patch: Partial<StartIntent> = {}): StartIntent => ({
  spec: { family: 'inbound', mode: 'standard', rulesetVersion: 9, seed: 777, guided: false, toolCharges: { rotate: 0, clear: 0, wildcard: 0 } },
  items: [], guide: 'direct', cleanupBranch: 'orders', ...patch,
});
function setup(patch: Partial<AccountSnapshot> = {}, time = Date.parse('2026-10-06T15:59:00Z')) {
  const storage = new FaultStorage();
  const account = makeAccountFixture({ generation: 1, lastOperation: { operationId: 'fixture', expectedGeneration: 0, requestDigest: 'fixture', committedGeneration: 1 }, ...patch });
  storage.values.set(ACCOUNT_KEYS.a, encodeAccount(account));
  storage.values.set(ACCOUNT_KEYS.b, encodeAccount(account));
  const lease = held(), service = createAccountService(storage, lease, () => time);
  storage.resetFault();
  return { storage, lease, service, account };
}
function send(service: ReturnType<typeof createAccountService>, request: AccountRequest) {
  return service.transact(request, service.getSnapshot()?.generation ?? 0);
}

test('an empty account is read-only until a free start commits migration and a fresh service-owned seed', () => {
  const storage = new FaultStorage(), service = createAccountService(storage, held(), () => 0);
  assert.equal(service.getSnapshot(), null);
  assert.equal(service.getStatus(), 'empty');
  assert.equal(storage.operations.some(op => op.kind === 'set'), false);
  const started = service.transact({ operationId: 'free.start', type: 'start', intent: intent() }, 0);
  assert.equal(started.status, 'acknowledged');
  assert.equal(started.account?.wallet, 0);
  assert.equal(started.account?.run?.identity.serial, 1);
  assert.equal(started.account?.run?.state.phase, 'input');
  assert.notEqual(started.account?.run?.state.seed, 777);
  assert.equal(started.account?.run?.history.totalCommands, 1);
  assert.deepEqual(started.account?.run?.history.tail, [{ type: 'chooseCleanup', branch: 'orders' }]);
});

test('purchase acknowledges exactly once and rejects reused IDs with different payload or stale generations', () => {
  const { service, storage, account } = setup({ wallet: 500 });
  const request: AccountRequest = { operationId: 'buy.rotate', type: 'purchase', item: 'rotate' };
  const bought = service.transact(request, account.generation);
  assert.equal(bought.status, 'acknowledged');
  assert.equal(bought.account?.wallet, 420);
  assert.equal(bought.account?.inventory.rotate, 1);
  const writes = storage.operations.filter(op => op.kind === 'set').length;
  assert.equal(service.transact(request, account.generation).status, 'acknowledged');
  assert.equal(storage.operations.filter(op => op.kind === 'set').length, writes);
  assert.equal(service.transact({ ...request, item: 'clear' }, account.generation).status, 'not_committed');
  assert.equal(service.transact({ ...request, operationId: 'stale' }, account.generation).status, 'not_committed');
  assert.equal(service.getSnapshot()?.wallet, 420);
});

test('published snapshots and returned results cannot mutate authoritative state', () => {
  const { service } = setup({ wallet: 500 });
  const leaked = service.getSnapshot() as AccountSnapshot;
  leaked.wallet = 0;
  leaked.inventory.rotate = 9;
  const bought = send(service, { operationId: 'buy', type: 'purchase', item: 'rotate' });
  assert.equal(bought.account?.wallet, 420);
  bought.account!.wallet = 9999;
  assert.equal(service.getSnapshot()?.wallet, 420);
});

test('every transact and retry requires a currently held writer lease', () => {
  const { service, lease, storage } = setup({ wallet: 500 });
  lease.release();
  assert.equal(send(service, { operationId: 'buy', type: 'purchase', item: 'rotate' }).status, 'not_committed');
  assert.equal(service.retryPending('buy').status, 'not_committed');
  assert.equal(storage.operations.some(op => op.kind === 'set'), false);
});

test('start reserves at most two distinct eligible items and home close refunds unused items once', () => {
  const { service } = setup({ inventory: { rotate: 2, clear: 1, wildcard: 1 } });
  assert.equal(send(service, { operationId: 'duplicate', type: 'start', intent: intent({ items: ['rotate', 'rotate'] }) }).status, 'not_committed');
  const started = send(service, { operationId: 'start', type: 'start', intent: intent({ items: ['rotate', 'clear'] }) });
  assert.equal(started.status, 'acknowledged');
  assert.deepEqual(started.account?.run?.reserved, ['rotate', 'clear']);
  assert.deepEqual(started.account?.inventory, { rotate: 1, clear: 0, wildcard: 1 });
  assert.equal(send(service, { operationId: 'second', type: 'start', intent: intent() }).status, 'not_committed');
  const runId = started.account!.run!.identity.runId, generation = started.account!.generation;
  const closed = service.transact({ operationId: 'close', type: 'close', runId, reason: 'home' }, generation);
  assert.equal(closed.status, 'acknowledged');
  assert.equal(closed.account?.run, null);
  assert.equal(closed.account?.lastClosedResult?.reason, 'abandoned');
  assert.equal(closed.account?.lastClosedResult?.result, null);
  assert.deepEqual(closed.account?.inventory, { rotate: 2, clear: 1, wildcard: 1 });
  assert.equal(service.transact({ operationId: 'close', type: 'close', runId, reason: 'home' }, generation).status, 'acknowledged');
  assert.equal(send(service, { operationId: 'close.again', type: 'close', runId, reason: 'home' }).status, 'not_committed');
  assert.deepEqual(service.getSnapshot()?.inventory, closed.account?.inventory);
});

test('real tool events consume reservations once and rejected or unreserved tools never consume stock', () => {
  const { service } = setup({ inventory: { rotate: 1, clear: 1, wildcard: 0 } });
  const started = send(service, { operationId: 'start', type: 'start', intent: intent({ items: ['rotate', 'clear'] }) });
  const run = started.account!.run!, state = run.state;
  const invalid = send(service, { operationId: 'empty.clear', type: 'command', runId: run.identity.runId, command: { type: 'clear', cells: [0] } });
  assert.equal(invalid.status, 'not_committed');
  assert.deepEqual(service.getSnapshot()?.run?.reserved, ['rotate', 'clear']);
  const piece = state.candidates.find(p => p.shapeId !== 'shape.single')!;
  const command = { type: 'rotate' as const, pieceId: piece.id, quarterTurns: 1 as const };
  const used = send(service, { operationId: 'rotate', type: 'command', runId: run.identity.runId, command });
  assert.equal(used.status, 'acknowledged');
  assert.deepEqual(used.account?.run?.reserved, ['clear']);
  assert.equal(send(service, { operationId: 'rotate.twice', type: 'command', runId: run.identity.runId, command }).status, 'not_committed');
  assert.equal(send(service, { operationId: 'wild', type: 'command', runId: run.identity.runId, command: { type: 'wildcard', pieceId: piece.id } }).status, 'not_committed');
  const closed = send(service, { operationId: 'close', type: 'close', runId: run.identity.runId, reason: 'home' });
  assert.deepEqual(closed.account?.inventory, { rotate: 0, clear: 1, wildcard: 0 });
});

test('wrong run IDs, arbitrary domain result payloads and malformed commands cannot write', () => {
  const { service, storage } = setup();
  const started = send(service, { operationId: 'start', type: 'start', intent: intent() });
  const run = started.account!.run!, before = playableChecksum(run.state);
  storage.resetFault();
  const command = { type: 'place' as const, pieceId: run.state.candidates[0].id, origin: { x: 0, y: 0 } };
  assert.equal(send(service, { operationId: 'wrong', type: 'command', runId: 'wrong', command }).status, 'not_committed');
  assert.equal(send(service, { operationId: 'injected', type: 'command', runId: run.identity.runId, command, result: { score: 99999 } } as unknown as AccountRequest).status, 'not_committed');
  assert.equal(send(service, { operationId: 'bad', type: 'command', runId: run.identity.runId, command: { ...command, origin: { x: -1, y: 0 } } }).status, 'not_committed');
  assert.equal(storage.operations.some(op => op.kind === 'set'), false);
  assert.equal(playableChecksum(service.getSnapshot()!.run!.state), before);
});

test('daily resolves fixed Beijing date and seed, locks date across midnight, and rejects personal tools', () => {
  let now = Date.parse('2026-10-06T15:59:59Z');
  const { storage } = setup({ inventory: { rotate: 1, clear: 0, wildcard: 0 } });
  const service = createAccountService(storage, held(), () => now);
  const daily = intent({ spec: { family: 'inbound', mode: 'daily', rulesetVersion: 9, seed: 99, guided: false, toolCharges: { rotate: 0, clear: 0, wildcard: 0 } } });
  assert.equal(send(service, { operationId: 'tool.daily', type: 'start', intent: { ...daily, items: ['rotate'] } }).status, 'not_committed');
  const first = send(service, { operationId: 'daily', type: 'start', intent: daily });
  assert.equal(first.account?.run?.identity.challengeDay, '2026-10-06');
  now += 2000;
  const run = first.account!.run!;
  assert.equal(send(service, { operationId: 'place', type: 'command', runId: run.identity.runId, command: { type: 'place', pieceId: run.state.candidates[0].id, origin: { x: 0, y: 0 } } }).status, 'acknowledged');
  assert.equal(service.getSnapshot()?.run?.identity.challengeDay, '2026-10-06');
  send(service, { operationId: 'home', type: 'close', runId: run.identity.runId, reason: 'home' });
  now -= 2000;
  const sameDay = send(service, { operationId: 'again', type: 'start', intent: { ...daily, spec: { ...daily.spec, seed: 987 } } });
  assert.equal(sameDay.account?.run?.state.seed, run.state.seed);
});

test('skip guide changes only progress and consumed authored starts cannot silently repeat', () => {
  const { service } = setup();
  const started = send(service, { operationId: 'guided', type: 'start', intent: intent({ guide: 'guided', cleanupBranch: undefined, spec: { family: 'inbound', mode: 'standard', rulesetVersion: 9, seed: 999, guided: true, toolCharges: { rotate: 0, clear: 0, wildcard: 0 } } }) });
  assert.equal(started.status, 'acknowledged');
  assert.equal(started.account?.guides.inbound.authoredStartConsumed, true);
  assert.equal(started.account?.guides.outbound.authoredStartConsumed, false);
  const run = started.account!.run!, before = playableChecksum(run.state);
  const skipped = send(service, { operationId: 'skip', type: 'skipGuide', runId: run.identity.runId, track: 'inbound' });
  assert.equal(skipped.status, 'acknowledged');
  assert.equal(playableChecksum(skipped.account!.run!.state), before);
  assert.deepEqual(skipped.account?.run?.history, run.history);
  assert.equal(skipped.account?.guides.inbound.skipped, true);
  assert.deepEqual(skipped.account?.guides.inbound.learned, []);
  send(service, { operationId: 'home', type: 'close', runId: run.identity.runId, reason: 'home' });
  assert.equal(send(service, { operationId: 'repeat', type: 'start', intent: intent({ guide: 'guided', cleanupBranch: undefined, spec: { family: 'inbound', mode: 'standard', rulesetVersion: 9, seed: 999, guided: true, toolCharges: { rotate: 0, clear: 0, wildcard: 0 } } }) }).status, 'not_committed');
});

test('write and confirmation faults never publish speculative balances and exact retries charge once', () => {
  const baseline = setup({ wallet: 500 });
  send(baseline.service, { operationId: 'buy', type: 'purchase', item: 'rotate' });
  const count = baseline.storage.operations.length;
  for (let at = 1; at <= count; at++) for (const timing of ['before', 'after'] as const) {
    const { service, storage } = setup({ wallet: 500 });
    storage.resetFault({ at, timing });
    const request: AccountRequest = { operationId: 'buy', type: 'purchase', item: 'rotate' };
    const result = service.transact(request, 1);
    if (result.status !== 'acknowledged') assert.equal(service.getSnapshot()?.wallet, 500, `${at}/${timing}`);
    storage.resetFault();
    const retry = result.status === 'acknowledged' ? service.transact(request, 1) : service.retryPending('buy');
    assert.equal(retry.status, 'acknowledged', `${at}/${timing}: ${retry.message}`);
    assert.equal(service.getSnapshot()?.wallet, 420, `${at}/${timing}`);
    assert.equal(service.getSnapshot()?.inventory.rotate, 1, `${at}/${timing}`);
    assert.equal(service.transact({ ...request, item: 'clear' }, 1).status, 'not_committed');
  }
});

test('failed new-account start leaves old legacy bytes and serial source untouched', () => {
  const storage = new FaultStorage(), service = createAccountService(storage, held(), () => 0);
  const bad = { ...intent(), cleanupBranch: undefined };
  assert.equal(service.transact({ operationId: 'bad.start', type: 'start', intent: bad }, 0).status, 'not_committed');
  assert.equal(service.getSnapshot(), null);
  assert.equal(storage.operations.some(op => op.kind === 'set'), false);
  const good = service.transact({ operationId: 'start', type: 'start', intent: intent() }, 0);
  assert.equal(good.account?.run?.identity.serial, 1);
});

test('legacy v8 result recording earns no coins and never overwrites the old source bytes', () => {
  const { storage, service } = setup({ nextRunSerial: 8 });
  let state = createRunV8(17, 'normal');
  while (state.phase !== 'result') {
    const move = findLegalMovesV8(state)[0];
    assert.ok(move);
    state = applyCommandV8(state, { type: 'place', ...move }).state;
  }
  state.runSerial = 7;
  const raw = encodeRun(state), keys = saveKeysFor('outbound8_normal');
  storage.values.set(keys.main, raw);
  const recorded = send(service, { operationId: 'old.result', type: 'recordLegacyResult', slot: 'outbound8_normal' });
  assert.equal(recorded.status, 'acknowledged');
  assert.equal(recorded.account?.wallet, 0);
  assert.equal(recorded.account?.profile.legacyResults.outboundV8?.normal?.stats.runs, 1);
  assert.equal(storage.values.get(keys.main), raw);
  const repeated = send(service, { operationId: 'old.result.reopen', type: 'recordLegacyResult', slot: 'outbound8_normal' });
  assert.equal(repeated.account?.profile.legacyResults.outboundV8?.normal?.stats.runs, 1);
});

test('cosmetic and settings changes use the same account transaction and validate existing unlocks', () => {
  const { service } = setup();
  assert.equal(send(service, { operationId: 'locked', type: 'setCosmetic', kind: 'forklift', id: 'blue' }).status, 'not_committed');
  const changed = send(service, { operationId: 'theme', type: 'setCosmetic', kind: 'theme', id: 'night' });
  assert.equal(changed.status, 'acknowledged');
  assert.equal(changed.account?.profile.cosmetics.theme, 'night');
  assert.equal(send(service, { operationId: 'setting', type: 'setSettings', patch: { reducedMotion: true } }).account?.profile.settings.reducedMotion, true);
  assert.equal(send(service, { operationId: 'bad.setting', type: 'setSettings', patch: { sound: 'no' } } as unknown as AccountRequest).status, 'not_committed');
});
