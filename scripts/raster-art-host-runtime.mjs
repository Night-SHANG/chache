/** Actual original game.js verification. Source modules only supply fixtures and input geometry. */
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { DialogDriver, runDialogFeedbackNative } from './dialog-feedback-host-runtime.mjs';
import { createBoundFinalEconomyHost } from './final-economy-host-support.mjs';
import { attachPixelWitness, physicalRect } from './refinement-host-support.mjs';
import { assertVisibleGlyphs, validateResumeStorage, sha256 } from './growth-host-support.mjs';
import { cosmeticAccountStorage, cosmeticResumeStorage } from './cosmetic-stage15-host-support.mjs';
import { constructedPendingRush, constructedCosmeticScene, nativeRushBadges } from './host-base-rush-music.mjs';
import { assertNoStorageChanges, DIALOG_VIEWPORTS } from './dialog-feedback-host-protocol.mjs';
import { traceSummary } from './material-feedback-host-protocol.mjs';
import { COSMETIC_SETS } from '../src/application/cosmetic-sets.ts';
import { runRasterSetCases } from './raster-set-host-runtime.mjs';
import {rasterSelectedCases} from './raster-art-host-rerun.mjs';
import { COSMETIC_CATALOG } from '../src/application/cosmetics.ts';
import { ACCOUNT_KEYS, encodeAccount } from '../src/application/account-store.ts';
import { cosmeticShopPage } from '../src/presentation/economy-ui.ts';
import { getTrayRects, cellCenter } from '../src/presentation/layout.ts';
import { applyPlayableCommand, playableChecksum, createPlayableRun, reservedEntryCells } from '../src/domain/playable.ts';
import { RASTER_ART_CONTRACT, RASTER_CARGO_STYLES, RASTER_THEMES, RASTER_FORKLIFTS, RASTER_FORKLIFT_COLUMNS, assertRasterImageTrace, assertRasterDraws, assertRasterThemeDraws, rasterBundleQuote, assertRasterPriorCaseCoverage, assertRasterProtectedBoardHash } from './raster-art-host-protocol.mjs';

const center=r=>({x:r.x+r.w/2,y:r.y+r.h/2});
const snapshot=d=>({entries:[...d.h.storage].sort(([a],[b])=>a.localeCompare(b)),writeCount:d.h.operations.filter(row=>['set','remove'].includes(row.kind)).length});
const rewrite=(storage,change)=>{const account=structuredClone(validateResumeStorage(storage).account);change(account);const raw=encodeAccount(account);for(const key of [ACCOUNT_KEYS.a,ACCOUNT_KEYS.b])storage.set(key,raw);validateResumeStorage(storage);return storage;};
const owned=(storage,cosmetics)=>rewrite(storage,account=>{account.profile.ownedCosmetics=COSMETIC_CATALOG.map(row=>row.key).sort();account.profile.cosmetics={...account.profile.cosmetics,...cosmetics};account.profile.cargoOutline=false;});
const region=(d,rect)=>{const r=physicalRect(d.h,rect);return sha256(d.h.context.getImageData(Math.floor(r.x),Math.floor(r.y),Math.max(1,Math.floor(r.w)),Math.max(1,Math.floor(r.h))).data);};
const cropCargo=(style,column=0)=>[column*134+3,RASTER_CARGO_STYLES.indexOf(style)*134+3,128,128];

