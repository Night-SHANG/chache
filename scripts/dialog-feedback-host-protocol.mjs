/** v0.18 native-host contract. Independent expectations, no product imports or bundle execution. */
import assert from 'node:assert/strict';
import {resolve} from 'node:path';

export const EXACT_RUSH_SENTENCE='加急数字按后续成功放置次数倒数，不是倒计时';
export const WILDCARD_LINES=['入库：将待放货件换成单格万能箱。','出库：换成单格，自选食品、机械或化工。'];
export const REMOVED_HELP_LINES=['入库五班和无限模式没有加急货或废物。','入库五班和无限模式没有加急货或废弃箱。','入库下次放置时检查出货；出库立即检查出货。'];
export const DIALOG_VIEWPORTS=[{width:360,height:800,safeTop:24,dpr:2},{width:540,height:960,safeTop:0,dpr:1},{width:1200,height:900,safeTop:0,dpr:1}];
export const DIALOG_QA_PROTOCOL={
 execution:'Byte-for-byte owner-bound native wx/Canvas game.js; source imports supply touch geometry and reducer comparisons only.',
 gates:['Explicit owner freeze and successful aggregate checks','HEAD, source tree hash, free/paid browser and game.js hashes before and after','Reviewed art scope: unchanged or exact approved target styles'],
 viewports:DIALOG_VIEWPORTS,
 scenarios:[
  {case:'free and paid tool/cosmetic confirmation',sizes:'all',assertions:['confirm yellow, cancel blue, labels painted within actionable bounds','cancel: zero writes and exact unchanged storage','confirm: one generation, exact price/stock/ownership, duplicate pointer release and frames are idempotent']},
  {case:'safe destructive confirmation',sizes:'all',assertions:['reset/new run/leave/finish retain yellow cancel and blue destructive confirm','cancel preserves account, board and history']},
  {case:'tool selection and preparation',sizes:'all',assertions:['valid tool confirm and prepareNext yellow; cancel blue','invalid/disabled controls neutral and inert','tool cancellation leaves storage and command history unchanged']},
  {case:'visible wording',sizes:'all',assertions:['help menu, inbound detail, tools, cleanup, live expiry have no obsolete waste synonyms','visible 废弃箱 where waste appears','both wildcard sentences and rush sentence exact; removed help lines absent']},
  {case:'natural seed75 order highlight',sizes:'540x960 only',assertions:['17 successive legal native drags from empty board','both 1-second waves at 0/350/700ms, and refreshed settlement','independent old cargo labels, one active card, gate pixels, checksum31c7e4cc; no replay writes']},
  {case:'approved crate treatments',sizes:'all, only approved styles',assertions:['full body evidence in tray/board and readable trait overlays','native rush3/2/1 badges','no catalog/style choice inferred by test runner; visual review is an explicit gate']},
 ],
 limits:['Constructed and funded fixtures are explicitly labelled.','PNG generation alone does not constitute visual review.','No browser, physical-device, audio-listening or human-pass claim.','The runner does not build, transform, inject globals into, or rewrite game.js.'],
};

