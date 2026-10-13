/** Portable exact-bundle hosts: real PNG/Canvas, simulated DOM/wx/native bridge.
 * No production source rewriting, diagnostic globals, test-only entry, or device claims.
 */
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile,realpath} from 'node:fs/promises';
import {dirname,resolve,relative,isAbsolute} from 'node:path';
import {createCanvas,Image} from '@napi-rs/canvas';
import {authoritativeAccount,sha256} from './growth-host-support.mjs';
import {attachPixelWitness} from './refinement-host-support.mjs';

export async function createV116TransitionHost({target,bundlePath,storage=new Map(),width=540,height=960,rejectImageLoads=()=>false,holdNativeState=false,initialGeometryReady=true,holdLaunchVisual=false}={}) {
 const bytes=await readFile(bundlePath),root=await realpath(dirname(resolve(bundlePath)));
 const canvas=createCanvas(width,height),context=canvas.getContext('2d'),labels=[],draws=[],imageTrace=[],jobs=[],frames=new Map(),events=new Map(),nativeListeners=new Map(),operations=[],audioTrace=[];
 let now=0,frameId=0,listenerId=0,canvasCount=target==='wechat'?0:1,hidden=false;
 const callbacks={},captures=new Set(),coverWrites=[],launchTrace=[],timers=new Map(),swallowed=new Set();let timerId=0,launchReady=false;let coverHidden=true,coverText='';
 const cover={get hidden(){return coverHidden;},set hidden(value){coverHidden=value;coverWrites.push({hidden:coverHidden,text:coverText});},get textContent(){return coverText;},set textContent(value){coverText=value;coverWrites.push({hidden:coverHidden,text:coverText});}};
 let releaseNativeState;const nativeStateBarrier=new Promise(resolve=>{releaseNativeState=resolve;});
 let state={launchGeneration:1,active:true,owner:true,widthPx:initialGeometryReady?width:0,heightPx:initialGeometryReady?height:0,insetsPx:{top:0,right:0,bottom:0,left:0}};
 const bind=(scope,name,fn)=>{const key=`${scope}:${name}`;if(!events.has(key))events.set(key,new Set());events.get(key).add(fn);};
 const unbind=(scope,name,fn)=>events.get(`${scope}:${name}`)?.delete(fn);
 const emit=(scope,name,event={})=>{for(const fn of events.get(`${scope}:${name}`)??[])fn(event);};
 const fill=context.fillText.bind(context),draw=context.drawImage.bind(context);
 context.fillText=(value,x,y,...rest)=>{labels.push({text:String(value),logicalX:x,logicalY:y});return fill(value,x,y,...rest);};
 context.drawImage=(image,...args)=>{assert.ok(image instanceof Image,'Production must draw packaged native images, not offscreen canvases');draws.push({source:image.src,args});return draw(image,...args);};
 const source=Object.getOwnPropertyDescriptor(Image.prototype,'src');
 function HostImage(){
  const image=new Image();let requested='';
  Object.defineProperty(image,'src',{get:()=>requested,set:value=>{
   requested=String(value);const row={source:requested,status:'pending'};imageTrace.push(row);
   jobs.push({row,async run(){
    const loaded=image.onload,failed=image.onerror;
    try{
     assert.ok(requested&&!isAbsolute(requested)&&!requested.includes('\\')&&!/^[a-z][a-z0-9+.-]*:/i.test(requested),'Only local packaged image URLs are allowed');
     const path=await realpath(resolve(root,requested)),part=relative(root,path);assert.ok(part&&!part.startsWith('..')&&!isAbsolute(part),'Packaged image must not escape its package');
     const data=await readFile(path);row.sha256=sha256(data);row.bytes=data.length;
     if(rejectImageLoads(requested)){row.injectedFailure=true;throw Error('Injected one-shot packaged image failure');}
     await new Promise(done=>{
      image.onload=()=>{row.status='loaded';row.width=image.width;row.height=image.height;loaded?.call(image);done();};
      image.onerror=error=>{row.status='error';row.error=String(error);failed?.call(image,error);done();};
      source.set.call(image,data);
     });
    }catch(error){row.status='error';row.error=String(error);failed?.call(image,error);}
   }});
  }});return image;
 }
 const get=key=>storage.get(key)??null,set=(key,value)=>{operations.push({kind:'set',key,time:now});storage.set(key,value);},remove=key=>{operations.push({kind:'remove',key,time:now});storage.delete(key);};
 const localStorage={get length(){return storage.size;},key:index=>[...storage.keys()][index]??null,getItem:get,setItem:set,removeItem:remove};
 const envelope=value=>JSON.stringify({v:1,ok:true,value});
 const WarehouseStorage={get:key=>envelope(get(key)),set:(key,value)=>{set(key,value);return envelope(null);},remove:key=>{remove(key);return envelope(null);},listKeys:prefix=>envelope([...storage.keys()].filter(key=>key.startsWith(prefix)).sort())};
 const audio=(src='')=>{const row={src,plays:0};audioTrace.push(row);return Object.assign(row,{play(){row.plays++;return target==='wechat'?undefined:Promise.resolve();},pause(){},stop(){},destroy(){},onError(){},addEventListener(){}});};
 function Audio(src){return audio(src);}
 const requestAnimationFrame=fn=>{frames.set(++frameId,fn);return frameId;};
 const cancelAnimationFrame=id=>frames.delete(id);
 Object.assign(canvas,{getBoundingClientRect:()=>({left:0,top:0,width,height}),addEventListener:(name,fn)=>bind('canvas',name,fn),removeEventListener:(name,fn)=>unbind('canvas',name,fn),setPointerCapture:id=>captures.add(id),hasPointerCapture:id=>captures.has(id),releasePointerCapture:id=>captures.delete(id)});
 const document={querySelector:selector=>selector==='#game'?canvas:selector==='#startup-status'?cover:null,get hidden(){return hidden;},addEventListener:(name,fn)=>bind('document',name,fn),removeEventListener:(name,fn)=>unbind('document',name,fn),createElement(){canvasCount++;throw Error('Offscreen surfaces are not allowed');}};
 const Capacitor={PluginHeaders:[{name:'WarehouseHost',methods:[{name:'getState',rtype:'promise'},{name:'minimize',rtype:'promise'},{name:'addListener',rtype:'callback'},{name:'removeListener',rtype:'promise'}]}],
  async nativePromise(plugin,method,options){assert.equal(plugin,'WarehouseHost');if(method==='getState'){if(holdNativeState)await nativeStateBarrier;return JSON.parse(JSON.stringify(state));}if(method==='removeListener'){nativeListeners.delete(options.callbackId);return {};}if(method==='minimize')return {};throw Error(`Unexpected native method ${method}`);},
  nativeCallback(plugin,method,options,callback){assert.equal(plugin,'WarehouseHost');assert.equal(method,'addListener');const id=String(++listenerId);nativeListeners.set(id,{event:options.eventName,callback});return id;}};
 const wx={createCanvas(){canvasCount++;assert.equal(canvasCount,1,'Only the screen canvas may be created');return canvas;},getWindowInfo:()=>({windowWidth:width,windowHeight:height,pixelRatio:1}),getStorageSync:key=>get(key)??'',setStorageSync:set,removeStorageSync:remove,getStorageInfoSync:()=>({keys:[...storage.keys()],currentSize:0,limitSize:16384}),createImage:HostImage,createInnerAudioContext:()=>audio(),onWindowResize:fn=>callbacks.resize=fn};
 for(const [name,type] of [['onTouchStart','down'],['onTouchMove','move'],['onTouchEnd','up'],['onTouchCancel','cancel'],['onHide','hide'],['onShow','show']])wx[name]=fn=>callbacks[type]=fn;
 class Clock extends Date{static now(){return Date.parse('2026-10-13T12:00:00Z')+now;}}
 const sandbox={Date:Clock,console,performance:{now:()=>now},requestAnimationFrame,cancelAnimationFrame,setTimeout:(fn,delay)=>{const id=++timerId;timers.set(id,{fn,delay});return id;},clearTimeout:id=>timers.delete(id)};
 if(target==='android')sandbox.WarehouseLaunch={isReady:()=>launchReady,frameReady(value){launchTrace.push({kind:'rendered-frame',state:JSON.parse(value),labels:labels.map(row=>row.text),time:now});if(!holdLaunchVisual){launchReady=true;launchTrace.push({kind:'visual-ready',time:now});}},failed(message){launchTrace.push({kind:'failure',message,time:now});launchReady=true;}};
 if(target==='wechat')sandbox.wx=wx;
 else Object.assign(sandbox,{document,Capacitor,WarehouseStorage,androidBridge:{},location:{origin:'https://localhost',search:''},devicePixelRatio:1,localStorage,Image:HostImage,Audio,URLSearchParams,navigator:{locks:{request:async(_name,_options,fn)=>fn({name:'warehouse.account.s1.writer'})},vibrate:()=>true},addEventListener:(name,fn)=>bind('window',name,fn),removeEventListener:(name,fn)=>unbind('window',name,fn)});
 if(target!=='wechat')sandbox.window=sandbox;
 vm.runInNewContext(bytes.toString('utf8'),sandbox,{timeout:10000,filename:bundlePath});
 const flush=async()=>{for(let n=0;n<40;n++)await Promise.resolve();};await flush();if(!holdNativeState&&target!=='android')assert.ok(frames.size,'Exact bundle must schedule a frame');
 const scale=Math.min(width/1080,height/1920),ox=(width-1080*scale)/2,oy=(height-1920*scale)/2;
 const pointer=(type,x,y,id=1)=>{if(target==='android'&&(!launchReady||swallowed.has(id))){if(type==='down')swallowed.add(id);if(type==='up'||type==='cancel')swallowed.delete(id);return;}const point={identifier:id,clientX:ox+x*scale,clientY:oy+y*scale};if(target==='wechat')callbacks[type]({changedTouches:[point]});else emit('canvas',`pointer${type}`,{...point,pointerId:id,pointerType:'touch',preventDefault(){}});};
 const emitHost=active=>{state={...state,active};for(const listener of nativeListeners.values())if(listener.event==='state')listener.callback(JSON.parse(JSON.stringify(state)));};
 const host={canvas,context,storage,labels,draws,imageTrace,operations,audioTrace,cover,coverWrites,launchTrace,get launchReady(){return launchReady;},get pendingFrames(){return frames.size;},releaseLaunch(){launchReady=true;launchTrace.push({kind:'visual-ready',time:now});},expireStartupArt(){for(const [id,timer]of [...timers]){timers.delete(id);timer.fn();}},releaseNativeState,releaseGeometry(){state={...state,widthPx:width,heightPx:height};for(const listener of nativeListeners.values())if(listener.event==='state')listener.callback(JSON.parse(JSON.stringify(state)));},viewport:{w:width,h:height,safe:0,dpr:1},gameJsSha256:sha256(bytes),get time(){return now;},get canvasCount(){return canvasCount;},pendingImages:()=>jobs.map(job=>job.row.source),flush,
  frame(){labels.length=0;draws.length=0;now+=16;const pending=[...frames.values()];frames.clear();for(const fn of pending)fn(now);return {texts:labels.map(row=>row.text),draws:[...draws],cover:target==='android'&&!cover.hidden};},
  pointer,tap(x,y){pointer('down',x,y);pointer('up',x,y);},account:()=>authoritativeAccount(storage),storageSnapshot:()=>JSON.stringify([...storage].sort()),
  async decodeNext(){const job=jobs.shift();assert.ok(job,'Expected an actual pending PNG decode');await job.run();await flush();return {...job.row};},
  callbacks:{hide(){hidden=true;if(target==='wechat')callbacks.hide();else if(target==='android')emitHost(false);else emit('document','visibilitychange');},show(){hidden=false;if(target==='wechat')callbacks.show();else if(target==='android')emitHost(true);else emit('document','visibilitychange');}},
 };
 return attachPixelWitness(host);
}
