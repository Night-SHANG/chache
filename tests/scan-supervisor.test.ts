import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn, spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';

const supervisor = resolve('qa/large-scan/supervisor.mjs');
const workerSource = String.raw`
import fs from 'node:fs';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
const args = process.argv.slice(2);
const arg = name => args[args.indexOf(name) + 1];
const manifest = JSON.parse(fs.readFileSync(arg('--manifest'), 'utf8'));
const start = Number(arg('--batch-start')), count = Number(arg('--batch-count'));
const mode = process.env.SCAN_FIXTURE_MODE || 'success';
const emit = event => fs.writeSync(1, JSON.stringify(event) + '\n');
const rows = [];
if (mode === 'inherited_pipe') { spawn(process.execPath, ['-e','setTimeout(()=>{},1800)'], {stdio:['ignore',1,2]}); process.exit(9); }
if (mode === 'ignore_sigterm') process.on('SIGTERM',()=>{});
if (mode === 'startup_hang') while (true) {}
if (mode === 'memory') {
  const bytes = Buffer.alloc(80 * 1024 * 1024, 1);
  emit({type:'runStart',seedIndex:start,seed:100+start,strategy:'random',botSeed:4,upgradeSeed:5});
  setInterval(() => fs.writeSync(2, String(bytes[0])), 500);
} else {
for (let seedIndex = start; seedIndex < start + count; seedIndex++) {
 for (const strategy of manifest.strategies) {
  emit({type:'runStart',seedIndex,seed:100+seedIndex,strategy,botSeed:4,upgradeSeed:5});
  if (mode === 'unicode_oversize') { emit({type:'command',commandIndex:0,command:{type:'place',payload:'汉'.repeat(400000)}}); while(true){} }
  emit({type:'command',commandIndex:mode==='bad_protocol'?9:0,command:{type:'place',pieceId:'p',origin:{x:1,y:2}}});
  if (mode === 'disk_growth') { const block=Buffer.alloc(65536,1); while(true){fs.appendFileSync(arg('--output')+'.growth',block);const next=Date.now()+25;while(Date.now()<next){}} }
  if (mode === 'bounded_hang') { const end=Date.now()+1800; while(Date.now()<end){} process.exit(0); }
  if (mode === 'hang' || mode === 'ignore_sigterm' || (mode === 'hang_second' && start > 0)) while (true) {}
  if (mode === 'worker_failure') { fs.writeFileSync(arg('--output')+'.failure.json',JSON.stringify({error:'fixture exception',commands:[{type:'place'}],rawState:{phase:'playing'}})); process.exit(1); }
  if (mode === 'exit') process.exit(9);
  const row = {seedIndex,seed:(mode==='seed_mismatch'?200:100)+seedIndex,strategy,botSeed:mode==='bot_mismatch'?999:4,upgradeSeed:mode==='upgrade_mismatch'?999:5,campaignId:manifest.campaignId,status:mode==='capped'?'capped':'won',commands:1};
  if (mode === 'missing_rng') delete row.botSeed;
  rows.push(row);
  emit({type:'runDone',seedIndex,strategy});
 }
}
if (mode === 'duplicate') rows[1] = rows[0];
if (mode === 'missing') rows.pop();
const data = rows.map(row => JSON.stringify(row)).join('\n') + '\n';
fs.writeFileSync(arg('--output'), data, {flag:'wx'});
const fd = fs.openSync(arg('--output'), 'r'); fs.fsyncSync(fd); fs.closeSync(fd);
if (mode === 'stats') fs.writeFileSync(arg('--output')+'.stats.json',JSON.stringify({wallMs:12,cpuUserMs:3,cpuSystemMs:1,maxRssKiB:40000}));
if (mode === 'mutate_original' && start === 0) { const original = JSON.parse(fs.readFileSync(process.env.SCAN_ORIGINAL_MANIFEST,'utf8')); original.campaignId='mutated'; fs.writeFileSync(process.env.SCAN_ORIGINAL_MANIFEST,JSON.stringify(original)); }
emit({type:'batchDone',runs:rows.length,...(mode==='stats'?{wallMs:12,cpuUserMs:3,cpuSystemMs:1,maxRssKiB:40000}:{}),sha256:mode==='bad_hash'?'0'.repeat(64):createHash('sha256').update(data).digest('hex')});
if (mode === 'exit_after_done') process.exit(9);
}
`;

