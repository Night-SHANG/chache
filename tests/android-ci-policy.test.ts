import test from 'node:test';
import assert from 'node:assert/strict';
import {cp,mkdir,mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';

const root=resolve('.');
const read=(path:string)=>readFile(join(root,path),'utf8');
const report=await import(new URL('../scripts/android-test-report.mjs',import.meta.url).href).catch(()=>null) as null|{classifyNodeEvents:(events:unknown[],exitCode:number,root:string)=>{accepted:boolean;knownBaseline:unknown[];unexpectedFailures:unknown[];rawExitCode:number}};
const verifier=await import(new URL('../scripts/verify-android-build.mjs',import.meta.url).href).catch(()=>null) as null|{verifyStaging:(root:string)=>Promise<{phase:string;publishApk:boolean}>;inspectJavaRuntime:()=>string};

test('Android CI runs only branch pushes with read-only credentials and fixed official Actions',async()=>{
 const workflow=await read('.github/workflows/android.yml').catch(()=>null);
 assert.ok(workflow,'Android workflow is missing');
 assert.match(workflow,/on:\n  push:\n    branches: \[dev\/android-v110-release\]/);
 assert.match(workflow,/permissions:\n  contents: read/);
 assert.match(workflow,/runs-on: ubuntu-24\.04/);
 assert.match(workflow,/persist-credentials: false/);
 const actions=[...workflow.matchAll(/uses: ([^\s]+)/g)].map(match=>match[1]);
 assert.deepEqual(actions,[
  'actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1',
  'actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1',
  'actions/setup-java@de7274f081f381c8f8158605e0321c36c376e2e6',
  'actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9'
 ]);
 assert.doesNotMatch(workflow,/pull_request|workflow_dispatch|workflow_run|secrets\.|id-token:|contents: write|publish|release upload|continue-on-error/);
});

test('Android bootstrap installs both locks and compiles before reporting without publishing an APK',async()=>{
 const workflow=await read('.github/workflows/android.yml').catch(()=>null);
 assert.ok(workflow,'Android workflow is missing');
 for(const command of ['npm install --global npm@11.9.0','npm ci','npm --prefix android-shell ci','npm run lint','npm run typecheck','npm run preflight','node scripts/android-test-report.mjs run','npm run sync:android','npm run verify:android','testDebugUnitTest lintDebug assembleDebug assembleDebugAndroidTest'])assert.ok(workflow.includes(command),command);
 assert.match(workflow,/node-version: '24\.19\.0'/);
 assert.match(workflow,/java-version: '21'/);
 assert.match(workflow,/package-manager-cache: false/);
 assert.match(workflow,/include-hidden-files: false/);
 assert.match(workflow,/if-no-files-found: error/);
 const artifact=workflow.slice(workflow.indexOf('uses: actions/upload-artifact'));
 assert.doesNotMatch(artifact,/\.apk|\.jks|\.keystore|\$HOME|~\/|path: \./);
 assert.doesNotMatch(workflow,/sudo|chmod|sdkmanager --licenses|yes\s*\|/);
 const state=JSON.parse(await read('docs/android/ci-acceptance-state.json'));
 assert.deepEqual(state,{phase:'bootstrap',publishApk:false,reason:'Native storage, geometry, lifecycle and acceptance integration remain required.'});
 const pkg=JSON.parse(await read('package.json'));
 assert.equal(pkg.scripts['verify:android'],'node scripts/verify-android-build.mjs staging');
});

function failure(file:string,name:string,path:string,code='ENOENT'){
 return {type:'test:fail',data:{file:join(root,file),name,testId:1,parentId:0,nesting:0,testNumber:1,details:{type:'test',error:{code:'ERR_TEST_FAILURE',failureType:'testCodeFailure',cause:{code,errno:-2,syscall:'open',path:join(root,path),message:`${code}: no such file or directory, open '${join(root,path)}'`}}}}};
}
const baselines=()=>[
 failure('tests/cargo-atlas.test.ts','committed raster artwork verifies every generated source and exact encoded atlas','artifacts/v0200-art-source/cargo-wood-generated.png'),
 failure('tests/v021-cargo-forklift-art.test.ts','new generated atlas rows obey their incremental byte budgets and preserve source evidence','artifacts/v0210-art-source/cargo-harbor_container-generated.png')
];
const summary=(failed=2,skipped=0)=>({type:'test:summary',data:{success:failed===0,counts:{tests:failed,passed:0,failed,cancelled:0,skipped,todo:0,suites:0,topLevel:failed},duration_ms:1}});

type RecordedEvent={type:string;data:{file?:string;name?:string;testId?:number;parentId?:number;nesting?:number;testNumber?:number;details?:{type:string};counts?:Record<string,number>;success?:boolean}};
const recorded=JSON.parse((await read('tests/fixtures/android/node24-terminal-events.json')).split('$ROOT').join(root)).events as RecordedEvent[];
const recordedSuite=JSON.parse((await read('tests/fixtures/android/node24-terminal-events.json')).split('$ROOT').join(root)).suiteEvents as RecordedEvent[];

test('Node classifier accepts captured genuine terminal records with IDs scoped to each file',()=>{
 assert.ok(report);
 assert.equal(report.classifyNodeEvents(recorded,1,root).accepted,true);
 const first=recorded[0],crossFile=recorded[2];
 assert.equal(first.data.testId,crossFile.data.testId);
 assert.notEqual(first.data.file,crossFile.data.file);
});

test('Node classifier reconciles captured nested suites separately from test pass totals',()=>{
 assert.ok(report);
 assert.equal(report.classifyNodeEvents(recordedSuite,0,root).accepted,true);
});

test('Node classifier rejects a summary without pass evidence and any terminal record after the root summary',()=>{
 assert.ok(report);
 const passedSummary={type:'test:summary',data:{success:true,counts:{tests:1,passed:1,failed:0,cancelled:0,skipped:0,todo:0,suites:0,topLevel:1},duration_ms:1}};
 assert.equal(report.classifyNodeEvents([passedSummary],0,root).accepted,false);
 assert.equal(report.classifyNodeEvents([passedSummary,recorded[0]],0,root).accepted,false);
});

test('Node classifier rejects deleted real pass records and duplicated passes with truthful or forged totals',()=>{
 assert.ok(report);
 assert.equal(report.classifyNodeEvents(recorded.filter(event=>event.type!=='test:pass'),1,root).accepted,false);
 for(const forgeSummary of [false,true]){
  const duplicate=structuredClone(recorded);
  duplicate.splice(duplicate.length-1,0,structuredClone(duplicate[0]));
  const counts=duplicate[duplicate.length-1].data.counts;
  assert.ok(counts);
  if(forgeSummary){counts.tests++;counts.passed++;counts.topLevel++;}
  assert.equal(report.classifyNodeEvents(duplicate,1,root).accepted,false);
 }
});

test('Node classifier rejects malformed terminal identities, missing ancestry and cross-outcome duplicates',()=>{
 assert.ok(report);
 const mutations=[
  (event:RecordedEvent)=>{delete event.data.file;},
  (event:RecordedEvent)=>{event.data.testId=0;},
  (event:RecordedEvent)=>{delete event.data.parentId;},
  (event:RecordedEvent)=>{event.data.parentId=99;event.data.nesting=1;},
  (event:RecordedEvent)=>{event.data.details={type:'unsupported'};}
 ];
 for(const mutate of mutations){const events=structuredClone(recorded);mutate(events[0]);assert.equal(report.classifyNodeEvents(events,1,root).accepted,false);}
 const events=structuredClone(recorded),duplicate=structuredClone(events.find(event=>event.type==='test:fail'));
 assert.ok(duplicate);
 duplicate.type='test:pass';
 events.splice(events.length-1,0,duplicate);
 const counts=events[events.length-1].data.counts;assert.ok(counts);counts.tests++;counts.passed++;counts.topLevel++;
 assert.equal(report.classifyNodeEvents(events,1,root).accepted,false);
});

test('Node classifier preserves npm test failure while accepting only both exact missing-art baselines',()=>{
 assert.ok(report,'Structured Node regression classifier is missing');
 const classified=report.classifyNodeEvents([...baselines(),summary()],1,root);
 assert.equal(classified.accepted,true);
 assert.equal(classified.rawExitCode,1);
 assert.equal(classified.knownBaseline.length,2);
 assert.equal(classified.unexpectedFailures.length,0);
});

test('Node classifier rejects matching names with altered file, errno, path, wrapper or message',()=>{
 assert.ok(report,'Structured Node regression classifier is missing');
 const mutations=[
  (event:ReturnType<typeof failure>)=>{event.data.file=join(root,'tests/other.test.ts');},
  (event:ReturnType<typeof failure>)=>{event.data.details.error.cause.code='EIO';},
  (event:ReturnType<typeof failure>)=>{event.data.details.error.cause.errno=-5;},
  (event:ReturnType<typeof failure>)=>{event.data.details.error.cause.path=join(root,'artifacts/other/cargo-wood-generated.png');},
  (event:ReturnType<typeof failure>)=>{event.data.details.error.failureType='subtestsFailed';},
  (event:ReturnType<typeof failure>)=>{event.data.details.error.cause.message='Unexpected assertion failure';}
 ];
 for(const mutate of mutations){const events=baselines();mutate(events[0]);assert.equal(report.classifyNodeEvents([...events,summary()],1,root).accepted,false);}
});

test('Node classifier fails closed for extra failures, duplicate baselines, skipped tests, missing summary and abnormal exit',()=>{
 assert.ok(report,'Structured Node regression classifier is missing');
 for(const [events,exit] of [
  [[...baselines(),failure('tests/new.test.ts','new regression','artifacts/new.png'),summary(3)],1],
  [[...baselines(),baselines()[0],summary(3)],1],
  [[...baselines(),summary(2,1)],1],
  [baselines(),1],
  [[summary(0)],0],
  [[...baselines(),summary(),summary()],1],
  [[...baselines(),summary()],2],
  [[...baselines(),summary()],0]
 ] as [unknown[],number][])assert.equal(report.classifyNodeEvents(events,exit,root).accepted,false);
});

async function stagingFixture(){
 const dir=await mkdtemp(join(tmpdir(),'android-ci-staging-'));
 for(const path of ['build/android','android-shell/capacitor.config.json','android-shell/package-lock.json','package-lock.json','docs/android/ci-acceptance-state.json']){
  await mkdir(join(dir,path,'..'),{recursive:true});
  await cp(join(root,path),join(dir,path),{recursive:true});
 }
 return dir;
}

test('Android verifier accepts genuine hashed production staging but keeps its bootstrap publication gate closed',async()=>{
 assert.ok(verifier,'Android staging verifier is missing');
 const dir=await stagingFixture();
 try{assert.deepEqual(await verifier.verifyStaging(dir),{phase:'bootstrap',publishApk:false});}finally{await rm(dir,{recursive:true,force:true});}
});

test('Android verifier rejects tampered asset bytes and extra unlisted files',async()=>{
 assert.ok(verifier,'Android staging verifier is missing');
 for(const path of ['build/android/app.js','build/android/unlisted.js']){
  const dir=await stagingFixture();
  try{await writeFile(join(dir,path),'tampered');await assert.rejects(verifier.verifyStaging(dir),/checksum|file list/i);}finally{await rm(dir,{recursive:true,force:true});}
 }
});

test('Android verifier rejects remote config and any attempt to open the bootstrap APK gate',async()=>{
 assert.ok(verifier,'Android staging verifier is missing');
 const dir=await stagingFixture();
 try{
  const configPath=join(dir,'android-shell/capacitor.config.json');
  const config=JSON.parse(await readFile(configPath,'utf8'));
  await writeFile(configPath,JSON.stringify({...config,server:{...config.server,url:'https://example.org'}}));
  await assert.rejects(verifier.verifyStaging(dir),/offline config/);
  await cp(join(root,'android-shell/capacitor.config.json'),configPath);
  await writeFile(join(dir,'docs/android/ci-acceptance-state.json'),JSON.stringify({phase:'bootstrap',publishApk:true}));
  await assert.rejects(verifier.verifyStaging(dir),/publication gate/);
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('official emulator bootstrap has bounded installation and boot with no license or security changes',async()=>{
 const script=await read('scripts/android-emulator-test.sh').catch(()=>null);
 assert.ok(script,'Official emulator bootstrap is missing');
 assert.match(script,/SDKMANAGER.*--channel=0/);
 assert.match(script,/system-images;android-36;google_apis;x86_64/);
 assert.match(script,/<\/dev\/null/);
 assert.match(script,/-accel-check/);
 assert.match(script,/sys\.boot_completed/);
 assert.match(script,/connectedDebugAndroidTest/);
 assert.match(script,/trap .* EXIT/);
 assert.match(script,/timeout/);
 assert.doesNotMatch(script,/sudo|chmod|chown|--licenses|yes\s*\||licenses\/[a-z-]+\s*>/);
});

test('build receipt records the actual Java runtime patch emitted on stderr',()=>{
 assert.ok(verifier?.inspectJavaRuntime,'Actual Java runtime probe is missing');
 assert.match(verifier.inspectJavaRuntime(),/version "21[.]/);
});
