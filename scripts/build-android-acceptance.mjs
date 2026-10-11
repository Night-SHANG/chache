import { build } from 'esbuild';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('..', import.meta.url));
const out = `${root}/android/app/build/generated/acceptanceAssets`;
const trace = JSON.parse(readFileSync(`${root}/tests/fixtures/inbound-v9-golden.json`, 'utf8'))[1];
mkdirSync(out, { recursive: true });
const result = await build({ absWorkingDir: root, entryPoints: ['tests/android/acceptance-entry.ts'], outfile: `${out}/acceptance.js`,
 bundle: true, format: 'iife', target: 'es2020', platform: 'browser', metafile: true,
 define: { __PLAYTEST_FREE_SHOP__: 'false', __DEV_DIAGNOSTICS__: 'false', __ANDROID_ACCEPTANCE_TRACE__: JSON.stringify(trace) } });
writeFileSync(`${out}/bundle-inputs.json`, JSON.stringify(Object.keys(result.metafile.inputs).sort(), null, 2) + '\n');
console.log('Built separate androidTest assets; no product asset was changed.');
