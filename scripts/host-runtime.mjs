import {createCanvas,GlobalFonts} from '@napi-rs/canvas';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {decodeRun,saveKeysFor} from '../src/application/save.ts';
import {isRunSlot} from '../src/application/run-slots.ts';
import {L} from '../src/presentation/layout.ts';
GlobalFonts.registerFromPath('/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc','Warehouse CJK');
const code=await readFile('build/wechat/game.js','utf8');
export function createHost(width=540,height=960,storage=new Map(),safeTop=0,dpr=1,epoch=Date.parse('2026-10-05T12:00:00.000Z')){
 let now=0;const callbacks={};const frames=[];let canvas;let canvasCount=0;const sounds=[];const audioEvents=[];
 const wx={
  createCanvas:()=>{canvasCount++;canvas=createCanvas(width,height);return canvas;},
  getWindowInfo:()=>({windowWidth:width,windowHeight:height,pixelRatio:dpr,safeArea:{left:0,top:safeTop,width,height:height-safeTop}}),
  getStorageSync:key=>storage.get(key)||'',setStorageSync:(key,value)=>storage.set(key,value),removeStorageSync:key=>storage.delete(key),
  onTouchStart:cb=>callbacks.down=cb,onTouchMove:cb=>callbacks.move=cb,onTouchEnd:cb=>callbacks.up=cb,onTouchCancel:cb=>callbacks.cancel=cb,
  onHide:cb=>callbacks.hide=cb,onShow:cb=>callbacks.show=cb,onWindowResize:()=>{},
  createInnerAudioContext:()=>{const audio={src:'',volume:1,play:()=>{sounds.push(now);audioEvents.push({type:'play',src:audio.src,time:now});},stop:()=>{audioEvents.push({type:'stop',src:audio.src,time:now});},destroy:()=>{},onError:()=>{}};return audio;},createImage:()=>{throw Error('No external raster images expected');},
 };
 class Clock extends Date {static now(){return epoch+now;}}
 vm.runInNewContext(code,{wx,Date:Clock,console,requestAnimationFrame:fn=>{frames.push(fn);return frames.length;},performance:{now:()=>now}},{timeout:5000,filename:'build/wechat/game.js'});
 const scale=Math.min(width/L.width,(height-safeTop)/L.height),ox=(width-L.width*scale)/2,oy=safeTop+(height-safeTop-L.height*scale)/2;
 const pointer=(type,x,y,id=1)=>callbacks[type]({changedTouches:[{identifier:id,clientX:ox+x*scale,clientY:oy+y*scale}]});
 const frame=(time=now+16)=>{now=time;const cb=frames.shift();assert.ok(cb,'animation frame queued');cb(time);};
 return {storage,sounds,audioEvents,callbacks,pointer,frame,get canvas(){return canvas;},get canvasCount(){return canvasCount;},snapshot:()=>decodeRun(storage.get(saveKeysFor(isRunSlot(storage.get('warehouse.active-mode.v1'))?storage.get('warehouse.active-mode.v1'):'orders').main)),tap:(x,y)=>{pointer('down',x,y);pointer('up',x,y);},drag:(from,to)=>{pointer('down',from.x,from.y);pointer('move',to.x,to.y);pointer('up',to.x,to.y);}};
}
