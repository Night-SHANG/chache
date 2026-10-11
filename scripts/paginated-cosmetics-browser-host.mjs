/** Executes the untouched production app.js in a DOM-event/native-Canvas host, not a real browser. */
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {createCanvas} from '@napi-rs/canvas';
import {authoritativeAccount,createPackagedImageLoader,sha256} from './growth-host-support.mjs';
export async function createPaginatedBrowserHost({audioFactory,bundlePath,storage=new Map(),width=320,height=720,dpr=2,epoch=Date.parse('2026-10-09T12:00:00Z')}={}){
 const bytes=await readFile(bundlePath),canvas=createCanvas(width,height),context=canvas.getContext('2d'),callbacks={},listeners={},frames=[],labels=[],operations=[],canvasObservers=[],captures=new Set();let now=0,hidden=false,surfaces=1;
 const loader=createPackagedImageLoader(dirname(resolve(bundlePath)),{defer:true});
 const fill=context.fillText.bind(context);context.fillText=(text,x,y,...rest)=>{const m=context.getTransform(),a=context.measureText(String(text));labels.push({text:String(text),logicalX:x,logicalY:y,alpha:context.globalAlpha,bounds:{left:m.a*(x-a.actualBoundingBoxLeft)+m.e,right:m.a*(x+a.actualBoundingBoxRight)+m.e,top:m.d*(y-a.actualBoundingBoxAscent)+m.f,bottom:m.d*(y+a.actualBoundingBoxDescent)+m.f}});return fill(text,x,y,...rest);};
 const add=(target,name,fn)=>(target[name]??=[]).push(fn),emit=(target,name,event={})=>{for(const fn of target[name]??[])fn(event);};
 canvas.getBoundingClientRect=()=>({left:0,top:0,width,height});canvas.addEventListener=(name,fn)=>add(listeners,name,fn);canvas.setPointerCapture=id=>captures.add(id);canvas.hasPointerCapture=id=>captures.has(id);canvas.releasePointerCapture=id=>captures.delete(id);
 const store={get length(){return storage.size;},key:index=>[...storage.keys()][index]??null,getItem:key=>{operations.push({kind:'get',key,time:now});return storage.get(key)??null;},setItem:(key,value)=>{operations.push({kind:'set',key,time:now});storage.set(key,value);},removeItem:key=>{operations.push({kind:'remove',key,time:now});storage.delete(key);}};
 const window={devicePixelRatio:dpr,location:{search:''},localStorage:store,requestAnimationFrame:fn=>frames.push(fn),addEventListener:(name,fn)=>add(callbacks,name,fn)};
 const document={querySelector:selector=>selector==='#game'?canvas:null,get hidden(){return hidden;},addEventListener:(name,fn)=>add(callbacks,name,fn),createElement:tag=>{assert.equal(tag,'canvas');const surface=createCanvas(1,1);for(const observe of canvasObservers)observe(surface,++surfaces);return surface;}};
 class Clock extends Date{static now(){return epoch+now;}}
 class Audio{constructor(src){if(audioFactory)return audioFactory(src);this.src=src;}play(){return Promise.resolve();}pause(){}addEventListener(){}}
 function Image(){return loader.create();}
 vm.runInNewContext(bytes.toString('utf8'),{window,document,navigator:{locks:{request:async(_name,_options,fn)=>fn({name:'warehouse.account.s1.writer'})}},Date:Clock,performance:{now:()=>now},Image,Audio,URLSearchParams,console},{timeout:5000,filename:bundlePath});
 for(let n=0;n<12&&!frames.length;n++)await Promise.resolve();assert.ok(frames.length,'Original browser startup scheduled a frame');
 const scale=Math.min(width/1080,height/1920),ox=(width-1080*scale)/2,oy=(height-1920*scale)/2;
 const pointer=(type,x,y,id=1)=>emit(listeners,`pointer${type}`,{pointerId:id,clientX:ox+x*scale,clientY:oy+y*scale,preventDefault(){}});
 const wheel=(x,y,deltaY,options={})=>{let prevented=false;emit(listeners,'wheel',{clientX:ox+x*scale,clientY:oy+y*scale,deltaY,deltaMode:0,ctrlKey:false,...options,preventDefault(){prevented=true;}});return prevented;};
 const frame=(time=now+16)=>{assert.ok(time>=now);now=time;labels.length=0;const callback=frames.shift();assert.ok(callback);callback(now);};
 return {canvas,context,storage,labels,operations,canvasObservers,viewport:{w:width,h:height,safe:0,dpr},imageTrace:loader.trace,settleImages:loader.settle,gameJsSha256:sha256(bytes),browserJsSha256:sha256(bytes),get time(){return now;},frame,pointer,wheel,tap:(x,y)=>{pointer('down',x,y);pointer('up',x,y);},account:()=>authoritativeAccount(storage),callbacks:{hide:()=>{hidden=true;emit(callbacks,'visibilitychange');},show:()=>{hidden=false;emit(callbacks,'visibilitychange');}},extraGlobals:[],kind:'Unmodified app.js DOM-event host simulation; not physical browser evidence'};
}
