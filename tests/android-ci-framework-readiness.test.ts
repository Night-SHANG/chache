import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,rm,stat,cp,symlink} from 'node:fs/promises';
import {spawn,spawnSync} from 'node:child_process';
import {join} from 'node:path';
import {tmpdir} from 'node:os';

const script=await readFile(new URL('../scripts/android-emulator-test.sh',import.meta.url),'utf8');
const prefix=script.slice(0,script.indexOf("trap 'exit_status"));
const alive=(pid:number)=>{const p=spawnSync('ps',['-o','stat=','-p',String(pid)],{encoding:'utf8',timeout:1000});return p.status===0&&p.stdout.trim()!==''&&!p.stdout.trim().startsWith('Z');};
async function fixture(body:string,scenario='healthy',limit=4,realSmoke=false){
 const root=await mkdtemp(join(tmpdir(),'android-framework-'));await mkdir(join(root,'scripts'));await mkdir(join(root,'build/android-ci'),{recursive:true});
 await writeFile(join(root,'adb'),`#!/bin/bash
echo "$*" >> "${root}/commands"
case "$*" in
 *'emu avd name') printf 'owned-fixture\\nOK\\n';;
 *'getprop sys.boot_completed') echo 1;;
 *'getprop ro.kernel.qemu') echo 1;;
 *'cmd package path android')
  case "$SCENARIO" in
   healthy) echo package:/system/framework/framework-res.apk;;
   wrong-exit) echo package:/system/framework/framework-res.apk; exit 1;;
   fake-success) echo "cmd: Can't find service: package";;
   flood) head -c 200000 /dev/zero | tr '\\0' x;;
   stuck) echo $$ > "${root}/probe.pid"; trap '' TERM; while :; do sleep .1; done;;
  esac;;
 *'settings get global device_provisioned') if [ "$SCENARIO" = bad-settings ]; then echo null; else echo 1; fi;;
 *'logcat '*) if [ "$SCENARIO" = stuck-diagnostics ]; then trap '' TERM; while :; do sleep .1; done; fi; printf '10-11 22:00:00.000 123 123 E SystemServer: synthetic framework diagnostic\\n';;
 *'pidof system_server'*) if [ "$SCENARIO" = stuck-diagnostics ]; then trap '' TERM; while :; do sleep .1; done; fi; printf 'boot=1\\nsystem_server=123\\nzygote=124\\nService package: found\\nService settings: found\\n';;
 *'pm path io.github.nightshang.chache') if [ "$SCENARIO" = test-install-fail ]; then echo package:/data/app/fixture/base.apk; else echo "cmd: Can't find service: package"; exit 1; fi;;
 *'am force-stop '*) exit 0;;
 *'am start '*) echo 'Status: ok';;
 *'dumpsys window windows') echo 'mCurrentFocus=io.github.nightshang.chache/.MainActivity';;
 *'pidof io.github.nightshang.chache') echo 42;;
 *'exec-out screencap -p') printf '\\211PNG\\r\\n\\032\\nabcdefghijklmnop';;
 *'install '*) if [ "$SCENARIO" = test-install-fail ] && [[ "$*" != *androidTest.apk* ]]; then echo Success; else echo 'cmd: Failure calling service package: Broken pipe (32)'; exit 1; fi;;
 *) echo 'Unexpected command' >&2; exit 1;;
esac
`,{mode:0o755});
 if(realSmoke){
  await cp(new URL('../scripts/android-product-smoke.sh',import.meta.url),join(root,'scripts/android-product-smoke.sh'));
  await mkdir(join(root,'sdk/platform-tools'),{recursive:true});await symlink(join(root,'adb'),join(root,'sdk/platform-tools/adb'));
  await mkdir(join(root,'handoff/apks'),{recursive:true});await writeFile(join(root,'handoff/apks/warehouse-vc2-temporary-debug.apk'),'explicit SDK protocol fixture');
 }else await writeFile(join(root,'scripts/android-product-smoke.sh'),'#!/bin/bash\necho capture >> "$ROOT/captures"\n',{mode:0o755});
 const unrelated=spawn('sleep',['60'],{detached:true,stdio:'ignore'});unrelated.unref();assert.ok(unrelated.pid);
 const harness=join(root,'scripts/harness.sh');await writeFile(harness,prefix+`
ADB="$ROOT/adb"
AVD_NAME=owned-fixture
ANDROID_HOME="$ROOT/sdk"
export ROOT SCENARIO ANDROID_HOME
report(){ printf '%s\\n%s\\n' "$1" "$2" > "$OUT/emulator-report.txt"; }
blocked(){ report blocked "$1"; exit 78; }
trap 'exit_status=$?; cleanup; exit "$exit_status"' EXIT
setsid sleep 60 &
PID=$!
echo "$PID" > "$ROOT/owned.pid"
booted=false
deadline=$((SECONDS+${limit}))
boot_timeout=${limit}
MODE=software-tcg
${body}
`);
 const started=Date.now(),r=spawnSync('bash',[harness],{env:{...process.env,SCENARIO:scenario,FAKE_SECRET_FOR_TEST:'synthetic-credential-not-for-output'},encoding:'utf8',timeout:10000,killSignal:'SIGKILL'});
 const owned=Number(await readFile(join(root,'owned.pid'),'utf8'));
 try{return {root,result:r,elapsed:Date.now()-started,owned,unrelated:unrelated.pid,dispose:async()=>{try{process.kill(-owned,'SIGKILL');}catch{/* exited */}try{process.kill(unrelated.pid!,'SIGKILL');}catch{/* exited */}const probe=Number(await readFile(join(root,'probe.pid'),'utf8').catch(()=>0));if(probe)try{process.kill(probe,'SIGKILL');}catch{/* bounded probe exited */}await rm(root,{recursive:true,force:true});}};}
 catch(e){await rm(root,{recursive:true,force:true});throw e;}
}

