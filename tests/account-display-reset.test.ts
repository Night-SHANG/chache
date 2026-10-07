import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { accountDisplayProfile, createAccountService } from '../src/application/account-service.ts';
import { recordAccountResult, resetAccountResults } from '../src/application/account-profile.ts';
import { ACCOUNT_KEYS, encodeAccount } from '../src/application/account-store.ts';
import { baseCoins } from '../src/application/economy.ts';
import type { AccountRun, AccountSnapshot } from '../src/application/account-types.ts';
import { createRunV9, applyCommandV9 } from '../src/domain/v9/engine.ts';
import type { InboundCommandV9, StartV9 } from '../src/domain/v9/types.ts';
import { makeAccountFixture, FaultStorage } from './helpers/account-fixtures.ts';

const golden = JSON.parse(readFileSync(new URL('./fixtures/inbound-v9-golden.json', import.meta.url), 'utf8'))[2] as { options: StartV9; commands: InboundCommandV9[] };
const longGolden = JSON.parse(readFileSync(new URL('./fixtures/inbound-v9-golden.json', import.meta.url), 'utf8'))[1] as typeof golden;
function checkpoint(count = 59, serial = 1, mode: StartV9['mode'] = 'standard', source = golden): AccountSnapshot {
  let state = createRunV9({ ...source.options, mode });
  for (const command of source.commands.slice(0, count)) {
    const result = applyCommandV9(state, command); assert.equal(result.error, undefined); state = result.state;
  }
  state.runSerial = serial;
  const creditedBase = baseCoins('inbound', state.completedOrders, state.score);
  const run: AccountRun = { identity: { runId: `display.${serial}`, serial, rulesetVersion: 9, runConfigId: state.runConfigId, mode, economyVersion: 1 }, state,
    history: { seed: state.seed, runConfigId: state.runConfigId, head: null, totalCommands: state.commandIndex, tail: state.commands },
    lifecycle: 'active', reserved: (['rotate', 'clear', 'wildcard'] as const).filter(item => state.toolCharges[item] === 1), creditedBase, earnedCoins: creditedBase, resultCursor: null };
  const account = makeAccountFixture({ generation: 1, nextRunSerial: serial + 1, wallet: creditedBase, run,
    lastOperation: { operationId: 'fixture', expectedGeneration: 0, requestDigest: 'fixture', committedGeneration: 1 } });
  return state.phase === 'result' ? recordAccountResult(account, run) : account;
}

test('resetting a real standard thirty-order checkpoint clears active orders win chain and achievement projection', () => {
  const account = checkpoint();
  assert.equal(account.run?.state.completedOrders, 30); assert.equal(account.run?.state.endReason, 'completed');
  const before = accountDisplayProfile(account);
  assert.equal(before.stats.orders, 30); assert.equal(before.stats.wins, 1); assert.ok(before.stats.maxChain > 0);
  const reset = resetAccountResults(account), display = accountDisplayProfile(reset);
  assert.deepEqual(reset.profile.results, {});
  assert.equal(display.stats.orders, 0); assert.equal(display.stats.wins, 0); assert.equal(display.stats.maxChain, 0);
  assert.deepEqual(display.achievements, []);
  assert.equal(reset.run?.earnedCoins, account.run?.earnedCoins);
});

test('permanent earned forklift rights survive reset while achievement projection is cleared', () => {
  const storage = new FaultStorage(), account = checkpoint(), raw = encodeAccount(account);
  storage.values.set(ACCOUNT_KEYS.a, raw); storage.values.set(ACCOUNT_KEYS.b, raw);
  const service = createAccountService(storage, { status: 'held', release() {} }, () => 0);
  const select = (operationId: string, id: string) => service.transact({ operationId, type: 'setCosmetic', kind: 'forklift', id }, service.getSnapshot()!.generation);
  assert.equal(select('red.before', 'red').status, 'acknowledged');
  const reset = service.transact({ operationId: 'reset', type: 'resetResults' }, service.getSnapshot()!.generation);
  assert.equal(reset.status, 'acknowledged');
  assert.equal(reset.account?.profile.cosmetics.forklift, 'red');
  assert.equal(accountDisplayProfile(reset.account!).cosmetics.forklift, 'red');
  assert.equal(select('yellow', 'yellow').status, 'acknowledged');
  assert.deepEqual(accountDisplayProfile(reset.account!).achievements, []);
  assert.ok(reset.account?.profile.ownedCosmetics?.includes('forklift.red'));
  assert.ok(reset.account?.profile.ownedCosmetics?.includes('forklift.blue'));
  assert.equal(select('red.after', 'red').status, 'acknowledged');
  assert.equal(select('blue.after', 'blue').status, 'acknowledged');
  assert.equal(service.getSnapshot()?.profile.cosmetics.forklift, 'blue');
});