function fixture(overrides: Record<string, unknown> = {}) {
 const root = mkdtempSync(join(tmpdir(), 'scan-supervisor-'));
 const manifest = join(root, 'manifest.json'), worker = join(root, 'worker.mjs'), output = join(root, 'output');
 writeFileSync(manifest, JSON.stringify({protocolVersion:1,campaignId:'fixture',totalSeeds:2,strategies:['random','greedy','route'],batchSize:1,workerTimeoutMs:1500,maxRssMiB:512,gameCommit:'2f069901b69ecec8fcfbc0383c15fcf1ab7b7fc7',rulesetVersion:3,sourceSha256:'a'.repeat(64),...overrides}));
 writeFileSync(worker, workerSource);
 const args = ['--manifest',manifest,'--output',output,'--worker',worker];
 const run = (mode = 'success', resume = false) => spawnSync(process.execPath, [supervisor,...args,...(resume?['--resume']:[])], {encoding:'utf8',env:{...process.env,SCAN_FIXTURE_MODE:mode,SCAN_ORIGINAL_MANIFEST:manifest},timeout:10000});
 const json = (file: string) => JSON.parse(readFileSync(join(output,file),'utf8'));
 return {root,manifest,worker,output,args,run,json,cleanup:()=>rmSync(root,{recursive:true,force:true})};
}

test('scan supervisor commits paired batches only after a verified zero-exit worker', () => {
 const f=fixture();
 try {
  const result=f.run(); assert.equal(result.status,0,result.stderr);
  const checkpoint=f.json('checkpoint.json'), progress=f.json('progress.json');
  assert.equal(checkpoint.completedRuns,6); assert.equal(checkpoint.completedBatches.length,2); assert.equal(checkpoint.nextSeedIndex,2);
  assert.equal(progress.status,'completed'); assert.equal(progress.completedRuns,6);
  const batch=readFileSync(join(f.output,'batches/000000-000000.jsonl'),'utf8');
  assert.deepEqual(batch.trim().split('\n').map(line=>JSON.parse(line).strategy),['random','greedy','route']);
  assert.equal(checkpoint.completedBatches[0].sha256,createHash('sha256').update(batch).digest('hex'));
  const unchanged=readFileSync(join(f.output,'batches/000000-000000.jsonl'),'utf8');
  assert.equal(f.run('exit',true).status,0,'completed resume must spawn no worker');
  assert.equal(readFileSync(join(f.output,'batches/000000-000000.jsonl'),'utf8'),unchanged);
 } finally {f.cleanup();}
});

test('scan supervisor resumes an interrupted batch without recounting completed runs', () => {
 const f=fixture({workerTimeoutMs:200});
 try {
  assert.notEqual(f.run('hang_second').status,0);
  assert.equal(f.json('checkpoint.json').completedRuns,3);
  const first=readFileSync(join(f.output,'batches/000000-000000.jsonl'),'utf8');
  assert.equal(f.run('success',true).status,0);
  assert.equal(f.json('checkpoint.json').completedRuns,6);
  assert.equal(readFileSync(join(f.output,'batches/000000-000000.jsonl'),'utf8'),first);
  assert.ok(readdirSync(join(f.output,'interrupted')).length>0);
 } finally {f.cleanup();}
});

test('scan supervisor rejects corrupted completed batch bytes on resume', () => {
 const f=fixture();
 try {
  assert.equal(f.run().status,0);
  writeFileSync(join(f.output,'batches/000000-000000.jsonl'),'{}\n');
  assert.notEqual(f.run('success',true).status,0);
  assert.match(f.json('failure.json').error.message,/hash|checksum/i);
 } finally {f.cleanup();}
});

for (const mode of ['duplicate','missing','bad_hash','exit','exit_after_done','bad_protocol','capped','seed_mismatch','bot_mismatch','upgrade_mismatch','missing_rng']) {
 test(`scan supervisor refuses ${mode} output without committing the batch`, () => {
  const f=fixture();
  try {
   assert.notEqual(f.run(mode).status,0);
   assert.equal(f.json('checkpoint.json').completedRuns,0);
   assert.equal(readdirSync(join(f.output,'batches')).filter(name=>name.endsWith('.jsonl')).length,0);
   assert.ok(f.json('failure.json').error.message);
  } finally {f.cleanup();}
 });
}

