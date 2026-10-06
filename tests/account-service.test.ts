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
import { INBOUND_GUIDE_V9 } from '../src/domain/v9/tutorial.ts';
import { OUTBOUND_GUIDE_V8, isGuideComplete } from '../src/application/tutorials.ts';
import { accountDigest, canonicalStringify } from '../src/application/history-store.ts';
import { assertAccountSnapshot } from '../src/application/account-profile.ts';

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
  const { storage, service } = setup({ nextRunSerial: 8, migration: { version: 1, sourceDigests: {}, legacySerialCeiling: 7, legacySerials: {} } });
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

test('non-data and cyclic request payloads reject safely without exposing exceptions or writing', () => {
  const { service, storage } = setup();
  const request = { operationId: 'cycle', type: 'setSettings', patch: {} as Record<string, unknown> };
  request.patch.self = request;
  assert.doesNotThrow(() => assert.equal(send(service, request as unknown as AccountRequest).status, 'not_committed'));
  assert.doesNotThrow(() => assert.equal(send(service, { operationId: 'function', type: 'setSettings', patch: { sound: () => true } } as unknown as AccountRequest).status, 'not_committed'));
  assert.equal(storage.operations.some(op => op.kind === 'set'), false);
});

test('unmirrored committed transactions freeze new requests and release facts only on the exact retry', () => {
  const { service, storage } = setup({ wallet: 500 });
  const originalSet = storage.set.bind(storage);
  storage.set = (key, value) => { if (key === ACCOUNT_KEYS.a) throw Error('mirror offline'); originalSet(key, value); };
  const first = service.transact({ operationId: 'buy', type: 'purchase', item: 'rotate' }, 1);
  assert.equal(first.status, 'committed_unmirrored');
  assert.equal(first.account?.wallet, 500);
  assert.equal(first.events, undefined);
  assert.equal(service.getStatus(), 'degraded');
  assert.equal(service.getSnapshot()?.wallet, 500);
  assert.equal(service.transact({ operationId: 'other', type: 'purchase', item: 'clear' }, 1).status, 'not_committed');
  assert.equal(service.transact({ operationId: 'buy', type: 'purchase', item: 'clear' }, 1).status, 'not_committed');
  assert.equal(service.retryPending('other').status, 'not_committed');
  storage.set = originalSet;
  const retried = service.retryPending('buy');
  assert.equal(retried.status, 'acknowledged');
  assert.equal(retried.account?.wallet, 420);
  assert.deepEqual(retried.events, []);
  assert.equal(service.transact({ operationId: 'buy', type: 'purchase', item: 'rotate' }, 1).events, undefined);
});

test('real tutorial learning and board commands publish atomically after repair', () => {
  const { service, storage } = setup();
  const started = send(service, { operationId: 'guided', type: 'start', intent: intent({ guide: 'guided', cleanupBranch: undefined,
    spec: { family: 'inbound', mode: 'standard', rulesetVersion: 9, seed: 1, guided: true, toolCharges: { rotate: 0, clear: 0, wildcard: 0 } } }) });
  const runId = started.account!.run!.identity.runId;
  assert.equal(started.account?.run?.state.seed, INBOUND_GUIDE_V9.seed);
  const command = Object.values(INBOUND_GUIDE_V9.branches)[0][0];
  const originalSet = storage.set.bind(storage);
  storage.set = (key, value) => { if (key === ACCOUNT_KEYS.a) throw Error('mirror offline'); originalSet(key, value); };
  const unconfirmed = send(service, { operationId: 'learn', type: 'command', runId, command });
  assert.equal(unconfirmed.status, 'committed_unmirrored');
  assert.equal(service.getSnapshot()?.run?.state.commandIndex, 0);
  assert.equal(service.getSnapshot()?.guides.inbound.learned.includes('place'), false);
  assert.equal(unconfirmed.events, undefined);
  storage.set = originalSet;
  const learned = service.retryPending('learn');
  assert.equal(learned.status, 'acknowledged');
  assert.equal(learned.account?.run?.state.commandIndex, 1);
  assert.equal(learned.account?.guides.inbound.learned.includes('place'), true);
  assert.ok(learned.events?.some(event => event.type === 'placed'));
  assert.deepEqual(learned.operation?.learned, ['place']);
});

