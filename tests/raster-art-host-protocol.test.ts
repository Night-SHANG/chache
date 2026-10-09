import test from 'node:test';
import assert from 'node:assert/strict';
import { RASTER_ART_CONTRACT, assertRasterBinding, assertRasterManifests, assertRasterImageTrace, assertRasterDraws, assertRasterSnapshot } from '../scripts/raster-art-host-protocol.mjs';
const hash=(letter:string)=>letter.repeat(64);
const binding={ownerFrozen:true,aggregateChecksPassed:true,expectedCommit:'a'.repeat(40),expectedSourceSha256:hash('b'),expectedGameJsSha256:hash('c'),expectedBrowserJsSha256:hash('d'),expectedPaidGameJsSha256:hash('e'),expectedPaidBrowserJsSha256:hash('f'),freeBuildRoot:'/tmp/free',paidBuildRoot:'/tmp/paid',expectedVersion:'0.21.0-dev',expectedCatalogSize:53,expectedSetCount:15,expectedAtlasSha256:hash('1'),expectedThemedForkliftAtlasSha256:hash('2'),expectedBoardMaterialAtlasSha256:hash('3'),expectedSceneMaterialAtlasSha256:hash('4'),artScope:{status:'approved',styles:['wood','reinforced','ice_crystal']}};
const images=()=>RASTER_ART_CONTRACT.map(row=>({source:row.src,status:'loaded',sha256:binding[row.hashKey as keyof typeof binding],width:row.width,height:row.height,bytes:99}));
test('raster host is inert unless all exact owner-bound assets and independent builds exist',()=>{
 assertRasterBinding(binding);
 for(const patch of [{expectedVersion:'0.19.0-dev'},{expectedVersion:'0.20.0-dev'},{expectedVersion:'0.21.1-dev'},{expectedSetCount:11},{expectedSceneMaterialAtlasSha256:''},{ownerFrozen:false},{aggregateChecksPassed:false},{expectedCatalogSize:29},{expectedThemedForkliftAtlasSha256:''},{expectedBoardMaterialAtlasSha256:'short'},{paidBuildRoot:'/tmp/free'}]) assert.throws(()=>assertRasterBinding({...binding,...patch}));
});
test('raster manifest validates all four asset layouts, catalog paging, hashes and free/paid compile policy',()=>{
 const atlas=(name:string)=>{const row=RASTER_ART_CONTRACT.find(row=>row.manifestKey===name)!;return {...row.layout,sha256:binding[row.hashKey as keyof typeof binding],bytes:99};};
 const manifest={version:binding.expectedVersion,developerDiagnostics:false,shopPricingMode:'playtest-free',commit:binding.expectedCommit,sourceSha256:binding.expectedSourceSha256,cosmetics:{catalogSize:53,pageSize:4,setCount:15,setPageSize:4},modes:{rush:{maxToolTypes:2}},cargoAtlas:atlas('cargoAtlas'),themedForkliftAtlas:atlas('themedForkliftAtlas'),boardMaterialAtlas:atlas('boardMaterialAtlas'),sceneMaterialAtlas:atlas('sceneMaterialAtlas')};
 assertRasterManifests(manifest,structuredClone(manifest),binding,'free');
 for(const patch of [{cosmetics:{catalogSize:47,pageSize:4,setCount:11,setPageSize:4}},{sceneMaterialAtlas:{...manifest.sceneMaterialAtlas,variants:2}},{themedForkliftAtlas:{...manifest.themedForkliftAtlas,tileColumns:[0,1,2,3,4,5,6,7,8,9,10,11,12,13,14]}},{cosmetics:{catalogSize:47,pageSize:5}},{shopPricingMode:'paid'},{boardMaterialAtlas:{...manifest.boardMaterialAtlas,width:1}},{cargoAtlas:{...manifest.cargoAtlas,sha256:hash('f')}}]){const wrong={...manifest,...patch};assert.throws(()=>assertRasterManifests(wrong,structuredClone(wrong),binding,'free'));}
});
test('four actual image callbacks must decode owner bytes; pending, error, missing or repeated paths cannot pass',()=>{
 assertRasterImageTrace(images(),binding);
 for(const rows of [images().slice(0,2),[...images(),images()[0]],images().map((r,i)=>i? r:{...r,status:'pending'}),images().map((r,i)=>i? r:{...r,width:1}),images().map((r,i)=>i? r:{...r,sha256:hash('f')})])assert.throws(()=>assertRasterImageTrace(rows,binding));
});
test('passive native draw oracle requires exact selected crop and actual destination without inventing calls',()=>{
 const call={source:'assets/themed-forklifts.png',args:[256,0,128,128,-44,-40,80,80],alpha:1};
 assertRasterDraws([call],'assets/themed-forklifts.png',[256,0,128,128]);
 for(const rows of [[],[{...call,source:'other.png'}],[{...call,args:[0,0,128,128,-44,-40,80,80]}],[{...call,alpha:0}],[{...call,args:[256,0,128,128,-44,-40,0,80]}]])assert.throws(()=>assertRasterDraws(rows,'assets/themed-forklifts.png',[256,0,128,128]));
});
test('every package and source PNG must remain identical to all owner hashes before and after execution',()=>{
 const snapshot={commit:binding.expectedCommit,sourceSha256:binding.expectedSourceSha256,gameJsSha256:binding.expectedGameJsSha256,browserJsSha256:binding.expectedBrowserJsSha256,paidGameJsSha256:binding.expectedPaidGameJsSha256,paidBrowserJsSha256:binding.expectedPaidBrowserJsSha256,assets:Object.fromEntries(RASTER_ART_CONTRACT.flatMap(row=>['source','freeBrowser','freeWechat','paidBrowser','paidWechat'].map(scope=>[`${scope}:${row.src}`,binding[row.hashKey as keyof typeof binding]])))};
 assertRasterSnapshot(snapshot,binding);
 for(const key of Object.keys(snapshot.assets)){assert.throws(()=>assertRasterSnapshot({...snapshot,assets:{...snapshot.assets,[key]:hash('f')}},binding));}
});

