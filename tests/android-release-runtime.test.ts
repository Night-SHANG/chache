import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=(p:string)=>readFileSync(p,'utf8');
test('runtime-only workflow consumes exact delivered APK without rebuilding or signing',()=>{
 const w=read('.github/workflows/android-runtime-only.yml');
 assert.match(w,/branches: \[dev\/android-v113-runtime\]/);assert.match(w,/actions: read/);
 assert.match(w,/artifact-ids: 11760973241/);assert.match(w,/run-id: 38279507392/);
 assert.match(w,/digest-mismatch: error/);assert.doesNotMatch(w,/secrets\.|npm (ci|install)|gradlew|assembleRelease|android-sign-release/);
 assert.match(w,/github.event.repository.private == true/);
});
test('runtime preserves disk safety and uses full same-API AOSP system with no host security changes',()=>{
 const s=read('scripts/android-release-runtime.sh');
 assert.match(s,/system-images;android-36;default;x86_64/);assert.match(s,/8267812045/);
 assert.match(s,/com\.android\.systemui/);assert.match(s,/dumpsys webviewupdate/);
 assert.match(s,/ANDROID_AVD_HOME/);assert.match(s,/MODE=software-tcg;.*ANDROID_I_WANT_MY_TCG=yes/);assert.match(s,/owns_endpoint/);
 assert.doesNotMatch(s,/sudo|chmod.*kvm|adb root|pm clear|uninstall|sdkmanager.*--uninstall|google_atd|aosp_atd/);
 assert.match(s,/boot_probe/);assert.match(s,/SECONDS<deadline/);assert.match(s,/pid-home/);assert.match(s,/pid-stopped/);assert.match(s,/cmp -s/);assert.match(s,/-gpu swiftshader /);assert.match(s,/launch cold-launch/);assert.match(s,/launch resume/);assert.match(s,/launch restart/);assert.match(s,/product-\$phase\.png/);
});
test('runtime records a block before touching devices when official SDK is absent',async()=>{
 const{mkdtemp,mkdir,writeFile,readFile,rm}=await import('node:fs/promises');const{tmpdir}=await import('node:os');const{join}=await import('node:path');const{spawnSync}=await import('node:child_process');
 const dir=await mkdtemp(join(tmpdir(),'android-v113-runtime-test-'));
 try{
  await mkdir(join(dir,'scripts'));await writeFile(join(dir,'scripts/android-release-runtime.sh'),read('scripts/android-release-runtime.sh'));
  const r=spawnSync('bash',[join(dir,'scripts/android-release-runtime.sh')],{encoding:'utf8',env:{PATH:process.env.PATH,ANDROID_HOME:join(dir,'missing-sdk'),RUNNER_TEMP:dir},timeout:10000});
  assert.equal(r.status,78,r.stderr);const report=JSON.parse(await readFile(join(dir,'build/android-runtime-only/runtime-result.json'),'utf8'));assert.equal(report.status,'blocked');assert.match(report.reason,/Official SDK tools unavailable/);assert.equal(report.hostSecurityChanges,false);
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('runtime rejects an already occupied emulator endpoint before SDK installation',async()=>{
 const{mkdtemp,mkdir,writeFile,readFile,rm}=await import('node:fs/promises');const{tmpdir}=await import('node:os');const{join}=await import('node:path');const{spawnSync}=await import('node:child_process');
 const dir=await mkdtemp(join(tmpdir(),'android-v113-runtime-owner-'));
 try{
  for(const p of ['scripts','sdk/platform-tools','sdk/cmdline-tools/latest/bin','sdk/licenses'])await mkdir(join(dir,p),{recursive:true});
  await writeFile(join(dir,'scripts/android-release-runtime.sh'),read('scripts/android-release-runtime.sh'));
  await writeFile(join(dir,'sdk/platform-tools/adb'),"#!/bin/sh\nprintf 'List of devices attached\\nemulator-5554 device\\n'\n",{mode:0o755});
  for(const tool of ['sdkmanager','avdmanager'])await writeFile(join(dir,'sdk/cmdline-tools/latest/bin',tool),'#!/bin/sh\nexit 99\n',{mode:0o755});
  await writeFile(join(dir,'sdk/licenses/android-sdk-license'),'existing-fixture');
  const r=spawnSync('bash',[join(dir,'scripts/android-release-runtime.sh')],{encoding:'utf8',env:{PATH:process.env.PATH,ANDROID_HOME:join(dir,'sdk'),RUNNER_TEMP:dir},timeout:10000});
  assert.equal(r.status,78,r.stderr);const report=JSON.parse(await readFile(join(dir,'build/android-runtime-only/runtime-result.json'),'utf8'));assert.match(report.reason,/endpoint already occupied/);assert.equal(report.stage,'preflight');
 }finally{await rm(dir,{recursive:true,force:true});}
});
