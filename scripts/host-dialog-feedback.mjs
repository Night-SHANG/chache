/** Inert without owner-supplied frozen hashes. This runner never builds or edits product bytes. */
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {spawnSync,execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {assertDialogBinding,assertDialogManifests,assertSnapshotPair,DIALOG_QA_PROTOCOL} from './dialog-feedback-host-protocol.mjs';

export async function runDialogFeedback(bindingPath,{out='artifacts/v0180-host/final',mode}={}){
 assert.ok(bindingPath,'--binding owner-frozen.json required; protocol preparation is not acceptance');
 bindingPath=resolve(bindingPath);const binding=JSON.parse(await readFile(bindingPath,'utf8'));assertDialogBinding(binding);
 const root=resolve(binding.root??process.cwd());assert.equal(root,resolve(dirname(fileURLToPath(import.meta.url)),'..'),'Owner root must be the checkout containing this runner and its source oracles');process.chdir(root);out=resolve(out);await mkdir(out,{recursive:true});
 if(!mode){
  const childReports=[];
  for(const policy of ['free','paid']){
   const child=spawnSync(process.execPath,[fileURLToPath(import.meta.url),'--binding',bindingPath,'--out',resolve(out,policy),'--mode',policy],{cwd:root,encoding:'utf8',maxBuffer:8*1024*1024});
   let report;try{report=JSON.parse(await readFile(resolve(out,policy,'report.json'),'utf8'));}catch{report={status:'FAIL',error:child.stderr||'Child report missing'};}
   childReports.push({mode:policy,exitCode:child.status,report});if(child.stdout)console.log(child.stdout.trim());if(child.stderr)console.error(child.stderr.trim());
  }
  const result={status:childReports.every(row=>row.exitCode===0&&row.report.status==='PASS')?'PASS':'FAIL',kind:'Native wx/Canvas simulation only; visual review and device validation remain separate',binding,protocol:DIALOG_QA_PROTOCOL,children:childReports,completedAt:new Date().toISOString()};
  await writeFile(resolve(out,'report.json'),JSON.stringify(result,null,2));return result;
 }
 assert.ok(['free','paid'].includes(mode),'Fresh child policy must be free or paid');
 assert.equal(globalThis.__PLAYTEST_FREE_SHOP__,undefined,'Use a fresh source-oracle process');
 Object.defineProperty(globalThis,'__PLAYTEST_FREE_SHOP__',{value:mode==='free',writable:false,configurable:false});
 const policy=await import(pathToFileURL(resolve(root,'src/shared/build-policy.ts')));assert.equal(policy.PLAYTEST_FREE_SHOP,mode==='free');
 const {growthSourceHash}=await import('./growth-host-support.mjs');
 const hash=async path=>createHash('sha256').update(await readFile(path)).digest('hex');
 const snapshot=async()=>({commit:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),sourceSha256:await growthSourceHash(),gameJsSha256:await hash(resolve(binding.freeBuildRoot,'wechat/game.js')),browserJsSha256:await hash(resolve(binding.freeBuildRoot,'browser/app.js')),paidGameJsSha256:await hash(resolve(binding.paidBuildRoot,'wechat/game.js')),paidBrowserJsSha256:await hash(resolve(binding.paidBuildRoot,'browser/app.js')),...(binding.expectedAtlasSha256?{freeWechatAtlasSha256:await hash(resolve(binding.freeBuildRoot,'wechat/assets/cargo-materials.png')),freeBrowserAtlasSha256:await hash(resolve(binding.freeBuildRoot,'browser/assets/cargo-materials.png')),paidWechatAtlasSha256:await hash(resolve(binding.paidBuildRoot,'wechat/assets/cargo-materials.png')),paidBrowserAtlasSha256:await hash(resolve(binding.paidBuildRoot,'browser/assets/cargo-materials.png'))}:{})});
 const beginning=await snapshot();assertSnapshotPair(beginning,beginning,binding);
 const buildRoot=mode==='free'?binding.freeBuildRoot:binding.paidBuildRoot;
 const manifestPair=await Promise.all(['browser','wechat'].map(target=>readFile(resolve(buildRoot,target,'build-manifest.json'),'utf8').then(JSON.parse)));
 const manifest=assertDialogManifests(...manifestPair,binding,mode);
 const {runDialogFeedbackNative}=await import('./dialog-feedback-host-runtime.mjs');
 const report=await runDialogFeedbackNative({root,out,mode,binding,manifest,beginning});
 report.ending=await snapshot();
 try{assertSnapshotPair(beginning,report.ending,binding);}catch(error){report.cases.push({name:'final-owner-binding',status:'FAIL',error:String(error)});}
 report.status=report.cases.some(row=>row.status==='FAIL')?'FAIL':'PASS';report.completedAt=new Date().toISOString();
 await writeFile(resolve(out,'report.json'),JSON.stringify(report,null,2));return report;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const arg=name=>{const i=process.argv.indexOf(name);return i<0?undefined:process.argv[i+1];};
 if(process.argv.includes('--protocol'))console.log(JSON.stringify(DIALOG_QA_PROTOCOL,null,2));
 else try{const report=await runDialogFeedback(arg('--binding'),{out:arg('--out'),mode:arg('--mode')});console.log(`${report.status}: v0.18 bounded native host; mode=${arg('--mode')??'free+paid'}; visual review remains separate`);if(report.status!=='PASS')process.exitCode=1;}
 catch(error){console.error(error);process.exitCode=1;const out=arg('--out');if(out){await mkdir(out,{recursive:true});const failure=JSON.stringify({status:'FAIL',kind:'No acceptance claim',error:String(error),stack:error.stack},null,2);await writeFile(resolve(out,'initialization-failure.json'),failure);await writeFile(resolve(out,'report.json'),failure);}}
}
