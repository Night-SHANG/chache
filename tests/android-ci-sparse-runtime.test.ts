import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,cp,readFile,writeFile,readdir,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
const api=await import(new URL('../scripts/android-ci-handoff.mjs',import.meta.url).href).catch(()=>null) as null|{runtimeScripts:string[];writeHandoffManifest:(options:Record<string,unknown>)=>Promise<{digest:string}>};
const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
function run(root:string,command:string,args:string[],env:NodeJS.ProcessEnv=process.env){return spawnSync(command,args,{cwd:root,env,encoding:'utf8',timeout:30000});}

test('real sparse runtime CLI verifies and joins immutable handoff without source checkout dependencies or build caches',async()=>{
 assert.ok(api);
 const root=await mkdtemp(join(tmpdir(),'android-sparse-runtime-'));
 try{
  await mkdir(join(root,'scripts'));for(const script of api.runtimeScripts)await cp(new URL('../'+script,import.meta.url),join(root,script));
  const git=(...args:string[])=>{const r=run(root,'git',args);assert.equal(r.status,0,r.stderr);return r.stdout.trim();};
  git('init');git('add','scripts');const tree=git('write-tree'),localCommit='c'.repeat(40);
  git('-c','user.name=Sparse fixture','-c','user.email=fixture@example.invalid','commit','-m',`Test runtime only\n\nLocal source snapshot: ${localCommit}\nTree verified: ${tree}`);
  const source={commit:git('rev-parse','HEAD'),tree,localCommit},workflowRun={id:'42',attempt:'1',repository:'Night-SHANG/chache',buildJob:'build'};
  // The SDK commands are explicit protocol fixtures. unzip works on real ZIP bytes;
  // this test proves isolation/provenance wiring, never Android signing or runtime acceptance.
  const sdk=join(root,'fixture-sdk'),tools=join(sdk,'build-tools/35.0.0');await mkdir(tools,{recursive:true});
  const cert='f'.repeat(64);
  await writeFile(join(tools,'aapt'),`#!/usr/bin/env node
const test=process.argv.some(p=>p.includes('androidTest.apk')),code=process.argv.some(p=>p.includes('vc2-'))?2:1;
if(process.argv.includes('xmltree'))console.log('E: manifest\\n  E: instrumentation\\n    A: android:name(0x01010003)="androidx.test.runner.AndroidJUnitRunner"\\n    A: android:targetPackage(0x01010021)="io.github.nightshang.chache"');
else console.log("package: name='io.github.nightshang.chache"+(test?".test":"")+"' versionCode='"+(test?"":code)+"' versionName='"+(test?"":"1.0.13")+"'\\napplication-label:'货箱最后一格'");
`,{mode:0o755});
  await writeFile(join(tools,'apksigner'),`#!/bin/sh\nprintf 'Signer #1 certificate SHA-256 digest: ${cert}\\n'\n`,{mode:0o755});
  await writeFile(join(tools,'zipalign'),'#!/bin/sh\nexit 0\n',{mode:0o755});
  const payload=join(root,'build/android-ci/handoff');await mkdir(join(payload,'apks'),{recursive:true});await mkdir(join(payload,'evidence'));
  const zip=run(root,'python',['-c',`import zipfile,sys,json,hashlib,pathlib
p=pathlib.Path(sys.argv[1]);assets={'app.js':b'formal paid fixture','build-manifest.json':json.dumps({'platform':'android','version':'1.0.13','shopPricingMode':'paid','developerDiagnostics':False}).encode()}
sums=''.join(hashlib.sha256(v).hexdigest()+'  '+k+'\\n' for k,v in sorted(assets.items()));assets['SHA256SUMS']=sums.encode()
for name in ['warehouse-vc1-temporary-debug.apk','warehouse-vc2-temporary-debug.apk']:
 with zipfile.ZipFile(p/'apks'/name,'w') as z:
  for k,v in assets.items():z.writestr('assets/public/'+k,v)
with zipfile.ZipFile(p/'apks'/'warehouse-androidTest.apk','w') as z:z.writestr('assets/acceptance.js','test-only fixture')`,payload]);assert.equal(zip.status,0,zip.stderr);
  const env={...process.env,ANDROID_HOME:sdk,GITHUB_SHA:source.commit,GITHUB_RUN_ID:'42',GITHUB_RUN_ATTEMPT:'1',GITHUB_REPOSITORY:'Night-SHANG/chache',GITHUB_JOB:'runtime',ANDROID_CI_HANDOFF:payload,ANDROID_CI_ARTIFACT_ID:'100',ANDROID_CI_ARTIFACT_DIGEST:'d'.repeat(64),ANDROID_CI_EMULATOR_OUTCOME:'success'};
  const inspected=run(root,process.execPath,['--input-type=module','-e',`import {inspectHandoffApks} from './scripts/android-ci-handoff.mjs';console.log(JSON.stringify(await inspectHandoffApks(process.env.ANDROID_CI_HANDOFF)))`],env);assert.equal(inspected.status,0,inspected.stderr);const apks=JSON.parse(inspected.stdout);
  const build={schemaVersion:2,source:{...source,runId:'42',runAttempt:'1'},buildStatus:'verified',acceptanceStatus:'blocked',deliveryStatus:'CLOSED_PENDING_ROOT_EVALUATION',identity:apks.vc2.identity,privateCompiledApk:{sha256:apks.vc2.sha256,temporaryDebugCertificateSha256:cert},verification:{compile:'passed'}};
  const buildBytes=JSON.stringify(build);await writeFile(join(payload,'evidence/android-build-receipt.json'),buildBytes);
  for(const name of ['cache-report','cache-init-report','node-test-report','font-report','sdk-report'])await writeFile(join(payload,'evidence',name+'.json'),JSON.stringify({fixture:true,releasedAllocatedBytes:100}));
  const inventory={tests:['demo.Native#one'],sourceFiles:[{path:'android/app/src/androidTest/java/demo/Native.java',sha256:hash('fixture native')}]};
  const made=await api.writeHandoffManifest({root,payload,source,run:workflowRun,apks,inventory});
  const boundEnv={...env,ANDROID_CI_HANDOFF_DIGEST:made.digest};
  for(const command of ['verify','join']){const r=run(root,process.execPath,['scripts/android-ci-handoff.mjs',command],boundEnv);assert.equal(r.status,0,r.stdout+r.stderr);}
  const receipt=JSON.parse(await readFile(join(root,'build/android-ci/android-build-receipt.json'),'utf8'));assert.equal(receipt.acceptanceStatus,'blocked');assert.equal(receipt.verification.instrumentation.status,'blocked');assert.equal(receipt.deliveryStatus,'CLOSED_PENDING_ROOT_EVALUATION');assert.equal(receipt.handoff.manifestSha256,made.digest);assert.equal(receipt.handoff.archiveSha256,'d'.repeat(64));
  assert.equal(await readFile(join(payload,'evidence/android-build-receipt.json'),'utf8'),buildBytes);
  assert.deepEqual((await readdir(root)).sort(),['.git','build','fixture-sdk','scripts']);
  const raw=join(root,'build/android-ci/native-instrumentation.txt'),nativeReport=join(root,'build/android-ci/native-instrumentation-report.json');
  const packet=(code:number)=>`INSTRUMENTATION_STATUS: class=demo.Native\nINSTRUMENTATION_STATUS: current=1\nINSTRUMENTATION_STATUS: id=AndroidJUnitRunner\nINSTRUMENTATION_STATUS: numtests=1\nINSTRUMENTATION_STATUS: test=one\nINSTRUMENTATION_STATUS_CODE: ${code}\n`;
  for(const incomplete of ['',packet(1)]){
   await writeFile(raw,incomplete);
   const partial=run(root,process.execPath,['scripts/android-native-instrumentation.mjs',raw,join(payload,'manifest.json'),nativeReport,'0'],boundEnv);assert.equal(partial.status,78,partial.stderr);
   await writeFile(join(root,'build/android-ci/emulator-report.json'),JSON.stringify({status:'blocked',acceptanceScope:'functional-only',reason:'Incomplete generic native evidence'}));
   const partialJoin=run(root,process.execPath,['scripts/android-ci-handoff.mjs','join'],boundEnv);assert.equal(partialJoin.status,0,partialJoin.stderr);
   const partialReceipt=JSON.parse(await readFile(join(root,'build/android-ci/android-build-receipt.json'),'utf8'));assert.equal(partialReceipt.acceptanceStatus,'blocked');assert.equal(partialReceipt.verification.instrumentation.status,'blocked');
  }
  // Real sparse CLI keeps framework-readiness exhaustion blocked, while an
  // observed install failure has failed precedence with no native conclusion.
  await writeFile(raw,'');
  const diagnosticNames=['probes','services-early','system-crash-early','services-failure','system-crash-failure'].map(n=>`emulator-framework-${n}.txt`);
  for(const name of diagnosticNames)await writeFile(join(root,'build/android-ci',name),'explicit bounded protocol fixture: '+name);
  for(const [status,reason] of [['blocked','Original cold-boot deadline: framework unresponsive'],['failed','Immutable vc1 install: package Broken pipe']] as const){
   await writeFile(join(root,'build/android-ci/emulator-report.json'),JSON.stringify({status,acceptanceScope:'functional-only',reason}));
   const result=run(root,process.execPath,['scripts/android-ci-handoff.mjs','join'],{...boundEnv,ANDROID_CI_EMULATOR_OUTCOME:status==='failed'?'failure':'success'});assert.equal(result.status,status==='failed'?1:0,result.stderr);
   const joined=JSON.parse(await readFile(join(root,'build/android-ci/android-build-receipt.json'),'utf8'));assert.equal(joined.acceptanceStatus,status);assert.equal(joined.verification.emulator.status,status);assert.equal(joined.verification.instrumentation.status,'blocked');assert.equal(joined.deliveryStatus,'CLOSED_PENDING_ROOT_EVALUATION');assert.equal(joined.publishApk,false);
   const checksums=await readFile(join(root,'build/android-ci/SHA256SUMS'),'utf8');for(const name of diagnosticNames)assert.ok(checksums.includes(`${hash(await readFile(join(root,'build/android-ci',name),'utf8'))}  ${name}\n`));
  }
  await writeFile(join(root,'build/android-ci/emulator-report.json'),JSON.stringify({status:'blocked',acceptanceScope:'functional-only',reason:'Native evidence proceeds; driver/performance pending'}));
  await writeFile(raw,packet(1)+packet(0)+'INSTRUMENTATION_RESULT: stream=\nOK (1 test)\nINSTRUMENTATION_CODE: -1\n');
  const native=run(root,process.execPath,['scripts/android-native-instrumentation.mjs',raw,join(payload,'manifest.json'),nativeReport,'0'],boundEnv);assert.equal(native.status,0,native.stderr);
  const joined=run(root,process.execPath,['scripts/android-ci-handoff.mjs','join'],boundEnv);assert.equal(joined.status,0,joined.stderr);assert.equal(JSON.parse(await readFile(join(root,'build/android-ci/android-build-receipt.json'),'utf8')).verification.instrumentation.status,'passed');
  // A forged passing parsed report cannot suppress a failure in preserved raw statuses.
  await writeFile(raw,packet(1)+packet(-2)+'INSTRUMENTATION_RESULT: stream=\nFAILURES!!!\nINSTRUMENTATION_CODE: -1\n');
  const corrupt=run(root,process.execPath,['scripts/android-ci-handoff.mjs','join'],boundEnv);assert.equal(corrupt.status,1,corrupt.stderr);assert.equal(JSON.parse(await readFile(join(root,'build/android-ci/android-build-receipt.json'),'utf8')).verification.instrumentation.status,'failed');
  await writeFile(join(root,'build/android-ci/emulator-report.json'),JSON.stringify({status:'failed',acceptanceScope:'functional-only',reason:'Fixture timeout'}));
  const failed=run(root,process.execPath,['scripts/android-ci-handoff.mjs','join'],{...boundEnv,ANDROID_CI_EMULATOR_OUTCOME:'failure'});assert.equal(failed.status,1,failed.stderr);
  assert.equal(JSON.parse(await readFile(join(root,'build/android-ci/android-build-receipt.json'),'utf8')).acceptanceStatus,'failed');
 }finally{await rm(root,{recursive:true,force:true});}
});
