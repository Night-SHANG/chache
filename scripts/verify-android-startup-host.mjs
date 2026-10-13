/* global window, document, Node, HTMLElement, HTMLCanvasElement, CanvasRenderingContext2D, getComputedStyle */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve,relative,sep,extname} from 'node:path';

/**
 * Chromium DOM/CSS + native Canvas bridge-harness evidence, never native Android
 * or phone acceptance. Run after npm run build:android. Requests serve unchanged
 * staged bytes, except explicitly injected HTTP failures. All PNG requests can
 * remain pending while real Chromium animation callbacks paint the first menu.
 * Only the native/storage bridge and animation scheduling are instrumented.
 * No production source rewrite, TLS bypass, or sandbox disabling is permitted.
 * Launch failures exit nonzero and record NOT RUN cases, never a visual pass.
 */
const require=createRequire(import.meta.url);
const out=resolve(process.env.ANDROID_HOST_QA_DIR??'qa/android-v119/host');
const staging=resolve('build/android');
const viewport={width:540,height:960};
const optionalImages=[
 'assets/static-art/scene-day.png','assets/static-art/cargo-core.png',
 'assets/static-art/forklift-base.png','assets/static-art/forklift-styled.png',
 'assets/static-art/frame-classic.png','assets/static-art/tools-core.png',
 'assets/board-materials.png','assets/cargo-materials.png','assets/scene-materials.png',
];
const cases=['html-before-app-is-silent','native-readiness-before-storage','all-pngs-held-complete-first-frame',
 'computed-status-display-none','pre-ready-pointer-release-does-not-act',
 'cold-input-works','foreground-resume-with-pngs-held','late-pngs-enhance-current-screen',
 'all-png-failures-input-works','fast-assets-first-frame',
 'missing-storage-blocked','invalid-storage-response-blocked',
 'invalid-native-state-blocked','missing-native-capability-blocked'];
const receipt={schemaVersion:2,kind:'Chromium Android bridge harness',
 nativeAndroidAcceptance:'NOT RUN',phoneAcceptance:'NOT RUN',
 generatedAt:new Date().toISOString(),viewport,origin:'https://localhost',
 animation:'Harness-controlled game queue advanced inside native Chromium requestAnimationFrame',
 security:{chromiumSandbox:true,ignoreHTTPSErrors:false,network:'All requests intercepted; external requests rejected'},
 status:'RUNNING',cases:Object.fromEntries(cases.map(name=>[name,{status:'NOT RUN'}])),
 screenshots:[],scenarios:[],assertions:0};
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const check=(condition,message)=>{assert.ok(condition,message);receipt.assertions++;};
const passed=(name,details={})=>{receipt.cases[name]={status:'PASS',...details};};
let browser;

