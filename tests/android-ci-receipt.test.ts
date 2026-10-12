import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {cp,mkdtemp,mkdir,readFile,readdir,rm,symlink,writeFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {FaultStorage} from './helpers/account-fixtures.ts';
import * as fixture from './android/acceptance-fixtures.ts';

const ci=await import(new URL('../scripts/android-ci-evidence.mjs',import.meta.url).href).catch(()=>null) as null|{
 parseApkIdentity:(badging:string)=>{versionCode:number};
 candidateFileName:(code:number,commit:string)=>string;
 parseSourceMapping:(message:string,tree:string)=>{localCommit:string|null;status:string};
 aggregateAcceptanceStatus:(...reports:{status:string}[])=>string;
 inspectAcceptanceEvidence:(root:string,certificate:string,version:number,scope?:string)=>Promise<{status:string;storageRecovery:string;sameSignatureUpgrade:string;performance:Record<string,{status:string}>;reason?:string}>;
 readJUnitEvidence:(root:string,reports:string,source:string,driver?:boolean)=>Promise<{status:string;tests?:number;cases?:Record<string,string>;counts?:Record<string,number>;caseEvidence?:Record<string,{errors:unknown[];failures:unknown[]}>;checksums?:unknown[];reason?:string}>;
};
const certificate='a'.repeat(64),base='1234567890.123';
const trace=JSON.parse(await readFile(new URL('./fixtures/inbound-v9-golden.json',import.meta.url),'utf8'))[1];
const envelope=(action:string,phase:string,nonce:string,result:unknown,pid=124)=>({schema:1,status:'passed',action,phase,nonce,pid,maxMainLooperDelayMs:0,webViewUserAgent:'unit protocol fixture',frameTiming:'not-measured',mainLooperMeasurement:'Handler scheduling delay; not frame timing or an ANR detector',result});
const seeds=new Map<boolean,Promise<{root:string;out:string}>>(),seedPaths:string[]=[];
after(async()=>{for(const path of seedPaths)await rm(path,{recursive:true,force:true});});
async function buildEvidenceSeed(failedTiming=false){
 const root=await mkdtemp(join(tmpdir(),'android-ci-evidence-')),out=join(root,'build/android-ci/device-acceptance');await mkdir(out,{recursive:true});
 seedPaths.push(root);
 const write=(name:string,value:unknown)=>writeFile(join(out,name+'.json'),JSON.stringify(value));
 for(const phase of fixture.CRASH_PHASES){
  const storage=new FaultStorage();fixture.seedRecovery(storage,trace,phase==='receipt-lost');
  let atDeath=new Map<string,string>();
  try{fixture.startCrash(storage,trace,phase,()=>{atDeath=new Map(storage.values);throw Error('protocol fixture checkpoint');});}catch{/* unit fixture only */}
  storage.values=atDeath;
  await write('crash-'+phase,{schema:1,status:'checkpoint',action:'seed-crash',phase,reached:phase,nonce:base+'.crash.'+phase,pid:123});
  await write('recover-'+phase,envelope('verify-crash',phase,base+'.recover-'+phase,fixture.verifyRecovery(storage,trace,phase)));
 }
 const storage=new FaultStorage(),before=envelope('seed-upgrade','none',base+'.upgrade-before',fixture.seedUpgrade(storage,trace),125),after=envelope('verify-upgrade','none',base+'.upgrade-after',fixture.verifyUpgrade(storage,trace),126);
 await write('upgrade-before',before);await write('upgrade-after',after);
 const facts={normal:{rootBytes:1037,finalRootBytes:1276,historyCommands:0,historyChunks:0,dailyProofs:0,historyDigest:'741638a5',inventory:{clear:0,rotate:0,wildcard:0},fixtureKind:'normal account without a run history'},realistic:{rootBytes:61272,finalRootBytes:61510,historyCommands:150,historyChunks:1,dailyProofs:1460,historyDigest:'6d2f8944',inventory:{clear:3,rotate:2,wildcard:4},fixtureKind:'real replayed golden history plus 1460 valid daily-paid proofs'},extreme:{rootBytes:502772,finalRootBytes:503011,historyCommands:16384,historyChunks:128,dailyProofs:12531,historyDigest:'a7efd621',inventory:{clear:0,rotate:0,wildcard:0},fixtureKind:'schema-valid synthetic closed history and valid historical daily proofs'}};
 const performance:Record<string,unknown>={};
 for(const [variant,f]of Object.entries(facts)){
  const duration=failedTiming&&variant!=='normal'?501:1,status=duration<=100?'passed':'failed';
  const result={...f,variant,status,iterations:100,finiteHistoryMaximum:false,limit:'No finite history limit exists; this specified fixture is not the longest possible history.',durationsMs:Array(100).fill(duration),webViewEventLoopDelaysMs:Array(100).fill(duration+1),acknowledgements:Array.from({length:100},(_,i)=>({generation:i+2,rootBytes:f.finalRootBytes})),timing:{p50Ms:duration,p95Ms:duration,p99Ms:duration,maxMs:duration},gate:{p95Ms:100,maxMs:500},account:{wallet:500,inventory:f.inventory,generation:101,operationId:'android.timing.99',historyCommands:f.historyCommands,historyDigest:f.historyDigest,rootDigest:'1234abcd',rootBytes:f.finalRootBytes}};
  const report={...envelope('performance',variant,base+'.performance-'+variant,result),status};performance[variant]=report;await write('performance-'+variant,report);
 }
 const anr={schema:1,status:'passed',observation:'no target ANR event observed in events buffer during driver',observedEvents:[],frameTiming:'not-measured',eventBufferMayBeBounded:true};await write('anr-report',anr);
 const summary={schema:1,status:failedTiming?'failed':'passed',anr,frameTiming:'not-measured',target:'explicit-disposable-emulator',applicationId:'io.github.nightshang.chache',fromVersionCode:1,toVersionCode:2,certificateSha256:certificate,processDeathPhases:[...fixture.CRASH_PHASES],recovery:'passed',upgrade:'passed',performance,physicalPhone:'not-verified',audibleOutput:'not-verified',finiteHistoryMaximum:false};await write('summary',summary);
 for(const name of ['apk-vc1','apk-vc2','test-apk'])await writeFile(join(out,name+'-signature.txt'),`Signer #1 certificate SHA-256 digest: ${certificate}\n`);
 for(const code of [1,2])await writeFile(join(out,`apk-vc${code}-badging.txt`),`package: name='io.github.nightshang.chache' versionCode='${code}' versionName='1.0.14'\napplication-label:'货箱最后一格'\n`);
 await writeFile(join(out,'installed-package.txt'),'versionCode=2 targetSdk=36\n');
 await writeFile(join(out,'anr-before.txt'),'');await writeFile(join(out,'anr-after.txt'),'');
 return {root,out,summary,write};
}
async function evidenceFixture(failedTiming=false){
 let seed=seeds.get(failedTiming);if(!seed){seed=buildEvidenceSeed(failedTiming);seeds.set(failedTiming,seed);}
 const source=await seed,root=await mkdtemp(join(tmpdir(),'android-ci-evidence-copy-')),out=join(root,'build/android-ci/device-acceptance');
 await mkdir(join(out,'..'),{recursive:true});await cp(source.out,out,{recursive:true});
 const summary=JSON.parse(await readFile(join(out,'summary.json'),'utf8'));
 return {root,out,summary,write:(name:string,value:unknown)=>writeFile(join(out,name+'.json'),JSON.stringify(value))};
}
test('candidate identity and filename use actual verified APK version code',()=>{
 assert.ok(ci,'CI evidence verifier is missing');
 for(const code of [1,2]){
  assert.equal(ci.parseApkIdentity(`package: name='io.github.nightshang.chache' versionCode='${code}' versionName='1.0.14'\napplication-label:'货箱最后一格'`).versionCode,code);
  assert.equal(ci.candidateFileName(code,'b'.repeat(40)),`warehouse-last-slot-1.0.14-vc${code}-temporary-debug-candidate-${'b'.repeat(12)}.apk`);
 }
 for(const code of ['0','3','NaN'])assert.throws(()=>ci?.parseApkIdentity(`package: name='io.github.nightshang.chache' versionCode='${code}' versionName='1.0.14'\napplication-label:'货箱最后一格'`));
});
test('snapshot provenance parses inert commit text and requires a matching verified tree',()=>{
 assert.ok(ci);const local='a'.repeat(40),tree='b'.repeat(40);
 assert.equal(ci.parseSourceMapping(`Local source snapshot: ${local}\nTree verified: ${tree}\n$(touch unsafe)`,tree).localCommit,local);
 for(const text of [`Local source snapshot: ${local}\nTree verified: ${'c'.repeat(40)}`,`Local source snapshot: ${local}\nLocal source snapshot: ${local}\nTree verified: ${tree}`])assert.throws(()=>ci?.parseSourceMapping(text,tree));
 assert.equal(ci.parseSourceMapping('Ordinary local commit',tree).localCommit,null);
});
test('receipt validates full raw recovery upgrade and three measurement categories',async()=>{
 assert.ok(ci);const f=await evidenceFixture();try{const result=await ci.inspectAcceptanceEvidence(f.root,certificate,2);assert.equal(result.status,'passed');assert.equal(result.storageRecovery,'passed');assert.equal(result.sameSignatureUpgrade,'passed');assert.equal(result.performance.extreme.status,'passed');}finally{await rm(f.root,{recursive:true,force:true});}
});
test('complete failing latency stays failed with independently passed recovery and upgrade',async()=>{
 assert.ok(ci);const f=await evidenceFixture(true);try{const result=await ci.inspectAcceptanceEvidence(f.root,certificate,2);assert.equal(result.status,'failed');assert.equal(result.storageRecovery,'passed');assert.equal(result.sameSignatureUpgrade,'passed');assert.equal(result.performance.normal.status,'passed');assert.equal(result.performance.realistic.status,'failed');assert.equal(result.performance.extreme.status,'failed');}finally{await rm(f.root,{recursive:true,force:true});}
});
test('summary-only missing skipped stale duplicate and forged measurements never pass receipt',async()=>{
 assert.ok(ci);
 for(const mutation of ['missing','truncated','pid','nonce','summary','version','certificate','skip','samples']){
  const f=await evidenceFixture();try{
   if(mutation==='missing')await rm(join(f.out,'recover-history-before.json'));
   if(mutation==='truncated')await writeFile(join(f.out,'performance-extreme.json'),'{');
   if(mutation==='pid'||mutation==='nonce'){const p=join(f.out,'recover-history-before.json'),r=JSON.parse(await readFile(p,'utf8'));if(mutation==='pid')r.pid=123;else r.nonce='stale.report';await writeFile(p,JSON.stringify(r));}
   if(mutation==='summary'){f.summary.performance={};await f.write('summary',f.summary);}
   if(mutation==='samples'){const p=join(f.out,'performance-normal.json'),r=JSON.parse(await readFile(p,'utf8'));r.result.durationsMs.pop();await writeFile(p,JSON.stringify(r));f.summary.performance.normal=r;await f.write('summary',f.summary);}
   if(mutation==='skip'){await rm(f.out,{recursive:true});await mkdir(f.out);await f.write('summary',{schema:1,status:'passed',recovery:'passed',upgrade:'passed'});}
   const result=await ci.inspectAcceptanceEvidence(f.root,mutation==='certificate'?'b'.repeat(64):certificate,mutation==='version'?1:2);assert.notEqual(result.status,'passed',mutation);
  }finally{await rm(f.root,{recursive:true,force:true});}
 }
});
test('JUnit evidence distinguishes complete failure and error from missing malformed and incomplete reports',async()=>{
 assert.ok(ci);const root=await mkdtemp(join(tmpdir(),'android-ci-junit-'));try{
  await mkdir(join(root,'reports'));await mkdir(join(root,'source'));await writeFile(join(root,'source/Test.java'),'package example; public class Test { @Test public void actual() {} }');
  const xml=(inner='<testcase classname="example.Test" name="actual"/>',tests=1,failures=0,skipped=0,errors=0)=>`<testsuite tests="${tests}" failures="${failures}" errors="${errors}" skipped="${skipped}">${inner}</testsuite>`;
  await writeFile(join(root,'reports/result.xml'),xml());assert.equal((await ci.readJUnitEvidence(root,'reports','source')).status,'passed');
  for(const kind of ['failure','error']){
   await writeFile(join(root,'reports/result.xml'),xml(`<testcase classname="example.Test" name="actual"><${kind} message="exact ${kind}" type="NativeIssue">native detail</${kind}></testcase>`,1,kind==='failure'?1:0,0,kind==='error'?1:0));
   const evidence=await ci.readJUnitEvidence(root,'reports','source');
   assert.equal(evidence.status,'failed',kind);assert.equal(evidence.tests,1);assert.equal(evidence.cases?.['example.Test#actual'],'failed');
   assert.equal(evidence.counts?.failures,kind==='failure'?1:0);assert.equal(evidence.counts?.errors,kind==='error'?1:0);assert.equal(evidence.checksums?.length,1);
   assert.deepEqual(evidence.caseEvidence?.['example.Test#actual'][kind==='failure'?'failures':'errors'],[{message:`exact ${kind}`,type:'NativeIssue',text:'native detail'}]);
  }
  for(const value of ['<testsuite',xml('',1),xml('<testcase classname="example.Test" name="actual"><skipped/></testcase>',1,0,1),xml('<testcase classname="example.Test" name="actual"/><testcase classname="example.Test" name="actual"/>',2),xml('<testcase classname="example.Test" name="actual"><failure/></testcase>',1,0)]){await writeFile(join(root,'reports/result.xml'),value);assert.equal((await ci.readJUnitEvidence(root,'reports','source')).status,'blocked');}
  await rm(join(root,'reports/result.xml'));assert.equal((await ci.readJUnitEvidence(root,'reports','source')).status,'blocked');
 }finally{await rm(root,{recursive:true,force:true});}
});

test('verified native failure takes aggregate precedence while unrun downstream categories stay unverified',()=>{
 assert.ok(ci);assert.ok(ci.aggregateAcceptanceStatus,'Failure-precedence aggregate is missing');
 const unrun={status:'blocked',storageRecovery:'not-verified',performance:{normal:{status:'not-verified'},realistic:{status:'not-verified'},extreme:{status:'not-verified'}}},before=structuredClone(unrun);
 assert.equal(ci.aggregateAcceptanceStatus({status:'failed'},unrun,{status:'not-run'}),'failed');
 assert.equal(ci.aggregateAcceptanceStatus({status:'blocked'},unrun,{status:'failed'}),'failed');
 assert.equal(ci.aggregateAcceptanceStatus({status:'passed'},unrun),'blocked');
 assert.equal(ci.aggregateAcceptanceStatus({status:'passed'},{status:'passed'}),'passed');assert.deepEqual(unrun,before);
});

test('receipt CLI preserves only the verified actual-version candidate and truthful blocked native status',async()=>{
 // Tool output stubs test the command boundary and real ZIP/checksum packaging, not Android compilation.
 const root=await mkdtemp(join(tmpdir(),'android-ci-receipt-cli-')),repo=new URL('..',import.meta.url).pathname;
 const run=(cmd:string,args:string[],env:Record<string,string|undefined>={})=>spawnSync(cmd,args,{cwd:root,env:{...process.env,GITHUB_SHA:undefined,...env},encoding:'utf8',timeout:120000});
 try{
  for(const path of ['src','scripts','assets','node_modules','package.json','package-lock.json','android-shell','docs'])await symlink(join(repo,path),join(root,path));
  await cp(join(repo,'THIRD_PARTY_NOTICES.md'),join(root,'THIRD_PARTY_NOTICES.md'));
  const built=run(process.execPath,[join(repo,'scripts/build-android.mjs')]);assert.equal(built.status,0,built.stderr);
  const output=join(root,'build/android-ci'),tools=join(root,'sdk/build-tools/35.0.0');await mkdir(output,{recursive:true});await mkdir(tools,{recursive:true});
  await writeFile(join(output,'sdk-report.json'),JSON.stringify({androidHome:join(root,'sdk')}));
  const {classifyNodeEvents}=await import(new URL('../scripts/android-test-report.mjs',import.meta.url).href);
  const events=JSON.parse((await readFile(new URL('./fixtures/android/node24-terminal-events.json',import.meta.url),'utf8')).split('$ROOT').join(root)).events;
  const report=classifyNodeEvents(events,1,root);assert.equal(report.accepted,true);
  await writeFile(join(output,'node-test-report.json'),JSON.stringify(report));
  await writeFile(join(output,'node-events.jsonl'),'\n> warehouse-last-slot@1.0.13 test\n> node --test tests/*.test.ts\n\n'+events.map((e:unknown)=>JSON.stringify(e)).join('\n')+'\n');
  const source=join(root,'android/app/src/test');await mkdir(source,{recursive:true});await writeFile(join(source,'Test.java'),'package example; public class Test { @Test public void actual() {} }');
  const results=join(root,'android/app/build/test-results/testDebugUnitTest'),lint=join(root,'android/app/build/reports');await mkdir(results,{recursive:true});await mkdir(lint,{recursive:true});
  await writeFile(join(results,'result.xml'),'<testsuite tests="1" failures="0" errors="0" skipped="0"><testcase classname="example.Test" name="actual"/></testsuite>');
  await writeFile(join(lint,'lint-results-debug.xml'),'<issues format="6"/>');
  const apk=join(root,'android/app/build/outputs/apk/debug/app-debug.apk');await mkdir(join(apk,'..'),{recursive:true});
  assert.equal(run('python',['-c','import pathlib,zipfile,sys;r=pathlib.Path(sys.argv[1]);z=zipfile.ZipFile(sys.argv[2],"w");[(z.write(p,"assets/public/"+str(p.relative_to(r)))) for p in r.rglob("*") if p.is_file()];z.writestr("classes.dex",b"command-boundary-fixture");z.close()',join(root,'build/android'),apk]).status,0);
  await writeFile(join(tools,'aapt'),"#!/bin/sh\nprintf \"package: name='io.github.nightshang.chache' versionCode='2' versionName='1.0.14'\\napplication-label:'货箱最后一格'\\n\"\n",{mode:0o755});
  await writeFile(join(tools,'apksigner'),`#!/bin/sh\nprintf 'Signer #1 certificate SHA-256 digest: ${certificate}\\n'\n`,{mode:0o755});
  await writeFile(join(tools,'zipalign'),'#!/bin/sh\nexit 0\n',{mode:0o755});
  assert.equal(run('git',['init','--quiet']).status,0);await writeFile(join(root,'metadata'),'command-boundary-fixture');assert.equal(run('git',['add','metadata']).status,0);assert.equal(run('git',['-c','user.name=dot','-c','user.email=dot@users.noreply.github.com','commit','--quiet','-m','Receipt command fixture']).status,0);
  const result=run(process.execPath,[join(repo,'scripts/verify-android-build.mjs'),'receipt'],{ANDROID_CI_COMPILE_OUTCOME:'success',ANDROID_CI_REGRESSION_OUTCOME:'success'});assert.equal(result.status,0,result.stdout+result.stderr);
  const receipt=JSON.parse(await readFile(join(output,'candidate/android-build-receipt.json'),'utf8'));
  assert.equal(receipt.identity.versionCode,2);assert.equal(receipt.buildStatus,'verified');assert.equal(receipt.acceptanceStatus,'blocked');assert.equal(receipt.publishApk,false);assert.equal(receipt.acceptanceApproved,false);assert.equal(receipt.deliveryStatus,'CLOSED_PENDING_ROOT_EVALUATION');
  const names=await readdir(join(output,'candidate'));assert.equal(names.length,3);assert.ok(names.includes('SHA256SUMS'));assert.match(receipt.privateCompiledApk.filename,/vc2-temporary-debug-candidate/);
  for(const line of (await readFile(join(output,'candidate/SHA256SUMS'),'utf8')).trim().split('\n')){const [hash,name]=line.split('  ');assert.equal(createHash('sha256').update(await readFile(join(output,'candidate',name))).digest('hex'),hash);}
  const nativeSource=join(root,'android/app/src/androidTest'),nativeResults=join(root,'android/app/build/outputs/androidTest-results/connected/debug');await mkdir(nativeSource,{recursive:true});await mkdir(nativeResults,{recursive:true});
  await writeFile(join(nativeSource,'Test.java'),'package example; public class Test { @Test public void nativeCase() {} }');
  await writeFile(join(nativeResults,'result.xml'),'<testsuite tests="1" failures="1" errors="0" skipped="0"><testcase classname="example.Test" name="nativeCase"><failure message="native failed">executed failure</failure></testcase></testsuite>');
  const failed=run(process.execPath,[join(repo,'scripts/verify-android-build.mjs'),'receipt'],{ANDROID_CI_COMPILE_OUTCOME:'success',ANDROID_CI_REGRESSION_OUTCOME:'success'});assert.equal(failed.status,0,failed.stderr);
  const failedReceipt=JSON.parse(await readFile(join(output,'android-build-receipt.json'),'utf8'));assert.equal(failedReceipt.acceptanceStatus,'failed');assert.equal(failedReceipt.verification.instrumentation.status,'failed');assert.equal(failedReceipt.verification.instrumentation.counts.failures,1);assert.equal(failedReceipt.verification.deviceAcceptance.status,'blocked');assert.equal(failedReceipt.verification.storageRecovery,'not-verified');assert.equal(failedReceipt.verification.performance.extreme.status,'not-verified');
  const performanceContext={executionTarget:'disposable-emulator',emulationMode:'software-tcg',unsupportedSoftwareMode:true,phonePerformanceRepresentative:false,scope:'Functional evidence only; emulator timings retain original gates'};
  await rm(nativeResults,{recursive:true});await writeFile(join(output,'emulator-report.json'),JSON.stringify({status:'failed',reason:'Actual native instrumentation failure',performanceContext}));
  const nativeFailed=run(process.execPath,[join(repo,'scripts/verify-android-build.mjs'),'receipt'],{ANDROID_CI_COMPILE_OUTCOME:'success',ANDROID_CI_REGRESSION_OUTCOME:'success'});assert.equal(nativeFailed.status,0,nativeFailed.stderr);
  const nativeFailedReceipt=JSON.parse(await readFile(join(output,'android-build-receipt.json'),'utf8'));assert.equal(nativeFailedReceipt.acceptanceStatus,'failed');assert.equal(nativeFailedReceipt.verification.instrumentation.status,'blocked');assert.equal(nativeFailedReceipt.verification.deviceAcceptance.status,'blocked');
  assert.deepEqual(nativeFailedReceipt.verification.performanceContext,performanceContext);assert.equal(nativeFailedReceipt.verification.performance.extreme.status,'not-verified');assert.equal(nativeFailedReceipt.publishApk,false);
  const missingGate=run(process.execPath,[join(repo,'scripts/verify-android-build.mjs'),'receipt'],{ANDROID_CI_COMPILE_OUTCOME:'success',ANDROID_CI_REGRESSION_OUTCOME:'failure'});assert.notEqual(missingGate.status,0);
 }finally{await rm(root,{recursive:true,force:true});}
});

test('functional-only receipt retains verified recovery and upgrade but never approves unrun performance',async()=>{
 assert.ok(ci);const f=await evidenceFixture();try{
  f.summary.scope='functional-only';f.summary.status='blocked';f.summary.performance=Object.fromEntries(['normal','realistic','extreme'].map(n=>[n,{status:'not-run',reason:'Explicit software-TCG functional scope; phone performance unverified'}]));
  for(const n of ['normal','realistic','extreme'])await rm(join(f.out,'performance-'+n+'.json'));
  const {writeDeviceSummary}=await import(new URL('../scripts/android-device-summary.mjs',import.meta.url).href);f.summary=await writeDeviceSummary(f.out,{scope:'functional-only',stage:'complete',certificate,invocation:base});
  assert.equal(f.summary.status,'blocked');assert.equal(f.summary.completedRecoveryPhases.length,6);
  const result=await ci.inspectAcceptanceEvidence(f.root,certificate,2);
  assert.equal(result.status,'blocked');assert.equal(result.storageRecovery,'passed');assert.equal(result.sameSignatureUpgrade,'passed');
  for(const n of ['normal','realistic','extreme'])assert.equal(result.performance[n].status,'not-run');
  assert.equal(ci.aggregateAcceptanceStatus({status:'passed'},{status:'passed'},result),'blocked');
  f.summary.status='passed';await f.write('summary',f.summary);assert.notEqual((await ci.inspectAcceptanceEvidence(f.root,certificate,2)).status,'passed');
 }finally{await rm(f.root,{recursive:true,force:true});}
});
test('functional partial timeout preserves completed recovery evidence and failed versus unrun categories',async()=>{
 assert.ok(ci);const f=await evidenceFixture();try{
  for(const phase of fixture.CRASH_PHASES.slice(1)){await rm(join(f.out,'crash-'+phase+'.json'));await rm(join(f.out,'recover-'+phase+'.json'));}
  for(const name of ['upgrade-before','upgrade-after',...['normal','realistic','extreme'].map(n=>'performance-'+n)])await rm(join(f.out,name+'.json'));
  const {writeDeviceSummary}=await import(new URL('../scripts/android-device-summary.mjs',import.meta.url).href);f.summary=await writeDeviceSummary(f.out,{scope:'functional-only',exitCode:124,stage:'recover-history-mid',certificate,invocation:base});
  assert.deepEqual(f.summary.completedRecoveryPhases,['history-before']);
  const result=await ci.inspectAcceptanceEvidence(f.root,certificate,2) as {status:string;storageRecovery:string;sameSignatureUpgrade:string;performance:Record<string,{status:string}>;processDeath?:{phase:string;status:string}[]};
  assert.equal(result.status,'failed');assert.equal(result.storageRecovery,'failed');assert.equal(result.sameSignatureUpgrade,'not-run');assert.deepEqual(result.processDeath?.map(r=>r.phase),['history-before']);
  for(const n of ['normal','realistic','extreme'])assert.equal(result.performance[n].status,'not-run');
 }finally{await rm(f.root,{recursive:true,force:true});}
});

test('functional timeout before the first checkpoint remains failed without inventing a recovered phase',async()=>{
 assert.ok(ci);const f=await evidenceFixture();try{
  await rm(f.out,{recursive:true});await mkdir(f.out);
  await f.write('summary',{schema:1,scope:'functional-only',status:'failed',stage:'crash-history-before',commandExitCode:124,invocation:base,recovery:'failed',upgrade:'not-run',performance:Object.fromEntries(['normal','realistic','extreme'].map(n=>[n,{status:'not-run',reason:'Explicit software-TCG functional scope; phone performance unverified'}]))});
  const r=await ci.inspectAcceptanceEvidence(f.root,certificate,1);assert.equal(r.status,'failed');assert.equal(r.storageRecovery,'failed');assert.equal(r.sameSignatureUpgrade,'not-run');
 }finally{await rm(f.root,{recursive:true,force:true});}
});

test('missing driver after explicit functional native failure records unrun timing without fabricating recovery',async()=>{
 assert.ok(ci);const root=await mkdtemp(join(tmpdir(),'android-functional-unrun-'));try{
  const r=await ci.inspectAcceptanceEvidence(root,certificate,1,'functional-only');assert.equal(r.status,'blocked');assert.equal(r.storageRecovery,'not-verified');assert.equal(r.sameSignatureUpgrade,'not-verified');
  for(const n of ['normal','realistic','extreme'])assert.equal(r.performance[n].status,'not-run');
  assert.equal(ci.aggregateAcceptanceStatus({status:'failed'},r),'failed');
 }finally{await rm(root,{recursive:true,force:true});}
});