test('daily ledger caps bonuses across versions and never follows score reset', () => {
  const { service } = setup({ dailyPaid: { '2026-10-06': { bestBase: 60, paid: 120 } } });
  const daily = intent({ spec: { family: 'inbound', mode: 'daily', rulesetVersion: 9, seed: 1, guided: false, toolCharges: { rotate: 0, clear: 0, wildcard: 0 } } });
  const started = send(service, { operationId: 'daily', type: 'start', intent: daily });
  assert.equal(started.status, 'acknowledged');
  assert.deepEqual(started.account?.dailyPaid['2026-10-06'], { bestBase: 60, paid: 120 });
  const reset = send(service, { operationId: 'reset', type: 'resetResults' });
  assert.equal(reset.status, 'acknowledged');
  assert.deepEqual(reset.account?.dailyPaid, started.account?.dailyPaid);
  const closed = send(service, { operationId: 'finish', type: 'close', runId: started.account!.run!.identity.runId, reason: 'retired' });
  assert.equal(closed.status, 'acknowledged');
  assert.equal(closed.account?.wallet, 0);
  assert.deepEqual(closed.account?.dailyPaid, started.account?.dailyPaid);
});

test('a failed fresh seed commit preserves the closed run, allocated serial and inventory until retry', () => {
  const { service, storage } = setup();
  const first = send(service, { operationId: 'first', type: 'start', intent: intent() });
  send(service, { operationId: 'close', type: 'close', runId: first.account!.run!.identity.runId, reason: 'home' });
  const before = service.getSnapshot()!, originalSet = storage.set.bind(storage);
  storage.set = (key, value) => { if (key === ACCOUNT_KEYS.b) throw Error('first write offline'); originalSet(key, value); };
  const failed = service.transact({ operationId: 'new', type: 'start', intent: intent() }, before.generation);
  assert.equal(failed.status, 'not_committed');
  assert.deepEqual(service.getSnapshot(), before);
  storage.set = originalSet;
  const started = service.retryPending('new');
  assert.equal(started.status, 'acknowledged');
  assert.equal(started.account?.run?.identity.serial, before.nextRunSerial);
  assert.notEqual(started.account?.run?.state.seed, first.account?.run?.state.seed);
  assert.deepEqual(started.account?.lastClosedResult, before.lastClosedResult);
});

test('separately constructed stale services cannot both charge the same generation', () => {
  const { service, storage } = setup({ wallet: 500 });
  const second = createAccountService(storage, held(), () => 0);
  assert.equal(service.transact({ operationId: 'a', type: 'purchase', item: 'rotate' }, 1).status, 'acknowledged');
  assert.equal(second.transact({ operationId: 'b', type: 'purchase', item: 'rotate' }, 1).status, 'not_committed');
  assert.equal(second.getSnapshot()?.wallet, 420);
  assert.equal(second.getSnapshot()?.inventory.rotate, 1);
});

test('degraded restart exposes only its validated receipt ID and repairs it before accepting any new operation', () => {
  const { service, storage } = setup({ wallet: 500 });
  const originalSet = storage.set.bind(storage);
  storage.set = (key, value) => { if (key === ACCOUNT_KEYS.a) throw Error('mirror offline'); originalSet(key, value); };
  assert.equal(service.transact({ operationId: 'buy', type: 'purchase', item: 'rotate' }, 1).status, 'committed_unmirrored');
  const restarted = createAccountService(storage, held(), () => 0);
  assert.equal(restarted.getSnapshot(), null);
  assert.equal(restarted.getPendingOperationId(), 'buy');
  assert.equal(restarted.transact({ operationId: 'new', type: 'purchase', item: 'clear' }, 2).status, 'not_committed');
  assert.equal(restarted.getPendingOperationId(), 'buy');
  storage.set = originalSet;
  assert.equal(restarted.retryPending('buy').status, 'acknowledged');
  assert.equal(restarted.getSnapshot()?.wallet, 420);
  assert.equal(restarted.getPendingOperationId(), null);
  storage.values.set(ACCOUNT_KEYS.a, 'corrupt'); storage.values.set(ACCOUNT_KEYS.b, 'corrupt');
  assert.equal(createAccountService(storage, held(), () => 0).getPendingOperationId(), null);
});

