import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import {spawn,spawnSync} from 'node:child_process';
import {join} from 'node:path';
import {tmpdir} from 'node:os';

const script=await readFile(new URL('../scripts/android-emulator-test.sh',import.meta.url),'utf8');
function running(pid:number){
 const p=spawnSync('ps',['-o','stat=','-p',String(pid)],{encoding:'utf8',timeout:1000});
 return p.status===0&&p.stdout.trim()!==''&&!p.stdout.trim().startsWith('Z');
}
async function fixture(resistant:boolean){
 const root=await mkdtemp(join(tmpdir(),'android-owned-cleanup-'));await mkdir(join(root,'scripts'));
 const prefix=script.slice(0,script.indexOf("trap 'exit_status"));
 await writeFile(join(root,'owned.sh'),`#!/bin/bash
trap ${resistant?"''":"'exit 0'"} TERM
echo ready > "${root}/ready"
while :; do sleep .1; done
`);
 await writeFile(join(root,'adb'),`#!/bin/bash
${resistant?'exit 0':''}
echo "$$" > "${root}/adb.pid"
echo endpoint-command >> "${root}/adb-called"
trap '' TERM
while :; do sleep .1; done
`,{mode:0o755});
 await writeFile(join(root,'scripts/harness.sh'),prefix+`
ADB="$ROOT/adb"
setsid bash "$ROOT/owned.sh" >/dev/null 2>&1 &
PID=$!
echo "$PID" > "$ROOT/owned.pid"
for i in {1..100}; do [ -f "$ROOT/ready" ] && break; sleep .01; done
booted=false
cleanup
echo finished > "$ROOT/finished"
`);
 const unrelated=spawn('sleep',['60'],{detached:true,stdio:'ignore'});unrelated.unref();
 assert.ok(unrelated.pid);const unrelatedPid=unrelated.pid;
 const start=Date.now(),result=spawnSync('bash',[join(root,'scripts/harness.sh')],{encoding:'utf8',timeout:resistant?15000:3000,killSignal:'SIGKILL'});
 let ownedPid:number|undefined;
 try{
  ownedPid=Number((await readFile(join(root,'owned.pid'),'utf8')).trim());
  assert.equal(result.status,0,result.stderr||result.error?.message);
  assert.equal((await readFile(join(root,'finished'),'utf8')).trim(),'finished');
  assert.equal(await readFile(join(root,'adb-called'),'utf8').catch(()=>''),'','Unknown endpoint must never receive emu kill');
  for(let i=0;i<20&&running(ownedPid);i++)await new Promise(r=>setTimeout(r,50));
  assert.equal(running(ownedPid),false,'Owned TERM-resistant session remains running');
  assert.equal(running(unrelatedPid),true,'Unrelated child was stopped');
  assert.ok(Date.now()-start<(resistant?14500:2900),'Cleanup exceeded bounded shutdown allowance');
 }finally{
  if(ownedPid)try{process.kill(-ownedPid,'SIGKILL');}catch{/* owned fixture already exited */}
  const adbPid=await readFile(join(root,'adb.pid'),'utf8').then(Number).catch(()=>0);
  if(adbPid)try{process.kill(adbPid,'SIGKILL');}catch{/* old RED fixture already exited */}
  try{process.kill(unrelatedPid,'SIGKILL');}catch{/* fixture child already exited */}
  await rm(root,{recursive:true,force:true});
 }
}
test('stalled unknown adb endpoint cannot block owned cleanup or receive an emu kill',async()=>{await fixture(false);});
test('TERM-resistant owned emulator session is forcibly stopped while unrelated child survives',async()=>{await fixture(true);});
test('capture has a hard limit and all cleanup fits the orchestration90second grace',()=>{
 assert.match(script,/timeout --signal=TERM --kill-after=5s 60s bash/);
 assert.doesNotMatch(script.slice(script.indexOf('cleanup()'),script.indexOf("trap 'exit_status")),/emu kill/);
 assert.match(script,/deadline=\$\(\(SECONDS\+10\)\)/);
 assert.match(script,/kill -KILL/);
});
