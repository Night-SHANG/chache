/** Exact production bundle evidence with a frame after every pointer event and PNG completion. */
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {growthSourceHash} from './growth-host-support.mjs';
import {runV118PlatformTransitions} from './v118-transition-trace.mjs';
import {COSMETIC_CATALOG,HISTORICAL_COSMETIC_CATALOG} from '../src/application/cosmetics.ts';
const argument=name=>{const at=process.argv.indexOf(name);return at<0?undefined:process.argv[at+1];};
const root=resolve(argument('--build')??'build'),out=resolve(argument('--out')??'artifacts/single-package-static-host');
await mkdir(out,{recursive:true});
const app=JSON.parse(await readFile('package.json','utf8')),source=await growthSourceHash();
assert.equal(COSMETIC_CATALOG.length,29);assert.equal(HISTORICAL_COSMETIC_CATALOG.length,53);
assert.deepEqual(['theme','cargo','forklift'].map(kind=>COSMETIC_CATALOG.filter(item=>item.kind===kind).length),[9,9,11]);
const report={version:app.version,sourceSha256:source,kind:'Exact browser/WeChat/Android bundles in simulated hosts with real native PNG/Canvas',limitations:['Not a physical phone, WeChat IDE, Chromium, Android WebView, GPU or audible-output acceptance.','Android startup cover is a DOM test double; Canvas captures are not HTML screenshots.','Image requests and rendered sources are observed; retained-image memory limits are separately verified by resource-manager unit tests.','Only isolated funded fixtures are used; no player data is read or modified.'],platforms:[],failures:[]};
for(const target of ['browser','wechat','android']){
 try{
  const manifest=JSON.parse(await readFile(resolve(root,target,'build-manifest.json'),'utf8'));
  assert.equal(manifest.version,app.version);assert.equal(manifest.shopPricingMode,'paid');assert.equal(manifest.developerDiagnostics,false);
  assert.equal(source,manifest.sourceSha256,'Actual package must bind every current source/script/asset byte');
  assert.deepEqual(manifest.cosmetics,{catalogSize:29,setCount:0,navigation:'sections-pagination-inline-preview',sections:['theme','cargo','forklift'],columns:2,pageSize:4});
  assert.ok(manifest.staticArt.resources.every(row=>row.src.startsWith('assets/')),'All images ship in the main package');
  const evidence=await runV118PlatformTransitions({root,target,out});report.platforms.push(evidence);
  await writeFile(resolve(out,`${target}-frames.json`),JSON.stringify(evidence,null,2)+'\n');
  console.log(`${target}: ${evidence.frames.length} verified frames, ${evidence.visited.length} owned/sale items, ${evidence.cases.length} cases`);
 }catch(error){report.failures.push({target,error:String(error),stack:error.stack});console.error(target,error.stack);}
}
report.status=report.failures.length?'FAIL':'PASS';report.completedAt=new Date().toISOString();
await writeFile(resolve(out,'report.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({status:report.status,platforms:report.platforms.length,frames:report.platforms.reduce((sum,row)=>sum+row.frames.length,0),failures:report.failures.length,out}));
if(report.failures.length)process.exitCode=1;