test('continuing overtime after reset does not turn the previous completion or chain into new achievements', () => {
  const reset = resetAccountResults(checkpoint()), storage = new FaultStorage(), raw = encodeAccount(reset);
  storage.values.set(ACCOUNT_KEYS.a, raw); storage.values.set(ACCOUNT_KEYS.b, raw);
  const service = createAccountService(storage, { status: 'held', release() {} }, () => 0), runId = reset.run!.identity.runId;
  const continued = service.transact({ operationId: 'continue', type: 'command', runId, command: { type: 'continueOvertime' } }, reset.generation);
  assert.equal(continued.status, 'acknowledged');
  const display = accountDisplayProfile(continued.account!);
  assert.equal(display.stats.orders, 0); assert.equal(display.stats.wins, 0); assert.equal(display.stats.maxChain, 0);
  assert.deepEqual(display.achievements, []);
  const ended = service.transact({ operationId: 'finish', type: 'close', runId, reason: 'retired' }, continued.account!.generation);
  assert.equal(ended.status, 'acknowledged');
  const final = accountDisplayProfile(ended.account!);
  assert.equal(final.stats.orders, 0); assert.equal(final.stats.wins, 0); assert.equal(final.stats.maxChain, 0);
  assert.deepEqual(final.achievements, []);
});

test('a new run after the reset boundary can project its own fresh shipment facts', () => {
  const reset = resetAccountResults(checkpoint()), fresh = checkpoint(10, 2, 'standard');
  const account = { ...reset, nextRunSerial: fresh.nextRunSerial, run: fresh.run };
  const display = accountDisplayProfile(account);
  assert.ok(fresh.run!.state.completedOrders > 0);
  assert.equal(display.stats.orders, fresh.run?.state.completedOrders);
  assert.equal(display.stats.wins, 0);
  assert.equal(display.achievements.includes('first_shipment'), true);
  assert.equal(display.achievements.includes('five_shifts'), false);
});

test('only real fresh shipment chains survive reset through compaction restart and a later terminal result', () => {
  const reset = resetAccountResults(checkpoint(127, 1, 'endless', longGolden));
  assert.equal(reset.run?.state.maxChain, 1); assert.equal(reset.run?.resultCursor?.maxChainSinceBaseline, 0);
  const storage = new FaultStorage(), raw = encodeAccount(reset); storage.values.set(ACCOUNT_KEYS.a, raw); storage.values.set(ACCOUNT_KEYS.b, raw);
  const service = createAccountService(storage, { status: 'held', release() {} }, () => 0), runId = reset.run!.identity.runId;
  const command = (id: string, index: number) => service.transact({ operationId: id, type: 'command', runId, command: longGolden.commands[index] }, service.getSnapshot()!.generation);
  assert.equal(command('128', 127).status, 'acknowledged');
  assert.equal(service.getSnapshot()?.run?.history.tail.length, 0);
  assert.equal(accountDisplayProfile(service.getSnapshot()!).stats.maxChain, 0);
  const fresh = command('129', 128);
  assert.equal(fresh.status, 'acknowledged');
  assert.ok(fresh.events?.some(event => event.type === 'shipment'));
  assert.equal(fresh.account?.run?.resultCursor?.maxChainSinceBaseline, 1);
  assert.equal(accountDisplayProfile(fresh.account!).stats.orders, 0);
  const next = command('130', 129); assert.equal(next.status, 'acknowledged');
  assert.equal(next.account?.run?.state.lastChain, 0);
  assert.equal(next.account?.run?.resultCursor?.maxChainSinceBaseline, 1);
  const restarted = createAccountService(storage, { status: 'held', release() {} }, () => 0);
  assert.equal(accountDisplayProfile(restarted.getSnapshot()!).stats.maxChain, 0);
  const closed = restarted.transact({ operationId: 'finish', type: 'close', runId, reason: 'retired' }, restarted.getSnapshot()!.generation);
  assert.equal(closed.status, 'acknowledged');
  const display = accountDisplayProfile(closed.account!);
  assert.equal(display.stats.orders, 0); assert.equal(display.stats.maxChain, 0);
  assert.equal(Object.values(closed.account!.profile.results)[0].maxChain, 1);
  assert.equal(Object.values(closed.account!.profile.results)[0].best?.chain, 1);
});

