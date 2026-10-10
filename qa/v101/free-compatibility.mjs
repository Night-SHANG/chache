import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
Object.defineProperty(globalThis,'__PLAYTEST_FREE_SHOP__',{value:true});
const root=process.cwd(),out=resolve('qa/v101/free-final'),base=resolve('artifacts/v101-frozen/free');await mkdir(out,{recursive:true});
const {GlobalFonts}=await import('@napi-rs/canvas');for(const face of ['Regular','Bold'])assert.ok(GlobalFonts.registerFromPath(`/usr/share/fonts/opentype/noto/NotoSansCJK-${face}.ttc`,'Noto Sans CJK SC'));
const {createGrowthHost,growthSourceHash,sha256}=await import('../../scripts/growth-host-support.mjs');
const {createPaginatedBrowserHost}=await import('../../scripts/paginated-cosmetics-browser-host.mjs');
const {attachPixelWitness}=await import('../../scripts/refinement-host-support.mjs');
const {PaginatedCosmeticsDriver}=await import('../../scripts/paginated-cosmetics-host-runtime.mjs');
const {shopNavigationFixtureStorage}=await import('../../scripts/shop-navigation-host-runtime.mjs');
const binding=JSON.parse(await readFile('artifacts/v101-frozen/binding.json'));
assert.equal(await growthSourceHash(),binding.sourceSha256);
const report={status:'RUNNING',kind:'Explicit free-build regression only; production delivery remains paid',binding,cases:[],screens:[],limitations:['Original app.js DOM-event / game.js wx-Canvas hosts, not browser GUI or WeChat devices.']};
const visible=(d,label)=>assert.ok(d.h.labels.some(x=>x.text===label),label);
const shot=async(d,name)=>{d.frame(0);const path=resolve(out,`${name}.png`);await writeFile(path,await d.h.canvas.encode('png'));report.screens.push({path,labels:structuredClone(d.h.labels),controls:d.controls()});};
async function open(browser,width,storage){const target=browser?'browser':'wechat',entry=browser?'app.js':'game.js',manifest=JSON.parse(await readFile(`${base}/${target}/build-manifest.json`));assert.equal(manifest.shopPricingMode,'playtest-free');assert.equal(manifest.version,'1.0.1-dev');const bundlePath=`${base}/${target}/${entry}`;assert.equal(sha256(await readFile(bundlePath)),binding[browser?'freeBrowserJsSha256':'freeGameJsSha256']);const options={bundlePath,storage,width,height:width===540?960:720,dpr:width===540?1:2};const h=browser?await createPaginatedBrowserHost(options):await createGrowthHost({...options,deferImageLoads:true});attachPixelWitness(h);await h.settleImages();const d=new PaginatedCosmeticsDriver(h,out,[],Date.parse('2026-10-10T14:00:00Z'));d.mode='free';return d;}
for(const browser of [false,true])for(const width of [320,360,540]){
 const tag=`${browser?'app':'game'}-${width}`,d=await open(browser,width,shopNavigationFixtureStorage(0));d.preview('cargo','wood');visible(d,'领取');const before=structuredClone(d.account());d.purchase({type:'purchaseCosmetic',kind:'cargo',id:'wood'});d.cancel();assert.deepEqual(d.account(),before);d.frame(400);d.purchase({type:'purchaseCosmetic',kind:'cargo',id:'wood'});d.confirm();d.frame(400);assert.equal(d.account().wallet,0);visible(d,'装备');d.action({type:'equipCosmetic',kind:'cargo',id:'wood'});visible(d,'使用中');
 d.preview('cargo','outline');visible(d,'装备');d.action({type:'setCargoOutline',enabled:true});visible(d,'使用中');await shot(d,`${tag}-outline`);d.preview('cargo','classic');visible(d,'装备');d.action({type:'equipCosmetic',kind:'cargo',id:'classic'});assert.equal(d.account().profile.cargoOutline,false);visible(d,'使用中');
 d.previewSet('harbor');visible(d,'领取套装');await shot(d,`${tag}-claim-set`);d.purchase({type:'purchaseCosmeticSet',id:'harbor'});d.confirm();d.frame(400);visible(d,'装备整套');assert.equal(d.account().wallet,0);d.action({type:'equipCosmeticSet',id:'harbor'});visible(d,'使用中');
 d.previewSet('classic');d.action({type:'selectClassicSetVariant',kind:'forklift',id:'white'});visible(d,'领取');await shot(d,`${tag}-classic-white`);d.purchase({type:'purchaseCosmetic',kind:'forklift',id:'white'});d.confirm();d.frame(400);assert.equal(d.account().wallet,0);visible(d,'装备整套');
 const reboot=await open(browser,width,new Map(d.h.storage));assert.deepEqual(reboot.account(),d.account());report.cases.push({name:tag,status:'PASS',wallet:0,claimCancel:true,claimNoAutoEquip:true,outlineClassicClosure:true,setClaim:true,classicWhiteClaim:true,restart:true});
}
assert.equal(await growthSourceHash(),binding.sourceSha256);report.status='PASS';report.completedAt=new Date().toISOString();await writeFile(`${out}/report.json`,JSON.stringify(report,null,2));console.log(JSON.stringify({status:report.status,cases:report.cases.length,screens:report.screens.length}));