test('v021 raster layouts append three vehicles and two coherent scenes without moving prior crops',()=>{
 const forklift=RASTER_ART_CONTRACT.find(row=>row.manifestKey==='themedForkliftAtlas')!;
 assert.equal(forklift.width,2048);assert.deepEqual(forklift.layout.tileColumns,[0,1,2,3,4,5,6,7,8,9,10,11,13,14,15]);assert.deepEqual(forklift.layout.paints,['electric','heavy','compact','toy','paper','space','steam','neon','lava','diving','royal','field','timber','ice','harbor']);
 const scene=RASTER_ART_CONTRACT.find(row=>row.manifestKey==='sceneMaterialAtlas');
 assert.ok(scene);assert.deepEqual([scene.width,scene.height,scene.layout.frameSize,scene.layout.tileSize,scene.layout.variants],[512,960,128,64,3]);
 assert.deepEqual(scene.layout.themes,['harbor','cold_chain','rail_freight','express_sorting','toy_workshop','paper_warehouse','space_cargo','steam_foundry','neon_depot','lava_forge','ocean_vault','royal_store','field_station','forest_depot','ice_vault']);
});

test('native theme oracle requires all three exact coherent tile variants and the eight perimeter slices',async()=>{
 const {assertRasterThemeDraws}=await import('../scripts/raster-art-host-protocol.mjs');
 const source='assets/scene-materials.png',theme='cold_chain',base=128;
 const draw=(crop:number[])=>({source,args:[...crop,0,0,20,20],alpha:1});
 const tiles=[3,4,5].map(i=>draw([i%8*64,512+Math.floor(i/8)*64,64,64]));
 const edges=[0,28,100].flatMap((y,row)=>[0,28,100].flatMap((x,col)=>row===1&&col===1?[]:[draw([base+x,y,[28,72,28][col],[28,72,28][row]])]));
 assertRasterThemeDraws([...tiles,...edges],theme,3);
 for(const rows of [tiles,edges,[...tiles.slice(1),...edges],[...tiles,...edges,draw([0,0,28,28])]])assert.throws(()=>assertRasterThemeDraws(rows,theme,3));
 const legacy={source:'assets/board-materials.png',args:[0,0,128,128,0,0,20,20],alpha:1};
 assertRasterThemeDraws([legacy],'day',1);assert.throws(()=>assertRasterThemeDraws([legacy,...tiles],'day',1));
});

