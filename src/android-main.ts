import {assertAndroidCapabilities,connectAndroidHost,startAndroidSession} from './platform/android-host.ts';
import type {NativeStorageBridge} from './platform/android-storage.ts';
import type {StaticArtGate as ArtGate} from './presentation/static-art-gate.ts';

declare const __APP_VERSION__:string;
declare const __DEV_DIAGNOSTICS__:boolean;
declare const __PLAYTEST_FREE_SHOP__:boolean;
const status=document.querySelector<HTMLElement>('#startup-status'),canvas=document.querySelector<HTMLCanvasElement>('#game');
if(!status||!canvas)throw Error('Missing Android startup surface');
status.textContent=`货箱最后一格 ${__APP_VERSION__}\n正在检查本地存储与屏幕…`;
async function start(canvas:HTMLCanvasElement,status:HTMLElement):Promise<void> {
 if(__DEV_DIAGNOSTICS__||__PLAYTEST_FREE_SHOP__)throw Error('Android 构建必须使用正式付费内容');
 assertAndroidCapabilities(canvas);const host=await connectAndroidHost();
 try {
  const bridge=(window as Window&{WarehouseStorage?:NativeStorageBridge}).WarehouseStorage;
  const presentation:{art?:ArtGate}={};
  const runtime=await startAndroidSession(canvas,host,bridge,document,{
   isBlocked:()=>!presentation.art?.isReady(),
   onPointer:event=>{presentation.art?.pointer(event);return true;},
   onBack:()=>{if(presentation.art?.isReady())return false;if(presentation.art?.canGoBack())presentation.art.back();else void host.minimize().catch(()=>{});return true;},
  });
  const [{configureStaticArt},{StaticArtGate},{render}]=await Promise.all([
   import('./presentation/static-art-resources.ts'),import('./presentation/static-art-gate.ts'),import('./presentation/renderer.ts'),
  ]);
  configureStaticArt(runtime.platform.loadImage,runtime.platform.ensureAssetPackage);
  const art=new StaticArtGate(runtime.session);presentation.art=art;art.refresh();
  runtime.platform.onHide(()=>art.hide());runtime.platform.onShow(()=>art.show());status.textContent='';status.hidden=true;
  runtime.startFrames(context=>{if(art.paint(context,runtime.platform.overlayBounds?.()))render(context,runtime.session.state,runtime.session.view,runtime.platform.backgroundBounds?.(),runtime.platform.overlayBounds?.(),runtime.platform.frameBackdrop);});
  window.addEventListener('pagehide',()=>{art.hide();runtime.dispose();void host.disconnect();},{once:true});
 } catch(error){await host.disconnect();throw error;}
}
void start(canvas,status).catch(error=>{status.hidden=false;status.textContent=`无法开始游戏\n${error instanceof Error?error.message:'Android 启动检查失败'}\n已有存档未被清空。`;});
