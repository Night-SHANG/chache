import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
const path='android/app/src/main/java/io/github/nightshang/chache/';
test('Android registered plugin installs owned KV synchronously before asynchronous viewport and first navigation',async()=>{
 const activity=await readFile(`${path}MainActivity.java`,'utf8'),plugin=await readFile(`${path}WarehouseHostPlugin.java`,'utf8');
 assert.match(activity,/registerPlugin\(WarehouseHostPlugin\.class\)/);assert.ok(activity.indexOf('registerPlugin(WarehouseHostPlugin.class)')<activity.indexOf('super.load()'));
 const load=plugin.slice(plugin.indexOf('public void load()'),plugin.indexOf('private static WarehouseHostGeometry.Insets'));
 assert.match(load,/WarehouseStore\.replace\(getContext\(\)\)/);assert.match(load,/new WarehouseStorageBridge\(store\)/);assert.match(load,/addJavascriptInterface\([^;]+"WarehouseStorage"\)/s);assert.ok(load.indexOf('WarehouseStore.replace')<load.indexOf('bridge.executeOnMainThread'));
 assert.match(load,/attachOwnerSupplier\(store::ownsHost\)/);assert.match(load,/previous\.refreshOwnerState\(\)/);
 const destroyed=plugin.slice(plugin.indexOf('handleOnDestroy()'));assert.match(destroyed,/store\.close\(\)/);assert.match(destroyed,/currentHost == this/);assert.match(destroyed,/removeJavascriptInterface\("WarehouseStorage"\)/);
 for(const name of ['handleOnPause()','handleOnStop()']){const offset=plugin.indexOf(name),next=plugin.indexOf('@Override',offset);assert.doesNotMatch(plugin.slice(offset,next),/store\.close\(\)/);}
});
test('integrated Android entry uses actual production session while trusted shell and security tests remain present',async()=>{
 const entry=await readFile('src/android-main.ts','utf8');assert.match(entry,/startAndroidSession/);assert.match(entry,/connectAndroidHost/);assert.match(entry,/runtime\.startFrames/);assert.doesNotMatch(entry,/runtime\.platform\.frame\b/);assert.match(entry,/runtime\.platform\.frameBackdrop\b/);assert.doesNotMatch(entry,/__WAREHOUSE__|acquireBrowserWriter|原生适配尚未完成/);
 const activity=await readFile(`${path}MainActivity.java`,'utf8');assert.match(activity,/OfflineServiceWorkerClient\.install\(\)/);assert.match(activity,/registerPlugin\(FixedAssetWebViewPlugin\.class\)/);assert.match(activity,/ServerPath\.PathType\.ASSET_PATH/);
 const security=await readFile('android/app/src/androidTest/java/io/github/nightshang/chache/HostSecurityTest.java','utf8');assert.match(security,/preNavigationBridge/);assert.match(security,/foreignNavigation/);assert.match(security,/iframe/);assert.match(security,/LateDestroy/);
});

test('native Back can background a fail-closed startup before any JavaScript listener exists',async()=>{
 const plugin=await readFile(`${path}WarehouseHostPlugin.java`,'utf8');const callback=plugin.slice(plugin.indexOf('handleOnBackPressed()'),plugin.indexOf('getActivity().getOnBackPressedDispatcher()'));
 assert.match(callback,/hasListeners\("backButton"\)/);assert.match(callback,/moveTaskToBack\(true\)/);
});