test('a definite 496KiB refusal still permits closing with reserved space and leaves all paid-day proofs intact', () => {
  const { service, storage } = setup();
  const started = send(service, { operationId: 'start', type: 'start', intent: intent() }).account!;
  const account = structuredClone(started), startDate = Date.parse('2000-01-01T00:00:00Z');
  const emptySize = new TextEncoder().encode(encodeAccount(account)).length;
  account.dailyPaid['2000-01-01'] = { bestBase: 60, paid: 120 };
  const entrySize = new TextEncoder().encode(encodeAccount(account)).length - emptySize + 1;
  const entries = Math.floor((499 * 1024 - emptySize) / entrySize);
  for (let index = 0; index < entries; index++) {
    const day = new Date(startDate + index * 86400000).toISOString().slice(0, 10);
    account.dailyPaid[day] = { bestBase: 60, paid: 120 };
  }
  let raw = encodeAccount(account);
  while (new TextEncoder().encode(raw).length > 499 * 1024) { delete account.dailyPaid[Object.keys(account.dailyPaid).slice(-1)[0]]; raw = encodeAccount(account); }
  assert.ok(new TextEncoder().encode(raw).length > 496 * 1024);
  storage.values.set(ACCOUNT_KEYS.a, raw); storage.values.set(ACCOUNT_KEYS.b, raw);
  const large = createAccountService(storage, held(), () => 0), generation = account.generation;
  const refused = large.transact({ operationId: 'settings', type: 'setSettings', patch: { reducedMotion: true } }, generation);
  assert.equal(refused.status, 'not_committed');
  assert.match(refused.message, /496KiB/);
  assert.equal(large.getSnapshot()?.profile.settings.reducedMotion, false);
  const closed = large.transact({ operationId: 'home', type: 'close', runId: account.run!.identity.runId, reason: 'home' }, generation);
  assert.equal(closed.status, 'acknowledged', closed.message);
  assert.equal(closed.account?.run, null);
  assert.deepEqual(closed.account?.dailyPaid, account.dailyPaid);
});

test('real same-day attempts receive base income each time and only the daily best bonus difference', () => {
  const { service } = setup();
  const daily = intent({ spec: { family: 'inbound', mode: 'daily', rulesetVersion: 9, seed: 999, guided: false, toolCharges: { rotate: 0, clear: 0, wildcard: 0 } } });
  const placements = [
    { type: 'place' as const, pieceId: 'piece.4', origin: { x: 1, y: 1 } },
    { type: 'place' as const, pieceId: 'piece.6', origin: { x: 2, y: 1 } },
    { type: 'place' as const, pieceId: 'piece.7', origin: { x: 2, y: 2 } },
    { type: 'place' as const, pieceId: 'piece.3', origin: { x: 1, y: 1 } },
    { type: 'place' as const, pieceId: 'piece.5', origin: { x: 3, y: 2 } },
  ];
  for (let attempt = 0; attempt < 2; attempt++) {
    const started = send(service, { operationId: `daily.${attempt}`, type: 'start', intent: daily });
    const runId = started.account!.run!.identity.runId;
    for (let index = 0; index < (attempt ? 5 : 3); index++) {
      const result = send(service, { operationId: `move.${attempt}.${index}`, type: 'command', runId, command: placements[index] });
      assert.equal(result.status, 'acknowledged');
      if (index === 2) { assert.equal(result.account?.wallet, attempt ? 4 : 3); assert.equal(result.account?.run?.earnedCoins, attempt ? 1 : 3); }
    }
    const closed = send(service, { operationId: `home.${attempt}`, type: 'close', runId, reason: 'home' });
    assert.equal(closed.status, 'acknowledged');
    assert.equal(closed.account?.lastClosedResult?.earnedCoins, attempt ? 4 : 3);
    assert.equal(closed.account?.lastClosedResult?.coinDelta, 0);
  }
  assert.equal(service.getSnapshot()?.wallet, 7);
  assert.deepEqual(service.getSnapshot()?.dailyPaid['2026-10-06'], { bestBase: 2, paid: 4 });
  assert.equal(send(service, { operationId: 'reset', type: 'resetResults' }).status, 'acknowledged');
  assert.deepEqual(service.getSnapshot()?.dailyPaid['2026-10-06'], { bestBase: 2, paid: 4 });
});

