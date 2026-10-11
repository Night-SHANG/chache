import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
const HANDLER_LABEL = 'Handler scheduling delay; not frame timing or an ANR detector';
const HISTORY_LIMIT = 'No finite history limit exists; this specified fixture is not the longest possible history.';
const CRASH_PHASES = ['history-before', 'history-mid', 'b-after', 'a-before', 'a-after', 'receipt-lost'];
// Versioned test-fixture contract, independently checked against the actual fixture generator in tests.
const FIXTURES = {
 normal: { rootBytes: 1037, historyCommands: 0, historyChunks: 0, dailyProofs: 0, historyDigest: '741638a5',
  fixtureKind: 'normal account without a run history', inventory: { clear: 0, rotate: 0, wildcard: 0 } },
 realistic: { rootBytes: 61272, historyCommands: 150, historyChunks: 1, dailyProofs: 1460, historyDigest: '6d2f8944',
  fixtureKind: 'real replayed golden history plus 1460 valid daily-paid proofs', inventory: { clear: 3, rotate: 2, wildcard: 4 } },
 extreme: { rootBytes: 502772, historyCommands: 16384, historyChunks: 128, dailyProofs: 12531, historyDigest: 'a7efd621',
  fixtureKind: 'schema-valid synthetic closed history and valid historical daily proofs', inventory: { clear: 0, rotate: 0, wildcard: 0 } },
};
function requireValue(value, message) { if (!value) throw Error(message); }
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const nonnegativeInteger = value => Number.isSafeInteger(value) && value >= 0;
const nonnegativeFinite = value => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const bytes = value => Number.isSafeInteger(value) && value > 0 && value <= 496 * 1024;
const digest = value => typeof value === 'string' && /^[a-f0-9]{8}$/.test(value);
function validateEnvelope(value, expected) {
 requireValue(object(value) && value.schema === 1, 'Missing or unsupported native result');
 requireValue(object(expected), 'Missing expected native invocation');
 const supported = expected.action === 'performance' && Object.hasOwn(FIXTURES, expected.phase)
  || expected.action === 'verify-crash' && CRASH_PHASES.includes(expected.phase)
  || ['seed-upgrade', 'verify-upgrade'].includes(expected.action) && expected.phase === 'none';
 requireValue(supported, 'Unknown native action/phase combination');
 for (const key of ['action', 'phase', 'nonce']) requireValue(value[key] === expected[key], `Native result ${key} does not match this invocation`);
 requireValue(typeof value.nonce === 'string' && /^[a-zA-Z0-9_.:-]{8,100}$/.test(value.nonce), 'Invalid invocation nonce');
 requireValue(['passed', 'failed'].includes(value.status), 'Unknown native status');
 requireValue(Number.isSafeInteger(value.pid) && value.pid > 0, 'Missing native process evidence');
 requireValue(nonnegativeFinite(value.maxMainLooperDelayMs), 'Missing native main-loop delay evidence');
 requireValue(typeof value.webViewUserAgent === 'string' && value.webViewUserAgent.trim().length > 0, 'Missing actual WebView user agent');
 requireValue(value.frameTiming === 'not-measured' && value.mainLooperMeasurement === HANDLER_LABEL, 'Incorrect native measurement labels');
 requireValue(object(value.result) && ['passed', 'failed'].includes(value.result.status), 'Missing native action result');
 return value;
}
function validateAccount(account) {
 requireValue(object(account), 'Missing complete account summary');
 for (const field of ['wallet', 'generation', 'historyCommands']) requireValue(nonnegativeInteger(account[field]), `Invalid account ${field}`);
 requireValue(object(account.inventory) && Object.keys(account.inventory).length === 3
  && ['clear', 'rotate', 'wildcard'].every(key => nonnegativeInteger(account.inventory[key])), 'Missing complete numeric inventory');
 requireValue(typeof account.operationId === 'string' && /^[a-zA-Z0-9_.:-]{1,100}$/.test(account.operationId), 'Missing operation receipt');
 requireValue(digest(account.historyDigest) && digest(account.rootDigest), 'Missing account/history digests');
 requireValue(bytes(account.rootBytes), 'Missing positive integer account root size');
}
function requireAccount(account, expected) {
 validateAccount(account);
 for (const [key, value] of Object.entries(expected)) {
  if (key === 'inventory') requireValue(Object.keys(value).every(item => account.inventory[item] === value[item]), 'Account inventory differs from fixture');
  else requireValue(account[key] === value, `Account ${key} differs from fixture`);
 }
}
export function validateMeasurement(value, expected) {
 validateEnvelope(value, expected);
 const r = value.result, fixture = FIXTURES[expected.phase];
 requireValue(expected.action === 'performance' && r.variant === expected.phase, 'Benchmark variant mismatch');
 requireValue(r.iterations === 100, '100 acknowledged real transactions were not measured');
 for (const field of ['rootBytes', 'historyCommands', 'historyChunks', 'dailyProofs']) {
  requireValue(nonnegativeInteger(r[field]) && r[field] === fixture[field], `Incorrect benchmark fixture ${field}`);
 }
 requireValue(bytes(r.rootBytes) && r.fixtureKind === fixture.fixtureKind && r.finiteHistoryMaximum === false && r.limit === HISTORY_LIMIT,
  'Missing truthful fixture/history-limit description');
 for (const field of ['durationsMs', 'webViewEventLoopDelaysMs']) requireValue(Array.isArray(r[field]) && r[field].length === 100
  && r[field].every(nonnegativeFinite), `Missing 100 finite nonnegative ${field}`);
 requireValue(Array.isArray(r.acknowledgements) && r.acknowledgements.length === 100 && r.acknowledgements.every((a, i) => object(a)
  && a.generation === i + 2 && bytes(a.rootBytes) && a.rootBytes >= r.rootBytes), 'Missing acknowledged generations or invalid root sizes');
 requireAccount(r.account, { wallet: 500, inventory: fixture.inventory, generation: 101, operationId: 'android.timing.99',
  historyCommands: fixture.historyCommands, historyDigest: fixture.historyDigest });
 requireValue(bytes(r.finalRootBytes) && r.finalRootBytes === r.acknowledgements[99].rootBytes && r.finalRootBytes === r.account.rootBytes,
  'Final benchmark root sizes disagree');
 const sorted = [...r.durationsMs].sort((a, b) => a - b), statistics = { p50Ms: sorted[49], p95Ms: sorted[94], p99Ms: sorted[98], maxMs: sorted[99] };
 requireValue(object(r.timing) && Object.keys(r.timing).length === 4 && Object.entries(statistics).every(([key, number]) => r.timing[key] === number),
  'Reported percentiles disagree with the raw nearest-rank samples');
 requireValue(object(r.gate) && Object.keys(r.gate).length === 2 && r.gate.p95Ms === 100 && r.gate.maxMs === 500, 'Acceptance latency gates changed');
 const timedPass = sorted[94] <= 100 && sorted[99] <= 500;
 requireValue(r.status === (timedPass ? 'passed' : 'failed'), 'Reported transaction status contradicts measured latency');
 requireValue(value.status === (timedPass && value.maxMainLooperDelayMs <= 500 ? 'passed' : 'failed'), 'Reported native status contradicts measured latency');
 return value;
}
export function validateResult(value, expected) {
 validateEnvelope(value, expected);
 if (expected.action === 'performance') validateMeasurement(value, expected);
 else {
  const r = value.result, purchase = expected.action !== 'verify-crash' || expected.phase === 'receipt-lost';
  const committed = { wallet: purchase ? 420 : 500, inventory: { clear: 3, rotate: purchase ? 3 : 2, wildcard: 4 }, generation: 2,
   operationId: purchase ? 'android.purchase' : 'android.command128', historyCommands: purchase ? 127 : 128,
   historyDigest: purchase ? '96b49d2a' : '500f4340' };
  requireAccount(r.account, committed);
  if (expected.action !== 'seed-upgrade') {
   requireValue(r.phase === (expected.action === 'verify-upgrade' ? 'receipt-lost' : expected.phase), 'Recovered phase mismatch');
   const before = expected.action === 'verify-crash' && ['history-before', 'history-mid'].includes(expected.phase);
   requireAccount(r.recovered, before ? { wallet: 500, inventory: { clear: 3, rotate: 2, wildcard: 4 }, generation: 1,
    operationId: 'android.fixture', historyCommands: 127, historyDigest: '96b49d2a' } : committed);
  }
 }
 requireValue(value.status === 'passed' && value.result.status === 'passed' && value.maxMainLooperDelayMs <= 500, 'Native acceptance did not pass');
 return value;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
 const [path, action, phase, nonce, mode] = process.argv.slice(2);
 const validator = mode === '--measurement' ? validateMeasurement : validateResult;
 validator(JSON.parse(readFileSync(path, 'utf8')), { action, phase, nonce });
 console.log(`Verified native result: ${action} ${phase}`);
}
