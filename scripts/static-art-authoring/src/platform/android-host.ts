import {handleAndroidBack} from './android-back.ts';
import {createAndroidStorage,type NativeStorageBridge} from './android-storage.ts';
import type {NativeHostState} from './android-viewport.ts';
import type {WriterLease} from './writer-lease.ts';

interface ListenerHandle {remove():Promise<void>}
export interface AndroidHostPlugin {
 getState():Promise<NativeHostState>;
 minimize():Promise<void>;
 addListener(name:'state'|'backButton',callback:(value:unknown)=>void):Promise<ListenerHandle>;
}
export interface AndroidHostConnection {
 readonly state:NativeHostState;
 subscribe(callback:(state:NativeHostState)=>void):()=>void;
 onBack(callback:()=>void):()=>void;
 minimize():Promise<void>;
 disconnect():Promise<void>;
}
export interface AndroidVisibility {
 readonly hidden:boolean;
 addEventListener(name:'visibilitychange',callback:()=>void):void;
 removeEventListener(name:'visibilitychange',callback:()=>void):void;
}
const inactive=():NativeHostState=>({active:false,owner:false,widthPx:0,heightPx:0,insetsPx:{top:0,right:0,bottom:0,left:0}});
const copy=(state:NativeHostState):NativeHostState=>({...state,insetsPx:{...state.insetsPx}});
function decodeState(value:unknown):NativeHostState {
 if(!value||typeof value!=='object')throw Error('Android 宿主 state 无效');
 const state=value as NativeHostState,insets=state.insetsPx;
 if(typeof state.active!=='boolean'||typeof state.owner!=='boolean'||![state.widthPx,state.heightPx].every(number=>Number.isFinite(number)&&number>=0)||!insets||![insets.top,insets.right,insets.bottom,insets.left].every(number=>Number.isFinite(number)&&number>=0))throw Error('Android 宿主 state 无效');
 if(state.widthPx>0&&state.heightPx>0&&(insets.left+insets.right>=state.widthPx||insets.top+insets.bottom>=state.heightPx))throw Error('Android 宿主安全区无效');
 return copy(state);
}

/** Subscribe first; a delayed snapshot can never overwrite a newer lifecycle/ownership event. */
export async function connectAndroidHost(plugin?:AndroidHostPlugin):Promise<AndroidHostConnection> {
 if(!plugin){const {Capacitor,registerPlugin}=await import('@capacitor/core');if(Capacitor.getPlatform()!=='android')throw Error('请通过 Android 应用启动游戏');plugin=registerPlugin<AndroidHostPlugin>('WarehouseHost');}
 const native=plugin,subscribers=new Set<(state:NativeHostState)=>void>(),backHandles=new Set<()=>Promise<void>>();let state=inactive(),revision=0,invalid=false,disconnected=false;
 const listener=await native.addListener('state',value=>{
  if(disconnected)return;revision++;
  try{if(!invalid)state=decodeState(value);}catch{invalid=true;state=inactive();}
  for(const callback of subscribers)callback(copy(state));
 });
 try{const before=revision,snapshot=await native.getState();if(revision===before)state=decodeState(snapshot);}
 catch(error){await listener.remove();throw error;}
 return {
  get state(){return copy(state);},
  subscribe(callback){subscribers.add(callback);return ()=>{subscribers.delete(callback);};},
  onBack(callback){
   if(disconnected)return ()=>{};
   let removed=false,removal:Promise<void>|undefined;const handle=native.addListener('backButton',()=>{if(!removed&&!disconnected)callback();});
   const remove=():Promise<void>=>{removed=true;return removal??=handle.then(value=>value.remove()).catch(()=>{}).finally(()=>{backHandles.delete(remove);});};
   backHandles.add(remove);return ()=>{void remove();};
  },
  minimize:()=>native.minimize(),
  async disconnect(){if(disconnected)return;disconnected=true;subscribers.clear();await listener.remove();await Promise.all([...backHandles].map(remove=>remove()));backHandles.clear();},
 };
}

/** Test actual WebView primitives before touching any save or creating a GameSession. */
export function assertAndroidCapabilities(canvas:HTMLCanvasElement):void {
 if(window.location?.origin!=='https://localhost')throw Error('Android 页面来源不可信，未打开存档');
 const checks:[string,boolean][]=[['Promise',typeof Promise==='function'],['Map',typeof Map==='function'],['Set',typeof Set==='function'],['Object.fromEntries',typeof Object.fromEntries==='function'],['Array.flat',typeof Array.prototype.flat==='function'],['Array.flatMap',typeof Array.prototype.flatMap==='function'],['Number.isFinite',typeof Number.isFinite==='function'],['requestAnimationFrame',typeof window.requestAnimationFrame==='function'],['cancelAnimationFrame',typeof window.cancelAnimationFrame==='function'],['performance.now',typeof performance?.now==='function'],['Image',typeof Image==='function'],['pointer capture',typeof canvas.setPointerCapture==='function'&&typeof canvas.releasePointerCapture==='function'&&typeof canvas.hasPointerCapture==='function']];
 const missing=checks.find(([,present])=>!present);if(missing)throw Error(`Android WebView 缺少所需能力 ${missing[0]}，请更新系统 WebView`);
 if(!canvas.getContext('2d'))throw Error('Android 无法创建 2D 画布');
}
const canvasRect=(canvas:HTMLCanvasElement)=>{const rect=canvas.getBoundingClientRect();return {x:rect.left,y:rect.top,w:rect.width,h:rect.height};};
async function waitGeometry(canvas:HTMLCanvasElement,host:AndroidHostConnection,validate:(rect:ReturnType<typeof canvasRect>,state:NativeHostState)=>unknown):Promise<void> {
 for(;;){const state=host.state,rect=canvasRect(canvas);
  // Zero dimensions are the native "waiting for measured Insets" signal, never a capability failure.
  if(state.widthPx>0&&state.heightPx>0&&rect.w>0&&rect.h>0){validate(rect,state);return;}
  await new Promise<void>(resolve=>window.requestAnimationFrame(()=>resolve()));
 }
}