// This instrumentation runs only in the harness, never in the shipped bundle.
function installBridge({viewport,holdHost,missingStorage,invalidStorage,invalidHost,missingCapability}) {
 const nativeFrame=window.requestAnimationFrame.bind(window);
 const pendingFrames=new Map(),listeners=new Map(),storage=new Map();
 let nextFrame=0,nextListener=0,frameNumber=0,currentFrame=null,releaseHost;
 let state={active:true,owner:true,widthPx:invalidHost?-1:viewport.width,heightPx:viewport.height,insetsPx:{top:0,right:0,bottom:0,left:0}};
 const stateGate=holdHost?new Promise(resolve=>{releaseHost=resolve;}):Promise.resolve();
 const trace={frames:[],images:[],statusWrites:[],storageCalls:[],storageWrites:[],bridgeCalls:[],firstFrame:null};
 const status=()=>{const node=document.querySelector('#startup-status');return {hidden:node.hidden,display:getComputedStyle(node).display,text:node.textContent};};
 const nativeHidden=Object.getOwnPropertyDescriptor(HTMLElement.prototype,'hidden');
 Object.defineProperty(HTMLElement.prototype,'hidden',{
  ...nativeHidden,
  set(value){nativeHidden.set.call(this,value);if(this.id==='startup-status')trace.statusWrites.push({...status(),frame:frameNumber,time:performance.now()});},
 });
 const nativeText=Object.getOwnPropertyDescriptor(Node.prototype,'textContent');
 Object.defineProperty(Node.prototype,'textContent',{...nativeText,set(value){nativeText.set.call(this,value);if(this.id==='startup-status')trace.statusWrites.push({...status(),frame:frameNumber,time:performance.now()});}});
 const nativeImage=window.Image;
 function TracedImage(...args){
  const image=new nativeImage(...args);
  for(const [event,status] of [['load','loaded'],['error','error']])image.addEventListener(event,()=>trace.images.push({path:new URL(image.src).pathname.slice(1),status,time:performance.now()}));
  return image;
 }
 TracedImage.prototype=nativeImage.prototype;Object.setPrototypeOf(TracedImage,nativeImage);window.Image=TracedImage;
 const glyphWitness=(ctx,text,x,y)=>{
  const m=ctx.getTransform(),metrics=ctx.measureText(text),points=[
   [x-metrics.actualBoundingBoxLeft,y-metrics.actualBoundingBoxAscent],
   [x+metrics.actualBoundingBoxRight,y-metrics.actualBoundingBoxAscent],
   [x-metrics.actualBoundingBoxLeft,y+metrics.actualBoundingBoxDescent],
   [x+metrics.actualBoundingBoxRight,y+metrics.actualBoundingBoxDescent],
  ].map(([px,py])=>({x:m.a*px+m.c*py+m.e,y:m.b*px+m.d*py+m.f}));
  const left=Math.max(0,Math.floor(Math.min(...points.map(p=>p.x))-2)),top=Math.max(0,Math.floor(Math.min(...points.map(p=>p.y))-2));
  const right=Math.min(ctx.canvas.width,Math.ceil(Math.max(...points.map(p=>p.x))+2)),bottom=Math.min(ctx.canvas.height,Math.ceil(Math.max(...points.map(p=>p.y))+2));
  const rect={x:left,y:top,w:right-left,h:bottom-top};
  if(rect.w<=0||rect.h<=0)return null;
  return {text,rect,before:ctx.getImageData(rect.x,rect.y,rect.w,rect.h).data};
 };
 for(const method of ['fillText','strokeText','drawImage']){
  const native=CanvasRenderingContext2D.prototype[method];
  CanvasRenderingContext2D.prototype[method]=function(...args){
   if(!currentFrame||this.canvas.id!=='game')return native.apply(this,args);
   let glyph;
   if(method==='drawImage')currentFrame.images.push(args[0].src??'(offscreen canvas)');
   else{
    const m=this.getTransform(),x=Number(args[1]),y=Number(args[2]);
    currentFrame.texts.push(String(args[0]));currentFrame.labels.push({text:String(args[0]),x:m.a*x+m.c*y+m.e,y:m.b*x+m.d*y+m.f});
    if(method==='fillText')glyph=glyphWitness(this,String(args[0]),x,y);
   }
   const result=native.apply(this,args);
   if(glyph){
    const {rect,before}=glyph,after=this.getImageData(rect.x,rect.y,rect.w,rect.h).data,pixels=[];
    for(let i=0;i<after.length;i+=4)if(Math.abs(after[i]-before[i])+Math.abs(after[i+1]-before[i+1])+Math.abs(after[i+2]-before[i+2])>=18)pixels.push([i,after[i],after[i+1],after[i+2]]);
    currentFrame.glyphs.push({text:glyph.text,rect,pixels});
   }
   return result;
  };
 }
 window.requestAnimationFrame=callback=>{const id=++nextFrame;pendingFrames.set(id,callback);return id;};
 window.cancelAnimationFrame=id=>pendingFrames.delete(id);
 if(missingCapability)Object.defineProperty(HTMLCanvasElement.prototype,'setPointerCapture',{value:undefined,configurable:true});
 const envelope=value=>JSON.stringify({v:1,ok:true,value});
 if(!missingStorage)window.WarehouseStorage={
  get:key=>{trace.storageCalls.push({method:'get',key});return envelope(storage.get(key)??null);},
  set:(key,value)=>{storage.set(key,value);trace.storageCalls.push({method:'set',key});trace.storageWrites.push({method:'set',key});return envelope(null);},
  remove:key=>{storage.delete(key);trace.storageCalls.push({method:'remove',key});trace.storageWrites.push({method:'remove',key});return envelope(null);},
  listKeys:prefix=>{trace.storageCalls.push({method:'listKeys',prefix});return invalidStorage?'invalid native storage response':envelope([...storage.keys()].filter(key=>key.startsWith(prefix)).sort());},
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
  trace,status,
  releaseHost(){releaseHost?.();},
  pendingFrames:()=>pendingFrames.size,
  storageSnapshot:()=>JSON.stringify([...storage.entries()].sort()),
  emitHost(patch){state={...state,...patch};for(const listener of listeners.values())if(listener.event==='state')listener.callback(structuredClone(state));},
  async advanceFrames(count=1){
   for(let i=0;i<count;i++)await new Promise((resolve,reject)=>nativeFrame(now=>{
    try{
     const batch=[...pendingFrames];pendingFrames.clear();frameNumber++;
     currentFrame={number:frameNumber,nativeTimestamp:now,callbacks:batch.length,texts:[],labels:[],images:[],glyphs:[],statusBefore:status()};
     for(const [,callback]of batch)callback(now);
     const canvas=document.querySelector('#game'),ctx=canvas.getContext('2d');
     currentFrame.statusAfter=status();
     currentFrame.glyphs=currentFrame.glyphs.map(({text,rect,pixels})=>{
      const final=ctx.getImageData(rect.x,rect.y,rect.w,rect.h).data;
      const visible=pixels.filter(([i,r,g,b])=>Math.abs(final[i]-r)+Math.abs(final[i+1]-g)+Math.abs(final[i+2]-b)<=12).length;
      return {text,rect,changedPixels:pixels.length,visibleRatio:visible/Math.max(1,pixels.length)};
     });
     trace.frames.push(currentFrame);
     if(!trace.firstFrame&&currentFrame.texts.length)trace.firstFrame={...currentFrame,png:canvas.toDataURL('image/png'),decodedImages:trace.images.filter(image=>image.status==='loaded').map(image=>image.path)};
     currentFrame=null;resolve();
    }catch(error){currentFrame=null;reject(error);}
   }));
  },
 };
}

