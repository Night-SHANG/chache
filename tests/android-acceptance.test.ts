import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, existsSync } from 'node:fs';
import { FaultStorage } from './helpers/account-fixtures.ts';
const helperPath = new URL('./android/acceptance-fixtures.ts', import.meta.url);
const measurementFacts = {
 normal: { rootBytes: 1037, finalRootBytes: 1276, historyCommands: 0, historyChunks: 0, dailyProofs: 0,
  fixtureKind: 'normal account without a run history', historyDigest: '741638a5', rootDigest: 'b56a46a3', inventory: { clear: 0, rotate: 0, wildcard: 0 } },
 realistic: { rootBytes: 61272, finalRootBytes: 61510, historyCommands: 150, historyChunks: 1, dailyProofs: 1460,
  fixtureKind: 'real replayed golden history plus 1460 valid daily-paid proofs', historyDigest: '6d2f8944', rootDigest: 'deccdd06', inventory: { clear: 3, rotate: 2, wildcard: 4 } },
 extreme: { rootBytes: 502772, finalRootBytes: 503011, historyCommands: 16384, historyChunks: 128, dailyProofs: 12531,
  fixtureKind: 'schema-valid synthetic closed history and valid historical daily proofs', historyDigest: 'a7efd621', rootDigest: 'ba429ba4', inventory: { clear: 0, rotate: 0, wildcard: 0 } },
};
function nativeEnvelope(action: string, phase: string, result: unknown) {
 return { schema: 1, action, phase, nonce: 'test.complete', status: 'passed', pid: 123, maxMainLooperDelayMs: 0,
  webViewUserAgent: 'unit protocol fixture', frameTiming: 'not-measured', mainLooperMeasurement: 'Handler scheduling delay; not frame timing or an ANR detector', result };
}
function completeMeasurement(variant: keyof typeof measurementFacts = 'extreme', duration = 1) {
 const f = measurementFacts[variant], status = duration <= 100 ? 'passed' : 'failed';
 return { schema: 1, action: 'performance', phase: variant, nonce: 'test.complete', status, pid: 123, maxMainLooperDelayMs: 0,
  webViewUserAgent: 'unit protocol fixture', frameTiming: 'not-measured', mainLooperMeasurement: 'Handler scheduling delay; not frame timing or an ANR detector',
  result: { variant, status, iterations: 100, rootBytes: f.rootBytes, finalRootBytes: f.finalRootBytes, historyCommands: f.historyCommands,
   historyChunks: f.historyChunks, dailyProofs: f.dailyProofs, fixtureKind: f.fixtureKind, finiteHistoryMaximum: false,
   limit: 'No finite history limit exists; this specified fixture is not the longest possible history.',
   durationsMs: Array(100).fill(duration), webViewEventLoopDelaysMs: Array(100).fill(duration + 1),
   acknowledgements: Array.from({ length: 100 }, (_, i) => ({ generation: i + 2, rootBytes: f.finalRootBytes })),
   timing: { p50Ms: duration, p95Ms: duration, p99Ms: duration, maxMs: duration }, gate: { p95Ms: 100, maxMs: 500 },
   account: { wallet: 500, inventory: f.inventory, generation: 101, operationId: 'android.timing.99', historyCommands: f.historyCommands,
    historyDigest: f.historyDigest, rootDigest: f.rootDigest, rootBytes: f.finalRootBytes } } };
}
test('acceptance fixture helper exists outside the production source tree', () => {
 assert.equal(existsSync(helperPath), true, 'Missing separate Android acceptance fixture helper');
});
test('real golden history crash checkpoints recover the expected account and receipt exactly once', async () => {
 assert.equal(existsSync(helperPath), true, 'Missing separate Android acceptance fixture helper');
 const h = await import('./android/acceptance-fixtures.ts');
 const trace = JSON.parse(readFileSync(new URL('./fixtures/inbound-v9-golden.json', import.meta.url), 'utf8'))[1];
 for (const phase of h.CRASH_PHASES) {
  const storage = new FaultStorage();
  h.seedRecovery(storage, trace, phase === 'receipt-lost');
  let reached = false;let atDeath = new Map<string, string>();
  // Node only verifies fixture/control-flow logic. This is not native/process-death evidence.
  h.startCrash(storage, trace, phase, () => { reached = true;atDeath = new Map(storage.values);throw new Error('simulated process end'); });
  assert.equal(reached, true, phase);storage.values = atDeath;
  const report = h.verifyRecovery(storage, trace, phase);
  const { validateResult } = await import(new URL('../scripts/android-acceptance-report.mjs', import.meta.url).href);
  const envelope = nativeEnvelope('verify-crash', phase, report);validateResult(envelope, envelope);
  assert.equal(report.status, 'passed');
  assert.equal(report.account.generation, 2);
 }
});
test('stress fixture is schema-valid, near normal root limit, and retains 128 sealed chunks', async () => {
 assert.equal(existsSync(helperPath), true, 'Missing separate Android acceptance fixture helper');
 const h = await import('./android/acceptance-fixtures.ts'), storage = new FaultStorage();
 const facts = h.seedStress(storage);
 assert.equal(facts.historyCommands, 16384);
 assert.equal(facts.historyChunks, 128);
 assert.equal(facts.rootBytes, measurementFacts.extreme.rootBytes);
 assert.equal(facts.dailyProofs, measurementFacts.extreme.dailyProofs);
});
test('fixture build produces an isolated test bundle and never writes into product assets', async () => {
 const build = new URL('../scripts/build-android-acceptance.mjs', import.meta.url);
 assert.equal(existsSync(build), true, 'Missing isolated acceptance bundle builder');
 const { execFileSync } = await import('node:child_process');
 execFileSync(process.execPath, [build.pathname], { cwd: new URL('..', import.meta.url).pathname });
 const bundle = readFileSync(new URL('../android/app/build/generated/acceptanceAssets/acceptance.js', import.meta.url), 'utf8');
 assert.ok(bundle.includes('WarehouseAcceptanceControl'));
 assert.ok(!existsSync(new URL('../android/app/src/main/assets/acceptance.js', import.meta.url)));
});
test('device report validation rejects absent, wrong-action, stale and failed instrumentation results', async () => {
 const path = new URL('../scripts/android-acceptance-report.mjs', import.meta.url);
 assert.equal(existsSync(path), true, 'Missing fail-closed instrumentation result validator');
 const { validateResult } = await import(path.href);
 const expected = { action: 'verify-crash', phase: 'b-after', nonce: 'test.nonce' };
 const account = { wallet: 500, inventory: { clear: 3, rotate: 2, wildcard: 4 }, generation: 2, operationId: 'android.command128',
  historyCommands: 128, historyDigest: '500f4340', rootDigest: 'b37715c3', rootBytes: 4100 };
 const good = { ...nativeEnvelope('verify-crash', 'b-after', { status: 'passed', phase: 'b-after', recovered: account, account }), nonce: expected.nonce };
 assert.doesNotThrow(() => validateResult(good, expected));
 for (const bad of [null, {}, { ...good, action: 'seed-crash' }, { ...good, nonce: 'old' }, { ...good, status: 'failed' }, { ...good, result: { status: 'failed' } }])
  assert.throws(() => validateResult(bad, expected));
});
test('device driver refuses implicit fixture reset and non-emulator serials before adb', async () => {
 const { spawnSync } = await import('node:child_process');
 const script = new URL('../scripts/android-device-check.sh', import.meta.url).pathname;
 for (const args of [[], ['--disposable-emulator', 'one.apk', 'two.apk']]) {
  const result = spawnSync('bash', [script, ...args], { env: { ...process.env, ANDROID_SERIAL: 'physical-phone', ANDROID_ACCEPTANCE_OUT: '/tmp/android-acceptance-script-test' }, encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Required: --disposable-emulator|must explicitly identify a disposable emulator/);
 }
});
test('Gradle accepts only the two same-job acceptance version codes and keeps test assets isolated', () => {
 const source = readFileSync(new URL('../android/app/build.gradle', import.meta.url), 'utf8');
 assert.match(source, /warehouseAcceptanceVersionCode.*orElse\('1'\)/);
 assert.match(source, /acceptanceCode in \['1', '2'\]/);
 assert.match(source, /androidTest\.assets\.srcDir/);
 assert.doesNotMatch(source, /main\.assets\.srcDir.*acceptance/);
});
test('timing matrix retains complete failed measurements without converting them into acceptance passes', async () => {
 const path = new URL('../scripts/android-acceptance-report.mjs', import.meta.url);
 const { validateMeasurement, validateResult } = await import(path.href);
 const report = completeMeasurement('extreme', 501);
 const expected = { action: report.action, phase: report.phase, nonce: report.nonce };
 assert.doesNotThrow(() => validateMeasurement(report, expected));
 assert.throws(() => validateResult(report, expected), /did not pass/);
 assert.throws(() => validateMeasurement({ ...report, result: { ...report.result, iterations: 99 } }, expected));
 assert.throws(() => validateMeasurement({ ...report, result: { ...report.result, acknowledgements: [] } }, expected));
 assert.throws(() => validateMeasurement({ ...report, status: 'passed' }, expected));
});
test('normal and realistic fixture dimensions are explicit and distinct from synthetic stress', async () => {
 const h = await import('./android/acceptance-fixtures.ts');
 const trace = JSON.parse(readFileSync(new URL('./fixtures/inbound-v9-golden.json', import.meta.url), 'utf8'))[1];
 const normal = h.seedStress(new FaultStorage(), 'normal', trace), realistic = h.seedStress(new FaultStorage(), 'realistic', trace);
 assert.equal(normal.historyCommands, 0);assert.equal(normal.dailyProofs, 0);assert.ok(normal.rootBytes < 2048);
 assert.equal(realistic.historyCommands, 150);assert.equal(realistic.historyChunks, 1);assert.equal(realistic.dailyProofs, 1460);
 assert.equal(realistic.rootBytes, measurementFacts.realistic.rootBytes);assert.equal(normal.rootBytes, measurementFacts.normal.rootBytes);
});
test('upgrade fixture round trip preserves the full account and acknowledged purchase', async () => {
 const h = await import('./android/acceptance-fixtures.ts'), storage = new FaultStorage();
 const trace = JSON.parse(readFileSync(new URL('./fixtures/inbound-v9-golden.json', import.meta.url), 'utf8'))[1];
 const before = h.seedUpgrade(storage, trace), after = h.verifyUpgrade(storage, trace);
 const { validateResult } = await import(new URL('../scripts/android-acceptance-report.mjs', import.meta.url).href);
 const first = nativeEnvelope('seed-upgrade', 'none', before), second = nativeEnvelope('verify-upgrade', 'none', after);
 validateResult(first, first);validateResult(second, second);
 assert.deepEqual(after.account, before.account);
 assert.equal(after.account.wallet, 420);assert.equal(after.account.inventory.rotate, 3);
});
test('native benchmark protocol rejects passing envelopes without the documented evidence', async () => {
 const path = new URL('../scripts/android-acceptance-report.mjs', import.meta.url);
 const { validateMeasurement, validateResult } = await import(path.href);
 const expected = { action: 'performance', phase: 'extreme', nonce: 'review.missing-evidence' };
 const incomplete = { schema: 1, ...expected, status: 'passed', pid: 123, maxMainLooperDelayMs: 0,
  result: { variant: 'extreme', status: 'passed', iterations: 100, durationsMs: Array(100).fill(1),
   acknowledgements: Array.from({ length: 100 }, (_, i) => ({ generation: i + 2, rootBytes: '1' })),
   finalRootBytes: '1', account: { generation: 101 } } };
 assert.throws(() => validateMeasurement(incomplete, expected));
 assert.throws(() => validateResult(incomplete, expected));
});
test('benchmark evidence requires exact fixture dimensions, complete numeric samples, and recomputed summary gates', async () => {
 const path = new URL('../scripts/android-acceptance-report.mjs', import.meta.url);
 const { validateMeasurement, validateResult } = await import(path.href);
 for (const variant of ['normal', 'realistic', 'extreme'] as const) {
  const good = completeMeasurement(variant), expected = { action: good.action, phase: good.phase, nonce: good.nonce };
  assert.doesNotThrow(() => validateMeasurement(good, expected));assert.doesNotThrow(() => validateResult(good, expected));
  for (const field of ['rootBytes', 'finalRootBytes', 'historyCommands', 'historyChunks', 'dailyProofs', 'fixtureKind', 'finiteHistoryMaximum',
   'limit', 'durationsMs', 'webViewEventLoopDelaysMs', 'acknowledgements', 'timing', 'gate', 'account']) {
   const bad = structuredClone(good);delete (bad.result as Record<string, unknown>)[field];
   assert.throws(() => validateMeasurement(bad, expected), `missing ${field}`);
  }
  const mutations = [
   (r: ReturnType<typeof completeMeasurement>) => { r.result.rootBytes = 1; },
   (r: ReturnType<typeof completeMeasurement>) => { r.result.historyCommands++; },
   (r: ReturnType<typeof completeMeasurement>) => { r.result.historyChunks++; },
   (r: ReturnType<typeof completeMeasurement>) => { r.result.dailyProofs++; },
   (r: ReturnType<typeof completeMeasurement>) => { r.result.fixtureKind = 'other'; },
   (r: ReturnType<typeof completeMeasurement>) => { r.result.webViewEventLoopDelaysMs.pop(); },
   (r: ReturnType<typeof completeMeasurement>) => { r.result.webViewEventLoopDelaysMs[0] = NaN; },
   (r: ReturnType<typeof completeMeasurement>) => { r.result.webViewEventLoopDelaysMs[0] = -1; },
   (r: ReturnType<typeof completeMeasurement>) => { r.result.durationsMs[0] = Infinity; },
   (r: ReturnType<typeof completeMeasurement>) => { r.result.durationsMs.pop(); },
   (r: ReturnType<typeof completeMeasurement>) => { r.result.acknowledgements[5].generation++; },
   (r: ReturnType<typeof completeMeasurement>) => { r.result.acknowledgements[5].rootBytes = 0; },
   (r: ReturnType<typeof completeMeasurement>) => { r.result.acknowledgements[5].rootBytes = 496 * 1024 + 1; },
   (r: ReturnType<typeof completeMeasurement>) => { r.result.timing.p50Ms++; },
   (r: ReturnType<typeof completeMeasurement>) => { r.result.timing.p95Ms++; },
   (r: ReturnType<typeof completeMeasurement>) => { r.result.timing.p99Ms++; },
   (r: ReturnType<typeof completeMeasurement>) => { r.result.timing.maxMs++; },
   (r: ReturnType<typeof completeMeasurement>) => { r.result.gate.p95Ms = 101; },
   (r: ReturnType<typeof completeMeasurement>) => { r.result.gate.maxMs = 501; },
   (r: ReturnType<typeof completeMeasurement>) => { r.result.account.historyDigest = '00000000'; },
   (r: ReturnType<typeof completeMeasurement>) => { r.result.account.rootBytes++; },
   (r: ReturnType<typeof completeMeasurement>) => { r.result.account.wallet++; },
   (r: ReturnType<typeof completeMeasurement>) => { r.frameTiming = 'passed'; },
  ];
  for (const mutate of mutations) { const bad = structuredClone(good);mutate(bad);assert.throws(() => validateMeasurement(bad, expected)); }
  for (const field of ['rootBytes', 'historyCommands', 'historyChunks', 'dailyProofs', 'finalRootBytes']) {
   const bad = structuredClone(good);(bad.result as Record<string, unknown>)[field] = String((bad.result as Record<string, unknown>)[field]);
   assert.throws(() => validateMeasurement(bad, expected), `wrong type ${field}`);
  }
  const stringAck = structuredClone(good);(stringAck.result.acknowledgements[0] as Record<string, unknown>).rootBytes = '1';
  assert.throws(() => validateMeasurement(stringAck, expected));
 }
});
test('all recovery and upgrade gates require full typed summaries and native measurement labels', async () => {
 const { validateResult } = await import(new URL('../scripts/android-acceptance-report.mjs', import.meta.url).href);
 const purchase = { wallet: 420, inventory: { clear: 3, rotate: 3, wildcard: 4 }, generation: 2, operationId: 'android.purchase',
  historyCommands: 127, historyDigest: '96b49d2a', rootDigest: '807a41d3', rootBytes: 9301 };
 for (const action of ['verify-crash', 'seed-upgrade', 'verify-upgrade']) {
  const phase = action === 'verify-crash' ? 'receipt-lost' : 'none';
  const result = { status: 'passed', account: purchase, ...(action === 'seed-upgrade' ? {} : { phase: 'receipt-lost', recovered: structuredClone(purchase) }) };
  const good = nativeEnvelope(action, phase, result), expected = { action, phase, nonce: good.nonce };
  assert.doesNotThrow(() => validateResult(good, expected));
  assert.throws(() => validateResult({ ...good, result: { status: 'passed' } }, expected));
  for (const field of ['pid', 'maxMainLooperDelayMs', 'webViewUserAgent', 'frameTiming', 'mainLooperMeasurement']) {
   const bad = structuredClone(good);delete (bad as Record<string, unknown>)[field];assert.throws(() => validateResult(bad, expected), field);
  }
  for (const payload of action === 'seed-upgrade' ? ['account'] : ['account', 'recovered']) {
   const absent = structuredClone(good);delete (absent.result as Record<string, unknown>)[payload];
   assert.throws(() => validateResult(absent, expected), `missing ${payload}`);
   for (const field of ['wallet', 'inventory', 'generation', 'operationId', 'historyCommands', 'historyDigest', 'rootDigest', 'rootBytes']) {
    const bad = structuredClone(good);delete ((bad.result as Record<string, unknown>)[payload] as Record<string, unknown>)[field];
    assert.throws(() => validateResult(bad, expected), `${payload}.${field}`);
   }
   for (const field of ['wallet', 'generation', 'historyCommands', 'rootBytes']) {
    for (const invalid of ['1', -1, Infinity, NaN, 1.5]) {
     const bad = structuredClone(good);((bad.result as Record<string, unknown>)[payload] as Record<string, unknown>)[field] = invalid;
     assert.throws(() => validateResult(bad, expected), `${payload}.${field} type`);
    }
   }
  }
  for (const invalid of ['', null, 123]) assert.throws(() => validateResult({ ...good, webViewUserAgent: invalid }, expected));
  for (const invalid of [-1, NaN, Infinity, '0', 501]) assert.throws(() => validateResult({ ...good, maxMainLooperDelayMs: invalid }, expected));
  assert.throws(() => validateResult({ ...good, status: 'unknown' }, expected));
  assert.throws(() => validateResult({ ...good, result: { ...result, status: 'unknown' } }, expected));
  assert.throws(() => validateResult({ ...good, frameTiming: 'passed' }, expected));
  assert.throws(() => validateResult({ ...good, mainLooperMeasurement: 'No ANR' }, expected));
  if (action !== 'seed-upgrade') assert.throws(() => validateResult({ ...good, result: { ...result, phase: 'other' } }, expected));
 }
 const unknown = nativeEnvelope('unknown', 'none', { status: 'passed', account: purchase });
 assert.throws(() => validateResult(unknown, unknown));
 const mislabeled = nativeEnvelope('verify-upgrade', 'b-after', { status: 'passed', account: purchase });
 assert.throws(() => validateResult(mislabeled, mislabeled));
});
test('nearest-rank statistics and exact gate boundary are independently recomputed from unequal samples', async () => {
 const { validateMeasurement, validateResult } = await import(new URL('../scripts/android-acceptance-report.mjs', import.meta.url).href);
 const report = completeMeasurement('normal'), expected = { action: report.action, phase: report.phase, nonce: report.nonce };
 report.result.durationsMs = Array.from({ length: 100 }, (_, index) => 100 - index);
 report.result.webViewEventLoopDelaysMs = [...report.result.durationsMs];
 report.result.timing = { p50Ms: 50, p95Ms: 95, p99Ms: 99, maxMs: 100 };
 assert.doesNotThrow(() => validateResult(report, expected));
 report.result.durationsMs[0] = 500;report.result.timing.maxMs = 500;
 assert.doesNotThrow(() => validateResult(report, expected));
 report.result.durationsMs[0] = 500.01;report.result.timing.maxMs = 500.01;report.status = 'failed';report.result.status = 'failed';
 assert.doesNotThrow(() => validateMeasurement(report, expected));assert.throws(() => validateResult(report, expected));
});
test('native acceptance builds and instruments only the application module', () => {
 const workflow = readFileSync(new URL('../.github/workflows/android.yml', import.meta.url), 'utf8');
 const jobs = workflow.split('\n  runtime:\n');
 assert.equal(jobs.length, 2);
 const [build, runtime] = jobs;
 const gradleCommands = build.match(/^\s+[.]\/gradlew[^\n]*$/gm) ?? [];
 const tasks = gradleCommands.flatMap(command => command.trim().split(/\s+/).filter(token => token.startsWith(':')));
 assert.deepEqual([...new Set(tasks)].sort(), [':app:assembleDebug', ':app:assembleDebugAndroidTest', ':app:lintDebug', ':app:testDebugUnitTest'].sort());
 assert.doesNotMatch(gradleCommands.join('\n'), /\s(?:testDebugUnitTest|lintDebug|connectedDebugAndroidTest|assembleDebugAndroidTest|assembleDebug)(?:[;\s)]|$)/);
 const script = readFileSync(new URL('../scripts/android-emulator-test.sh', import.meta.url), 'utf8');
 assert.match(script, /install -r "\$HANDOFF\/apks\/warehouse-vc1-temporary-debug[.]apk"/);
 assert.match(script, /install -r -t "\$HANDOFF\/apks\/warehouse-androidTest[.]apk"/);
 assert.match(script, /am instrument -w -r \\\n\s+io[.]github[.]nightshang[.]chache[.]test\/androidx[.]test[.]runner[.]AndroidJUnitRunner\s/);
 assert.doesNotMatch(runtime + script, /gradlew|\b(?:connectedDebugAndroidTest|assembleDebugAndroidTest|assembleDebug)\b|\bnpm(?:\s+--\S+)*\s+(?:ci|install|run)\b|build-android(?:-acceptance)?[.]mjs|sync:android/);
});