test('scan supervisor external watchdog stops a synchronously hung engine and preserves the exact command', () => {
 const f=fixture({workerTimeoutMs:200});
 try {
  const before=Date.now(); const result=f.run('hang');
  assert.notEqual(result.status,0); assert.ok(Date.now()-before<4000);
  const failure=f.json('failure.json'); assert.equal(failure.error.code,'RUN_TIMEOUT');
  assert.equal(failure.currentRun.seedIndex,0); assert.equal(failure.currentRun.strategy,'random');
  assert.deepEqual(failure.commands,[{commandIndex:0,command:{type:'place',pieceId:'p',origin:{x:1,y:2}}}]);
  assert.equal(failure.manifest.campaignId,'fixture');
 } finally {f.cleanup();}
});

test('scan supervisor watchdog also covers a worker hanging before runStart', () => {
 const f=fixture({workerTimeoutMs:200});
 try {assert.notEqual(f.run('startup_hang').status,0);assert.equal(f.json('failure.json').error.code,'RUN_TIMEOUT');}
 finally {f.cleanup();}
});

test('scan supervisor memory budget is enforced by the parent with structured failure evidence', () => {
 const f=fixture({maxRssMiB:60,workerTimeoutMs:4000});
 try {
  const result=f.run('memory'); assert.notEqual(result.status,0);
  const failure=f.json('failure.json'); assert.equal(failure.error.code,'MEMORY_LIMIT');
  assert.equal(failure.resourceBudget.maxRssMiB,60); assert.ok(failure.workerResources.peakRssMiB>60);
 } finally {f.cleanup();}
});

test('scan supervisor rejects manifest mismatch before trusting checkpoint counts', () => {
 const f=fixture();
 try {
  assert.equal(f.run().status,0);
  const manifest=JSON.parse(readFileSync(f.manifest,'utf8'));manifest.campaignId='changed';writeFileSync(f.manifest,JSON.stringify(manifest));
  assert.notEqual(f.run('success',true).status,0);assert.match(f.json('failure.json').error.message,/manifest/i);
 } finally {f.cleanup();}
});

test('scan supervisor reconstructs progress from durable receipts instead of checkpoint numbers', () => {
 const f=fixture();
 try {
  assert.equal(f.run().status,0);
  writeFileSync(join(f.output,'checkpoint.json'),JSON.stringify({completedRuns:999999,nextSeedIndex:999999}));
  assert.equal(f.run('exit',true).status,0);
  assert.equal(f.json('checkpoint.json').completedRuns,6);
 } finally {f.cleanup();}
});

test('scan supervisor SIGTERM keeps committed batches and can resume cleanly', async () => {
 const f=fixture({workerTimeoutMs:5000});
 try {
  const child=spawn(process.execPath,[supervisor,...f.args],{env:{...process.env,SCAN_FIXTURE_MODE:'hang_second'},stdio:'ignore'});
  const closed=new Promise<number|null>(done=>child.on('exit',code=>done(code)));
  const deadline=Date.now()+5000;
  while(Date.now()<deadline){
   if(existsSync(join(f.output,'progress.json'))&&f.json('progress.json').currentRun?.seedIndex===1)break;
   await new Promise(done=>setTimeout(done,20));
  }
  assert.equal(f.json('progress.json').currentRun.seedIndex,1);
  child.kill('SIGTERM');assert.notEqual(await closed,0);
  assert.equal(f.json('checkpoint.json').completedRuns,3);
  assert.equal(f.json('failure.json').error.code,'INTERRUPTED');
  assert.equal(f.run('success',true).status,0);assert.equal(f.json('checkpoint.json').completedRuns,6);
 } finally {f.cleanup();}
});

test('scan supervisor attributes late capped metrics to the exact failed run trace', () => {
 const f=fixture();
 try {
  assert.notEqual(f.run('capped').status,0);
  const failure=f.json('failure.json');
  assert.equal(failure.currentRun.strategy,'random');
  const trace=readFileSync(failure.tracePath,'utf8').trim().split('\n').map(line=>JSON.parse(line));
  assert.equal(trace[0].strategy,'random');assert.equal(failure.commands.length,1);
 } finally {f.cleanup();}
});


