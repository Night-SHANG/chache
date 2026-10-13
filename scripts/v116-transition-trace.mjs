/** Per-input and per-decode verification of unchanged production entry bundles. */
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createCanvas,loadImage} from '@napi-rs/canvas';
import {createV116TransitionHost} from './v116-transition-host.mjs';
import {cosmeticAccountStorage} from './cosmetic-stage15-host-support.mjs';
import {sha256} from './growth-host-support.mjs';
import {assertTextPaint,assertIconPixels} from './refinement-host-support.mjs';
import {COSMETIC_CATALOG} from '../src/application/cosmetics.ts';
import {STATIC_ART_RESOURCES} from '../src/presentation/static-art-manifest.ts';
import {STATIC_ART_SHARED_KEYS} from '../src/presentation/static-art-requirements.ts';
import {configureStaticArt,prepareStaticArt} from '../src/presentation/static-art-resources.ts';
import {drawCosmeticPreview} from '../src/presentation/cosmetic-art.ts';
import {COSMETIC_PREVIEW_RECT} from '../src/presentation/economy-ui.ts';

const baseline={theme:'day',cargo:'classic',forklift:'yellow'};
const scenePath=id=>STATIC_ART_RESOURCES[`scene.${id}`].src;
const ownedStorage=(owned=true,theme='day',cosmetics={})=>cosmeticAccountStorage({label:'FUNDED: isolated v116 per-frame verification',wallet:5000,owned:owned?COSMETIC_CATALOG.map(item=>item.key):[],cosmetics:{...baseline,theme,...cosmetics}});
const crop={x:68,y:377,w:404,h:112};
const cropHash=context=>sha256(context.getImageData(crop.x,crop.y,crop.w,crop.h).data);

async function previewOracle(root,target){
 configureStaticArt(path=>loadImage(resolve(root,target,path)));
 assert.equal((await prepareStaticArt({scene:'scene.day',shared:STATIC_ART_SHARED_KEYS,previews:[]})).status,'ready');
 const cache=new Map();
 return (item,profile)=>{
  const options={category:item.kind,theme:profile.cosmetics.theme,cargoStyle:profile.cosmetics.cargo,forklift:profile.cosmetics.forklift,cargoOutline:profile.cargoOutline};
  if(item.kind==='theme')options.theme=item.id;
  else if(item.kind==='forklift')options.forklift=item.id;
  else if(item.overlay){options.cargoStyle='classic';options.cargoOutline=true;}else options.cargoStyle=item.id;
  const key=JSON.stringify(options);if(cache.has(key))return cache.get(key);
  const canvas=createCanvas(540,960),context=canvas.getContext('2d');context.scale(.5,.5);context.lineJoin='round';drawCosmeticPreview(context,COSMETIC_PREVIEW_RECT,options);
  const result={hash:cropHash(context),pixels:context.getImageData(crop.x,crop.y,crop.w,crop.h).data};cache.set(key,result);return result;
 };
}

