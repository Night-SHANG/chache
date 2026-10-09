/** Bounded QA-only navigation rerun. Original attempts and their source bindings remain separate. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {RASTER_PRIOR_CASES,RASTER_ART_CONTRACT,assertRasterBinding,assertRasterSnapshot} from './raster-art-host-protocol.mjs';
const sha256=value=>createHash('sha256').update(value).digest('hex');
const modes=['free','paid'];
export function rasterNavigationCases(mode){
 assert.ok(modes.includes(mode),'Known free/paid policy required');
 const names=RASTER_PRIOR_CASES[mode].filter(name=>name.startsWith(`${mode}-set-twelve-previews-cancel-pages-tools-`));
 assert.equal(names.length,4);return names;
}
export function rasterSelectedCases(mode,only){
 assert.ok(modes.includes(mode),'Known free/paid policy required');
 if(only===undefined)return null;
 assert.equal(only,'set-preview-navigation','Only the eight reviewed set-navigation reruns are supported');return rasterNavigationCases(mode);
}
export function rasterExpectedCases(mode){
 assert.ok(modes.includes(mode));
 const bundle=[...Array.from({length:8},(_,mask)=>`all-fifteen-owned-subset-${mask.toString(2).padStart(3,'0')}`),...['before-first-root','before-mirror-root','after-first-root','after-mirror-root'].map(fault=>`atomic-${fault}-retry`),'unknown-readback-same-receipt-repair','stale-quote-other-native-writer','insufficient-or-free-zero-wallet'].map(suffix=>`${mode}-v021-bundle-${suffix}`);
 const newArt=mode==='free'?[...['forest_depot','ice_vault','harbor'].flatMap(id=>[320,360].map(width=>`raster-v021-matched-${id}-full-board-${width}`)),...['forest_depot','ice_vault'].map(id=>`raster-theme-${id}-native-seven-nine-board-paths`),'raster-cargo-harbor_container-native-tray-drag-board-loaded',...['timber','ice','harbor'].map(id=>`raster-forklift-${id}-native-preview-inbound-outbound-loaded`)]:[];
 const names=[...RASTER_PRIOR_CASES[mode],...bundle,...newArt];assert.equal(names.length,mode==='free'?114:34);return names;
}
const qaFiles=new Set(['scripts/raster-set-host-runtime.mjs','scripts/raster-set-host-runtime.d.mts','scripts/raster-art-host-runtime.mjs','scripts/raster-art-host-runtime.d.mts','scripts/host-raster-art.mjs','scripts/raster-art-host-rerun.mjs','scripts/raster-art-host-rerun.d.mts','tests/raster-set-host-cases.test.ts','tests/raster-navigation-rerun.test.ts','tests/raster-host-entrypoint.test.ts']);
const sameNames=(cases,names,label)=>{assert.ok(Array.isArray(cases),`${label} cases required`);assert.equal(new Set(cases.map(row=>row.name)).size,cases.length,`${label} duplicate case`);assert.deepEqual(cases.map(row=>row.name).sort(),[...names].sort(),`${label} exact case set required`);};
export function mergeRasterNavigationEvidence({original,rerun,originalEvidence,rerunEvidence,changedPaths}){
 assertRasterBinding(original?.binding);assertRasterBinding(rerun?.binding);
 assert.equal(original.status,'FAIL');assert.ok(original.scope===undefined||original.scope==='full');
 assert.equal(rerun.status,'PASS');assert.equal(rerun.scope,'targeted');assert.equal(rerun.selection,'set-preview-navigation');
 for(const evidence of [originalEvidence,rerunEvidence]){assert.ok(typeof evidence?.path==='string'&&evidence.path.length>0);assert.match(evidence.sha256??'',/^[a-f0-9]{64}$/,'Original and rerun file hashes are required');}
 assert.notEqual(originalEvidence.path,rerunEvidence.path,'Original evidence must never be overwritten');
 assert.ok(Array.isArray(changedPaths)&&changedPaths.length>0,'Explicit QA-only source diff required');
 for(const path of changedPaths)assert.ok(qaFiles.has(path)||path==='README.md'||/^docs\/[^/]+\.md$/.test(path),`Non-QA source change forbids bounded evidence reuse: ${path}`);
 assert.notEqual(original.binding.expectedSourceSha256,rerun.binding.expectedSourceSha256,'QA source must be freshly rebound');
 const productKeys=['expectedGameJsSha256','expectedBrowserJsSha256','expectedPaidGameJsSha256','expectedPaidBrowserJsSha256',...RASTER_ART_CONTRACT.map(row=>row.hashKey)];
 for(const key of productKeys)assert.equal(rerun.binding[key],original.binding[key],`Changed product bytes forbid cumulative acceptance: ${key}`);
 const cases=[];let originalPassed=0,originalFailed=0,rerunPassed=0;
 for(const root of [original,rerun])assert.deepEqual(root.children.map(child=>child.mode).sort(),modes,'Exactly two independent native modes required');
 for(const mode of modes){
  const first=original.children.find(child=>child.mode===mode),last=rerun.children.find(child=>child.mode===mode),selected=rasterNavigationCases(mode);
  assert.equal(first.exitCode,1);assert.equal(last.exitCode,0);
  for(const [child,root] of [[first,original],[last,rerun]]){assert.equal(child.report.mode,mode);assert.deepEqual(child.report.binding,root.binding);assertRasterSnapshot(child.report.beginning,root.binding);assertRasterSnapshot(child.report.ending,root.binding);}
  assert.equal(first.report.status,'FAIL');assert.equal(last.report.status,'PASS');assert.equal(last.report.scope,'targeted');assert.equal(last.report.selection,'set-preview-navigation');
  sameNames(first.report.cases,rasterExpectedCases(mode),`Original ${mode}`);sameNames(last.report.cases,selected,`Rerun ${mode}`);
  for(const row of first.report.cases){
   const replaced=selected.includes(row.name),latest=replaced?last.report.cases.find(candidate=>candidate.name===row.name):row,evidence=replaced?rerunEvidence:originalEvidence,binding=replaced?rerun.binding:original.binding;
   if(replaced){assert.equal(row.status,'FAIL');assert.ok(row.error?.includes('Touch control exists {"type":"selectCosmeticSetPage","page":1}'),'Only the diagnosed navigation failure may be replaced');assert.equal(latest.status,'PASS');originalFailed++;rerunPassed++;}else{assert.equal(row.status,'PASS',`Unrelated original failure cannot be hidden: ${row.name}`);originalPassed++;}
   cases.push({...latest,evidence:{run:replaced?'targeted-navigation':'first-run',...evidence,commit:binding.expectedCommit,sourceSha256:binding.expectedSourceSha256,caseSha256:sha256(JSON.stringify(latest))},...(replaced?{previousAttempt:{status:row.status,error:row.error,...originalEvidence,commit:original.binding.expectedCommit,sourceSha256:original.binding.expectedSourceSha256,caseSha256:sha256(JSON.stringify(row))}}:{})});
  }
 }
 assert.deepEqual([originalPassed,originalFailed,rerunPassed,cases.length,new Set(cases.map(row=>row.name)).size],[140,8,8,148,148]);
 return {status:'PASS',kind:'Cumulative original-package native acceptance with eight QA-only navigation reruns; visual and device review remain separate',singleRunAllGreen:false,binding:rerun.binding,originalRun:{...originalEvidence,binding:original.binding,passed:140,failed:8},targetedRun:{...rerunEvidence,binding:rerun.binding,passed:8,failed:0,selection:'set-preview-navigation'},sourceTransition:{from:{commit:original.binding.expectedCommit,sourceSha256:original.binding.expectedSourceSha256},to:{commit:rerun.binding.expectedCommit,sourceSha256:rerun.binding.expectedSourceSha256},changedPaths:[...changedPaths],unchangedProductHashes:Object.fromEntries(productKeys.map(key=>[key,rerun.binding[key]])),note:'140 cases ran under the original QA source; only the eight navigation cases ran under the corrected QA source. Four JS files and all four atlases are identical across both snapshots.'},counts:{unique:148,passed:148,failed:0,originalPassed,originalFailed,rerunPassed,retainedPrevious:106,added:42},cases};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const arg=name=>{const index=process.argv.indexOf(name);return index<0?undefined:process.argv[index+1];};
 try{
  assert.ok(arg('--original')&&arg('--rerun')&&arg('--out'),'--original, --rerun and --out are required');
  const originalPath=resolve(arg('--original')),rerunPath=resolve(arg('--rerun')),out=resolve(arg('--out'));assert.ok(out!==originalPath&&out!==rerunPath,'Evidence reports cannot be overwritten');
  const [originalBytes,rerunBytes]=await Promise.all([readFile(originalPath),readFile(rerunPath)]),original=JSON.parse(originalBytes),rerun=JSON.parse(rerunBytes),root=resolve(rerun.binding.root??process.cwd());
  assert.equal(execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),rerun.binding.expectedCommit,'Current owner commit required');
  execFileSync('git',['merge-base','--is-ancestor',original.binding.expectedCommit,rerun.binding.expectedCommit],{cwd:root});
  const changedPaths=execFileSync('git',['diff','--name-only',original.binding.expectedCommit,rerun.binding.expectedCommit],{cwd:root,encoding:'utf8'}).trim().split('\n').filter(Boolean);
  const {growthSourceHash}=await import('./growth-host-support.mjs');process.chdir(root);assert.equal(await growthSourceHash(),rerun.binding.expectedSourceSha256,'Current QA source must equal targeted binding');
  for(const [key,path] of [['expectedGameJsSha256',resolve(rerun.binding.freeBuildRoot,'wechat/game.js')],['expectedBrowserJsSha256',resolve(rerun.binding.freeBuildRoot,'browser/app.js')],['expectedPaidGameJsSha256',resolve(rerun.binding.paidBuildRoot,'wechat/game.js')],['expectedPaidBrowserJsSha256',resolve(rerun.binding.paidBuildRoot,'browser/app.js')]])assert.equal(sha256(await readFile(path)),rerun.binding[key]);
  for(const row of RASTER_ART_CONTRACT)for(const base of [root,resolve(rerun.binding.freeBuildRoot,'browser'),resolve(rerun.binding.freeBuildRoot,'wechat'),resolve(rerun.binding.paidBuildRoot,'browser'),resolve(rerun.binding.paidBuildRoot,'wechat')])assert.equal(sha256(await readFile(resolve(base,row.src))),rerun.binding[row.hashKey]);
  const report=mergeRasterNavigationEvidence({original,rerun,originalEvidence:{path:originalPath,sha256:sha256(originalBytes)},rerunEvidence:{path:rerunPath,sha256:sha256(rerunBytes)},changedPaths});report.completedAt=new Date().toISOString();await mkdir(dirname(out),{recursive:true});await writeFile(out,JSON.stringify(report,null,2));console.log('PASS: 148 unique native cases cumulatively verified; 140 original passes plus eight bounded reruns.');
 }catch(error){console.error(error);process.exitCode=1;}
}
