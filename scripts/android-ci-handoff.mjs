import {copyFile,lstat,mkdir,readFile,readdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {join,resolve,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {aggregateAcceptanceStatus,parseApkIdentity,parseSourceMapping,inspectAcceptanceEvidence,evidenceFiles} from './android-ci-evidence.mjs';
import {nativeInventory,parseNativeInstrumentation} from './android-native-instrumentation.mjs';
const requireValue=(condition,message)=>{if(!condition)throw Error(message);};
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const json=async path=>JSON.parse(await readFile(path,'utf8'));
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
export const runtimeScripts=[
 'scripts/android-ci-handoff.mjs','scripts/android-ci-evidence.mjs','scripts/android-ci-cache.mjs',
 'scripts/android-native-instrumentation.mjs','scripts/android-emulator-test.sh','scripts/android-emulator-mode.mjs',
 'scripts/android-device-check.sh','scripts/android-device-summary.mjs','scripts/android-acceptance-report.mjs','scripts/android-product-smoke.sh'
].sort();
const apkPaths={vc1:'apks/warehouse-vc1-temporary-debug.apk',vc2:'apks/warehouse-vc2-temporary-debug.apk',test:'apks/warehouse-androidTest.apk'};
const evidenceNames=['android-build-receipt.json','cache-report.json','cache-init-report.json','node-test-report.json','font-report.json','sdk-report.json'];
const allowedFiles=[...Object.values(apkPaths),...evidenceNames.map(name=>'evidence/'+name)].sort();
const maxFileBytes=64*1024*1024,maxTotalBytes=200*1024*1024;
function pathAllowed(path){return allowedFiles.includes(path);}
async function regular(path){const s=await lstat(path);requireValue(s.isFile()&&!s.isSymbolicLink(),'Handoff file must be regular, never a symlink');requireValue(s.size>0&&s.size<=maxFileBytes,'Handoff file exceeds bounded size');return s;}
async function inventoryFiles(root,prefix=''){
 const info=await lstat(root);requireValue(info.isDirectory()&&!info.isSymbolicLink(),'Handoff directory must be regular, never a symlink');
 const output=[];
 for(const entry of await readdir(root,{withFileTypes:true})){
  const path=prefix+entry.name,full=join(root,entry.name);requireValue(!entry.isSymbolicLink(),'Handoff symlink is forbidden');
  if(entry.isDirectory())output.push(...await inventoryFiles(full,path+'/'));
  else {requireValue(entry.isFile(),'Unexpected handoff file type');output.push(path);}
 }
 return output.sort();
}
function validateProvenance(source,run){
 requireValue(source&&['commit','tree','localCommit'].every(n=>/^[a-f0-9]{40}$/.test(source[n]??'')),'Source provenance requires exact remote commit/tree and mapped local commit');
 requireValue(run&&/^\d+$/.test(run.id??'')&&/^\d+$/.test(run.attempt??'')&&run.buildJob==='build'&&run.repository==='Night-SHANG/chache','Run provenance must identify this repository current build job and attempt');
}
function validateInventory(inventory){
 requireValue(inventory&&Array.isArray(inventory.tests)&&inventory.tests.length>0&&inventory.tests.length<=200&&new Set(inventory.tests).size===inventory.tests.length&&inventory.tests.every(t=>/^\w+(?:\.\w+)+#\w+$/.test(t)),'Invalid expected native inventory');
 requireValue(Array.isArray(inventory.sourceFiles)&&inventory.sourceFiles.length>0&&new Set(inventory.sourceFiles.map(f=>f.path)).size===inventory.sourceFiles.length&&inventory.sourceFiles.every(f=>/^android\/app\/src\/androidTest\/java\/(?:\w+\/)*\w+[.]java$/.test(f.path)&&/^[a-f0-9]{64}$/.test(f.sha256)),'Invalid native source inventory binding');
}
export async function writeHandoffManifest({root,payload,source,run,files=allowedFiles,apks,inventory}){
 validateProvenance(source,run);validateInventory(inventory);
 requireValue(new Set(files).size===files.length&&equal([...files].sort(),allowedFiles),'Handoff file allowlist or duplicate invalid');
 requireValue(equal(await inventoryFiles(payload),[...files].sort()),'Handoff file list differs from allowlist');
 const records=[];
 for(const path of [...files].sort()){const s=await regular(join(payload,path));records.push({path,sha256:hash(await readFile(join(payload,path))),bytes:s.size});}
 const scripts=[];
 for(const path of runtimeScripts){const s=await regular(join(root,path));scripts.push({path,sha256:hash(await readFile(join(root,path))),bytes:s.size});}
 const manifest={schema:1,source,run,files:records,apks,inventory,runtimeScripts:scripts,publication:'private same-workflow runtime handoff only; no delivery acceptance',payloadBytes:records.reduce((n,f)=>n+f.bytes,0)};
 requireValue(manifest.payloadBytes<=maxTotalBytes,'Handoff payload exceeds bounded total');
 const bytes=JSON.stringify(manifest,null,2)+'\n';await writeFile(join(payload,'manifest.json'),bytes,{flag:'wx'});
 return {manifest,digest:hash(bytes)};
}
export async function verifyHandoffManifest({root,payload,context}){
 requireValue(/^[a-f0-9]{64}$/.test(context?.manifestDigest??'')&&/^\d+$/.test(context?.artifactId??'')&&/^[a-f0-9]{64}$/.test(context?.artifactDigest??''),'Invalid current artifact digest binding');
 await regular(join(payload,'manifest.json'));const bytes=await readFile(join(payload,'manifest.json'));
 requireValue(hash(bytes)===context.manifestDigest,'Handoff manifest digest mismatch');
 const manifest=JSON.parse(bytes);requireValue(manifest.schema===1,'Unsupported handoff manifest');validateProvenance(manifest.source,manifest.run);validateProvenance(context.source,context.run);
 requireValue(equal(manifest.source,context.source)&&equal(manifest.run,context.run),'Handoff source/run provenance differs from current workflow');validateInventory(manifest.inventory);
 requireValue(Array.isArray(manifest.files)&&new Set(manifest.files.map(f=>f.path)).size===manifest.files.length&&manifest.files.every(f=>pathAllowed(f.path))&&equal(manifest.files.map(f=>f.path).sort(),allowedFiles),'Handoff file allowlist or duplicate invalid');
 requireValue(equal(await inventoryFiles(payload),[...manifest.files.map(f=>f.path),'manifest.json'].sort()),'Handoff file list differs from manifest allowlist');
 let payloadBytes=0,allocatedBytes=0;
 async function allocation(path){const s=await lstat(path);let total=s.blocks*512;if(s.isDirectory())for(const e of await readdir(path))total+=await allocation(join(path,e));return total;}
 allocatedBytes=await allocation(payload);
 for(const f of manifest.files){const s=await regular(join(payload,f.path));requireValue(s.size===f.bytes&&/^[a-f0-9]{64}$/.test(f.sha256)&&hash(await readFile(join(payload,f.path)))===f.sha256,'Handoff file hash/size mismatch: '+f.path);payloadBytes+=s.size;}
 requireValue(payloadBytes===manifest.payloadBytes&&payloadBytes<=maxTotalBytes,'Handoff bounded payload size mismatch');
 requireValue(Array.isArray(manifest.runtimeScripts)&&equal(manifest.runtimeScripts.map(s=>s.path),runtimeScripts),'Runtime script source allowlist differs');
 for(const s of manifest.runtimeScripts){const info=await regular(join(root,s.path));requireValue(info.size===s.bytes&&hash(await readFile(join(root,s.path)))===s.sha256,'Runtime script source hash mismatch: '+s.path);}
 for(const [name,path] of Object.entries(apkPaths))requireValue(manifest.apks?.[name]?.path===path&&manifest.files.some(f=>f.path===path),'APK file binding missing');
 return {...manifest,manifestDigest:context.manifestDigest,artifactId:context.artifactId,artifactDigest:context.artifactDigest,payloadBytes,allocatedBytes};
}
function toolchain(){const home=process.env.ANDROID_HOME||process.env.ANDROID_SDK_ROOT;requireValue(home,'Existing official SDK missing');return name=>join(home,'build-tools/35.0.0',name);}
export async function inspectHandoffApks(payload){
 const tool=toolchain(),apks={},assetSets={},diagnostics=join(dirname(payload),'apk-diagnostics');
 await mkdir(diagnostics,{recursive:true});
 const diagnosticInfo=await lstat(diagnostics);requireValue(diagnosticInfo.isDirectory()&&!diagnosticInfo.isSymbolicLink(),'APK diagnostics directory must be regular');
 async function probe(name,kind,args){
  const path=join(diagnostics,`${name}-${kind}.txt`);
  try{
   const raw=execFileSync(tool('aapt'),args,{encoding:'utf8',timeout:30000,maxBuffer:1024*1024});await writeFile(path,raw);return raw;
  }catch(error){
   await writeFile(path,error.stdout??'');
   await writeFile(join(diagnostics,'probe-error.json'),JSON.stringify({apk:name,probe:kind,status:error.status??null,signal:error.signal??null,message:error.message,stderr:String(error.stderr??'').slice(0,1024*1024)},null,2)+'\n');throw error;
  }
 }
 for(const [name,path] of Object.entries(apkPaths)){
  const full=join(payload,path);await regular(full);
  // Capture exact bounded tool output before any identity assertion, including failures.
  const badging=await probe(name,'badging',['dump','badging',full]);
  const manifestXml=await probe(name,'manifest',['dump','xmltree',full,'AndroidManifest.xml']);
  let identity;
  if(name==='test'){
   const packages=[...badging.matchAll(/^package: name='([^'\r\n]+)' versionCode='([^'\r\n]*)' versionName='([^'\r\n]*)'/gm)];
   requireValue([...badging.matchAll(/^package:/gm)].length===1&&packages.length===1&&packages[0][1]==='io.github.nightshang.chache.test','Instrumentation APK exact package identity missing');
   const code=packages[0][2];requireValue(/^\d*$/.test(code)&&(code===''||Number.isSafeInteger(Number(code))),'Instrumentation APK version metadata malformed');
   // AGP 8.13.0's instrumentation template does not inject app version metadata.
   // Preserve an absent code as null and the exact observed name, without defaults.
   identity={applicationId:packages[0][1],versionCode:code===''?null:Number(code),versionName:packages[0][3]};
   const lines=manifestXml.split('\n'),starts=lines.flatMap((line,i)=>/^\s*E: instrumentation\b/.test(line)?[i]:[]);
   requireValue(starts.length===1,'Instrumentation runner/target must have one manifest declaration');
   const start=starts[0],depth=/^\s*/.exec(lines[start])[0].length,block=[];
   for(const line of lines.slice(start+1)){if(line.trim()&&/^\s*/.exec(line)[0].length<=depth)break;block.push(line);}
   const values=name=>[...block.join('\n').matchAll(new RegExp('^\\s*A: android:'+name+'(?:\\([^)]*\\))?="([^"\\r\\n]*)"','gm'))].map(m=>m[1]);
   const runners=values('name'),targets=values('targetPackage');
   requireValue(runners.length===1&&runners[0]==='androidx.test.runner.AndroidJUnitRunner'&&targets.length===1&&targets[0]==='io.github.nightshang.chache','Instrumentation runner/target identity mismatch');
  }else {identity=parseApkIdentity(badging);requireValue(identity.versionCode===(name==='vc1'?1:2),'Product APK version mismatch');}
  const signature=execFileSync(tool('apksigner'),['verify','--verbose','--print-certs',full],{encoding:'utf8',timeout:30000});
  const signers=[...signature.matchAll(/^Signer #[0-9]+ certificate SHA-256 digest: ([a-f0-9]{64})$/gmi)];requireValue(signers.length===1,'APK must have one verified certificate');
  execFileSync(tool('zipalign'),['-c','-P','16','4',full],{encoding:'utf8',timeout:30000});
  const entries=execFileSync('unzip',['-Z1',full],{encoding:'utf8',timeout:30000}).trim().split('\n');
  requireValue(new Set(entries).size===entries.length&&!entries.some(p=>p.startsWith('/')||p.split('/').includes('..')||/\.(?:jks|keystore|pem|key|p12|pfx)$/i.test(p)),'APK duplicate/unsafe/private signing entries');
  const extract=p=>execFileSync('unzip',['-p',full,p],{timeout:30000,maxBuffer:64*1024*1024});
  if(name==='test')requireValue(entries.filter(p=>p==='assets/acceptance.js').length===1,'Test-only acceptance driver bundle missing');
  else {
   requireValue(!entries.some(p=>/(?:^|\/)(acceptance\.js|bundle-inputs\.json)$/.test(p)),'Test acceptance assets leaked into product APK');
   const js=extract('assets/public/app.js').toString('utf8');requireValue(!/WarehouseAcceptance(?:Control|Storage)|__ANDROID_ACCEPTANCE_/.test(js),'Test controls leaked into product JS');
   for(const dex of entries.filter(p=>/^classes[0-9]*\.dex$/.test(p)))requireValue(!/WarehouseAcceptance(?:Control|Storage)|DeviceAcceptanceTest/.test(extract(dex).toString('latin1')),'Test native classes leaked into product');
   const build=JSON.parse(extract('assets/public/build-manifest.json'));requireValue(build.platform==='android'&&build.version==='1.0.10'&&build.shopPricingMode==='paid'&&build.developerDiagnostics===false,'Product content is not formal paid v1.0.10');
   const sums=extract('assets/public/SHA256SUMS').toString('utf8').trim().split('\n').map(line=>{const m=/^([a-f0-9]{64})  ([A-Za-z0-9_./-]+)$/.exec(line);requireValue(m&&!m[2].startsWith('/')&&!m[2].split('/').includes('..'),'Invalid embedded asset checksum path');return {path:'assets/public/'+m[2],sha256:m[1]};});
   requireValue(new Set(sums.map(s=>s.path)).size===sums.length,'Duplicate embedded asset checksums');
   for(const s of sums)requireValue(entries.includes(s.path)&&hash(extract(s.path))===s.sha256,'Product asset checksum differs: '+s.path);
   const assets=entries.filter(p=>p.startsWith('assets/public/')&&!p.endsWith('/')).sort();
   // Capacitor adds its generated runtime metadata outside the source checksum list.
   const extras=assets.filter(p=>p!=='assets/public/SHA256SUMS'&&!sums.some(s=>s.path===p));
   requireValue(extras.every(p=>['assets/public/cordova.js','assets/public/cordova_plugins.js'].includes(p)),'Unlisted product asset: '+extras.join(','));
   assetSets[name]=assets.map(path=>({path,sha256:hash(extract(path))}));
  }
  const bytes=await readFile(full);apks[name]={path,identity,sha256:hash(bytes),bytes:bytes.length,certificateSha256:signers[0][1].toLowerCase(),signingVerified:true,alignmentVerified:true,...(name==='test'?{testOnlyAcceptanceBundleVerified:true}:{bundledAssetsVerified:true,testControlsExcluded:true})};
 }
 requireValue(Object.values(apks).every(a=>a.certificateSha256===apks.vc1.certificateSha256),'All three APKs must use the same single-job temporary debug certificate');
 requireValue(equal(assetSets.vc1,assetSets.vc2),'Immutable vc1/vc2 product asset bytes differ');
 return apks;
}
function currentSource(root){
 const commit=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),tree=execFileSync('git',['rev-parse','HEAD^{tree}'],{cwd:root,encoding:'utf8'}).trim();
 requireValue(process.env.GITHUB_SHA===commit,'Workflow source differs from actual exact commit');
 const mapping=parseSourceMapping(execFileSync('git',['log','-1','--format=%B'],{cwd:root,encoding:'utf8'}),tree);
 return {commit,tree,localCommit:mapping.localCommit};
}
function currentRun(){return {id:process.env.GITHUB_RUN_ID,attempt:process.env.GITHUB_RUN_ATTEMPT,repository:process.env.GITHUB_REPOSITORY,buildJob:'build'};}
function runtimeContext(root){return {source:currentSource(root),run:currentRun(),manifestDigest:process.env.ANDROID_CI_HANDOFF_DIGEST,artifactId:process.env.ANDROID_CI_ARTIFACT_ID,artifactDigest:process.env.ANDROID_CI_ARTIFACT_DIGEST?.replace(/^sha256:/,'')};}
export function joinBuildRuntime(build,runtime,binding){
 requireValue(build?.buildStatus==='verified'&&build?.deliveryStatus==='CLOSED_PENDING_ROOT_EVALUATION'&&build?.acceptanceStatus==='blocked','Only an unaccepted verified immutable build receipt may be joined');
 const expectedSource={...binding.source,runId:binding.run.id,runAttempt:binding.run.attempt};
 requireValue(['commit','tree','localCommit','runId','runAttempt'].every(k=>build.source?.[k]===expectedSource[k]),'Build source/run binding mismatch');
 const apk=binding.apks?.vc2;
 requireValue(apk&&equal(build.identity,apk.identity)&&build.privateCompiledApk?.sha256===apk.sha256&&build.privateCompiledApk?.temporaryDebugCertificateSha256===apk.certificateSha256,'Build APK hash/certificate/version binding mismatch');
 const native=runtime?.instrumentation&&typeof runtime.instrumentation==='object'?runtime.instrumentation:{status:'not-run'};
 const device=runtime?.deviceAcceptance&&typeof runtime.deviceAcceptance==='object'?runtime.deviceAcceptance:{status:'not-run'};
 const acceptanceStatus=aggregateAcceptanceStatus(runtime??{status:'not-run'},native,device);
 return {...structuredClone(build),schemaVersion:3,acceptanceStatus,acceptanceApproved:false,publishApk:false,rootEvaluationRequired:true,deliveryStatus:'CLOSED_PENDING_ROOT_EVALUATION',handoff:{manifestSha256:binding.manifestDigest,artifactId:binding.artifactId,archiveSha256:binding.artifactDigest,source:binding.source,run:binding.run,apks:binding.apks,buildReceiptSha256:binding.files?.find(f=>f.path==='evidence/android-build-receipt.json')?.sha256??null},runtimeEvidence:structuredClone(runtime??{status:'not-run'}),verification:{...structuredClone(build.verification),instrumentation:native,emulator:runtime?.emulator??{status:'not-run'},deviceAcceptance:device,acceptanceScope:device.scope??'not-run',storageRecovery:device.storageRecovery??'not-verified',sameSignatureUpgrade:device.sameSignatureUpgrade??'not-verified',performance:device.performance??{},performanceContext:runtime?.emulator?.performanceContext??build.verification?.performanceContext??{executionTarget:'not-run',phonePerformanceRepresentative:false},anr:device.anr??{status:'not-verified'},physicalPhone:'not-verified',audibleOutput:'not-verified',frameTiming:'not-measured',productColdLaunch:runtime?.productColdLaunch??{status:'not-verified'}}};
}
async function createHandoff(root){
 requireValue(process.env.GITHUB_JOB==='build','Handoff must be produced only in the build job');
 const output=join(root,'build/android-ci'),payload=join(output,'handoff');await mkdir(join(payload,'apks'),{recursive:true});await mkdir(join(payload,'evidence'));
 for(const name of evidenceNames)await copyFile(join(output,name),join(payload,'evidence',name));
 for(const path of Object.values(apkPaths))await copyFile(join(output,'acceptance-apks',path.split('/').at(-1)),join(payload,path));
 const source=currentSource(root),run=currentRun(),apks=await inspectHandoffApks(payload),inventory=await nativeInventory(root);
 for(const record of [...runtimeScripts.map(path=>({path})),...inventory.sourceFiles]){
  const committed=execFileSync('git',['show',`HEAD:${record.path}`],{cwd:root,maxBuffer:1024*1024});
  requireValue(hash(committed)===hash(await readFile(join(root,record.path))),'Handoff source file differs from exact committed tree: '+record.path);
 }
 const build=await json(join(payload,'evidence/android-build-receipt.json'));
 // Reuse join's strict source/version/certificate validation without fabricating runtime success.
 joinBuildRuntime(build,{status:'not-run'},{source,run,apks});
 const made=await writeHandoffManifest({root,payload,source,run,apks,inventory});
 if(process.env.GITHUB_OUTPUT)await writeFile(process.env.GITHUB_OUTPUT,`manifest-digest=${made.digest}\n`,{flag:'a'});
 console.log(`Immutable handoff: ${made.manifest.payloadBytes} bytes; manifest ${made.digest}; ${inventory.tests.length} native tests`);
}
async function verifyRuntime(root){
 const payload=resolve(process.env.ANDROID_CI_HANDOFF??'build/android-ci/handoff');
 const binding=await verifyHandoffManifest({root,payload,context:runtimeContext(root)}),apks=await inspectHandoffApks(payload);
 requireValue(equal(apks,binding.apks),'Runtime actual APK hash/identity/certificate differs from immutable build manifest');
 joinBuildRuntime(await json(join(payload,'evidence/android-build-receipt.json')),{status:'not-run'},binding);
 await mkdir(join(root,'build/android-ci'),{recursive:true});await writeFile(join(root,'build/android-ci/handoff-verification.json'),JSON.stringify({...binding,verified:true,measuredAt:new Date().toISOString()},null,2)+'\n');
 return binding;
}
async function joinRuntime(root){
 const output=join(root,'build/android-ci'),payload=resolve(process.env.ANDROID_CI_HANDOFF??'build/android-ci/handoff');
 // Reverify immutable bytes and source even after tests; never mutate the old receipt.
 const binding=await verifyRuntime(root),read=name=>json(join(output,name)).catch(()=>({status:'not-run',reason:'Missing or malformed '+name}));
 const emulator=await read('emulator-report.json');let instrumentation=await read('native-instrumentation-report.json'),parsed=null;
 try{
  const raw=await readFile(join(output,'native-instrumentation.txt'),'utf8');
  parsed=parseNativeInstrumentation(raw,{expected:binding.inventory.tests,exitCode:instrumentation.commandExitCode,timedOut:instrumentation.timedOut});
  requireValue(instrumentation.rawLog?.sha256===hash(raw)&&instrumentation.rawLog?.bytes===Buffer.byteLength(raw)&&equal(parsed,{...instrumentation,rawLog:undefined}),'Native parsed report differs from exact original raw log');
 }catch(error){instrumentation={...instrumentation,status:instrumentation.status==='failed'||parsed?.status==='failed'?'failed':'blocked',reason:error.message,...(parsed?{rawReanalysis:parsed}:{})};}

 const deviceAcceptance=await inspectAcceptanceEvidence(root,binding.apks.vc2.certificateSha256,2,emulator.acceptanceScope);
 const stage=process.env.ANDROID_CI_EMULATOR_OUTCOME;
 const status=aggregateAcceptanceStatus(emulator,instrumentation,deviceAcceptance,{status:stage==='failure'?'failed':stage==='success'?'passed':'not-run'});
 const resources={payload:{bytes:binding.payloadBytes,allocatedBytes:binding.allocatedBytes},runtimeCacheInit:await read('cache-init-report.json'),conservativeBuildCacheHeadroom:await json(join(payload,'evidence/cache-report.json')),headroomPurpose:'Preserved conservative build-cache allocation plus512MiB; runtime has no npm/Gradle re-download dependency',space:Object.fromEntries(await Promise.all(['before-download','after-download','preinstall','postinstall','postboot'].map(async n=>[n,await read('space-'+n+'.json')])))};
 const runtime={status,source:binding.source,run:binding.run,manifestSha256:binding.manifestDigest,artifactId:binding.artifactId,archiveSha256:binding.artifactDigest,instrumentation,emulator,deviceAcceptance,resources,productColdLaunch:await read('product-smoke-report.json')};
 const receipt=joinBuildRuntime(await json(join(payload,'evidence/android-build-receipt.json')),runtime,binding);
 await writeFile(join(output,'android-build-receipt.json'),JSON.stringify(receipt,null,2)+'\n');
 const sums=[];for(const name of ['android-build-receipt.json','handoff-verification.json','native-instrumentation-report.json','native-instrumentation.txt','emulator-report.json','product-smoke-report.json',...await evidenceFiles(root)])try{sums.push(`${hash(await readFile(join(output,name)))}  ${name}`);}catch(error){if(error.code!=='ENOENT')throw error;}
 await writeFile(join(output,'SHA256SUMS'),sums.join('\n')+'\n');
 console.log(`Joined current-run receipt: native acceptance ${receipt.acceptanceStatus}; delivery CLOSED_PENDING_ROOT_EVALUATION`);
 if(receipt.acceptanceStatus==='failed')process.exitCode=1;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const mode=process.argv[2],root=process.cwd();
 if(mode==='create')await createHandoff(root);
 else if(mode==='verify')await verifyRuntime(root);
 else if(mode==='join')await joinRuntime(root);
 else throw Error('Usage: android-ci-handoff.mjs create|verify|join');
}
