/** Frozen-package set acceptance. Only native pointer callbacks mutate the game. */
import assert from 'node:assert/strict';
import {isDeepStrictEqual} from 'node:util';
import { COSMETIC_SETS } from '../src/application/cosmetic-sets.ts';
import { COSMETIC_CATALOG } from '../src/application/cosmetics.ts';
import { ACCOUNT_KEYS, decodeAccount } from '../src/application/account-store.ts';
import { cosmeticAccountStorage } from './cosmetic-stage15-host-support.mjs';
import { mapPort, sha256 } from './growth-host-support.mjs';
import { assertNoStorageChanges, assertControlTone, DIALOG_VIEWPORTS } from './dialog-feedback-host-protocol.mjs';
import { physicalRect, assertTextPaint } from './refinement-host-support.mjs';
import { assertStaticHelpGeometry } from './host-static-help.mjs';
import { assertRasterDraws, RASTER_FORKLIFTS, RASTER_FORKLIFT_COLUMNS, RASTER_CARGO_STYLES, rasterBundleQuote, assertRasterBundleCommit } from './raster-art-host-protocol.mjs';

const kinds=['theme','cargo','forklift'];
const expectedTriples=[
 ['cold_chain','cold_chain','insulated','electric'],['rail_freight','rail_freight','reinforced','heavy'],['express_sorting','express_sorting','taped','compact'],
 ['toy_workshop','toy_workshop','toy_brick','toy'],['paper_warehouse','paper_warehouse','paper_fold','paper'],['space_cargo','space_cargo','space_case','space'],
 ['steam_foundry','steam_foundry','steam_brass','steam'],['neon_depot','neon_depot','neon_circuit','neon'],['lava_forge','lava_forge','lava_core','lava'],
 ['ocean_vault','ocean_vault','ocean_relic','diving'],['royal_store','royal_store','royal_gold','royal'],['field_station','field_station','field_supply','field'],
 ['forest_depot','forest_depot','wood','timber'],['ice_vault','ice_vault','ice_crystal','ice'],['harbor','harbor','harbor_container','harbor'],
];
const slots=set=>Object.fromEntries(kinds.map(kind=>[kind,set[kind]]));
const center=rect=>({x:rect.x+rect.w/2,y:rect.y+rect.h/2});
const conserved=account=>{const a=structuredClone(account);delete a.generation;delete a.lastOperation;delete a.profile.cosmetics;return a;};
export function returnRasterSetListToFirstPage(d){
 while((d.cosmeticSetPage??0)>0)d.action({type:'selectCosmeticSetPage',page:d.cosmeticSetPage-1});
 d.action({type:'selectCosmeticSetPage',page:-1},{disabled:true});
}
export async function runRasterSetCases({mode,run,driver,capture,snapshot,rewrite,owned}){
 const fresh=(wallet=2000)=>rewrite(cosmeticAccountStorage({wallet,label:`FUNDED: isolated ${mode} native set test account; no claimed earnings`}),account=>{account.formatVersion=4;account.tutorialsEnabled=true;account.guides.daily={learned:[],skipped:false,authoredStartConsumed:false};});
 const open=d=>{d.shop();d.action({type:'selectShopTab',tab:'cosmetics'});};
 const visible=(d,text)=>assert.ok(d.h.labels.some(row=>row.text===text),`Native painted text missing: ${text}`);
 const geometry=d=>assertStaticHelpGeometry(d.controls(),d.h.viewport,true);
 const previewDraws=(d,set)=>{
  assertRasterDraws(d.h.rasterDraws,'assets/themed-forklifts.png',[RASTER_FORKLIFT_COLUMNS[RASTER_FORKLIFTS.indexOf(set.forklift)]*128,0,128,128]);
  assertRasterDraws(d.h.rasterDraws,'assets/cargo-materials.png',[3,RASTER_CARGO_STYLES.indexOf(set.cargo)*134+3,128,128]);
  assert.ok(d.h.rasterDraws.some(row=>row.source==='assets/scene-materials.png'),'Actual set preview must paint the coherent scene atlas');
 };
 await run(`${mode}-set-catalog-immutable-twelve-original-members`,async()=>{
  assert.equal(COSMETIC_CATALOG.length,53);assert.ok(Object.isFrozen(COSMETIC_CATALOG));assert.ok(COSMETIC_CATALOG.every(Object.isFrozen));
  assert.ok(Object.isFrozen(COSMETIC_SETS));assert.ok(COSMETIC_SETS.every(Object.isFrozen));assert.deepEqual(COSMETIC_SETS.map(set=>[set.id,...kinds.map(kind=>set[kind])]),expectedTriples);
  for(const set of COSMETIC_SETS)for(const kind of kinds){const item=COSMETIC_CATALOG.find(row=>row.key===`${kind}.${set[kind]}`);assert.ok(item);assert.equal(item.price,{theme:900,cargo:300,forklift:600}[kind]);}
  return {catalog:53,sets:15,independentPricesRetained:true};
 });
 for(const viewport of [{width:320,height:720,safeTop:24,dpr:2},...DIALOG_VIEWPORTS])await run(`${mode}-set-twelve-previews-cancel-pages-tools-${viewport.width}x${viewport.height}`,async()=>{
  const d=await driver(fresh(),{viewport});open(d);const before=snapshot(d),appearance=structuredClone(d.account().profile.cosmetics),visited=[];
  visible(d,'场景 · 货箱 · 叉车');
  for(const set of COSMETIC_SETS){d.previewSet(set.id);visible(d,`${set.name} · 已拥有 0/3`);geometry(d);assert.ok(!d.controls().some(c=>c.action.type==='equipCosmeticSet'),'Unowned set cannot be equipped');visible(d,mode==='free'?'领取套装':'购买套装');previewDraws(d,set);assertNoStorageChanges(before,snapshot(d));assert.deepEqual(d.account().profile.cosmetics,appearance);if(viewport.width<=360||set.id==='cold_chain')await capture(d,`${mode}-${viewport.width}-set-preview-${set.id}`);d.action({type:'closeCosmeticSet'});geometry(d);visited.push(set.id);}
  returnRasterSetListToFirstPage(d);
  d.action({type:'selectShopTab',tab:'tools'});for(const item of ['rotate','clear','wildcard'])assert.ok(d.controls().some(c=>c.action.type==='purchase'&&c.action.item===item));geometry(d);await capture(d,`${mode}-${viewport.width}-old-tools-intact`);
  d.action({type:'selectShopTab',tab:'cosmetics'});d.action({type:'back'});assertNoStorageChanges(before,snapshot(d));return {visited,previewWrites:0,pages:4,toolsRetained:true,backNoEquip:true};
 });
 await run(`${mode}-set-partial-owned-one-two-disabled-zero-writes`,async()=>{
  const set=COSMETIC_SETS[0],rows=[];
  for(const count of [1,2]){const storage=rewrite(fresh(),account=>{account.profile.ownedCosmetics=[...new Set([...account.profile.ownedCosmetics,...kinds.slice(0,count).map(kind=>`${kind}.${set[kind]}`)])].sort();});const d=await driver(storage,{viewport:DIALOG_VIEWPORTS[0]});open(d);const before=snapshot(d);d.previewSet(set.id);visible(d,`${set.name} · 已拥有 ${count}/3`);assert.ok(!d.controls().some(c=>c.action.type==='equipCosmeticSet'),'Partial ownership never enables whole-set equip');d.purchase({type:'purchaseCosmeticSet',id:set.id});d.cancel();d.action({type:'closeCosmeticSet'});assertNoStorageChanges(before,snapshot(d));rows.push({owned:count,missing:3-count});}
  return {rows,partialApplyWrites:0};
 });
 await run(`${mode}-set-all-twelve-atomic-apply-duplicate-reload`,async()=>{
  const d=await driver(owned(fresh(),{}),{viewport:DIALOG_VIEWPORTS[0]});open(d);const results=[];
  for(const set of COSMETIC_SETS){d.previewSet(set.id);const before=structuredClone(d.account()),button=d.action({type:'equipCosmeticSet',id:set.id}),after=structuredClone(d.account());assert.equal(after.generation,before.generation+1);assert.deepEqual(after.profile.cosmetics,slots(set));assert.deepEqual(conserved(after),conserved(before));assert.equal(d.h.storage.get(ACCOUNT_KEYS.a),d.h.storage.get(ACCOUNT_KEYS.b));visible(d,'使用中');const stable=snapshot(d),p=center(button.rect);d.h.pointer('up',p.x,p.y);d.frame(0);d.action({type:'equipCosmeticSet',id:set.id},{disabled:true});assertNoStorageChanges(stable,snapshot(d));results.push({id:set.id,generation:after.generation});}
  await capture(d,`${mode}-all-owned-set-applied`);const reboot=await driver(new Map(d.h.storage));assert.deepEqual(reboot.account().profile,d.account().profile);assert.equal(reboot.account().wallet,2000);return {results,atomicSlots:3,wallet:2000,duplicateWrites:0,reloaded:true};
 });
 await run(`${mode}-set-members-independent-purchase-equip`,async()=>{
  const d=await driver(fresh(),{viewport:DIALOG_VIEWPORTS[0]}),set=COSMETIC_SETS[0],purchases=[];open(d);
  for(const kind of kinds){d.previewSet(set.id);const beforeRoute=snapshot(d);d.action({type:'previewCosmeticSetMember',kind});assertNoStorageChanges(beforeRoute,snapshot(d));const item=COSMETIC_CATALOG.find(row=>row.key===`${kind}.${set[kind]}`);visible(d,item.name);const before=snapshot(d),a=structuredClone(d.account());d.purchase({type:'purchaseCosmetic',kind,id:set[kind]});visible(d,mode==='free'?'确认领取':'确认购买');d.cancel();assertNoStorageChanges(before,snapshot(d));d.purchase({type:'purchaseCosmetic',kind,id:set[kind]});const button=d.confirm(),b=d.account();assert.equal(b.generation,a.generation+1);assert.equal(b.wallet,a.wallet-(mode==='free'?0:item.price));assert.ok(b.profile.ownedCosmetics.includes(item.key));assert.deepEqual(b.profile.cosmetics,a.profile.cosmetics);const stable=snapshot(d),p=center(button.rect);d.h.pointer('up',p.x,p.y);d.frame(0);assertNoStorageChanges(stable,snapshot(d));d.action({type:'equipCosmetic',kind,id:set[kind]});const equipped=d.account();for(const slot of kinds)assert.equal(equipped.profile.cosmetics[slot],slot===kind?set[kind]:a.profile.cosmetics[slot]);purchases.push({key:item.key,cost:mode==='free'?0:item.price});}
  d.previewSet(set.id);visible(d,`${set.name} · 已拥有 3/3`);d.action({type:'equipCosmeticSet',id:set.id},{disabled:true});await capture(d,`${mode}-independently-acquired-members`);const reboot=await driver(new Map(d.h.storage));assert.deepEqual(reboot.account().profile,d.account().profile);return {purchases,wallet:d.account().wallet,claimNeverEquips:true,individualEquipsIndependent:true};
 });
 for(const failKey of [ACCOUNT_KEYS.b,ACCOUNT_KEYS.a])await run(`${mode}-set-atomic-save-failure-retry-${failKey===ACCOUNT_KEYS.b?'first-root':'mirror-root'}`,async()=>{
  let broken=false;const set=COSMETIC_SETS[0],d=await driver(owned(fresh(),{}),{viewport:DIALOG_VIEWPORTS[0],faults:{before:({kind,key})=>{if(broken&&kind==='set'&&key===failKey)throw Error('Injected native set commit fault');}}});open(d);d.previewSet(set.id);const before=structuredClone(d.account());broken=true;d.action({type:'equipCosmeticSet',id:set.id});if(failKey===ACCOUNT_KEYS.a)d.accountBlocked=true;d.frame(0);assert.ok(d.h.labels.some(row=>/尚未确认/.test(row.text)),'Actual native save-failure message required');if(failKey===ACCOUNT_KEYS.b){assert.equal(d.account().generation,before.generation);assert.deepEqual(d.account().profile.cosmetics,before.profile.cosmetics);}
  for(const key of [ACCOUNT_KEYS.a,ACCOUNT_KEYS.b]){const stored=decodeAccount(mapPort(d.h.storage),d.h.storage.get(key));assert.ok(stored);assert.ok([before.profile.cosmetics,slots(set)].some(expected=>isDeepStrictEqual(expected,stored.profile.cosmetics)),'Every stored root contains an entire old or new set, never partial slots');assert.ok(stored.generation===before.generation||stored.generation===before.generation+1);}
  await capture(d,`${mode}-set-${failKey===ACCOUNT_KEYS.b?'first':'mirror'}-save-blocked`);d.h.callbacks.hide();d.h.callbacks.show();d.frame(0);broken=false;if(failKey===ACCOUNT_KEYS.a){d.action({type:'retrySave'});d.accountBlocked=false;}else d.action({type:'equipCosmeticSet',id:set.id});d.frame(0);const after=d.account();assert.equal(after.generation,before.generation+1);assert.deepEqual(after.profile.cosmetics,slots(set));assert.deepEqual(conserved(after),conserved(before));assert.equal(d.h.storage.get(ACCOUNT_KEYS.a),d.h.storage.get(ACCOUNT_KEYS.b));const stable=snapshot(d);d.action({type:'equipCosmeticSet',id:set.id},{disabled:true});assertNoStorageChanges(stable,snapshot(d));const reboot=await driver(new Map(d.h.storage));assert.deepEqual(reboot.account().profile,after.profile);return {faultRoot:failKey,retry:failKey===ACCOUNT_KEYS.a?'repair pending committed operation':'repeat definitely uncommitted apply',generationDelta:1,atomicSlots:3,reloaded:true};
 });
 // v0.21 additions. Frozen v0.20 case names above remain stable for explicit baseline accounting.
 const subset=(set,mask,wallet=2000)=>rewrite(fresh(wallet),account=>{account.profile.ownedCosmetics=[...new Set([...account.profile.ownedCosmetics,...kinds.filter((_,index)=>mask&(1<<index)).map(kind=>`${kind}.${set[kind]}`)])].sort();});
 const purchaseAction=set=>({type:'purchaseCosmeticSet',id:set.id});
 const repeat=(d,button)=>{const stable=snapshot(d),point=center(button.rect);d.h.tap(point.x,point.y);d.h.tap(point.x,point.y);d.h.pointer('up',point.x,point.y);d.frame(0);assertNoStorageChanges(stable,snapshot(d));};
 const detailControls=(d,set,complete=false)=>{
  const controls=d.controls(),left=controls.find(c=>c.action.type==='closeCosmeticSet'),right=controls.find(c=>c.action.type===(complete?'equipCosmeticSet':'purchaseCosmeticSet'));
  assert.ok(left&&right);assert.equal(left.label,'返回套装');assert.equal(left.buttonRole,'secondary');assert.equal(right.buttonRole,'primary');assert.ok(left.rect.x+left.rect.w<right.rect.x,'Return stays left and bundle action stays right');
  assert.equal(right.action.id,set.id);geometry(d);visible(d,'返回套装');
  if(!complete&&mode==='paid')visible(d,`${rasterBundleQuote(set,d.account(),mode).price}金币`);
  const witnessed=d.h.pixelWitness.enabled;d.h.pixelWitness.enabled=true;d.frame(0);
  try{for(const [control,role] of [[left,'secondary'],[right,right.disabled?'disabled':'primary']]){
   for(const text of control.label.split('\n'))assertTextPaint(d.h,text,{within:physicalRect(d.h,control.rect)});
   const samples=[.10,.14].map(fraction=>{const p=physicalRect(d.h,{x:control.rect.x+30,y:control.rect.y+control.rect.h*fraction,w:0,h:0});return [...d.h.context.getImageData(Math.round(p.x),Math.round(p.y),1,1).data];});assertControlTone(samples,role);
  }}finally{d.h.pixelWitness.enabled=witnessed;}
  return {left,right};
 };
 const confirmCopy=(d,set,quote,wallet)=>{
  visible(d,`${mode==='free'?'领取':'购买'}${set.name}套装？`);visible(d,`补齐 ${quote.missingKeys.length} 件未拥有外观。`);
  visible(d,mode==='free'?'免费领取，永久拥有。':`未拥有原价 ${quote.originalPrice} 金币 · 8折 ${quote.price} 金币。`);
  visible(d,`余额 ${wallet} → ${wallet-quote.price}。`);visible(d,mode==='free'?'确认领取':'确认购买');geometry(d);
 };
 for(let mask=0;mask<8;mask++)await run(`${mode}-v021-bundle-all-fifteen-owned-subset-${mask.toString(2).padStart(3,'0')}`,async()=>{
  const rows=[];
  for(const set of COSMETIC_SETS){
   const viewport={width:mask%2?360:320,height:mask%2?800:720,safeTop:24,dpr:2},d=await driver(subset(set,mask,mode==='free'?0:2000),{viewport});open(d);d.previewSet(set.id);
   const before=structuredClone(d.account()),stable=snapshot(d),quote=rasterBundleQuote(set,before,mode),ownedCount=3-quote.missingKeys.length;visible(d,`${set.name} · 已拥有 ${ownedCount}/3`);detailControls(d,set,ownedCount===3);previewDraws(d,set);
   if(quote.missingKeys.length){
    visible(d,mode==='free'?'领取套装':'购买套装');d.purchase(purchaseAction(set));confirmCopy(d,set,quote,before.wallet);assertNoStorageChanges(stable,snapshot(d));d.cancel();assertNoStorageChanges(stable,snapshot(d));
    d.purchase(purchaseAction(set));confirmCopy(d,set,quote,before.wallet);if(mask===0&&['forest_depot','ice_vault','harbor'].includes(set.id))await capture(d,`${mode}-v021-${set.id}-bundle-confirm-320`);
    const confirm=d.confirm(),after=structuredClone(d.account());assertRasterBundleCommit(before,after,set,mode);assert.equal(d.h.storage.get(ACCOUNT_KEYS.a),d.h.storage.get(ACCOUNT_KEYS.b));visible(d,'装备整套');repeat(d,confirm);
    rows.push({id:set.id,ownedMask:mask,quote,receipt:after.lastOperation,walletBefore:before.wallet,walletAfter:after.wallet,claimNeverEquips:true});
   }else{
    assert.equal(d.controls().some(c=>c.action.type==='purchaseCosmeticSet'),false,'Fully owned detail cannot charge or issue another claim');assertNoStorageChanges(stable,snapshot(d));assertRasterBundleCommit(before,d.account(),set,mode);rows.push({id:set.id,ownedMask:mask,quote,fullyOwnedNoPurchase:true});
   }
   const ownedAccount=structuredClone(d.account());detailControls(d,set,true);visible(d,'装备整套');const equip=d.action({type:'equipCosmeticSet',id:set.id});assert.equal(d.account().generation,ownedAccount.generation+1);assert.deepEqual(d.account().profile.cosmetics,slots(set));assert.deepEqual(conserved(d.account()),conserved(ownedAccount));visible(d,'使用中');repeat(d,equip);d.action({type:'equipCosmeticSet',id:set.id},{disabled:true});
   const saved=snapshot(d);d.h.callbacks.hide();d.h.callbacks.show();d.frame(0);assertNoStorageChanges(saved,snapshot(d));
   if(['forest_depot','ice_vault','harbor'].includes(set.id)){const reboot=await driver(new Map(d.h.storage),{viewport});assert.deepEqual(reboot.account(),d.account());rows.at(-1).reloaded=true;if(mask===0)await capture(d,`${mode}-v021-${set.id}-bundle-owned-equipped-320`);}
  }
  return {rows,sets:15,ownedMask:mask,cancelZeroWrites:true,duplicateClicksZeroWrites:true,explicitEquipOnly:true,receiptOracle:'Independent missing-only 80-percent price, actual stored request digest, one generation and no unrelated changes'};
 });
 for(const fault of [{name:'before-first-root',timing:'before',key:ACCOUNT_KEYS.b},{name:'before-mirror-root',timing:'before',key:ACCOUNT_KEYS.a},{name:'after-first-root',timing:'after',key:ACCOUNT_KEYS.b},{name:'after-mirror-root',timing:'after',key:ACCOUNT_KEYS.a}])await run(`${mode}-v021-bundle-atomic-${fault.name}-retry`,async()=>{
  let broken=false,hits=0;const set=COSMETIC_SETS.find(row=>row.id==='harbor'),d=await driver(subset(set,2),{viewport:{width:320,height:720,safeTop:24,dpr:2},faults:{[fault.timing]:({kind,key})=>{if(broken&&kind==='set'&&key===fault.key){hits++;throw Error(`Injected native bundle ${fault.name}`);}}}});open(d);d.previewSet(set.id);const before=structuredClone(d.account());d.purchase(purchaseAction(set));broken=true;d.confirm();assert.ok(hits>0,'Requested native storage fault must actually execute');
  const roots=[ACCOUNT_KEYS.a,ACCOUNT_KEYS.b].map(key=>({key,account:decodeAccount(mapPort(d.h.storage),d.h.storage.get(key))}));
  for(const root of roots){assert.ok(root.account);if(root.account.generation===before.generation)assert.deepEqual(root.account,before);else assertRasterBundleCommit(before,root.account,set,mode);}
  const uncertain=fault.timing==='before'&&fault.key===ACCOUNT_KEYS.a,uncommitted=fault.timing==='before'&&fault.key===ACCOUNT_KEYS.b;
  if(uncertain){d.accountBlocked=true;d.frame(0);assert.ok(d.h.labels.some(row=>/尚未确认/.test(row.text)));}
  if(uncommitted){assert.deepEqual(d.account(),before);assert.ok(d.h.labels.some(row=>/尚未确认/.test(row.text)));}
  await capture(d,`${mode}-v021-bundle-${fault.name}`);d.h.callbacks.hide();d.h.callbacks.show();d.frame(0);broken=false;
  if(uncertain){d.action({type:'retrySave'});d.accountBlocked=false;d.frame(0);}else if(uncommitted){d.purchase(purchaseAction(set));d.confirm();}
  const after=structuredClone(d.account());assertRasterBundleCommit(before,after,set,mode);assert.equal(d.h.storage.get(ACCOUNT_KEYS.a),d.h.storage.get(ACCOUNT_KEYS.b));visible(d,'装备整套');const stable=snapshot(d);d.h.callbacks.hide();d.h.callbacks.show();d.frame(0);assertNoStorageChanges(stable,snapshot(d));
  const reboot=await driver(new Map(d.h.storage));assert.deepEqual(reboot.account(),after);return {fault,hits,rootGenerations:roots.map(row=>row.account.generation),receipt:after.lastOperation,generationDelta:1,quote:rasterBundleQuote(set,before,mode),noAutoEquip:true,reloaded:true};
 });
 await run(`${mode}-v021-bundle-unknown-readback-same-receipt-repair`,async()=>{
  let armed=false,written=false,readFaults=0;const set=COSMETIC_SETS.find(row=>row.id==='ice_vault'),faults={before:({kind,key})=>{if(armed&&written&&kind==='get'&&[ACCOUNT_KEYS.a,ACCOUNT_KEYS.b].includes(key)){readFaults++;throw Error('Injected unknown native bundle read-back');}},after:({kind,key})=>{if(armed&&kind==='set'&&key===ACCOUNT_KEYS.b)written=true;}};
  const d=await driver(subset(set,1),{viewport:{width:320,height:720,safeTop:24,dpr:2},faults});open(d);d.previewSet(set.id);const before=structuredClone(d.account());d.purchase(purchaseAction(set));armed=true;d.confirm();d.accountBlocked=true;d.frame(0);assert.ok(written&&readFaults>0);visible(d,'保存结果尚未确认，请重试');
  const first=decodeAccount(mapPort(d.h.storage),d.h.storage.get(ACCOUNT_KEYS.b)),old=decodeAccount(mapPort(d.h.storage),d.h.storage.get(ACCOUNT_KEYS.a));assert.ok(first&&old);assert.deepEqual(old,before);assertRasterBundleCommit(before,first,set,mode);const receipt=structuredClone(first.lastOperation);await capture(d,`${mode}-v021-bundle-readback-unknown-320`);
  d.h.callbacks.hide();d.h.callbacks.show();d.frame(0);armed=false;d.action({type:'retrySave'});d.accountBlocked=false;d.frame(0);assertRasterBundleCommit(before,d.account(),set,mode);assert.deepEqual(d.account().lastOperation,receipt,'Retry repairs the same confirmed operation rather than buying again');assert.equal(d.h.storage.get(ACCOUNT_KEYS.a),d.h.storage.get(ACCOUNT_KEYS.b));visible(d,'装备整套');const reboot=await driver(new Map(d.h.storage));assert.deepEqual(reboot.account(),d.account());return {readFaults,receipt,generationDelta:1,oneCharge:true,reloaded:true,noAutoEquip:true};
 });
 await run(`${mode}-v021-bundle-stale-quote-other-native-writer`,async()=>{
  const set=COSMETIC_SETS.find(row=>row.id==='forest_depot'),d=await driver(subset(set,0),{viewport:{width:320,height:720,safeTop:24,dpr:2}});open(d);d.previewSet(set.id);const first=rasterBundleQuote(set,d.account(),mode);d.purchase(purchaseAction(set));
  // A separate instance of the same frozen game.js buys an actual member through its own native pointers.
  const other=await driver(d.h.storage,{viewport:DIALOG_VIEWPORTS[0]});open(other);other.preview('cargo',set.cargo);other.purchase({type:'purchaseCosmetic',kind:'cargo',id:set.cargo});other.confirm();
  const externallyUpdated=structuredClone(other.account()),stable=snapshot(d);d.confirm();assertNoStorageChanges(stable,snapshot(d));assert.deepEqual(d.account(),externallyUpdated);visible(d,'套装报价已变化，请重新确认');visible(d,`${set.name} · 已拥有 1/3`);assert.ok(!d.h.labels.some(row=>row.text===(mode==='free'?'确认领取':'确认购买')),'Stale confirmation must close');
  await capture(d,`${mode}-v021-bundle-stale-quote-320`);d.purchase(purchaseAction(set));const second=rasterBundleQuote(set,externallyUpdated,mode);assert.deepEqual(second.missingKeys,[`theme.${set.theme}`,`forklift.${set.forklift}`]);confirmCopy(d,set,second,externallyUpdated.wallet);d.confirm();assertRasterBundleCommit(externallyUpdated,d.account(),set,mode);return {first,second,externalMemberReceipt:externallyUpdated.lastOperation,bundleReceipt:d.account().lastOperation,staleConfirmWrites:0,explicitReconfirm:true};
 });
 await run(`${mode}-v021-bundle-insufficient-or-free-zero-wallet`,async()=>{
  const set=COSMETIC_SETS.find(row=>row.id==='ice_vault'),wallet=mode==='free'?0:1439,d=await driver(subset(set,0,wallet),{viewport:{width:320,height:720,safeTop:24,dpr:2}});open(d);d.previewSet(set.id);const before=structuredClone(d.account()),stable=snapshot(d);detailControls(d,set);
  if(mode==='paid'){visible(d,'购买套装');visible(d,'1440金币');visible(d,'原价1800 · 8折 · 还差1金币');d.action(purchaseAction(set),{disabled:true});assertNoStorageChanges(stable,snapshot(d));assert.deepEqual(d.account(),before);await capture(d,'paid-v021-bundle-one-coin-short-320');d.action({type:'closeCosmeticSet'});assertNoStorageChanges(stable,snapshot(d));}
  else{visible(d,'领取套装');d.purchase(purchaseAction(set));confirmCopy(d,set,rasterBundleQuote(set,before,mode),0);d.confirm();assertRasterBundleCommit(before,d.account(),set,mode);assert.equal(d.account().wallet,0);await capture(d,'free-v021-bundle-zero-wallet-320');}
  return {wallet,disabled:mode==='paid',freeClaimAllowed:mode==='free'};
 });

 await run(`${mode}-set-outline-ice-classic-restored`,async()=>{
  const d=await driver(owned(fresh(),{cargo:'ice_crystal'}),{viewport:DIALOG_VIEWPORTS[0]});open(d);const before=snapshot(d);d.preview('cargo','outline');assertNoStorageChanges(before,snapshot(d));assert.equal(d.account().profile.cosmetics.cargo,'ice_crystal');assert.equal(d.h.rasterDraws.filter(row=>row.source==='assets/cargo-materials.png').length,0,'Outline preview displays preserved classic body, not equipped ice');await capture(d,`${mode}-outline-preview-after-ice`);d.action({type:'setCargoOutline',enabled:true});assert.equal(d.account().profile.cosmetics.cargo,'classic');assert.equal(d.account().profile.cargoOutline,true);d.action({type:'setCargoOutline',enabled:false});assert.equal(d.account().profile.cosmetics.cargo,'classic');assert.equal(d.account().profile.cargoOutline,false);return {previewNoEquip:true,enableRestoresClassic:true,disableRetainsClassic:true};
 });
 await run(`${mode}-set-cache-cold-warm-fallback-pixels-bounded`,async()=>{
  const storage=fresh(),set=COSMETIC_SETS[0],d=await driver(new Map(storage),{viewport:{width:320,height:720,safeTop:24,dpr:2}});open(d);d.previewSet(set.id);previewDraws(d,set);
  const pixels=()=>sha256(d.h.context.getImageData(0,0,d.h.canvas.width,d.h.canvas.height).data),coldBytes=d.h.context.getImageData(0,0,d.h.canvas.width,d.h.canvas.height).data,cold=pixels(),before={...d.h.rasterCounters},stable=snapshot(d);assert.ok(before.offscreenAssetDrawCalls>0,'Real offscreen surface must draw packaged artwork');assert.ok(d.h.rasterComposites.length>0,'Actual main canvas must compose a real cached surface');assert.ok(d.h.rasterDraws.every(row=>row.viaSurfaces.length>0),'Set detail source crops must have proven main-surface lineage');
  for(let frame=0;frame<4;frame++)d.frame(16);assert.equal(pixels(),cold,'Warm cache preserves every actual screen pixel');assert.equal(d.h.rasterCounters.assetDrawCalls,before.assetDrawCalls,'Warm static set preview performs zero new atlas draws');assert.ok(d.h.rasterCounters.compositeDrawCalls>before.compositeDrawCalls);assertNoStorageChanges(stable,snapshot(d));
  for(const row of COSMETIC_SETS){d.previewSet(row.id);const active=d.h.surfaceInfo.filter(surface=>surface.width>1&&surface.height>1);assert.ok(active.length<=5,'Bounded native preview cache retains at most five active surfaces');assert.ok(active.reduce((bytes,surface)=>bytes+surface.width*surface.height*4,0)<=5000000,'Native active preview cache stays within five million RGBA bytes');}
  d.previewSet(set.id);const beforeShow=d.h.rasterCounters.offscreenAssetDrawCalls;d.h.callbacks.hide();d.h.callbacks.show();d.frame(0);previewDraws(d,set);assert.ok(d.h.rasterCounters.offscreenAssetDrawCalls>beforeShow,'Native resume reconstructs invalidated preview surface');assert.equal(pixels(),cold);assertNoStorageChanges(stable,snapshot(d));
  const fallback=await driver(new Map(storage),{viewport:{width:320,height:720,safeTop:24,dpr:2},rejectOffscreenCanvases:true});const fallbackStable=snapshot(fallback);open(fallback);fallback.previewSet(set.id);previewDraws(fallback,set);geometry(fallback);assert.equal(fallback.h.rasterComposites.length,0);assertNoStorageChanges(fallbackStable,snapshot(fallback));
  const uncached=fallback.h.context.getImageData(0,0,fallback.h.canvas.width,fallback.h.canvas.height).data;assert.equal(uncached.length,coldBytes.length);let changedPixels=0,changedChannels=0,maxChannelDifference=0;const edgeDifferences=[];
  for(let pixel=0;pixel<uncached.length;pixel+=4){let changed=false,maximum=0;for(let channel=0;channel<4;channel++){const difference=Math.abs(uncached[pixel+channel]-coldBytes[pixel+channel]);if(difference){changed=true;changedChannels++;maximum=Math.max(maximum,difference);maxChannelDifference=Math.max(maxChannelDifference,difference);}}if(changed)changedPixels++;if(maximum>4)edgeDifferences.push({x:pixel/4%d.h.canvas.width,y:Math.floor(pixel/4/d.h.canvas.width),maximum});}
  const forcedUncachedDifference={changedPixels,changedChannels,totalPixels:uncached.length/4,fraction:changedPixels/(uncached.length/4),maxChannelDifference,edgeDifferences,reason:'Reviewed 320px high-DPR cold-chain fan-edge rasterization differences only; protected gameplay pixels and cold/warm equality remain exact'};
  const reviewedFanEdges=new Map([['270,584',5],['271,584',11],['312,584',17],['353,584',17]]);
  assert.ok(forcedUncachedDifference.fraction<.005&&edgeDifferences.length<=4&&edgeDifferences.every(pixel=>pixel.maximum<=(reviewedFanEdges.get(`${pixel.x},${pixel.y}`)??0)),`Forced-uncached rounding exceeds the four specifically reviewed fan-edge pixels: ${JSON.stringify(forcedUncachedDifference)}`);await capture(d,`${mode}-native-cache-warm-detail`);await capture(fallback,`${mode}-native-cache-unavailable-fallback`);
  return {coldSourceCalls:before.offscreenAssetDrawCalls,warmAtlasDrawCalls:0,warmPixelsIdentical:true,forcedUncachedDifference,resumeInvalidated:true,maxActiveSurfaces:5,maxActiveBytes:5000000};
 });
 await run(`${mode}-set-delayed-rejected-assets-cancel-no-state-change`,async()=>{
  const set=COSMETIC_SETS[0],rows=[];
  for(const imageState of ['pending','error']){const d=await driver(fresh(),{viewport:DIALOG_VIEWPORTS[0],imageState});open(d);const before=snapshot(d);d.previewSet(set.id);assert.equal(d.h.imageTrace.length,4);assert.ok(d.h.imageTrace.every(row=>row.status===(imageState==='pending'?'pending':'error')));assert.equal(d.h.rasterDraws.length,0);visible(d,`${set.name} · 已拥有 0/3`);geometry(d);await capture(d,`${mode}-set-${imageState}-fallback`);if(imageState==='pending'){await d.h.settleImages();d.frame(0);previewDraws(d,set);assertNoStorageChanges(before,snapshot(d));}d.action({type:'closeCosmeticSet'});d.action({type:'back'});assertNoStorageChanges(before,snapshot(d));rows.push(imageState);}
  return {states:rows,previewAndCancelPlayable:true,writes:0};
 });
}
