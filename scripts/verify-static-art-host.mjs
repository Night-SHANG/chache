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
import {getCosmeticSet} from '../src/application/cosmetic-sets.ts';
const argument=name=>{const at=process.argv.indexOf(name);return at<0?undefined:process.argv[at+1];};
const root=resolve(argument('--build')??'build'),out=resolve(argument('--out')??'artifacts/v113-static-host');
await mkdir(out,{recursive:true});
const manifest=JSON.parse(await readFile(resolve(root,'wechat/build-manifest.json'),'utf8'));
assert.equal(manifest.version,'1.0.13');assert.equal(manifest.shopPricingMode,'paid');assert.equal(manifest.developerDiagnostics,false);
const source=await growthSourceHash();assert.equal(source,manifest.sourceSha256,'Actual package must bind current source');
const report={version:manifest.version,commit:manifest.commit,sourceSha256:source,kind:'Exact production bundles; native Canvas and simulated wx / DOM event hosts',limitations:['No WeChat developer tool, IDE processed upload size, physical phone, GPU or audible-output verification.','All accounts are isolated owned-item fixtures. No player data accessed.'],cases:[],images:[],failures:[]};
const settle=async h=>{for(let n=0;n<6;n++){await h.settleImages();await Promise.resolve();}h.frame(h.time+16);};
const saved=theme=>cosmeticAccountStorage({label:'FUNDED: v113 isolated texture readiness',wallet:244,owned:COSMETIC_CATALOG.map(item=>item.key),cosmetics:{theme,cargo:getCosmeticSet(theme)?.cargo??'classic',forklift:getCosmeticSet(theme)?.forklift??'yellow'}});
const capture=async(h,name)=>{const bytes=await h.canvas.encode('png'),path=resolve(out,`${name}.png`);await writeFile(path,bytes);const row={name,path,sha256:sha256(bytes),bundleSha256:h.gameJsSha256};report.images.push(row);return row;};
const check=async(name,fn)=>{try{report.cases.push({name,...await fn()});}catch(error){report.failures.push({name,error:String(error),stack:error.stack});console.error(name,error.message);}};
async function host(target,theme,options={}){
 const data=saved(theme),packages=[],audios=[];
 const audioFactory=(src='')=>{const row={src,loop:false,volume:1,playCount:0,pauseCount:0};audios.push(row);return Object.assign(row,{play(){row.playCount++;return target==='browser'?Promise.resolve():undefined;},pause(){row.pauseCount++;},stop(){},destroy(){},onError(){},addEventListener(){}});};
 const config={bundlePath:resolve(root,target,target==='wechat'?'game.js':'app.js'),storage:data,width:540,height:1000,dpr:1,audioFactory,...options};
 if(target==='wechat')config.loadSubpackage=options.loadSubpackage??(request=>{packages.push(request.name);request.success();});
 const h=attachPixelWitness(target==='wechat'?await createGrowthHost({...config,deferImageLoads:true,rejectOffscreenCanvases:true}):await createPaginatedBrowserHost(config));
 let extraCanvases=0;h.canvasObservers.push(()=>extraCanvases++);
 return {h,packages,audios,extraCanvases:()=>extraCanvases};
}
for(const target of ['browser','wechat'])for(const theme of ['day','night','harbor','cold_chain','forest_depot','ice_vault'])await check(`${target}-${theme}-startup`,async()=>{
 const {h,packages,audios,extraCanvases}=await host(target,theme);const before=structuredClone(validateResumeStorage(h.storage).account.profile.cosmetics);
 h.frame(0);assert.ok(h.labels.some(row=>row.text.includes('正在加载')),'Visible first-frame loading');assertTextPaint(h,'正在加载画面资源');
 const rootsBefore=[...h.storage];h.tap(540,840);h.frame(h.time+16);assert.deepEqual([...h.storage],rootsBefore,'Loading input cannot start unseen gameplay');
 assert.ok(audios.some(row=>row.src==='assets/bgm.mp3'&&row.playCount===1),'BGM starts before image decode');
 await capture(h,`${target}-${theme}-loading`);await settle(h);
 assert.ok(!h.labels.some(row=>row.text.includes('正在加载')||row.text.includes('加载失败')),'Ready scene is rendered');
 assert.ok(h.imageTrace.some(row=>row.source.endsWith(`scene-${theme}.png`)&&row.status==='loaded'));
 assert.equal(h.imageTrace.filter(row=>/static-art\/scene-.*\.png$/.test(row.source)).length,1,'Only equipped large background decoded');
 assert.deepEqual(h.account().account.profile.cosmetics,before);assert.equal(extraCanvases(),0);if(target==='wechat')assert.equal(h.canvasCount,1);
 assert.equal(packages.length,target==='wechat'&&!['day','night'].includes(theme)?1:0);await capture(h,`${target}-${theme}-ready`);
 h.callbacks.hide();h.callbacks.show();h.frame(h.time+16);assert.equal(extraCanvases(),0);assert.deepEqual(h.account().account.profile.cosmetics,before);
 return {bundleSha256:h.gameJsSha256,images:h.imageTrace.length,packages,canvasCount:target==='wechat'?h.canvasCount:1,exactSelectedTheme:true,musicBeforeReady:true};
});
const tapLabel=(h,label)=>{const row=h.labels.find(row=>row.text===label);assert.ok(row,`Visible label missing: ${label}`);h.tap(row.logicalX,row.logicalY);h.frame(h.time+16);};
for(const target of ['browser','wechat'])await check(`${target}-shop-pagination-classic-and-return`,async()=>{
 const {h,packages,extraCanvases}=await host(target,'day');h.frame(0);await settle(h);const before=structuredClone(h.account().account.profile.cosmetics);
 tapLabel(h,'商店');await settle(h);tapLabel(h,'外观');assert.ok(h.labels.some(row=>row.text.includes('正在加载')));await settle(h);
 assert.ok(h.imageTrace.some(row=>/preview-.*-card\.png$/.test(row.source)&&row.status==='loaded'));await capture(h,`${target}-shop-first-page`);
 tapLabel(h,'下一页');await settle(h);await capture(h,`${target}-shop-second-page`);tapLabel(h,'上一页');await settle(h);
 tapLabel(h,'经典套装');await settle(h);assert.ok(h.imageTrace.some(row=>row.source.includes('preview-day-classic.png')));await capture(h,`${target}-classic-preview`);
 assert.deepEqual(h.account().account.profile.cosmetics,before);assert.equal(extraCanvases(),0);if(target==='wechat'){assert.equal(h.canvasCount,1);assert.equal(packages.length,1);}
 h.callbacks.hide();h.callbacks.show();await settle(h);assert.deepEqual(h.account().account.profile.cosmetics,before);return {bundleSha256:h.gameJsSha256,packages,canvasCount:1,selectionPreserved:true};
});
await check('wechat-package-failure-explicit-retry',async()=>{
 let attempts=0;const {h}=await host('wechat','harbor',{loadSubpackage:request=>{if(++attempts===1)request.fail({errMsg:'fixture offline'});else request.success();}});
 const cosmetics=structuredClone(h.account().account.profile.cosmetics);h.frame(0);await settle(h);
 assert.ok(h.labels.some(row=>row.text==='画面资源加载失败'));assert.ok(h.labels.some(row=>row.text==='重试加载'));assertTextPaint(h,'画面资源加载失败');assertTextPaint(h,'重试加载');assert.deepEqual(h.account().account.profile.cosmetics,cosmetics);
 await capture(h,'wechat-package-failure');h.tap(540,1160);await settle(h);
 assert.equal(attempts,2);assert.ok(!h.labels.some(row=>row.text.includes('加载失败')));assert.deepEqual(h.account().account.profile.cosmetics,cosmetics);assert.equal(h.canvasCount,1);await capture(h,'wechat-package-retry-ready');return {attempts,selectionPreserved:true,canvasCount:h.canvasCount};
});
await check('wechat-no-subpackage-api-shows-supported-error',async()=>{
 const h=await createGrowthHost({bundlePath:resolve(root,'wechat/game.js'),storage:saved('harbor'),deferImageLoads:true,rejectOffscreenCanvases:true});h.frame(0);await settle(h);assert.ok(h.labels.some(row=>row.text==='画面资源加载失败'));assert.ok(h.labels.some(row=>row.text.includes('不支持外观分包')));assert.equal(h.account().account.profile.cosmetics.theme,'harbor');return {canvasCount:h.canvasCount,selectionPreserved:true};
});
// Leave normal post-load menu control geometry to production UI. No test-only game globals are injected.
const ready=report.images.filter(row=>row.name.endsWith('-ready'));const contact=createCanvas(540*4,1000*Math.ceil(ready.length/4)),ctx=contact.getContext('2d');ctx.fillStyle='#0c131c';ctx.fillRect(0,0,contact.width,contact.height);
for(let i=0;i<ready.length;i++)ctx.drawImage(await loadImage(ready[i].path),(i%4)*540,Math.floor(i/4)*1000,540,1000);
await writeFile(resolve(out,'ready-contact-sheet.png'),contact.toBuffer('image/png'));
report.status=report.failures.length?'FAIL':'PASS';report.completedAt=new Date().toISOString();await writeFile(resolve(out,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,cases:report.cases.length,failures:report.failures.length,out}));if(report.failures.length)process.exitCode=1;
