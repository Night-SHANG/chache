import test from 'node:test';
import assert from 'node:assert/strict';
import {createBrowserPlatform} from '../src/platform/browser.ts';
import {GameSession} from '../src/application/session.ts';
test('browser normal pointer capture release preserves tap selection and places on second tap',()=>{
 const callbacks=new Map<string,(e:unknown)=>void>(),captured=new Set<number>(),storage=new Map<string,string>();
 const previous=globalThis.window;
 Object.defineProperty(globalThis,'window',{configurable:true,writable:true,value:{devicePixelRatio:1,addEventListener:()=>{},localStorage:{getItem:(k:string)=>storage.get(k)??null,setItem:(k:string,v:string)=>storage.set(k,v),removeItem:(k:string)=>storage.delete(k)}}});
 const canvas={width:0,height:0,getContext:()=>({}),getBoundingClientRect:()=>({left:0,top:0,width:1080,height:1920}),addEventListener:(name:string,cb:(e:unknown)=>void)=>callbacks.set(name,cb),setPointerCapture:(id:number)=>captured.add(id),hasPointerCapture:(id:number)=>captured.has(id),releasePointerCapture:(id:number)=>{captured.delete(id);callbacks.get('lostpointercapture')?.({pointerId:id});}} as unknown as HTMLCanvasElement;
 try{
  const platform=createBrowserPlatform(canvas),s=new GameSession(platform,{seed:123,mode:'tutorial'});
  platform.onPointer(event=>{if(event.type==='cancel')s.input.cancel(event.id);else s.input[event.type](event.point,event.id);});
  const event=(type:string,x:number,y:number,id=1)=>callbacks.get(type)?.({clientX:x,clientY:y,pointerId:id,preventDefault:()=>{}});
  event('pointerdown',206,1666);event('pointerup',206,1666);assert.equal(s.view.selectedPieceId,s.state.candidates[0].id);
  event('pointerdown',300,740);event('pointerup',300,740);assert.equal(s.state.commandIndex,1);
  event('pointerdown',540,1666);callbacks.get('lostpointercapture')?.({pointerId:1});assert.equal(s.view.selectedPieceId,null);event('pointerup',540,740);assert.equal(s.state.commandIndex,1);
 }finally{Object.defineProperty(globalThis,'window',{configurable:true,writable:true,value:previous});}
});
