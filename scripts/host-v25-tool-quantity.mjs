/** Owner-frozen v25 batch-tool acceptance. Executes unmodified bundles; never builds or patches them. */
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync,spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
export function assertQuantityBinding(binding){
 assert.equal(binding?.ownerFrozen,true,'Owner must freeze the tested bytes');
 assert.equal(binding.aggregateChecksPassed,true,'Aggregate checks precede acceptance');
 assert.equal(binding.expectedVersion,'0.25.0-dev');
 assert.equal(binding.expectedCatalogSize,50);assert.equal(binding.expectedSetCount,15);
 assert.match(binding.expectedCommit??'',/^[a-f0-9]{40}$/);
 for(const key of ['expectedSourceSha256','expectedGameJsSha256','expectedBrowserJsSha256','expectedPaidGameJsSha256','expectedPaidBrowserJsSha256'])assert.match(binding[key]??'',/^[a-f0-9]{64}$/);
 assert.ok(binding.freeBuildRoot&&binding.paidBuildRoot);assert.notEqual(resolve(binding.freeBuildRoot),resolve(binding.paidBuildRoot));
}
export async function runToolQuantityHost(bindingPath,{out='artifacts/v0250-host/final',mode}={}){
 assert.ok(bindingPath,'Explicit owner-frozen binding required');bindingPath=resolve(bindingPath);
 const binding=JSON.parse(await readFile(bindingPath,'utf8'));assertQuantityBinding(binding);
 const root=resolve(binding.root??process.cwd());assert.equal(root,resolve(dirname(fileURLToPath(import.meta.url)),'..'));process.chdir(root);out=resolve(out);await mkdir(out,{recursive:true});
 if(!mode){
  const children=[];
  for(const mode of ['free','paid']){
   const child=spawnSync(process.execPath,[fileURLToPath(import.meta.url),'--binding',bindingPath,'--out',resolve(out,mode),'--mode',mode],{cwd:root,encoding:'utf8',maxBuffer:32*1024*1024});
   if(child.stdout)console.log(child.stdout.trim());if(child.stderr)console.error(child.stderr.trim());let report;
   try{report=JSON.parse(await readFile(resolve(out,mode,'report.json'),'utf8'));}catch{report={status:'FAIL',error:child.stderr||'No child report'};}
   children.push({mode,exitCode:child.status,report});
  }
  const report={status:children.every(c=>c.exitCode===0&&c.report.status==='PASS')?'PASS':'FAIL',kind:'Fresh original game.js native wx/Canvas and app.js DOM-event quantity host simulation',binding,children,coverage:Object.fromEntries(['passed','failed','nativeCases','browserEventCases','sourceChecks'].map(key=>[key,children.reduce((n,c)=>n+(c.report.coverage?.[key]??0),0)])),completedAt:new Date().toISOString()};
  await writeFile(resolve(out,'report.json'),JSON.stringify(report,null,2));return report;
 }
 assert.ok(['free','paid'].includes(mode));assert.equal(globalThis.__PLAYTEST_FREE_SHOP__,undefined);
 Object.defineProperty(globalThis,'__PLAYTEST_FREE_SHOP__',{value:mode==='free',writable:false,configurable:false});
 const {growthSourceHash}=await import('./growth-host-support.mjs');
 const snapshot=async()=>({commit:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),sourceSha256:await growthSourceHash(),gameJsSha256:hash(await readFile(resolve(binding.freeBuildRoot,'wechat/game.js'))),browserJsSha256:hash(await readFile(resolve(binding.freeBuildRoot,'browser/app.js'))),paidGameJsSha256:hash(await readFile(resolve(binding.paidBuildRoot,'wechat/game.js'))),paidBrowserJsSha256:hash(await readFile(resolve(binding.paidBuildRoot,'browser/app.js')))});
 const check=s=>{for(const [field,key]of Object.entries({commit:'expectedCommit',sourceSha256:'expectedSourceSha256',gameJsSha256:'expectedGameJsSha256',browserJsSha256:'expectedBrowserJsSha256',paidGameJsSha256:'expectedPaidGameJsSha256',paidBrowserJsSha256:'expectedPaidBrowserJsSha256'}))assert.equal(s[field],binding[key],`${field} differs from owner freeze`);};
 const beginning=await snapshot();check(beginning);
 const base=mode==='free'?binding.freeBuildRoot:binding.paidBuildRoot,[manifest,browserManifest]=await Promise.all(['wechat','browser'].map(target=>readFile(resolve(base,target,'build-manifest.json'),'utf8').then(JSON.parse)));
 assert.deepEqual(manifest,browserManifest);assert.equal(manifest.version,binding.expectedVersion);assert.equal(manifest.commit,binding.expectedCommit);assert.equal(manifest.sourceSha256,binding.expectedSourceSha256);assert.equal(manifest.shopPricingMode,mode==='free'?'playtest-free':'paid');assert.equal(manifest.developerDiagnostics,false);
 assert.equal(manifest.cosmetics.catalogSize,50);assert.equal(manifest.cosmetics.setCount,15);assert.equal(manifest.modes.rush.maxToolTypes,2);
 const {runQuantityNative}=await import('./v25-tool-quantity-host-runtime.mjs');const report=await runQuantityNative({out,mode,binding,manifest,beginning});
 report.ending=await snapshot();try{check(report.ending);}catch(error){report.status='FAIL';report.snapshotFailure=String(error);}
 report.completedAt=new Date().toISOString();await writeFile(resolve(out,'report.json'),JSON.stringify(report,null,2));return report;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const arg=name=>{const i=process.argv.indexOf(name);return i<0?undefined:process.argv[i+1];};
 try{const report=await runToolQuantityHost(arg('--binding'),{out:arg('--out'),mode:arg('--mode')});console.log(`${report.status}: v25 fresh byte-bound quantity cases; no physical-device or real-browser claim`);if(report.status!=='PASS')process.exitCode=1;}
 catch(error){console.error(error);process.exitCode=1;if(arg('--out')){await mkdir(resolve(arg('--out')),{recursive:true});await writeFile(resolve(arg('--out'),'report.json'),JSON.stringify({status:'FAIL',error:String(error),stack:error.stack},null,2));}}
}
