/** Read-only owner-bound v22 game.js acceptance. Never produces or modifies product bundles. */
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {execFileSync,spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {RASTER_ART_CONTRACT,assertRasterSnapshot} from './raster-art-host-protocol.mjs';
import {SHOP_BASELINE_COMMIT,assertShopNavigationBinding,assertShopNavigationManifests} from './shop-navigation-host-protocol.mjs';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
export async function shopPreservationProof(root){
 const paths=execFileSync('git',['ls-tree','-r','--name-only',SHOP_BASELINE_COMMIT,'src/domain','assets','src/application/account-store.ts','src/application/account-profile.ts','src/application/cosmetics.ts','src/application/economy.ts','src/platform/music.ts','src/shared/audio-levels.ts'],{cwd:root,encoding:'utf8'}).trim().split('\n').filter(Boolean),files=[];
 for(const path of paths){const before=execFileSync('git',['show',`${SHOP_BASELINE_COMMIT}:${path}`],{cwd:root,maxBuffer:32*1024*1024}),after=await readFile(resolve(root,path));assert.equal(hash(after),hash(before),`Protected v21 source/asset changed: ${path}`);files.push({path,sha256:hash(after)});}
 assert.ok(files.length>100,'Full domain/assets/ledger preservation proof required');return {baselineCommit:SHOP_BASELINE_COMMIT,status:'EXACT_SOURCE_PRESERVATION',files,claim:'Byte identity only; historical native passes are not fresh execution evidence'};
}
export async function runShopNavigationHost(bindingPath,{out='artifacts/v0220-host/final',mode}={}){
 assert.ok(bindingPath,'Owner-frozen binding is required');bindingPath=resolve(bindingPath);const binding=JSON.parse(await readFile(bindingPath,'utf8'));assertShopNavigationBinding(binding);
 const root=resolve(binding.root??process.cwd());assert.equal(root,resolve(dirname(fileURLToPath(import.meta.url)),'..'),'Binding root must be this checkout');process.chdir(root);out=resolve(out);await mkdir(out,{recursive:true});
 if(!mode){
  const children=[];for(const policy of ['free','paid']){const child=spawnSync(process.execPath,[fileURLToPath(import.meta.url),'--binding',bindingPath,'--out',resolve(out,policy),'--mode',policy],{cwd:root,encoding:'utf8',maxBuffer:16*1024*1024});let report;try{report=JSON.parse(await readFile(resolve(out,policy,'report.json'),'utf8'));}catch{report={status:'FAIL',error:child.stderr||'Native child report missing'};}children.push({mode:policy,exitCode:child.status,report});if(child.stdout)console.log(child.stdout.trim());if(child.stderr)console.error(child.stderr.trim());}
  const report={status:children.every(c=>c.exitCode===0&&c.report.status==='PASS')?'PASS':'FAIL',kind:'v22 original game.js native wx/Canvas simulation; separate browser and physical-device review required',binding,children,counts:{passed:children.reduce((n,c)=>n+(c.report.coverage?.passed??0),0),failed:children.reduce((n,c)=>n+(c.report.coverage?.failed??0),0),nativeCases:children.reduce((n,c)=>n+(c.report.coverage?.nativeCases??0),0),sourceChecks:children.reduce((n,c)=>n+(c.report.coverage?.sourceChecks??0),0),inherited:0},completedAt:new Date().toISOString()};await writeFile(resolve(out,'report.json'),JSON.stringify(report,null,2));return report;
 }
 assert.ok(['free','paid'].includes(mode));assert.equal(globalThis.__PLAYTEST_FREE_SHOP__,undefined,'Fresh isolated oracle process required');Object.defineProperty(globalThis,'__PLAYTEST_FREE_SHOP__',{value:mode==='free',writable:false,configurable:false});
 const {PLAYTEST_FREE_SHOP}=await import(pathToFileURL(resolve(root,'src/shared/build-policy.ts')));assert.equal(PLAYTEST_FREE_SHOP,mode==='free');
 const {growthSourceHash}=await import('./growth-host-support.mjs');
 const snapshot=async()=>({commit:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),sourceSha256:await growthSourceHash(),gameJsSha256:hash(await readFile(resolve(binding.freeBuildRoot,'wechat/game.js'))),browserJsSha256:hash(await readFile(resolve(binding.freeBuildRoot,'browser/app.js'))),paidGameJsSha256:hash(await readFile(resolve(binding.paidBuildRoot,'wechat/game.js'))),paidBrowserJsSha256:hash(await readFile(resolve(binding.paidBuildRoot,'browser/app.js'))),assets:Object.fromEntries(await Promise.all(RASTER_ART_CONTRACT.flatMap(row=>Object.entries({source:root,freeBrowser:resolve(binding.freeBuildRoot,'browser'),freeWechat:resolve(binding.freeBuildRoot,'wechat'),paidBrowser:resolve(binding.paidBuildRoot,'browser'),paidWechat:resolve(binding.paidBuildRoot,'wechat')}).map(async([scope,base])=>[`${scope}:${row.src}`,hash(await readFile(resolve(base,row.src)))]))))});
 const beginning=await snapshot();assertRasterSnapshot(beginning,binding);const base=mode==='free'?binding.freeBuildRoot:binding.paidBuildRoot,pair=await Promise.all(['browser','wechat'].map(target=>readFile(resolve(base,target,'build-manifest.json'),'utf8').then(JSON.parse))),manifest=assertShopNavigationManifests(...pair,binding,mode),preservation=await shopPreservationProof(root);
 const {runShopNavigationNative}=await import('./shop-navigation-host-runtime.mjs');const report=await runShopNavigationNative({out,mode,binding,manifest,beginning,preservation});report.ending=await snapshot();try{assertRasterSnapshot(report.ending,binding);}catch(error){report.snapshotFailure=String(error);report.status='FAIL';}report.completedAt=new Date().toISOString();await writeFile(resolve(out,'report.json'),JSON.stringify(report,null,2));return report;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const arg=name=>{const index=process.argv.indexOf(name);return index<0?undefined:process.argv[index+1];};
 try{const report=await runShopNavigationHost(arg('--binding'),{out:arg('--out'),mode:arg('--mode')});console.log(`${report.status}: newly executed v22 native cases only; human/device review remains separate`);if(report.status!=='PASS')process.exitCode=1;}
 catch(error){console.error(error);process.exitCode=1;if(arg('--out')){await mkdir(resolve(arg('--out')),{recursive:true});await writeFile(resolve(arg('--out'),'report.json'),JSON.stringify({status:'FAIL',kind:'No native acceptance claim',error:String(error),stack:error.stack},null,2));}}
}