test('outbound guidance preserves the selected normal easy identity and teaches only its own track', () => {
  const { service } = setup();
  const guided: StartIntent = { spec: { family: 'outbound', variant: 'normal', rulesetVersion: 8, seed: 1, difficultyId: 'easy' }, items: [], guide: 'guided' };
  const denied = send(service, { operationId: 'hard.guided', type: 'start', intent: { ...guided, spec: { ...guided.spec, difficultyId: 'hard' } } as StartIntent });
  assert.equal(denied.status, 'not_committed');
  const started = send(service, { operationId: 'outbound.guided', type: 'start', intent: guided });
  assert.equal(started.status, 'acknowledged');
  assert.equal(started.account?.run?.identity.mode, 'outboundGuided');
  assert.equal(started.account?.run?.state.seed, OUTBOUND_GUIDE_V8.seed);
  assert.equal(started.account?.run?.state.maxOccupancy, 0);
  const runId = started.account!.run!.identity.runId;
  for (const [index, command] of OUTBOUND_GUIDE_V8.commands.entries()) assert.equal(send(service, { operationId: `outbound.${index}`, type: 'command', runId, command }).status, 'acknowledged');
  const learned = service.getSnapshot()!;
  assert.equal(isGuideComplete('outbound', learned.guides.outbound), true);
  assert.deepEqual(learned.guides.inbound, started.account?.guides.inbound);
  assert.equal(learned.guides.outbound.authoredStartConsumed, true);
});

test('daily, endless outbound, and ordinary outbound reject reserved items and incompatible version pairs', () => {
  const { service, storage } = setup({ inventory: { rotate: 1, clear: 1, wildcard: 1 } });
  const outbound: StartIntent = { spec: { family: 'outbound', variant: 'normal', rulesetVersion: 8, seed: 1, difficultyId: 'normal' }, items: ['rotate'], guide: 'direct' };
  assert.equal(send(service, { operationId: 'normal.tool', type: 'start', intent: outbound }).status, 'not_committed');
  assert.equal(send(service, { operationId: 'endless.tool', type: 'start', intent: { ...outbound, spec: { ...outbound.spec, variant: 'endless', rulesetVersion: 10 } } as StartIntent }).status, 'not_committed');
  assert.equal(send(service, { operationId: 'wrong.version', type: 'start', intent: { ...outbound, items: [], spec: { ...outbound.spec, rulesetVersion: 10 } } as StartIntent }).status, 'not_committed');
  assert.equal(storage.operations.some(op => op.kind === 'set'), false);
  assert.deepEqual(service.getSnapshot()?.inventory, { rotate: 1, clear: 1, wildcard: 1 });
});

test('a digest-valid stored identity mismatch is unusable and cannot be overwritten with a fresh start', () => {
  const { service, storage } = setup();
  send(service, { operationId: 'start', type: 'start', intent: intent() });
  const envelope = JSON.parse(storage.values.get(ACCOUNT_KEYS.a)!);
  envelope.account.run.identity.runConfigId = 'run.different';
  envelope.digest = accountDigest(canonicalStringify(envelope.account));
  const raw = canonicalStringify(envelope);
  storage.values.set(ACCOUNT_KEYS.a, raw); storage.values.set(ACCOUNT_KEYS.b, raw);
  const invalid = createAccountService(storage, held(), () => 0);
  assert.equal(invalid.getSnapshot(), null);
  storage.resetFault();
  assert.equal(invalid.transact({ operationId: 'overwrite', type: 'start', intent: intent() }, 2).status, 'unknown');
  assert.equal(storage.operations.some(op => op.kind === 'set'), false);
  assert.equal(storage.values.get(ACCOUNT_KEYS.a), raw);
});

