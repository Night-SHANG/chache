/** Native wx/Canvas harness. Executes byte-for-byte game.js, without browser or compatibility globals. */
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile, realpath} from 'node:fs/promises';
import {dirname,resolve,relative,isAbsolute} from 'node:path';
import {createHash} from 'node:crypto';
import {sourceFiles as files} from './source-files.mjs';
import {createCanvas, GlobalFonts, Image} from '@napi-rs/canvas';
import {loadAccount} from '../src/application/account-store.ts';
import {verifyAccountReferences} from '../src/application/history-store.ts';
import {L} from '../src/presentation/layout.ts';
GlobalFonts.registerFromPath('/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc','Warehouse CJK');
export const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
export async function growthSourceHash(){
 const hash=createHash('sha256');for(const path of [...await files('src'),...await files('scripts'),...await files('assets'),'package.json','package-lock.json'].sort()){hash.update(path);hash.update(await readFile(path));}return hash.digest('hex');
}
export function verifyEvidenceBinding({sourceSha256,gameJsSha256,manifestSourceSha256,expectedGameJsSha256}){
 for(const hash of [sourceSha256,gameJsSha256,manifestSourceSha256])assert.match(hash??'',/^[a-f0-9]{64}$/,'Evidence hash must be complete SHA-256');
 assert.equal(sourceSha256,manifestSourceSha256,'Built source hash differs from current source');
 if(expectedGameJsSha256!==undefined)assert.equal(gameJsSha256,expectedGameJsSha256,'Actual game.js hash differs from expected bytes');
}
export function mapPort(values){return {get:key=>values.get(key)??null,set:(key,value)=>values.set(key,value),remove:key=>values.delete(key),listKeys:prefix=>[...values.keys()].filter(key=>key.startsWith(prefix))};}
export function authoritativeAccount(values){const port=mapPort(values);return loadAccount(port,account=>verifyAccountReferences(port,account));}
export function validateResumeStorage(values){const loaded=authoritativeAccount(values);assert.equal(loaded.status,'ready',`Resume fixture account must be fully verified: ${loaded.status}/${loaded.message}`);assert.ok(loaded.account,'Resume fixture account missing');return loaded;}
/** Passive host-side audio observations. No VM or game state is read or modified. */
export function createPassiveAudioTrace(clock=()=>0){
 const events=[],handles=[];
 const create=()=>{const row={id:handles.length+1,src:'',loop:false,volume:1,play:0,pause:0,stop:0,destroy:0,errorListeners:0};handles.push(row);events.push({id:row.id,kind:'create',time:clock()});const handle={};
  for(const key of ['src','loop','volume'])Object.defineProperty(handle,key,{get:()=>row[key],set:value=>{row[key]=value;events.push({id:row.id,kind:key,value,time:clock()});},enumerable:true});
  for(const kind of ['play','pause','stop','destroy'])handle[kind]=()=>{row[kind]++;events.push({id:row.id,kind,src:row.src,time:clock()});};
  handle.onError=()=>{row.errorListeners++;events.push({id:row.id,kind:'onError',time:clock()});};return handle;
 };return {events,handles,create};
}
/** Actual native Image objects, reading only files inside the supplied package. No network or dummy pixels. */
export function createPackagedImageLoader(packageRoot,{defer=false,rejectLoads=false}={}){
 const root=resolve(packageRoot),trace=[],jobs=[],nativeSource=Object.getOwnPropertyDescriptor(Image.prototype,'src');
 const inside=(base,target)=>{const part=relative(base,target);return part!==''&&!part.startsWith(`..${process.platform==='win32'?'\\':'/'}`)&&part!=='..'&&!isAbsolute(part);};
 const create=()=>{
  const image=new Image();let requested='';
  Object.defineProperty(image,'src',{configurable:false,get:()=>requested,set:value=>{
   const source=String(value),row={source,status:'pending'};requested=source;trace.push(row);let started;
   const start=()=>started??=(async()=>{
    const onload=image.onload,onerror=image.onerror;let finished=false;
    const fail=error=>{if(finished)return;finished=true;row.status='error';row.error=String(error);if(typeof onerror==='function')onerror.call(image,error);};
    try{
     assert.ok(source&&!isAbsolute(source)&&!source.includes('\\')&&!/^[a-z][a-z0-9+.-]*:/i.test(source),'Images must use local relative package paths');
     const path=resolve(root,source);assert.ok(inside(root,path),'Image path escapes package');const [canonicalRoot,canonicalPath]=await Promise.all([realpath(root),realpath(path)]);assert.ok(inside(canonicalRoot,canonicalPath),'Image symlink escapes package');
     const bytes=await readFile(canonicalPath);row.sha256=sha256(bytes);row.bytes=bytes.length;
     if(rejectLoads){row.injectedFailure=true;throw Error('Injected packaged image load failure');}
     await new Promise(done=>{
      image.onload=()=>{if(finished)return;finished=true;row.status='loaded';row.width=image.width;row.height=image.height;try{if(typeof onload==='function')onload.call(image);}finally{done();}};
      image.onerror=error=>{try{fail(error);}finally{done();}};
      try{nativeSource.set.call(image,bytes);}catch(error){try{fail(error);}finally{done();}}
     });
    }catch(error){fail(error);}
   })();jobs.push(start);if(!defer)void start();
  }});return image;
 };
 const settle=async()=>{for(let index=0;index<jobs.length;index++)await jobs[index]();await Promise.resolve();await Promise.resolve();return trace;};
 return {create,settle,trace};
}
export async function createGrowthHost({audioFactory,vibrate,width=540,height=960,safeTop=0,dpr=1,storage=new Map(),epoch=Date.parse('2026-10-06T12:00:00Z'),bundlePath='build/wechat/game.js',limitBytes=16*1024*1024,faults={},deferImageLoads=false,rejectImageLoads=false,rejectOffscreenCanvases=false}={}){
 const bytes=await readFile(bundlePath);let now=0,canvas,canvasCount=0,io=0;const callbacks={},frames=[],labels=[],forklifts=[],operations=[],canvasObservers=[],surfaceRefs=[];
 const audioTrace=createPassiveAudioTrace(()=>now);
 const imageLoader=createPackagedImageLoader(dirname(resolve(bundlePath)),{defer:deferImageLoads,rejectLoads:rejectImageLoads});
 const usage=()=>[...storage.values()].reduce((sum,value)=>sum+Buffer.byteLength(value),0);
 const ioCall=(kind,key,action)=>{operations.push({kind,key,time:now,index:++io});faults.before?.({kind,key,index:io,storage});const result=action();faults.after?.({kind,key,index:io,storage});return result;};
 let ctx;
 const wx={
  createCanvas:()=>{canvasCount++;if(canvas){if(rejectOffscreenCanvases)throw Error('Injected unavailable offscreen canvas');const surface=createCanvas(1,1);surfaceRefs.push({id:canvasCount,ref:new WeakRef(surface)});for(const observer of canvasObservers)observer(surface,canvasCount);return surface;}canvas=createCanvas(width,height);ctx=canvas.getContext('2d');const fill=ctx.fillText.bind(ctx),ellipse=ctx.ellipse.bind(ctx);
   ctx.fillText=(text,x,y,...rest)=>{const m=ctx.getTransform(),measure=ctx.measureText(String(text)),points=[[x-measure.actualBoundingBoxLeft,y-measure.actualBoundingBoxAscent],[x+measure.actualBoundingBoxRight,y+measure.actualBoundingBoxDescent]].map(([px,py])=>({x:m.a*px+m.c*py+m.e,y:m.b*px+m.d*py+m.f}));labels.push({text:String(text),x:m.a*x+m.c*y+m.e,y:m.b*x+m.d*y+m.f,logicalX:x,logicalY:y,font:ctx.font,align:ctx.textAlign,alpha:ctx.globalAlpha,bounds:{left:Math.min(...points.map(p=>p.x)),right:Math.max(...points.map(p=>p.x)),top:Math.min(...points.map(p=>p.y)),bottom:Math.max(...points.map(p=>p.y))}});return fill(text,x,y,...rest);};
   ctx.ellipse=(x,y,rx,ry,rotation,start,end,...rest)=>{if(x===0&&y===7&&rx===57&&ry===39&&rotation===0&&start===0&&Math.abs(end-Math.PI*2)<1e-8){const m=ctx.getTransform();forklifts.push({a:m.a,b:m.b,c:m.c,d:m.d,e:m.e,f:m.f,alpha:ctx.globalAlpha});}return ellipse(x,y,rx,ry,rotation,start,end,...rest);};return canvas;},
  getWindowInfo:()=>({windowWidth:width,windowHeight:height,pixelRatio:dpr,safeArea:{left:0,top:safeTop,width,height:height-safeTop}}),
  getStorageSync:key=>ioCall('get',key,()=>storage.get(key)??''),
  setStorageSync:(key,value)=>ioCall('set',key,()=>{const previous=storage.get(key);storage.set(key,value);if(usage()>limitBytes){if(previous===undefined)storage.delete(key);else storage.set(key,previous);throw Error('Injected native storage quota');}}),
  removeStorageSync:key=>ioCall('remove',key,()=>storage.delete(key)),
  getStorageInfoSync:()=>ioCall('capacity','',()=>({keys:[...storage.keys()],currentSize:usage()/1024,limitSize:limitBytes/1024})),
  onTouchStart:cb=>callbacks.down=cb,onTouchMove:cb=>callbacks.move=cb,onTouchEnd:cb=>callbacks.up=cb,onTouchCancel:cb=>callbacks.cancel=cb,
  onHide:cb=>callbacks.hide=cb,onShow:cb=>callbacks.show=cb,onWindowResize:cb=>callbacks.resize=cb,
  createInnerAudioContext:audioFactory??audioTrace.create,createImage:imageLoader.create,
  ...(vibrate?{vibrateShort:vibrate}:{}),
 };
 class Clock extends Date{static now(){return epoch+now;}}
 // Node vm supplies language intrinsics only. No structuredClone, TextEncoder, DOM, Buffer, process, or require.
 const sandbox={wx,Date:Clock,console,requestAnimationFrame:fn=>{frames.push(fn);return frames.length;},performance:{now:()=>now}};
 vm.runInNewContext(bytes.toString('utf8'),sandbox,{timeout:5000,filename:bundlePath});
 assert.equal(canvasCount,1,'Actual game must create one screen canvas');
 for(const key of ['down','move','up','cancel','hide','show'])assert.equal(typeof callbacks[key],'function',`Actual host callback missing: ${key}`);
 assert.ok(frames.length,'Actual game must schedule a frame');
 const scale=Math.min(width/L.width,(height-safeTop)/L.height),ox=(width-L.width*scale)/2,oy=safeTop+(height-safeTop-L.height*scale)/2;
 const pointer=(type,x,y,id=1)=>callbacks[type]({changedTouches:[{identifier:id,clientX:ox+x*scale,clientY:oy+y*scale}]});
 const frame=(time=now+16)=>{assert.ok(time>=now,'Host clock must be monotonic');now=time;labels.length=0;forklifts.length=0;const cb=frames.shift();assert.ok(cb,'Actual frame callback missing');cb(time);};
 return {storage,callbacks,operations,faults,labels,forklifts,audioTrace,canvasObservers,get surfaceInfo(){return surfaceRefs.map(({id,ref})=>{const surface=ref.deref();return {id,width:surface?.width??0,height:surface?.height??0};});},imageTrace:imageLoader.trace,settleImages:imageLoader.settle,viewport:{w:width,h:height,safe:safeTop,dpr},gameJsSha256:sha256(bytes),extraGlobals:[],get time(){return now;},get canvas(){return canvas;},get canvasCount(){return canvasCount;},get context(){return ctx;},frame,pointer,tap:(x,y)=>{pointer('down',x,y);pointer('up',x,y);},drag:(from,to)=>{pointer('down',from.x,from.y);pointer('move',to.x,to.y);pointer('up',to.x,to.y);},account:()=>authoritativeAccount(storage),usage,get limitBytes(){return limitBytes;},set limitBytes(value){limitBytes=value;}};
}
export async function probeBuiltHost(options={}){try{const host=await createGrowthHost(options);host.frame(0);assert.ok(host.labels.length,'Actual canvas frame must contain text');return {status:'PASS',executedChecks:1,canvasCount:host.canvasCount,extraGlobals:host.extraGlobals,gameJsSha256:host.gameJsSha256};}catch(error){return {status:'FAIL',executedChecks:0,error:String(error)};}}
export function assertVisibleGlyphs(host,label){
 const {w,h,safe,dpr}=host.viewport,errors=host.labels.filter(item=>item.alpha>0.05&&(item.bounds.left<-.75||item.bounds.right>w*dpr+.75||item.bounds.top<safe*dpr-.75||item.bounds.bottom>h*dpr+.75));
 assert.deepEqual(errors,[],`${label}: actual glyph bounds escape safe canvas`);return host.labels.length;
}
