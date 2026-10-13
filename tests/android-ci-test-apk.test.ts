import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {join} from 'node:path';
import {tmpdir} from 'node:os';

const {inspectHandoffApks}=await import(new URL('../scripts/android-ci-handoff.mjs',import.meta.url).href);
const read=(path:string)=>readFile(new URL('../'+path,import.meta.url),'utf8');
const certificate='f'.repeat(64);
const names={vc1:'warehouse-vc1-temporary-debug.apk',vc2:'warehouse-vc2-temporary-debug.apk',test:'warehouse-androidTest.apk'};
const manifest=`  E: manifest (line=2)
    E: application (line=7)
    E: instrumentation (line=11)
      A: android:name(0x01010003)="androidx.test.runner.AndroidJUnitRunner"
      A: android:targetPackage(0x01010021)="io.github.nightshang.chache"
`;
async function fixture(sourceContentVersion='1.0.19'){
 const root=await mkdtemp(join(tmpdir(),'test-apk-metadata-')),payload=join(root,'handoff'),sdk=join(root,'sdk'),tools=join(sdk,'build-tools/35.0.0');
 await mkdir(join(payload,'apks'),{recursive:true});await mkdir(tools,{recursive:true});
 const config=Object.fromEntries(Object.entries(names).map(([kind,name])=>[name,{badging:`package: name='io.github.nightshang.chache${kind==='test'?'.test':''}' versionCode='${kind==='test'?'':kind==='vc1'?'1':'2'}' versionName='${kind==='test'?'':'1.0.19'}'\napplication-label:'货箱最后一格'\n`,manifest,certificate}]));
 const configure=()=>writeFile(join(sdk,'config.json'),JSON.stringify(config));await configure();
 // Only SDK process boundaries are fixtures. Real inspector parsing, file hashes,
 // ZIP assets and failure diagnostics run unchanged; this is not signing evidence.
 const tool=`#!/usr/bin/env node
const fs=require('node:fs'),path=require('node:path'),c=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../../config.json'))),args=process.argv.slice(2),tool=path.basename(process.argv[1]),apk=args.find(a=>a.endsWith('.apk')),r=c[path.basename(apk||'')];
if(tool==='aapt')process.stdout.write(args[1]==='badging'?r.badging:r.manifest);
else if(tool==='apksigner')process.stdout.write('Signer #1 certificate SHA-256 digest: '+r.certificate+'\\n');
`;
 for(const name of ['aapt','apksigner','zipalign'])await writeFile(join(tools,name),tool,{mode:0o755});
 const zipped=spawnSync('python',['-c',String.raw`import sys,json,pathlib,zipfile,hashlib
p=pathlib.Path(sys.argv[1]);names=json.loads(sys.argv[2]);source_version=sys.argv[3]
for kind,name in names.items():
 with zipfile.ZipFile(p/name,'w') as z:
  if kind=='test': z.writestr('assets/acceptance.js','fixture driver');continue
  assets={'app.js':'formal product','build-manifest.json':json.dumps({'platform':'android','version':'1.0.19','sourceContentVersion':source_version,'shopPricingMode':'paid','developerDiagnostics':False})}
  for key,value in assets.items():z.writestr('assets/public/'+key,value)
  z.writestr('assets/public/SHA256SUMS',''.join(hashlib.sha256(value.encode()).hexdigest()+'  '+key+'\n' for key,value in assets.items()))
`,join(payload,'apks'),JSON.stringify(names),sourceContentVersion],{encoding:'utf8'});assert.equal(zipped.status,0,zipped.stderr);
 const old=process.env.ANDROID_HOME;process.env.ANDROID_HOME=sdk;
 return {root,payload,config,configure,inspect:()=>inspectHandoffApks(payload),cleanup:async()=>{if(old===undefined)delete process.env.ANDROID_HOME;else process.env.ANDROID_HOME=old;await rm(root,{recursive:true,force:true});}};
}
test('AGP instrumentation template without version metadata stays exact and does not invent product versions',async()=>{
 const template=await read('tests/fixtures/android-agp-8.13.0-test-manifest.xml');assert.doesNotMatch(template,/android:versionCode|android:versionName/);assert.match(template,/android:targetPackage="#TESTEDPACKAGE#"/);
 const f=await fixture();try{
  const apks=await f.inspect();assert.deepEqual(apks.test.identity,{applicationId:'io.github.nightshang.chache.test',versionCode:null,versionName:''});assert.equal(apks.vc1.identity.versionCode,1);assert.equal(apks.vc2.identity.versionCode,2);assert.equal(apks.vc2.identity.versionName,'1.0.19');
  f.config[names.test].badging=f.config[names.test].badging.replace("versionCode='' versionName=''","versionCode='17' versionName='suite-17'");await f.configure();assert.deepEqual((await f.inspect()).test.identity,{applicationId:'io.github.nightshang.chache.test',versionCode:17,versionName:'suite-17'});
 }finally{await f.cleanup();}
});
test('product APK handoff rejects stale source content even with valid embedded checksums',async()=>{
 const f=await fixture('1.0.13');
 try{await assert.rejects(f.inspect(),/Product content must be Android v1\.0\.19 with formal paid v1\.0\.19 source content/);}finally{await f.cleanup();}
});
test('test APK wrong package target runner certificate and malformed metadata fail closed after raw diagnostics',async()=>{
 const changes=[['badging',"package: name='other.test' versionCode='' versionName=''\n"],['badging',"package: name='io.github.nightshang.chache.test' versionCode='bad' versionName=''\n"],['manifest',manifest.replace('io.github.nightshang.chache','other.app')],['manifest',manifest.replace('AndroidJUnitRunner','OtherRunner')],['manifest',manifest+manifest],['certificate','e'.repeat(64)]];
 for(const [field,value] of changes){const f=await fixture();try{
  Object.assign(f.config[names.test],{[field]:value});await f.configure();await assert.rejects(f.inspect(),/package|version|runner|target|certificate/i);
  assert.equal(await readFile(join(f.root,'apk-diagnostics/test-badging.txt'),'utf8'),f.config[names.test].badging);assert.equal(await readFile(join(f.root,'apk-diagnostics/test-manifest.txt'),'utf8'),f.config[names.test].manifest);
 }finally{await f.cleanup();}}
});
test('direct-adb test installation alone permits test APKs and failed build runtime diagnostics stay allowlisted',async()=>{
 for(const [path,product,testApk] of [['scripts/android-emulator-test.sh','$HANDOFF/apks/warehouse-vc1-temporary-debug.apk','$HANDOFF/apks/warehouse-androidTest.apk'],['scripts/android-device-check.sh','$APK1','$TEST_APK']]){
  const script=await read(path),installs=script.split('\n').filter(line=>/\binstall\b/.test(line));
  assert.ok(installs.some(line=>line.includes(`install -r -t "${testApk}"`)));assert.ok(installs.some(line=>line.includes(`install -r "${product}"`)));assert.equal(installs.filter(line=>/\binstall\b[^\n]* -t\b/.test(line)).length,1);
 }
 const workflow=await read('.github/workflows/android.yml'),jobs=workflow.split('\n  runtime:\n');assert.equal(jobs.length,2);
 for(const job of jobs)for(const kind of ['vc1','vc2','test'])for(const probe of ['badging','manifest'])assert.ok(job.includes(`build/android-ci/apk-diagnostics/${kind}-${probe}.txt`));
});