test('scan supervisor preserves rejected protocol commands as evidence', () => {
 const f=fixture();
 try {assert.notEqual(f.run('bad_protocol').status,0);assert.equal(f.json('failure.json').protocolEvidence.event.commandIndex,9);}
 finally {f.cleanup();}
});

test('scan supervisor enforces the output disk budget and preserves its measured usage', () => {
 const f=fixture({maxDiskMiB:0.0001});
 try {assert.notEqual(f.run().status,0);const failure=f.json('failure.json');assert.equal(failure.error.code,'DISK_LIMIT');assert.ok(failure.diskBytes>100);assert.equal(failure.resourceBudget.maxDiskMiB,0.0001);}
 finally {f.cleanup();}
});

test('scan supervisor stores worker resource fields and an integrity-checked stats artifact', () => {
 const f=fixture();
 try {
  assert.equal(f.run('stats').status,0);const receipt=f.json('batches/000000-000000.receipt.json');
  assert.equal(receipt.wallMs,12);assert.equal(receipt.cpuUserMs,3);assert.equal(receipt.cpuSystemMs,1);assert.equal(receipt.maxRssKiB,40000);
  assert.equal(receipt.statsFile,'000000-000000.stats.json');assert.equal(f.json('batches/'+receipt.statsFile).wallMs,12);
  assert.equal(f.run('exit',true).status,0);
  writeFileSync(join(f.output,'batches',receipt.statsFile),'{}');assert.notEqual(f.run('success',true).status,0);
 } finally {f.cleanup();}
});

test('scan supervisor retains the worker exception and raw-state evidence', () => {
 const f=fixture();
 try {assert.notEqual(f.run('worker_failure').status,0);const failure=f.json('failure.json');assert.equal(failure.workerFailure.error,'fixture exception');assert.deepEqual(failure.workerFailure.rawState,{phase:'playing'});assert.ok(existsSync(failure.workerFailurePath));}
 finally {f.cleanup();}
});

test('scan supervisor escalates an ignored SIGTERM to SIGKILL', () => {
 const f=fixture({workerTimeoutMs:200});
 try {const start=Date.now();assert.notEqual(f.run('ignore_sigterm').status,0);assert.ok(Date.now()-start<2000);assert.equal(f.json('failure.json').error.code,'RUN_TIMEOUT');}
 finally {f.cleanup();}
});

test('scan supervisor bounds inherited pipe draining after its worker exits', () => {
 const f=fixture({workerTimeoutMs:200});
 try {const start=Date.now();assert.notEqual(f.run('inherited_pipe').status,0);assert.ok(Date.now()-start<1200);assert.equal(f.json('failure.json').error.code,'WORKER_EXIT');}
 finally {f.cleanup();}
});

test('scan supervisor gives every worker the saved immutable manifest snapshot', () => {
 const f=fixture();
 try {
  assert.equal(f.run('mutate_original').status,0);
  const row=JSON.parse(readFileSync(join(f.output,'batches/000001-000001.jsonl'),'utf8').split('\n')[0]);assert.equal(row.campaignId,'fixture');
  assert.notEqual(f.run('success',true).status,0);
 } finally {f.cleanup();}
});

test('scan supervisor reruns receipt-only work but recovers a committed batch without checkpoint', () => {
 const f=fixture();
 try {
  assert.equal(f.run().status,0);rmSync(join(f.output,'checkpoint.json'));
  assert.equal(f.run('exit',true).status,0);assert.equal(f.json('checkpoint.json').completedRuns,6);
  rmSync(join(f.output,'batches/000001-000001.jsonl'));
  assert.equal(f.run('success',true).status,0);assert.equal(f.json('checkpoint.json').completedRuns,6);
 } finally {f.cleanup();}
});

test('scan supervisor rejects protocol and metrics that agree but violate manifest seedPlan', () => {
 const f=fixture({seedPlan:{kind:'consecutive',start:1,step:1}});
 try {assert.notEqual(f.run().status,0);assert.match(f.json('failure.json').error.message,/seedPlan/i);}
 finally {f.cleanup();}
});

