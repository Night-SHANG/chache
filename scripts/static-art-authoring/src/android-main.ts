import {assertAndroidCapabilities,connectAndroidHost,startAndroidSession} from './platform/android-host.ts';
import type {NativeStorageBridge} from './platform/android-storage.ts';

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
  const runtime=await startAndroidSession(canvas,host,bridge);
  const [{configureWarehouseCache,invalidateWarehouseCache},{configureCosmeticPreviewCache,invalidateCosmeticPreviewCache},{loadCargoAtlas},{loadBoardMaterialAtlas},{loadSceneMaterialAtlas},{loadThemedForkliftAtlas},{render}]=await Promise.all([
   import('./presentation/warehouse-cache.ts'),import('./presentation/cosmetic-preview-cache.ts'),import('./presentation/cargo-atlas.ts'),import('./presentation/board-material-atlas.ts'),import('./presentation/scene-frame-atlas.ts'),import('./presentation/themed-forklift-art.ts'),import('./presentation/renderer.ts'),
  ]);
  configureCosmeticPreviewCache(runtime.platform.createCanvasSurface);
  configureWarehouseCache(runtime.platform.createCanvasSurface);
  const invalidateArtwork=()=>{invalidateCosmeticPreviewCache();invalidateWarehouseCache();};
  for(const load of [loadCargoAtlas,loadBoardMaterialAtlas,loadSceneMaterialAtlas,loadThemedForkliftAtlas])void load(runtime.platform.loadImage).then(invalidateArtwork,invalidateArtwork);
  runtime.platform.onHide(invalidateWarehouseCache);runtime.platform.onShow(()=>{invalidateWarehouseCache();invalidateCosmeticPreviewCache();});status.textContent='';status.hidden=true;
  runtime.startFrames(context=>render(context,runtime.session.state,runtime.session.view,runtime.platform.backgroundBounds?.(),runtime.platform.overlayBounds?.(),runtime.platform.frameBackdrop));
  window.addEventListener('pagehide',()=>{invalidateWarehouseCache();runtime.dispose();void host.disconnect();},{once:true});
 } catch(error){await host.disconnect();throw error;}
}
void start(canvas,status).catch(error=>{status.hidden=false;status.textContent=`无法开始游戏\n${error instanceof Error?error.message:'Android 启动检查失败'}\n已有存档未被清空。`;});
