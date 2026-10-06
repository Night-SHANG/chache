import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createAccountService, type AccountRequest } from '../src/application/account-service.ts';
import { ACCOUNT_KEYS, encodeAccount } from '../src/application/account-store.ts';
import { baseCoins } from '../src/application/economy.ts';
import { stageHistory, readHistory, verifyAccountReferences } from '../src/application/history-store.ts';
import { makeAccountFixture, FaultStorage } from './helpers/account-fixtures.ts';
import type { AccountRun, AccountSnapshot, RunIdentity } from '../src/application/account-types.ts';
import { createRunV9, applyCommandV9 } from '../src/domain/v9/engine.ts';
import type { InboundCommandV9, StartV9 } from '../src/domain/v9/types.ts';
import { createRunV8, applyCommandV8, findLegalMovesV8 } from '../src/domain/v8/engine.ts';
import { createRunV10, applyCommandV10 } from '../src/domain/v10/engine.ts';
import type { GameRun } from '../src/domain/playable.ts';
import { encodeRun, saveKeysFor } from '../src/application/save.ts';

const golden = JSON.parse(readFileSync(new URL('./fixtures/inbound-v9-golden.json', import.meta.url), 'utf8'))[1] as { options: StartV9; commands: InboundCommandV9[] };
const reservedGolden = JSON.parse(readFileSync(new URL('./fixtures/inbound-v9-golden.json', import.meta.url), 'utf8'))[2] as typeof golden;
function install(state: GameRun, patch: Partial<AccountSnapshot> = {}, creditedBase = 0) {
  const storage = new FaultStorage();
  const identity: RunIdentity = { runId: 'economic.1', serial: 1, rulesetVersion: state.rulesetVersion as 8 | 9 | 10, runConfigId: state.runConfigId,
    mode: state.rulesetVersion === 9 ? state.mode as 'standard' | 'daily' | 'endless' : state.rulesetVersion === 8 ? 'outbound' : 'outboundEndless', economyVersion: 1,
    ...('difficultyId' in state ? { difficultyId: state.difficultyId } : {}) };
  const staged = stageHistory(storage, identity, { seed: state.seed, runConfigId: state.runConfigId, head: null, totalCommands: 0, tail: [] }, state.commands, state.commandIndex);
  state = { ...state, runSerial: 1, ...(state.rulesetVersion >= 9 ? { commands: staged.tail, commandBaseIndex: staged.commandBaseIndex } : {}) } as GameRun;
  const run: AccountRun = { identity, state, history: staged.cursor, lifecycle: 'active', reserved: state.rulesetVersion === 9 && 'toolCharges' in state
    ? (['rotate', 'clear', 'wildcard'] as const).filter(item => state.toolCharges[item] === 1) : [], creditedBase, resultCursor: null };
  const account = makeAccountFixture({ generation: 1, nextRunSerial: 2, run, lastOperation: { operationId: 'fixture', expectedGeneration: 0, requestDigest: 'fixture', committedGeneration: 1 }, ...patch });
  const raw = encodeAccount(account); storage.values.set(ACCOUNT_KEYS.a, raw); storage.values.set(ACCOUNT_KEYS.b, raw);
  const service = createAccountService(storage, { status: 'held', release() {} }, () => Date.parse('2026-10-06T00:00:00Z'));
  assert.ok(service.getSnapshot()); storage.resetFault();
  return { storage, service, account, runId: identity.runId };
}
function request(service: ReturnType<typeof createAccountService>, value: AccountRequest) {
  return service.transact(value, service.getSnapshot()!.generation);
}
function inboundPrefix(limit: number, mode: StartV9['mode'] = 'endless', preserveClear = false) {
  const source = preserveClear ? reservedGolden : golden;
  let state = createRunV9({ ...source.options, mode });
  for (const command of source.commands.slice(0, limit)) {
    const step = applyCommandV9(state, command); assert.equal(step.error, undefined); state = step.state;
  }
  return state;
}