export function assertDialogBinding(binding){
 assert.equal(binding?.ownerFrozen,true,'Owner must supply the frozen snapshot; preparation is not acceptance');
 assert.equal(binding.aggregateChecksPassed,true,'Aggregate checks must precede final host acceptance');
 assert.match(binding.expectedCommit??'',/^[a-f0-9]{40}$/,'Exact owner commit required');
 for(const key of ['expectedSourceSha256','expectedGameJsSha256','expectedBrowserJsSha256','expectedPaidGameJsSha256','expectedPaidBrowserJsSha256'])assert.match(binding[key]??'',/^[a-f0-9]{64}$/,`${key}: exact owner hash required`);
 assert.ok(binding.freeBuildRoot&&binding.paidBuildRoot,'Both independent package roots required');
 assert.notEqual(resolve(binding.freeBuildRoot),resolve(binding.paidBuildRoot),'Paid artifacts cannot overwrite the free package');
 assert.match(binding.expectedVersion??'',/^0\.18\.\d+-dev$/,'Reviewed v0.18 manifest version required');
 assert.ok(Number.isInteger(binding.expectedCatalogSize)&&binding.expectedCatalogSize>0,'Reviewed catalog count required');
 assert.ok(['unchanged','approved'].includes(binding.artScope?.status),'Art scope remains pending until owner supplies its disposition');
 assert.ok(Array.isArray(binding.artScope.styles),'Exact approved styles required');
 if(binding.artScope.status==='approved'){
  assert.deepEqual([...binding.artScope.styles].sort(),['ice_crystal','reinforced','wood'],'Only the exact reviewed three-style art matrix is accepted');
  assert.equal(new Set(binding.artScope.styles).size,binding.artScope.styles.length,'Duplicate art style');
  assert.match(binding.expectedAtlasSha256??'',/^[a-f0-9]{64}$/,'Exact owner PNG atlas hash required');
 }else assert.deepEqual(binding.artScope.styles,[],'Unchanged artwork cannot request new style acceptance');
}
export function assertDialogManifests(browser,wechat,binding,mode){
 assert.deepEqual(browser,wechat,'Browser and WeChat policy/source manifest differ');
 assert.equal(wechat.version,binding.expectedVersion);assert.equal(wechat.commit,binding.expectedCommit);assert.equal(wechat.sourceSha256,binding.expectedSourceSha256);
 assert.equal(wechat.developerDiagnostics,false);assert.equal(wechat.shopPricingMode,mode==='free'?'playtest-free':'paid');
 assert.equal(wechat.cosmetics.catalogSize,binding.expectedCatalogSize);assert.equal(wechat.modes.rush.maxToolTypes,2);
 if(binding.expectedAtlasSha256||wechat.cargoAtlas){assert.equal(wechat.cargoAtlas?.sha256,binding.expectedAtlasSha256);assert.match(binding.expectedAtlasSha256??'',/^[a-f0-9]{64}$/);assert.equal(wechat.cargoAtlas.src,'assets/cargo-materials.png');assert.deepEqual([wechat.cargoAtlas.width,wechat.cargoAtlas.height,wechat.cargoAtlas.tileSize,wechat.cargoAtlas.padding,wechat.cargoAtlas.bodySize],[1680,1008,336,3,330]);assert.deepEqual(wechat.cargoAtlas.styles,['wood','reinforced','ice_crystal']);assert.deepEqual(wechat.cargoAtlas.cargos,['cargo.food','cargo.machine','cargo.chem','cargo.electronic','cargo.cold']);}
 return wechat;
}
/** Samples are actual interior fill pixels, away from borders and label glyphs. */
export function assertControlTone(samples,expected){
 assert.ok(samples.length>=2,'At least two native interior pixel samples required');
 assert.ok(['primary','secondary','disabled'].includes(expected));
 for(const [r,g,b,a] of samples){
  assert.equal(a,255,'Opaque visible control expected');
  const observed=r>150&&g>100&&r>g+15&&g>b+35?'primary':b-r>=36&&g-r>=8&&b-g>=8?'secondary':r>=30&&r<=75&&g>=40&&b-g>=7&&b-r<=33?'disabled':'other';
  assert.equal(observed,expected,`Native control RGB ${r},${g},${b}: expected ${expected}, observed ${observed}`);
 }
 return {expected,samples};
}
export function assertCopyContract(labels,{required=[],forbidden=[]}={}){
 const strings=labels.map(label=>typeof label==='string'?label:label.text),joined=strings.join('');
 for(const term of ['废弃物','废物','垃圾'])assert.ok(!joined.includes(term),`Obsolete visible waste term: ${term}`);
 for(const text of required)assert.ok(joined.includes(text),`Required native painted paragraph missing: ${text}`);
 for(const text of forbidden)assert.ok(!joined.includes(text),`Removed paragraph remains visible: ${text}`);
 return {labels:strings,required,forbidden};
}
export function assertNoStorageChanges(before,after){
 assert.equal(after.writeCount,before.writeCount,'Cancel/read-only interaction wrote storage');
 assert.deepEqual(after.entries,before.entries,'Cancel/read-only interaction changed authoritative bytes');
}
export function assertSingleCommit(before,after,repeated){
 assert.equal(after.generation,before.generation+1,'Confirm must commit exactly one account generation');
 assert.deepEqual(repeated,after,'Repeated pointer release/frame must not repeat confirmation');
}
export function assertSnapshotPair(begin,end,binding){
 const fields={commit:'expectedCommit',sourceSha256:'expectedSourceSha256',gameJsSha256:'expectedGameJsSha256',browserJsSha256:'expectedBrowserJsSha256',paidGameJsSha256:'expectedPaidGameJsSha256',paidBrowserJsSha256:'expectedPaidBrowserJsSha256'};
 for(const [field,key] of Object.entries(fields)){assert.equal(begin[field],binding[key],`Initial ${field} differs from owner binding`);assert.equal(end[field],binding[key],`Final ${field} differs from owner binding`);}
 if(binding.expectedAtlasSha256)for(const field of ['freeWechatAtlasSha256','freeBrowserAtlasSha256','paidWechatAtlasSha256','paidBrowserAtlasSha256']){assert.equal(begin[field],binding.expectedAtlasSha256,`Initial ${field} differs from exact owner asset`);assert.equal(end[field],binding.expectedAtlasSha256,`Final ${field} differs from exact owner asset`);}
}
