/** Runs exact built bundles with real PNG pixels in deterministic host simulators, never a phone claim. */
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createCanvas,loadImage} from '@napi-rs/canvas';
import {createGrowthHost,validateResumeStorage,growthSourceHash,sha256} from './growth-host-support.mjs';
import {attachPixelWitness,assertTextPaint} from './refinement-host-support.mjs';
import {createPaginatedBrowserHost} from './paginated-cosmetics-browser-host.mjs';
import {cosmeticAccountStorage} from './cosmetic-stage15-host-support.mjs';
import {COSMETIC_CATALOG} from '../src/application/cosmetics.ts';
const argument=name=>{const at=process.argv.indexOf(name);return at<0?undefined:process.argv[at+1];};
const root=resolve(argument('--build')??'build'),out=resolve(argument('--out')??'artifacts/single-package-static-host');
await mkdir(out,{recursive:true});
const [manifest,browserManifest,app]=await Promise.all([resolve(root,'wechat/build-manifest.json'),resolve(root,'browser/build-manifest.json'),'package.json'].map(path=>readFile(path,'utf8').then(JSON.parse)));
const source=await growthSourceHash();
for(const current of [manifest,browserManifest]){
 assert.equal(current.version,app.version);assert.equal(current.shopPricingMode,'paid');assert.equal(current.developerDiagnostics,false);
 assert.equal(source,current.sourceSha256,'Actual package must bind current source');
 assert.deepEqual(current.cosmetics,{catalogSize:38,setCount:0,navigation:'sections-pagination-inline-preview',sections:['theme','cargo','forklift'],columns:2,pageSize:4});
 assert.ok(current.staticArt.resources.every(row=>row.src.startsWith('assets/')),'All images ship in the main package');
}
const report={version:manifest.version,commit:manifest.commit,sourceSha256:source,kind:'Exact production bundles; native Canvas and simulated wx / DOM event hosts',limitations:['No WeChat developer tool, IDE processed upload size, physical phone, GPU or audible-output verification.','All accounts are isolated owned-item fixtures. No player data accessed.'],cases:[],images:[],failures:[]};
const settle=async h=>{for(let n=0;n<6;n++){await h.settleImages();await Promise.resolve();}h.frame(h.time+16);};
const saved=theme=>cosmeticAccountStorage({label:'FUNDED: isolated single-package texture readiness',wallet:244,owned:COSMETIC_CATALOG.map(item=>item.key),cosmetics:{theme,cargo:'classic',forklift:'yellow'}});
const capture=async(h,name)=>{const bytes=await h.canvas.encode('png'),path=resolve(out,`${name}.png`);await writeFile(path,bytes);const row={name,path,sha256:sha256(bytes),bundleSha256:h.gameJsSha256};report.images.push(row);return row;};
const check=async(name,fn)=>{try{report.cases.push({name,...await fn()});}catch(error){report.failures.push({name,error:String(error),stack:error.stack});console.error(name,error.message);}};
async function host(target,theme,options={}){
 const data=saved(theme),audios=[];
 const audioFactory=(src='')=>{const row={src,loop:false,volume:1,playCount:0,pauseCount:0};audios.push(row);return Object.assign(row,{play(){row.playCount++;return target==='browser'?Promise.resolve():undefined;},pause(){row.pauseCount++;},stop(){},destroy(){},onError(){},addEventListener(){}});};
 const config={bundlePath:resolve(root,target,target==='wechat'?'game.js':'app.js'),storage:data,width:540,height:1000,dpr:1,audioFactory,...options};
 const h=attachPixelWitness(target==='wechat'?await createGrowthHost({...config,deferImageLoads:true,rejectOffscreenCanvases:true}):await createPaginatedBrowserHost(config));
 let extraCanvases=0;h.canvasObservers.push(()=>extraCanvases++);
 return {h,audios,extraCanvases:()=>extraCanvases};
}
for(const target of ['browser','wechat'])for(const theme of ['day','night','cold_chain','forest_depot','ice_vault'])await check(`${target}-${theme}-startup`,async()=>{
 const {h,audios,extraCanvases}=await host(target,theme);const before=structuredClone(validateResumeStorage(h.storage).account.profile.cosmetics);
 h.frame(0);assert.ok(h.labels.some(row=>row.text.includes('正在加载')),'Visible first-frame loading');assertTextPaint(h,'正在加载画面资源');
 const rootsBefore=[...h.storage];h.tap(540,840);h.frame(h.time+16);assert.deepEqual([...h.storage],rootsBefore,'Loading input cannot start unseen gameplay');
 assert.ok(audios.some(row=>row.src==='assets/bgm.mp3'&&row.playCount===1),'BGM starts before image decode');
 h.pointer('down',540,840,7);await capture(h,`${target}-${theme}-loading`);await settle(h);h.pointer('up',540,840,7);h.frame(h.time+16);
 assert.ok(!h.labels.some(row=>row.text.includes('正在加载')||row.text.includes('加载失败')),'Ready scene is rendered');
 assert.deepEqual([...h.storage],rootsBefore,'A loading-screen touch cannot activate the ready menu on release');
 assert.ok(h.imageTrace.some(row=>row.source.endsWith(`scene-${theme}.png`)&&row.status==='loaded'));
 assert.equal(h.imageTrace.filter(row=>/static-art\/scene-.*\.png$/.test(row.source)).length,1,'Only equipped large background decoded');
 assert.ok(h.imageTrace.every(row=>row.source.startsWith('assets/')));assert.deepEqual(h.account().account.profile.cosmetics,before);assert.equal(extraCanvases(),0);if(target==='wechat')assert.equal(h.canvasCount,1);
 await capture(h,`${target}-${theme}-ready`);h.callbacks.hide();h.callbacks.show();h.frame(h.time+16);assert.equal(extraCanvases(),0);assert.deepEqual(h.account().account.profile.cosmetics,before);
 return {bundleSha256:h.gameJsSha256,images:h.imageTrace.length,canvasCount:target==='wechat'?h.canvasCount:1,exactSelectedTheme:true,musicBeforeReady:true,staleReleaseInert:true};
});
const tapLabel=(h,label)=>{const row=h.labels.find(row=>row.text===label);assert.ok(row,`Visible label missing: ${label}`);h.tap(row.logicalX,row.logicalY);h.frame(h.time+16);};
for(const target of ['browser','wechat'])await check(`${target}-single-item-previews-and-return`,async()=>{
 const {h,extraCanvases}=await host(target,'day');h.frame(0);await settle(h);const before=structuredClone(h.account().account),rootsBefore=[...h.storage],seen=[];
 tapLabel(h,'商店');await settle(h);tapLabel(h,'外观');
 for(const label of ['场景','货箱','叉车','返回'])assert.ok(h.labels.some(row=>row.text===label),'Inline shop remains usable while the preview loads');
 assert.ok(!h.labels.some(row=>row.text==='正在加载画面资源'),'A missing shop preview never replaces the ready scene with the core loading gate');
 for(const [kind,label]of [['theme','场景'],['cargo','货箱'],['forklift','叉车']]){
  tapLabel(h,label);const items=COSMETIC_CATALOG.filter(item=>item.kind===kind);
  for(let page=0;page<Math.ceil(items.length/4);page++){
   if(page)tapLabel(h,'下一页');
   for(const item of items.slice(page*4,page*4+4)){tapLabel(h,item.name);await settle(h);seen.push(item.key);assert.ok(h.labels.some(row=>row.text.includes(item.name)));}
   await capture(h,`${target}-${kind}-page-${page+1}`);
  }
 }
 assert.equal(new Set(seen).size,38);assert.ok(h.imageTrace.some(row=>/preview-.*-item\.png$/.test(row.source)&&row.status==='loaded'));
 assert.ok(h.imageTrace.every(row=>!/-card\.png$/.test(row.source)));assert.equal(h.imageTrace.filter(row=>/static-art\/scene-.*\.png$/.test(row.source)).length,1,'Browsing never decodes a selected theme as a full equipped scene');
 assert.deepEqual(h.account().account,before);assert.deepEqual([...h.storage],rootsBefore);assert.equal(extraCanvases(),0);if(target==='wechat')assert.equal(h.canvasCount,1);
 tapLabel(h,'返回');assert.ok(h.labels.some(row=>row.text==='商店'),'Inline previews add no Back layer');
 h.callbacks.hide();h.callbacks.show();await settle(h);assert.deepEqual(h.account().account,before);
 return {bundleSha256:h.gameJsSha256,visited:seen,canvasCount:1,selectionPreserved:true,browseWrites:0};
});
await check('wechat-main-image-failure-explicit-retry',async()=>{
 let unavailable=true,attempts=0;const scene='assets/static-art/scene-cold_chain.png';
 const {h}=await host('wechat','cold_chain',{rejectImageLoads:source=>{if(source!==scene)return false;attempts++;return unavailable;}});
 const cosmetics=structuredClone(h.account().account.profile.cosmetics),rootsBefore=[...h.storage];h.frame(0);await settle(h);
 assert.ok(h.labels.some(row=>row.text==='画面资源加载失败'));assert.ok(h.labels.some(row=>row.text==='重试加载'));assertTextPaint(h,'画面资源加载失败');assertTextPaint(h,'重试加载');assert.deepEqual(h.account().account.profile.cosmetics,cosmetics);
 assert.equal(attempts,1);await capture(h,'wechat-main-image-failure');h.tap(540,840);await settle(h);assert.equal(attempts,1,'No automatic retry or hidden gameplay action');assert.deepEqual([...h.storage],rootsBefore);
 unavailable=false;h.tap(540,1160);await settle(h);
 assert.equal(attempts,2);assert.ok(!h.labels.some(row=>row.text.includes('加载失败')));assert.ok(h.labels.some(row=>row.text==='商店'));
 const trace=h.imageTrace.filter(row=>row.source===scene);assert.deepEqual(trace.map(row=>row.status),['error','loaded']);assert.equal(trace[0].sha256,trace[1].sha256);assert.equal(trace[0].injectedFailure,true);
 assert.deepEqual(h.account().account.profile.cosmetics,cosmetics);assert.deepEqual([...h.storage],rootsBefore);assert.equal(h.canvasCount,1);await capture(h,'wechat-main-image-retry-ready');
 return {attempts,selectionPreserved:true,storageWrites:0,canvasCount:h.canvasCount};
});
// Leave normal post-load menu control geometry to production UI. No test-only game globals are injected.
const ready=report.images.filter(row=>row.name.endsWith('-ready'));const contact=createCanvas(540*4,Math.max(1000,1000*Math.ceil(ready.length/4))),ctx=contact.getContext('2d');ctx.fillStyle='#0c131c';ctx.fillRect(0,0,contact.width,contact.height);
for(let i=0;i<ready.length;i++)ctx.drawImage(await loadImage(ready[i].path),(i%4)*540,Math.floor(i/4)*1000,540,1000);
await writeFile(resolve(out,'ready-contact-sheet.png'),contact.toBuffer('image/png'));
report.status=report.failures.length?'FAIL':'PASS';report.completedAt=new Date().toISOString();await writeFile(resolve(out,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,cases:report.cases.length,failures:report.failures.length,out}));if(report.failures.length)process.exitCode=1;