test('real accepted cumulative progress pays only the base delta, including past 30 orders', () => {
  const state = inboundPrefix(60), creditedBase = baseCoins('inbound', state.completedOrders, state.score);
  const { service, runId } = install(state, { wallet: creditedBase }, creditedBase);
  const result = request(service, { operationId: 'next', type: 'command', runId, command: golden.commands[60] });
  assert.equal(result.status, 'acknowledged');
  assert.equal(result.operation?.coinDelta, baseCoins('inbound', result.account!.run!.state.completedOrders, result.account!.run!.state.score) - creditedBase);
  assert.equal(result.account?.wallet, baseCoins('inbound', result.account!.run!.state.completedOrders, result.account!.run!.state.score));
});

test('resetting a live economic run preserves money and pays only later progress while display restarts at zero', () => {
  const state = inboundPrefix(60), { storage, service, runId } = install(state);
  const paid = request(service, { operationId: 'pay.first', type: 'command', runId, command: golden.commands[60] });
  assert.equal(paid.status, 'acknowledged');
  const before = paid.account!, reset = request(service, { operationId: 'reset', type: 'resetResults' });
  assert.equal(reset.status, 'acknowledged');
  assert.deepEqual(reset.account?.profile.results, {});
  for (const key of ['wallet', 'inventory', 'dailyPaid', 'nextRunSerial', 'closedThroughSerial', 'guides'] as const) assert.deepEqual(reset.account?.[key], before[key]);
  assert.equal(reset.account?.run?.creditedBase, before.run?.creditedBase);
  assert.equal(request(service, { operationId: 'pay.next', type: 'command', runId, command: golden.commands[61] }).status, 'acknowledged');
  const current = service.getSnapshot()!, final = request(service, { operationId: 'finish', type: 'close', runId, reason: 'retired' });
  assert.equal(final.status, 'acknowledged');
  const bucket = Object.values(final.account!.profile.results)[0];
  assert.equal(bucket.units, current.run!.state.completedOrders - before.run!.state.completedOrders);
  assert.equal(bucket.score, current.run!.state.score - before.run!.state.score);
  assert.equal(final.account?.wallet, baseCoins('inbound', current.run!.state.completedOrders, current.run!.state.score));
  assert.equal(final.account?.nextRunSerial, before.nextRunSerial);
  assert.equal(final.account?.lastClosedResult?.coinDelta, 0);
  verifyAccountReferences(storage, final.account!);
});

test('five-shift checkpoint retains reserved tools and identity through overtime until explicit retirement', () => {
  const state = inboundPrefix(58, 'standard', true), { service, runId } = install(state);
  const won = request(service, { operationId: 'win', type: 'command', runId, command: reservedGolden.commands[58] });
  assert.equal(won.status, 'acknowledged');
  assert.equal(won.account?.run?.state.endReason, 'completed');
  assert.deepEqual(won.account?.run?.reserved, ['clear']);
  const continued = request(service, { operationId: 'overtime', type: 'command', runId, command: { type: 'continueOvertime' } });
  assert.equal(continued.status, 'acknowledged');
  assert.equal(continued.account?.run?.identity.runId, won.account?.run?.identity.runId);
  assert.equal(continued.account?.wallet, won.account?.wallet);
  assert.deepEqual(continued.account?.run?.reserved, ['clear']);
  const closed = request(service, { operationId: 'retire', type: 'close', runId, reason: 'retired' });
  assert.equal(closed.status, 'acknowledged');
  assert.equal(closed.account?.inventory.clear, 1);
  assert.equal(closed.account?.lastClosedResult?.reason, 'retired');
  assert.equal(closed.account?.lastClosedResult?.history.tail.slice(-1)[0]?.type, 'finish');
  const bucket = Object.values(closed.account!.profile.results)[0];
  assert.equal(bucket.runs, 1); assert.equal(bucket.wins, 1); assert.equal(bucket.retirements, 1);
});

