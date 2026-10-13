import {assertAndroidCapabilities,connectAndroidHost,startAndroidSession} from './platform/android-host.ts';
import type {NativeStorageBridge} from './platform/android-storage.ts';

declare const __DEV_DIAGNOSTICS__:boolean;
declare const __PLAYTEST_FREE_SHOP__:boolean;
const status=document.querySelector<HTMLElement>('#startup-status'),canvas=document.querySelector<HTMLCanvasElement>('#game');
if(!status||!canvas)throw Error('Missing Android startup surface');
const fail=(error:unknown)=>{status.hidden=false;status.textContent=`无法开始游戏\n${error instanceof Error?error.message:'Android 启动检查失败'}\n已有存档未被清空。`;};
async function start(canvas:HTMLCanvasElement,status:HTMLElement):Promise<void> {
 if(__DEV_DIAGNOSTICS__||__PLAYTEST_FREE_SHOP__)throw Error('Android 构建必须使用正式付费内容');
 assertAndroidCapabilities(canvas);const host=await connectAndroidHost();
 try {
  const bridge=(window as Window&{WarehouseStorage?:NativeStorageBridge}).WarehouseStorage;
  const runtime=await startAndroidSession(canvas,host,bridge);
  const [{configureStaticArt},{prepareStaticArtForView},{render}]=await Promise.all([
   import('./presentation/static-art-resources.ts'),import('./presentation/static-art-requirements.ts'),import('./presentation/renderer.ts'),
  ]);
  configureStaticArt(runtime.platform.loadImage);prepareStaticArtForView(runtime.session.view);
  // Bootstrap remains silent; only genuine failures reveal the status surface.
  status.textContent='';status.hidden=true;
  runtime.startFrames(context=>{
   try{prepareStaticArtForView(runtime.session.view);render(context,runtime.session.state,runtime.session.view,runtime.platform.backgroundBounds?.(),runtime.platform.overlayBounds?.(),runtime.platform.frameBackdrop);}
   catch(error){fail(error);runtime.dispose();void host.disconnect();}
  });
  window.addEventListener('pagehide',()=>{runtime.dispose();void host.disconnect();},{once:true});
 } catch(error){await host.disconnect();throw error;}
}
void start(canvas,status).catch(fail);
