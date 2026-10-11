// Read-only comparison of the unchanged v1.0.10 account engine and this branch.
// Archives into a disposable directory; never edits or installs into the restored backup.
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
const root = fileURLToPath(new URL('..', import.meta.url));
const baseline = '51b07d03db07dd20f4f032bfeab0bd8f9cc1e8cd';
const temporary = mkdtempSync(join(tmpdir(), 'warehouse-account-baseline-'));
const original = join(temporary, 'original');mkdirSync(original);
const archive = execFileSync('git', ['archive', baseline], { cwd: root, maxBuffer: 64 * 1024 * 1024 });
execFileSync('tar', ['-x', '-C', original], { input: archive });
mkdirSync(join(original, 'tests/android'), { recursive: true });
copyFileSync(join(root, 'tests/android/acceptance-fixtures.ts'), join(original, 'tests/android/acceptance-fixtures.ts'));
const trace = JSON.parse(readFileSync(join(root, 'tests/fixtures/inbound-v9-golden.json'), 'utf8'))[1];
const iterations = Number(process.argv[2] ?? 100);
if (!Number.isInteger(iterations) || iterations < 1 || iterations > 100) throw Error('Iterations must be 1..100');
const out = join(root, 'build/android-ci');mkdirSync(out, { recursive: true });
const measurements = [];
for (const [label, folder] of [['original-v1.0.10', original], ['android-branch', root]]) {
 const entry = join(temporary, `${label}.mjs`), bundled = join(temporary, `${label}.bundle.mjs`);
 writeFileSync(entry, `import { measureStress } from ${JSON.stringify(join(folder, 'tests/android/acceptance-fixtures.ts'))};
class MemoryStorage { values = new Map();get(key){return this.values.get(key) ?? null;}set(key,value){this.values.set(key,value);}remove(key){this.values.delete(key);}listKeys(prefix){return [...this.values.keys()].filter(key=>key.startsWith(prefix)).sort();} }
const reports = [];
for (const variant of ['normal','realistic','extreme']) reports.push(await measureStress(new MemoryStorage(), ${iterations}, variant, ${JSON.stringify(trace)}));
console.log(JSON.stringify(reports));\n`);
 await build({ entryPoints: [entry], outfile: bundled, bundle: true, platform: 'node', target: 'node24', format: 'esm', nodePaths: [join(root, 'node_modules')],
  define: { __PLAYTEST_FREE_SHOP__: 'false', __DEV_DIAGNOSTICS__: 'false' } });
 console.log(`Measuring ${label}: ${iterations} transactions for each fixture, excluding fixture generation.`);
 const reports = JSON.parse(execFileSync(process.execPath, [bundled], { cwd: temporary, timeout: 30 * 60 * 1000, maxBuffer: 8 * 1024 * 1024, encoding: 'utf8' }));
 measurements.push({ label, reports });
 writeFileSync(join(out, `node-baseline-${label}.json`), JSON.stringify({ label, nativeEvidence: false, reports }, null, 2) + '\n');
}
const current = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
const hashes = ['src/application/account-store.ts', 'src/application/account-service.ts', 'src/application/history-store.ts'].map(path => {
 const hash = folder => createHash('sha256').update(readFileSync(join(folder, path))).digest('hex');
 return { path, baselineSha256: hash(original), currentSha256: hash(root), identical: hash(original) === hash(root) };
});
const fixtureComparisons = measurements[0].reports.map((before, i) => {
 const after = measurements[1].reports[i];
 if (before.account.rootDigest !== after.account.rootDigest || before.rootBytes !== after.rootBytes || before.historyCommands !== after.historyCommands) throw Error('Compared fixtures differ');
 return { variant: before.variant, identicalFinalAccount: true, baselineTiming: before.timing, currentTiming: after.timing };
});
const report = { schema: 1, sourceHashes: hashes, fixtureComparisons, kind: 'Node-only engine comparison; no Android bridge or native durability claim', baselineCommit: baseline,
 currentCommit: current, currentFixtureWorkingTree: true, iterations, sameFixtureHelper: true, excludesFixtureGeneration: true, measurements };
writeFileSync(join(out, 'node-baseline-comparison.json'), JSON.stringify(report, null, 2) + '\n');
console.log('Wrote Node-only baseline comparison. Native acceptance remains independent.');