test('new ordinary v8 and endless v10 receive base income while retirement is distinct from winning', () => {
  for (const version of [8, 10] as const) {
    const state = version === 8 ? createRunV8(17, 'normal') : createRunV10(17, 'normal');
    const { service, runId } = install(state);
    let index = 0;
    while (service.getSnapshot()!.run!.state.phase !== 'result') {
      const before = service.getSnapshot()!.run!.state;
      const move = findLegalMovesV8(before as ReturnType<typeof createRunV8>)[0]; assert.ok(move);
      const result = request(service, { operationId: `move.${++index}`, type: 'command', runId, command: { type: 'place', ...move } });
      assert.equal(result.status, 'acknowledged');
    }
    const ended = service.getSnapshot()!;
    assert.ok(ended.run!.state.completedOrders > 0);
    assert.equal(ended.wallet, baseCoins('outbound', ended.run!.state.completedOrders, ended.run!.state.score));
    const closed = request(service, { operationId: 'close', type: 'close', runId, reason: 'failed' });
    assert.equal(closed.status, 'acknowledged');
    assert.equal(closed.account?.wallet, ended.wallet);
  }
  const retired = applyCommandV10(createRunV10(17, 'normal'), { type: 'finishOutboundEndless' }).state;
  const { service, runId } = install(retired);
  const closed = request(service, { operationId: 'retire', type: 'close', runId, reason: 'retired' });
  assert.equal(closed.status, 'acknowledged');
  const bucket = Object.values(closed.account!.profile.results)[0];
  assert.equal(bucket.wins, 0); assert.equal(bucket.retirements, 1);
});

test('legacy result reset advances exact per-slot cursor without mutating old sources or resurrecting coins', () => {
  let state = createRunV8(17, 'normal');
  while (state.phase !== 'result') state = applyCommandV8(state, { type: 'place', ...findLegalMovesV8(state)[0] }).state;
  state.runSerial = 1;
  const { storage, service, runId } = install(createRunV10(3, 'easy'));
  request(service, { operationId: 'new.home', type: 'close', runId, reason: 'home' });
  const keys = saveKeysFor('outbound8_normal'), raw = encodeRun(state); storage.values.set(keys.main, raw);
  storage.resetFault();
  const reset = request(service, { operationId: 'reset', type: 'resetResults' });
  assert.equal(reset.status, 'acknowledged');
  assert.deepEqual(reset.account?.profile.legacyResults.outboundV8?.normal?.resetCursor, { serial: 1, commandIndex: state.commandIndex });
  assert.equal(storage.operations.some(op => (op.kind === 'set' || op.kind === 'remove') && ![ACCOUNT_KEYS.a, ACCOUNT_KEYS.b].includes(op.key)), false);
  assert.equal(storage.values.get(keys.main), raw);
  assert.equal(request(service, { operationId: 'old.reopen', type: 'recordLegacyResult', slot: 'outbound8_normal' }).status, 'not_committed');
  assert.equal(service.getSnapshot()?.wallet, 0);
  assert.equal(service.getSnapshot()?.profile.legacyResults.outboundV8?.normal?.stats.runs, 0);
});

test('real long-run commands seal at 128, preserve every command and resume 129 without truncation', () => {
  const state = inboundPrefix(127), { service, storage, runId } = install(state);
  const sealed = request(service, { operationId: '128', type: 'command', runId, command: golden.commands[127] });
  assert.equal(sealed.status, 'acknowledged');
  assert.equal(sealed.account?.run?.history.tail.length, 0);
  assert.equal(sealed.account?.run?.state.commands.length, 0);
  assert.equal(sealed.account?.run?.history.head?.commandCount, 128);
  const reloaded = createAccountService(storage, { status: 'held', release() {} }, () => 0);
  const next = request(reloaded, { operationId: '129', type: 'command', runId, command: golden.commands[128] });
  assert.equal(next.status, 'acknowledged');
  assert.equal(next.account?.run?.history.totalCommands, 129);
  assert.deepEqual(next.account?.run?.state.commands, [golden.commands[128]]);
  assert.deepEqual([...readHistory(storage, next.account!.run!.identity, next.account!.run!.history, next.account!.run!.history.tail)], golden.commands.slice(0, 129));
});

test('a failed immutable-segment write keeps the exact command pending and safely retries the same operation', () => {
  const state = inboundPrefix(127), probe = install(state);
  request(probe.service, { operationId: '128', type: 'command', runId: probe.runId, command: golden.commands[127] });
  const segmentWrite = probe.storage.operations.findIndex(op => op.kind === 'set' && op.key.startsWith('warehouse.account.history.')) + 1;
  assert.ok(segmentWrite > 0);
  for (const timing of ['before', 'after'] as const) {
    const { service, storage, runId } = install(state);
    storage.resetFault({ at: segmentWrite, timing });
    const failed = request(service, { operationId: '128', type: 'command', runId, command: golden.commands[127] });
    storage.resetFault();
    const retried = failed.status === 'acknowledged' ? service.transact({ operationId: '128', type: 'command', runId, command: golden.commands[127] }, 1) : service.retryPending('128');
    assert.equal(retried.status, 'acknowledged', `${timing}: ${retried.message}`);
    assert.equal(service.getSnapshot()?.run?.history.totalCommands, 128);
    assert.equal(service.getSnapshot()?.run?.history.tail.length, 0);
    assert.equal(storage.listKeys('warehouse.account.history.').length, 1);
  }
});