/** Android-only wiring: storage/account rules remain the existing synchronous GameSession. */
export async function startAndroidSession(canvas:HTMLCanvasElement,host:AndroidHostConnection,bridge:NativeStorageBridge|undefined,visibility:AndroidVisibility=document) {
 assertAndroidCapabilities(canvas);
 const [{GameSession},{createAndroidPlatform},{computeAndroidViewport}]=await Promise.all([import('../application/session.ts'),import('./android.ts'),import('./android-viewport.ts')]);
 await waitGeometry(canvas,host,computeAndroidViewport);
 const initial=host.state;if(!bridge||!initial.owner)throw Error('Android 本地存储或保存宿主未就绪，未打开游戏；已有存档未被清空');
 const storage=createAndroidStorage(bridge);
 // Missing is not an error. A protocol/read failure must be found before account initialization writes.
 const keys=storage.listKeys!('warehouse.');for(const key of keys)storage.get(key);
 const lease:WriterLease={status:'held',release(){this.status='busy';}};
 let native=initial,disposed=false;
 const merged=()=>({...native,active:native.active&&!visibility.hidden});
 const adapter=createAndroidPlatform(canvas,storage,lease,merged()),platform=adapter.platform;
 const session=new GameSession(platform,{seed:20261005,mode:'standard',developerMode:false});
 platform.onPointer(event=>{if(event.type==='cancel')session.input.cancel(event.id);else if(event.type==='down')session.input.down(event.point,event.id,event.pointerType);else session.input[event.type](event.point,event.id);});
 let sessionVisible=merged().active,painter:((context:CanvasRenderingContext2D)=>void)|undefined,scheduled:number|null=null,frameEpoch=0;
 const frame=(now:number,paint:(context:CanvasRenderingContext2D)=>void):boolean=>{
  if(disposed||!native.active||visibility.hidden||lease.status!=='held')return false;
  let context:CanvasRenderingContext2D;try{context=platform.beginFrame();}catch{return false;}
  session.tick(now);paint(context);return true;
 };
 const cancelFrames=()=>{frameEpoch++;if(scheduled!==null){window.cancelAnimationFrame(scheduled);scheduled=null;}};
 const scheduleFrame=()=>{
  if(disposed||!sessionVisible||lease.status!=='held'||!painter||scheduled!==null)return;
  const epoch=frameEpoch;
  scheduled=platform.frame(now=>{
   // A cancelled callback may already be queued by WebView; it cannot restart this loop.
   if(epoch!==frameEpoch||disposed)return;scheduled=null;
   if(painter&&frame(now,painter))scheduleFrame();
  });
 };
 platform.onHide(()=>{sessionVisible=false;cancelFrames();session.hide();});platform.onShow(()=>{sessionVisible=true;session.show();scheduleFrame();});
 if(!merged().active)session.hide();
 const update=()=>{
  if(disposed)return;
  if(!native.owner&&lease.status==='held'){lease.release();session.togglePause();}
  try{adapter.updateHost(merged());}catch{/* Pending geometry is already fail-closed by the platform. */}
 };
 const offState=host.subscribe(state=>{native=state;update();}),offBack=host.onBack(()=>{
  if(disposed||!native.active||visibility.hidden)return;
  if(handleAndroidBack(session)==='background')void host.minimize().catch(()=>{session.view.message='无法切到后台，请使用系统主页键';});
 });
 visibility.addEventListener('visibilitychange',update);
 // State may have changed while constructing the session; apply the newest snapshot once.
 native=host.state;update();
 return {
  session,platform,lease,
  frame,
  startFrames(paint:(context:CanvasRenderingContext2D)=>void):()=>void {
   if(disposed)return ()=>{};painter=paint;scheduleFrame();
   return ()=>{if(painter===paint){painter=undefined;cancelFrames();}};
  },
  dispose(){if(disposed)return;disposed=true;painter=undefined;cancelFrames();offState();offBack();visibility.removeEventListener('visibilitychange',update);if(sessionVisible){sessionVisible=false;session.hide();}lease.release();},
 };
}