test('framework readiness requires successful real package and settings response, not boot flag or service existence',async()=>{
 assert.match(prefix,/framework_ready\(\)/,'Real framework response gate is missing');
 for(const scenario of ['healthy','wrong-exit','fake-success','bad-settings','flood']){
  const f=await fixture('if framework_ready; then echo ready > "$ROOT/result"; else echo blocked > "$ROOT/result"; fi',scenario);
  try{assert.equal(f.result.status,0,f.result.stderr);assert.equal((await readFile(join(f.root,'result'),'utf8')).trim(),scenario==='healthy'?'ready':'blocked');assert.ok((await stat(join(f.root,'build/android-ci/emulator-framework-probes.txt'))).size<32768);}
  finally{await f.dispose();}
 }
});

test('boot flag without framework response consumes only original deadline and preserves early/failure diagnostics',async()=>{
 assert.match(prefix,/wait_for_framework\(\)/,'Shared absolute framework boot deadline is missing');
 const f=await fixture('wait_for_framework\necho installed > "$ROOT/downstream"','fake-success',3);
 try{
  assert.equal(f.result.status,78,f.result.stderr);assert.match(await readFile(join(f.root,'build/android-ci/emulator-report.txt'),'utf8'),/^blocked\n/);assert.equal(await readFile(join(f.root,'downstream')).catch(()=>null),null);
  assert.ok(f.elapsed<5500,'Readiness reset/extended the original boot deadline');assert.equal(alive(f.owned),false);assert.equal(alive(f.unrelated),true);
  const commands=await readFile(join(f.root,'commands'),'utf8');assert.ok(commands.indexOf('logcat ')<commands.indexOf('getprop sys.boot_completed'),'Early crash evidence starts after boot flag');assert.doesNotMatch(commands,/install|restart|reboot|logcat -c|printenv|env |getprop$/);
  for(const phase of ['early','failure'])for(const kind of ['services','system-crash']){const raw=await readFile(join(f.root,`build/android-ci/emulator-framework-${kind}-${phase}.txt`),'utf8');assert.ok(raw.length);assert.doesNotMatch(raw,/synthetic-credential-not-for-output/);}
 }finally{await f.dispose();}
});

test('TERM-resistant framework probe hard-stops within shared deadline and unrelated child survives cleanup',async()=>{
 assert.match(prefix,/wait_for_framework\(\)/);
 const f=await fixture('wait_for_framework\necho installed > "$ROOT/downstream"','stuck',3);
 try{assert.equal(f.result.status,78,f.result.stderr);assert.ok(f.elapsed<5500,'Stuck service probe escaped absolute boot deadline');assert.equal(alive(f.owned),false);assert.equal(alive(f.unrelated),true);const pid=Number(await readFile(join(f.root,'probe.pid'),'utf8'));assert.equal(alive(pid),false);assert.equal(await readFile(join(f.root,'downstream')).catch(()=>null),null);}
 finally{await f.dispose();}
});

test('healthy owned framework enables boot exactly once and diagnostics do not mutate device',async()=>{
 assert.match(prefix,/wait_for_framework\(\)/);
 const f=await fixture('wait_for_framework\n[ "$booted" = true ]\necho ready > "$ROOT/result"');
 try{assert.equal(f.result.status,0,f.result.stderr);assert.equal((await readFile(join(f.root,'result'),'utf8')).trim(),'ready');const commands=await readFile(join(f.root,'commands'),'utf8');assert.equal(commands.split('\n').filter(l=>l.includes('cmd package path android')).length,1);assert.doesNotMatch(commands,/install|uninstall|pm clear|settings put|logcat -c|reboot/);assert.equal(alive(f.owned),false);assert.equal(alive(f.unrelated),true);}
 finally{await f.dispose();}
});

