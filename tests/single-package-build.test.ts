import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {build} from 'esbuild';
import {STATIC_ART_SHARED_KEYS} from '../src/presentation/static-art-requirements.ts';
import {COSMETIC_CATALOG,HISTORICAL_COSMETIC_CATALOG} from '../src/application/cosmetics.ts';
import {STATIC_ART_RESOURCES,STATIC_ART_SCENES,STATIC_ART_PREVIEWS,STATIC_ART_FORKLIFTS} from '../src/presentation/static-art-manifest.ts';

const themes=['day','night','cold_chain','rail_freight','toy_workshop','paper_warehouse','space_cargo','steam_foundry','ocean_vault'];
const forklifts=['yellow','blue','red','white','electric','heavy','toy','paper','space','steam','diving'];
const read=(path:string)=>readFile(new URL(`../${path}`,import.meta.url),'utf8');
test('one local package contains exactly active scenes and shared atlas resources without item preview PNGs',()=>{
 assert.equal(COSMETIC_CATALOG.length,29);assert.equal(HISTORICAL_COSMETIC_CATALOG.length,53);
 assert.deepEqual(['theme','cargo','forklift'].map(kind=>COSMETIC_CATALOG.filter(item=>item.kind===kind).length),[9,9,11]);
 assert.deepEqual(Object.keys(STATIC_ART_SCENES).sort(),[...themes].sort());
 assert.deepEqual(STATIC_ART_PREVIEWS,{});
 assert.deepEqual(Object.keys(STATIC_ART_FORKLIFTS).sort(),[...forklifts].sort());
 const expected=[...themes.map(id=>`scene.${id}`),'forklift.base','forklift.styled','cargo.core','tools.core','frame.classic','material.board','material.cargo','material.scene'];
 assert.equal(expected.length,17);assert.deepEqual(Object.keys(STATIC_ART_RESOURCES).sort(),expected.sort());
 const referenced=[...Object.values(STATIC_ART_SCENES).map(sprite=>sprite.resource),...STATIC_ART_SHARED_KEYS];
 assert.deepEqual([...new Set(referenced)].sort(),Object.keys(STATIC_ART_RESOURCES).sort(),'all requested resources exist and every packaged PNG is referenced');
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


test('browser, WeChat and Android production entry bundles contain no obsolete preview PNG requests',async()=>{
 for(const entry of ['browser-main','wechat-main','android-main']){
  const compiled=await build({entryPoints:[`src/${entry}.ts`],bundle:true,write:false,platform:'browser',format:'iife',minify:true,define:{__PLAYTEST_FREE_SHOP__:'false'}});
  assert.doesNotMatch(compiled.outputFiles[0].text,/preview-[a-z_]+-(?:item|card|set|classic)\.png/,entry);
 }
});
