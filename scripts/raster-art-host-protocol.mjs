/** v0.21 read-only acceptance contract. No product import, bundle execution or build. */
import assert from 'node:assert/strict';
import priorCases from './raster-art-host-baseline-cases.json' with {type:'json'};
import { resolve } from 'node:path';
export const RASTER_CARGO_STYLES=['wood','insulated','reinforced','taped','toy_brick','paper_fold','space_case','ice_crystal','steam_brass','neon_circuit','lava_core','ocean_relic','royal_gold','field_supply','harbor_container'];
export const RASTER_THEMES=['day','night','harbor','cold_chain','rail_freight','express_sorting','toy_workshop','paper_warehouse','space_cargo','steam_foundry','neon_depot','lava_forge','ocean_vault','royal_store','field_station','forest_depot','ice_vault'];
export const RASTER_FORKLIFTS=['electric','heavy','compact','toy','paper','space','steam','neon','lava','diving','royal','field','timber','ice','harbor'];
export const RASTER_FORKLIFT_COLUMNS=Object.freeze([0,1,2,3,4,5,6,7,8,9,10,11,13,14,15]);
export const RASTER_SCENE_THEMES=RASTER_THEMES.slice(2);
export const RASTER_ART_CONTRACT=[
 {manifestKey:'cargoAtlas',hashKey:'expectedAtlasSha256',layout:{src:'assets/cargo-materials.png',width:670,height:2010,tileSize:134,padding:3,bodySize:128,styles:RASTER_CARGO_STYLES,cargos:['cargo.food','cargo.machine','cargo.chem','cargo.electronic','cargo.cold']}},
 {manifestKey:'themedForkliftAtlas',hashKey:'expectedThemedForkliftAtlasSha256',layout:{src:'assets/themed-forklifts.png',width:2048,height:128,tileSize:128,tileColumns:RASTER_FORKLIFT_COLUMNS,paints:RASTER_FORKLIFTS}},
 {manifestKey:'boardMaterialAtlas',hashKey:'expectedBoardMaterialAtlasSha256',layout:{src:'assets/board-materials.png',width:512,height:512,tileSize:128,themes:RASTER_THEMES.slice(0,15)}},
 {manifestKey:'sceneMaterialAtlas',hashKey:'expectedSceneMaterialAtlasSha256',layout:{src:'assets/scene-materials.png',width:512,height:960,frameSize:128,tileSize:64,variants:3,tileBaseY:512,tileColumns:8,frameColumns:4,extensionThemeStart:13,extensionTileBaseY:896,themes:RASTER_SCENE_THEMES}},
].map(row=>Object.freeze({...row,src:row.layout.src,width:row.layout.width,height:row.layout.height}));
export function assertRasterBinding(binding){
 assert.equal(binding?.ownerFrozen,true,'Owner-supplied frozen snapshot required');
 assert.equal(binding.aggregateChecksPassed,true,'Final aggregate checks must pass first');
 assert.match(binding.expectedCommit??'',/^[a-f0-9]{40}$/,'Exact owner HEAD required');
 for(const key of ['expectedSourceSha256','expectedGameJsSha256','expectedBrowserJsSha256','expectedPaidGameJsSha256','expectedPaidBrowserJsSha256',...RASTER_ART_CONTRACT.map(row=>row.hashKey)])assert.match(binding[key]??'',/^[a-f0-9]{64}$/,`Exact owner ${key} required`);
 assert.ok(binding.freeBuildRoot&&binding.paidBuildRoot,'Independent free and paid packages required');
 assert.notEqual(resolve(binding.freeBuildRoot),resolve(binding.paidBuildRoot),'Paid checks cannot overwrite free artifacts');
 assert.equal(binding.expectedVersion,'0.21.0-dev','Exact v0.21.0-dev owner version required');
 assert.equal(binding.expectedSetCount,15,'Exact 15 atomic set groups required');
 assert.equal(binding.expectedCatalogSize,53,'Exact 53-item reviewed catalog required');
 assert.equal(binding.artScope?.status,'approved');
 assert.deepEqual([...binding.artScope.styles].sort(),['ice_crystal','reinforced','wood'],'Retain the full prior three-style native regression matrix');
}
export function assertRasterManifests(browser,wechat,binding,mode){
 assert.deepEqual(browser,wechat,'Native and browser manifests must match');
 for(const [field,key] of [['version','expectedVersion'],['commit','expectedCommit'],['sourceSha256','expectedSourceSha256']])assert.equal(wechat[field],binding[key]);
 assert.equal(wechat.developerDiagnostics,false);assert.equal(wechat.shopPricingMode,mode==='free'?'playtest-free':'paid');
 assert.deepEqual(wechat.cosmetics,{catalogSize:53,pageSize:4,setCount:15,setPageSize:4});assert.equal(wechat.modes.rush.maxToolTypes,2);
 for(const row of RASTER_ART_CONTRACT){const actual=wechat[row.manifestKey];assert.ok(actual,`${row.manifestKey} manifest missing`);for(const [key,value]of Object.entries(row.layout))assert.deepEqual(actual[key],value,`${row.manifestKey}.${key}`);assert.equal(actual.sha256,binding[row.hashKey]);assert.ok(actual.bytes>0);}
 return wechat;
}
export function assertRasterImageTrace(trace,binding){
 assert.equal(trace.length,4,'Actual bundle must request exactly four packaged PNGs');
 for(const row of RASTER_ART_CONTRACT){const matches=trace.filter(image=>image.source===row.src);assert.equal(matches.length,1,`One actual image request required: ${row.src}`);const image=matches[0];assert.equal(image.status,'loaded',`Decode incomplete: ${row.src}`);assert.equal(image.sha256,binding[row.hashKey]);assert.deepEqual([image.width,image.height],[row.width,row.height]);assert.ok(image.bytes>0);}
}
export function assertRasterDraws(draws,source,crop){
 const matches=draws.filter(row=>row.source===source&&row.alpha>0&&row.args.length===8&&row.args.slice(0,4).every((value,index)=>value===crop[index])&&row.args[6]>0&&row.args[7]>0);
 assert.ok(matches.length,`Actual native drawImage missing ${source} crop ${crop.join(',')}`);return matches;
}
export function assertRasterSnapshot(snapshot,binding){
 for(const [field,key]of Object.entries({commit:'expectedCommit',sourceSha256:'expectedSourceSha256',gameJsSha256:'expectedGameJsSha256',browserJsSha256:'expectedBrowserJsSha256',paidGameJsSha256:'expectedPaidGameJsSha256',paidBrowserJsSha256:'expectedPaidBrowserJsSha256'}))assert.equal(snapshot[field],binding[key],`Owner snapshot changed: ${field}`);
 for(const row of RASTER_ART_CONTRACT)for(const scope of ['source','freeBrowser','freeWechat','paidBrowser','paidWechat'])assert.equal(snapshot.assets[`${scope}:${row.src}`],binding[row.hashKey],`Owner PNG differs: ${scope}/${row.src}`);
}
/** Independent exact pixel-source contract: protected themes use the old atlas;
 * coherent themes must use every static interior variant and each perimeter slice. */
