import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {STATIC_ART_RESOURCES,STATIC_ART_SCENES,STATIC_ART_PREVIEWS,STATIC_ART_FORKLIFTS} from '../src/presentation/static-art-manifest.ts';

const themes=['day','night','cold_chain','rail_freight','toy_workshop','paper_warehouse','space_cargo','steam_foundry','lava_forge','ocean_vault','forest_depot','ice_vault'];
const forklifts=['yellow','blue','red','white','electric','heavy','toy','paper','space','steam','lava','diving','timber','ice'];
const read=(path:string)=>readFile(new URL(`../${path}`,import.meta.url),'utf8');
test('one local package contains exactly active scenes, item previews and shared atlas resources',()=>{
 assert.deepEqual(Object.keys(STATIC_ART_SCENES).sort(),[...themes].sort());
 assert.deepEqual(Object.keys(STATIC_ART_PREVIEWS).sort(),[...themes].sort());
 assert.deepEqual(Object.keys(STATIC_ART_FORKLIFTS).sort(),[...forklifts].sort());
 for(const previews of Object.values(STATIC_ART_PREVIEWS))assert.deepEqual(Object.keys(previews),['item']);
 const expected=[...themes.map(id=>`scene.${id}`),...themes.map(id=>`preview.${id}.item`),'forklift.base','forklift.styled','cargo.core','tools.core','frame.classic','material.board','material.cargo','material.scene'];
 assert.deepEqual(Object.keys(STATIC_ART_RESOURCES).sort(),expected.sort());
 for(const resource of Object.values(STATIC_ART_RESOURCES)){
  assert.equal(resource.package,'main',resource.key);
  assert.equal(resource.src,resource.sourcePath,resource.key);
  assert.ok(resource.src.startsWith('assets/'),resource.src);
 }
});

test('browser, WeChat and Android builds cannot create or copy a cosmetics subpackage',async()=>{
 const wechat=await read('scripts/build.mjs'),android=await read('scripts/build-android.mjs');
 assert.doesNotMatch(wechat,/subpackages\s*:|cosmetics\/game\.js/);
 assert.doesNotMatch(android,/'cosmetics'/);
});

test('canonical manifest generation exposes only the main package type',async()=>{
 const {manifestSource}=await import(new URL('../scripts/static-art-authoring/manifest-source.mjs',import.meta.url).href);
 const metadata=JSON.parse(await read('scripts/static-art-authoring/resources.json'));
 const generated=manifestSource(metadata);
 assert.match(generated,/readonly package:'main';/);
 assert.equal(await read('src/presentation/static-art-manifest.ts'),generated);
});

test('single-package size report accounts for every byte and flags raw oversize without splitting',async()=>{
 const module=await import(new URL('../scripts/wechat-package-report.mjs',import.meta.url).href).catch(()=>null);
 assert.ok(module,'the single-package size reporter must exist');
 const inventory=[{path:'game.js',bytes:600000},{path:'assets/scene.png',bytes:5*1024*1024},{path:'game.json',bytes:30}];
 const report=module.wechatPackageReport(inventory);
 const expected=inventory.reduce((sum,item)=>sum+item.bytes,0);
 assert.equal(report.packaging,'single');assert.equal(report.mainBytes,expected);assert.equal(report.totalBytes,expected);
 assert.deepEqual(report.subpackageBytes,{});assert.equal(report.rawMainPackageOverLimit,true);
 assert.equal(report.rawMainPackageOverLimitBytes,expected-4*1024*1024);
 assert.equal(report.processedIdeBytes,null);assert.match(report.processedIdeStatus,/NOT RUN/);
 assert.deepEqual(report.inventory,inventory);
 const under=module.wechatPackageReport([{path:'game.js',bytes:4*1024*1024}]);
 assert.equal(under.rawMainPackageOverLimit,false);assert.equal(under.rawMainPackageOverLimitBytes,0);
 assert.throws(()=>module.wechatPackageReport([{path:'cosmetics/game.js',bytes:10}]),/single.package/i);
});
