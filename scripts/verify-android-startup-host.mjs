/* global window, document, HTMLElement, CanvasRenderingContext2D */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve,relative,sep,extname} from 'node:path';

/**
 * Chromium bridge-harness evidence, never native Android or phone acceptance.
 * Run after npm run build:android: node scripts/verify-android-startup-host.mjs
 * All https://localhost responses are exact staged bytes except two explicitly
 * injected failure responses. No local HTTPS server, TLS bypass, production
 * source rewrite, actual native storage, or user-supplied images are involved.
 * Chromium's own sandbox remains enabled. A launch failure exits nonzero and
 * records NOT RUN cases; it must not be converted to a passing visual receipt.
 */
const require=createRequire(import.meta.url);
const out=resolve(process.env.ANDROID_HOST_QA_DIR??'qa/android-v115/host');
const staging=resolve('build/android');
const viewport={width:540,height:960};
const requiredImages=[
 'assets/static-art/scene-day.png','assets/static-art/cargo-core.png',
 'assets/static-art/forklift-base.png','assets/static-art/frame-classic.png',
 'assets/board-materials.png','assets/static-art/tools-core.png',
];
const cases=['delayed-host-cover','delayed-single-asset-cover','complete-first-frame',
 'held-input-does-not-act','fresh-input-works','foreground-resume-no-cover',
 'fast-assets-no-intermediate-health-text','asset-failure-retry-recovery',
 'parse-failure-css-help-after-12s'];
const receipt={schemaVersion:1,kind:'Chromium Android bridge harness',
 nativeAndroidAcceptance:'NOT RUN',phoneAcceptance:'NOT RUN',
 generatedAt:new Date().toISOString(),viewport,origin:'https://localhost',
 security:{chromiumSandbox:true,ignoreHTTPSErrors:false,network:'All requests intercepted; external requests rejected'},
 status:'RUNNING',cases:Object.fromEntries(cases.map(name=>[name,{status:'NOT RUN'}])),
 screenshots:[],scenarios:[],assertions:0};
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const check=(condition,message)=>{assert.ok(condition,message);receipt.assertions++;};
const passed=(name,details={})=>{receipt.cases[name]={status:'PASS',...details};};
let browser;

