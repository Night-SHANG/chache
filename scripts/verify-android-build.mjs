import {constants} from 'node:fs';
import {access,lstat,mkdir,readFile,readdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync,spawnSync} from 'node:child_process';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

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
 requireValue(manifest.platform==='android'&&manifest.version==='1.0.10'&&manifest.shopPricingMode==='paid'&&manifest.developerDiagnostics===false,'Android staging must use v1.0.10 paid production content');
 requireValue(manifest.androidShellLockSha256===sha256(await readFile(join(root,'android-shell/package-lock.json'))),'Android shell lock checksum mismatch');
 requireValue(sha256(await readFile(join(root,'package-lock.json')))==='0630beb34c431334deb7652015a7630ae8a2958c3eb0b24757c45f99ea0181cc','Original root dependency lock changed');
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
 requireValue(node.accepted===true,'Node regression acceptance failed');
 const apk=join(root,'android/app/build/outputs/apk/debug/app-debug.apk');
 requireValue((await lstat(apk)).isFile(),'Compiled debug APK is missing');
 const tool=name=>join(sdk.androidHome,'build-tools/35.0.0',name);
 const badging=execFileSync(tool('aapt'),['dump','badging',apk],{encoding:'utf8'});
 requireValue(/package: name='io\.github\.nightshang\.chache' versionCode='1' versionName='1\.0\.10'/.test(badging),'Compiled APK identity/version mismatch');
 requireValue(/application-label:'货箱最后一格'/.test(badging),'Compiled APK label mismatch');
 requireValue(!/uses-permission: name='android\.permission\.INTERNET'/.test(badging),'Offline APK must not request INTERNET');
 const signature=execFileSync(tool('apksigner'),['verify','--verbose','--print-certs',apk],{encoding:'utf8'});
 const certificate=/Signer #1 certificate SHA-256 digest: ([a-f0-9]{64})/i.exec(signature)?.[1]?.toLowerCase();
 requireValue(certificate,'APK certificate fingerprint missing');
 execFileSync(tool('zipalign'),['-c','-P','16','4',apk],{encoding:'utf8'});
 const entries=execFileSync('unzip',['-Z1',apk],{encoding:'utf8'}).trim().split('\n');
 requireValue(!entries.some(path=>/\.(?:jks|keystore|pem|key)$/i.test(path)),'APK contains private signing material');
 for(const path of await files(join(root,'build/android'))){
  const entry='assets/public/'+path;
  requireValue(entries.filter(item=>item===entry).length===1,`APK bundled asset missing/duplicated: ${path}`);
  requireValue(sha256(execFileSync('unzip',['-p',apk,entry],{maxBuffer:32*1024*1024}))===sha256(await readFile(join(root,'build/android',path))),`APK asset checksum mismatch: ${path}`);
 }
 const native=await json(join(output,'emulator-report.json')).catch(()=>({status:'not-run',reason:'Emulator step did not produce a report'}));
 const receipt={schemaVersion:1,phase:gate.phase,publishApk:gate.publishApk,deliveryStatus:'WITHHELD_BOOTSTRAP',source:{commit:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),tree:execFileSync('git',['rev-parse','HEAD^{tree}'],{cwd:root,encoding:'utf8'}).trim(),workflowCommit:process.env.GITHUB_SHA??null,localCommit:null,commitMappingStatus:'Coordinator must verify local-to-remote mapping',runId:process.env.GITHUB_RUN_ID??null,runAttempt:process.env.GITHUB_RUN_ATTEMPT??null},identity:{applicationId:'io.github.nightshang.chache',appName:'货箱最后一格',versionName:'1.0.10',versionCode:1},toolchain:{node:process.version,npm:execFileSync('npm',['--version'],{encoding:'utf8'}).trim(),java:inspectJavaRuntime(),capacitor:'8.5.3',gradle:'8.14.3',agp:'8.13.0',sdk},locks:{rootSha256:sha256(await readFile(join(root,'package-lock.json'))),androidShellSha256:sha256(await readFile(join(root,'android-shell/package-lock.json')))},privateCompiledApk:{sha256:sha256(await readFile(apk)),temporaryDebugCertificateSha256:certificate,signingVerified:true,alignmentVerified:true,bundledAssetsVerified:true,uploaded:false},verification:{node,compile:'passed',gradleUnitAndLint:'passed',instrumentation:native,storageRecovery:'not-verified',sameSignatureUpgrade:'not-verified',longHistoryLatency:'not-verified',physicalPhone:'not-verified',audibleOutput:'not-verified'}};
 await writeFile(join(output,'android-build-receipt.json'),JSON.stringify(receipt,null,2)+'\n');
 const sums=[];
 for(const name of ['android-build-receipt.json','node-test-report.json','sdk-report.json','emulator-report.json','node-events.jsonl'])try{sums.push(`${sha256(await readFile(join(output,name)))}  ${name}`);}catch(error){if(error.code!=='ENOENT')throw error;}
 await writeFile(join(output,'SHA256SUMS'),sums.join('\n')+'\n');
 console.log('Verified privately compiled temporary-debug APK; bootstrap publication remains closed.');
 return receipt;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const mode=process.argv[2];
 if(mode==='staging'){console.log(await verifyStaging());}
 else if(mode==='sdk')await probeSdk();
 else if(mode==='receipt')await writeReceipt();
 else throw Error('Usage: node scripts/verify-android-build.mjs staging|sdk|receipt');
}
