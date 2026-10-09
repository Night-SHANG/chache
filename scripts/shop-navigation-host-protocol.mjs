/** v22 native acceptance contract. Pure evidence assertions; no product runtime or build. */
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {RASTER_ART_CONTRACT} from './raster-art-host-protocol.mjs';
export const SHOP_BASELINE_COMMIT='f8e8b83d1b7dc3dda023e000fbdb18181552f8ad';
export const SHOP_V021_ASSET_HASHES=Object.freeze({expectedBoardMaterialAtlasSha256:'5c2bc5fc4d6fbdda2df46e09995a8b5b269cdae16aa763a50b5ed02c03ea66f5',expectedAtlasSha256:'3de912ee3a92184cf1b5c215790854645cd25dded1ec5d1cf4c690b642fe9a65',expectedSceneMaterialAtlasSha256:'b394aad384c59e08f2d3893f80be7bc6d12d3ae568633b98717191ed00cc0c7e',expectedThemedForkliftAtlasSha256:'41ea1d21d9638603c79ac830cba877c35a6b085afd458527243ad605b9eef3db'});
export const SHOP_NAVIGATION_MANIFEST=Object.freeze({catalogSize:53,setCount:16,navigation:'sections-scroll-detail',sections:['sets','theme','cargo','forklift'],columns:2});
export const SHOP_NATIVE_VIEWPORTS=Object.freeze([{width:320,height:720,safeTop:24,dpr:2},{width:360,height:800,safeTop:24,dpr:2},{width:320,height:740,safeTop:44,dpr:3}]);
export const shopViewportName=v=>`${v.width}x${v.height}-safe${v.safeTop}-dpr${v.dpr}`;
export function assertShopNavigationBinding(binding){
 assert.equal(binding?.ownerFrozen,true,'Owner-frozen binding required');assert.equal(binding.aggregateChecksPassed,true,'Final aggregate checks must pass before native acceptance');
 assert.equal(binding.expectedVersion,'0.22.0-dev');assert.equal(binding.expectedCatalogSize,53);assert.equal(binding.expectedSetCount,16);
 assert.match(binding.expectedCommit??'',/^[a-f0-9]{40}$/,'Exact owner HEAD required');
 for(const key of ['expectedSourceSha256','expectedGameJsSha256','expectedBrowserJsSha256','expectedPaidGameJsSha256','expectedPaidBrowserJsSha256'])assert.match(binding[key]??'',/^[a-f0-9]{64}$/,`Complete ${key} required`);
 for(const [key,value] of Object.entries(SHOP_V021_ASSET_HASHES))assert.equal(binding[key],value,'Approved v21 artwork must be byte-identical');
 assert.ok(binding.freeBuildRoot&&binding.paidBuildRoot,'Independent free and paid packages required');assert.notEqual(resolve(binding.freeBuildRoot),resolve(binding.paidBuildRoot));
}
export function assertShopNavigationManifests(browser,wechat,binding,mode){
 assert.deepEqual(browser,wechat,'Native and browser manifests must match');
 for(const [field,key]of [['version','expectedVersion'],['commit','expectedCommit'],['sourceSha256','expectedSourceSha256']])assert.equal(wechat[field],binding[key]);
 assert.equal(wechat.developerDiagnostics,false);assert.equal(wechat.shopPricingMode,mode==='free'?'playtest-free':'paid');assert.deepEqual(wechat.cosmetics,SHOP_NAVIGATION_MANIFEST);assert.equal(wechat.modes.rush.maxToolTypes,2);
 for(const row of RASTER_ART_CONTRACT){const value=wechat[row.manifestKey];assert.ok(value);for(const [key,expected]of Object.entries(row.layout))assert.deepEqual(value[key],expected);assert.equal(value.sha256,binding[row.hashKey]);assert.ok(value.bytes>0);}
 return wechat;
}
export function shopNavigationCaseNames(mode){
 assert.ok(['free','paid'].includes(mode));
 return ['catalog-frozen-source-proof',...SHOP_NATIVE_VIEWPORTS.flatMap(v=>['root-defaults-internal-return','section-scroll-detail-back','gesture-clipping-cancel-guards'].map(name=>`${name}-${shopViewportName(v)}`)),'all-53-item-details','all-15-set-previews','tools-inventory-confirm-cancel','individual-acquire-equip-reload',...Array.from({length:8},(_,mask)=>`bundle-all-15-owned-subset-${mask.toString(2).padStart(3,'0')}`),'bundle-stale-quote-native-writer','bundle-save-failure-retry','pending-rejected-images-navigation','classic-variant-claim-equip-back','gameplay-launch-tools-resume','five-win-continue-endless'].map(name=>`${mode}-v022-${name}`);
}
export function assertShopNavigationCoverage(cases,mode){
 const names=cases.map(row=>row.name),expected=shopNavigationCaseNames(mode);assert.equal(new Set(names).size,names.length,'Duplicate native evidence identity');assert.deepEqual([...names].sort(),[...expected].sort(),'Every new v22 case must execute; historical cases cannot replace them');
 assert.ok(cases.every(row=>['PASS','FAIL'].includes(row.status)),'No skipped or inherited native case');return {passed:cases.filter(row=>row.status==='PASS').length,failed:cases.filter(row=>row.status==='FAIL').length,total:cases.length,nativeCases:cases.length-1,sourceChecks:1,inherited:0};
}
export function assertShopRouteControls(controls,{detail=false}={}){
 assert.ok(!controls.some(c=>['selectCosmeticBrowse','selectCosmeticCategory','selectCosmeticPage','selectCosmeticSetPage'].includes(c.action.type)),'Legacy page/category controls cannot survive the new navigation');
 if(detail){assert.ok(!controls.some(c=>['selectShopTab','selectShopSection','previewCosmetic','previewCosmeticSet'].includes(c.action.type)),'Independent detail must not retain global tabs or list cards');assert.equal(controls.filter(c=>c.action.type==='closeShopDetail').length,1);}
 else{assert.deepEqual(controls.filter(c=>c.action.type==='selectShopTab').map(c=>c.action.tab),['tools','cosmetics']);assert.deepEqual(controls.filter(c=>c.action.type==='selectShopSection').map(c=>c.action.section),['sets','theme','cargo','forklift']);for(const c of controls.filter(c=>['previewCosmetic','previewCosmeticSet'].includes(c.action.type))){assert.ok(c.rect.x>=132&&c.rect.x+c.rect.w<=948);assert.ok(c.rect.y>=600&&c.rect.y+c.rect.h<=1620,'Card hitboxes must be clipped to the list viewport');}}
}
