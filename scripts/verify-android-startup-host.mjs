/* global window, document, Node, HTMLElement, HTMLCanvasElement, CanvasRenderingContext2D, getComputedStyle */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve,relative,sep,extname} from 'node:path';

/**
 * Exact staged Android bundle in Chromium DOM/CSS/native Canvas. WarehouseHost,
 * WarehouseStorage and WarehouseLaunch are EXPLICIT SIMULATIONS. The simulated
 * visual callback exercises the JS handshake, not Android postVisualStateCallback,
 * the system splash, WebView composition or phone acceptance. Those need Android.
 * Requests serve unchanged staged bytes except declared HTTP error injections.
 * Game callbacks run inside real Chromium rAF. No source/timer rewrite, TLS bypass
 * or sandbox disabling. A blocked browser leaves cases NOT RUN, never PASS.
 */
const require=createRequire(import.meta.url);
const out=resolve(process.env.ANDROID_HOST_QA_DIR??'qa/android-v120/host');
const staging=resolve('build/android');
const viewport={width:540,height:960};
const startupImages=['assets/static-art/scene-day.png','assets/static-art/forklift-base.png'];
const backgroundImages=['assets/static-art/cargo-core.png','assets/static-art/forklift-styled.png','assets/static-art/frame-classic.png','assets/board-materials.png','assets/cargo-materials.png','assets/scene-materials.png','assets/static-art/tools-core.png'];
const allImages=[
 'assets/static-art/scene-day.png','assets/static-art/cargo-core.png',
 'assets/static-art/forklift-base.png','assets/static-art/forklift-styled.png',
 'assets/static-art/frame-classic.png','assets/static-art/tools-core.png',
 'assets/board-materials.png','assets/cargo-materials.png','assets/scene-materials.png',
];
const cases=[
 'html-before-app-is-silent','native-readiness-before-storage','required-pngs-held-no-reveal',
 'required-pngs-first-complete-frame','computed-status-display-none','current-visual-callback-reveals',
 'continuous-menu-background-stable','pre-ready-pointer-release-does-not-act','cold-input-works',
 'foreground-resume-keeps-current-screen','stale-geometry-callback-rejected',
 'all-png-errors-settle-without-deadline-delay','timeout-fallback-is-final','partial-timeout-uses-absolute-deadline',
 'fast-assets-first-frame','canvas-render-failure-displayed',
 'missing-storage-blocked','invalid-storage-response-blocked','invalid-native-state-blocked',
 'missing-native-capability-blocked','missing-launch-bridge-blocked',
];
const receipt={schemaVersion:3,kind:'Chromium Android bridge harness',
 nativeAndroidAcceptance:'NOT RUN',systemSplashAcceptance:'NOT RUN',phoneAcceptance:'NOT RUN',
 generatedAt:new Date().toISOString(),viewport,origin:'https://localhost',
 animation:'Harness-controlled game queue advanced inside native Chromium requestAnimationFrame',
 launch:'Simulated WarehouseLaunch and visual callback only; actual native compositor and 15 s foreground watchdog NOT RUN',
 continuity:'Every advanced native rAF is recorded, including empty pre-art frames; SHA-256 PNG hashes of fixed edge strips exclude the central forklift and controls',
 startupImages,
 security:{chromiumSandbox:true,ignoreHTTPSErrors:false,network:'All requests intercepted; external requests rejected'},
 status:'RUNNING',cases:Object.fromEntries(cases.map(name=>[name,{status:'NOT RUN'}])),
 screenshots:[],scenarios:[],assertions:0};
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const check=(condition,message)=>{assert.ok(condition,message);receipt.assertions++;};
const passed=(name,details={})=>{receipt.cases[name]={status:'PASS',...details};};
let browser;
const liveScenarios=new Set();