test('home can abandon a real upgrade phase while formal retirement rejects it without consuming or refunding', () => {
  const state = inboundPrefix(10), { service, runId } = install(state);
  assert.equal(state.phase, 'upgrade');
  assert.equal(request(service, { operationId: 'finish', type: 'close', runId, reason: 'retired' }).status, 'not_committed');
  const abandoned = request(service, { operationId: 'home', type: 'close', runId, reason: 'home' });
  assert.equal(abandoned.status, 'acknowledged');
  assert.equal(abandoned.account?.lastClosedResult?.reason, 'abandoned');
  assert.equal(abandoned.account?.lastClosedResult?.result, null);
  assert.equal(abandoned.account?.lastClosedResult?.commandIndex, state.commandIndex);
  assert.deepEqual(abandoned.account?.profile.results, {});
  assert.equal(abandoned.account?.wallet, baseCoins('inbound', state.completedOrders, state.score));
});

test('a real new inbound shipment unlocks the existing blue forklift without fabricating legacy scores', () => {
  const state = inboundPrefix(10), { service } = install(state);
  assert.ok(state.completedOrders > 0);
  const before = service.getSnapshot()!.profile.legacyResults;
  const selected = request(service, { operationId: 'blue', type: 'setCosmetic', kind: 'forklift', id: 'blue' });
  assert.equal(selected.status, 'acknowledged');
  assert.equal(selected.account?.profile.cosmetics.forklift, 'blue');
  assert.deepEqual(selected.account?.profile.legacyResults, before);
});

test('acknowledged closure survives either root corruption and never reconnects the ended economic run', () => {
  for (const key of [ACCOUNT_KEYS.a, ACCOUNT_KEYS.b]) {
    const state = createRunV10(17, 'normal'), { service, storage, runId } = install(state);
    const closed = request(service, { operationId: 'home', type: 'close', runId, reason: 'home' });
    assert.equal(closed.status, 'acknowledged');
    storage.values.set(key, 'corrupt');
    const recovered = createAccountService(storage, { status: 'held', release() {} }, () => 0);
    assert.equal(recovered.getSnapshot(), null);
    assert.equal(recovered.retryPending('home').status, 'acknowledged');
    assert.equal(recovered.getSnapshot()?.run, null);
    assert.equal(recovered.getSnapshot()?.closedThroughSerial, 1);
    assert.equal(request(recovered, { operationId: 'old.command', type: 'command', runId, command: { type: 'finishOutboundEndless' } }).status, 'not_committed');
  }
});

test('every before/after close fault preserves one refund and exact terminal history', () => {
  const state = inboundPrefix(58, 'standard', true), probe = install(state);
  const close: AccountRequest = { operationId: 'home', type: 'close', runId: probe.runId, reason: 'home' };
  request(probe.service, close);
  const count = probe.storage.operations.length;
  for (let at = 1; at <= count; at++) for (const timing of ['before', 'after'] as const) {
    const { service, storage, runId } = install(state), generation = service.getSnapshot()!.generation;
    storage.resetFault({ at, timing });
    const result = service.transact({ ...close, runId }, generation);
    if (result.status !== 'acknowledged') assert.notEqual(service.getSnapshot()?.run, null);
    storage.resetFault();
    const retry = result.status === 'acknowledged' ? service.transact({ ...close, runId }, generation) : service.retryPending('home');
    assert.equal(retry.status, 'acknowledged', `${at}/${timing}: ${retry.message}`);
    assert.equal(service.getSnapshot()?.run, null);
    assert.equal(service.getSnapshot()?.inventory.clear, 1);
    assert.equal(service.getSnapshot()?.lastClosedResult?.commandIndex, state.commandIndex);
    assert.equal(service.getSnapshot()?.wallet, baseCoins('inbound', state.completedOrders, state.score));
  }
});
