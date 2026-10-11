import {androidFixture,androidHost} from './android-platform-fixture.ts';
import type {NativeHostState} from '../../src/platform/android-viewport.ts';
import type {NativeStorageBridge} from '../../src/platform/android-storage.ts';
import type {AndroidHostPlugin} from '../../src/platform/android-host.ts';

export function nativeHostFixture(initial:NativeHostState=androidHost){
 const events=new Map<string,((value:unknown)=>void)[]>();let state=structuredClone(initial),removed=0,minimized=0;const order:string[]=[];
 const plugin:AndroidHostPlugin={async getState(){order.push('getState');return state;},async minimize(){minimized++;},async addListener(name,callback){order.push(name);events.set(name,[...events.get(name)??[],callback]);return {async remove(){removed++;events.set(name,(events.get(name)??[]).filter(item=>item!==callback));}};}};
 return {plugin,order,get removed(){return removed;},get minimized(){return minimized;},emit:(name:string,value:unknown={})=>{for(const callback of events.get(name)??[])callback(value);},setState:(next:NativeHostState)=>{state=structuredClone(next);for(const callback of events.get('state')??[])callback(next);}};
}
export function androidSessionFixture(){
 const fixture=androidFixture(),docEvents=new Map<string,(()=>void)[]>(),frames=new Map<number,FrameRequestCallback>(),allFrames=new Map<number,FrameRequestCallback>(),cancelled:number[]=[];let hidden=false,nextFrameId=0;const locationBefore=Object.getOwnPropertyDescriptor(globalThis,'location'),imageBefore=Object.getOwnPropertyDescriptor(globalThis,'Image');
 const visibility={get hidden(){return hidden;},addEventListener(name:string,callback:()=>void){docEvents.set(name,[...docEvents.get(name)??[],callback]);},removeEventListener(name:string,callback:()=>void){docEvents.set(name,(docEvents.get(name)??[]).filter(item=>item!==callback));}};
 Object.assign(window,{location:{origin:'https://localhost'},requestAnimationFrame:(callback:FrameRequestCallback)=>{const id=++nextFrameId;frames.set(id,callback);allFrames.set(id,callback);return id;},cancelAnimationFrame:(id:number)=>{cancelled.push(id);frames.delete(id);}});
 Object.defineProperty(globalThis,'location',{configurable:true,value:{origin:'https://localhost'}});Object.defineProperty(globalThis,'Image',{configurable:true,value:class {}});
 const writes:string[]=[],values=new Map<string,string>();const ok=(value:unknown)=>JSON.stringify({v:1,ok:true,value});
 const bridge:NativeStorageBridge={get:key=>ok(values.get(key)??null),set:(key,value)=>{writes.push(key);values.set(key,value);return ok(null);},remove:key=>{writes.push(key);values.delete(key);return ok(null);},listKeys:prefix=>ok([...values.keys()].filter(key=>key.startsWith(prefix)).sort())};
 return {...fixture,bridge,writes,values,visibility,setHidden:(value:boolean)=>{hidden=value;for(const callback of docEvents.get('visibilitychange')??[])callback();},get pendingFrames(){return frames.size;},get requestedFrames(){return nextFrameId;},cancelledFrames:cancelled,fireFrame:(id:number,now=0)=>{frames.delete(id);allFrames.get(id)?.(now);},nextFrame:(now=0)=>{const callbacks=[...frames.values()];frames.clear();for(const callback of callbacks)callback(now);},restore:()=>{fixture.restore();for(const [name,descriptor] of [['location',locationBefore],['Image',imageBefore]] as const){if(descriptor)Object.defineProperty(globalThis,name,descriptor);else Reflect.deleteProperty(globalThis,name);}}};
}
