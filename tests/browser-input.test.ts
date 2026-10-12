import test from 'node:test';
import assert from 'node:assert/strict';
import {createBrowserPlatform} from '../src/platform/browser.ts';
import {GameSession} from '../src/application/session.ts';
import {startInbound} from './helpers/session-fixtures.ts';
import {findPlayableMoves} from '../src/domain/playable.ts';
import {getTrayRects,cellCenter} from '../src/presentation/layout.ts';
test('browser normal pointer capture release preserves tap selection and places on second tap',()=>{
 const callbacks=new Map<string,(e:unknown)=>void>(),captured=new Set<number>(),storage=new Map<string,string>();
 const previous=globalThis.window;
 Object.defineProperty(globalThis,'window',{configurable:true,writable:true,value:{devicePixelRatio:1,addEventListener:()=>{},localStorage:{get length(){return storage.size;},key:(i:number)=>[...storage.keys()][i]??null,getItem:(k:string)=>storage.get(k)??null,setItem:(k:string,v:string)=>storage.set(k,v),removeItem:(k:string)=>storage.delete(k)}}});
 const canvas={width:0,height:0,getContext:()=>({}),getBoundingClientRect:()=>({left:0,top:0,width:1080,height:1920}),addEventListener:(name:string,cb:(e:unknown)=>void)=>callbacks.set(name,cb),setPointerCapture:(id:number)=>captured.add(id),hasPointerCapture:(id:number)=>captured.has(id),releasePointerCapture:(id:number)=>{captured.delete(id);callbacks.get('lostpointercapture')?.({pointerId:id});}} as unknown as HTMLCanvasElement;
 try{
  const platform=createBrowserPlatform(canvas,{status:'held',release(){this.status='busy';}}),s=new GameSession(platform,{seed:123,mode:'standard'});startInbound(s);
  platform.onPointer(event=>{if(event.type==='cancel')s.input.cancel(event.id);else s.input[event.type](event.point,event.id);});
  const event=(type:string,x:number,y:number,id=1)=>callbacks.get(type)?.({clientX:x,clientY:y,pointerId:id,preventDefault:()=>{}});
  const tray=getTrayRects(s.state.candidates.length)[0],point={x:tray.x+tray.w/2,y:tray.y+tray.h/2};
  const move=findPlayableMoves(s.state).find(move=>move.pieceId===s.state.candidates[0].id);assert.ok(move);const target=cellCenter(move.origin,s.state),before=s.state.commandIndex;
  event('pointerdown',point.x,point.y);event('pointerup',point.x,point.y);assert.equal(s.view.selectedPieceId,s.state.candidates[0].id);
  event('pointerdown',target.x,target.y);event('pointerup',target.x,target.y);assert.equal(s.state.commandIndex,before+1);
  event('pointerdown',point.x,point.y);callbacks.get('lostpointercapture')?.({pointerId:1});assert.equal(s.view.selectedPieceId,null);event('pointerup',target.x,target.y);assert.equal(s.state.commandIndex,before+1);
 }finally{Object.defineProperty(globalThis,'window',{configurable:true,writable:true,value:previous});}
});

test('browser preserves the active pointer input type',()=>{
 const previous=globalThis.window,callbacks=new Map<string,(event:unknown)=>void>(),types:unknown[]=[];
 Object.defineProperty(globalThis,'window',{configurable:true,writable:true,value:{devicePixelRatio:1,addEventListener(){}}});
 const canvas={width:0,height:0,getContext:()=>({}),getBoundingClientRect:()=>({left:0,top:0,width:1080,height:1920}),addEventListener:(name:string,cb:(event:unknown)=>void)=>callbacks.set(name,cb),setPointerCapture(){},hasPointerCapture:()=>false} as unknown as HTMLCanvasElement;
 try{const platform=createBrowserPlatform(canvas,{status:'held',release(){}});platform.onPointer(event=>types.push(event.pointerType));
  for(const pointerType of ['touch','mouse','pen'])for(const name of ['pointerdown','pointermove','pointerup'])callbacks.get(name)?.({pointerId:1,pointerType,clientX:400,clientY:1000,preventDefault(){}});
  assert.deepEqual(types,['touch','touch','touch','mouse','mouse','mouse','pen','pen','pen']);
 }finally{Object.defineProperty(globalThis,'window',{configurable:true,writable:true,value:previous});}
});

test('browser resize cancels a captured touch before the changed projection can place it',()=>{
 const previous=globalThis.window,canvasCallbacks=new Map<string,(event:unknown)=>void>(),windowCallbacks=new Map<string,(()=>void)[]>(),captured=new Set<number>(),events:unknown[]=[];
 Object.defineProperty(globalThis,'window',{configurable:true,writable:true,value:{devicePixelRatio:1,addEventListener:(name:string,cb:()=>void)=>windowCallbacks.set(name,[...windowCallbacks.get(name)??[],cb])}});
 const canvas={width:0,height:0,getContext:()=>({}),getBoundingClientRect:()=>({left:0,top:0,width:1080,height:1920}),addEventListener:(name:string,cb:(event:unknown)=>void)=>canvasCallbacks.set(name,cb),setPointerCapture:(id:number)=>captured.add(id),hasPointerCapture:(id:number)=>captured.has(id),releasePointerCapture:(id:number)=>captured.delete(id)} as unknown as HTMLCanvasElement;
 try{const platform=createBrowserPlatform(canvas,{status:'held',release(){}});platform.onPointer(event=>events.push([event.type,event.id]));
  canvasCallbacks.get('pointerdown')?.({pointerId:7,pointerType:'touch',clientX:400,clientY:1000,preventDefault(){}});
  for(const cb of windowCallbacks.get('resize')??[])cb();
  assert.deepEqual(events,[['down',7],['cancel',7]]);assert.equal(captured.size,0);
 }finally{Object.defineProperty(globalThis,'window',{configurable:true,writable:true,value:previous});}
});
