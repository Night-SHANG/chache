/** Test-only account fixtures. Never imported by the product entry point. */
import { createAccountService, type AccountRequest } from '../../src/application/account-service.ts';
import { ACCOUNT_KEYS, encodeAccount, loadAccount } from '../../src/application/account-store.ts';
import type { AccountSnapshot, RunIdentity } from '../../src/application/account-types.ts';
import { accountDigest, canonicalStringify, readHistory, stageHistory, verifyAccountReferences } from '../../src/application/history-store.ts';
import { baseCoins } from '../../src/application/economy.ts';
import type { StoragePort } from '../../src/application/save.ts';
import { applyCommandV9, createRunV9 } from '../../src/domain/v9/engine.ts';
import type { InboundCommandV9, StartV9 } from '../../src/domain/v9/types.ts';
import { makeAccountFixture, makeAccountRun } from '../helpers/account-fixtures.ts';

export interface Trace { options: StartV9; commands: InboundCommandV9[] }
export const CRASH_PHASES = ['history-before', 'history-mid', 'b-after', 'a-before', 'a-after', 'receipt-lost'] as const;
export type CrashPhase = typeof CRASH_PHASES[number];
export function check(value: unknown, message: string): asserts value { if (!value) throw Error(message); }
const service = (storage: StoragePort) => createAccountService(storage, { status: 'held', release() {} }, () => Date.parse('2026-10-11T00:00:00Z'));
const verify = (storage: StoragePort, account: AccountSnapshot) => verifyAccountReferences(storage, account);
const rootBytes = (account: AccountSnapshot) => new TextEncoder().encode(encodeAccount(account)).length;
export function clearFixture(storage: StoragePort): void {
 check(storage.listKeys, 'Fixture reset needs key enumeration');
 for (const key of storage.listKeys('warehouse.')) storage.remove(key);
}
function saveFixture(storage: StoragePort, account: AccountSnapshot): void {
 verify(storage, account);
 const raw = encodeAccount(account);storage.set(ACCOUNT_KEYS.b, raw);storage.set(ACCOUNT_KEYS.a, raw);
 check(service(storage).getStatus() === 'ready', 'Fixture is not accepted by the real account service');
}
function stateAt(trace: Trace, count: number) {
 let state = createRunV9(trace.options);
 for (const command of trace.commands.slice(0, count)) { const next = applyCommandV9(state, command);check(!next.error, `Golden command rejected: ${next.error}`);state = next.state; }
 return state;
}
export function seedRecovery(storage: StoragePort, trace: Trace, closed = false) {
 clearFixture(storage);
 const state = stateAt(trace, 127), identity: RunIdentity = { runId: 'android.acceptance', serial: 1, rulesetVersion: 9,
  runConfigId: state.runConfigId, mode: 'endless', economyVersion: 1 };
 const history = { seed: state.seed, runConfigId: state.runConfigId, head: null, totalCommands: 127, tail: state.commands };
 const earned = baseCoins('inbound', state.completedOrders, state.score);
 const account = makeAccountFixture({ generation: 1, wallet: 500, inventory: { rotate: 2, clear: 3, wildcard: 4 }, nextRunSerial: 2,
  run: { identity, state: { ...state, runSerial: 1 }, history, lifecycle: 'active', reserved: [], creditedBase: earned, earnedCoins: earned, resultCursor: null },
  lastOperation: { operationId: 'android.fixture', expectedGeneration: 0, requestDigest: 'fixture', committedGeneration: 1 } });
 if (closed) { account.run = null;account.closedThroughSerial = 1;
  account.lastClosedResult = { identity, reason: 'abandoned', commandIndex: 127, units: state.completedOrders, score: state.score,
   maxChain: state.maxChain, result: null, coinDelta: 0, earnedCoins: earned, returned: [], history };
 }
 saveFixture(storage, account);return summarize(storage, account);
}
function requestFor(trace: Trace, phase: CrashPhase): AccountRequest {
 return phase === 'receipt-lost' ? { operationId: 'android.purchase', type: 'purchase', item: 'rotate' }
  : { operationId: 'android.command128', type: 'command', runId: 'android.acceptance', command: trace.commands[127] };
}
export function startCrash(storage: StoragePort, trace: Trace, phase: CrashPhase, checkpoint: (phase: CrashPhase) => void): void {
 check(CRASH_PHASES.includes(phase), 'Unknown crash phase');
 const wrapped: StoragePort = { ...storage, get: key => storage.get(key), remove: key => storage.remove(key),
  listKeys: prefix => storage.listKeys!(prefix), set(key, value) {
   const history = key.startsWith('warehouse.account.history.s1.');
   if (phase === 'history-before' && history || phase === 'a-before' && key === ACCOUNT_KEYS.a) checkpoint(phase);
   storage.set(key, value);
   if (phase === 'history-mid' && history || phase === 'b-after' && key === ACCOUNT_KEYS.b
    || (phase === 'a-after' || phase === 'receipt-lost') && key === ACCOUNT_KEYS.a) checkpoint(phase);
  } };
 service(wrapped).transact(requestFor(trace, phase), 1);
}
export function summarize(storage: StoragePort, account: AccountSnapshot) {
 verify(storage, account);
 const record = account.run ?? account.lastClosedResult;
 const commands = record ? [...readHistory(storage, record.identity, record.history, record.history.tail)] : [];
 return { wallet: account.wallet, inventory: account.inventory, generation: account.generation, operationId: account.lastOperation?.operationId,
  historyCommands: commands.length, historyDigest: accountDigest(canonicalStringify(commands)), rootDigest: accountDigest(encodeAccount(account)), rootBytes: rootBytes(account) };
}
export function verifyRecovery(storage: StoragePort, trace: Trace, phase: CrashPhase) {
 const committed = !['history-before', 'history-mid'].includes(phase), purchase = phase === 'receipt-lost';
 const recovered = loadAccount(storage, account => verify(storage, account));
 check(recovered.account, `Recovery failed: ${recovered.status}`);
 const count = committed && !purchase ? 128 : 127;
 const before = stateAt(trace, 127), after = stateAt(trace, 128);
 const expectedWallet = purchase ? 420 : 500 + baseCoins('inbound', after.completedOrders, after.score) - baseCoins('inbound', before.completedOrders, before.score);
 const summary = summarize(storage, recovered.account);
 check(summary.generation === (committed ? 2 : 1), 'Recovered generation differs');
 check(summary.wallet === (committed ? expectedWallet : 500), 'Recovered wallet differs');
 check(canonicalStringify(summary.inventory) === canonicalStringify({ rotate: purchase ? 3 : 2, clear: 3, wildcard: 4 }), 'Recovered inventory differs');
 check(summary.historyCommands === count && summary.historyDigest === accountDigest(canonicalStringify(trace.commands.slice(0, count))), 'Recovered history differs');
 check(summary.operationId === (committed ? requestFor(trace, phase).operationId : 'android.fixture'), 'Recovered receipt differs');
 const restarted = service(storage), request = requestFor(trace, phase);
 const first = committed ? restarted.retryPending(request.operationId) : restarted.transact(request, 1);
 check(first.status === 'acknowledged' && first.account, `Retry failed: ${first.message}`);
 const saved = encodeAccount(first.account), second = restarted.retryPending(request.operationId);
 check(second.status === 'acknowledged' && second.account && encodeAccount(second.account) === saved, 'Retry changed account twice');
 check(second.account.wallet === expectedWallet && second.account.generation === 2, 'Retry double charged or advanced generation');
 return { status: 'passed', phase, recovered: summary, account: summarize(storage, second.account) };
}
export function seedUpgrade(storage: StoragePort, trace: Trace) {
 seedRecovery(storage, trace, true);
 const result = service(storage).transact(requestFor(trace, 'receipt-lost'), 1);
 check(result.status === 'acknowledged' && result.account, 'Upgrade fixture purchase failed');
 return { status: 'passed', account: summarize(storage, result.account) };
}
export function verifyUpgrade(storage: StoragePort, trace: Trace) { return verifyRecovery(storage, trace, 'receipt-lost'); }
export type BenchmarkVariant = 'normal' | 'realistic' | 'extreme';
export function seedStress(storage: StoragePort, variant: BenchmarkVariant = 'extreme', trace?: Trace) {
 clearFixture(storage);
 if (variant !== 'extreme') {
  let account: AccountSnapshot;
  if (variant === 'realistic') {
   check(trace, 'Realistic benchmark requires a golden trace');
   seedRecovery(storage, trace, true);
   account = loadAccount(storage, value => verify(storage, value)).account!;
   const record = account.lastClosedResult!, state = stateAt(trace, trace.commands.length);
   const history = stageHistory(storage, record.identity, { ...record.history, totalCommands: 0, head: null, tail: [] }, trace.commands, trace.commands.length).cursor;
   account.lastClosedResult = { ...record, history, commandIndex: trace.commands.length, units: state.completedOrders, score: state.score,
    maxChain: state.maxChain, earnedCoins: baseCoins('inbound', state.completedOrders, state.score) };
   for (let index = 0; index < 1460; index++) account.dailyPaid[new Date(Date.parse('2020-01-01T00:00:00Z') + index * 86400000).toISOString().slice(0, 10)] = { bestBase: 60, paid: 120 };
  } else account = makeAccountFixture({ generation: 1, wallet: 500, lastOperation: { operationId: 'android.normal', expectedGeneration: 0, requestDigest: 'fixture', committedGeneration: 1 } });
  saveFixture(storage, account);
  return { rootBytes: rootBytes(account), historyCommands: account.lastClosedResult?.history.totalCommands ?? 0,
   historyChunks: storage.listKeys!('warehouse.account.history.s1.').length, dailyProofs: Object.keys(account.dailyPaid).length,
   fixtureKind: variant === 'realistic' ? 'real replayed golden history plus 1460 valid daily-paid proofs' : 'normal account without a run history', finiteHistoryMaximum: false };
 }
 const run = makeAccountRun();
 const commands = Array.from({ length: 16384 }, (_, index) => ({ type: 'place' as const, pieceId: `piece.${index}`, origin: { x: 0, y: 0 } }));
 const history = stageHistory(storage, run.identity, run.history, commands, commands.length).cursor;
 const account = makeAccountFixture({ generation: 1, wallet: 500, nextRunSerial: 2, closedThroughSerial: 1,
  lastClosedResult: { identity: run.identity, reason: 'abandoned', commandIndex: commands.length, units: 0, score: 0, maxChain: 0, result: null, coinDelta: 0, earnedCoins: 0, returned: [], history },
  lastOperation: { operationId: 'android.stress', expectedGeneration: 0, requestDigest: 'fixture', committedGeneration: 1 } });
 // Valid historical daily-paid proofs fill the root; leave room for the real format upgrade and operation receipts.
 const base = rootBytes(account), start = Date.parse('2000-01-01T00:00:00Z');
 account.dailyPaid['2000-01-01'] = { bestBase: 60, paid: 120 };
 const entry = rootBytes(account) - base + 1, entries = Math.floor((491 * 1024 - base) / entry);
 for (let index = 0; index < entries; index++) account.dailyPaid[new Date(start + index * 86400000).toISOString().slice(0, 10)] = { bestBase: 60, paid: 120 };
 saveFixture(storage, account);
 return { rootBytes: rootBytes(account), historyCommands: commands.length, historyChunks: storage.listKeys!('warehouse.account.history.s1.').length,
  dailyProofs: Object.keys(account.dailyPaid).length, fixtureKind: 'schema-valid synthetic closed history and valid historical daily proofs', finiteHistoryMaximum: false };
}
export async function measureStress(storage: StoragePort, iterations = 100, variant: BenchmarkVariant = 'extreme', trace?: Trace) {
 const facts = seedStress(storage, variant, trace), runner = service(storage), durations: number[] = [], eventLoopDelays: number[] = [];
 const acknowledgements: { generation: number; rootBytes: number }[] = [];
 for (let index = 0; index < iterations; index++) {
  const timerStart = performance.now();
  const tick = new Promise<number>(resolve => setTimeout(() => resolve(performance.now() - timerStart), 0));
  const start = performance.now(), result = runner.transact({ operationId: `android.timing.${index}`, type: 'setSettings', patch: { reducedMotion: index % 2 === 0 } }, runner.getSnapshot()!.generation);
  durations.push(performance.now() - start);
  check(result.status === 'acknowledged', `Timed real transaction failed: ${result.message}`);
  eventLoopDelays.push(await tick);
  check(result.account && result.account.generation === index + 2, 'Timed transaction did not advance exactly one generation');
  const size = rootBytes(result.account);check(size <= 496 * 1024, 'Timed account crossed the normal byte ceiling');
  acknowledgements.push({ generation: result.account.generation, rootBytes: size });
 }
 const sorted = [...durations].sort((a, b) => a - b), percentile = (p: number) => sorted[Math.ceil(sorted.length * p) - 1];
 const timing = { p50Ms: percentile(.50), p95Ms: percentile(.95), p99Ms: percentile(.99), maxMs: sorted[sorted.length - 1] };
 return { status: timing.p95Ms <= 100 && timing.maxMs <= 500 ? 'passed' : 'failed', variant, iterations, ...facts, finalRootBytes: acknowledgements[acknowledgements.length - 1].rootBytes, acknowledgements, timing, durationsMs: durations,
  webViewEventLoopDelaysMs: eventLoopDelays, account: summarize(storage, runner.getSnapshot()!), gate: { p95Ms: 100, maxMs: 500 },
  limit: 'No finite history limit exists; this specified fixture is not the longest possible history.' };
}