const stateOf=page=>page.evaluate(()=>{
 const t=window.__ANDROID_HOST_TEST__;
 return {...t.status(),pendingFrames:t.pendingFrames(),...t.trace,storageSnapshot:t.storageSnapshot()};
});
const step=(page,count=1)=>page.evaluate(count=>window.__ANDROID_HOST_TEST__.advanceFrames(count),count);
const waitReady=page=>page.waitForFunction(()=>window.__ANDROID_HOST_TEST__.pendingFrames()>0&&getComputedStyle(document.querySelector('#startup-status')).display==='none',null,{polling:20,timeout:15000});
const waitImages=(page,status)=>page.waitForFunction(({status,count})=>window.__ANDROID_HOST_TEST__.trace.images.filter(item=>item.status===status).length>=count,{status,count:optionalImages.length},{polling:20,timeout:15000});
const noLoadingText=trace=>!trace.frames.some(frame=>frame.texts.some(text=>/启动检查|正在加载|已加载\s*\d+|画面资源加载失败|重试加载|准备预览/.test(text)));
const visibleText=(frame,text)=>frame.glyphs.some(glyph=>glyph.text===text&&glyph.changedPixels>=3&&glyph.visibleRatio>=.75);
const completeMenu=frame=>['WAREHOUSE  /  LAST SLOT','入库模式','出库模式','商店','设置'].every(text=>visibleText(frame,text));
async function screenshot(page,name){
 const path=resolve(out,name);await page.screenshot({path,animations:'allow'});
 receipt.screenshots.push({path:relative(resolve('.'),path),sha256:hash(await readFile(path))});return path;
}
async function samePixels(first,second){
 const {loadImage,createCanvas}=require('@napi-rs/canvas');
 const images=await Promise.all([first,second].map(path=>loadImage(path)));
 if(images[0].width!==images[1].width||images[0].height!==images[1].height)return false;
 const pixels=images.map(image=>{const canvas=createCanvas(image.width,image.height),ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);return Buffer.from(ctx.getImageData(0,0,image.width,image.height).data);});
 return pixels[0].equals(pixels[1]);
}
async function tapText(page,text){
 const state=await stateOf(page),label=state.frames.at(-1).labels.find(label=>label.text===text);
 check(label,`Missing tap target ${text}`);await page.mouse.click(label.x,label.y-3);await step(page);
}
async function newScenario(name,options={}){
 const context=await browser.newContext({viewport,deviceScaleFactor:1,ignoreHTTPSErrors:false});
 const page=await context.newPage(),errors=[],consoleErrors=[],requests=[],heldRoutes=new Map();let holdPNGs=Boolean(options.holdPNGs),releaseApp,appHeld;
 const appGate=new Promise(resolve=>{appHeld=resolve;});
 page.on('pageerror',error=>errors.push({name:error.name,message:error.message}));
 page.on('console',message=>{if(message.type()==='error')consoleErrors.push(message.text());});
 await context.addInitScript(installBridge,{viewport,...options});
 await context.route('**/*',async route=>{
  const url=new URL(route.request().url());
  if(url.origin!=='https://localhost'){requests.push({url:url.href,rejected:true});await route.abort('blockedbyclient');return;}
  const path=url.pathname==='/'?'index.html':decodeURIComponent(url.pathname.slice(1));
  const absolute=resolve(staging,path);
  if(!absolute.startsWith(`${staging}${sep}`))throw Error(`Unsafe staged path: ${path}`);
  const contentType={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.png':'image/png','.wav':'audio/wav','.mp3':'audio/mpeg','.json':'application/json'}[extname(path)]??'application/octet-stream';
  const body=await readFile(absolute),entry={path,sha256:hash(body)};requests.push(entry);
  if(path==='app.js'&&options.holdApp){releaseApp=()=>route.fulfill({status:200,contentType,body});appHeld();return;}
  if(extname(path)==='.png'&&options.failPNGs){entry.injection='Intentional HTTP 503 for every PNG';await route.fulfill({status:503,contentType:'text/plain',body:'Injected optional image failure'});return;}
  if(extname(path)==='.png'&&holdPNGs){entry.delayed=true;heldRoutes.set(path,()=>route.fulfill({status:200,contentType,body}));return;}
  await route.fulfill({status:200,contentType,body});
 });
 await page.goto('https://localhost/',{waitUntil:options.holdApp?'commit':'domcontentloaded',timeout:15000});
 if(options.holdApp)await page.waitForSelector('#startup-status',{state:'attached'});
 return {page,requests,async releaseApp(){await appGate;return releaseApp();},
  async waitPNG(){for(let count=0;count<750&&!heldRoutes.size;count++)await new Promise(resolve=>setTimeout(resolve,20));check(heldRoutes.size>0,'No held PNG request was observed');},
  async releasePNGs(){holdPNGs=false;const routes=[...heldRoutes.values()];heldRoutes.clear();await Promise.all(routes.map(release=>release()));},
  async finish(){
   const state=await stateOf(page);delete state.firstFrame?.png;
   receipt.scenarios.push({name,options,errors,consoleErrors,requests,state});
   if(!options.missingStorage&&!options.invalidStorage&&!options.invalidHost&&!options.missingCapability)check(state.statusWrites.every(write=>write.hidden&&write.display==='none'&&write.text===''),'Every normal-bootstrap status write must remain empty and invisible');
   check(errors.length===0,`${name} unexpected pageerror: ${JSON.stringify(errors)}`);
   check(requests.every(request=>!request.rejected),`${name} attempted unexpected external request`);
   await context.close();
  },
 };
}

try {
 await mkdir(out,{recursive:true});
 const inputs=['index.html','app.js','build-manifest.json','SHA256SUMS',...optionalImages];
 receipt.inputs=Object.fromEntries(await Promise.all(inputs.map(async path=>[path,hash(await readFile(resolve(staging,path)))])));
 receipt.scriptSha256=hash(await readFile(new URL(import.meta.url)));
 const {chromium}=require(process.env.PLAYWRIGHT_MODULE??'/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js');
 const browserExecutable=process.env.CHROMIUM_PATH??chromium.executablePath();
 receipt.browserExecutable=browserExecutable;
 receipt.browserChannel=browserExecutable==='/opt/google/chrome/chrome'?'chrome-stable-installed':'chromium-or-explicit-executable';
 browser=await chromium.launch({executablePath:browserExecutable,headless:true,chromiumSandbox:true,
  env:{...process.env,HOME:'/tmp/warehouse-android-startup-home',XDG_CACHE_HOME:'/tmp/warehouse-android-startup-cache',XDG_CONFIG_HOME:'/tmp/warehouse-android-startup-config'}});
 receipt.browserVersion=await browser.version();

 const htmlOnly=await newScenario('html-before-app-is-silent',{holdApp:true,holdHost:true,holdPNGs:true});
 const htmlState=await stateOf(htmlOnly.page);
 check(htmlState.hidden&&htmlState.display==='none'&&htmlState.text==='','Actual HTML must be empty and hidden before app.js executes');
 check(htmlState.bridgeCalls.length===0,'Held app.js must not have run');
 await screenshot(htmlOnly.page,'00-html-before-app.png');passed('html-before-app-is-silent');
 await htmlOnly.releaseApp();await htmlOnly.page.waitForLoadState('domcontentloaded');await htmlOnly.finish();

 const cold=await newScenario('native-host-delayed-and-all-pngs-held',{holdHost:true,holdPNGs:true}),page=cold.page;
 await page.waitForFunction(()=>window.__ANDROID_HOST_TEST__.trace.bridgeCalls.some(call=>call.method==='getState'),null,{polling:20});
 const initial=await stateOf(page);
 check(initial.hidden&&initial.display==='none'&&initial.text==='','Native/storage readiness must remain silent until the host resolves');
 check(initial.storageCalls.length===0&&initial.pendingFrames===0,'Unready native host must not open storage or schedule gameplay');
 await screenshot(page,'01-native-host-readiness.png');passed('native-readiness-before-storage');
 // A pointer begun before the session is ready must never become a fresh input.
 await page.mouse.move(355.5,743);await page.mouse.down();
 await page.evaluate(()=>window.__ANDROID_HOST_TEST__.releaseHost());await waitReady(page);await cold.waitPNG();
 const before=await stateOf(page);
 check(before.images.length===0&&before.frames.length===0,'All PNGs and the first game frame must still be pending');
 check(before.storageCalls.some(call=>call.method==='listKeys'),'Native storage must be checked before gameplay');
 await step(page);
 const first=await stateOf(page),frame=first.firstFrame;
 check(frame?.number===1&&frame.callbacks>0,'The first native Chromium animation callback must paint gameplay');
 check(completeMenu(frame),'The first frame must retain visible pixels for every main-menu control and heading');
 check(frame.decodedImages.length===0&&frame.images.length===0,'The complete first menu must use synchronous artwork while every PNG is held');
 check(noLoadingText(first),'Cold startup must never paint loading or retry UI');
 check(first.hidden&&first.display==='none'&&frame.statusAfter.display==='none','Computed status display must be none, not merely the hidden property');
 const firstCanvas=resolve(out,'02-first-native-canvas-all-pngs-held.png');
 await writeFile(firstCanvas,Buffer.from(frame.png.split(',')[1],'base64'));
 receipt.screenshots.push({path:relative(resolve('.'),firstCanvas),sha256:hash(await readFile(firstCanvas)),capture:'Native Canvas pixels at completion of first native Chromium animation callback; zero decoded PNGs'});
 const firstRendered=await screenshot(page,'03-first-visible-chromium-frame.png');
 check(await samePixels(firstCanvas,firstRendered),'Rendered Chromium pixels must exactly match the complete first Canvas with no DOM status overlay');
 passed('all-pngs-held-complete-first-frame',{frame:frame.number,decodedPNGs:0,pixelComparison:'equal',glyphs:frame.glyphs.filter(glyph=>glyph.changedPixels>=3&&glyph.visibleRatio>=.75).map(glyph=>glyph.text)});
 passed('computed-status-display-none',{hidden:first.hidden,computedDisplay:first.display});
 await page.mouse.up();await step(page);
 const released=await stateOf(page);
 check(completeMenu(released.frames.at(-1))&&released.storageSnapshot===first.storageSnapshot,'Releasing a pre-ready pointer must not navigate or change saved state');
 passed('pre-ready-pointer-release-does-not-act');
 await tapText(page,'设置');const settings=await stateOf(page);
 check(visibleText(settings.frames.at(-1),'游玩设置')&&settings.images.length===0,'Fresh input must open Settings before any PNG resolves');
 check(settings.display==='none'&&noLoadingText(settings),'Cold Settings must have no status overlay or loading UI');
 await screenshot(page,'04-settings-all-pngs-held.png');passed('cold-input-works');
 const writes=settings.statusWrites.length;
 await page.evaluate(()=>window.__ANDROID_HOST_TEST__.emitHost({active:false}));
 check((await stateOf(page)).pendingFrames===0,'Backgrounding must cancel the game frame queue');
 await page.evaluate(()=>window.__ANDROID_HOST_TEST__.emitHost({active:true}));await step(page);
 const resumed=await stateOf(page);
 check(resumed.display==='none'&&!resumed.statusWrites.slice(writes).some(write=>write.display!=='none'),'Foregrounding must not resurrect a loading surface');
 check(visibleText(resumed.frames.at(-1),'游玩设置')&&resumed.images.length===0,'Existing Settings screen must redraw while PNGs remain held');
 passed('foreground-resume-with-pngs-held');
 await cold.releasePNGs();await waitImages(page,'loaded');await step(page);
 const warm=await stateOf(page);
 check(optionalImages.every(path=>warm.images.some(image=>image.path===path&&image.status==='loaded')),'Every optional startup PNG must eventually decode');
 check(visibleText(warm.frames.at(-1),'游玩设置')&&warm.frames.at(-1).images.length>0,'Late decoded art must enhance the current screen without resetting navigation');
 check(warm.display==='none'&&noLoadingText(warm),'Late PNG arrival must not add loading UI');
 await screenshot(page,'05-settings-after-optional-pngs.png');passed('late-pngs-enhance-current-screen');await cold.finish();

 const failure=await newScenario('every-optional-png-fails',{failPNGs:true});await waitReady(failure.page);await waitImages(failure.page,'error');await step(failure.page);
 const failed=await stateOf(failure.page);
 check(completeMenu(failed.firstFrame)&&failed.display==='none'&&noLoadingText(failed),'All optional PNG failures must still paint a usable menu without a retry gate');
 await tapText(failure.page,'设置');const failedSettings=await stateOf(failure.page);
 check(visibleText(failedSettings.frames.at(-1),'游玩设置')&&failedSettings.display==='none','Real input must remain usable after every optional image fails');
 await screenshot(failure.page,'06-settings-all-pngs-failed.png');passed('all-png-failures-input-works',{failedPNGs:failed.images.filter(image=>image.status==='error').length});await failure.finish();

 const fast=await newScenario('fast-optional-images');await waitReady(fast.page);await waitImages(fast.page,'loaded');await step(fast.page);
 const fastState=await stateOf(fast.page);
 check(fastState.firstFrame.number===1&&completeMenu(fastState.firstFrame)&&fastState.display==='none','Fast decoded assets must paint the complete first eligible game frame');
 check(noLoadingText(fastState),'Fast startup must never paint loading or retry UI');
 await screenshot(fast.page,'07-fast-assets-first-frame.png');passed('fast-assets-first-frame');await fast.finish();

 for(const [name,options,errorText]of [
  ['missing-storage-blocked',{missingStorage:true},'Android 本地存储或保存宿主未就绪'],
  ['invalid-storage-response-blocked',{invalidStorage:true},'Android storage: INVALID_RESPONSE'],
  ['invalid-native-state-blocked',{invalidHost:true},'Android 宿主 state 无效'],
  ['missing-native-capability-blocked',{missingCapability:true},'Android WebView 缺少所需能力 pointer capture'],
 ]){
  const scenario=await newScenario(name,options);
  await scenario.page.waitForFunction(()=>document.querySelector('#startup-status').textContent.includes('无法开始游戏'),null,{polling:20,timeout:15000});
  const blocked=await stateOf(scenario.page);
  check(!blocked.hidden&&blocked.display!=='none'&&blocked.text.includes(errorText),'Genuine native/storage capability failure must remain visibly reported');
  check(blocked.text.includes('已有存档未被清空')&&blocked.storageWrites.length===0,'Native failure must preserve saves without initialization writes');
  check(blocked.pendingFrames===0&&blocked.frames.length===0&&blocked.images.length===0,'A genuine native capability failure must not start game rendering or optional image work');
  await screenshot(scenario.page,`${name}.png`);passed(name,{computedDisplay:blocked.display,error:blocked.text});await scenario.finish();
 }
 receipt.status='PASS';
} catch(error) {
 receipt.status=browser?'FAIL':'BLOCKED';receipt.error=error.stack??String(error);process.exitCode=1;
} finally {
 await browser?.close();await mkdir(out,{recursive:true});
 await writeFile(resolve(out,'host-receipt.json'),JSON.stringify(receipt,null,2)+'\n');
 console.log(JSON.stringify({status:receipt.status,assertions:receipt.assertions,cases:receipt.cases,screenshots:receipt.screenshots.length,error:receipt.error,receipt:resolve(out,'host-receipt.json')},null,2));
}