test('read-only refresh recovers an initial unavailable empty store without inventing a receipt or initializing roots', () => {
  const storage = new FaultStorage(); storage.resetFault({ at: 1, timing: 'before' });
  const service = createAccountService(storage, { status: 'held', release() {} }, () => 0);
  assert.equal(service.getStatus(), 'unavailable'); assert.equal(service.getPendingOperationId(), null);
  storage.resetFault();
  const recovered = service.refresh();
  assert.equal(recovered.status, 'empty'); assert.equal(recovered.account, null); assert.equal(service.getStatus(), 'empty');
  assert.equal(storage.operations.some(op => op.kind === 'set' || op.kind === 'remove'), false);
});

test('read-only refresh adopts only an existing fully acknowledged account after initial read failure', () => {
  const storage = new FaultStorage(), account = checkpoint(), raw = encodeAccount(account);
  storage.values.set(ACCOUNT_KEYS.a, raw); storage.values.set(ACCOUNT_KEYS.b, raw); storage.resetFault({ at: 1, timing: 'before' });
  const service = createAccountService(storage, { status: 'held', release() {} }, () => 0);
  assert.equal(service.getSnapshot(), null); assert.equal(service.getPendingOperationId(), null);
  storage.resetFault();
  const refreshed = service.refresh();
  assert.equal(refreshed.status, 'ready'); assert.equal(service.getSnapshot()?.generation, account.generation);
  assert.equal(service.getSnapshot()?.run?.state.completedOrders, 30);
  assert.equal(storage.operations.some(op => op.kind === 'set' || op.kind === 'remove'), false);
  refreshed.account!.wallet = 9999;
  assert.equal(service.getSnapshot()?.wallet, account.wallet);
});

test('refresh cannot discard an exact pending request or adopt unknown roots', () => {
  const storage = new FaultStorage(), account = checkpoint(), raw = encodeAccount(account);
  storage.values.set(ACCOUNT_KEYS.a, raw); storage.values.set(ACCOUNT_KEYS.b, raw);
  const service = createAccountService(storage, { status: 'held', release() {} }, () => 0), originalSet = storage.set.bind(storage);
  storage.set = (key, value) => { if (key === ACCOUNT_KEYS.a) throw Error('mirror offline'); originalSet(key, value); };
  assert.equal(service.transact({ operationId: 'time', type: 'saveElapsed', runId: account.run!.identity.runId, elapsedMs: 1000 }, account.generation).status, 'committed_unmirrored');
  assert.equal(service.refresh().status, 'unknown'); assert.equal(service.getPendingOperationId(), 'time');
  storage.set = originalSet;
  assert.equal(service.retryPending('time').status, 'acknowledged');
  const blocked = new FaultStorage(); blocked.values.set(ACCOUNT_KEYS.a, '{"formatVersion":999}');
  const unknown = createAccountService(blocked, { status: 'held', release() {} }, () => 0); blocked.resetFault();
  assert.equal(unknown.refresh().status, 'unknown'); assert.equal(unknown.getSnapshot(), null);
  assert.equal(blocked.operations.some(op => op.kind === 'set' || op.kind === 'remove'), false);
});