test('scan supervisor rejects RNG streams that violate manifest xor derivation', () => {
 const f=fixture({rngSeeds:{placementXor:0x51f15e,upgradeXor:0x6a09e667}});
 try {assert.notEqual(f.run().status,0);assert.match(f.json('failure.json').error.message,/rngSeeds/i);}
 finally {f.cleanup();}
});

test('scan supervisor kernel lock prevents concurrent writers and survives abrupt parent death', async () => {
 const f=fixture({workerTimeoutMs:1500});
 let child: ReturnType<typeof spawn>|undefined;
 try {
  child=spawn(process.execPath,[supervisor,...f.args],{env:{...process.env,SCAN_FIXTURE_MODE:'bounded_hang'},stdio:'ignore'});
  const deadline=Date.now()+3000;
  while(Date.now()<deadline){if(existsSync(join(f.output,'progress.json'))&&f.json('progress.json').currentRun)break;await new Promise(done=>setTimeout(done,20));}
  const second=f.run('success',true);assert.notEqual(second.status,0);assert.match(second.stderr,/OUTPUT_LOCKED/);
  assert.equal(f.json('progress.json').status,'running');
  const closed=new Promise(done=>child!.once('exit',done));child.kill('SIGKILL');await closed;
  // A worker orphan must finish its bounded fixture lifetime before test cleanup.
  await new Promise(done=>setTimeout(done,100));
  assert.equal(f.run('success',true).status,0);
 } finally {child?.kill('SIGTERM');f.cleanup();}
});


test('scan supervisor uses UTF-8 byte limits and still writes failure evidence for oversized Unicode', () => {
 const f=fixture({workerTimeoutMs:200});
 try {assert.notEqual(f.run('unicode_oversize').status,0);assert.equal(f.json('failure.json').error.code,'PROTOCOL_ERROR');}
 finally {f.cleanup();}
});


function processSample(pid: number): {state:string;ticks:number;startTime:string}|null {
 try {
  const raw=readFileSync(`/proc/${pid}/stat`,'utf8'),parts=raw.slice(raw.lastIndexOf(')')+2).split(' ');
  return {state:parts[0],ticks:Number(parts[11])+Number(parts[12]),startTime:parts[19]};
 } catch {return null;}
}

test('scan supervisor kernel parent-death guard kills its synchronously stuck worker before resume', async () => {
 const f=fixture({workerTimeoutMs:10000});
 let child:ReturnType<typeof spawn>|undefined, workerPid=0, workerStart='';
 try {
  child=spawn(process.execPath,[supervisor,...f.args],{env:{...process.env,SCAN_FIXTURE_MODE:'hang'},stdio:'ignore'});
  const deadline=Date.now()+4000;
  while(Date.now()<deadline){
   if(existsSync(join(f.output,'progress.json'))&&f.json('progress.json').currentRun){workerPid=f.json('progress.json').workerPid;break;}
   await new Promise(done=>setTimeout(done,20));
  }
  assert.ok(workerPid>0);workerStart=processSample(workerPid)!.startTime;
  const closed=new Promise(done=>child!.once('exit',done));child.kill('SIGKILL');await closed;
  const killDeadline=Date.now()+1800;
  while(Date.now()<killDeadline){const sample=processSample(workerPid);if(!sample||sample.state==='Z')break;await new Promise(done=>setTimeout(done,20));}
  const stopped=processSample(workerPid);
  assert.ok(!stopped||stopped.state==='Z','old synchronous worker must exit after supervisor SIGKILL');
  const ticks=stopped?.ticks;await new Promise(done=>setTimeout(done,80));
  const later=processSample(workerPid);if(later&&later.startTime===workerStart)assert.equal(later.ticks,ticks,'orphan must use no more CPU');
  assert.equal(f.run('success',true).status,0);assert.equal(f.json('checkpoint.json').completedRuns,6);
 } finally {
  child?.kill('SIGTERM');const worker=processSample(workerPid);
  if(worker&&worker.startTime===workerStart&&worker.state!=='Z')process.kill(workerPid,'SIGKILL');
  f.cleanup();
 }
});

test('scan supervisor enforces disk growth during a synchronously blocked batch', () => {
 const f=fixture({totalSeeds:1,maxDiskMiB:1,workerTimeoutMs:4000});
 try {
  const started=Date.now();assert.notEqual(f.run('disk_growth').status,0);
  const failure=f.json('failure.json');assert.equal(failure.error.code,'DISK_LIMIT');assert.ok(failure.diskBytes>1024*1024);
  assert.ok(Date.now()-started<3500,'disk monitor must run before the per-run watchdog');
  assert.equal(failure.completedRuns,0);
 } finally {f.cleanup();}
});