// This entire function is harness instrumentation, never part of the shipped app.
function installBridge({viewport,holdHost,missingStorage,invalidStorage,invalidHost,missingCapability,missingLaunch,paintFailure}) {
 const nativeFrame=window.requestAnimationFrame.bind(window);
 const pendingFrames=new Map(),listeners=new Map(),storage=new Map(),visualRequests=new Map(),blockedPointers=new Set();
 let nextFrame=0,nextListener=0,frameNumber=0,currentFrame=null,releaseHost;
 let visualSequence=0,pendingVisual=0,ready=false,launchFailed=false,paintFailed=false;
 let state={launchGeneration:1,active:true,owner:true,widthPx:invalidHost?-1:viewport.width,heightPx:viewport.height,insetsPx:{top:0,right:0,bottom:0,left:0}};
 const stateGate=holdHost?new Promise(resolve=>{releaseHost=resolve;}):Promise.resolve();
 const trace={events:[],frames:[],images:[],statusWrites:[],storageCalls:[],storageWrites:[],bridgeCalls:[],launchCalls:[],visualCallbacks:[],pointers:[],firstFrame:null,firstReveal:null};
 const status=()=>{const node=document.querySelector('#startup-status');return node?{hidden:node.hidden,display:getComputedStyle(node).display,text:node.textContent}:{hidden:null,display:null,text:null};};
 const record=(type,details={})=>{const entry={sequence:trace.events.length+1,time:performance.now(),frame:frameNumber,type,ready,failed:launchFailed,generation:state.launchGeneration,...details};trace.events.push(entry);return entry;};
 const geometry=()=>({native:structuredClone(state),canvas:(()=>{const rect=document.querySelector('#game')?.getBoundingClientRect();return rect?{x:rect.x,y:rect.y,width:rect.width,height:rect.height}:null;})()});
 const sameGeometry=expected=>Boolean(expected&&expected.launchGeneration===state.launchGeneration&&expected.active===state.active&&expected.owner===state.owner&&expected.widthPx===state.widthPx&&expected.heightPx===state.heightPx&&['top','right','bottom','left'].every(edge=>expected.insetsPx?.[edge]===state.insetsPx[edge]));
 const usable=()=>state.active&&state.owner&&state.widthPx>0&&state.heightPx>0;
 const nativeHidden=Object.getOwnPropertyDescriptor(HTMLElement.prototype,'hidden');
 Object.defineProperty(HTMLElement.prototype,'hidden',{
  ...nativeHidden,
  set(value){nativeHidden.set.call(this,value);if(this.id==='startup-status')trace.statusWrites.push(record('status-write',status()));},
 });
 const nativeText=Object.getOwnPropertyDescriptor(Node.prototype,'textContent');
 Object.defineProperty(Node.prototype,'textContent',{...nativeText,set(value){nativeText.set.call(this,value);if(this.id==='startup-status')trace.statusWrites.push(record('status-write',status()));}});
 const nativeImage=window.Image;
 function TracedImage(...args){
  const image=new nativeImage(...args);
  for(const [event,imageStatus] of [['load','loaded'],['error','error']])image.addEventListener(event,()=>trace.images.push(record('image-event',{path:new URL(image.src).pathname.slice(1),status:imageStatus,width:image.naturalWidth,height:image.naturalHeight})));
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
   if(paintFailure&&!paintFailed&&method==='fillText'){paintFailed=true;record('injected-canvas-exception');throw Error('Injected actual Canvas rendering failure');}
   let glyph;
   if(method==='drawImage'){
    const source=args[0].src??'(offscreen canvas)',m=this.getTransform();
    currentFrame.images.push(source);currentFrame.draws.push({source,args:args.slice(1),transform:[m.a,m.b,m.c,m.d,m.e,m.f]});
   }else{
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
 // Native touch blocking is simulated explicitly. This does not prove Activity
 // dispatchTouchEvent behavior; Android instrumentation must verify that separately.
 for(const name of ['pointerdown','pointermove','pointerup','pointercancel'])window.addEventListener(name,event=>{
  if(name==='pointerdown'&&!ready)blockedPointers.add(event.pointerId);
  const blocked=!ready||blockedPointers.has(event.pointerId);
  trace.pointers.push(record('pointer',{name,id:event.pointerId,blocked,x:event.clientX,y:event.clientY}));
  if(blocked){event.preventDefault();event.stopImmediatePropagation();}
  if(name==='pointerup'||name==='pointercancel')blockedPointers.delete(event.pointerId);
 },true);
 window.requestAnimationFrame=callback=>{const id=++nextFrame;pendingFrames.set(id,callback);return id;};
 window.cancelAnimationFrame=id=>pendingFrames.delete(id);
 if(missingCapability)Object.defineProperty(HTMLCanvasElement.prototype,'setPointerCapture',{value:undefined,configurable:true});
 if(!missingLaunch)window.WarehouseLaunch={
  frameReady(serialized){
   let expected;try{expected=JSON.parse(serialized);}catch{/* Recorded and rejected, never acknowledged. */}
   const accepted=!ready&&!launchFailed&&!pendingVisual&&usable()&&sameGeometry(expected);
   const id=accepted?++visualSequence:0;
   if(accepted){pendingVisual=id;visualRequests.set(id,{id,expected,frame:frameNumber});}
   trace.launchCalls.push(record('frame-ready',{id,accepted,expected,geometry:geometry()}));
  },
  isReady(){trace.launchCalls.push(record('is-ready'));return ready;},
  failed(message){if(!ready){launchFailed=true;pendingVisual=0;}trace.launchCalls.push(record('launch-failed',{message}));},
 };
 const envelope=value=>JSON.stringify({v:1,ok:true,value});
 if(!missingStorage)window.WarehouseStorage={
  get:key=>{trace.storageCalls.push(record('storage-call',{method:'get',key}));return envelope(storage.get(key)??null);},
  set:(key,value)=>{storage.set(key,value);trace.storageCalls.push(record('storage-call',{method:'set',key}));trace.storageWrites.push({method:'set',key});return envelope(null);},
  remove:key=>{storage.delete(key);trace.storageCalls.push(record('storage-call',{method:'remove',key}));trace.storageWrites.push({method:'remove',key});return envelope(null);},
  listKeys:prefix=>{trace.storageCalls.push(record('storage-call',{method:'listKeys',prefix}));return invalidStorage?'invalid native storage response':envelope([...storage.keys()].filter(key=>key.startsWith(prefix)).sort());},
 };
 window.androidBridge={};
 window.Capacitor={
  PluginHeaders:[{name:'WarehouseHost',methods:[{name:'getState',rtype:'promise'},
   {name:'minimize',rtype:'promise'},{name:'addListener',rtype:'callback'},{name:'removeListener',rtype:'promise'}]}],
  async nativePromise(plugin,method,options){
   trace.bridgeCalls.push(record('bridge-call',{plugin,method,options}));
   if(plugin!=='WarehouseHost')throw Error(`Unexpected native plugin: ${plugin}`);
   if(method==='getState'){await stateGate;record('host-snapshot',{geometry:geometry()});return structuredClone(state);}
   if(method==='minimize')return {};
   if(method==='removeListener'){listeners.delete(options.callbackId);return {};}
   throw Error(`Unexpected native promise method: ${method}`);
  },
  nativeCallback(plugin,method,options,callback){
   trace.bridgeCalls.push(record('bridge-call',{plugin,method,options}));
   if(plugin!=='WarehouseHost'||method!=='addListener')throw Error(`Unexpected native callback: ${plugin}.${method}`);
   const id=String(++nextListener);listeners.set(id,{event:options.eventName,callback});return id;
  },
 };
 const captureStrips=canvas=>{
  const width=canvas.width,height=canvas.height,strip=Math.min(24,Math.floor(width/8));
  return [{name:'left',x:0,y:0,w:strip,h:height},{name:'right',x:width-strip,y:0,w:strip,h:height},{name:'top',x:strip,y:0,w:width-strip*2,h:12},{name:'bottom',x:strip,y:height-12,w:width-strip*2,h:12}].map(rect=>{
   const surface=document.createElement('canvas');surface.width=rect.w;surface.height=rect.h;
   surface.getContext('2d').drawImage(canvas,rect.x,rect.y,rect.w,rect.h,0,0,rect.w,rect.h);
   return {...rect,png:surface.toDataURL('image/png')};
  });
 };
 window.__ANDROID_HOST_TEST__={
  trace,status,geometry,ready:()=>ready,failed:()=>launchFailed,pendingVisual:()=>pendingVisual,
  releaseHost(){record('release-host');releaseHost?.();},
  mark(label){record('sample',{label,geometry:geometry(),status:status()});},
  pendingFrames:()=>pendingFrames.size,
  storageSnapshot:()=>JSON.stringify([...storage.entries()].sort()),
  emitHost(patch){state={...state,...patch,launchGeneration:state.launchGeneration+1};pendingVisual=0;record('host-change',{geometry:geometry()});for(const listener of listeners.values())if(listener.event==='state')listener.callback(structuredClone(state));},
  visualCallback(id=pendingVisual){
   const request=visualRequests.get(id),accepted=Boolean(request&&id===pendingVisual&&!ready&&!launchFailed&&usable()&&sameGeometry(request.expected));
   if(accepted){ready=true;pendingVisual=0;trace.firstReveal={frame:request.frame,callbackFrame:frameNumber,time:performance.now(),generation:state.launchGeneration,png:document.querySelector('#game').toDataURL('image/png')};}
   trace.visualCallbacks.push(record('simulated-visual-callback',{id,accepted,expected:request?.expected,geometry:geometry()}));return accepted;
  },
  async advanceFrames(count=1){
   for(let i=0;i<count;i++)await new Promise((resolve,reject)=>nativeFrame(now=>{
    try{
     const batch=[...pendingFrames];pendingFrames.clear();frameNumber++;
     currentFrame={number:frameNumber,nativeTimestamp:now,callbacks:batch.length,texts:[],labels:[],images:[],draws:[],glyphs:[],statusBefore:status(),readyBefore:ready,geometry:geometry()};
     for(const [,callback]of batch)callback(now);
     const canvas=document.querySelector('#game'),ctx=canvas.getContext('2d');
     currentFrame.statusAfter=status();currentFrame.readyAfter=ready;currentFrame.backgroundStrips=captureStrips(canvas);
     currentFrame.decodedImages=trace.images.filter(image=>image.status==='loaded').map(image=>image.path);
     currentFrame.glyphs=currentFrame.glyphs.map(({text,rect,pixels})=>{
      const final=ctx.getImageData(rect.x,rect.y,rect.w,rect.h).data;
      const visible=pixels.filter(([i,r,g,b])=>Math.abs(final[i]-r)+Math.abs(final[i+1]-g)+Math.abs(final[i+2]-b)<=12).length;
      return {text,rect,changedPixels:pixels.length,visibleRatio:visible/Math.max(1,pixels.length)};
     });
     trace.frames.push(currentFrame);record('frame-complete',{callbacks:batch.length,texts:currentFrame.texts.length,draws:currentFrame.draws.length,geometry:geometry(),status:status()});
     if(!trace.firstFrame&&currentFrame.texts.length)trace.firstFrame={...currentFrame,png:canvas.toDataURL('image/png')};
     currentFrame=null;resolve();
    }catch(error){currentFrame=null;reject(error);}
   }));
  },
 };
 record('harness-installed',{geometry:geometry()});
}

const pngBytes=value=>Buffer.from(value.split(',')[1],'base64');
async function stateOf(page){
 const result=await page.evaluate(()=>{
  const t=window.__ANDROID_HOST_TEST__;
  return {...t.status(),pendingFrames:t.pendingFrames(),ready:t.ready(),failed:t.failed(),pendingVisual:t.pendingVisual(),geometry:t.geometry(),...t.trace,storageSnapshot:t.storageSnapshot()};
 });
 for(const frame of [...result.frames,...(result.firstFrame?[result.firstFrame]:[])])frame.backgroundStrips=frame.backgroundStrips.map(({png,...rect})=>({...rect,sha256:hash(pngBytes(png))}));
 return result;
}
const step=(page,count=1)=>page.evaluate(count=>window.__ANDROID_HOST_TEST__.advanceFrames(count),count);
const mark=(page,label)=>page.evaluate(label=>window.__ANDROID_HOST_TEST__.mark(label),label);
const waitFrames=page=>page.waitForFunction(()=>window.__ANDROID_HOST_TEST__.pendingFrames()>0&&getComputedStyle(document.querySelector('#startup-status')).display==='none',null,{polling:20,timeout:15000});
const waitImages=(page,status,paths=allImages)=>page.waitForFunction(({status,paths})=>paths.every(path=>window.__ANDROID_HOST_TEST__.trace.images.some(item=>item.status===status&&item.path===path)),{status,paths},{polling:20,timeout:15000});
const noLoadingText=trace=>!trace.frames.some(frame=>frame.texts.some(text=>/启动检查|正在加载|已加载\s*\d+|画面资源加载失败|重试加载|准备预览/.test(text)));
const visibleText=(frame,text)=>frame?.glyphs.some(glyph=>glyph.text===text&&glyph.changedPixels>=3&&glyph.visibleRatio>=.75);
const completeMenu=frame=>['WAREHOUSE  /  LAST SLOT','入库模式','出库模式','商店','设置'].every(text=>visibleText(frame,text));
const drawsPath=(frame,path)=>frame.images.some(source=>source===`https://localhost/${path}`);
const stripSignature=frame=>JSON.stringify(frame.backgroundStrips);
function stableMenus(state,from,message){
 const frames=state.frames.filter(frame=>frame.number>=from);
 check(frames.length>=3,`${message}: need a continuous sequence, not one screenshot`);
 check(frames.every(frame=>frame.callbacks>0&&completeMenu(frame)),`${message}: every painted frame must retain complete visible menu controls`);
 check(frames.every(frame=>stripSignature(frame)===stripSignature(frames[0])),`${message}: background strip pixels changed`);
 check(noLoadingText(state),`${message}: loading UI appeared`);
 return frames.map(frame=>({frame:frame.number,generation:frame.geometry.native.launchGeneration,ready:frame.readyAfter,backgroundStrips:frame.backgroundStrips}));
}
async function screenshot(page,name){
 const path=resolve(out,name);await page.screenshot({path,animations:'allow'});
 receipt.screenshots.push({path:relative(resolve('.'),path),sha256:hash(await readFile(path)),capture:'Underlying Chromium DOM and Canvas; no native splash simulated as pixels'});return path;
}
async function saveCanvas(frame,name){
 const path=resolve(out,name);await writeFile(path,pngBytes(frame.png));
 receipt.screenshots.push({path:relative(resolve('.'),path),sha256:hash(await readFile(path)),capture:'Exact Canvas pixels at recorded frame completion'});return path;
}
async function samePixels(first,second,background){
 const {loadImage,createCanvas}=require('@napi-rs/canvas');
 const images=await Promise.all([first,second].map(path=>loadImage(path)));
 if(images[0].width!==images[1].width||images[0].height!==images[1].height)return false;
 const pixels=images.map(image=>{const canvas=createCanvas(image.width,image.height),ctx=canvas.getContext('2d');ctx.fillStyle=background;ctx.fillRect(0,0,image.width,image.height);ctx.drawImage(image,0,0);return Buffer.from(ctx.getImageData(0,0,image.width,image.height).data);});
 // Canvas PNGs retain intentional transparent scenery gaps. Compare their actual
 // CSS-backdrop composite; one channel value tolerates compositor alpha rounding.
 return pixels[0].every((value,index)=>Math.abs(value-pixels[1][index])<=1);
}
async function tapText(page,text){
 const state=await stateOf(page),label=state.frames.at(-1).labels.find(label=>label.text===text);
 check(label,`Missing tap target ${text}`);await page.mouse.click(label.x,label.y-3);await step(page);
}
async function reveal(page){
 check(await page.evaluate(()=>window.__ANDROID_HOST_TEST__.visualCallback()),'Current simulated visual callback must acknowledge readiness');
 check((await stateOf(page)).ready,'WarehouseLaunch.isReady must become true only after callback');
}
async function newScenario(name,options={}){
 const context=await browser.newContext({viewport,deviceScaleFactor:1,ignoreHTTPSErrors:false});
 const page=await context.newPage(),errors=[],consoleErrors=[],requests=[],heldRoutes=new Map();
 let holdPNGs=Boolean(options.holdPNGs),allowedPNGs=new Set(),releaseApp,appHeld;
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
  let body;
  try{body=await readFile(absolute);}catch(error){
   if(error.code!=='ENOENT')throw error;
   requests.push({path,status:404,reason:'File absent from staged package'});await route.fulfill({status:404,contentType:'text/plain',body:'Not found'});return;
  }
  const entry={path,sha256:hash(body),requestedAt:new Date().toISOString()};requests.push(entry);
  const fulfill=()=>{entry.fulfilledAt=new Date().toISOString();return route.fulfill({status:200,contentType,body});};
  if(path==='app.js'&&options.holdApp){releaseApp=fulfill;appHeld();return;}
  if(extname(path)==='.png'&&options.failPNGs){entry.injection='Intentional HTTP 503 for every PNG';await route.fulfill({status:503,contentType:'text/plain',body:'Injected image failure'});return;}
  if(extname(path)==='.png'&&holdPNGs&&!allowedPNGs.has(path)){entry.delayed=true;heldRoutes.set(path,fulfill);return;}
  await fulfill();
 });
 await page.goto('https://localhost/',{waitUntil:options.holdApp?'commit':'domcontentloaded',timeout:15000});
 if(options.holdApp)await page.waitForSelector('#startup-status',{state:'attached'});
 let captured;
 const capture=async()=>{
  if(captured)return captured;
  const state=await stateOf(page);delete state.firstFrame?.png;delete state.firstReveal?.png;
  receipt.scenarios.push({name,options,errors,consoleErrors,requests,state});captured=state;return state;
 };
 const scenario={page,requests,capture,
  async releaseApp(){await appGate;return releaseApp();},
  async waitPNG(path=startupImages[0]){for(let count=0;count<750&&!heldRoutes.has(path);count++)await new Promise(resolve=>setTimeout(resolve,20));check(heldRoutes.has(path),`No held PNG request was observed for ${path}`);},
  async releasePNGs(paths){
   if(paths)allowedPNGs=new Set([...allowedPNGs,...paths]);else holdPNGs=false;
   const released=[...heldRoutes].filter(([path])=>!paths||paths.includes(path));
   for(const [path]of released)heldRoutes.delete(path);
   await Promise.all(released.map(([,release])=>release()));
  },
  async finish(){
   const state=await capture();
   if(!options.missingStorage&&!options.invalidStorage&&!options.invalidHost&&!options.missingCapability&&!options.missingLaunch&&!options.paintFailure)check(state.statusWrites.every(write=>write.hidden&&write.display==='none'&&write.text===''),'Every normal-bootstrap status write must remain empty and invisible');
   check(errors.length===0,`${name} unexpected pageerror: ${JSON.stringify(errors)}`);
   check(requests.every(request=>!request.rejected),`${name} attempted unexpected external request`);
   await context.close();liveScenarios.delete(scenario);
  },
 };
 liveScenarios.add(scenario);return scenario;
}

