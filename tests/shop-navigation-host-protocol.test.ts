import test from 'node:test';
import assert from 'node:assert/strict';
import * as p from '../scripts/shop-navigation-host-protocol.mjs';
import {RASTER_ART_CONTRACT} from '../scripts/raster-art-host-protocol.mjs';
import {readFile} from 'node:fs/promises';
const hash='a'.repeat(64),commit='b'.repeat(40);
function binding(){return {ownerFrozen:true,aggregateChecksPassed:true,expectedVersion:'0.22.0-dev',expectedCommit:commit,expectedSourceSha256:hash,expectedGameJsSha256:hash,expectedBrowserJsSha256:hash,expectedPaidGameJsSha256:hash,expectedPaidBrowserJsSha256:hash,expectedCatalogSize:53,expectedSetCount:16,freeBuildRoot:'/frozen/free',paidBuildRoot:'/frozen/paid',...p.SHOP_V021_ASSET_HASHES};}

test('v22 acceptance requires owner-frozen aggregate-cleared independent packages and exact unchanged assets',()=>{
 assert.equal(typeof p.assertShopNavigationBinding,'function');
 p.assertShopNavigationBinding(binding());
 for(const patch of [{ownerFrozen:false},{aggregateChecksPassed:false},{expectedVersion:'0.21.0-dev'},{expectedCatalogSize:47},{expectedSetCount:12},{paidBuildRoot:'/frozen/free'},{expectedAtlasSha256:hash},{expectedCommit:'short'}])assert.throws(()=>p.assertShopNavigationBinding({...binding(),...patch}));
});
test('v22 evidence names cannot silently retain old page-navigation case identities',()=>{
 assert.equal(typeof p.shopNavigationCaseNames,'function');
 for(const mode of ['free','paid']){
  const names=p.shopNavigationCaseNames(mode);assert.equal(names.length,new Set(names).size);assert.ok(names.length>=20);assert.ok(names.every(name=>name.startsWith(`${mode}-v022-`)));
  assert.deepEqual(p.assertShopNavigationCoverage(names.map(name=>({name,status:'PASS'})),mode),{passed:names.length,failed:0,total:names.length,nativeCases:names.length-1,sourceChecks:1,inherited:0});
  assert.throws(()=>p.assertShopNavigationCoverage(names.slice(1).map(name=>({name,status:'PASS'})),mode));
  assert.throws(()=>p.assertShopNavigationCoverage([...names,names[0]].map(name=>({name,status:'PASS'})),mode));
  assert.throws(()=>p.assertShopNavigationCoverage([...names,'free-set-preview-pages'].map(name=>({name,status:'PASS'})),mode));
 }
});
test('native detail/list guard rejects global detail tabs and legacy page controls',()=>{
 assert.equal(typeof p.assertShopRouteControls,'function');
 const rect={x:132,y:620,w:396,h:200};
 const list=[...['tools','cosmetics'].map(tab=>({rect,action:{type:'selectShopTab',tab}})),...['sets','theme','cargo','forklift'].map(section=>({rect,action:{type:'selectShopSection',section}})),{rect,action:{type:'previewCosmeticSet',id:'cold_chain'}}];
 assert.doesNotThrow(()=>p.assertShopRouteControls(list,{detail:false}));
 assert.throws(()=>p.assertShopRouteControls([...list,{rect,action:{type:'selectCosmeticPage',page:1}}],{detail:false}));
 assert.throws(()=>p.assertShopRouteControls(list,{detail:true}));
 assert.doesNotThrow(()=>p.assertShopRouteControls([{rect,action:{type:'closeShopDetail'}}],{detail:true}));
 assert.throws(()=>p.assertShopRouteControls(list.map(c=>c.action.type==='previewCosmeticSet'?{...c,rect:{...rect,y:590}}:c),{detail:false}));
});
test('new entry point contains no build call or old-pass report merge',async()=>{
 const source=await readFile(new URL('../scripts/host-shop-navigation.mjs',import.meta.url),'utf8');
 assert.doesNotMatch(source,/scripts\/build|runRasterArtNative|rasterSelectedCases|mergeRaster/);
 assert.match(source,/createBoundFinalEconomyHost|runShopNavigationNative/);
 const {runShopNavigationHost}=await import('../scripts/host-shop-navigation.mjs');
 await assert.rejects(runShopNavigationHost(undefined),/binding.*required/i);
});

test('v22 manifests bind scroll-detail structure, pricing mode and original atlas layouts',()=>{
 const b=binding(),manifest={version:b.expectedVersion,commit:b.expectedCommit,sourceSha256:b.expectedSourceSha256,developerDiagnostics:false,shopPricingMode:'playtest-free',cosmetics:{...p.SHOP_NAVIGATION_MANIFEST},modes:{rush:{maxToolTypes:2}},...Object.fromEntries(RASTER_ART_CONTRACT.map(row=>[row.manifestKey,{...row.layout,sha256:p.SHOP_V021_ASSET_HASHES[row.hashKey],bytes:100}]))};
 p.assertShopNavigationManifests(manifest,structuredClone(manifest),b,'free');
 for(const patch of [{cosmetics:{catalogSize:53,setCount:16,pageSize:4,setPageSize:4}},{developerDiagnostics:true},{shopPricingMode:'paid'},{sourceSha256:'c'.repeat(64)}]){const invalid={...manifest,...patch};assert.throws(()=>p.assertShopNavigationManifests(invalid,structuredClone(invalid),b,'free'));}
});