test('new starts initialize elapsed metadata and saveElapsed survives restart without changing gameplay or awards', () => {
  const { service, storage } = setup();
  const started = send(service, { operationId: 'start', type: 'start', intent: intent() }).account!;
  assert.equal(started.run?.state.elapsedMs, 0);
  const before = service.getSnapshot()!, runId = before.run!.identity.runId;
  const saved = send(service, { operationId: 'elapsed', type: 'saveElapsed', runId, elapsedMs: 32000 });
  assert.equal(saved.status, 'acknowledged');
  assert.equal(saved.account?.run?.state.elapsedMs, 32000);
  assert.equal(playableChecksum(saved.account!.run!.state), playableChecksum(before.run!.state));
  assert.deepEqual(saved.account?.run?.history, before.run?.history);
  for (const key of ['wallet', 'inventory', 'guides', 'dailyPaid'] as const) assert.deepEqual(saved.account?.[key], before[key]);
  assert.equal(saved.account?.run?.state.commandIndex, before.run?.state.commandIndex);
  assert.deepEqual(saved.account?.run?.state.rngState, before.run?.state.rngState);
  const restarted = createAccountService(storage, held(), () => Date.parse('2026-10-10T00:00:00Z'));
  assert.equal(restarted.getSnapshot()?.run?.state.elapsedMs, 32000);
});

test('equal elapsed saves acknowledge without writes or generation advancement and reject changed reuse', () => {
  const { service, storage } = setup();
  const started = send(service, { operationId: 'start', type: 'start', intent: intent() }).account!;
  const runId = started.run!.identity.runId, generation = started.generation;
  storage.resetFault();
  const same = service.transact({ operationId: 'same', type: 'saveElapsed', runId, elapsedMs: 0 }, generation);
  assert.equal(same.status, 'acknowledged');
  assert.equal(same.account?.generation, generation);
  assert.equal(storage.operations.some(op => op.kind === 'set' || op.kind === 'remove'), false);
  assert.equal(service.transact({ operationId: 'same', type: 'saveElapsed', runId, elapsedMs: 1 }, generation).status, 'not_committed');
});

test('elapsed metadata validates safe integers, monotonic progress, run identity and the current writer lease', () => {
  const { service, storage, lease } = setup();
  const started = send(service, { operationId: 'start', type: 'start', intent: intent() }).account!;
  const runId = started.run!.identity.runId;
  assert.equal(send(service, { operationId: 'elapsed', type: 'saveElapsed', runId, elapsedMs: 1000 }).status, 'acknowledged');
  const before = service.getSnapshot(); storage.resetFault();
  for (const [index, elapsedMs] of [-1, .5, 999, Infinity, Number.MAX_SAFE_INTEGER + 1].entries()) assert.equal(send(service, { operationId: `bad.elapsed.${index}`, type: 'saveElapsed', runId, elapsedMs }).status, 'not_committed');
  for (const [index, elapsedMs] of [undefined, null, '1000'].entries()) assert.equal(send(service, { operationId: `non-number.elapsed.${index}`, type: 'saveElapsed', runId, elapsedMs } as unknown as AccountRequest).status, 'not_committed');
  assert.equal(send(service, { operationId: 'wrong.elapsed', type: 'saveElapsed', runId: 'wrong', elapsedMs: 1200 }).status, 'not_committed');
  lease.release();
  assert.equal(send(service, { operationId: 'lease.elapsed', type: 'saveElapsed', runId, elapsedMs: 1200 }).status, 'not_committed');
  assert.deepEqual(service.getSnapshot(), before);
  assert.equal(storage.operations.some(op => op.kind === 'set' || op.kind === 'remove'), false);
});