// The following function is injected only by this harness, never shipped.
function installBridge({viewport,holdHost}) {
 const pendingFrames=new Map(),listeners=new Map(),storage=new Map();
 let nextFrame=0,nextListener=0,frameNumber=0,currentFrame=null,releaseHost;
 let state={active:true,owner:true,widthPx:viewport.width,heightPx:viewport.height,insetsPx:{top:0,right:0,bottom:0,left:0}};
 const stateGate=holdHost?new Promise(resolve=>{releaseHost=resolve;}):Promise.resolve();
 const trace={frames:[],images:[],coverWrites:[],storageWrites:[],bridgeCalls:[],firstReveal:null};
 const nativeHidden=Object.getOwnPropertyDescriptor(HTMLElement.prototype,'hidden');
 Object.defineProperty(HTMLElement.prototype,'hidden',{
  ...nativeHidden,
  set(value){
   if(this.id==='startup-status'){
    trace.coverWrites.push({value:Boolean(value),frame:frameNumber,time:performance.now()});
    if(value&&!nativeHidden.get.call(this)&&!trace.firstReveal){
     const canvas=document.querySelector('#game');
     trace.firstReveal={frame:frameNumber,png:canvas.toDataURL('image/png'),
      images:trace.images.filter(item=>item.status==='loaded').map(item=>item.path),
      texts:currentFrame?[...currentFrame.texts]:[],drawImages:currentFrame?[...currentFrame.images]:[]};
    }
   }
   nativeHidden.set.call(this,value);
  },
 });
 const nativeImage=window.Image;
 function TracedImage(...args){
  const image=new nativeImage(...args);
  for(const [event,status] of [['load','loaded'],['error','error']])image.addEventListener(event,()=>trace.images.push({path:new URL(image.src).pathname.slice(1),status,time:performance.now()}));
  return image;
 }
 TracedImage.prototype=nativeImage.prototype;Object.setPrototypeOf(TracedImage,nativeImage);window.Image=TracedImage;
 for(const method of ['fillText','strokeText','drawImage']){
  const native=CanvasRenderingContext2D.prototype[method];
  CanvasRenderingContext2D.prototype[method]=function(...args){
   if(currentFrame&&this.canvas.id==='game'){
    if(method==='drawImage')currentFrame.images.push(args[0].src??'(offscreen canvas)');
    else currentFrame.texts.push(String(args[0]));
   }
   return native.apply(this,args);
  };
 }
 window.requestAnimationFrame=callback=>{const id=++nextFrame;pendingFrames.set(id,callback);return id;};
 window.cancelAnimationFrame=id=>pendingFrames.delete(id);
 const envelope=value=>JSON.stringify({v:1,ok:true,value});
 window.WarehouseStorage={
  get:key=>envelope(storage.get(key)??null),
  set:(key,value)=>{storage.set(key,value);trace.storageWrites.push({method:'set',key});return envelope(null);},
  remove:key=>{storage.delete(key);trace.storageWrites.push({method:'remove',key});return envelope(null);},
  listKeys:prefix=>envelope([...storage.keys()].filter(key=>key.startsWith(prefix)).sort()),
 };
 window.androidBridge={};
 window.Capacitor={
  PluginHeaders:[{name:'WarehouseHost',methods:[{name:'getState',rtype:'promise'},
   {name:'minimize',rtype:'promise'},{name:'addListener',rtype:'callback'},{name:'removeListener',rtype:'promise'}]}],
  async nativePromise(plugin,method,options){
   trace.bridgeCalls.push({plugin,method,options});
   if(plugin!=='WarehouseHost')throw Error(`Unexpected native plugin: ${plugin}`);
   if(method==='getState'){await stateGate;return structuredClone(state);}
   if(method==='minimize')return {};
   if(method==='removeListener'){listeners.delete(options.callbackId);return {};}
   throw Error(`Unexpected native promise method: ${method}`);
  },
  nativeCallback(plugin,method,options,callback){
   trace.bridgeCalls.push({plugin,method,options});
   if(plugin!=='WarehouseHost'||method!=='addListener')throw Error(`Unexpected native callback: ${plugin}.${method}`);
   const id=String(++nextListener);listeners.set(id,{event:options.eventName,callback});return id;
  },
 };
 window.__ANDROID_HOST_TEST__={
  trace,
  releaseHost(){releaseHost?.();},
  pendingFrames:()=>pendingFrames.size,
  storageSnapshot:()=>JSON.stringify([...storage.entries()].sort()),
  emitHost(patch){state={...state,...patch};for(const listener of listeners.values())if(listener.event==='state')listener.callback(structuredClone(state));},
  advanceFrames(count=1){
   for(let i=0;i<count;i++){
    const batch=[...pendingFrames];pendingFrames.clear();frameNumber++;
    currentFrame={number:frameNumber,texts:[],images:[],coverBefore:!document.querySelector('#startup-status').hidden};
    for(const [,callback]of batch)callback(performance.now());
    currentFrame.coverAfter=!document.querySelector('#startup-status').hidden;
    trace.frames.push(currentFrame);currentFrame=null;
   }
  },
 };
}

