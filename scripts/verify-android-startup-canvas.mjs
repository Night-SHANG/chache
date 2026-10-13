/** v118 exact Android bundle / native Canvas evidence. This is a simulated native
 * bridge, never a Chromium/CSS/WebView/phone acceptance claim. */
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {growthSourceHash} from './growth-host-support.mjs';
import {runV118PlatformTransitions} from './v118-transition-trace.mjs';
const out=resolve(process.env.ANDROID_CANVAS_QA_DIR??'qa/android-v119/host-canvas');
await mkdir(out,{recursive:true});
const manifest=JSON.parse(await readFile('build/android/build-manifest.json','utf8'));
assert.equal(manifest.sourceSha256,await growthSourceHash(),'Staged bytes must match all current source files');
const trace=await runV118PlatformTransitions({root:resolve('build'),target:'android',out});
const report={status:'PASS',version:manifest.version,...trace,browserAcceptance:'NOT RUN',cssAcceptance:'NOT RUN',nativeAndroidAcceptance:'NOT RUN',phoneAcceptance:'NOT RUN'};
await writeFile(resolve(out,'report.json'),JSON.stringify(report,null,2)+'\n');
console.log(`Android v118: ${trace.frames.length} exact-bundle frames; cold direct play, PNG completions and failures verified.`);
