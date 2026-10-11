import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,mkdir,cp,writeFile,rm} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

const read=(p:string)=>readFile(new URL('../'+p,import.meta.url),'utf8');
test('software selects explicit functional scope while hardware preserves the complete timing matrix',async()=>{
 const emulator=await read('scripts/android-emulator-test.sh'),driver=await read('scripts/android-device-check.sh');
 assert.match(emulator,/ACCEPTANCE_SCOPE=full/);assert.match(emulator,/ACCEPTANCE_SCOPE=functional-only/);
 assert.match(emulator,/ANDROID_ACCEPTANCE_SCOPE="\$ACCEPTANCE_SCOPE"/);
 assert.match(driver,/SCOPE="\$\{ANDROID_ACCEPTANCE_SCOPE:-full\}"/);
 assert.match(driver,/if \[ "\$SCOPE" = full \]; then/);
 assert.match(driver,/for variant in normal realistic extreme/);assert.match(driver,/timeout 1500/);
 assert.match(await read('scripts/android-device-summary.mjs'),/not-run/);assert.match(driver,/functional-only/);
});
test('bounded emulator timeout reserves receipt and artifact time and preserves cleanup capture',async()=>{
 const workflow=await read('.github/workflows/android.yml'),emulator=await read('scripts/android-emulator-test.sh');
 assert.match(workflow,/timeout-minutes: 120/);assert.match(workflow,/ANDROID_CI_JOB_STARTED_AT/);
 assert.match(workflow,/timeout --signal=TERM --kill-after=90s/);assert.match(workflow,/remaining=.*300/);
 assert.match(emulator,/trap '.*124.*' TERM/);assert.match(emulator,/setsid "\$EMULATOR"/);assert.match(emulator,/timeout --signal=TERM --kill-after=5s 60s bash "\$ROOT\/scripts\/android-product-smoke.sh"/);
 assert.match(workflow,/if: always\(\) && steps\.compile\.outcome == 'success' && steps\.regression\.outcome == 'success'/);
});
test('functional driver failure writes explicit unrun timing and failed preflight without inventing recovery',async()=>{
 const root=await mkdtemp(join(tmpdir(),'android-functional-driver-'));
 try{
  await mkdir(join(root,'scripts'));for(const name of ['android-device-check.sh','android-device-summary.mjs','android-acceptance-report.mjs'])await cp(new URL('../scripts/'+name,import.meta.url),join(root,'scripts',name));
  const out=join(root,'out'),run=spawnSync('bash',[join(root,'scripts/android-device-check.sh')],{env:{...process.env,ANDROID_ACCEPTANCE_SCOPE:'functional-only',ANDROID_ACCEPTANCE_OUT:out},encoding:'utf8'});
  assert.equal(run.status,1);const summary=JSON.parse(await readFile(join(out,'summary.json'),'utf8'));
  assert.equal(summary.status,'failed');assert.equal(summary.scope,'functional-only');assert.equal(summary.stage,'preflight');
  assert.equal(summary.recovery,'not-run');assert.equal(summary.upgrade,'not-run');
  for(const n of ['normal','realistic','extreme'])assert.equal(summary.performance[n].status,'not-run');
  assert.equal(summary.commandExitCode,1);
  await writeFile(join(root,'marker'),'self-contained fixture');
 }finally{await rm(root,{recursive:true,force:true});}
});


test('TERM timeout retains an actual partial driver summary instead of dropping unrun categories',async()=>{
 const root=await mkdtemp(join(tmpdir(),'android-functional-term-'));
 try{
  await mkdir(join(root,'scripts'));for(const name of ['android-device-check.sh','android-device-summary.mjs','android-acceptance-report.mjs'])await cp(new URL('../scripts/'+name,import.meta.url),join(root,'scripts',name));
  const sdk=join(root,'sdk');for(const d of ['platform-tools','build-tools/35.0.0'])await mkdir(join(sdk,d),{recursive:true});
  await writeFile(join(sdk,'platform-tools/adb'),'#!/bin/sh\nsleep 30\n',{mode:0o755});
  for(const name of ['aapt','apksigner'])await writeFile(join(sdk,'build-tools/35.0.0',name),'#!/bin/sh\nexit 0\n',{mode:0o755});
  const apks=['one.apk','two.apk','test.apk'].map(n=>join(root,n));for(const p of apks)await writeFile(p,'unit fixture');
  const out=join(root,'out'),run=spawnSync('timeout',['--signal=TERM','--kill-after=2s','1s','bash',join(root,'scripts/android-device-check.sh'),'--disposable-emulator',...apks],{env:{...process.env,ANDROID_HOME:sdk,ANDROID_SERIAL:'emulator-5554',ANDROID_ACCEPTANCE_SCOPE:'functional-only',ANDROID_ACCEPTANCE_OUT:out},encoding:'utf8',timeout:5000});
  assert.equal(run.status,124,run.stderr);const summary=JSON.parse(await readFile(join(out,'summary.json'),'utf8'));
  assert.equal(summary.status,'failed');assert.equal(summary.commandExitCode,124);assert.equal(summary.recovery,'not-run');assert.equal(summary.upgrade,'not-run');
  for(const n of ['normal','realistic','extreme'])assert.equal(summary.performance[n].status,'not-run');
 }finally{await rm(root,{recursive:true,force:true});}
});

test('isolated owned emulator process survives orchestration TERM long enough for bounded capture cleanup',async()=>{
 const root=await mkdtemp(join(tmpdir(),'android-capture-term-'));
 try{
  const script=join(root,'supervisor.sh');await writeFile(script,`#!/bin/bash
setsid sleep 30 &
pid=$!
trap 'kill -0 "$pid" && echo alive > "$1"; kill "$pid"' EXIT
trap 'exit 124' TERM
while :; do sleep .1; done
`);
  const marker=join(root,'capture-context'),run=spawnSync('timeout',['--signal=TERM','--kill-after=2s','1s','bash',script,marker],{encoding:'utf8',timeout:5000});
  assert.equal(run.status,124,run.stderr);assert.equal((await readFile(marker,'utf8')).trim(),'alive');
 }finally{await rm(root,{recursive:true,force:true});}
});
test('cache wiring isolates before first package command and logs real postboot re-download headroom',async()=>{
 const workflow=await read('.github/workflows/android.yml'),emulator=await read('scripts/android-emulator-test.sh');
 assert.ok(workflow.indexOf('android-ci-cache.mjs init')<workflow.indexOf('npm install --global'));
 assert.ok(workflow.indexOf('android-test-report.mjs run')<workflow.indexOf('android-ci-cache.mjs release'));
 assert.ok(workflow.indexOf('android-ci-cache.mjs release')<workflow.indexOf('bash scripts/android-emulator-test.sh'));
 for(const name of ['cache-init-report','cache-report','space-preinstall','space-postinstall','space-postboot'])assert.ok(workflow.includes('build/android-ci/'+name+'.json'));
 assert.match(emulator,/availableBytes<8267812045/);assert.match(emulator,/releasedAllocatedBytes\+536870912/);
});
