import test from 'node:test';
import assert from 'node:assert/strict';
import {cp,mkdir,mkdtemp,readFile,readdir,rm,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {execFileSync,spawnSync} from 'node:child_process';

type Volume={path:string;writable:boolean;availableBytes:number;reason?:string};
const policy=await import(new URL('../scripts/android-emulator-probe-space.mjs',import.meta.url).href).catch(()=>null) as null|{requiredAvailableBytes:number;selectProbeVolume:(volumes:Volume[])=>Volume|null;measureProbeVolumes:(workspace:string,runnerTemp?:string)=>Promise<Volume[]>};
test('probe volume requires the actual API24+ six GiB floor, official safety factor and bounded headroom',()=>{
 assert.ok(policy,'Independent probe space policy is missing');
 const required=Math.ceil(6*1024**3*1.2)+512*1024**2;assert.equal(policy.requiredAvailableBytes,required);
 for(const availableBytes of [0,6429.05*1024**2,required-1,NaN,Infinity])assert.equal(policy.selectProbeVolume([{path:'/task-owned',writable:true,availableBytes}]),null);
 assert.equal(policy.selectProbeVolume([{path:'/task-owned',writable:true,availableBytes:required}])?.path,'/task-owned');
});
test('probe chooses only an observed writable sufficiently large existing volume',()=>{
 assert.ok(policy);const enough=policy.requiredAvailableBytes+1024;
 assert.equal(policy.selectProbeVolume([{path:'/workspace',writable:true,availableBytes:enough},{path:'/mnt',writable:false,availableBytes:enough*3},{path:'/temp',writable:true,availableBytes:enough*2}])?.path,'/temp');
 assert.equal(policy.selectProbeVolume([{path:'/mnt',writable:false,availableBytes:enough}]),null);
});
test('volume inspection is read-only and records missing locations without creating directories',async()=>{
 assert.ok(policy);const root=await mkdtemp(join(tmpdir(),'android-probe-space-'));try{
  const before=await readdir(root),volumes=await policy.measureProbeVolumes(root,join(root,'missing'));
  assert.deepEqual(await readdir(root),before);assert.equal(volumes[0].path,root);assert.equal(volumes[0].writable,true);assert.ok(volumes[0].availableBytes>0);
  const absent=volumes.find(v=>v.path===join(root,'missing'));assert.equal(absent?.writable,false);assert.ok(absent?.reason);
 }finally{await rm(root,{recursive:true,force:true});}
});
test('isolated probe has one bounded official software boot, honest artifacts and no product or security changes',async()=>{
 const script=await readFile(new URL('../scripts/android-emulator-probe.sh',import.meta.url),'utf8').catch(()=>'');
 assert.match(script,/ANDROID_I_WANT_MY_TCG=yes/);assert.match(script,/-accel off/);assert.match(script,/SECONDS\+900/);assert.equal((script.match(/launch_attempts=1/g)||[]).length,1);
 assert.match(script,/timeout 900 .*SDKMANAGER/);assert.match(script,/<\/dev\/null/);assert.match(script,/timeout 120 .*AVDMANAGER/);assert.match(script,/mktemp -d/);assert.match(script,/timeout 10 .*emu kill/);
 assert.ok(script.indexOf('space-before-install.json')<script.indexOf('"$SDKMANAGER" --channel=0'));
 assert.ok(script.lastIndexOf('space-after-install.json')>script.indexOf('"$SDKMANAGER" --channel=0'));assert.ok(script.lastIndexOf('space-after-install.json')<script.indexOf('create avd'));
 assert.doesNotMatch(script,/sudo|chmod|chown|usermod|mount\s|--licenses|-selinux|yes\s*\||\brm\s|npm|gradlew|\.apk/);
 const workflow=await readFile(new URL('../.github/workflows/android-emulator-probe.yml',import.meta.url),'utf8').catch(()=>'');
 assert.match(workflow,/dev\/android-v110-emulator-probe/);assert.match(workflow,/timeout-minutes: 35/);assert.match(workflow,/contents: read/);assert.match(workflow,/setup-java@de7274f081f381c8f8158605e0321c36c376e2e6/);assert.match(workflow,/java-version: '21'/);
 assert.doesNotMatch(workflow,/secrets\.|actions: write|workflow_dispatch|npm ci|gradlew|candidate|\.apk/);assert.match(workflow,/emulator-probe-report\.json/);assert.match(workflow,/emulator-probe-boot\.log/);
});
test('independent infrastructure branch preserves the complete release workflow byte for byte',async()=>{
 const actual=await readFile(new URL('../.github/workflows/android.yml',import.meta.url));
 const baseline=execFileSync('git',['show','2affb411ddf8a0d712f39a6a76893e40148d931d:.github/workflows/android.yml'],{cwd:new URL('..',import.meta.url)});assert.deepEqual(actual,baseline);
});

test('pure probe sparse checkout materializes exactly its two required scripts without weakening disk headroom',async()=>{
 const workflow=await readFile(new URL('../.github/workflows/android-emulator-probe.yml',import.meta.url),'utf8');
 assert.match(workflow,/sparse-checkout-cone-mode: false/);
 const patterns=/sparse-checkout: \|\n((?: {12}.*\n)+)/.exec(workflow)?.[1].trim().split('\n').map(s=>s.trim());
 assert.ok(patterns);
 assert.deepEqual(patterns,['/scripts/android-emulator-probe.sh','/scripts/android-emulator-probe-space.mjs']);assert.doesNotMatch(workflow,/^\s+filter:/m);
 assert.ok(policy);assert.equal(policy.requiredAvailableBytes,Math.ceil(6*1024**3*1.2)+512*1024**2);
 const root=await mkdtemp(join(tmpdir(),'probe-sparse-checkout-')),repo=new URL('..',import.meta.url).pathname;
 try{
  execFileSync('git',['clone','--shared','--no-checkout','--quiet',repo,root]);
  execFileSync('git',['sparse-checkout','set','--no-cone','--stdin'],{cwd:root,input:patterns.join('\n')+'\n'});
  execFileSync('git',['checkout','--quiet'],{cwd:root});
  assert.deepEqual((await readdir(root)).sort(),['.git','scripts']);assert.deepEqual((await readdir(join(root,'scripts'))).sort(),['android-emulator-probe-space.mjs','android-emulator-probe.sh']);
  for(const file of patterns)assert.deepEqual(await readFile(join(root,file.slice(1))),await readFile(join(repo,file.slice(1))));
 }finally{await rm(root,{recursive:true,force:true});}
});

async function endpointFixture(mode:string){
 // Official-tool output stubs exercise orchestration, not actual SDK/emulator acceptance.
 const repo=new URL('..',import.meta.url).pathname,parent=join(repo,'.superpowers/sdd/android-release-implementation');
 await mkdir(parent,{recursive:true});
 const root=await mkdtemp(join(parent,'endpoint-fixture-'));
 const sdk=join(root,'sdk'),log=join(root,'adb.log');
 for(const path of ['scripts','sdk/cmdline-tools/latest/bin','sdk/platform-tools','sdk/emulator','sdk/licenses','sdk/system-images/android-36/google_apis/x86_64'])await mkdir(join(root,path),{recursive:true});
 for(const file of ['android-emulator-probe.sh','android-emulator-probe-space.mjs'])await cp(join(repo,'scripts',file),join(root,'scripts',file));
 const executable=(path:string,text:string)=>writeFile(join(sdk,path),text,{mode:0o755});
 await writeFile(join(sdk,'licenses/android-sdk-license'),'unit output fixture; no real SDK installation');
 for(const path of ['emulator/source.properties','system-images/android-36/google_apis/x86_64/source.properties','system-images/android-36/google_apis/x86_64/package.xml'])await writeFile(join(sdk,path),'unit fixture');
 await executable('cmdline-tools/latest/bin/sdkmanager','#!/bin/sh\nexit 99\n');
 await executable('cmdline-tools/latest/bin/avdmanager','#!/bin/sh\nwhile [ "$#" -gt 0 ]; do if [ "$1" = --name ]; then printf "%s" "$2" > "$FIXTURE_NAME"; break; fi; shift; done\ncat >/dev/null\n');
 await executable('emulator/emulator','#!/bin/sh\nprintf started > "$FIXTURE_STARTED"\nexec sleep 30\n');
 await executable('platform-tools/adb',`#!/bin/sh
printf '%s\n' "$*" >> "$FIXTURE_LOG"
case "$*" in
 devices*) printf 'List of devices attached\n'; if [ "$FIXTURE_MODE" = occupied ]; then printf 'emulator-5554\tdevice\n'; fi;;
 *'emu avd name'*) if [ "$FIXTURE_MODE" = mismatch ] || [ -f "$FIXTURE_SWAP" ]; then printf 'UNRELATED_EXISTING_EMULATOR\nOK\n'; else cat "$FIXTURE_NAME"; printf '\nOK\n'; fi;;
 *sys.boot_completed*) printf '1\n';;
 *ro.build.version.sdk*) printf '36\n';;
 *ro.build.fingerprint*) printf 'owned-emulator-build\n'; if [ "$FIXTURE_MODE" = swap ]; then touch "$FIXTURE_SWAP"; fi;;
 *dumpsys*) printf 'owned-webview\n';;
 *'emu kill'*) printf 'ENDPOINT_KILLED\n' >> "$FIXTURE_LOG";;
esac
`);
 const result=spawnSync('bash',[join(root,'scripts/android-emulator-probe.sh')],{cwd:root,encoding:'utf8',timeout:10000,env:{...process.env,ANDROID_HOME:sdk,ANDROID_SDK_ROOT:sdk,RUNNER_TEMP:root,FIXTURE_MODE:mode,FIXTURE_NAME:join(root,'avd-name'),FIXTURE_STARTED:join(root,'started'),FIXTURE_SWAP:join(root,'swap'),FIXTURE_LOG:log}});
 return {root,result,report:JSON.parse(await readFile(join(root,'build/android-ci/emulator-probe/emulator-probe-report.json'),'utf8')),log:await readFile(log,'utf8')};
}
test('occupied reserved serial blocks before launch and never kills the existing endpoint',async()=>{
 const f=await endpointFixture('occupied');try{assert.equal(f.result.status,78,f.result.stderr);assert.equal(f.report.status,'blocked');assert.equal(f.report.launchAttempts,0);assert.doesNotMatch(f.log,/emu kill|sys.boot_completed/);}finally{await rm(f.root,{recursive:true,force:true});}
});
test('wrong or replaced runtime AVD identity cannot supply boot proof or endpoint cleanup',async()=>{
 for(const mode of ['mismatch','swap']){const f=await endpointFixture(mode);try{assert.equal(f.result.status,78,f.result.stderr);assert.equal(f.report.status,'blocked');assert.equal(f.report.launchAttempts,1);assert.doesNotMatch(f.log,/emu kill/);if(mode==='mismatch')assert.doesNotMatch(f.log,/sys.boot_completed/);}finally{await rm(f.root,{recursive:true,force:true});}}
});
test('only the unique task AVD can produce boot evidence and receive endpoint cleanup',async()=>{
 const f=await endpointFixture('owned');try{assert.equal(f.result.status,0,f.result.stderr);assert.equal(f.report.status,'booted');assert.equal(f.report.endpointOwnershipVerified,true);assert.match(f.report.expectedAvdName,/^warehouse-infra-warehouse-emulator-probe\.[A-Za-z0-9]+$/);assert.equal((f.log.match(/ENDPOINT_KILLED/g)||[]).length,1);}finally{await rm(f.root,{recursive:true,force:true});}
});