test('accepted command and formal close persist supplied elapsed in the same transaction', () => {
  const { service, storage } = setup();
  const started = send(service, { operationId: 'start', type: 'start', intent: intent() }).account!;
  const runId = started.run!.identity.runId, before = started.run!.state;
  const command = { type: 'place' as const, pieceId: before.candidates[0].id, origin: { x: 0, y: 0 } };
  const placed = send(service, { operationId: 'place.elapsed', type: 'command', runId, command, elapsedMs: 1200 });
  assert.equal(placed.status, 'acknowledged');
  assert.equal(placed.account?.run?.state.elapsedMs, 1200);
  assert.equal(placed.account?.run?.state.commandIndex, before.commandIndex + 1);
  const rejected = send(service, { operationId: 'bad.command.time', type: 'command', runId, command: { ...command, pieceId: 'missing' }, elapsedMs: 1500 });
  assert.equal(rejected.status, 'not_committed');
  assert.equal(service.getSnapshot()?.run?.state.elapsedMs, 1200);
  const closed = send(service, { operationId: 'close.elapsed', type: 'close', runId, reason: 'retired', elapsedMs: 2000 });
  assert.equal(closed.status, 'acknowledged');
  assert.equal(closed.closedState?.elapsedMs, 2000);
  assert.equal(closed.account?.lastClosedResult?.elapsedMs, 2000);
  const restarted = createAccountService(storage, held(), () => 0);
  assert.equal(restarted.getSnapshot()?.run, null);
  assert.equal(restarted.getSnapshot()?.lastClosedResult?.elapsedMs, 2000);
});

test('unmirrored elapsed updates keep the old timer published and exact retry saves the new timer once', () => {
  const { service, storage } = setup();
  const started = send(service, { operationId: 'start', type: 'start', intent: intent() }).account!;
  const runId = started.run!.identity.runId, originalSet = storage.set.bind(storage);
  storage.set = (key, value) => { if (key === ACCOUNT_KEYS.a) throw Error('mirror offline'); originalSet(key, value); };
  const pending = send(service, { operationId: 'elapsed', type: 'saveElapsed', runId, elapsedMs: 4500 });
  assert.equal(pending.status, 'committed_unmirrored');
  assert.equal(service.getSnapshot()?.run?.state.elapsedMs, 0);
  assert.equal(service.transact({ operationId: 'elapsed', type: 'saveElapsed', runId, elapsedMs: 4600 }, started.generation).status, 'not_committed');
  storage.set = originalSet;
  const acknowledged = service.retryPending('elapsed');
  assert.equal(acknowledged.status, 'acknowledged');
  assert.equal(acknowledged.account?.run?.state.elapsedMs, 4500);
  assert.equal(acknowledged.account?.run?.state.commandIndex, started.run?.state.commandIndex);
  assert.equal(service.transact({ operationId: 'elapsed', type: 'saveElapsed', runId, elapsedMs: 4500 }, started.generation).status, 'acknowledged');
  assert.equal(service.getSnapshot()?.generation, started.generation + 1);
});

test('wall-clock jumps and paused background time never advance saved elapsed without an explicit metadata request', () => {
  let now = Date.parse('2026-10-06T00:00:00Z');
  const { storage } = setup();
  const service = createAccountService(storage, held(), () => now);
  const started = send(service, { operationId: 'start', type: 'start', intent: intent() }).account!;
  const runId = started.run!.identity.runId;
  send(service, { operationId: 'pause', type: 'saveElapsed', runId, elapsedMs: 1000 });
  const generation = service.getSnapshot()!.generation;
  storage.resetFault(); now += 86400000;
  const restarted = createAccountService(storage, held(), () => now);
  assert.equal(restarted.getSnapshot()?.run?.state.elapsedMs, 1000);
  assert.equal(restarted.getSnapshot()?.generation, generation);
  assert.equal(storage.operations.some(op => op.kind === 'set'), false);
  assert.equal(send(restarted, { operationId: 'active100', type: 'saveElapsed', runId, elapsedMs: 1100 }).account?.run?.state.elapsedMs, 1100);
});

