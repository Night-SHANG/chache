/** Only input intent is mirrored. Persisted roots, original bundle callbacks and actual Canvas pixels are truth. */
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {Driver} from './host-refinement.mjs';
import {ShopNavigationDriver,shopNavigationFixtureStorage} from './shop-navigation-host-runtime.mjs';
import {createBoundFinalEconomyHost} from './final-economy-host-support.mjs';
import {createPaginatedBrowserHost} from './paginated-cosmetics-browser-host.mjs';
import {attachPixelWitness,physicalRect,assertTextPaint} from './refinement-host-support.mjs';
import {sha256,validateResumeStorage,mapPort} from './growth-host-support.mjs';
import {assertNoStorageChanges,assertControlTone} from './dialog-feedback-host-protocol.mjs';
import {ACCOUNT_KEYS,encodeAccount,decodeAccount} from '../src/application/account-store.ts';
import {COSMETIC_CATALOG} from '../src/application/cosmetics.ts';
import {SHOP_COSMETIC_SETS} from '../src/application/cosmetic-sets.ts';
const PRICES={rotate:80,clear:120,wildcard:160},NAMES={rotate:'旋转',clear:'清障',wildcard:'万能'},ITEMS=Object.keys(PRICES),MAX=Number.MAX_SAFE_INTEGER;
export const QUANTITY_VIEWPORTS=[{width:320,height:720,safeTop:24,dpr:2},{width:360,height:800,safeTop:24,dpr:2},{width:540,height:960,safeTop:0,dpr:1}];
const center=r=>({x:r.x+r.w/2,y:r.y+r.h/2});
const snapshot=d=>({entries:[...d.h.storage].sort(([a],[b])=>a.localeCompare(b)),writeCount:d.h.operations.filter(row=>['set','remove'].includes(row.kind)).length});
const noWrites=(before,d)=>assertNoStorageChanges(before,snapshot(d));
const visible=(d,text)=>assert.ok(d.h.labels.some(row=>row.text===text),`Actual painted text missing: ${text}; observed ${d.h.labels.map(r=>r.text).join('|')}`);
const noModal=d=>assert.ok(!d.h.labels.some(row=>/^(领取|购买).+？$/.test(row.text)),'Repeated pointer input must not reopen an underlying tool modal');
const fixture=(wallet=20000,inventory)=>{const storage=shopNavigationFixtureStorage(wallet);if(inventory){const account=structuredClone(validateResumeStorage(storage).account);Object.assign(account.inventory,inventory);const raw=encodeAccount(account);for(const key of [ACCOUNT_KEYS.a,ACCOUNT_KEYS.b])storage.set(key,raw);validateResumeStorage(storage);}return storage;};
export class QuantityDriver extends ShopNavigationDriver{
 purchase(action){super.purchase(action);if(action.type==='purchase')this.confirmation={kind:'purchase',item:action.item,quantity:1,purchaseGeneration:this.account().generation};this.frame(0);}
 action(action,options={}){
  if(action.type!=='purchaseQuantity')return super.action(action,options);
  const c=Driver.prototype.action.call(this,action,options);
  if(!options.disabled){assert.ok(this.confirmation?.kind==='purchase');this.confirmation.quantity+=action.delta;}
  this.frame(0);return c;
 }
 quantity(n){while(this.confirmation.quantity!==n)this.action({type:'purchaseQuantity',delta:Math.sign(n-this.confirmation.quantity)});}
}
function assertBatch(before,after,item,quantity,mode){
 assert.equal(after.generation,before.generation+1);assert.equal(after.wallet,before.wallet-(mode==='free'?0:PRICES[item]*quantity));
 assert.deepEqual(after.inventory,{...before.inventory,[item]:before.inventory[item]+quantity});
 assert.deepEqual(after.profile,before.profile);assert.deepEqual(after.run,before.run);assert.deepEqual(after.dailyRewards,before.dailyRewards);assert.equal(after.nextRunSerial,before.nextRunSerial);
}
function tone(d,c,expected){const samples=[.10,.16].map(f=>{const r=physicalRect(d.h,{x:c.rect.x+32,y:c.rect.y+c.rect.h*f,w:0,h:0});return [...d.h.context.getImageData(Math.round(r.x),Math.round(r.y),1,1).data];});return assertControlTone(samples,expected);}
function assertQuantity(d,item,n,mode){
 visible(d,`${mode==='free'?'领取':'购买'}${NAMES[item]}？`);visible(d,`${n} 件`);
 const price=mode==='free'?0:PRICES[item],wallet=d.account().wallet;
 visible(d,mode==='free'?`免费领取 ${n} 件`:`单价 ${price} 金币 · 合计 ${price*n} 金币`);
 visible(d,`余额 ${wallet} → ${wallet-price*n}`);
 const controls=d.controls();assert.deepEqual(controls.map(c=>c.action.type).sort(),['cancel','confirm','purchaseQuantity','purchaseQuantity']);
 const scale=Math.min(d.h.viewport.w/1080,(d.h.viewport.h-d.h.viewport.safe)/1920),facts=[];
 for(const [index,c]of controls.entries()){
  assert.ok(c.rect.w*scale>=44-.01&&c.rect.h*scale>=44-.01,`44 CSS-pixel touch target ${c.label}`);
  for(const other of controls.slice(index+1))assert.ok(c.rect.x+c.rect.w<=other.rect.x||other.rect.x+other.rect.w<=c.rect.x||c.rect.y+c.rect.h<=other.rect.y||other.rect.y+other.rect.h<=c.rect.y,`Overlapping controls ${c.label}/${other.label}`);
  const expected=c.disabled?'disabled':c.action.type==='confirm'?'primary':'secondary';facts.push({action:c.action,rect:c.rect,cssSize:{w:c.rect.w*scale,h:c.rect.h*scale},...tone(d,c,expected)});
 }
 return facts;
}
export async function runQuantityNative({out,mode,binding,manifest,beginning}){
 const base=mode==='free'?binding.freeBuildRoot:binding.paidBuildRoot,epoch=Date.parse('2026-10-10T10:00:00Z'),drivers=[];
 const report={status:'RUNNING',kind:'Original v25 game.js wx/Canvas and original app.js DOM-event simulation',mode,binding,manifest,beginning,cases:[],images:[],limitations:['These native Canvas and DOM-event hosts are not a real browser GUI, WeChat developer tools, or a physical device.','Accounts with wallet/stock values are validated isolated QA fixtures, never player earnings.','No app/session export, state global, or transformed product bundle is injected. Host-side input intent locates pointers only.','Storage fault before/after-write coverage uses native wx callbacks; browser storage-fault behavior is not claimed.','Catalog and carry-limit preservation are bounded checks, not a rerun of all historical gameplay/cosmetic suites.','Historical evidence contributes zero fresh passes.']};
 const save=()=>writeFile(resolve(out,'report.json'),JSON.stringify(report,null,2));
 const capture=async(d,name,{failure=false}={})=>{
  d.h.pixelWitness.enabled=true;d.frame(0);const bytes=await d.h.canvas.encode('png'),picture=resolve(out,`${name}.png`);await writeFile(picture,bytes);
  const evidence={name,picture,sha256:sha256(bytes),bundleSha256:d.h.gameJsSha256,viewport:d.h.viewport,labels:structuredClone(d.h.labels),controls:d.controls(),storage:snapshot(d),inputs:d.nativeInputs,visibleGlyphs:d.h.pixelWitness.glyphs.filter(g=>g.pixels.length>=3).map(g=>({text:g.text,rect:g.rect,pixels:g.pixels.length})),failure};
  if(!failure&&d.confirmation)for(const c of d.controls())assertTextPaint(d.h,c.label,{within:physicalRect(d.h,c.rect)});
  await writeFile(resolve(out,`${name}.json`),JSON.stringify(evidence,null,2));report.images.push({name,picture,sha256:evidence.sha256,failure});d.h.pixelWitness.enabled=false;return {picture,sha256:evidence.sha256};
 };
 const run=async(name,fn)=>{name=`${mode}-v025-${name}`;const first=drivers.length;try{report.cases.push({name,status:'PASS',...await fn()});console.log(`PASS ${name}`);}catch(error){const failure={name,status:'FAIL',error:String(error),stack:error.stack},d=drivers.at(-1);if(d&&drivers.length>first)try{failure.evidence=await capture(d,`FAIL-${name}`,{failure:true});}catch(e){failure.evidenceError=String(e);}report.cases.push(failure);console.error(`FAIL ${name}: ${error}`);}for(const [index,d]of drivers.entries())if(index>=first)await writeFile(resolve(out,`trace-${name}-${index-first}.json`),JSON.stringify({name,mode,bundleSha256:d.h.gameJsSha256,viewport:d.h.viewport,inputs:d.nativeInputs,operations:d.h.operations,storage:snapshot(d)},null,2));drivers.splice(first);await save();};
 const driver=async(storage=fixture(),{viewport=QUANTITY_VIEWPORTS[0],browser=false,faults={}}={})=>{
  const gameHash=mode==='free'?binding.expectedGameJsSha256:binding.expectedPaidGameJsSha256,exact={...binding,commit:beginning.commit,sourceSha256:beginning.sourceSha256,manifestSourceSha256:manifest.sourceSha256,expectedGameJsSha256:gameHash,gameJsSha256:gameHash};
  const raw=browser?await createPaginatedBrowserHost({bundlePath:resolve(base,'browser/app.js'),storage,epoch,...viewport}):await createBoundFinalEconomyHost(exact,{...viewport,storage,epoch,faults,deferImageLoads:true,bundlePath:resolve(base,'wechat/game.js')});
  if(browser)assert.equal(raw.browserJsSha256,mode==='free'?binding.expectedBrowserJsSha256:binding.expectedPaidBrowserJsSha256);
  const h=attachPixelWitness(raw);await h.settleImages();const d=new QuantityDriver(h,out,report.images,epoch);d.mode=mode;d.nativeInputs=[];
  for(const key of ['pointer','tap']){const original=h[key];h[key]=(...args)=>{d.nativeInputs.push({type:key,time:h.time,args});return original(...args);};}
  drivers.push(d);return d;
 };
 await run('frozen-catalog-source',async()=>{assert.equal(COSMETIC_CATALOG.length,50);assert.equal(SHOP_COSMETIC_SETS.length,15);assert.ok(Object.isFrozen(COSMETIC_CATALOG)&&COSMETIC_CATALOG.every(Object.isFrozen));assert.deepEqual(Object.fromEntries(['theme','cargo','forklift'].map(k=>[k,COSMETIC_CATALOG.filter(i=>i.kind===k).length])),{theme:16,cargo:16,forklift:18});return {sourceOnly:true,catalog:50,sets:15};});
 for(const viewport of QUANTITY_VIEWPORTS)for(const browser of [false,true]){
  const tag=`${browser?'app':'game'}-${viewport.width}x${viewport.height}`,opts={viewport,browser};
  await run(`${tag}-all-tools-quantity-cancel-confirm`,async()=>{
   const d=await driver(fixture(mode==='free'?0:20000),opts);d.shop();const rows=[];
   for(const item of ITEMS){const before=structuredClone(d.account()),stable=snapshot(d);d.purchase({type:'purchase',item});assertQuantity(d,item,1,mode);d.action({type:'purchaseQuantity',delta:-1},{disabled:true});assertQuantity(d,item,1,mode);d.quantity(3);const geometry=assertQuantity(d,item,3,mode);noWrites(stable,d);await capture(d,`${mode}-${tag}-${item}-quantity3`);d.cancel();noWrites(stable,d);noModal(d);d.purchase({type:'purchase',item});assertQuantity(d,item,1,mode);noWrites(stable,d);d.quantity(3);const button=d.confirm();assertBatch(before,d.account(),item,3,mode);const once=snapshot(d),p=center(button.rect);d.h.pointer('up',p.x,p.y);d.h.tap(p.x,p.y);d.h.tap(p.x,p.y);d.frame(0);noWrites(once,d);noModal(d);assert.equal(d.h.storage.get(ACCOUNT_KEYS.a),d.h.storage.get(ACCOUNT_KEYS.b));rows.push({item,quantity:3,total:mode==='free'?0:PRICES[item]*3,wallet:d.account().wallet,inventory:d.account().inventory[item],geometry});d.frame(500);}
   const reboot=await driver(new Map(d.h.storage),opts);assert.deepEqual(reboot.account(),d.account());await capture(d,`${mode}-${tag}-all-tools-after`);return {simulation:browser,rows,default:1,lowerBound:1,readonlyQuantityAndCancel:true,cancelReopenReset:true,oneBatchGeneration:true,doubleTapNoReopen:true,restart:true};
  });
  await run(`${tag}-capacity-and-wallet-boundaries`,async()=>{
   const rows=[];
   for(const item of ITEMS){const d=await driver(fixture(mode==='free'?0:PRICES[item]*10,{[item]:MAX-2}),opts);d.shop();const before=structuredClone(d.account()),stable=snapshot(d);d.purchase({type:'purchase',item});d.quantity(2);assertQuantity(d,item,2,mode);d.action({type:'purchaseQuantity',delta:1},{disabled:true});assertQuantity(d,item,2,mode);noWrites(stable,d);d.confirm();assertBatch(before,d.account(),item,2,mode);assert.equal(d.account().inventory[item],MAX);const full=snapshot(d);d.frame(500);d.purchase({type:'purchase',item});visible(d,'1 件');visible(d,'库存已达上限');d.action({type:'purchaseQuantity',delta:1},{disabled:true});d.action({type:'confirm'},{disabled:true});visible(d,'1 件');visible(d,'库存已达上限');noWrites(full,d);if(item==='rotate')await capture(d,`${mode}-${tag}-full-stock-disabled-confirm`);d.cancel();noWrites(full,d);noModal(d);const reboot=await driver(new Map(d.h.storage),opts);assert.deepEqual(reboot.account(),d.account());rows.push({item,maximumStock:MAX,remainingCapacity:2,fullConfirmationDisabled:true});}
   if(mode==='paid')for(const item of ITEMS){const d=await driver(fixture(PRICES[item]*3),opts);d.shop();const before=structuredClone(d.account()),stable=snapshot(d);d.purchase({type:'purchase',item});d.quantity(3);assertQuantity(d,item,3,mode);d.action({type:'purchaseQuantity',delta:1},{disabled:true});assertQuantity(d,item,3,mode);noWrites(stable,d);if(item==='rotate')await capture(d,`${mode}-${tag}-exact-wallet-quantity3`);d.confirm();assertBatch(before,d.account(),item,3,mode);assert.equal(d.account().wallet,0);const poor=snapshot(d);d.frame(500);d.action({type:'purchase',item},{disabled:true});noWrites(poor,d);noModal(d);rows.push({item,exactWallet:true,affordabilityCap:3,insufficientDisabled:true});}
   await capture(await driver(fixture(mode==='free'?0:79,{rotate:MAX}),opts),`${mode}-${tag}-boundary-account`);return {simulation:browser,rows};
  });
  await run(`${tag}-pointer-cancel-modal-isolation`,async()=>{
   const d=await driver(fixture(),opts);d.shop();d.purchase({type:'purchase',item:'rotate'});const before=snapshot(d),plus=center(d.controls().find(c=>c.action.type==='purchaseQuantity'&&c.action.delta===1).rect);
   d.h.pointer('down',plus.x,plus.y);d.h.pointer('move',plus.x,plus.y-200);d.h.pointer('cancel',plus.x,plus.y-200);d.h.pointer('up',plus.x,plus.y);d.frame(0);assertQuantity(d,'rotate',1,mode);
   d.h.tap(820,520);d.h.tap(80,1700);d.frame(0);assertQuantity(d,'rotate',1,mode);noWrites(before,d);d.cancel();noWrites(before,d);noModal(d);return {simulation:browser,cancelledPointerInert:true,underlyingControlsBlocked:true};
  });
  await run(`${tag}-batch-stock-carry-two-types`,async()=>{
   const d=await driver(fixture(),opts);d.shop();for(const item of ITEMS){d.purchase({type:'purchase',item});d.quantity(3);d.confirm();d.frame(500);}d.action({type:'back'});d.action({type:'chooseInbound'});d.action({type:'newRun',mode:'standard',inboundDifficulty:'hard'});const before=structuredClone(d.account()),stable=snapshot(d);d.action({type:'toggleItem',item:'rotate'});d.action({type:'toggleItem',item:'clear'});d.action({type:'toggleItem',item:'wildcard'},{disabled:true});noWrites(stable,d);d.action({type:'prepareNext'});const after=d.account();assert.deepEqual([...after.run.reserved].sort(),['clear','rotate']);assert.deepEqual(after.run.state.toolCharges,{rotate:1,clear:1,wildcard:0});assert.deepEqual(after.inventory,{...before.inventory,rotate:before.inventory.rotate-1,clear:before.inventory.clear-1});await capture(d,`${mode}-${tag}-carry-two-types`);return {simulation:browser,batchOwned:true,maxTypes:2,onePerType:true};
  });
 }
 for(const fault of [{name:'before-first-root',timing:'before',key:ACCOUNT_KEYS.b},{name:'before-mirror-root',timing:'before',key:ACCOUNT_KEYS.a},{name:'after-first-root',timing:'after',key:ACCOUNT_KEYS.b},{name:'after-mirror-root',timing:'after',key:ACCOUNT_KEYS.a}])await run(`native-batch-save-${fault.name}`,async()=>{
  let broken=false,hits=0;const d=await driver(fixture(),{faults:{[fault.timing]:op=>{if(broken&&op.kind==='set'&&op.key===fault.key){hits++;throw Error(`Injected v25 ${fault.name}`);}}}});d.shop();const before=structuredClone(d.account());d.purchase({type:'purchase',item:'clear'});d.quantity(3);broken=true;d.confirm();assert.ok(hits>0);
  const roots=[ACCOUNT_KEYS.a,ACCOUNT_KEYS.b].map(key=>({key,account:decodeAccount(mapPort(d.h.storage),d.h.storage.get(key))}));for(const root of roots){assert.ok(root.account);if(root.account.generation===before.generation)assert.deepEqual(root.account,before);else assertBatch(before,root.account,'clear',3,mode);}
  const uncertain=fault.timing==='before'&&fault.key===ACCOUNT_KEYS.a,uncommitted=fault.timing==='before'&&fault.key===ACCOUNT_KEYS.b;if(uncertain)d.accountBlocked=true;d.frame(0);if(uncertain||uncommitted)assert.ok(d.h.labels.some(row=>/尚未确认/.test(row.text)));await capture(d,`${mode}-batch-${fault.name}`);broken=false;
  if(uncertain){d.action({type:'retrySave'});d.accountBlocked=false;d.frame(0);}else if(uncommitted){d.frame(500);d.purchase({type:'purchase',item:'clear'});d.quantity(3);d.confirm();}
  assertBatch(before,d.account(),'clear',3,mode);assert.equal(d.h.storage.get(ACCOUNT_KEYS.a),d.h.storage.get(ACCOUNT_KEYS.b));const reboot=await driver(new Map(d.h.storage));assert.deepEqual(reboot.account(),d.account());return {fault,hits,rootGenerations:roots.map(r=>r.account.generation),recoveredQuantity:3,singleBatchGeneration:true,restart:true};
 });
 for(const browser of [false,true])await run(`${browser?'app':'game'}-stale-quantity-reconfirmed`,async()=>{
  const d=await driver(fixture(),{browser});d.shop();d.purchase({type:'purchase',item:'clear'});d.quantity(3);const other=await driver(d.h.storage,{browser});other.shop();other.purchase({type:'purchase',item:'rotate'});other.confirm();const updated=structuredClone(other.account()),stable=snapshot(d);d.confirm();noWrites(stable,d);assert.deepEqual(d.account(),updated);visible(d,'账户已变化，请重新确认');noModal(d);d.frame(500);d.purchase({type:'purchase',item:'clear'});assertQuantity(d,'clear',1,mode);d.quantity(3);d.confirm();assertBatch(updated,d.account(),'clear',3,mode);return {simulation:browser,staleConfirmWrites:0,reopenDefaults:1,reconfirmedQuantity:3};
 });
 report.coverage={passed:report.cases.filter(c=>c.status==='PASS').length,failed:report.cases.filter(c=>c.status==='FAIL').length,total:report.cases.length,nativeCases:report.cases.filter(c=>!c.sourceOnly&&!c.simulation).length,browserEventCases:report.cases.filter(c=>c.simulation).length,sourceChecks:report.cases.filter(c=>c.sourceOnly).length,inherited:0};report.status=report.coverage.failed?'FAIL':'PASS';await writeFile(resolve(out,'screenshot-index.json'),JSON.stringify({mode,kind:report.kind,limitations:report.limitations,images:report.images},null,2));await save();return report;
}
