import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import type {ReleaseFacts} from '../scripts/android-release-evidence.mjs';
const read=(path:string)=>readFileSync(path,'utf8');
test('release vc8 is explicit while debug acceptance versions retain their original defaults',()=>{
 const gradle=read('android/app/build.gradle');
 assert.match(gradle,/warehouseReleaseVersionCode/);
 assert.match(gradle,/releaseCode != '8'/);
 assert.match(gradle,/versionCode 8/);
 assert.match(gradle,/versionCode 1/);
 assert.match(gradle,/acceptanceCode == '2'/);
 assert.doesNotMatch(gradle,/ANDROID_KEYSTORE|storePassword|keyPassword/);
});
test('native upgrade probes use the Android release version while retaining vc1 to vc2 evidence',()=>{
 const driver=read('scripts/android-device-check.sh');
 assert.ok(driver.includes("versionName='1[.]0[.]18'"));
 const shellProbe=read('android/app/src/androidTest/java/io/github/nightshang/chache/ShellBoundaryInstrumentedTest.java');
 assert.match(shellProbe,/putString\("lastBinaryVersionCode", "1"\)\.putString\("lastBinaryVersionName", "1\.0\.18"\)/);
});
test('signed workflow isolates existing secrets from build and uploads only bounded outputs',()=>{
 const workflow=read('.github/workflows/android-release.yml');
 assert.match(workflow,/branches: \[dev\/android-v114-startup\]/);
 assert.match(workflow,/contents: read/);
 assert.match(workflow,/-PwarehouseReleaseVersionCode=8 :app:testReleaseUnitTest/);
 assert.match(workflow,/android-v118-signed-candidate-/);
 const signing=workflow.indexOf('\n  sign:');assert.ok(signing>0);
 assert.doesNotMatch(workflow.slice(0,signing),/secrets\./);
 assert.match(workflow.slice(signing),/secrets\.ANDROID_KEYSTORE_BASE64/);
 assert.match(workflow.slice(signing),/secrets\.ANDROID_KEYSTORE_PASSWORD/);
 assert.doesNotMatch(workflow.slice(signing),/npm (ci|install)|gradlew|generate-android-signing|contents: write/);
 assert.match(workflow,/digest-mismatch: error/);
 assert.match(workflow,/warehouse-last-slot-1\.0\.18-vc8-release-candidate\.apk/);
 assert.match(workflow,/signed-release-receipt\.json/);
});
test('release handoff rejects identity source archive and asset mismatches',async()=>{
 const {validateReleaseFacts}=await import('../scripts/android-release-evidence.mjs');
 const facts={applicationId:'io.github.nightshang.chache',versionName:'1.0.18',versionCode:8,appName:'货箱最后一格',debuggable:false,testOnly:false,internet:false,entries:['assets/public/app.js'],expectedAssets:{'app.js':'a'.repeat(64)},actualAssets:{'app.js':'a'.repeat(64)}};
 assert.equal(validateReleaseFacts(facts),true);
 const changes:Partial<ReleaseFacts>[]=[{versionName:'1.0.17'},{versionCode:7},{versionName:'1.0.16'},{versionName:'1.0.15'},{versionName:'1.0.14'},{versionName:'1.0.13'},{versionCode:6},{versionCode:5},{versionCode:4},{versionCode:3},{versionCode:2},{debuggable:true},{testOnly:true},{internet:true},{applicationId:'evil'},{entries:['assets/public/app.js','private.p12']},{entries:['assets/acceptance.js']},{entries:['assets/bundle-inputs.json']},{entries:['private.pk8']},{entries:['private.p8']},{actualAssets:{'app.js':'b'.repeat(64)}},{actualAssets:{'app.js':'a'.repeat(64),'extra':'c'.repeat(64)}}];
 for(const change of changes)assert.throws(()=>validateReleaseFacts({...facts,...change}));
});
test('signing refuses missing secrets before touching runner files',async()=>{
 const {spawnSync}=await import('node:child_process');
 const result=spawnSync('bash',['scripts/android-sign-release.sh'],{encoding:'utf8',env:{PATH:process.env.PATH,GITHUB_REPOSITORY:'Night-SHANG/chache',GITHUB_REF:'refs/heads/dev/android-v114-startup',GITHUB_EVENT_NAME:'push',RUNNER_TEMP:'/path-that-must-not-be-accessed'}});
 assert.notEqual(result.status,0);assert.match(result.stdout,/Secrets are missing/);assert.equal(result.stderr,'');
});
test('signing keeps temporary keys out of artifacts and cleans on failure paths',()=>{
 const script=read('scripts/android-sign-release.sh');
 assert.match(script,/set \+x/);assert.match(script,/umask 077/);
 assert.match(script,/trap cleanup EXIT/);assert.match(script,/--ks-pass env:ANDROID_KEYSTORE_PASSWORD/);
 assert.match(script,/--ks-key-alias chache-release/);assert.match(script,/unset ANDROID_KEYSTORE_BASE64/);
 assert.doesNotMatch(script,/keytool|genkey|set -x|--ks-pass pass:|echo .*ANDROID_KEYSTORE/);
 assert.ok(script.indexOf('zipalign')<script.indexOf('apksigner'));
});
test('fresh signing-runner Python rejects extra acceptance files and private key formats',async()=>{
 const {spawnSync}=await import('node:child_process');
 const result=spawnSync('python',['-c',`import runpy
check=runpy.run_path('scripts/android-signing-verify.py')['validate_archive_entries']
check(['assets/public/app.js'])
for name in ['assets/acceptance.js','assets/bundle-inputs.json','secret.pk8','secret.p8','secret.p12','../app.js','/app.js']:
 try: check(['assets/public/app.js',name])
 except ValueError: pass
 else: raise AssertionError(name)
`],{encoding:'utf8'});
 assert.equal(result.status,0,result.stderr);
});
test('fresh signing runner compares exact package and version values',async()=>{
 const {spawnSync}=await import('node:child_process');
 const result=spawnSync('python',['-c',`import runpy
check=runpy.run_path('scripts/android-signing-verify.py')['validate_identity']
valid="package: name='io.github.nightshang.chache' versionCode='8' versionName='1.0.18'"
check(valid)
for invalid in [valid.replace('1.0.18','1x0x18'),valid.replace('1.0.18','1.0.17'),valid.replace("versionCode='8'","versionCode='7'"),valid.replace('1.0.18','1.0.16'),valid.replace('1.0.18','1.0.15'),valid.replace('1.0.18','1.0.14'),valid.replace('1.0.18','1.0.13'),valid.replace("versionCode='8'","versionCode='6'"),valid.replace("versionCode='8'","versionCode='5'"),valid.replace("versionCode='8'","versionCode='4'"),valid.replace("versionCode='8'","versionCode='3'"),valid.replace('io.github.nightshang.chache','ioXgithubXnightshangXchache'),valid.replace("versionCode='8'","versionCode='2'"),valid+'\\n'+valid]:
 try: check(invalid)
 except ValueError: pass
 else: raise AssertionError(invalid)
`],{encoding:'utf8'});
 assert.equal(result.status,0,result.stderr);
});
test('Capacitor 8.5.3 empty bridge stubs are exact packaged assets, never an arbitrary file exception',async()=>{
 const {releaseAssetManifest,validateReleaseFacts}=await import('../scripts/android-release-evidence.mjs');
 const expected=releaseAssetManifest({'app.js':'a'.repeat(64)});
 const empty='e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
 assert.deepEqual(expected,{'app.js':'a'.repeat(64),'cordova.js':empty,'cordova_plugins.js':empty});
 const facts={applicationId:'io.github.nightshang.chache',versionName:'1.0.18',versionCode:8,appName:'货箱最后一格',debuggable:false,testOnly:false,internet:false,entries:['assets/public/app.js','assets/public/cordova.js','assets/public/cordova_plugins.js'],expectedAssets:expected,actualAssets:{...expected}};
 assert.equal(validateReleaseFacts(facts),true);
 assert.throws(()=>validateReleaseFacts({...facts,actualAssets:{...expected,'cordova.js':'b'.repeat(64)}}));
 assert.throws(()=>validateReleaseFacts({...facts,actualAssets:{...expected,'unexpected.js':empty}}));
 assert.throws(()=>releaseAssetManifest({'cordova.js':'b'.repeat(64)}));
});
