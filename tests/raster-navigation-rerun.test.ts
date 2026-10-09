import test from 'node:test';
import assert from 'node:assert/strict';
import * as rerun from '../scripts/raster-art-host-rerun.mjs';
import {RASTER_ART_CONTRACT,RASTER_PRIOR_CASES} from '../scripts/raster-art-host-protocol.mjs';
const hash=(char:string)=>char.repeat(64);
function fixture(){
 const old={ownerFrozen:true,aggregateChecksPassed:true,expectedCommit:'a'.repeat(40),expectedSourceSha256:hash('a'),expectedVersion:'0.21.0-dev',expectedCatalogSize:53,expectedSetCount:15,expectedGameJsSha256:hash('b'),expectedBrowserJsSha256:hash('c'),expectedPaidGameJsSha256:hash('d'),expectedPaidBrowserJsSha256:hash('e'),expectedAtlasSha256:hash('1'),expectedThemedForkliftAtlasSha256:hash('2'),expectedBoardMaterialAtlasSha256:hash('3'),expectedSceneMaterialAtlasSha256:hash('4'),freeBuildRoot:'/tmp/free',paidBuildRoot:'/tmp/paid',artScope:{status:'approved',styles:['wood','reinforced','ice_crystal']}};
 const current={...old,expectedCommit:'b'.repeat(40),expectedSourceSha256:hash('f')};
 const snapshot=(binding:typeof old)=>({commit:binding.expectedCommit,sourceSha256:binding.expectedSourceSha256,gameJsSha256:binding.expectedGameJsSha256,browserJsSha256:binding.expectedBrowserJsSha256,paidGameJsSha256:binding.expectedPaidGameJsSha256,paidBrowserJsSha256:binding.expectedPaidBrowserJsSha256,assets:Object.fromEntries(RASTER_ART_CONTRACT.flatMap(row=>['source','freeBrowser','freeWechat','paidBrowser','paidWechat'].map(scope=>[`${scope}:${row.src}`,binding[row.hashKey as keyof typeof old]])))});
 const original={status:'FAIL',scope:'full',binding:old,children:['free','paid'].map(mode=>({mode,exitCode:1,report:{status:'FAIL',mode,binding:old,beginning:snapshot(old),ending:snapshot(old),cases:rerun.rasterExpectedCases(mode).map(name=>rerun.rasterNavigationCases(mode).includes(name)?{name,status:'FAIL',error:'AssertionError: Touch control exists {"type":"selectCosmeticSetPage","page":1} in shop/cleanup'}:{name,status:'PASS',proof:'original untouched result'})}}))};
 const targeted={status:'PASS',scope:'targeted',selection:'set-preview-navigation',binding:current,children:['free','paid'].map(mode=>({mode,exitCode:0,report:{status:'PASS',scope:'targeted',selection:'set-preview-navigation',mode,binding:current,beginning:snapshot(current),ending:snapshot(current),cases:rerun.rasterNavigationCases(mode).map(name=>({name,status:'PASS',proof:'actual rerun result'}))}}))};
 return {original,rerun:targeted,originalEvidence:{path:'/evidence/first-run/report.json',sha256:hash('6')},rerunEvidence:{path:'/evidence/targeted-navigation/report.json',sha256:hash('7')},changedPaths:['scripts/raster-set-host-runtime.mjs','scripts/raster-art-host-rerun.mjs','tests/raster-navigation-rerun.test.ts']};
}
test('navigation selector permits exactly four retained IDs per mode and no arbitrary filtering',()=>{
 assert.equal(typeof rerun.rasterSelectedCases,'function');
 for(const mode of ['free','paid']){assert.equal(rerun.rasterSelectedCases(mode),null);assert.deepEqual(rerun.rasterSelectedCases(mode,'set-preview-navigation'),RASTER_PRIOR_CASES[mode].filter(name=>name.includes('-set-twelve-previews-cancel-pages-tools-')));assert.equal(rerun.rasterSelectedCases(mode,'set-preview-navigation')?.length,4);}
 for(const only of ['','all','bundle','set-preview','*'])assert.throws(()=>rerun.rasterSelectedCases('free',only));assert.throws(()=>rerun.rasterSelectedCases('wrong','set-preview-navigation'));
});
test('cumulative acceptance requires exactly140 original passes plus8 successful replacements, preserving both bindings and failures',()=>{
 assert.equal(typeof rerun.mergeRasterNavigationEvidence,'function');const input=fixture(),before=structuredClone(input),result=rerun.mergeRasterNavigationEvidence(input);
 assert.deepEqual(input,before);assert.equal(result.status,'PASS');assert.equal(result.singleRunAllGreen,false);assert.deepEqual(result.counts,{unique:148,passed:148,failed:0,originalPassed:140,originalFailed:8,rerunPassed:8,retainedPrevious:106,added:42});
 assert.deepEqual(result.binding,input.rerun.binding);assert.equal((result.originalRun as {binding:unknown}).binding,input.original.binding);
});
test('cumulative proof refuses missing, duplicate, added, unpassed or unrelated rerun cases',()=>{
 assert.equal(typeof rerun.mergeRasterNavigationEvidence,'function');
 const mutations=[(x:ReturnType<typeof fixture>)=>x.rerun.children[0].report.cases.pop(),(x:ReturnType<typeof fixture>)=>x.rerun.children[0].report.cases.push(x.rerun.children[0].report.cases[0]),(x:ReturnType<typeof fixture>)=>x.rerun.children[0].report.cases[0].name='unrelated',(x:ReturnType<typeof fixture>)=>x.rerun.children[0].report.cases[0].status='FAIL',(x:ReturnType<typeof fixture>)=>x.original.children[0].report.cases[0].status='FAIL',(x:ReturnType<typeof fixture>)=>x.original.children[0].report.cases.pop()];
 for(const mutate of mutations){const input=fixture();mutate(input);assert.throws(()=>rerun.mergeRasterNavigationEvidence(input));}
});
test('cumulative proof rejects changed product bytes, ambiguous snapshots, or non-QA source changes',()=>{
 assert.equal(typeof rerun.mergeRasterNavigationEvidence,'function');
 for(const mutate of [(x:ReturnType<typeof fixture>)=>x.rerun.binding.expectedGameJsSha256=hash('9'),(x:ReturnType<typeof fixture>)=>x.rerun.binding.expectedSceneMaterialAtlasSha256=hash('9'),(x:ReturnType<typeof fixture>)=>x.rerun.children[0].report.ending.sourceSha256=hash('0'),(x:ReturnType<typeof fixture>)=>x.original.children[0].report.ending.gameJsSha256=hash('9'),(x:ReturnType<typeof fixture>)=>x.changedPaths.push('src/application/session.ts'),(x:ReturnType<typeof fixture>)=>x.changedPaths.push('assets/scene-materials.png'),(x:ReturnType<typeof fixture>)=>x.changedPaths.length=0,(x:ReturnType<typeof fixture>)=>x.originalEvidence.sha256=''] ){
  const input=fixture();mutate(input);assert.throws(()=>rerun.mergeRasterNavigationEvidence(input));
 }
});
