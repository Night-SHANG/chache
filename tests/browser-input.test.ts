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