const stateOf=page=>page.evaluate(()=>{
 const t=window.__ANDROID_HOST_TEST__,cover=document.querySelector('#startup-status');
 return {hidden:cover.hidden,text:cover.textContent,html:cover.innerHTML,pendingFrames:t.pendingFrames(),
  helpVisibility:document.querySelector('.startup-help')?getComputedStyle(document.querySelector('.startup-help')).visibility:null,
  ...t.trace,storageSnapshot:t.storageSnapshot()};
});
const step=(page,count=1)=>page.evaluate(count=>window.__ANDROID_HOST_TEST__.advanceFrames(count),count);
const waitLoaded=(page,count=requiredImages.length)=>page.waitForFunction(count=>window.__ANDROID_HOST_TEST__.trace.images.filter(item=>item.status==='loaded').length>=count,count,{polling:20,timeout:15000});
const noHealthText=trace=>!trace.frames.some(frame=>frame.texts.some(text=>/启动检查|正在加载画面资源|已加载 \d+ \/ \d+/.test(text)));
async function screenshot(page,name){
 const path=resolve(out,name);await page.screenshot({path,animations:'allow'});
 const bytes=await readFile(path);receipt.screenshots.push({path:relative(resolve('.'),path),sha256:hash(bytes)});return path;
}
async function samePixels(first,second){
 const {loadImage,createCanvas}=require('@napi-rs/canvas');
 const images=await Promise.all([first,second].map(path=>loadImage(path)));
 if(images[0].width!==images[1].width||images[0].height!==images[1].height)return false;
 const pixels=images.map(image=>{const canvas=createCanvas(image.width,image.height),ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);return Buffer.from(ctx.getImageData(0,0,image.width,image.height).data);});
 return pixels[0].equals(pixels[1]);
}
async function newScenario(name,{holdHost=false,holdAsset=null,failAsset=null,parseFailure=false}={}){
 const context=await browser.newContext({viewport,deviceScaleFactor:1,ignoreHTTPSErrors:false});
 const page=await context.newPage(),errors=[],consoleErrors=[],requests=[];let heldRoute,failed=false;
 page.on('pageerror',error=>errors.push({name:error.name,message:error.message}));
 page.on('console',message=>{if(message.type()==='error')consoleErrors.push(message.text());});
 await context.addInitScript(installBridge,{viewport,holdHost});
 await context.route('**/*',async route=>{
  const url=new URL(route.request().url());
  if(url.origin!=='https://localhost'){requests.push({url:url.href,rejected:true});await route.abort('blockedbyclient');return;}
  const path=url.pathname==='/'?'index.html':decodeURIComponent(url.pathname.slice(1));
  const absolute=resolve(staging,path);
  if(!absolute.startsWith(`${staging}${sep}`))throw Error(`Unsafe staged path: ${path}`);
  const contentType={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.png':'image/png','.wav':'audio/wav','.mp3':'audio/mpeg','.json':'application/json'}[extname(path)]??'application/octet-stream';
  const body=await readFile(absolute);const entry={path,sha256:hash(body)};requests.push(entry);
  if(parseFailure&&path==='app.js'){
   entry.injection='Intentional JavaScript parse failure';
   await route.fulfill({status:200,contentType,body:'const __INTENTIONAL_ANDROID_PARSE_FAILURE__ = ;'});return;
  }
  if(path===failAsset&&!failed){failed=true;entry.injection='Intentional one-shot HTTP 503 image failure';await route.fulfill({status:503,contentType:'text/plain',body:'Injected test asset failure'});return;}
  if(path===holdAsset){entry.delayed=true;heldRoute=()=>route.fulfill({status:200,contentType,body});return;}
  await route.fulfill({status:200,contentType,body});
 });
 await page.goto('https://localhost/',{waitUntil:'domcontentloaded',timeout:15000});
 return {page,errors,requests,
  async releaseAsset(){assert.ok(heldRoute,'Expected delayed asset request');const release=heldRoute;heldRoute=null;await release();},
  async waitAsset(){for(let count=0;count<750&&!heldRoute;count++)await new Promise(resolve=>setTimeout(resolve,20));assert.ok(heldRoute,'Delayed asset was never requested');},
  async finish(){
   const state=await stateOf(page);delete state.firstReveal?.png;
   receipt.scenarios.push({name,errors,consoleErrors,requests,state});
   if(parseFailure)check(errors.length===1&&errors[0].name==='SyntaxError','Only explicit injected parse failure may produce a pageerror');
   else check(errors.length===0,`${name} unexpected pageerror: ${JSON.stringify(errors)}`);
   check(requests.every(request=>!request.rejected),`${name} attempted unexpected external request`);
   await context.close();
  },
 };
}

try {
 await mkdir(out,{recursive:true});
 const inputs=['index.html','app.js','build-manifest.json','SHA256SUMS',...requiredImages];
 receipt.inputs=Object.fromEntries(await Promise.all(inputs.map(async path=>[path,hash(await readFile(resolve(staging,path)))])));
 const {chromium}=require(process.env.PLAYWRIGHT_MODULE??'/opt/codex/cua_node/lib/node_modules/playwright');
 browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH??'/usr/bin/chromium',headless:true,chromiumSandbox:true,
  env:{...process.env,HOME:'/tmp/warehouse-android-startup-home',XDG_CACHE_HOME:'/tmp/warehouse-android-startup-cache',XDG_CONFIG_HOME:'/tmp/warehouse-android-startup-config'}});
 receipt.browserVersion=await browser.version();

 const delayed=await newScenario('delayed-host-and-last-asset',{holdHost:true,holdAsset:requiredImages.at(-1)}),page=delayed.page;
 const initial=await stateOf(page);
 check(!initial.hidden&&initial.text.includes('货箱最后一格')&&initial.text.includes('正在启动…'),'Initial cover must contain the unchanged title and launch text');
 const initialShot=await screenshot(page,'01-initial-launch-cover.png');
 passed('delayed-host-cover');
 await page.evaluate(()=>window.__ANDROID_HOST_TEST__.releaseHost());
 await delayed.waitAsset();await waitLoaded(page,requiredImages.length-1);await step(page,6);
 const delayedState=await stateOf(page);
 check(!delayedState.hidden&&delayedState.html===initial.html,'A single delayed image must leave the initial cover unchanged');
 check(noHealthText(delayedState),'Healthy loading must not paint the intermediate health/resources gate');
 const delayedShot=await screenshot(page,'02-one-asset-delayed-same-cover.png');
 check(await samePixels(initialShot,delayedShot),'Initial and delayed cover screenshots must have identical pixels');
 passed('delayed-single-asset-cover',{pendingAsset:requiredImages.at(-1),loaded:5});
 // Settings button center in the native 1080x1920 layout. Keep this pointer
 // held over the loading-to-ready transition, then prove a fresh tap works.
 await page.mouse.move(355.5,743);await page.mouse.down();
 await delayed.releaseAsset();await waitLoaded(page);await step(page);
 const ready=await stateOf(page);
 check(ready.hidden&&ready.firstReveal,'Ready assets must reveal the canvas on this frame');
 check(requiredImages.every(path=>ready.firstReveal.images.includes(path)),'Every required image must be decoded before the reveal');
 check(ready.firstReveal.texts.some(text=>text.includes('WAREHOUSE'))&&ready.firstReveal.texts.includes('设置'),'First revealed canvas must contain the fully drawn menu');
 check(ready.firstReveal.drawImages.length>0,'First reveal must already contain rendered image content');
 const firstCanvas=resolve(out,'03-first-complete-canvas-before-reveal.png');
 await writeFile(firstCanvas,Buffer.from(ready.firstReveal.png.split(',')[1],'base64'));
 receipt.screenshots.push({path:relative(resolve('.'),firstCanvas),sha256:hash(await readFile(firstCanvas)),capture:'Canvas pixels synchronously captured immediately before cover.hidden=true'});
 const firstRendered=await screenshot(page,'04-first-complete-rendered-frame.png');
 check(await samePixels(firstCanvas,firstRendered),'First visible Chromium frame must exactly equal the complete canvas captured before cover removal');
 check(noHealthText(ready),'Healthy startup must never draw the resource counter or health screen');
 passed('complete-first-frame',{revealFrame:ready.firstReveal.frame,requiredDecodedImages:requiredImages.length,pixelComparison:'equal'});
 await page.mouse.up();await step(page);
 const released=await stateOf(page),releasedShot=await screenshot(page,'05-held-cover-input-released-no-action.png');
 check(released.storageSnapshot===ready.storageSnapshot,'Releasing a cover-started pointer must not change stored game state');
 check(await samePixels(firstRendered,releasedShot),'Releasing a cover-started pointer must not navigate or activate game controls');
 passed('held-input-does-not-act');
 await page.mouse.click(355.5,743);await step(page);
 const tapped=await stateOf(page);
 check(tapped.frames.at(-1).texts.includes('游玩设置'),'A fresh pointer after reveal must activate Settings');
 await screenshot(page,'06-fresh-input-settings.png');passed('fresh-input-works');
 const writes=tapped.coverWrites.length;
 await page.evaluate(()=>window.__ANDROID_HOST_TEST__.emitHost({active:false}));
 check((await stateOf(page)).pendingFrames===0,'Background transition must cancel the game frame loop');
 await page.evaluate(()=>window.__ANDROID_HOST_TEST__.emitHost({active:true}));await step(page);
 const resumed=await stateOf(page);
 check(resumed.hidden&&!resumed.coverWrites.slice(writes).some(write=>write.value===false),'Foreground resume must not show the launch cover again');
 check(resumed.frames.at(-1).texts.includes('游玩设置'),'Foreground resume must redraw the existing screen');
 await screenshot(page,'07-foreground-resume-no-cover.png');passed('foreground-resume-no-cover');await delayed.finish();

 const fast=await newScenario('fast-assets');await waitLoaded(fast.page);await step(fast.page);
 const fastState=await stateOf(fast.page);
 check(fastState.hidden&&fastState.firstReveal.frame===1,'Fast assets must reveal on the first eligible frame without a minimum delay');
 check(noHealthText(fastState),'Fast startup must not paint health or resource progress text');
 await screenshot(fast.page,'08-fast-assets-first-frame.png');passed('fast-assets-no-intermediate-health-text');await fast.finish();

 const failure=await newScenario('one-shot-asset-failure',{failAsset:requiredImages.at(-1)});
 await failure.page.waitForFunction(()=>window.__ANDROID_HOST_TEST__.trace.images.some(item=>item.status==='error'),null,{polling:20});await step(failure.page);
 const failed=await stateOf(failure.page);
 check(failed.hidden&&failed.firstReveal.texts.includes('画面资源加载失败')&&failed.firstReveal.texts.includes('重试加载'),'Actual image failure must reveal the existing painted retry gate');
 await screenshot(failure.page,'09-actual-asset-failure-retry.png');
 await failure.page.mouse.click(270,580);await waitLoaded(failure.page);await step(failure.page);
 const recovered=await stateOf(failure.page);
 check(recovered.hidden&&recovered.frames.at(-1).texts.some(text=>text.includes('WAREHOUSE')),'Retry must recover to a complete game frame');
 check(!recovered.coverWrites.some(write=>write.value===false),'Asset retry must not resurrect launch branding');
 await screenshot(failure.page,'10-asset-retry-recovered.png');passed('asset-failure-retry-recovery');await failure.finish();

 const parse=await newScenario('app-js-parse-failure',{parseFailure:true});
 const early=await stateOf(parse.page);
 check(!early.hidden&&early.helpVisibility==='hidden','CSS rescue detail must stay hidden before its 12-second delay');
 await screenshot(parse.page,'11-parse-failure-before-css-delay.png');
 await parse.page.waitForFunction(()=>getComputedStyle(document.querySelector('.startup-help')).visibility==='visible',null,{polling:50,timeout:15000});
 const cssTime=await parse.page.evaluate(()=>performance.now());
 check(cssTime>=12000,'CSS rescue detail must not appear before 12 seconds');
 const late=await stateOf(parse.page);
 check(!late.hidden&&late.text.includes('已有存档未被清空'),'CSS-only recovery detail must remain usable when app.js cannot parse');
 check(late.bridgeCalls.length===0&&late.storageWrites.length===0,'Parse-failed app must not open native storage or call the bridge');
 await screenshot(parse.page,'12-parse-failure-css-help-after-12s.png');
 passed('parse-failure-css-help-after-12s',{observedAtMs:cssTime,appJavaScriptExecuted:false});await parse.finish();
 receipt.status='PASS';
} catch(error) {
 receipt.status=browser?'FAIL':'BLOCKED';receipt.error=error.stack??String(error);process.exitCode=1;
} finally {
 await browser?.close();await mkdir(out,{recursive:true});
 await writeFile(resolve(out,'host-receipt.json'),JSON.stringify(receipt,null,2)+'\n');
 console.log(JSON.stringify({status:receipt.status,assertions:receipt.assertions,cases:receipt.cases,screenshots:receipt.screenshots.length,error:receipt.error,receipt:resolve(out,'host-receipt.json')},null,2));
}
