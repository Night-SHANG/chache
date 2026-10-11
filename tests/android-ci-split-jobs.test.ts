import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,mkdir,cp,writeFile,rm} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
const read=(p:string)=>readFile(new URL('../'+p,import.meta.url),'utf8');
test('fresh runtime depends only on current build artifact with exact sparse scripts and no npm Gradle or regeneration',async()=>{
 const workflow=await read('.github/workflows/android.yml');assert.match(workflow,/  build:\n/);assert.match(workflow,/  runtime:\n/);
 const runtime=workflow.slice(workflow.indexOf('  runtime:\n'));
 assert.match(runtime,/needs: build/);assert.match(runtime,/sparse-checkout-cone-mode: false/);assert.match(runtime,/actions\/download-artifact@3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c/);assert.match(runtime,/artifact-ids: \$\{\{ needs\.build\.outputs\.artifact-id \}\}/);assert.match(runtime,/digest-mismatch: error/);
 assert.doesNotMatch(runtime,/npm\s+(?:ci|install|run)|gradlew|connectedDebugAndroidTest|build-android-acceptance|sync:android|github-token|secrets\.|actions: write/);
 const emulator=await read('scripts/android-emulator-test.sh');assert.doesNotMatch(emulator,/gradlew|build-android-acceptance|cp .*app-debug/);assert.match(emulator,/android-native-instrumentation[.]mjs/);assert.match(emulator,/am instrument -w -r/);assert.match(emulator,/ANDROID_CI_HANDOFF/);assert.match(emulator,/availableBytes<8267812045/);assert.match(emulator,/releasedAllocatedBytes\+536870912/);
});
test('build produces both immutable same-job APK versions before handoff and receipt then runtime joins separate evidence',async()=>{
 const workflow=await read('.github/workflows/android.yml'),build=workflow.slice(0,workflow.indexOf('  runtime:\n'));assert.match(build,/-PwarehouseAcceptanceVersionCode=2 :app:assembleDebug/);assert.match(build,/warehouse-vc1-temporary-debug[.]apk/);assert.match(build,/warehouse-vc2-temporary-debug[.]apk/);assert.match(build,/warehouse-androidTest[.]apk/);assert.match(build,/id: handoff/);assert.match(build,/manifest-digest/);assert.match(build,/artifact-digest/);assert.match(workflow,/android-ci-handoff[.]mjs join/);
 assert.doesNotMatch(workflow,/\.keystore|\.jks|continue-on-error/);
});

test('runtime fixture and independent capture require the unique owned AVD before touching its files',async()=>{
 const emulator=await read('scripts/android-emulator-test.sh'),driver=await read('scripts/android-device-check.sh'),smoke=await read('scripts/android-product-smoke.sh');
 assert.ok(emulator.indexOf('reject_existing_endpoint\nlaunch_attempts=1')<emulator.indexOf('PID=$!'));
 assert.match(emulator,/mktemp -d.*warehouse-runtime/);assert.match(emulator,/require_owned_endpoint/);assert.match(emulator,/booted.*true.*owns_endpoint/);
 assert.match(driver,/ANDROID_EXPECTED_AVD_NAME/);assert.match(smoke,/ANDROID_EXPECTED_AVD_NAME/);
 assert.match(emulator,/timeout.*install -r/);assert.match(emulator,/timeout.*dumpsys webviewupdate/);
});

test('emulator native-stage shell preserves parser blocked versus observed failed before downstream driver',async()=>{
 const root=await mkdtemp(join(tmpdir(),'native-stage-status-'));
 try{
  await mkdir(join(root,'scripts'));await cp(new URL('../scripts/android-native-instrumentation.mjs',import.meta.url),join(root,'scripts/android-native-instrumentation.mjs'));
  const out=join(root,'out'),handoff=join(root,'handoff');await mkdir(out);await mkdir(handoff);await writeFile(join(handoff,'manifest.json'),JSON.stringify({inventory:{tests:['demo.Native#one']}}));
  const emulator=await read('scripts/android-emulator-test.sh'),start=emulator.indexOf('if node "$ROOT/scripts/android-native-instrumentation.mjs"'),end=emulator.indexOf('APK_DIR="$HANDOFF/apks"',start);
  assert.ok(start>0&&end>start);const script=join(root,'native-stage.sh');
  await writeFile(script,`#!/bin/bash
set -euo pipefail
ROOT="${root}"
OUT="${out}"
HANDOFF="${handoff}"
native_status=0
report(){ printf '%s\n' "$1" > "$OUT/emulator-status.txt"; }
blocked(){ report blocked "$1"; exit 78; }
`+emulator.slice(start,end)+'echo reached > "$OUT/downstream-driver"\n');
  const packet=(code:number)=>`INSTRUMENTATION_STATUS: class=demo.Native\nINSTRUMENTATION_STATUS: current=1\nINSTRUMENTATION_STATUS: id=AndroidJUnitRunner\nINSTRUMENTATION_STATUS: numtests=1\nINSTRUMENTATION_STATUS: test=one\nINSTRUMENTATION_STATUS_CODE: ${code}\n`;
  for(const [raw,status,exit] of [['','blocked',78],[packet(1),'blocked',78],[packet(1)+packet(-2),'failed',1]] as [string,string,number][]){
   await writeFile(join(out,'native-instrumentation.txt'),raw);const r=spawnSync('bash',[script],{encoding:'utf8',timeout:5000});assert.equal(r.status,exit,r.stdout+r.stderr);assert.equal((await readFile(join(out,'emulator-status.txt'),'utf8')).trim(),status);assert.equal(await readFile(join(out,'downstream-driver'),'utf8').catch(()=>null),null);
  }
 }finally{await rm(root,{recursive:true,force:true});}
});
