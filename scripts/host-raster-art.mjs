/** Read-only v0.21 actual-package host acceptance. Never builds or edits source/package bytes. */
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { RASTER_ART_CONTRACT, assertRasterBinding, assertRasterManifests, assertRasterSnapshot } from './raster-art-host-protocol.mjs';
import {rasterSelectedCases} from './raster-art-host-rerun.mjs';
export async function runRasterArtHost(bindingPath,{out='artifacts/v0210-host/final',mode,only}={}){
 rasterSelectedCases(mode??'free',only);
 assert.ok(bindingPath,'--binding owner-frozen.json is required; preparation does not count as acceptance');
 bindingPath=resolve(bindingPath);const binding=JSON.parse(await readFile(bindingPath,'utf8'));assertRasterBinding(binding);
 const root=resolve(binding.root??process.cwd());assert.equal(root,resolve(dirname(fileURLToPath(import.meta.url)),'..'),'Owner root must be this checkout');process.chdir(root);out=resolve(out);await mkdir(out,{recursive:true});
 if(!mode){
  const children=[];for(const policy of ['free','paid']){const child=spawnSync(process.execPath,[fileURLToPath(import.meta.url),'--binding',bindingPath,'--out',resolve(out,policy),'--mode',policy,...(only?['--only',only]:[])],{cwd:root,encoding:'utf8',maxBuffer:16*1024*1024});let report;try{report=JSON.parse(await readFile(resolve(out,policy,'report.json'),'utf8'));}catch{report={status:'FAIL',error:child.stderr||'Native child report missing'};}children.push({mode:policy,exitCode:child.status,report});if(child.stdout)console.log(child.stdout.trim());if(child.stderr)console.error(child.stderr.trim());}
  const report={scope:only?'targeted':'full',selection:only??null,status:children.every(row=>row.exitCode===0&&row.report.status==='PASS')?'PASS':'FAIL',kind:'v0.21 original game.js native host simulation; physical device and visual review remain separate',binding,children,counts:{retainedPrevious:children.reduce((sum,row)=>sum+(row.report.priorCaseCoverage?.retained??0),0),added:children.reduce((sum,row)=>sum+(row.report.priorCaseCoverage?.added??0),0),legacy:children.reduce((sum,row)=>sum+(row.report.legacyCaseCount??0),0),passed:children.reduce((sum,row)=>sum+(row.report.cases??[]).filter(c=>c.status==='PASS').length,0),failed:children.reduce((sum,row)=>sum+(row.report.cases??[]).filter(c=>c.status==='FAIL').length,0)},completedAt:new Date().toISOString()};await writeFile(resolve(out,'report.json'),JSON.stringify(report,null,2));return report;
 }
 assert.ok(['free','paid'].includes(mode));assert.equal(globalThis.__PLAYTEST_FREE_SHOP__,undefined,'Fresh isolated oracle process required');Object.defineProperty(globalThis,'__PLAYTEST_FREE_SHOP__',{value:mode==='free',writable:false,configurable:false});
 const {PLAYTEST_FREE_SHOP}=await import(pathToFileURL(resolve(root,'src/shared/build-policy.ts')));assert.equal(PLAYTEST_FREE_SHOP,mode==='free');
 const {growthSourceHash}=await import('./growth-host-support.mjs');const hash=async path=>createHash('sha256').update(await readFile(path)).digest('hex');
 const snapshot=async()=>({commit:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),sourceSha256:await growthSourceHash(),gameJsSha256:await hash(resolve(binding.freeBuildRoot,'wechat/game.js')),browserJsSha256:await hash(resolve(binding.freeBuildRoot,'browser/app.js')),paidGameJsSha256:await hash(resolve(binding.paidBuildRoot,'wechat/game.js')),paidBrowserJsSha256:await hash(resolve(binding.paidBuildRoot,'browser/app.js')),assets:Object.fromEntries(await Promise.all(RASTER_ART_CONTRACT.flatMap(row=>Object.entries({source:root,freeBrowser:resolve(binding.freeBuildRoot,'browser'),freeWechat:resolve(binding.freeBuildRoot,'wechat'),paidBrowser:resolve(binding.paidBuildRoot,'browser'),paidWechat:resolve(binding.paidBuildRoot,'wechat')}).map(async([scope,base])=>[`${scope}:${row.src}`,await hash(resolve(base,row.src))]))))});
 const beginning=await snapshot();assertRasterSnapshot(beginning,binding);const base=mode==='free'?binding.freeBuildRoot:binding.paidBuildRoot,pair=await Promise.all(['browser','wechat'].map(target=>readFile(resolve(base,target,'build-manifest.json'),'utf8').then(JSON.parse))),manifest=assertRasterManifests(...pair,binding,mode);
 const {runRasterArtNative}=await import('./raster-art-host-runtime.mjs');const report=await runRasterArtNative({out,mode,binding,manifest,beginning,only});report.ending=await snapshot();try{assertRasterSnapshot(report.ending,binding);}catch(error){report.cases.push({name:'final-owner-snapshot-unchanged',status:'FAIL',error:String(error)});}report.status=report.cases.some(row=>row.status==='FAIL')?'FAIL':'PASS';report.completedAt=new Date().toISOString();await writeFile(resolve(out,'report.json'),JSON.stringify(report,null,2));return report;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const arg=name=>{const i=process.argv.indexOf(name);return i<0?undefined:process.argv[i+1];};
 try{const report=await runRasterArtHost(arg('--binding'),{out:arg('--out'),mode:arg('--mode'),only:arg('--only')});console.log(`${report.status}: ${report.scope==='targeted'?'targeted navigation evidence only':'full original v0.21 game.js native-host acceptance'}; device and visual review remain separate`);if(report.status!=='PASS')process.exitCode=1;}
 catch(error){console.error(error);process.exitCode=1;if(arg('--out')){await mkdir(resolve(arg('--out')),{recursive:true});await writeFile(resolve(arg('--out'),'report.json'),JSON.stringify({status:'FAIL',kind:'No native acceptance claim',error:String(error),stack:error.stack},null,2));}}
}
