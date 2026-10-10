/** Original production bundles through platform events. Funded/owned data are isolated QA fixtures only. */
import assert from 'node:assert/strict';
import {GlobalFonts} from '@napi-rs/canvas';
GlobalFonts.registerFromPath('/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc','Noto Sans CJK SC');
GlobalFonts.registerFromPath('/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc','Noto Sans CJK SC');
assert.ok(GlobalFonts.families.some(f=>f.family==='Noto Sans CJK SC'));
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {Driver} from './host-refinement.mjs';
import {PaginatedCosmeticsDriver} from './paginated-cosmetics-host-runtime.mjs';
import {shopNavigationFixtureStorage} from './shop-navigation-host-runtime.mjs';
import {createBoundFinalEconomyHost} from './final-economy-host-support.mjs';
import {createPaginatedBrowserHost} from './paginated-cosmetics-browser-host.mjs';
import {attachPixelWitness} from './refinement-host-support.mjs';
import {validateResumeStorage,growthSourceHash} from './growth-host-support.mjs';
import {ACCOUNT_KEYS,encodeAccount} from '../src/application/account-store.ts';
import {COSMETIC_CATALOG,accountCosmeticState} from '../src/application/cosmetics.ts';
import {COSMETIC_SETS,SHOP_COSMETIC_SETS,quoteCosmeticSetPurchase} from '../src/application/cosmetic-sets.ts';
import {runQuantityNative} from './v25-tool-quantity-host-runtime.mjs';
const arg=name=>{const i=process.argv.indexOf(name);return i<0?undefined:process.argv[i+1];};
const out=resolve(arg('--out')??'qa/v102/host'),base=resolve(arg('--build-root')??'build'),hash=b=>createHash('sha256').update(b).digest('hex');
await mkdir(out,{recursive:true});
const manifest=JSON.parse(await readFile(resolve(base,'wechat/build-manifest.json'),'utf8'));
assert.deepEqual(manifest,JSON.parse(await readFile(resolve(base,'browser/build-manifest.json'),'utf8')));
const beginning={commit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),sourceSha256:await growthSourceHash(),gameJsSha256:hash(await readFile(resolve(base,'wechat/game.js'))),browserJsSha256:hash(await readFile(resolve(base,'browser/app.js')))};
assert.equal(manifest.version,'1.0.2');assert.equal(manifest.shopPricingMode,'paid');assert.equal(manifest.developerDiagnostics,false);assert.equal(manifest.sourceSha256,beginning.sourceSha256);assert.equal(manifest.commit,beginning.commit);
const expectedBinding=arg('--binding')?JSON.parse(await readFile(arg('--binding'),'utf8')):null;
if(expectedBinding){assert.equal(expectedBinding.ownerFrozen,true);for(const key of Object.keys(beginning))assert.equal(beginning[key],expectedBinding[key]);}
const binding={ownerFrozen:!!expectedBinding,expectedVersion:manifest.version,expectedCommit:beginning.commit,expectedSourceSha256:beginning.sourceSha256,expectedGameJsSha256:beginning.gameJsSha256,expectedBrowserJsSha256:beginning.browserJsSha256,expectedPaidGameJsSha256:beginning.gameJsSha256,expectedPaidBrowserJsSha256:beginning.browserJsSha256,paidBuildRoot:base,freeBuildRoot:base};
const report={status:'RUNNING',kind:'v1.0.2 untouched paid app.js DOM-event and game.js wx/Canvas catalogue acceptance',candidate:!expectedBinding,beginning,manifest,cases:[],images:[],limitations:['Native Canvas/DOM hosts are not a real browser GUI, WeChat developer tools, Windows GUI or physical devices.','Funded/owned fixtures are isolated QA inputs; no developer money or free shop is shipped.','Driver mirrors only input intent; visible Canvas text and persisted A/B roots are the outcome oracle.','v25 historical passes contribute zero new passes.']};
const save=()=>writeFile(resolve(out,'report.json'),JSON.stringify(report,null,2)+'\n');
const snapshot=d=>JSON.stringify([...d.h.storage].sort(([a],[b])=>a.localeCompare(b)));
const stable=(before,d)=>assert.equal(snapshot(d),before,'Browsing, cancel, repeat or disabled input mutated durable state');
const visible=(d,text)=>assert.ok(d.h.labels.some(row=>row.text.includes(text)),`Actual paint missing: ${text}`);
const kinds=['theme','cargo','forklift'];
const fixture=(wallet=20000,owned=[],change)=>{const storage=shopNavigationFixtureStorage(wallet),account=structuredClone(validateResumeStorage(storage).account);account.profile.ownedCosmetics=[...new Set([...account.profile.ownedCosmetics,...owned])].sort();change?.(account);const raw=encodeAccount(account);for(const key of [ACCOUNT_KEYS.a,ACCOUNT_KEYS.b])storage.set(key,raw);validateResumeStorage(storage);return storage;};
class CoinDriver extends PaginatedCosmeticsDriver{
 action(action,options={}){if(action.type!=='purchaseQuantity')return super.action(action,options);const c=Driver.prototype.action.call(this,action,options);if(!options.disabled)this.confirmation.quantity+=action.delta;this.frame(0);return c;}
 purchase(action){super.purchase(action);if(action.type==='purchase')this.confirmation={kind:'purchase',item:action.item,quantity:1,purchaseGeneration:this.account().generation};this.frame(0);}
}
let active=[];
const driver=async(storage,browser=false,{width=320,height=720,safeTop=24,dpr=2,faults={}}={})=>{
 const exact={...binding,commit:beginning.commit,sourceSha256:beginning.sourceSha256,manifestSourceSha256:manifest.sourceSha256,gameJsSha256:beginning.gameJsSha256};
 const raw=browser?await createPaginatedBrowserHost({bundlePath:resolve(base,'browser/app.js'),storage,width,height,dpr}):await createBoundFinalEconomyHost(exact,{bundlePath:resolve(base,'wechat/game.js'),storage,width,height,safeTop,dpr,faults,deferImageLoads:true});
 assert.equal(raw.gameJsSha256,browser?beginning.browserJsSha256:beginning.gameJsSha256);const h=attachPixelWitness(raw);await h.settleImages();const d=new CoinDriver(h,out,report.images,Date.parse('2026-10-10T11:00:00Z'));d.mode='paid';active.push(d);return d;
};
const capture=async(d,name)=>{d.h.pixelWitness.enabled=true;d.frame(0);const bytes=await d.h.canvas.encode('png');await writeFile(resolve(out,`${name}.png`),bytes);const row={name,sha256:hash(bytes),labels:structuredClone(d.h.labels),controls:d.controls(),storage:[...d.h.storage],bundleSha256:d.h.gameJsSha256};await writeFile(resolve(out,`${name}.json`),JSON.stringify(row,null,2));report.images.push({name,sha256:row.sha256});d.h.pixelWitness.enabled=false;};
const run=async(name,fn)=>{active=[];try{report.cases.push({name,status:'PASS',...await fn()});console.log(`PASS ${name}`);}catch(error){report.cases.push({name,status:'FAIL',error:String(error),stack:error.stack});if(active.length)try{await capture(active.at(-1),`FAIL-${name}`);}catch{}console.error(`FAIL ${name}: ${error}`);}for(const [index,d]of active.entries())await writeFile(resolve(out,`trace-${name}-${index}.json`),JSON.stringify({name,inputs:d.trace,operations:d.h.operations,storage:[...d.h.storage],bundleSha256:d.h.gameJsSha256}));active=[];globalThis.gc?.();await save();};
const unchangedApart=(before,after,fields)=>{const omit=a=>Object.fromEntries(Object.entries(a).filter(([key])=>!['generation','lastOperation',...fields].includes(key)));assert.deepEqual(omit(after),omit(before));assert.equal(after.generation,before.generation+1);};
const repeatedConfirm=(d,c)=>{const before=snapshot(d),p={x:c.rect.x+c.rect.w/2,y:c.rect.y+c.rect.h/2};d.h.pointer('up',p.x,p.y);d.h.tap(p.x,p.y);d.h.tap(p.x,p.y);d.frame(0);stable(before,d);d.frame(500);};
const restore=async(d,browser)=>{const expected=structuredClone(d.account());assert.equal(d.h.storage.get(ACCOUNT_KEYS.a),d.h.storage.get(ACCOUNT_KEYS.b));const reboot=await driver(new Map(d.h.storage),browser);assert.deepEqual(reboot.account(),expected);};
await run('production-build-and-catalogue',async()=>{assert.equal(COSMETIC_CATALOG.length,50);assert.equal(COSMETIC_SETS.length,14);assert.equal(SHOP_COSMETIC_SETS.length,15);assert.equal(manifest.accountFormatVersion,4);assert.equal(manifest.economyVersion,2);assert.equal(manifest.modes.rush.maxToolTypes,2);return {sourceCheck:true,activeCosmetics:50,fixedSets:14,classicPresets:1};});
for(const browser of [false,true]){
 const target=browser?'app':'game';
 for(const item of COSMETIC_CATALOG)await run(`${target}-single-${item.key}`,async()=>{
  const action={type:'purchaseCosmetic',kind:item.kind,id:item.id},equip={type:'equipCosmetic',kind:item.kind,id:item.id};
  if(item.achievementId){const d=await driver(fixture(20000),browser);d.preview(item.kind,item.id);const before=snapshot(d);d.action(action,{disabled:true});stable(before,d);visible(d,item.name);const unlocked=await driver(fixture(20000,[],a=>{a.profile.legacyResults.achievements=[item.achievementId];a.profile.legacyResults.stats={runs:1,orders:1,wins:item.id==='red'?1:0,maxChain:1};}),browser);unlocked.preview(item.kind,item.id);const wallet=unlocked.account().wallet;unlocked.action(equip);assert.equal(unlocked.account().profile.cosmetics.forklift,item.id);assert.equal(unlocked.account().wallet,wallet);await restore(unlocked,browser);return {achievementLocked:true,unlockedEquip:true,restart:true};}
  if(item.price===0){const d=await driver(fixture(0),browser);d.preview(item.kind,item.id);const before=snapshot(d),c=d.controls().find(c=>c.action.type===(item.overlay?'setCargoOutline':'equipCosmetic'));assert.ok(c);if(c.disabled)d.action(c.action,{disabled:true});else d.action(c.action);assert.equal(d.account().wallet,0);assert.ok(accountCosmeticState(d.account()).ownedCosmetics.includes(item.key));if(c.disabled)stable(before,d);await restore(d,browser);return {freeDefaultOwned:true,noPurchase:true,equip:true,restart:true};}
  const d=await driver(fixture(item.price),browser);d.preview(item.kind,item.id);visible(d,item.name);const before=structuredClone(d.account()),raw=snapshot(d);d.purchase(action);visible(d,`${item.price}`);stable(raw,d);d.cancel();stable(raw,d);d.frame(500);d.purchase(action);const c=d.confirm();const after=d.account();unchangedApart(before,after,['wallet','profile']);assert.equal(after.wallet,0);assert.deepEqual(after.profile,{...before.profile,ownedCosmetics:[...new Set([...before.profile.ownedCosmetics,item.key])].sort()});repeatedConfirm(d,c);assert.ok(!d.controls().some(c=>c.action.type==='purchaseCosmetic'));d.action(equip);assert.equal(d.account().profile.cosmetics[item.kind],item.id);assert.equal(d.account().wallet,0);await restore(d,browser);
  const poor=await driver(fixture(item.price-1),browser);poor.preview(item.kind,item.id);const poorRaw=snapshot(poor);poor.action(action,{disabled:true});stable(poorRaw,poor);visible(poor,`${item.price}金币 · 购买`);assert.ok(poor.h.labels.every(row=>!row.text.includes('还差')));if(['white','wood','cold_chain'].includes(item.id))await capture(poor,`${target}-${item.key}-insufficient`);
  return {price:item.price,cancel:true,exactWallet:true,insufficient:true,purchaseDoesNotEquip:true,repeatNoCharge:true,ownedNoRebuy:true,equip:true,restart:true};
 });
 for(const set of COSMETIC_SETS)for(let mask=0;mask<8;mask++)await run(`${target}-bundle-${set.id}-owned${mask}`,async()=>{
  const members=kinds.map(kind=>`${kind}.${set[kind]}`),owned=members.filter((_,i)=>mask&(1<<i));const price=[1440,810,1350,600,1080,300,900,0][mask];
  const d=await driver(fixture(price,owned),browser);d.previewSet(set.id);visible(d,set.name);if(mask!==7){visible(d,mask===0?'8折':[1,2,4].includes(mask)?'9折':'原价');if(mask!==0)assert.ok(d.h.labels.every(row=>!row.text.includes('8折')));}const before=structuredClone(d.account()),raw=snapshot(d),action={type:'purchaseCosmeticSet',id:set.id};
  if(mask!==7){assert.equal(quoteCosmeticSetPurchase(set.id,accountCosmeticState(before)).price,price);d.purchase(action);visible(d,`${price}`);stable(raw,d);d.cancel();stable(raw,d);d.frame(500);d.purchase(action);const c=d.confirm();unchangedApart(before,d.account(),['wallet','profile']);assert.equal(d.account().wallet,0);assert.deepEqual(d.account().profile,{...before.profile,ownedCosmetics:[...new Set([...before.profile.ownedCosmetics,...members])].sort()});repeatedConfirm(d,c);
   const poor=await driver(fixture(price-1,owned),browser);poor.previewSet(set.id);const frozen=snapshot(poor);poor.action(action,{disabled:true});stable(frozen,poor);visible(poor,`${price}金币 · 购买套装`);assert.ok(poor.h.labels.every(row=>!row.text.includes('还差')));
  }else{assert.ok(!d.controls().some(c=>c.action.type==='purchaseCosmeticSet'));stable(raw,d);}
  d.action({type:'equipCosmeticSet',id:set.id});assert.deepEqual(d.account().profile.cosmetics,Object.fromEntries(kinds.map(k=>[k,set[k]])));assert.equal(d.account().wallet,0);await restore(d,browser);if(mask===1)await capture(d,`${target}-${set.id}-partial-owned-purchased`);
  return {ownedMask:mask,missingPrice:price,cancel:mask!==7,exactWallet:mask!==7,insufficient:mask!==7,noRebuy:true,noRefund:true,equipSeparate:true,restart:true};
 });
 await run(`${target}-classic-preset-gates-and-price`,async()=>{
  const d=await driver(fixture(600),browser);d.previewSet('classic');const initial=structuredClone(d.account()),raw=snapshot(d);
  for(const id of ['blue','red']){d.action({type:'selectClassicSetVariant',kind:'forklift',id});const locked=d.controls().find(c=>c.action.type==='purchaseCosmetic');assert.ok(locked?.disabled);d.action(locked.action,{disabled:true});stable(raw,d);}
  d.action({type:'selectClassicSetVariant',kind:'forklift',id:'white'});d.purchase({type:'purchaseCosmetic',kind:'forklift',id:'white'});visible(d,'600');d.cancel();stable(raw,d);d.frame(500);d.purchase({type:'purchaseCosmetic',kind:'forklift',id:'white'});d.confirm();assert.equal(d.account().wallet,0);assert.deepEqual(d.account().profile.cosmetics,initial.profile.cosmetics);d.frame(500);d.action({type:'selectClassicSetVariant',kind:'theme',id:'night'});d.action({type:'selectClassicSetVariant',kind:'cargo',id:'outline'});const c=d.controls().find(c=>c.action.type==='equipClassicSet');assert.ok(c&&!c.disabled);d.action(c.action);assert.deepEqual(d.account().profile.cosmetics,{theme:'night',cargo:'classic',forklift:'white'});assert.equal(d.account().profile.cargoOutline,true);await restore(d,browser);await capture(d,`${target}-classic-white-outline`);return {noBundlePurchase:true,blueRedLocked:true,whitePrice:600,noDiscount:true,equipSeparate:true,restart:true};
 });
}
await mkdir(resolve(out,'quantity'),{recursive:true});
report.quantity=await runQuantityNative({out:resolve(out,'quantity'),mode:'paid',binding,manifest,beginning});
report.ending={commit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),sourceSha256:await growthSourceHash(),gameJsSha256:hash(await readFile(resolve(base,'wechat/game.js'))),browserJsSha256:hash(await readFile(resolve(base,'browser/app.js')))};
try{assert.deepEqual(report.ending,beginning);}catch(error){report.snapshotFailure=String(error);}
report.coverage={cataloguePassed:report.cases.filter(c=>c.status==='PASS').length,catalogueFailed:report.cases.filter(c=>c.status==='FAIL').length,quantity:report.quantity.coverage,inherited:0};report.status=report.snapshotFailure||report.coverage.catalogueFailed||report.quantity.status!=='PASS'?'FAIL':'PASS';report.completedAt=new Date().toISOString();await save();console.log(JSON.stringify(report.coverage));if(report.status!=='PASS')process.exitCode=1;