test('earnedCoins starts at zero and remains separate from the wallet during purchases and metadata writes', () => {
  const { service } = setup({ wallet: 500 });
  const started = send(service, { operationId: 'start', type: 'start', intent: intent() });
  assert.equal(started.account?.run?.earnedCoins, 0);
  assert.equal(started.account?.wallet, 500);
  const timed = send(service, { operationId: 'time', type: 'saveElapsed', runId: started.account!.run!.identity.runId, elapsedMs: 1000 });
  assert.equal(timed.account?.run?.earnedCoins, 0);
  const closed = send(service, { operationId: 'close', type: 'close', runId: started.account!.run!.identity.runId, reason: 'home' });
  assert.equal(closed.account?.lastClosedResult?.earnedCoins, 0);
  const bought = send(service, { operationId: 'buy', type: 'purchase', item: 'rotate' });
  assert.equal(bought.account?.wallet, 420);
  assert.equal(bought.account?.lastClosedResult?.earnedCoins, 0);
});

test('strict account validation rejects missing, unsafe and impossible active or closed earned totals', () => {
  const { service } = setup();
  const started = send(service, { operationId: 'start', type: 'start', intent: intent() }).account!;
  assert.equal(started.run?.earnedCoins, 0);
  for (const earnedCoins of [-1, .5, 1, Number.MAX_SAFE_INTEGER + 1]) assert.throws(() => assertAccountSnapshot({ ...started, run: { ...started.run, earnedCoins } }));
  const missing = structuredClone(started) as unknown as { run: Record<string, unknown> };
  delete missing.run.earnedCoins;
  assert.throws(() => assertAccountSnapshot(missing));
  const closed = send(service, { operationId: 'close', type: 'close', runId: started.run!.identity.runId, reason: 'home' }).account!;
  for (const earnedCoins of [-1, 1, Number.MAX_SAFE_INTEGER + 1]) assert.throws(() => assertAccountSnapshot({ ...closed, lastClosedResult: { ...closed.lastClosedResult, earnedCoins } }));
});

test('daily cumulative earned credits publish once after mirror repair and retain their result total after restart', () => {
  const { service, storage } = setup();
  const daily = intent({ spec: { family: 'inbound', mode: 'daily', rulesetVersion: 9, seed: 1, guided: false, toolCharges: { rotate: 0, clear: 0, wildcard: 0 } } });
  const started = send(service, { operationId: 'daily', type: 'start', intent: daily }).account!, runId = started.run!.identity.runId;
  const placements = [
    { type: 'place' as const, pieceId: 'piece.4', origin: { x: 1, y: 1 } },
    { type: 'place' as const, pieceId: 'piece.6', origin: { x: 2, y: 1 } },
    { type: 'place' as const, pieceId: 'piece.7', origin: { x: 2, y: 2 } },
  ];
  for (let i = 0; i < 2; i++) assert.equal(send(service, { operationId: `place.${i}`, type: 'command', runId, command: placements[i] }).status, 'acknowledged');
  const generation = service.getSnapshot()!.generation, originalSet = storage.set.bind(storage);
  storage.set = (key, value) => { if (key === ACCOUNT_KEYS.a) throw Error('mirror offline'); originalSet(key, value); };
  const first = service.transact({ operationId: 'income', type: 'command', runId, command: placements[2] }, generation);
  assert.equal(first.status, 'committed_unmirrored');
  assert.equal(service.getSnapshot()?.run?.earnedCoins, 0);
  storage.set = originalSet;
  const paid = service.retryPending('income');
  assert.equal(paid.status, 'acknowledged'); assert.equal(paid.account?.run?.earnedCoins, 3); assert.equal(paid.account?.wallet, 3);
  assert.equal(service.transact({ operationId: 'income', type: 'command', runId, command: placements[2] }, generation).account?.run?.earnedCoins, 3);
  for (const earnedCoins of [0, 122]) assert.throws(() => assertAccountSnapshot({ ...paid.account, run: { ...paid.account!.run, earnedCoins } }));
  const reset = send(service, { operationId: 'reset', type: 'resetResults' });
  assert.equal(reset.account?.run?.earnedCoins, 3);
  const closed = send(service, { operationId: 'retired', type: 'close', runId, reason: 'retired' });
  assert.equal(closed.account?.lastClosedResult?.earnedCoins, 3);
  assert.equal(closed.account?.lastClosedResult?.coinDelta, 0);
  const restarted = createAccountService(storage, held(), () => 0);
  assert.equal(restarted.getSnapshot()?.lastClosedResult?.earnedCoins, 3);
});