/** Wrap only the host Canvas API; never inject state or compatibility globals into the product VM. */
export function attachRasterDrawWitness(host){
 const frame=host.frame,surfaces=new WeakMap();host.rasterDraws=[];host.rasterComposites=[];host.rasterCounters={assetDrawCalls:0,offscreenAssetDrawCalls:0,compositeDrawCalls:0};
 const matrix=ctx=>{const m=ctx.getTransform();return [m.a,m.b,m.c,m.d,m.e,m.f];};
 const multiply=(a,b)=>[a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5]];
 const wrap=(ctx,record)=>{
  const draw=ctx.drawImage.bind(ctx),clear=ctx.clearRect.bind(ctx);
  if(record)ctx.clearRect=(...args)=>{record.draws.length=0;return clear(...args);};
  ctx.drawImage=(image,...args)=>{
   const transform=matrix(ctx),alpha=ctx.globalAlpha,sourceSurface=surfaces.get(image),result=draw(image,...args),target=record?record.draws:host.rasterDraws;
   if(sourceSurface){
    const [sx,sy,sw,sh,dx,dy,dw,dh]=args.length===8?args:args.length===4?[0,0,image.width,image.height,...args]:[0,0,image.width,image.height,args[0],args[1],image.width,image.height];
    const local=[dw/sw,0,0,dh/sh,dx-sx*dw/sw,dy-sy*dh/sh],composite={surfaceId:sourceSurface.id,args,alpha,transform};host.rasterCounters.compositeDrawCalls++;
    if(!record)host.rasterComposites.push(composite);
    for(const row of sourceSurface.draws)target.push({...row,alpha:row.alpha*alpha,transform:multiply(multiply(transform,local),row.transform),viaSurfaces:[...(row.viaSurfaces??[]),sourceSurface.id],composite});
   }else{
    host.rasterCounters.assetDrawCalls++;if(record)host.rasterCounters.offscreenAssetDrawCalls++;
    target.push({source:image.src,args,alpha,transform,viaSurfaces:[]});
   }
   return result;
  };
 };
 wrap(host.context);host.canvasObservers?.push((surface,id)=>{const record={id,draws:[]};surfaces.set(surface,record);wrap(surface.getContext('2d'),record);});
 host.frame=(...args)=>{host.rasterDraws.length=0;host.rasterComposites.length=0;return frame(...args);};return host;
}

/** Constructed display-only board. It is never represented as replay or balance evidence. */
export function constructedDenseRasterScene(family){
 assert.ok(['inbound','outbound'].includes(family));const base=family==='inbound'?constructedCosmeticScene(family):null;
 const spec=base?.spec??{family:'outbound',variant:'endless',rulesetVersion:13,seed:17,difficultyId:'expert',toolCharges:{rotate:0,clear:0,wildcard:0}};
 const state=base?structuredClone(base.state):createPlayableRun(spec),reserved=reservedEntryCells(state),cargos=(family==='inbound'?['cargo.food','cargo.machine','cargo.chem','cargo.electronic','cargo.cold']:['cargo.food','cargo.machine','cargo.chem']);
 state.board.fill(null);state.cellTraits=state.board.map(()=>null);
 for(let index=0;index<state.board.length;index++)if(!reserved.includes(index)&&index%3!==0)state.board[index]=cargos[(index+Math.floor(index/state.boardSize))%cargos.length];
 const label=`CONSTRUCTED: dense ${state.boardSize}x${state.boardSize} valid-color display board with mandatory entries empty; no reachability or balance claim`;
 const storage=base?rewrite(new Map(base.storage),account=>{account.run.state={...account.run.state,board:state.board,cellTraits:state.cellTraits};}):cosmeticResumeStorage(spec,[],{constructedState:state,label});
 return {spec,state,label,storage};
}