test('scan worker launcher refuses the startup race when its expected parent is gone', () => {
 const root=mkdtempSync(join(tmpdir(),'scan-parent-race-')),marker=join(root,'executed');
 try {
  const launcher=resolve('qa/large-scan/worker-launcher.py');
  const result=spawnSync('python3',[launcher,'--parent-pid',String(process.pid+100000),'--',process.execPath,'-e',`require('node:fs').writeFileSync(${JSON.stringify(marker)},'unsafe')`],{encoding:'utf8',timeout:2000});
  assert.notEqual(result.status,0);assert.match(result.stderr,/expected parent.*(changed|gone)|parent.*mismatch/i);assert.equal(existsSync(marker),false);
 } finally {rmSync(root,{recursive:true,force:true});}
});

test('scan worker launcher closes the real parent-died-before-prctl race', async () => {
 const root=mkdtempSync(join(tmpdir(),'scan-parent-before-guard-'));
 const marker=join(root,'executed'),info=join(root,'info.json'),errors=join(root,'stderr');
 let launchedPid=0, launchedStart='';
 try {
  const launcher=resolve('qa/large-scan/worker-launcher.py');
  const source=`const fs=require('node:fs'),{spawn}=require('node:child_process');
const fd=fs.openSync(${JSON.stringify(errors)},'a');
const child=spawn('/bin/sh',['-c','sleep 0.15; exec "$@"','delayed-guard','python3',${JSON.stringify(launcher)},'--parent-pid',String(process.pid),'--',process.execPath,'-e',${JSON.stringify(`require('node:fs').writeFileSync(${JSON.stringify(marker)},'unsafe')`)}],{stdio:['ignore','ignore',fd]});
fs.writeFileSync(${JSON.stringify(info)},JSON.stringify({workerPid:child.pid,parentPid:process.pid}));child.unref();process.exit(0);`;
  const host=spawnSync(process.execPath,['-e',source],{encoding:'utf8',timeout:2000});assert.equal(host.status,0,host.stderr);
  const details=JSON.parse(readFileSync(info,'utf8'));launchedPid=details.workerPid;launchedStart=processSample(launchedPid)?.startTime||'';
  const deadline=Date.now()+2000;
  while(Date.now()<deadline){if(readFileSync(errors,'utf8').includes('changed or is gone'))break;await new Promise(done=>setTimeout(done,20));}
  assert.match(readFileSync(errors,'utf8'),/expected parent.*changed or is gone/);assert.equal(existsSync(marker),false);
 } finally {
  const running=processSample(launchedPid);if(running&&running.startTime===launchedStart&&running.state!=='Z')process.kill(launchedPid,'SIGKILL');
  rmSync(root,{recursive:true,force:true});
 }
});

test('scan worker launcher fails closed when prctl returns an errno', () => {
 const root=mkdtempSync(join(tmpdir(),'scan-parent-guard-error-')),marker=join(root,'executed');
 try {
  const launcher=resolve('qa/large-scan/worker-launcher.py');
  const code=`import ctypes, errno, os, runpy, sys
class DeniedPrctl:
 def __call__(self, *args):
  ctypes.set_errno(errno.EPERM)
  return -1
class Libc:
 prctl=DeniedPrctl()
ctypes.CDLL=lambda *args, **kwargs: Libc()
sys.argv=[${JSON.stringify(launcher)},'--parent-pid',str(os.getppid()),'--',${JSON.stringify(process.execPath)},'-e',${JSON.stringify(`require('node:fs').writeFileSync(${JSON.stringify(marker)},'unsafe')`)}]
runpy.run_path(${JSON.stringify(launcher)},run_name='__main__')`;
  const result=spawnSync('python3',['-c',code],{encoding:'utf8',timeout:2000});
  assert.equal(result.status,125);assert.match(result.stderr,/PR_SET_PDEATHSIG failed: errno=1/);assert.equal(existsSync(marker),false);
 } finally {rmSync(root,{recursive:true,force:true});}
});