test('v021 preserves the complete original board atlas layout while expanding cargo and scene layouts',()=>{
 const board=RASTER_ART_CONTRACT.find(row=>row.manifestKey==='boardMaterialAtlas')!;
 assert.deepEqual([board.width,board.height],[512,512]);
 assert.deepEqual(board.layout.themes,['day','night','harbor','cold_chain','rail_freight','express_sorting','toy_workshop','paper_warehouse','space_cargo','steam_foundry','neon_depot','lava_forge','ocean_vault','royal_store','field_station']);
 const cargo=RASTER_ART_CONTRACT.find(row=>row.manifestKey==='cargoAtlas')!;
 assert.deepEqual([cargo.width,cargo.height],[670,2010]);
 assert.deepEqual(cargo.layout.styles,['wood','insulated','reinforced','taped','toy_brick','paper_fold','space_case','ice_crystal','steam_brass','neon_circuit','lava_core','ocean_relic','royal_gold','field_supply','harbor_container']);
});


test('native scene oracle binds padded new forest and ice crops without moving the thirteen old treatments',async()=>{
 const {assertRasterThemeDraws}=await import('../scripts/raster-art-host-protocol.mjs');
 const scene=RASTER_ART_CONTRACT.find(row=>row.manifestKey==='sceneMaterialAtlas')!;
 for(const [key,value] of Object.entries({tileBaseY:512,tileColumns:8,frameColumns:4,extensionThemeStart:13,extensionTileBaseY:896}))assert.equal(scene.layout[key],value);
 for(const [theme,index] of [['forest_depot',13],['ice_vault',14]] as const){
  const draw=(crop:number[])=>({source:'assets/scene-materials.png',args:[...crop,0,0,20,20],alpha:1});
  const tiles=[0,1,2].map(variant=>draw([((index-13)*3+variant)*64,896,64,64]));
  const edges=[0,28,100].flatMap((y,row)=>[0,28,100].flatMap((x,col)=>row===1&&col===1?[]:[draw([index%4*128+x,Math.floor(index/4)*128+y,[28,72,28][col],[28,72,28][row]])]));
  assertRasterThemeDraws([...tiles,...edges],theme,3);
  const oldPacking=[0,1,2].map(variant=>{const tile=index*3+variant;return draw([tile%8*64,512+Math.floor(tile/8)*64,64,64]);});
  assert.throws(()=>assertRasterThemeDraws([...oldPacking,...edges],theme,3));
 }
});


test('native forklift crop coordinates preserve old columns and skip the transparent separator',async()=>{
 const {RASTER_FORKLIFTS,RASTER_FORKLIFT_COLUMNS}=await import('../scripts/raster-art-host-protocol.mjs');
 assert.deepEqual(RASTER_FORKLIFT_COLUMNS,[0,1,2,3,4,5,6,7,8,9,10,11,13,14,15]);
 assert.equal(RASTER_FORKLIFT_COLUMNS.length,RASTER_FORKLIFTS.length);
 for(const [paint,x] of [['field',1408],['timber',1664],['ice',1792],['harbor',1920]] as const){
  assert.equal(RASTER_FORKLIFT_COLUMNS[RASTER_FORKLIFTS.indexOf(paint)]*128,x);
 }
});