export async function runV116PlatformTransitions({root,target,out}={}) {
 const oracle=await previewOracle(root,target),result={target,bundleSha256:'',frames:[],images:[],decodedImages:[],visited:[],cases:[],kind:'Unchanged bundle / native PNG and Canvas / simulated platform; no device or Chromium claim'};
 let h,current,ordinary=false,saveBefore,saveProtected=true,captureIndex=0;
 const account=()=>{const loaded=h.account();assert.equal(loaded.status,'ready');return loaded.account;};
 const normal=()=>{
  assert.ok(!h.labels.some(row=>/加载|准备预览/.test(row.text)),`${target}: ordinary frame displays a loading/preparation placeholder`);
  assert.equal(h.canvasCount,1,'No offscreen preview canvas');
  assert.equal(h.imageTrace.filter(row=>/preview-/.test(row.source)).length,0,'No per-item preview PNG requests');
  assert.ok(h.pendingImages().filter(path=>/\/scene-/.test(path)).length<=1,'At most one target scene may decode beside the retained current scene');
  if(target==='android')assert.equal(h.cover.hidden,true,'Android cover must remain dismissed after startup');
  assert.ok(h.draws.some(row=>row.source===scenePath(account().profile.cosmetics.theme)),'Every ordinary frame paints the exact committed full scene');
 };
 const checkPreview=(item,pressed)=>{
  const profile=account().profile,owned=profile.ownedCosmetics.includes(item.key),equipped=item.overlay?profile.cargoOutline:profile.cosmetics[item.kind]===item.id&&!(item.kind==='cargo'&&item.id==='classic'&&profile.cargoOutline);
  const action=item.overlay||owned?(equipped?'使用中':'装备'):item.achievementId?'成就解锁':`${item.price}金币 · 购买`;
  const status=!owned&&item.achievementId?item.description:owned?(equipped?'使用中':'已拥有'):`${item.price}金币`;
  const title=h.labels.find(row=>row.logicalY===1020);assert.equal(title?.text,item.name,'Preview title must belong to the just-selected item');
  assertTextPaint(h,item.name);assertTextPaint(h,status);if(!pressed)assertTextPaint(h,action);
  for(const label of ['场景','货箱','叉车','返回'])if(!pressed)assertTextPaint(h,label);
  assertIconPixels(h,COSMETIC_PREVIEW_RECT);
  const expected=oracle(item,profile),actual=h.context.getImageData(crop.x,crop.y,crop.w,crop.h).data;
  let changed=0,maxDelta=0,totalDelta=0;for(let n=0;n<actual.length;n+=4){let delta=0;for(let c=0;c<4;c++)delta+=Math.abs(actual[n+c]-expected.pixels[n+c]);if(delta){changed++;totalDelta+=delta;maxDelta=Math.max(maxDelta,delta);}}
  assert.equal(changed,0,`${target} ${item.key}: complete synchronous preview mismatch: ${changed} pixels, max ${maxDelta}, total ${totalDelta}`);
 };
 const frame=(name,item=current)=>{
  h.frame();if(saveProtected)assert.equal(h.storageSnapshot(),saveBefore,`${name}: protected frame must preserve every save byte`);
  if(!ordinary&&h.imageTrace.filter(row=>row.status==='loaded').length<9){
   if([...new Map(h.imageTrace.map(row=>[row.source,row])).values()].some(row=>row.status==='error'))assertTextPaint(h,'画面资源加载失败');
   else if(target==='android'&&!h.imageTrace.some(row=>row.status==='error'))assert.equal(h.cover.hidden,false,'Incomplete initial core must stay under the Android cover');
   else assertTextPaint(h,'正在加载画面资源');
  }
 if(ordinary){normal();if(item)checkPreview(item,name.endsWith(':down'));}
  const row={name,texts:h.labels.map(label=>label.text),pending:[...h.pendingImages()],loaded:h.imageTrace.filter(image=>image.status==='loaded').map(image=>image.source),storageSha256:sha256(h.storageSnapshot()),scene:account().profile.cosmetics.theme,preview:item?.key??null,previewSha256:item&&ordinary?cropHash(h.context):null};result.frames.push(row);return row;
 };
 const capture=async name=>{if(!out)return;await mkdir(out,{recursive:true});const filename=`${target}-${String(++captureIndex).padStart(2,'0')}-${name}.png`,bytes=h.canvas.toBuffer('image/png');await writeFile(resolve(out,filename),bytes);result.images.push({name:filename,sha256:sha256(bytes)});};
 const drain=async(name,item=current)=>{for(let safety=0;h.pendingImages().length;safety++){assert.ok(safety<40,'Decode pump must terminate');const decoded=await h.decodeNext();result.decodedImages.push({name,...decoded});frame(`${name}:decode:${decoded.source}:${decoded.status}`,item);}};
 const tap=async(label,name,{item=current,card=false,after=true}={})=>{
  const row=h.labels.find(row=>row.text===label&&(!card||row.logicalY>=1110&&row.logicalY<1450));assert.ok(row,`Missing input ${label}: ${h.labels.map(row=>row.text).join('|')}`);
  h.pointer('down',row.logicalX,row.logicalY);frame(`${name}:down`);
  h.pointer('up',row.logicalX,row.logicalY);if(after){current=item;frame(`${name}:up`);}await h.flush();
 };
 const create=async({owned=true,theme='day',cosmetics,rejectImageLoads}={})=>{
  ordinary=false;current=undefined;saveProtected=true;h=await createV116TransitionHost({target,bundlePath:resolve(root,target,target==='wechat'?'game.js':'app.js'),storage:ownedStorage(owned,theme,cosmetics),rejectImageLoads});
  result.bundleSha256=h.gameJsSha256;saveBefore=h.storageSnapshot();frame('startup:first');
  assert.equal(h.imageTrace.length,1,'Startup requests only the current scene before its eight shared atlases');
  if(target==='android')assert.equal(h.cover.hidden,false);else assertTextPaint(h,'正在加载画面资源');
  assert.ok(h.audioTrace.some(row=>row.src==='assets/bgm.mp3'&&row.plays>0),'Music begins before PNG decoding');
  h.pointer('down',540,840,91);frame('startup:held-down');
  await drain('startup');h.pointer('up',540,840,91);frame('startup:stale-release');
  assert.equal(h.storageSnapshot(),saveBefore,'Startup and stale touch release do not write storage');
  return h;
 };
 const ready=()=>{
  ordinary=true;frame('startup:ready');assertTextPaint(h,'商店');
  const loaded=h.imageTrace.filter(row=>row.status==='loaded').map(row=>row.source).sort();
  assert.deepEqual(loaded,[scenePath(account().profile.cosmetics.theme),...STATIC_ART_SHARED_KEYS.map(key=>STATIC_ART_RESOURCES[key].src)].sort(),'Exactly current scene + eight fixed shared atlases at startup');
 };
 const open=async()=>{await tap('商店','shop:open');await tap('外观','shop:cosmetics',{item:COSMETIC_CATALOG.find(item=>item.kind==='theme')});};
 for(const owned of [true,false]){
  await create({owned});ready();await open();
  for(const [kind,label] of [['theme','场景'],['cargo','货箱'],['forklift','叉车']]){
   const items=COSMETIC_CATALOG.filter(item=>item.kind===kind);
   await tap(label,`${owned?'owned':'sale'}:${kind}:category-cold`,{item:items.find(item=>item.id===baseline[kind])});
   for(let page=0;page<Math.ceil(items.length/4);page++){
    if(page)await tap('下一页',`${kind}:page-${page+1}:cold`,{item:items[page*4]});
    for(const item of items.slice(page*4,page*4+4)){
     await tap(item.name,`${owned?'owned':'sale'}:${item.key}:cold`,{item,card:true});
     const coldHash=cropHash(h.context);await drain(`${item.key}:pending-decode`);
     assert.equal(cropHash(h.context),coldHash,'Finishing an optional full scene cannot change the preview');
     await tap(item.name,`${owned?'owned':'sale'}:${item.key}:hot`,{item,card:true});
     assert.equal(cropHash(h.context),coldHash,'Cold and hot item renders have identical complete preview pixels');result.visited.push(`${owned?'owned':'sale'}:${item.key}`);
    }
    await capture(`${owned?'owned':'sale'}-${kind}-page-${page+1}`);
   }
   for(let page=Math.ceil(items.length/4)-2;page>=0;page--)await tap('上一页',`${kind}:page-${page+1}:hot`,{item:items[page*4]});
   for(let page=1;page<Math.ceil(items.length/4);page++)await tap('下一页',`${kind}:page-${page+1}:hot`,{item:items[page*4]});
   await tap(label,`${kind}:category-hot`);await drain(`${kind}:hot-page-decodes`);
  }
  assert.equal(h.storageSnapshot(),saveBefore,'All categories/pages/cold/hot browsing must preserve every save byte');
  h.callbacks.hide();h.callbacks.show();await h.flush();frame('shop:hide-show');await drain('shop:hide-show');
  await tap('返回','shop:back',{item:null});assertTextPaint(h,'商店');await open();await drain('shop:reopen');
  assert.equal(h.storageSnapshot(),saveBefore);result.cases.push(`${owned?'owned':'unowned'}-all-active-cold-hot`);
 }
 // Purchase opens a confirmation only; cancellation must keep coin count, rights and all save bytes.
 await tap('冷链仓库','purchase:select',{item:COSMETIC_CATALOG.find(item=>item.key==='theme.cold_chain'),card:true});
 await tap('900金币 · 购买','purchase:confirmation',{item:null});assertTextPaint(h,'购买冷链仓库？');assertTextPaint(h,'确认购买');assert.equal(h.storageSnapshot(),saveBefore);
 await drain('purchase:decode-during-confirmation',null);await tap('取消','purchase:cancel',{item:COSMETIC_CATALOG.find(item=>item.key==='theme.cold_chain')});assert.equal(h.storageSnapshot(),saveBefore);result.cases.push('purchase-cancel');
 // Click equip before the selected scene has decoded. Keep old background/account until completion.
 await create();ready();await open();
 const cold=COSMETIC_CATALOG.find(item=>item.key==='theme.cold_chain'),rail=COSMETIC_CATALOG.find(item=>item.key==='theme.rail_freight');
 await tap(cold.name,'equip:select-cold',{item:cold,card:true});assert.ok(h.pendingImages().includes(scenePath(cold.id)));
 await tap('装备','equip:before-decode');assert.equal(h.storageSnapshot(),saveBefore);assert.equal(account().profile.cosmetics.theme,'day');
 await tap('装备','equip:repeat-before-decode');assert.equal(h.storageSnapshot(),saveBefore);
 saveProtected=false;await drain('equip:decode');assert.equal(account().profile.cosmetics.theme,cold.id);assert.equal(account().wallet,5000);assert.notEqual(h.storageSnapshot(),saveBefore);frame('equip:committed');await capture('equip-committed');
 const committed=h.storageSnapshot();saveBefore=committed;saveProtected=true;await tap('使用中','equip:repeat-after-commit');assert.equal(h.storageSnapshot(),committed);result.cases.push('equip-immediate-before-target-decode');
 // The account can acknowledge a prepared scene before another render. Hide must promote it first.
 await create();ready();await open();await tap(cold.name,'ack-hide:select',{item:cold,card:true});await tap('装备','ack-hide:equip');
 assert.equal(h.pendingImages().length,1);saveProtected=false;
 const acknowledged=await h.decodeNext();result.decodedImages.push({name:'ack-hide:decode-without-frame',...acknowledged});
 assert.equal(account().profile.cosmetics.theme,cold.id,'Decode/microtasks acknowledge equip before the next frame');
 const acknowledgedSave=h.storageSnapshot(),decodedCount=h.imageTrace.length;
 h.callbacks.hide();h.callbacks.show();await h.flush();frame('ack-hide:first-resumed-frame');
 assert.equal(h.storageSnapshot(),acknowledgedSave);assert.equal(h.imageTrace.length,decodedCount,'Hide after account acknowledgement must not discard and re-decode the committed scene');assert.equal(h.pendingImages().length,0);result.cases.push('acknowledged-equip-hide-before-frame');
 // A pending target is cancelled by category change, Back and hide. Late decode never commits.
 for(const cancel of ['category','back','hide']){
  await create();ready();await open();await tap(cold.name,`${cancel}:select`,{item:cold,card:true});await tap('装备',`${cancel}:equip-pending`);
  if(cancel==='category')await tap('货箱','cancel:category',{item:COSMETIC_CATALOG.find(item=>item.key==='cargo.classic')});
  else if(cancel==='back')await tap('返回','cancel:back',{item:null});
  else{h.callbacks.hide();await h.flush();h.callbacks.show();await h.flush();frame('cancel:hide-show');}
  await drain(`cancel:${cancel}:late-decode`);assert.equal(h.storageSnapshot(),saveBefore,`${cancel} cancels late equip`);result.cases.push(`pending-equip-cancel-${cancel}`);
 }
 // Rapid selection supersedes an in-flight target without changing save data or blocking art.
 await create();ready();await open();await tap(cold.name,'rapid:cold',{item:cold,card:true});await tap(rail.name,'rapid:rail',{item:rail,card:true});await tap(cold.name,'rapid:cold-again',{item:cold,card:true});await drain('rapid:each-decode');assert.equal(h.storageSnapshot(),saveBefore);result.cases.push('rapid-selection');
 // Main-image failures keep startup protected and require an explicit retry.
 let fail=true,attempts=0;
 await create({theme:'cold_chain',rejectImageLoads:path=>{if(path!==scenePath('cold_chain'))return false;attempts++;return fail;}});
 assertTextPaint(h,'画面资源加载失败');assertTextPaint(h,'重试加载');assert.equal(attempts,1);await capture('main-image-failure');
 h.tap(540,840);frame('main-error:inert-input');assert.equal(attempts,1);assert.equal(h.storageSnapshot(),saveBefore);
 fail=false;await tap('重试加载','main-error:explicit-retry');await drain('main-error:retry-decode');ready();assert.equal(attempts,2);assert.equal(h.storageSnapshot(),saveBefore);result.cases.push('main-image-failure-explicit-retry');
 // Target failure cannot replace old scene or write ownership; pressing Equip retries the same PNG.
 fail=true;attempts=0;await create({rejectImageLoads:path=>{if(path!==scenePath('cold_chain'))return false;attempts++;return fail;}});ready();await open();await tap(cold.name,'target-error:select',{item:cold,card:true});await tap('装备','target-error:equip');await drain('target-error:failed-decode');assert.equal(h.storageSnapshot(),saveBefore);assert.equal(attempts,1);assertTextPaint(h,'外观未能读取，请再次点装备重试');
 fail=false;await tap('装备','target-error:explicit-equip-retry');assert.equal(h.storageSnapshot(),saveBefore);saveProtected=false;await drain('target-error:retry-decode');assert.equal(attempts,2);assert.equal(account().profile.cosmetics.theme,cold.id);assert.equal(account().wallet,5000);result.cases.push('target-scene-failure-retry');
 // Fresh category entry starts at the first item, independently of equipped second-page art.
 const categories=[['theme','场景'],['cargo','货箱'],['forklift','叉车']].map(([kind,label])=>({kind,label,items:COSMETIC_CATALOG.filter(item=>item.kind===kind)}));
 const secondPageCosmetics=Object.fromEntries(categories.map(({kind,items})=>[kind,items[5].id]));
 await create({cosmetics:secondPageCosmetics});ready();await open();
 const firstPage=items=>assertTextPaint(h,`1 / ${Math.ceil(items.length/4)}`);
 for(const {kind,label,items} of categories){
  await tap(label,`first-page:${kind}:cold`,{item:items[0]});firstPage(items);await drain(`first-page:${kind}:cold-decodes`);
  assert.deepEqual(account().profile.cosmetics,secondPageCosmetics,'Cold category entry must not change equipped appearance');
  await tap('下一页',`first-page:${kind}:deliberate-page-two`,{item:items[4]});
  await tap(items[6].name,`first-page:${kind}:deliberate-item`,{item:items[6],card:true});await drain(`first-page:${kind}:selection-decodes`);
 }
 for(const {kind,label,items} of categories){
  await tap(label,`first-page:${kind}:remembered-in-visit`,{item:items[6]});assertTextPaint(h,`2 / ${Math.ceil(items.length/4)}`);await drain(`first-page:${kind}:remembered-decodes`);
 }
 await tap('返回','first-page:exit-shop',{item:null});assertTextPaint(h,'商店');
 await tap('商店','first-page:reopen-tools');assertTextPaint(h,'每局最多携带2种道具');
 assert.ok(!h.labels.some(row=>row.logicalY===1020),'Reopening the shop resets to the tools tab');
 await tap('外观','first-page:reopen-cosmetics',{item:categories[0].items[0]});firstPage(categories[0].items);
 for(const {kind,label,items} of categories){await tap(label,`first-page:${kind}:reopened`,{item:items[0]});firstPage(items);await drain(`first-page:${kind}:reopened-decodes`);}
 assert.deepEqual(account().profile.cosmetics,secondPageCosmetics);assert.equal(h.storageSnapshot(),saveBefore,'First-page defaults and per-visit selections never write account bytes');
 result.cases.push('second-page-equipped-first-entry-and-visit-reset');
 for(const theme of COSMETIC_CATALOG.filter(item=>item.kind==='theme')){await create({theme:theme.id});ready();await capture(`startup-${theme.id}`);assert.equal(h.storageSnapshot(),saveBefore);}
 result.cases.push('all-nine-current-themes-cold-startup');
 return result;
}
