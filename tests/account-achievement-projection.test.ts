import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { accountDisplayProfile, createAccountService } from '../src/application/account-service.ts';
import { recordAccountResult } from '../src/application/account-profile.ts';
import { ACCOUNT_KEYS, encodeAccount } from '../src/application/account-store.ts';
import { baseCoins } from '../src/application/economy.ts';
import type { AccountRun, AccountSnapshot, ResultBucket } from '../src/application/account-types.ts';
import { applyCommandV9, createRunV9 } from '../src/domain/v9/engine.ts';
import type { InboundCommandV9, StartV9 } from '../src/domain/v9/types.ts';
import { FaultStorage, makeAccountFixture } from './helpers/account-fixtures.ts';

const bucket = (units: number, patch: Partial<ResultBucket> = {}): ResultBucket => ({ runs: 1, units, maxUnits: units, score: units * 100, wins: 0, retirements: 0, maxChain: 1,
  best: { score: units * 100, units, chain: 1 }, ...patch });
function legacyOrders(account: AccountSnapshot, units: number): AccountSnapshot {
  return { ...account, profile: { ...account.profile, legacyResults: { ...account.profile.legacyResults, stats: { runs: 2, orders: units, wins: 0, maxChain: 0 } } } };
}
function realCheckpoint(): AccountSnapshot {
  const golden = JSON.parse(readFileSync(new URL('./fixtures/inbound-v9-golden.json', import.meta.url), 'utf8'))[2] as { options: StartV9; commands: InboundCommandV9[] };
  let state = createRunV9({ ...golden.options, mode: 'standard' });
  for (const command of golden.commands.slice(0, 59)) { const step = applyCommandV9(state, command); assert.equal(step.error, undefined); state = step.state; }
  state.runSerial = 1;
  assert.equal(state.completedOrders, 30); assert.equal(state.endReason, 'completed');
  const creditedBase = baseCoins('inbound', state.completedOrders, state.score);
  const run: AccountRun = { identity: { runId: 'achievement.1', serial: 1, rulesetVersion: 9, runConfigId: state.runConfigId, mode: 'standard', economyVersion: 1 }, state,
    history: { seed: state.seed, runConfigId: state.runConfigId, head: null, totalCommands: state.commandIndex, tail: state.commands }, lifecycle: 'active', reserved: ['clear'],
    creditedBase, earnedCoins: creditedBase, resultCursor: null };
  return recordAccountResult(makeAccountFixture({ generation: 1, nextRunSerial: 2, wallet: creditedBase, run,
    lastOperation: { operationId: 'fixture', expectedGeneration: 0, requestDigest: 'fixture', committedGeneration: 1 } }), run);
}

test('classic hundred-order achievement adds disjoint legacy sixty and new fifty formal orders', () => {
  const account = legacyOrders(makeAccountFixture(), 60);
  account.profile.results['inbound.standard.v9.plain'] = bucket(50);
  const before = structuredClone(account.profile.results), display = accountDisplayProfile(account);
  assert.equal(display.stats.orders, 110);
  assert.equal(display.achievements.includes('ship_100'), true);
  assert.deepEqual(account.profile.results, before);
});

test('outbound direct endless and guided buckets preserve independent scores without unlocking classic inbound achievements', () => {
  const account = makeAccountFixture();
  for (const key of ['outbound.v8.normal', 'outboundEndless.v10.normal', 'inbound.endless.v9.plain', 'inbound.guided.v9.plain', 'outboundGuided.v8.easy']) account.profile.results[key] = bucket(100, { maxChain: 3, best: { score: 10000, units: 100, chain: 3 } });
  const before = structuredClone(account.profile.results), display = accountDisplayProfile(account);
  assert.equal(display.stats.orders, 0); assert.equal(display.stats.wins, 0); assert.equal(display.stats.maxChain, 0);
  assert.deepEqual(display.achievements, []);
  assert.deepEqual(account.profile.results, before);
});

test('daily wins count formal results without granting the standard five-shift cosmetic', () => {
  const account = makeAccountFixture(); account.profile.results['inbound.daily.v9.plain'] = bucket(30, { wins: 1 });
  const display = accountDisplayProfile(account);
  assert.equal(display.stats.orders, 30); assert.equal(display.stats.wins, 1); assert.equal(display.stats.runs, 1);
  assert.equal(display.achievements.includes('first_shipment'), true);
  assert.equal(display.achievements.includes('five_shifts'), false);
});

test('a recorded standard checkpoint counts once while only fresh overtime orders add to legacy totals', () => {
  const account = legacyOrders(realCheckpoint(), 10), storage = new FaultStorage(), raw = encodeAccount(account);
  storage.values.set(ACCOUNT_KEYS.a, raw); storage.values.set(ACCOUNT_KEYS.b, raw);
  const service = createAccountService(storage, { status: 'held', release() {} }, () => 0), runId = account.run!.identity.runId;
  const display = accountDisplayProfile(account);
  assert.equal(display.stats.orders, 40); assert.equal(display.stats.wins, 1); assert.equal(display.stats.runs, 3);
  const command = (operationId: string, command: InboundCommandV9) => service.transact({ operationId, type: 'command', runId, command }, service.getSnapshot()!.generation);
  assert.equal(command('continue', { type: 'continueOvertime' }).status, 'acknowledged');
  assert.equal(accountDisplayProfile(service.getSnapshot()!).stats.orders, 40);
  for (const [index, move] of [
    { type: 'place' as const, pieceId: 'piece.89', origin: { x: 1, y: 1 } },
    { type: 'place' as const, pieceId: 'piece.90', origin: { x: 3, y: 1 } },
  ].entries()) assert.equal(command(`fresh.${index}`, move).status, 'acknowledged');
  assert.equal(service.getSnapshot()?.run?.state.completedOrders, 31);
  const fresh = accountDisplayProfile(service.getSnapshot()!);
  assert.equal(fresh.stats.orders, 41); assert.equal(fresh.stats.wins, 1);
  const closed = service.transact({ operationId: 'finish', type: 'close', runId, reason: 'retired' }, service.getSnapshot()!.generation);
  assert.equal(closed.status, 'acknowledged');
  assert.equal(accountDisplayProfile(closed.account!).stats.orders, 41);
  assert.equal(accountDisplayProfile(closed.account!).stats.wins, 1);
});
