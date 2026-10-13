import {readFileSync,writeFileSync,mkdirSync,lstatSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {verifyStaging} from './verify-android-build.mjs';
import {readJUnitEvidence} from './android-ci-evidence.mjs';
import {classifyNodeEvents} from './android-test-report.mjs';
const requireValue=(v,m)=>{if(!v)throw Error(m);};
const hash=b=>createHash('sha256').update(b).digest('hex');
export function releaseAssetManifest(stagedAssets){
 const result={...stagedAssets},emptyHash=hash(Buffer.alloc(0));
 // Pinned Capacitor 8.5.3 createEmptyCordovaJS writes exactly these empty stubs.
 for(const path of ['cordova.js','cordova_plugins.js']){
  requireValue(!Object.hasOwn(result,path),'Staging must not shadow Capacitor generated bridge stubs');
  result[path]=emptyHash;
 }
 return result;
}
export function validateReleaseFacts(facts){
 requireValue(facts.applicationId==='io.github.nightshang.chache'&&facts.versionName==='1.0.16'&&facts.versionCode===6&&facts.appName==='货箱最后一格','Release identity mismatch');
 requireValue(facts.debuggable===false&&facts.testOnly===false&&facts.internet===false,'Release must be non-debuggable, non-test-only and offline');
 requireValue(Array.isArray(facts.entries)&&new Set(facts.entries).size===facts.entries.length&&!facts.entries.some(p=>p.startsWith('/')||p.split('/').includes('..')||/(?:^|\/)(?:acceptance\.js|bundle-inputs\.json)$/.test(p)||/\.(?:p12|pfx|jks|keystore|pem|key|pk8|p8)$/i.test(p)),'Invalid release ZIP entries or private material');
 requireValue(JSON.stringify(Object.keys(facts.expectedAssets).sort())===JSON.stringify(Object.keys(facts.actualAssets).sort()),'Release asset file set differs');
 for(const [p,h]of Object.entries(facts.expectedAssets))requireValue(/^[a-f0-9]{64}$/.test(h)&&facts.actualAssets[p]===h,`Release asset hash mismatch: ${p}`);
 return true;
}
export async function prepareUnsigned(root=process.cwd()){
 await verifyStaging(root);
 const apk=join(root,'android/app/build/outputs/apk/release/app-release-unsigned.apk');
 requireValue(lstatSync(apk).isFile()&&!lstatSync(apk).isSymbolicLink(),'Unsigned APK must be regular file');
 const sdk=process.env.ANDROID_HOME||process.env.ANDROID_SDK_ROOT;requireValue(sdk,'SDK is missing');
 const aapt=join(sdk,'build-tools/35.0.0/aapt');
 const badging=execFileSync(aapt,['dump','badging',apk],{encoding:'utf8'});
 const manifest=execFileSync(aapt,['dump','xmltree',apk,'AndroidManifest.xml'],{encoding:'utf8'});
 const pkg=/^package: name='([^']+)' versionCode='([^']+)' versionName='([^']+)'/m.exec(badging);requireValue(pkg,'Missing package identity');
 const entries=execFileSync('unzip',['-Z1',apk],{encoding:'utf8'}).trim().split('\n');
 const expectedAssets={},actualAssets={};
 for(const line of readFileSync(join(root,'build/android/SHA256SUMS'),'utf8').trim().split('\n')){const m=/^([a-f0-9]{64})  (.+)$/.exec(line);requireValue(m,'Invalid staging checksum');expectedAssets[m[2]]=m[1];}
 expectedAssets.SHA256SUMS=hash(readFileSync(join(root,'build/android/SHA256SUMS')));
 Object.assign(expectedAssets,releaseAssetManifest(expectedAssets));
 for(const p of entries.filter(p=>p.startsWith('assets/public/')&&!p.endsWith('/')))actualAssets[p.slice(14)]=hash(execFileSync('unzip',['-p',apk,p],{maxBuffer:32*1024*1024}));
 const facts={applicationId:pkg[1],versionCode:Number(pkg[2]),versionName:pkg[3],appName:/^application-label:'([^']+)'$/m.exec(badging)?.[1],debuggable:/application-debuggable/.test(badging)||/android:debuggable[^\n]*(?:0xffffffff|true)/.test(manifest),testOnly:/android:testOnly[^\n]*(?:0xffffffff|true)/.test(manifest),internet:/uses-permission[^\n]*android.permission.INTERNET/.test(badging),entries,expectedAssets,actualAssets};
 validateReleaseFacts(facts);
 for(const p of entries.filter(p=>/^classes[0-9]*\.dex$/.test(p)||p==='assets/public/app.js'))requireValue(!/WarehouseAcceptance(?:Control|Storage)|DeviceAcceptanceTest|__ANDROID_ACCEPTANCE_/.test(execFileSync('unzip',['-p',apk,p],{maxBuffer:64*1024*1024}).toString('latin1')),'Acceptance controls in release');
 const node=JSON.parse(readFileSync(join(root,'build/android-ci/node-test-report.json'),'utf8'));
 const events=readFileSync(join(root,'build/android-ci/node-events.jsonl'),'utf8').split('\n').filter(s=>s.startsWith('{')).map(s=>JSON.parse(s));
 const classified=classifyNodeEvents(events,node.rawExitCode,root);requireValue(classified.accepted===true&&node.accepted===true&&JSON.stringify(classified.counts)===JSON.stringify(node.counts),'Complete regression was not verified');
 const unit=await readJUnitEvidence(root,'android/app/build/test-results/testReleaseUnitTest','android/app/src/test');requireValue(unit.status==='passed','Release native unit test evidence missing/failed');
 const lint=JSON.parse(execFileSync('python',['-c','import sys,json,xml.etree.ElementTree as E;r=E.parse(sys.argv[1]).getroot();assert r.tag=="issues";a=[dict(i.attrib) for i in r];assert all(i.get("severity") in ["Warning","Information","Ignore"] for i in a);print(json.dumps(a))',join(root,'android/app/build/reports/lint-results-release.xml')],{encoding:'utf8'}));
 const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8'}).trim();
 const commit=git('rev-parse','HEAD'),tree=git('rev-parse','HEAD^{tree}');requireValue(commit===process.env.GITHUB_SHA,'Actual commit must match CI source');
 const out=join(root,'build/android-ci/release-unsigned');mkdirSync(out,{recursive:true});
 writeFileSync(join(out,'app-release-unsigned.apk'),readFileSync(apk));
 const receipt={schemaVersion:1,source:{commit,tree,runId:process.env.GITHUB_RUN_ID,runAttempt:process.env.GITHUB_RUN_ATTEMPT},apkSha256:hash(readFileSync(apk)),facts,verification:{node:classified,unit,lint,staging:'passed',releaseRuntime:'not-run',physicalPhone:'not-verified',samePermanentSignatureUpgrade:'not-verified'},publicationApproved:false};
 writeFileSync(join(out,'unsigned-release-receipt.json'),JSON.stringify(receipt,null,2)+'\n');
 console.log('Verified unsigned release vc6, production assets and release native unit/lint evidence.');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)await prepareUnsigned();