/** Input geometry only. Product state is observed exclusively from native storage and pixels. */
export class RasterDriver extends DialogDriver {
 view(){return {...super.view(),cosmeticBrowse:this.cosmeticBrowse??'sets',cosmeticSetPage:this.cosmeticSetPage??0,cosmeticSetPreview:this.cosmeticSetPreview};}
 action(action,options={}){
  const selected=COSMETIC_SETS.find(set=>set.id===this.cosmeticSetPreview),control=super.action(action,options);
  if(!options.disabled){
   if(action.type==='selectCosmeticCategory')this.cosmeticBrowse='items';
   if(action.type==='selectCosmeticBrowse'){this.cosmeticBrowse=action.mode;this.cosmeticSetPreview=undefined;}
   if(action.type==='selectCosmeticSetPage'){this.cosmeticSetPage=action.page;this.cosmeticSetPreview=undefined;}
   if(action.type==='previewCosmeticSet'){this.cosmeticBrowse='sets';this.cosmeticSetPreview=action.id;}
   if(action.type==='closeCosmeticSet')this.cosmeticSetPreview=undefined;
   if(action.type==='previewCosmeticSetMember'){assert.ok(selected);this.cosmeticBrowse='items';this.cosmeticCategory=action.kind;this.cosmeticPreview={...this.cosmeticPreview,[action.kind]:selected[action.kind]};}
   if(action.type==='back'&&this.screen==='shop')this.screen='menu';
  }
  this.frame(0);return control;
 }
 purchase(action){
  if(action.type!=='purchaseCosmeticSet')return super.purchase(action);
  const set=COSMETIC_SETS.find(row=>row.id===action.id);assert.ok(set);const quote=rasterBundleQuote(set,this.account(),globalThis.__PLAYTEST_FREE_SHOP__?'free':'paid');
  const control=this.action(action);this.confirmation={kind:'purchaseCosmeticSet',cosmeticSetId:action.id,cosmeticSetQuote:quote};this.frame(0);return control;
 }
 previewSet(id){
  this.action({type:'selectCosmeticBrowse',mode:'sets'});const index=COSMETIC_SETS.findIndex(set=>set.id===id);assert.ok(index>=0);const target=Math.floor(index/4);
  while((this.cosmeticSetPage??0)!==target)this.action({type:'selectCosmeticSetPage',page:(this.cosmeticSetPage??0)+Math.sign(target-(this.cosmeticSetPage??0))});
  this.action({type:'previewCosmeticSet',id});
 }
}

