import assert from 'node:assert/strict';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve,relative,isAbsolute} from 'node:path';
import {setTimeout as pause} from 'node:timers/promises';
import {createCanvas,GlobalFonts,Image} from '@napi-rs/canvas';

/** Execute the unchanged staged Android app.js in a deterministic native-bridge
 * test double with real packaged PNG decoding and real Canvas rendering.
 * This is Node VM/Canvas evidence, NOT Chromium, CSS, Android WebView or phone
 * acceptance. HTML cover state is observed as a DOM test double, never drawn
 * as if it were an actual HTML screenshot. No production code is rewritten.
 */
const out=resolve(process.env.ANDROID_CANVAS_QA_DIR??'qa/android-v114/host-canvas');
const imageOut=resolve(process.env.ANDROID_CANVAS_IMAGE_DIR??'artifacts/android-v114-startup');
const root=resolve('build/android'),bundle=await readFile(resolve(root,'app.js'));
const hash=value=>createHash('sha256').update(value).digest('hex');
const images=['assets/static-art/scene-day.png','assets/static-art/cargo-core.png','assets/static-art/forklift-base.png','assets/static-art/frame-classic.png','assets/board-materials.png','assets/static-art/tools-core.png'];
GlobalFonts.registerFromPath('/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc','Warehouse CJK');
const report={schemaVersion:1,kind:'Exact Android bundle in Node VM with real Canvas',
 generatedAt:new Date().toISOString(),bundleSha256:hash(bundle),
 browserAcceptance:'NOT RUN',cssAcceptance:'NOT RUN',nativeAndroidAcceptance:'NOT RUN',phoneAcceptance:'NOT RUN',
 status:'RUNNING',assertions:0,cases:[],screenshots:[]};
const check=(condition,message)=>{assert.ok(condition,message);report.assertions++;};

