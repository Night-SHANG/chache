import {constants} from 'node:fs';
import {access,copyFile,lstat,mkdir,readFile,readdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync,spawnSync} from 'node:child_process';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {classifyNodeEvents} from './android-test-report.mjs';
import {aggregateAcceptanceStatus,candidateFileName,evidenceFiles,inspectAcceptanceEvidence,parseApkIdentity,parseSourceMapping,readJUnitEvidence} from './android-ci-evidence.mjs';

const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
const json=async path=>JSON.parse(await readFile(path,'utf8'));
const requireValue=(condition,message)=>{if(!condition)throw Error(message);};
export function inspectJavaRuntime() {
 const result=spawnSync('java',['-version'],{encoding:'utf8'});
 requireValue(result.status===0&&!result.error,'Java runtime version probe failed');
 const version=(result.stdout+result.stderr).trim();
 requireValue(/version "21[.]/.test(version),'JDK21 is required');
 return version;
}
async function files(dir,prefix='') {
 const paths=[];
 for(const entry of await readdir(dir,{withFileTypes:true})){
  const path=join(dir,entry.name),relative=prefix+entry.name;
  requireValue(!entry.isSymbolicLink(),'Staging symlink is forbidden');
  if(entry.isDirectory())paths.push(...await files(path,relative+'/'));
  else{requireValue(entry.isFile(),'Staging must contain only regular files');paths.push(relative);}
 }
 return paths.sort();
}
export async function verifyStaging(root=process.cwd()) {
 const config=await json(join(root,'android-shell/capacitor.config.json'));
 requireValue(config.appId==='io.github.nightshang.chache'&&config.appName==='货箱最后一格'&&config.webDir==='../build/android'&&config.server?.hostname==='localhost'&&config.server?.androidScheme==='https'&&config.server?.cleartext===false&&Array.isArray(config.server?.allowNavigation)&&config.server.allowNavigation.length===0&&!config.server.url&&config.android?.allowMixedContent===false&&config.android?.webContentsDebuggingEnabled===false&&config.android?.resolveServiceWorkerRequests===false&&config.plugins?.SystemBars?.insetsHandling==='disable','Invalid Android offline config');
 const state=await json(join(root,'docs/android/ci-acceptance-state.json'));
 requireValue(state.phase==='bootstrap'&&state.publishApk===false,'Bootstrap publication gate must stay closed until separately reviewed integration');
 const dir=join(root,'build/android'),manifest=await json(join(dir,'build-manifest.json'));
 requireValue(manifest.platform==='android'&&manifest.version==='1.0.20'&&manifest.sourceContentVersion==='1.0.20'&&manifest.shopPricingMode==='paid'&&manifest.developerDiagnostics===false,'Android staging must use v1.0.20 with v1.0.20 paid production content');
 requireValue(manifest.androidShellLockSha256===sha256(await readFile(join(root,'android-shell/package-lock.json'))),'Android shell lock checksum mismatch');
 requireValue(sha256(await readFile(join(root,'package-lock.json')))==='b5c2267ee344f44ca8c648425489213c9c513be2fcaa7a305e18b36243578a5e','Release root dependency lock changed');
 const actual=(await files(dir)).filter(path=>path!=='SHA256SUMS');
 const lines=(await readFile(join(dir,'SHA256SUMS'),'utf8')).trim().split('\n');
 const expected=lines.map(line=>{const match=/^([a-f0-9]{64})  ([A-Za-z0-9_./-]+)$/.exec(line);requireValue(match&&!match[2].startsWith('/')&&!match[2].split('/').includes('..'),'Invalid staging checksum path');return {hash:match[1],path:match[2]};});
 requireValue(expected.length===actual.length&&new Set(expected.map(item=>item.path)).size===expected.length&&JSON.stringify(expected.map(item=>item.path).sort())===JSON.stringify(actual),'Android staging file list differs from checksum allowlist');
 for(const item of expected){requireValue(!/\.(?:jks|keystore|pem|key)$/i.test(item.path),'Signing/private material is forbidden');requireValue(sha256(await readFile(join(dir,item.path)))===item.hash,`Staging checksum mismatch: ${item.path}`);}
 const html=await readFile(join(dir,'index.html'),'utf8');
 requireValue(!/https?:\/\/|<iframe|safe-area-inset|\bsrc=["']\/\//i.test(html)&&html.includes("script-src 'self'")&&html.includes("frame-src 'none'")&&html.includes("worker-src 'none'"),'Android HTML must use bundled offline assets and native Insets');
 return {phase:state.phase,publishApk:state.publishApk};
}

export async function probeSdk(root=process.cwd()) {
 const home=process.env.ANDROID_HOME||process.env.ANDROID_SDK_ROOT;
 requireValue(home,'ANDROID_HOME / ANDROID_SDK_ROOT is missing; no SDK installation or license acceptance attempted');
 for(const path of ['platforms/android-36/android.jar','build-tools/35.0.0/aapt','build-tools/35.0.0/aapt2','build-tools/35.0.0/apksigner','build-tools/35.0.0/zipalign','platform-tools/adb'])await access(join(home,path));
 const sdkmanager=join(home,'cmdline-tools/latest/bin/sdkmanager');
 await access(sdkmanager,constants.X_OK);
 const packages={};
 for(const path of ['platforms/android-36','build-tools/35.0.0','platform-tools','cmdline-tools/latest'])packages[path]=await readFile(join(home,path,'source.properties'),'utf8');
 const licenses=[];
 for(const entry of await readdir(join(home,'licenses'),{withFileTypes:true}))if(entry.isFile())licenses.push({id:entry.name,sha256:sha256(await readFile(join(home,'licenses',entry.name)))});
 const result={androidHome:home,imageOS:process.env.ImageOS??null,imageVersion:process.env.ImageVersion??null,packages,existingLicenseFileHashes:licenses,licenseChanges:false,aapt2:execFileSync(join(home,'build-tools/35.0.0/aapt2'),['version'],{encoding:'utf8'}).trim(),adb:execFileSync(join(home,'platform-tools/adb'),['version'],{encoding:'utf8'}).trim()};
 const output=join(root,'build/android-ci');await mkdir(output,{recursive:true});await writeFile(join(output,'sdk-report.json'),JSON.stringify(result,null,2)+'\n');
 console.log('Verified SDK36, Build Tools35.0.0, platform-tools and official CLI; existing licenses unchanged.');
 return result;
}

export async function writeReceipt(root=process.cwd()) {
 const gate=await verifyStaging(root),output=join(root,'build/android-ci');
 const sdk=await json(join(output,'sdk-report.json')),node=await json(join(output,'node-test-report.json'));
 requireValue(process.env.ANDROID_CI_COMPILE_OUTCOME==='success'&&process.env.ANDROID_CI_REGRESSION_OUTCOME==='success','Receipt requires actual successful CI compile and complete Node gate');
 const events=(await readFile(join(output,'node-events.jsonl'),'utf8')).split('\n').filter(line=>line.startsWith('{')).map(line=>JSON.parse(line));
 const classified=classifyNodeEvents(events,node.rawExitCode,root);
 requireValue(node.accepted===true&&classified.accepted===true&&JSON.stringify(node.counts)===JSON.stringify(classified.counts),'Node regression acceptance/evidence failed');
 const unit=await readJUnitEvidence(root,'android/app/build/test-results/testDebugUnitTest','android/app/src/test');
 requireValue(unit.status==='passed','Compiled application unit evidence is incomplete or failed');
 const lint=JSON.parse(execFileSync('python',['-c','import sys,json,xml.etree.ElementTree as E;r=E.parse(sys.argv[1]).getroot();assert r.tag=="issues";items=[dict(i.attrib,locations=[l.attrib for l in i.findall("location")]) for i in r];assert all(i.get("severity") in ["Warning","Information","Ignore"] for i in items),"App lint error/fatal/unknown severity";print(json.dumps({"status":"passed","warnings":items}))',join(root,'android/app/build/reports/lint-results-debug.xml')],{encoding:'utf8'}));
 const apk=join(root,'android/app/build/outputs/apk/debug/app-debug.apk');
 requireValue((await lstat(apk)).isFile()&&!(await lstat(apk)).isSymbolicLink(),'Compiled debug APK is missing or not a regular file');
 const tool=name=>join(sdk.androidHome,'build-tools/35.0.0',name);
 const badging=execFileSync(tool('aapt'),['dump','badging',apk],{encoding:'utf8'});
 const identity=parseApkIdentity(badging);
 const signature=execFileSync(tool('apksigner'),['verify','--verbose','--print-certs',apk],{encoding:'utf8'});
 const certificate=/Signer #1 certificate SHA-256 digest: ([a-f0-9]{64})/i.exec(signature)?.[1]?.toLowerCase();
 requireValue(certificate&&[...signature.matchAll(/Signer #[0-9]+ certificate SHA-256 digest:/g)].length===1,'APK must have exactly one verified certificate fingerprint');
 execFileSync(tool('zipalign'),['-c','-P','16','4',apk],{encoding:'utf8'});
 const entries=execFileSync('unzip',['-Z1',apk],{encoding:'utf8'}).trim().split('\n');
 requireValue(!entries.some(path=>/\.(?:jks|keystore|pem|key)$/i.test(path)),'APK contains private signing material');
 requireValue(!entries.some(path=>/(?:^|\/)(acceptance\.js|bundle-inputs\.json)$/.test(path)),'Test acceptance assets leaked into product APK');
 for(const path of await files(join(root,'build/android'))){
  const entry='assets/public/'+path;
  requireValue(entries.filter(item=>item===entry).length===1,`APK bundled asset missing/duplicated: ${path}`);
  requireValue(sha256(execFileSync('unzip',['-p',apk,entry],{maxBuffer:32*1024*1024}))===sha256(await readFile(join(root,'build/android',path))),`APK asset checksum mismatch: ${path}`);
 }
 const productJs=execFileSync('unzip',['-p',apk,'assets/public/app.js'],{maxBuffer:32*1024*1024}).toString('utf8');
 requireValue(!/WarehouseAcceptance(?:Control|Storage)|__ANDROID_ACCEPTANCE_/.test(productJs),'Test controls leaked into product JavaScript');
 for(const dex of entries.filter(path=>/^classes[0-9]*\.dex$/.test(path))){
  const bytes=execFileSync('unzip',['-p',apk,dex],{maxBuffer:64*1024*1024});
  requireValue(!/WarehouseAcceptance(?:Control|Storage)|DeviceAcceptanceTest/.test(bytes.toString('latin1')),'Test classes leaked into product APK');
 }
 const native=await json(join(output,'emulator-report.json')).catch(()=>({status:'not-run',reason:'Emulator step did not produce a report'}));
 const performanceContext=native.performanceContext??{executionTarget:'not-run',emulationMode:'not-selected',phonePerformanceRepresentative:false,scope:'No emulator measurement context was produced; phone performance remains unverified'};
 const instrumentation=await readJUnitEvidence(root,'android/app/build/outputs/androidTest-results/connected/debug','android/app/src/androidTest',true);
 const device=await inspectAcceptanceEvidence(root,certificate,identity.versionCode,native.acceptanceScope);
 const resourceSpace=await Promise.all(['preinstall','postinstall','postboot'].map(async stage=>[stage,await json(join(output,'space-'+stage+'.json')).catch(()=>({status:'not-run'}))]));
 const resources={cacheInit:await json(join(output,'cache-init-report.json')).catch(()=>({status:'not-run'})),cacheRelease:await json(join(output,'cache-report.json')).catch(()=>({status:'not-run'})),space:Object.fromEntries(resourceSpace)};
 const productSmoke=await json(join(output,'product-smoke-report.json')).catch(()=>({status:'not-verified',reason:'Product cold-launch evidence is missing'}));
 const commit=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),tree=execFileSync('git',['rev-parse','HEAD^{tree}'],{cwd:root,encoding:'utf8'}).trim();
 requireValue(!process.env.GITHUB_SHA||process.env.GITHUB_SHA===commit,'Workflow source differs from actual checked-out commit');
 const mapping=parseSourceMapping(execFileSync('git',['log','-1','--format=%B'],{cwd:root,encoding:'utf8'}),tree);
 const filename=candidateFileName(identity.versionCode,commit),candidateDir=join(output,'candidate');
 const acceptanceStatus=aggregateAcceptanceStatus(native,instrumentation,device);
 const receipt={schemaVersion:2,phase:gate.phase,publishApk:false,deliveryStatus:'CLOSED_PENDING_ROOT_EVALUATION',buildStatus:'verified',acceptanceStatus,acceptanceApproved:false,rootEvaluationRequired:true,source:{commit,tree,workflowCommit:process.env.GITHUB_SHA??null,localCommit:mapping.localCommit,commitMappingStatus:mapping.status,runId:process.env.GITHUB_RUN_ID??null,runAttempt:process.env.GITHUB_RUN_ATTEMPT??null},identity,toolchain:{node:process.version,npm:execFileSync('npm',['--version'],{encoding:'utf8'}).trim(),java:inspectJavaRuntime(),capacitor:'8.5.3',gradle:'8.14.3',agp:'8.13.0',sdk},locks:{rootSha256:sha256(await readFile(join(root,'package-lock.json'))),androidShellSha256:sha256(await readFile(join(root,'android-shell/package-lock.json')))},privateCompiledApk:{filename,sha256:sha256(await readFile(apk)),temporaryDebugCertificateSha256:certificate,signingVerified:true,alignmentVerified:true,bundledAssetsVerified:true,testControlsExcluded:true,preservation:'private CI candidate only; no accepted release or phone delivery'},verification:{node,resources,acceptanceScope:device.scope,inheritedPerformanceRisk:'Local original-engine comparison documents realistic/extreme Node p95 gate failures; this CI did not run that comparison',compile:'passed',gradleUnit:unit,lint,instrumentation,emulator:native,deviceAcceptance:device,storageRecovery:device.storageRecovery,sameSignatureUpgrade:device.sameSignatureUpgrade,performance:device.performance,performanceContext,anr:device.anr,productColdLaunch:productSmoke,physicalPhone:'not-verified',audibleOutput:'not-verified',frameTiming:'not-measured',nodeBaselineComparison:'not-run-in-this-CI; local documented comparison is separate evidence'}};
 await writeFile(join(output,'android-build-receipt.json'),JSON.stringify(receipt,null,2)+'\n');
 await mkdir(candidateDir,{recursive:true});await copyFile(apk,join(candidateDir,filename));
 requireValue(sha256(await readFile(join(candidateDir,filename)))===receipt.privateCompiledApk.sha256,'Candidate copy checksum differs from verified APK');
 await copyFile(join(output,'android-build-receipt.json'),join(candidateDir,'android-build-receipt.json'));
 await writeFile(join(candidateDir,'SHA256SUMS'),`${receipt.privateCompiledApk.sha256}  ${filename}\n${sha256(await readFile(join(candidateDir,'android-build-receipt.json')))}  android-build-receipt.json\n`);
 const sums=[];
 for(const name of ['android-build-receipt.json','node-test-report.json','sdk-report.json','font-report.json','cache-init-report.json','cache-report.json','space-preinstall.json','space-postinstall.json','space-postboot.json','emulator-report.json','emulator-mode.json','emulator-acceleration.log','emulator-boot.log','emulator-avd.log','emulator-install.log','emulator-api.txt','emulator-release.txt','emulator-build.txt','emulator-webview.txt','node-events.jsonl','product-smoke-report.json','product-cold-launch.png','product-install.txt','product-launch.txt','product-window.txt',...await evidenceFiles(root)])try{sums.push(`${sha256(await readFile(join(output,name)))}  ${name}`);}catch(error){if(error.code!=='ENOENT')throw error;}
 await writeFile(join(output,'SHA256SUMS'),sums.join('\n')+'\n');
 console.log(`Verified private vc${identity.versionCode} temporary-debug candidate; delivery is closed pending root evaluation; native acceptance ${acceptanceStatus}.`);
 return receipt;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const mode=process.argv[2];
 if(mode==='staging'){console.log(await verifyStaging());}
 else if(mode==='sdk')await probeSdk();
 else if(mode==='receipt')await writeReceipt();
 else throw Error('Usage: node scripts/verify-android-build.mjs staging|sdk|receipt');
}