export function assertRasterThemeDraws(draws,theme,minimumBoardCells){
 const themeIndex=RASTER_THEMES.indexOf(theme);assert.ok(themeIndex>=0,'Reviewed native theme required');
 if(themeIndex<2){
  const crop=[themeIndex*128,0,128,128],calls=assertRasterDraws(draws,'assets/board-materials.png',crop);
  assert.ok(calls.length>=minimumBoardCells,'Every protected board cell samples its original texture');
  assert.equal(draws.filter(row=>row.source==='assets/scene-materials.png').length,0,'Protected initial themes must not draw new scene artwork');
  assert.ok(draws.filter(row=>row.source==='assets/board-materials.png').every(row=>JSON.stringify(row.args.slice(0,4))===JSON.stringify(crop)),'No wrong protected texture');return {tiles:calls.length,frame:0,variants:1};
 }
 const index=themeIndex-2,source='assets/scene-materials.png',tileCrops=[0,1,2].map(variant=>{const tile=(index<13?index:index-13)*3+variant;return [tile%8*64,(index<13?512:896)+Math.floor(tile/8)*64,64,64];});
 const frameCrops=[0,28,100].flatMap((y,row)=>[0,28,100].flatMap((x,col)=>row===1&&col===1?[]:[[index%4*128+x,Math.floor(index/4)*128+y,[28,72,28][col],[28,72,28][row]]]));
 const tileCalls=tileCrops.flatMap(crop=>assertRasterDraws(draws,source,crop));
 const frameCalls=frameCrops.flatMap(crop=>assertRasterDraws(draws,source,crop));
 assert.ok(tileCalls.length>=minimumBoardCells,'Every coherent board cell must sample its chosen theme');
 const allowed=new Set([...tileCrops,...frameCrops].map(crop=>JSON.stringify(crop)));
 for(const draw of draws.filter(row=>row.source===source)){assert.ok(allowed.has(JSON.stringify(draw.args.slice(0,4))),'No other theme crop on native scene');assert.ok(draw.args[6]>0&&draw.args[7]>0,'Scene materials never mirror destination pixels');}
 assert.equal(draws.filter(row=>row.source==='assets/board-materials.png').length,0,'Ready coherent theme must not retain mismatched old board materials');
 return {tiles:tileCalls.length,frame:frameCalls.length,variants:tileCrops.length};
}

