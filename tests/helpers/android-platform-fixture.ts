import {createAndroidPlatform} from '../../src/platform/android.ts';
import type {NativeHostState} from '../../src/platform/android-viewport.ts';
import type {WriterLease} from '../../src/platform/writer-lease.ts';
import type {Rect} from '../../src/presentation/layout.ts';
export const androidHost:NativeHostState={active:true,owner:true,widthPx:1080,heightPx:2400,insetsPx:{top:100,right:0,bottom:80,left:0}};
export class AndroidAudio {
 src:string;loop=false;volume=1;currentTime=0;plays=0;pauses=0;audible=false;failPause=false;error=()=>{};
 constructor(src:string){this.src=src;}
 play(){this.plays++;this.audible=true;return Promise.resolve();}
 pause(){this.pauses++;this.audible=false;if(this.failPause)throw Error('pause unavailable');}
 addEventListener(name:string,callback:()=>void){if(name==='error')this.error=callback;}
}
export function androidFixture(options:{dpr?:number;rect?:Rect;host?:NativeHostState;useHomeBounds?:()=>boolean}={}){
 const previous=['window','document','Audio','navigator'].map(name=>[name,Object.getOwnPropertyDescriptor(globalThis,name)] as const);
 const events=new Map<string,((event:unknown)=>void)[]>(),captured=new Set<number>(),audio:AndroidAudio[]=[],transforms:number[][]=[],fills:number[][]=[],store=new Map<string,string>();
 let rect=options.rect??{x:0,y:0,w:1080,h:2400};
 const bind=(name:string,callback:(event:unknown)=>void)=>events.set(name,[...events.get(name)??[],callback]);
 const emit=(name:string,event:unknown={})=>{for(const callback of events.get(name)??[])callback(event);};
 const ctx={setTransform:(...args:number[])=>transforms.push(args),fillStyle:'',fillRect:(...args:number[])=>fills.push(args)};
 const canvas={width:0,height:0,getContext:()=>ctx,getBoundingClientRect:()=>({left:rect.x,top:rect.y,width:rect.w,height:rect.h}),addEventListener:bind,setPointerCapture:(id:number)=>captured.add(id),hasPointerCapture:(id:number)=>captured.has(id),releasePointerCapture:(id:number)=>{captured.delete(id);emit('lostpointercapture',{pointerId:id});}} as unknown as HTMLCanvasElement;
 Object.defineProperty(globalThis,'window',{configurable:true,value:{devicePixelRatio:options.dpr??1,addEventListener:bind,requestAnimationFrame:()=>1}});
 Object.defineProperty(globalThis,'document',{configurable:true,value:{createElement:()=>({width:0,height:0,getContext:()=>({})})}});
 Object.defineProperty(globalThis,'Audio',{configurable:true,value:function(src:string){const item=new AndroidAudio(src);audio.push(item);return item;}});
 let vibrations=0;Object.defineProperty(globalThis,'navigator',{configurable:true,value:{vibrate:()=>{vibrations++;return true;}}});
 const storage={get:(key:string)=>store.get(key)??null,set:(key:string,value:string)=>{store.set(key,value);},remove:(key:string)=>{store.delete(key);},listKeys:(prefix:string)=>[...store.keys()].filter(key=>key.startsWith(prefix)).sort()};
 const lease:WriterLease={status:'held',release(){this.status='busy';}};
 const adapter=createAndroidPlatform(canvas,storage,lease,options.host??androidHost,{useHomeBounds:options.useHomeBounds});
 return {...adapter,canvas,storage,lease,audio,captured,transforms,fills,emit,get vibrations(){return vibrations;},setRect:(next:Rect)=>{rect=next;},pointer:(type:string,x:number,y:number,id=1)=>emit(type,{clientX:x,clientY:y,pointerId:id,preventDefault:()=>{}}),restore:()=>{for(const [name,descriptor] of previous){if(descriptor)Object.defineProperty(globalThis,name,descriptor);else Reflect.deleteProperty(globalThis,name);}}};
}
