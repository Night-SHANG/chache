import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import test from 'node:test';

const root='android/app/src',java='java/io/github/nightshang/chache';
test('native startup controller rejects stale frames and releases only a current visual-state callback on the real JVM',()=>{
 const out=mkdtempSync(join(tmpdir(),'warehouse-launch-'));
 try{
  const compile=spawnSync('java',['-m','jdk.compiler/com.sun.tools.javac.Main','-d',out,`${root}/main/${java}/WarehouseLaunchState.java`,`${root}/test/${java}/WarehouseLaunchStateTest.java`,`${root}/test/${java}/WarehouseOptionalSplashTest.java`],{encoding:'utf8'});
  assert.equal(compile.status,0,compile.stderr||compile.stdout);
  const run=spawnSync('java',['-cp',out,'io.github.nightshang.chache.WarehouseLaunchStateTest'],{encoding:'utf8'});
  assert.equal(run.status,0,run.stderr||run.stdout);assert.match(run.stdout,/assertions passed/);
  const optional=spawnSync('java',['-cp',out,'io.github.nightshang.chache.WarehouseOptionalSplashTest'],{encoding:'utf8'});
  assert.equal(optional.status,0,optional.stderr||optional.stdout);assert.match(optional.stdout,/assertions passed/);
 }finally{rmSync(out,{recursive:true,force:true});}
});

test('system splash uses a retained exit overlay while WebView rendering remains unblocked',()=>{
 const activity=readFileSync(`${root}/main/${java}/MainActivity.java`,'utf8');
 assert.ok(activity.indexOf('SplashScreen.installSplashScreen(this)')<activity.indexOf('super.onCreate(savedInstanceState)'));
 assert.match(activity,/setOnExitAnimationListener/);
 const handoff=readFileSync(`${root}/main/${java}/WarehouseLaunchHandoff.java`,'utf8');
 assert.doesNotMatch(activity+handoff,/setKeepOnScreenCondition|addOnPreDrawListener/);
 assert.match(handoff,/postVisualStateCallback/);assert.match(handoff,/isAttachedToWindow/);assert.match(handoff,/getWindowVisibility/);
 assert.match(handoff,/restoreImmersiveAfterSplash/);assert.match(handoff,/setBackgroundColor\(BACKGROUND\)/);
 assert.match(handoff,/setOnTouchListener/);assert.match(handoff,/blocksTouch/);
 assert.match(handoff,/Android 启动检查失败/);assert.match(handoff,/已有存档未被清空/);
 assert.doesNotMatch(handoff,/加载中|正在启动|正在准备/);
});

test('launch bridge is installed before navigation and revoked with host lifetime',()=>{
 const host=readFileSync(`${root}/main/${java}/WarehouseHostPlugin.java`,'utf8');
 assert.match(host,/attachLaunchWebView/);assert.match(host,/launchGeneration/);
 assert.match(host,/restoreImmersiveAfterSplash/);assert.match(host,/removeJavascriptInterface\("WarehouseLaunch"\)/);
 const handoff=readFileSync(`${root}/main/${java}/WarehouseLaunchHandoff.java`,'utf8');
 assert.match(handoff,/addJavascriptInterface\([^;]+"WarehouseLaunch"\)/);
 assert.match(handoff,/@JavascriptInterface public void frameReady\(String/);
 assert.match(handoff,/@JavascriptInterface public boolean isReady\(\)/);
 assert.match(handoff,/@JavascriptInterface public void failed\(String/);
});

test('Back invalidates pending launch callbacks before backgrounding and native tests wait for actual reveal',()=>{
 const host=readFileSync(`${root}/main/${java}/WarehouseHostPlugin.java`,'utf8');
 const back=host.slice(host.indexOf('handleOnBackPressed()'),host.indexOf('getActivity().getOnBackPressedDispatcher()'));
 assert.match(back,/launchReady\(\)/);assert.match(back,/pauseLaunchForBackground\(\)/);
 assert.ok(back.indexOf('pauseLaunchForBackground()')<back.indexOf('moveTaskToBack(true)'));
 const instrumentation=readFileSync(`${root}/androidTest/${java}/HostSecurityTest.java`,'utf8');
 assert.match(instrumentation,/WarehouseLaunch\.isReady\(\)/);
 assert.match(instrumentation,/Splash overlay must be removed/);
});

test('resume publishes the same launch generation that subsequent frame validation will accept',()=>{
 const activity=readFileSync(`${root}/main/${java}/MainActivity.java`,'utf8');
 const resume=activity.match(/@Override public void onResume\(\) \{([^}]+)\}/)?.[1];assert.ok(resume);
 assert.ok(resume.indexOf('launch.resume()')<resume.indexOf('super.onResume()'),'generation changes before host resume publishes its state');
 assert.match(activity,/resumeLaunchAfterBackgroundFailure\(\)[\s\S]*?publishLaunchState\(\)/);
 const host=readFileSync(`${root}/main/${java}/WarehouseHostPlugin.java`,'utf8');
 assert.match(host,/void publishLaunchState\(\) \{ publishState\(\); \}/);
});