async function makeHost({width=540,height=960,holdHost=false,holdImage=null,failImage=null,insets={top:0,right:0,bottom:0,left:0}}={}){
 let now=0,nextFrame=0,nextListener=0,frameNumber=0,currentFrame,hostRelease,hostHeld=holdHost,failed=false;
 const canvas=createCanvas(width,height),context=canvas.getContext('2d'),frames=new Map(),nativeListeners=new Map();
 const canvasEvents=new Map(),documentEvents=new Map(),windowEvents=new Map(),storage=new Map(),captures=new Set(),assetJobs=new Map();
 const trace={imageLoads:[],frames:[],coverWrites:[],bridgeCalls:[],storageWrites:[],firstReveal:null,errors:[]};
 let state={active:true,owner:true,widthPx:width,heightPx:height,insetsPx:{...insets}};
 const bind=map=>(name,callback)=>{if(!map.has(name))map.set(name,new Set());map.get(name).add(callback);};
 const unbind=map=>(name,callback)=>map.get(name)?.delete(callback);
 Object.assign(canvas,{id:'game',getBoundingClientRect:()=>({left:0,top:0,width,height}),
  addEventListener:bind(canvasEvents),removeEventListener:unbind(canvasEvents),
  setPointerCapture:id=>captures.add(id),hasPointerCapture:id=>captures.has(id),releasePointerCapture:id=>captures.delete(id)});
 for(const method of ['fillText','strokeText','drawImage']){
  const native=context[method].bind(context);
  context[method]=(...args)=>{
   if(currentFrame){if(method==='drawImage')currentFrame.images.push(typeof args[0].src==='string'?args[0].src:'(offscreen canvas)');else{currentFrame.texts.push(String(args[0]));const m=context.getTransform();currentFrame.textPositions.push({text:String(args[0]),logicalX:args[1],logicalY:args[2],clientX:m.a*args[1]+m.c*args[2]+m.e,clientY:m.b*args[1]+m.d*args[2]+m.f});}}
   return native(...args);
  };
 }
 let hidden=false,coverText='货箱最后一格\n正在启动…';
 const cover={get hidden(){return hidden;},set hidden(value){
  trace.coverWrites.push({value,time:now,frame:frameNumber});
  if(value&&!hidden&&!trace.firstReveal)trace.firstReveal={frame:frameNumber,decodedImages:trace.imageLoads.filter(row=>row.status==='loaded').map(row=>row.path),texts:[...(currentFrame?.texts??[])],drawImages:[...(currentFrame?.images??[])],png:canvas.toBuffer('image/png')};
  hidden=value;
 },get textContent(){return coverText;},set textContent(value){coverText=value;}};
 const document={hidden:false,querySelector:selector=>selector==='#game'?canvas:selector==='#startup-status'?cover:null,
  createElement:name=>{assert.equal(name,'canvas');return createCanvas(1,1);},addEventListener:bind(documentEvents),removeEventListener:unbind(documentEvents)};
 const source=Object.getOwnPropertyDescriptor(Image.prototype,'src');
 function HostImage(){
  const image=new Image();let path;
  Object.defineProperty(image,'src',{get:()=>path,set:value=>{
   path=String(value);const row={path,status:'pending'};trace.imageLoads.push(row);
   const start=async()=>{
    const onload=image.onload,onerror=image.onerror;
    try{
     const absolute=resolve(root,path),part=relative(root,absolute);
     assert.ok(!isAbsolute(path)&&part!==''&&!part.startsWith('..'),'Image path must stay inside staging');
     const bytes=await readFile(absolute);row.sha256=hash(bytes);
     if(path===failImage&&!failed){failed=true;row.injectedFailure=true;throw Error('Injected one-shot asset failure');}
     await new Promise(done=>{
      image.onload=()=>{row.status='loaded';row.width=image.width;row.height=image.height;onload?.call(image);done();};
      image.onerror=error=>{row.status='error';row.error=String(error);onerror?.call(image,error);done();};
      source.set.call(image,bytes);
     });
    }catch(error){row.status='error';row.error=String(error);onerror?.call(image,error);}
   };
   if(path===holdImage)assetJobs.set(path,start);else void start();
  }});return image;
 }
 const envelope=value=>JSON.stringify({v:1,ok:true,value});
 const nativeStorage={get:key=>envelope(storage.get(key)??null),
  set:(key,value)=>{storage.set(key,value);trace.storageWrites.push({key,method:'set'});return envelope(null);},
  remove:key=>{storage.delete(key);trace.storageWrites.push({key,method:'remove'});return envelope(null);},
  listKeys:prefix=>envelope([...storage.keys()].filter(key=>key.startsWith(prefix)).sort())};
 const Capacitor={PluginHeaders:[{name:'WarehouseHost',methods:[{name:'getState',rtype:'promise'},{name:'minimize',rtype:'promise'},{name:'addListener',rtype:'callback'},{name:'removeListener',rtype:'promise'}]}],
  async nativePromise(plugin,method,options){
   trace.bridgeCalls.push({plugin,method,options});assert.equal(plugin,'WarehouseHost');
   if(method==='getState'){if(hostHeld)await new Promise(resolve=>{hostRelease=resolve;});return structuredClone(state);}
   if(method==='removeListener'){nativeListeners.delete(options.callbackId);return {};}
   if(method==='minimize')return {};
   throw Error(`Unexpected native method: ${method}`);
  },
  nativeCallback(plugin,method,options,callback){
   trace.bridgeCalls.push({plugin,method,options});assert.equal(plugin,'WarehouseHost');assert.equal(method,'addListener');
   const id=String(++nextListener);nativeListeners.set(id,{event:options.eventName,callback});return id;
  }};
 class Audio{constructor(src){this.src=src;}addEventListener(){}play(){return Promise.resolve();}pause(){}}
 class FixedDate extends Date{static now(){return Date.parse('2026-10-12T12:00:00Z')+now;}}
 const sandbox={document,Capacitor,WarehouseStorage:nativeStorage,androidBridge:{},location:{origin:'https://localhost'},
  devicePixelRatio:1,Image:HostImage,Audio,Date:FixedDate,performance:{now:()=>now},navigator:{vibrate:()=>true},
  addEventListener:bind(windowEvents),removeEventListener:unbind(windowEvents),
  requestAnimationFrame:callback=>{const id=++nextFrame;frames.set(id,callback);return id;},cancelAnimationFrame:id=>frames.delete(id),
  console:{log(){},warn(){},error(...args){trace.errors.push(args.map(String).join(' '));}}};
 sandbox.window=sandbox;
 vm.runInNewContext(bundle.toString('utf8'),sandbox,{timeout:10000,filename:'build/android/app.js'});
 const pump=async(predicate,label)=>{
  const deadline=Date.now()+15000;
  while(!predicate()&&Date.now()<deadline)await pause(5);
  assert.ok(predicate(),`${label}; cover=${cover.textContent}; images=${JSON.stringify(trace.imageLoads)}`);
 };
 await pump(()=>trace.bridgeCalls.some(row=>row.method==='getState'),'Native getState was never reached');
 const frame=()=>{
  const batch=[...frames.values()];frames.clear();now+=16;frameNumber++;
  currentFrame={number:frameNumber,texts:[],textPositions:[],images:[],coverBefore:!cover.hidden};
  for(const callback of batch)callback(now);
  currentFrame.coverAfter=!cover.hidden;trace.frames.push(currentFrame);currentFrame=null;
 };
 const pointer=(type,x,y,id=1)=>{
  const sx=state.insetsPx.left*width/state.widthPx,sy=state.insetsPx.top*height/state.heightPx,sw=width-(state.insetsPx.left+state.insetsPx.right)*width/state.widthPx,sh=height-(state.insetsPx.top+state.insetsPx.bottom)*height/state.heightPx;
  const scale=Math.min(sw/1080,sh/1920),ox=sx+(sw-1080*scale)/2,oy=sy+(sh-1920*scale)/2;
  for(const callback of canvasEvents.get(`pointer${type}`)??[])callback({preventDefault(){},clientX:ox+x*scale,clientY:oy+y*scale,pointerId:id,pointerType:'touch'});
 };
 return {canvas,cover,trace,frame,pump,storage,viewport:{width,height},
  pendingFrames:()=>frames.size,storageSnapshot:()=>JSON.stringify([...storage.entries()].sort()),
  releaseHost(){hostHeld=false;hostRelease?.();},
  async releaseImage(){const job=assetJobs.get(holdImage);check(Boolean(job),'Delayed image must actually be pending');assetJobs.delete(holdImage);holdImage=null;await job();},
  pointer,tapClient(x,y){for(const type of ['down','up'])for(const callback of canvasEvents.get(`pointer${type}`)??[])callback({preventDefault(){},clientX:x,clientY:y,pointerId:91,pointerType:'touch'});},tap(x,y){pointer('down',x,y);pointer('up',x,y);},
  emitHost(patch){state={...state,...patch};for(const listener of nativeListeners.values())if(listener.event==='state')listener.callback(structuredClone(state));},
 };
}
const noLoadingText=host=>!host.trace.frames.some(frame=>frame.texts.some(text=>/启动检查|正在加载画面资源|已加载 \d+ \/ \d+/.test(text)));
const waitImages=host=>host.pump(()=>host.trace.imageLoads.filter(row=>row.status==='loaded').length===images.length,'Required images did not finish decoding');
async function capture(host,name,bytes=host.canvas.toBuffer('image/png')){
 const path=resolve(imageOut,name);await writeFile(path,bytes);report.screenshots.push({path:relative(resolve('.'),path),sha256:hash(bytes),viewport:host.viewport,source:'Actual unchanged Android app.js painted through @napi-rs/canvas; not a browser screenshot'});return bytes;
}
function saveCase(name,host,details={}){
 check(host.trace.errors.length===0,`${name}: unexpected host console errors`);
 const trace={...host.trace,firstReveal:host.trace.firstReveal?{...host.trace.firstReveal,png:undefined}:null};
 report.cases.push({name,status:'PASS',...details,trace});
}