export async function runRasterArtNative({out,mode,binding,manifest,beginning,only}){
 const selected=rasterSelectedCases(mode,only);
 const report=selected?{status:'RUNNING',mode,binding,manifest,beginning,cases:[],images:[],observations:[]}:await runDialogFeedbackNative({out,mode,binding,manifest,beginning,assertImageTrace:assertRasterImageTrace,wildcardLines:['入库：将待放货件换成单格万能箱。','出库：换成单格，自选货类。']});
 report.kind='Owner-bound original v0.21 game.js in native wx/Canvas VM; NOT WeChat developer tools or a physical device';
 report.scope=selected?'targeted':'full';report.selection=only??null;if(selected)report.selectedCaseNames=selected;
 report.legacyCaseCount=report.cases.length;if(!selected)assert.equal(report.legacyCaseCount,mode==='free'?28:6,'Prior 34 native regression cases must remain enabled');
 report.rasterCoverage={catalog:53,pageSize:4,themes:17,cargoStyles:15,newForklifts:15,atlases:4,sets:15,sceneMaterials:15,actualNativeDrawCalls:true,cachedDrawEvidence:'Actual offscreen atlas operations retain source crops and transforms; main composite lineage is reported separately',visualReview:'Separate review required'};
 const epoch=Date.parse('2026-10-08T12:00:00Z'),drivers=[],observations=[];
 const run=async(name,fn)=>{if(selected&&!selected.includes(name))return;try{report.cases.push({name,status:'PASS',...await fn()});console.log(`PASS ${name}`);}catch(error){const d=drivers.at(-1),failure={name,status:'FAIL',error:String(error),stack:error.stack};if(d){failure.picture=resolve(out,`FAIL-${name}.png`);await writeFile(failure.picture,await d.h.canvas.encode('png'));failure.nativeLabels=[...d.h.labels];failure.imageTrace=d.h.imageTrace;failure.draws=d.h.rasterDraws;}report.cases.push(failure);console.error(`FAIL ${name}: ${error}`);}await writeFile(resolve(out,'report.json'),JSON.stringify(report,null,2));};
 const driver=async(storage,{viewport=DIALOG_VIEWPORTS[1],imageState='ready',faults={},rejectOffscreenCanvases=false}={})=>{
  const gameHash=mode==='free'?binding.expectedGameJsSha256:binding.expectedPaidGameJsSha256;
  const exact={...binding,commit:beginning.commit,sourceSha256:beginning.sourceSha256,manifestSourceSha256:manifest.sourceSha256,expectedGameJsSha256:gameHash,gameJsSha256:gameHash};
  const h=attachRasterDrawWitness(attachPixelWitness(await createBoundFinalEconomyHost(exact,{...viewport,storage,epoch,deferImageLoads:true,rejectImageLoads:imageState==='error',faults,rejectOffscreenCanvases,bundlePath:resolve(mode==='free'?binding.freeBuildRoot:binding.paidBuildRoot,'wechat/game.js')})));
  if(imageState!=='pending')await h.settleImages();if(imageState==='ready')assertRasterImageTrace(h.imageTrace,binding);
  const d=new RasterDriver(h,out,report.images,epoch);d.nativeInputs=[];
  for(const key of ['down','move','up','cancel','hide','show']){const original=h.callbacks[key];h.callbacks[key]=(...args)=>{d.nativeInputs.push({type:key,time:h.time,event:args[0]??null});return original(...args);};}drivers.push(d);return d;
 };
 const capture=async(d,name)=>{d.frame(0);const picture=resolve(out,`${name}.png`);await writeFile(picture,await d.h.canvas.encode('png'));const row={name,picture,sha256:sha256(await readFile(picture)),gameJsSha256:d.h.gameJsSha256,viewport:d.h.viewport,labels:[...d.h.labels],glyphs:assertVisibleGlyphs(d.h,name),draws:structuredClone(d.h.rasterDraws),composites:structuredClone(d.h.rasterComposites),drawCounters:{...d.h.rasterCounters},surfaceInfo:d.h.surfaceInfo,imageTrace:structuredClone(d.h.imageTrace)};report.images.push({name,picture,sha256:row.sha256,viewport:row.viewport});observations.push(row);return row;};
 const boardPath=async(f,appearance,options)=>{const d=await driver(owned(new Map(f.storage),appearance),options);d.resume();return d;};
 const observeLoaded=async(d,scene)=>{
  let expected,start=d.h.time;
  if(scene.next.type==='place'){const proof=d.drag(scene.next);expected=proof.expected;start=proof.start;}
  else{expected=applyPlayableCommand(d.state(),scene.next);assert.equal(expected.error,undefined);d.beginTool('clear');d.selectTool(scene.next);d.action({type:'toolConfirm'});d.toolSelection=null;d.stateFallback=expected.state;d.frame(0);start=d.h.time;}
  d.h.frame(start+700);assert.equal(playableChecksum(d.state()),playableChecksum(expected.state));assert.ok(expected.events.some(row=>row.type==='shipment'));return {events:expected.events,draws:structuredClone(d.h.rasterDraws)};
 };
 await runRasterSetCases({mode,run,driver,capture,snapshot,rewrite,owned});
 if(selected){
  assert.deepEqual(report.cases.map(row=>row.name).sort(),[...selected].sort(),'Exactly four selected navigation cases must execute per mode');
  await writeFile(resolve(out,'raster-native-observations.json'),JSON.stringify({binding,scope:'targeted',selection:only,observations},null,2));
  await writeFile(resolve(out,'raster-native-input-storage-traces.json'),JSON.stringify({binding,scope:'targeted',selection:only,drivers:traceSummary(drivers).map((row,index)=>({...row,imageTrace:drivers[index].h.imageTrace}))},null,2));return report;
 }
 if(mode==='paid'){report.priorCaseCoverage=assertRasterPriorCaseCoverage(report.cases,mode);await writeFile(resolve(out,'raster-native-observations.json'),JSON.stringify({binding,observations},null,2));await writeFile(resolve(out,'raster-native-input-storage-traces.json'),JSON.stringify({binding,drivers:traceSummary(drivers).map((row,index)=>({...row,imageTrace:drivers[index].h.imageTrace}))},null,2));return report;}
 await run('raster-four-async-loads-pending-ready-failure-input',async()=>{
  const f=constructedPendingRush(),appearance={cargo:'steam_brass',theme:'steam_foundry',forklift:'steam'},d=await driver(owned(new Map(f.storage),appearance),{imageState:'pending'});d.resume();assert.deepEqual(d.h.imageTrace.map(row=>row.status),['pending','pending','pending','pending']);assert.equal(d.h.rasterDraws.length,0,'Pending assets cannot masquerade as decoded PNG drawing');
  d.h.pixelWitness.enabled=true;d.frame(0);nativeRushBadges(d.h,{zone:'tray',value:'3',minimum:3});d.h.pixelWitness.enabled=false;
  const pendingImage=await capture(d,'four-atlases-pending'),proof=d.drag(f.commands[0]);assert.equal(proof.expected.error,undefined,'Pending assets must not gate native placement');const stable=snapshot(d),checksum=playableChecksum(d.state());
  await d.h.settleImages();assertRasterImageTrace(d.h.imageTrace,binding);d.frame(0);assertNoStorageChanges(stable,snapshot(d));assert.equal(playableChecksum(d.state()),checksum);
  assertRasterDraws(d.h.rasterDraws,'assets/cargo-materials.png',cropCargo('steam_brass'));
  assertRasterThemeDraws(d.h.rasterDraws,'steam_foundry',d.state().boardSize**2);
  await capture(d,'four-atlases-ready-after-native-input');
  const rejected=await driver(owned(new Map(f.storage),appearance),{imageState:'error'});rejected.resume();assert.deepEqual(rejected.h.imageTrace.map(row=>row.status),['error','error','error','error']);assert.equal(rejected.h.rasterDraws.length,0);const failedImage=await capture(rejected,'four-atlases-rejected-fallback');assert.equal(failedImage.sha256,pendingImage.sha256,'Load errors retain exactly the complete pending fallback');rejected.drag(f.commands[0]);
  const scene=constructedCosmeticScene('inbound'),loaded=await boardPath(scene,appearance),transport=await observeLoaded(loaded,scene);assertRasterDraws(transport.draws,'assets/themed-forklifts.png',[RASTER_FORKLIFT_COLUMNS[RASTER_FORKLIFTS.indexOf('steam')]*128,0,128,128]);await capture(loaded,'four-atlases-real-loaded-transport');
  return {pendingInputPlayable:true,readyNoStorageOrGameplayChange:true,rejectedInputPlayable:true,imageTrace:d.h.imageTrace,rejectedTrace:rejected.h.imageTrace,actualTransport:transport};
 });
 await run('raster-catalog47-four-item-pages-native-claim-equip-restart',async()=>{
  const d=await driver(cosmeticAccountStorage({wallet:57,label:'FUNDED: 57 isolated coins; every new cosmetic acquired through native free-claim input'}));d.shop();d.action({type:'selectShopTab',tab:'cosmetics'});const visited=[],claims=[],pages=new Map();
  assert.equal(COSMETIC_CATALOG.length,53);
  for(const item of COSMETIC_CATALOG){
   const beforePreview=snapshot(d);d.preview(item.kind,item.id);assertNoStorageChanges(beforePreview,snapshot(d));const page=cosmeticShopPage(d.view());assert.equal(page.pages,5);assert.ok(page.items.length<=4);assert.ok(d.h.labels.some(row=>row.text===item.name),'Selected catalog name must actually be painted');
   const pageKey=`${item.kind}:${page.page}`;pages.set(pageKey,page.items.map(row=>row.key));const visible=d.controls().filter(row=>row.action.type==='previewCosmetic');assert.deepEqual(visible.map(row=>`${row.action.kind}.${row.action.id}`),page.items.map(row=>row.key));
   const ownership=d.account().profile.ownedCosmetics.includes(item.key);
   if(!ownership){const before=snapshot(d),appearance=structuredClone(d.account().profile.cosmetics);d.purchase({type:'purchaseCosmetic',kind:item.kind,id:item.id});assert.ok(d.h.labels.some(row=>row.text==='确认领取'));d.cancel();assertNoStorageChanges(before,snapshot(d));const generation=d.account().generation;d.purchase({type:'purchaseCosmetic',kind:item.kind,id:item.id});const button=d.confirm();assert.equal(d.account().generation,generation+1);assert.equal(d.account().wallet,57);assert.ok(d.account().profile.ownedCosmetics.includes(item.key));assert.deepEqual(d.account().profile.cosmetics,appearance);const committed=snapshot(d),p=center(button.rect);d.h.pointer('up',p.x,p.y);d.frame(0);assertNoStorageChanges(committed,snapshot(d));claims.push(item.key);}
   if(item.overlay){d.action({type:'setCargoOutline',enabled:true});assert.equal(d.account().profile.cargoOutline,true);d.action({type:'setCargoOutline',enabled:false});}
   else if(d.account().profile.cosmetics[item.kind]!==item.id)d.action({type:'equipCosmetic',kind:item.kind,id:item.id});
   if(!item.overlay)assert.equal(d.account().profile.cosmetics[item.kind],item.id);
   const reboot=await driver(new Map(d.h.storage));assert.deepEqual(reboot.account().profile,d.account().profile);assert.equal(reboot.account().wallet,57);
   visited.push({key:item.key,page:page.page,claimed:!ownership,equipped:!item.overlay,outline:item.overlay??false,reloaded:true});
   if(page.items.at(-1).key===item.key)await capture(d,`catalog-${item.kind}-page${page.page+1}`);
  }
  assert.equal(new Set(visited.map(row=>row.key)).size,53);assert.equal(pages.size,15);assert.equal(d.account().profile.ownedCosmetics.length,53);return {wallet:57,visited,claims,pages:Object.fromEntries(pages),allRightsPersist:true,claimDoesNotAutoEquip:true};
 });
 // New matching sets are reviewed as complete dense 7x7 and 9x9 gameplay screens at both small-phone widths.
 for(const set of COSMETIC_SETS.filter(row=>['forest_depot','ice_vault','harbor'].includes(row.id)))for(const viewport of [{width:320,height:720,safeTop:24,dpr:2},DIALOG_VIEWPORTS[0]])await run(`raster-v021-matched-${set.id}-full-board-${viewport.width}`,async()=>{
  const rows=[];for(const family of ['inbound','outbound']){
   const scene=constructedDenseRasterScene(family),d=await boardPath(scene,{theme:set.theme,cargo:set.cargo,forklift:set.forklift},{viewport}),before=snapshot(d),checksum=playableChecksum(d.state()),proof=assertRasterThemeDraws(d.h.rasterDraws,set.theme,d.state().boardSize**2);
   const cargoCount=family==='inbound'?5:3;for(let column=0;column<cargoCount;column++)assertRasterDraws(d.h.rasterDraws,'assets/cargo-materials.png',cropCargo(set.cargo,column));
   const first=region(d,{x:118,y:535,w:845,h:895});d.frame(300);assert.equal(region(d,{x:118,y:535,w:845,h:895}),first,'Matched board artwork remains static');assert.equal(playableChecksum(d.state()),checksum);assertNoStorageChanges(before,snapshot(d));
   const image=await capture(d,`v021-${set.id}-${family}-full-board-${viewport.width}`);rows.push({family,boardSize:d.state().boardSize,legalCargoColors:cargoCount,proof,picture:image.picture,sha256:image.sha256,provenance:scene.label});
  }return {setId:set.id,viewport,rows,actualPackagedArtAndGameGlyphs:true,visualReview:'Screenshots produced from original game.js; visual review remains separate'};
 });
 for(const theme of RASTER_THEMES)await run(`raster-theme-${theme}-native-seven-nine-board-paths`,async()=>{
  const rows=[];
  for(const family of ['inbound','outbound']){const scene=constructedCosmeticScene(family),d=await boardPath(scene,{theme,cargo:'classic',forklift:'yellow'},{viewport:DIALOG_VIEWPORTS[0]}),stable=snapshot(d),checksum=playableChecksum(d.state());d.frame(0);const calls=assertRasterThemeDraws(d.h.rasterDraws,theme,d.state().boardSize**2);const first=region(d,{x:118,y:535,w:845,h:895});if(['day','night'].includes(theme))assertRasterProtectedBoardHash(theme,family,first);d.frame(300);assert.equal(region(d,{x:118,y:535,w:845,h:895}),first,'Theme remains static');assert.equal(playableChecksum(d.state()),checksum);assertNoStorageChanges(stable,snapshot(d));const image=await capture(d,`theme-${theme}-${family}`);rows.push({family,boardSize:d.state().boardSize,provenance:scene.label,materialProof:calls,picture:image.picture});}
  return {theme,rows};
 });
 for(const theme of ['cold_chain','ocean_vault','royal_store'])await run(`raster-dense-${theme}-crossmix-small-phone-seven-nine`,async()=>{
  const rows=[];for(const family of ['inbound','outbound'])for(const cargo of ['ice_crystal','royal_gold','ocean_relic']){
   const scene=constructedDenseRasterScene(family),d=await driver(owned(new Map(scene.storage),{theme,cargo,forklift:'yellow'}),{viewport:DIALOG_VIEWPORTS[0]});d.resume();const before=snapshot(d),checksum=playableChecksum(d.state()),proof=assertRasterThemeDraws(d.h.rasterDraws,theme,d.state().boardSize**2);
   for(let column=0;column<(family==='inbound'?5:3);column++)assertRasterDraws(d.h.rasterDraws,'assets/cargo-materials.png',cropCargo(cargo,column));
   const first=region(d,{x:118,y:535,w:845,h:895});d.frame(300);assert.equal(region(d,{x:118,y:535,w:845,h:895}),first);assert.equal(playableChecksum(d.state()),checksum);assertNoStorageChanges(before,snapshot(d));
   const image=await capture(d,`dense-${theme}-${cargo}-${family}-360px`);rows.push({family,boardSize:d.state().boardSize,cargo,proof,picture:image.picture,provenance:scene.label});
  }return {rows,viewport:DIALOG_VIEWPORTS[0],density:'More than half of all cells occupied; all five inbound and three outbound legal cargo colors'};
 });
 for(const style of RASTER_CARGO_STYLES)await run(`raster-cargo-${style}-native-tray-drag-board-loaded`,async()=>{
  const f=constructedPendingRush(),d=await boardPath(f,{cargo:style,theme:'day',forklift:'yellow'});const expectedRow=RASTER_CARGO_STYLES.indexOf(style)*134+3,assertStyle=(draws,label)=>{const calls=draws.filter(row=>row.source==='assets/cargo-materials.png');assert.ok(calls.length,`${label}: original bundle draws cargo atlas`);assert.ok(calls.every(row=>row.args[1]===expectedRow&&row.args[2]===128&&row.args[3]===128),`${label}: exact selected cargo row`);return calls;};assertStyle(d.h.rasterDraws,'tray');
  d.h.pixelWitness.enabled=true;d.frame(0);nativeRushBadges(d.h,{zone:'tray',value:'3',minimum:3});d.h.pixelWitness.enabled=false;
  const command=f.commands[0],from=center(getTrayRects(d.state().candidates.length)[0]),to=cellCenter(command.origin,d.state()),stable=snapshot(d);d.h.pointer('down',from.x,from.y);d.h.pointer('move',to.x,to.y);d.frame(0);assertStyle(d.h.rasterDraws,'native drag');await capture(d,`cargo-${style}-native-drag`);d.h.pointer('cancel',to.x,to.y);d.frame(0);assertNoStorageChanges(stable,snapshot(d));
  const countdown=[];for(let index=0;index<3;index++){const proof=d.drag(f.commands[index]);d.settle(proof.expected.events.filter(row=>row.type==='shipment').length);d.h.pixelWitness.enabled=true;d.frame(0);nativeRushBadges(d.h,{zone:'board',value:String(3-index),minimum:3});d.h.pixelWitness.enabled=false;assertStyle(d.h.rasterDraws,'board');countdown.push(3-index);}
  const scenes=[];for(const family of ['inbound','outbound']){const scene=constructedCosmeticScene(family),loaded=await boardPath(scene,{cargo:style,theme:'night',forklift:'yellow'});assertStyle(loaded.h.rasterDraws,`${family} board and tray`);const proof=await observeLoaded(loaded,scene),calls=assertStyle(proof.draws,`${family} loaded transport`);assert.ok(calls.some(row=>{const [a,b,c,e]=row.transform;return Math.hypot(a,b)<.5&&Math.hypot(c,e)<.5;}),'Loaded transport samples smaller transformed cargo bodies');await capture(loaded,`cargo-${style}-${family}-loaded`);scenes.push({family,provenance:scene.label,events:proof.events,cargoDraws:calls.length});}
  return {style,provenance:f.label,countdown,scenes};
 });
 for(const [index,paint]of RASTER_FORKLIFTS.entries())await run(`raster-forklift-${paint}-native-preview-inbound-outbound-loaded`,async()=>{
  const menu=await driver(owned(cosmeticAccountStorage({wallet:0,label:'FUNDED: fixture-owned appearance for display-only shop preview'}),{forklift:paint}));menu.shop();menu.action({type:'selectShopTab',tab:'cosmetics'});menu.preview('forklift',paint);assertRasterDraws(menu.h.rasterDraws,'assets/themed-forklifts.png',[RASTER_FORKLIFT_COLUMNS[index]*128,0,128,128]);await capture(menu,`forklift-${paint}-shop-preview`);
  const set=COSMETIC_SETS.find(set=>set.forklift===paint);assert.ok(set,'Every themed native vehicle has an explicit reviewed set triple');
  const rows=[];for(const family of ['inbound','outbound']){const scene=constructedCosmeticScene(family),d=await boardPath(scene,{cargo:set.cargo,theme:set.theme,forklift:paint}),proof=await observeLoaded(d,scene);const calls=assertRasterDraws(proof.draws,'assets/themed-forklifts.png',[RASTER_FORKLIFT_COLUMNS[index]*128,0,128,128]);assert.ok(calls.every(row=>JSON.stringify(row.args.slice(4))===JSON.stringify([-44,-40,80,80])),'Real vehicle retains frozen body footprint');assert.ok(proof.draws.some(row=>row.source==='assets/cargo-materials.png'),'Loaded cargo retains independent crate atlas');const image=await capture(d,`forklift-${paint}-${family}-loaded`);rows.push({family,provenance:scene.label,events:proof.events,calls,picture:image.picture});}return {paint,shopPreview:true,rows};
 });
 await writeFile(resolve(out,'raster-native-observations.json'),JSON.stringify({binding,observations},null,2));
 await writeFile(resolve(out,'raster-native-input-storage-traces.json'),JSON.stringify({binding,drivers:traceSummary(drivers).map((row,index)=>({...row,imageTrace:drivers[index].h.imageTrace}))},null,2));
 report.rasterCoverage.contract=RASTER_ART_CONTRACT;report.priorCaseCoverage=assertRasterPriorCaseCoverage(report.cases,mode);return report;
}