/** Independent price/receipt oracle. It never calls the product quote or transaction code. */
export function rasterBundleQuote(set,account,mode){
 assert.ok(['free','paid'].includes(mode),'Known native compile policy required');
 const prices={theme:900,cargo:300,forklift:600};
 const missing=Object.keys(prices).filter(kind=>!account.profile.ownedCosmetics.includes(`${kind}.${set[kind]}`));
 const originalPrice=missing.reduce((sum,kind)=>sum+prices[kind],0);
 return {missingKeys:missing.map(kind=>`${kind}.${set[kind]}`),originalPrice,price:mode==='free'?0:Math.ceil(originalPrice*4/5)};
}
export function assertRasterBundleCommit(before,after,set,mode){
 const quote=rasterBundleQuote(set,before,mode);
 if(!quote.missingKeys.length){assert.deepEqual(after,before,'Fully owned set is a no-op, including receipt');return quote;}
 assert.equal(after.generation,before.generation+1,'Entire bundle commits one generation');
 assert.equal(after.wallet,before.wallet-quote.price,'Only missing members are charged at rounded-up 80 percent');
 assert.deepEqual(after.profile.ownedCosmetics,[...new Set([...before.profile.ownedCosmetics,...quote.missingKeys])].sort(),'Exactly the missing member rights are granted together');
 const receipt=after.lastOperation;assert.ok(receipt&&typeof receipt.operationId==='string'&&receipt.operationId.length>0,'Actual persisted bundle receipt required');
 assert.notEqual(receipt.operationId,before.lastOperation?.operationId,'Bundle purchase needs its own operation identity');
 const request={type:'purchaseCosmeticSet',id:set.id,quotedKeys:quote.missingKeys,quotedPrice:quote.price,operationId:receipt.operationId};
 const normalize=value=>Array.isArray(value)?value.map(normalize):value!==null&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,normalize(value[key])])):value;
 let digest=2166136261;for(const byte of Buffer.from(JSON.stringify(normalize({request,expectedGeneration:before.generation}))))digest=Math.imul(digest^byte,16777619);
 assert.deepEqual(receipt,{operationId:request.operationId,expectedGeneration:before.generation,requestDigest:(digest>>>0).toString(16).padStart(8,'0'),committedGeneration:after.generation},'Receipt must bind the actual missing keys, quote, set and single generation');
 const preserved=structuredClone(after);preserved.generation=before.generation;preserved.wallet=before.wallet;preserved.lastOperation=structuredClone(before.lastOperation);preserved.profile.ownedCosmetics=structuredClone(before.profile.ownedCosmetics);
 assert.deepEqual(preserved,before,'Purchase never equips or changes unrelated account state');return quote;
}

export const RASTER_PRIOR_CASES=Object.freeze(Object.fromEntries(Object.entries(priorCases.cases).map(([mode,names])=>[mode,Object.freeze(names)])));
export function assertRasterPriorCaseCoverage(cases,mode){
 assert.ok(['free','paid'].includes(mode));assert.equal(RASTER_PRIOR_CASES[mode].length,mode==='free'?87:19,'The complete frozen 106-case baseline is required');
 const names=cases.map(row=>row.name);assert.equal(new Set(names).size,names.length,'Every native case must have a unique evidence identity');
 for(const name of RASTER_PRIOR_CASES[mode])assert.ok(names.includes(name),`Prior native regression omitted: ${name}`);
 return {retained:RASTER_PRIOR_CASES[mode].length,added:names.length-RASTER_PRIOR_CASES[mode].length};
}

/** Exact RGBA board region from v0.20 frozen original game.js 2a74693be388df524512bbdcce9c71a60300d222820e8c289575616558fa1aa5.
 * Provenance: artifacts/v0200-host/final/free/theme-{day,night}-{inbound,outbound}.png.
 * Native viewport 360x800, safeTop24, DPR2; logical region x118/y535/w845/h895. */
const protectedBoardHashes=Object.freeze({day:Object.freeze({inbound:'e164af4f2966d62b4229cf22f17ab79b55a7db7254322d39d26a10558b34343f',outbound:'9e18577d548f6df1d0df4ec8e204fa31c4d12996858994ef9fac22e4f6c877d2'}),night:Object.freeze({inbound:'1f0aa59c5ea4042de4959d3ba70dea47124e2a2cf1e05648f9ae31544991182b',outbound:'a0907dfdfd1850ea2067532abe64eb471505c3506a1c40793f6157f89b6aeae3'})});
export function assertRasterProtectedBoardHash(theme,family,hash){
 assert.ok(protectedBoardHashes[theme]?.[family],'Protected board theme and family required');
 assert.equal(hash,protectedBoardHashes[theme][family],`Original ${theme}/${family} native board pixels must remain byte-exact`);
}