await mkdir(out,{recursive:true});
await mkdir(imageOut,{recursive:true});
try{
 const delayed=await makeHost({holdHost:true,holdImage:images.at(-1)});
 check(!delayed.cover.hidden&&delayed.cover.textContent==='货箱最后一格\n正在启动…','Initial cover remains intact while native host is delayed');
 check(delayed.trace.storageWrites.length===0,'Delayed host must not write storage');
 delayed.releaseHost();
 await delayed.pump(()=>delayed.trace.imageLoads.filter(row=>row.status==='loaded').length===5,'First five images did not decode');
 await delayed.pump(()=>delayed.trace.imageLoads.some(row=>row.path===images.at(-1)&&row.status==='pending'),'Last image was not requested');
 for(let i=0;i<8;i++)delayed.frame();
 check(!delayed.cover.hidden&&delayed.cover.textContent==='货箱最后一格\n正在启动…','One delayed required image must retain the unchanged launch cover');
 check(delayed.trace.coverWrites.length===0,'Healthy pre-ready frames must never hide or rewrite the cover');
 check(noLoadingText(delayed),'Healthy startup must not draw another loading/health screen');
 delayed.pointer('down',711,1486);
 await delayed.releaseImage();await waitImages(delayed);delayed.frame();
 const reveal=delayed.trace.firstReveal;
 check(delayed.cover.hidden&&Boolean(reveal),'All-ready frame must hide the cover');
 check(images.every(path=>reveal.decodedImages.includes(path)),'Every required image must decode before reveal');
 check(reveal.texts.some(text=>text.includes('WAREHOUSE'))&&reveal.texts.includes('设置')&&reveal.drawImages.length>0,'Complete menu images and controls must paint before cover removal');
 const first=await capture(delayed,'01-first-complete-game-before-cover-hide.png',reveal.png);
 check(first.equals(delayed.canvas.toBuffer('image/png')),'No paint is missing or deferred after the hidden write');
 const saved=delayed.storageSnapshot();delayed.pointer('up',711,1486);delayed.frame();
 check(delayed.storageSnapshot()===saved,'Releasing a loading-started pointer must not mutate saves');
 check(first.equals(delayed.canvas.toBuffer('image/png')),'Releasing a loading-started pointer must not navigate or activate settings');
 await capture(delayed,'02-held-cover-touch-released-no-action.png');
 delayed.tap(711,1486);delayed.frame();
 check(delayed.trace.frames.at(-1).texts.includes('游玩设置'),'Fresh post-ready input must activate settings');
 await capture(delayed,'03-fresh-touch-opens-settings.png');
 const coverWrites=delayed.trace.coverWrites.length;
 delayed.emitHost({active:false});check(delayed.pendingFrames()===0,'Backgrounding must cancel pending render loop');
 delayed.emitHost({active:true});check(delayed.pendingFrames()===1,'Foregrounding must schedule one render loop');delayed.frame();
 check(delayed.cover.hidden&&!delayed.trace.coverWrites.slice(coverWrites).some(row=>row.value===false),'Foreground resume must not repeat launch cover');
 check(delayed.trace.frames.at(-1).texts.includes('游玩设置'),'Foreground resume redraws existing settings');
 await capture(delayed,'04-resume-existing-settings-no-cover.png');
 saveCase('delayed-native-and-asset-first-frame-input-and-resume',delayed,{htmlCover:'DOM test double only; no HTML/CSS screenshot claim'});

 const fast=await makeHost();await waitImages(fast);fast.frame();
 check(fast.cover.hidden&&fast.trace.firstReveal.frame===1,'Fast assets reveal on the first eligible frame with no fixed delay');
 check(noLoadingText(fast),'Fast startup never paints health/resource loading screen');
 await capture(fast,'05-fast-assets-first-frame.png');saveCase('fast-assets',fast);

 const failure=await makeHost({failImage:images.at(-1)});
 await failure.pump(()=>failure.trace.imageLoads.some(row=>row.status==='error'),'Injected image failure was not observed');failure.frame();
 check(failure.cover.hidden&&failure.trace.firstReveal.texts.includes('画面资源加载失败')&&failure.trace.firstReveal.texts.includes('重试加载'),'Real image loader failure must expose the painted existing retry gate');
 await capture(failure,'06-asset-failure-existing-retry-gate.png');
 failure.tap(540,1160);await waitImages(failure);failure.frame();
 check(failure.cover.hidden&&failure.trace.frames.at(-1).texts.some(text=>text.includes('WAREHOUSE')),'Retry must recover to complete menu');
 check(!failure.trace.coverWrites.some(row=>row.value===false),'Retry must not reintroduce startup cover');
 await capture(failure,'07-asset-failure-retry-recovered.png');saveCase('one-shot-real-image-failure-and-retry',failure);

 const tall=await makeHost({width:540,height:1200});await waitImages(tall);tall.frame();
 check(tall.cover.hidden&&tall.trace.firstReveal.texts.some(text=>text.includes('WAREHOUSE')),'20:9 viewport must reveal a complete frame');
 await capture(tall,'08-20x9-first-complete-menu.png');saveCase('20-to-9-first-frame',tall);
 for(const spec of [
  {name:'16x9',width:540,height:960},
  {name:'18x9',width:540,height:1080},
  {name:'20x9-insets',width:540,height:1200,insets:{top:50,right:0,bottom:40,left:0}},
  {name:'21x9-asymmetric',width:540,height:1260,insets:{top:52,right:24,bottom:30,left:12}},
  {name:'phone-photo-ratio',width:921,height:2048,insets:{top:68,right:57,bottom:28,left:57}},
  {name:'extended-hit-boundary',width:540,height:1800},
 ]){
  const host=await makeHost(spec);await waitImages(host);host.frame();
  const label=host.trace.frames.at(-1).textPositions.find(row=>row.text==='设置');
  check(Boolean(label),`${spec.name}: settings must be drawn`);
  if(spec.name==='extended-hit-boundary')check(label.logicalY>1920,'Actual drawn settings is beyond old native hit limit');
  const inset=spec.insets??{top:0,right:0,bottom:0,left:0};
  check(label.clientY>inset.top&&label.clientY<spec.height-inset.bottom,`${spec.name}: drawn target stays inside native safe height`);
  await capture(host,`matrix-${spec.name}-menu.png`);
  host.tapClient(label.clientX,label.clientY);host.frame();
  check(host.trace.frames.at(-1).texts.includes('游玩设置'),`${spec.name}: tapping actual rendered settings pixels must work through native input`);
  saveCase(`real-rendered-settings-hit-${spec.name}`,host);
 }
 report.status='PASS';
}catch(error){report.status='FAIL';report.error=error.stack??String(error);process.exitCode=1;}
finally{
 report.finalBundleSha256=hash(await readFile(resolve(root,'app.js')));
 if(report.finalBundleSha256!==report.bundleSha256){report.status='FAIL';report.error='Staged Android bundle changed during host validation';process.exitCode=1;}
 await writeFile(resolve(out,'canvas-receipt.json'),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({status:report.status,assertions:report.assertions,cases:report.cases.length,screenshots:report.screenshots.length,bundleSha256:report.bundleSha256,error:report.error,receipt:resolve(out,'canvas-receipt.json')},null,2));
}