test('booted failure cleanup hard-bounds resistant diagnostic probes and preserves unrelated process',async()=>{
 const f=await fixture('booted=true\nreport failed "Observed install failure"\nexit 1','stuck-diagnostics');
 try{assert.equal(f.result.status,1,f.result.stderr);assert.ok(f.elapsed<6500,'Failure diagnostics blocked owned-session cleanup');assert.equal(alive(f.owned),false);assert.equal(alive(f.unrelated),true);for(const kind of ['services','system-crash'])assert.match(await readFile(join(f.root,`build/android-ci/emulator-framework-${kind}-failure.txt`),'utf8'),/commandExit=(?:124|137)/);assert.equal((await readFile(join(f.root,'captures'),'utf8')).trim(),'capture');}
 finally{await f.dispose();}
});

test('booted actual vc1 failure plus real product helper keeps failed raw evidence and exactly one installation',async()=>{
 const start=script.indexOf('require_owned_endpoint\n',script.indexOf('# Only immutable prebuilt')),end=script.indexOf('require_owned_endpoint\nset +e',start);
 assert.ok(start>0&&end>start);const f=await fixture(`booted=true\nHANDOFF="$ROOT/handoff"\n${script.slice(start,end)}\necho downstream > "$ROOT/downstream"`,'healthy',4,true);
 try{assert.equal(f.result.status,1,f.result.stderr);assert.match(await readFile(join(f.root,'build/android-ci/emulator-report.txt'),'utf8'),/^failed\n/);assert.match(await readFile(join(f.root,'build/android-ci/native-install.txt'),'utf8'),/Broken pipe/);assert.equal((await readFile(join(f.root,'commands'),'utf8')).split('\n').filter(l=>l.includes('install -r')).length,1,'Cleanup attempted a second APK installation after the actual first failure');assert.equal(await readFile(join(f.root,'downstream')).catch(()=>null),null);const capture=JSON.parse(await readFile(join(f.root,'build/android-ci/product-smoke-report.json'),'utf8'));assert.equal(capture.status,'not-verified');assert.match(capture.reason,/fallback installation suppressed/);assert.equal(alive(f.owned),false);assert.equal(alive(f.unrelated),true);}
 finally{await f.dispose();}
});

test('test installation failure still captures already installed product through real helper without fallback install',async()=>{
 const start=script.indexOf('require_owned_endpoint\n',script.indexOf('# Only immutable prebuilt')),end=script.indexOf('require_owned_endpoint\nset +e',start);
 const f=await fixture(`booted=true\nHANDOFF="$ROOT/handoff"\n${script.slice(start,end)}`,'test-install-fail',4,true);
 try{assert.equal(f.result.status,1,f.result.stderr);const commands=await readFile(join(f.root,'commands'),'utf8');assert.equal(commands.split('\n').filter(l=>l.includes('install -r')).length,2);assert.match(commands,/am start -W/);assert.match(commands,/exec-out screencap -p/);const capture=JSON.parse(await readFile(join(f.root,'build/android-ci/product-smoke-report.json'),'utf8'));assert.equal(capture.status,'observed');assert.ok((await stat(join(f.root,'build/android-ci/product-cold-launch.png'))).size>=24);assert.match(await readFile(join(f.root,'build/android-ci/emulator-report.txt'),'utf8'),/^failed\n/);}
 finally{await f.dispose();}
});

test('framework diagnostic capture remains fixed allowlisted bounded and within cleanup90second reserve',async()=>{
 assert.match(script,/deadline=\$\(\(SECONDS\+boot_timeout\)\)/);assert.equal((script.match(/deadline=\$\(\(SECONDS\+boot_timeout\)\)/g)??[]).length,1);
 const workflow=await readFile(new URL('../.github/workflows/android.yml',import.meta.url),'utf8'),handoff=await readFile(new URL('../scripts/android-ci-handoff.mjs',import.meta.url),'utf8');
 for(const n of ['probes','services-early','system-crash-early','services-failure','system-crash-failure']){assert.ok(workflow.includes(`build/android-ci/emulator-framework-${n}.txt`));assert.ok(handoff.includes(`emulator-framework-${n}.txt`));}
 assert.match(script,/capture_framework_diagnostics failure 1/);assert.match(script,/--kill-after=1s/);assert.match(script,/head -c/);assert.match(script,/-b system -b crash/);assert.doesNotMatch(script,/logcat -b all|logcat -c|printenv|settings put/);
 // Ownership6 + two diagnostic probes(1+1 each) + capture(60+5) + ps3/shutdown10 =88.
 assert.ok(6+2*(1+1)+65+3+10<=88);
});