try {
 await mkdir(out,{recursive:true});
 const inputs=['index.html','app.js','build-manifest.json','SHA256SUMS',...allImages];
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
 check(htmlState.bridgeCalls.length===0&&!htmlState.ready,'Held app.js must not have run or revealed');
 await screenshot(htmlOnly.page,'00-underlying-html-before-app.png');passed('html-before-app-is-silent');
 await htmlOnly.releaseApp();await htmlOnly.page.waitForLoadState('domcontentloaded');await htmlOnly.finish();

 const cold=await newScenario('held-required-art-then-stable-real-menu',{holdHost:true,holdPNGs:true}),page=cold.page;
 await page.waitForFunction(()=>window.__ANDROID_HOST_TEST__.trace.bridgeCalls.some(call=>call.method==='getState'),null,{polling:20});
 const initial=await stateOf(page);
 check(initial.hidden&&initial.display==='none'&&initial.text==='','Native/storage readiness must remain silent until host resolves');
 check(initial.storageCalls.length===0&&initial.pendingFrames===0&&!initial.ready,'Unready host must not open storage, schedule gameplay or reveal');
 await mark(page,'native-host-held');await step(page,2);passed('native-readiness-before-storage');
 await page.evaluate(()=>window.__ANDROID_HOST_TEST__.releaseHost());await cold.waitPNG();
 await mark(page,'required-pngs-held');await step(page,3);
 const held=await stateOf(page);
 check(held.storageCalls.some(call=>call.method==='listKeys'),'Storage/account readiness must precede startup artwork');
 check(!held.ready&&held.pendingVisual===0&&held.images.length===0&&!held.firstFrame,'Held required PNGs must produce neither a game frame nor a reveal request');
 check(cold.requests.filter(request=>request.path.endsWith('.png')).every(request=>startupImages.includes(request.path)),'Shared optional PNGs must not delay/precede required artwork');
 passed('required-pngs-held-no-reveal',{sampledFrames:held.frames.length,launchRequests:held.launchCalls.length});
 // A real browser pointer begins while the simulated native cover is still up.
 await page.mouse.move(355.5,743);await page.mouse.down();
 await cold.releasePNGs(startupImages);await waitImages(page,'loaded',startupImages);await waitFrames(page);await mark(page,'required-pngs-decoded');await step(page);
 const first=await stateOf(page),frame=first.firstFrame;
 check(completeMenu(frame),'First painted frame must contain every visible menu heading/control');
 check(startupImages.every(path=>frame.decodedImages.includes(path)&&drawsPath(frame,path)),'First painted menu must draw both decoded required PNGs');
 check(frame.decodedImages.length===startupImages.length,'Only the two required startup images may be decoded before first frame in held test');
 check(!first.ready&&first.pendingVisual>0,'A complete JS frame requests a visual callback; it does not itself reveal');
 check(first.hidden&&first.display==='none'&&noLoadingText(first),'No normal loading or retry UI may be painted');
 const firstCanvas=await saveCanvas(frame,'01-first-complete-png-canvas.png');
 const firstRendered=await screenshot(page,'02-underlying-first-complete-png-frame.png');
 const domBackground=await page.evaluate(()=>getComputedStyle(document.body).backgroundColor);
 check(await samePixels(firstCanvas,firstRendered,domBackground),'Chromium pixels must match the Canvas composited over its actual CSS backdrop, with no DOM status overlay');
 passed('required-pngs-first-complete-frame',{frame:frame.number,decodedPNGs:frame.decodedImages,draws:frame.draws,pixelComparison:'CSS-backdrop composite, maximum per-channel difference 1',domBackground});
 passed('computed-status-display-none',{computedDisplay:first.display});
 await reveal(page);await step(page,3);
 const revealed=await stateOf(page);check(revealed.firstReveal.frame===frame.number,'The current callback must reveal the submitted complete frame');
 passed('current-visual-callback-reveals',{generation:revealed.firstReveal.generation,simulated:true});
 await page.mouse.up();await step(page);
 const released=await stateOf(page);
 check(completeMenu(released.frames.at(-1))&&released.storageSnapshot===first.storageSnapshot,'Pre-reveal pointer release must not navigate or change saves');
 check(released.pointers.some(event=>event.name==='pointerup'&&event.ready&&event.blocked),'The early gesture release must remain blocked across simulated reveal');
 passed('pre-ready-pointer-release-does-not-act',{nativeTouchDispatch:'NOT RUN; capture-phase simulation only'});
 for(const path of backgroundImages){
  await cold.waitPNG(path);await cold.releasePNGs([path]);await waitImages(page,'loaded',[path]);
  await mark(page,`shared-image-decoded:${path}`);await step(page,2);
 }
 await waitImages(page,'loaded');await step(page,3);
 const warm=await stateOf(page),continuity=stableMenus(warm,frame.number,'Normal startup through shared image completion');
 check(warm.frames.filter(item=>item.number>=frame.number&&item.texts.length).every(item=>startupImages.every(path=>drawsPath(item,path))),'Required art must remain selected on every subsequent menu frame');
 await screenshot(page,'03-stable-menu-after-shared-images.png');passed('continuous-menu-background-stable',{frames:continuity});
 await tapText(page,'设置');const settings=await stateOf(page);
 check(visibleText(settings.frames.at(-1),'游玩设置'),'Fresh input must open Settings after reveal');passed('cold-input-works');
 const writes=settings.statusWrites.length;
 await page.evaluate(()=>window.__ANDROID_HOST_TEST__.emitHost({active:false}));
 check((await stateOf(page)).pendingFrames===0,'Backgrounding must cancel the game frame queue');
 await page.evaluate(()=>window.__ANDROID_HOST_TEST__.emitHost({active:true}));await step(page,2);
 const resumed=await stateOf(page);
 check(resumed.ready&&resumed.display==='none'&&!resumed.statusWrites.slice(writes).some(write=>write.display!=='none'),'Resume must not resurrect a loading surface');
 check(visibleText(resumed.frames.at(-1),'游玩设置'),'Resume must retain the actual current screen');
 passed('foreground-resume-keeps-current-screen');await cold.finish();

 const stale=await newScenario('stale-visual-callback-geometry-generation',{holdPNGs:true});
 await stale.waitPNG();await stale.releasePNGs(startupImages);await waitFrames(stale.page);await step(stale.page);
 const original=await stateOf(stale.page),oldRequest=original.pendingVisual;
 check(oldRequest>0&&!original.ready,'Geometry race needs an unrevealed completed frame');
 await stale.page.evaluate(()=>{
  window.__ANDROID_HOST_TEST__.emitHost({insetsPx:{top:24,right:0,bottom:0,left:0}});
  window.__ANDROID_HOST_TEST__.emitHost({insetsPx:{top:0,right:0,bottom:0,left:0}});
 });
 check(!await stale.page.evaluate(id=>window.__ANDROID_HOST_TEST__.visualCallback(id),oldRequest),'A stale callback must be rejected even after dimensions return to the original values');
 check(!(await stateOf(stale.page)).ready,'Stale callback must not reveal');
 await step(stale.page,2);const current=await stateOf(stale.page);
 check(current.pendingVisual>oldRequest&&current.geometry.native.launchGeneration>original.geometry.native.launchGeneration,'JS must re-submit a rendered current-generation frame');
 check(current.launchCalls.some(call=>call.type==='frame-ready'&&call.accepted&&call.expected.launchGeneration===current.geometry.native.launchGeneration),'Current geometry must be serialized in frameReady');
 check(completeMenu(current.frames.at(-1)),'Current geometry must paint a complete menu');await reveal(stale.page);await step(stale.page,2);
 passed('stale-geometry-callback-rejected',{oldGeneration:original.geometry.native.launchGeneration,currentGeneration:current.geometry.native.launchGeneration,simulated:true});await stale.finish();

 const failure=await newScenario('every-png-http-error',{failPNGs:true});await waitFrames(failure.page);await waitImages(failure.page,'error');await step(failure.page);
 const failed=await stateOf(failure.page);
 check(completeMenu(failed.firstFrame)&&failed.display==='none'&&noLoadingText(failed),'HTTP image errors must produce a complete fallback menu');
 const firstImageError=failed.images.find(event=>event.status==='error'),readyRequest=failed.launchCalls.find(call=>call.type==='frame-ready');
 check(readyRequest.time-firstImageError.time<3500,'Immediate HTTP errors must settle before the real 4 s deadline');
 check(!failed.firstFrame.images.length,'All failed PNGs must use fallback artwork');
 await reveal(failure.page);await step(failure.page,3);stableMenus(await stateOf(failure.page),failed.firstFrame.number,'HTTP-error fallback');
 await tapText(failure.page,'设置');check(visibleText((await stateOf(failure.page)).frames.at(-1),'游玩设置'),'Fallback must remain interactive');
 await screenshot(failure.page,'04-settings-after-png-errors.png');passed('all-png-errors-settle-without-deadline-delay',{failedPNGs:failed.images.length,afterFirstImageErrorMs:readyRequest.time-firstImageError.time});await failure.finish();

 for(const partial of [false,true]){
  const timeout=await newScenario(partial?'absolute-deadline-after-partial-decode':'held-png-deadline-then-late-arrival',{holdPNGs:true});
  await timeout.waitPNG();await mark(timeout.page,'art-deadline-start-observation');
  const start=await timeout.page.evaluate(()=>performance.now());
  if(partial){
   // Exercise one shared, absolute production deadline rather than 4 s per image.
   await timeout.page.waitForTimeout(2200);await timeout.releasePNGs([startupImages[0]]);
   await waitImages(timeout.page,'loaded',[startupImages[0]]);await timeout.waitPNG(startupImages[1]);
  }
  await step(timeout.page,2);check(!(await stateOf(timeout.page)).ready,'Pending initial art must remain unrevealed before deadline');
  await waitFrames(timeout.page);await mark(timeout.page,'art-deadline-settled');await step(timeout.page);
  const beforeLate=await stateOf(timeout.page),timeoutFrame=beforeLate.firstFrame;
  const deadlineElapsed=beforeLate.launchCalls.find(call=>call.type==='frame-ready').time-start;
  check(deadlineElapsed>=3300&&deadlineElapsed<6000,'Initial preparation must settle near its one absolute 4 s deadline, never an extra deadline per sequential image');
  check(completeMenu(timeoutFrame)&&!beforeLate.ready,'Deadline fallback must be complete before requesting simulated reveal');
  check(!drawsPath(timeoutFrame,startupImages[1]),'Unresolved required forklift must use a fixed fallback');
  check(drawsPath(timeoutFrame,startupImages[0])===partial,'Only the scene actually decoded before the deadline may be selected');
  await reveal(timeout.page);await step(timeout.page,3);
  const latePath=partial?startupImages[1]:startupImages[0];
  await timeout.releasePNGs([latePath]);await waitImages(timeout.page,'loaded',[latePath]);await mark(timeout.page,'late-required-png-decoded');await step(timeout.page,3);
  for(const path of backgroundImages){
   await timeout.waitPNG(path);await timeout.releasePNGs([path]);await waitImages(timeout.page,'loaded',[path]);
   await mark(timeout.page,`shared-image-decoded:${path}`);await step(timeout.page,2);
  }
  await step(timeout.page,3);
  const afterLate=await stateOf(timeout.page),sequence=stableMenus(afterLate,timeoutFrame.number,'Deadline fallback through late onload');
  check(afterLate.frames.filter(item=>item.number>=timeoutFrame.number&&item.texts.length).every(item=>!drawsPath(item,startupImages[1])&&drawsPath(item,startupImages[0])===partial),'Late required PNG onload must never replace the frozen initial fallback');
  check(afterLate.images.some(event=>event.path===latePath&&event.status==='loaded'&&event.time>timeoutFrame.nativeTimestamp),'The late PNG must truly decode after fallback was chosen');
  await screenshot(timeout.page,partial?'06-partial-timeout-after-late-onload.png':'05-timeout-after-late-onload.png');
  passed(partial?'partial-timeout-uses-absolute-deadline':'timeout-fallback-is-final',{observedDeadlineMs:deadlineElapsed,latePath,frames:sequence});await timeout.finish();
 }

 const fast=await newScenario('fast-required-art');await waitFrames(fast.page);await waitImages(fast.page,'loaded');await step(fast.page);
 const fastState=await stateOf(fast.page);
 check(completeMenu(fastState.firstFrame)&&startupImages.every(path=>drawsPath(fastState.firstFrame,path))&&fastState.display==='none','Fast startup must paint the complete PNG menu on its first eligible callback');
 check(!fastState.ready&&fastState.pendingVisual>0&&noLoadingText(fastState),'Fast startup still requires a callback and has no loading UI');
 await reveal(fast.page);await step(fast.page,3);stableMenus(await stateOf(fast.page),fastState.firstFrame.number,'Fast startup');
 await screenshot(fast.page,'07-fast-first-menu.png');passed('fast-assets-first-frame');await fast.finish();

 const paint=await newScenario('actual-canvas-render-exception',{paintFailure:true});await waitFrames(paint.page);await step(paint.page);
 const paintState=await stateOf(paint.page);
 check(!paintState.hidden&&paintState.display!=='none'&&paintState.text.includes('Injected actual Canvas rendering failure'),'A genuine JS render failure must remain visibly reported');
 check(paintState.failed&&!paintState.ready&&paintState.pendingFrames===0&&paintState.launchCalls.some(call=>call.type==='launch-failed'),'Render failure must stop frames and notify the launch bridge without revealing gameplay');
 await screenshot(paint.page,'08-real-js-render-failure.png');passed('canvas-render-failure-displayed',{error:paintState.text});await paint.finish();

 for(const [name,options,errorText]of [
  ['missing-storage-blocked',{missingStorage:true},'Android 本地存储或保存宿主未就绪'],
  ['invalid-storage-response-blocked',{invalidStorage:true},'Android storage: INVALID_RESPONSE'],
  ['invalid-native-state-blocked',{invalidHost:true},'Android 宿主 state 无效'],
  ['missing-native-capability-blocked',{missingCapability:true},'Android WebView 缺少所需能力 pointer capture'],
  ['missing-launch-bridge-blocked',{missingLaunch:true},'Android 启动画面桥未就绪'],
 ]){
  const scenario=await newScenario(name,options);
  await scenario.page.waitForFunction(()=>document.querySelector('#startup-status').textContent.includes('无法开始游戏'),null,{polling:20,timeout:15000});
  const blocked=await stateOf(scenario.page);
  check(!blocked.hidden&&blocked.display!=='none'&&blocked.text.includes(errorText),'Genuine bridge/capability failure must remain visibly reported');
  check(blocked.text.includes('已有存档未被清空')&&blocked.storageWrites.length===0,'Readiness failure must preserve saves without initialization writes');
  check(blocked.pendingFrames===0&&!blocked.firstFrame&&blocked.images.length===0&&!blocked.ready,'Readiness failure must not render, prepare optional images or reveal');
  if(!options.missingLaunch)check(blocked.failed&&blocked.launchCalls.some(call=>call.type==='launch-failed'),'Genuine failure must notify native launch failure handling');
  await screenshot(scenario.page,`${name}.png`);passed(name,{computedDisplay:blocked.display,error:blocked.text});await scenario.finish();
 }
 check(Object.values(receipt.cases).every(item=>item.status==='PASS'),'Every declared host scenario must pass before aggregate PASS');receipt.status='PASS';
} catch(error) {
 receipt.status=browser?'FAIL':'BLOCKED';receipt.error=error.stack??String(error);process.exitCode=1;
} finally {
 for(const scenario of liveScenarios)try{await scenario.capture();}catch(error){(receipt.captureErrors??=[]).push(String(error));}
 await browser?.close();await mkdir(out,{recursive:true});
 await writeFile(resolve(out,'host-receipt.json'),JSON.stringify(receipt,null,2)+'\n');
 console.log(JSON.stringify({status:receipt.status,assertions:receipt.assertions,cases:receipt.cases,screenshots:receipt.screenshots.length,error:receipt.error,receipt:resolve(out,'host-receipt.json')},null,2));
}
