import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {mkdtemp,readFile,readdir,rm,symlink,writeFile,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';
import ts from 'typescript';
import {runInNewContext} from 'node:vm';

const root=process.cwd();
const read=(path:string)=>readFile(resolve(root,path),'utf8');
const json=async(path:string)=>JSON.parse(await read(path));

test('Android shell has a fixed offline identity and pinned Capacitor toolchain',async()=>{
 assert.ok(existsSync('android-shell/capacitor.config.json'),'Isolated Android Capacitor config is missing');
 const config=await json('android-shell/capacitor.config.json');
 assert.equal(config.appId,'io.github.nightshang.chache');
 assert.equal(config.appName,'货箱最后一格');
 assert.equal(config.webDir,'../build/android');
 assert.equal(config.android.path,'../android');
 assert.deepEqual(config.server,{hostname:'localhost',androidScheme:'https',cleartext:false,allowNavigation:[]});
 assert.equal(config.android.allowMixedContent,false);
 assert.equal(config.android.webContentsDebuggingEnabled,false);
 assert.equal(config.plugins?.SystemBars?.insetsHandling,'disable');
 assert.equal(config.android.adjustMarginsForEdgeToEdge,undefined);
 const pkg=await json('android-shell/package.json'),lock=await json('android-shell/package-lock.json');
 for(const name of ['@capacitor/core','@capacitor/android','@capacitor/cli']){
  assert.equal(pkg.dependencies?.[name]??pkg.devDependencies?.[name],'8.5.3');
  assert.equal(lock.packages[`node_modules/${name}`].version,'8.5.3');
 }
 assert.equal(pkg.version,'1.0.19');
 assert.equal(lock.version,'1.0.19');
 assert.equal(lock.packages[''].version,'1.0.19');
 const rootPkg=await json('package.json');
 assert.equal(rootPkg.version,'1.0.19');
 const rootLock=await json('package-lock.json');
 assert.equal(rootLock.version,'1.0.19');
 assert.equal(rootLock.packages[''].version,'1.0.19');
 assert.equal(rootPkg.scripts['build:android'],'node scripts/build-android.mjs');
 for(const name of ['@capacitor/core','@capacitor/android','@capacitor/cli'])assert.equal(rootPkg.dependencies?.[name]??rootPkg.devDependencies?.[name],undefined);
 assert.equal(existsSync('capacitor.config.json'),false,'Root Capacitor config must not shadow isolated shell config');
});

test('Android production staging is fresh, offline and byte-identical to formal assets',async()=>{
 assert.ok(existsSync('scripts/build-android.mjs'),'Android staging build is missing');
 const dir=await mkdtemp(join(tmpdir(),'warehouse-android-build-'));
 try{
  for(const path of ['src','scripts','assets','node_modules','package.json','package-lock.json','THIRD_PARTY_NOTICES.md','android-shell'])await symlink(resolve(root,path),join(dir,path));
  await mkdir(join(dir,'build/android'),{recursive:true});
  await writeFile(join(dir,'build/android/stale-remote.js'),'stale');
  const built=spawnSync(process.execPath,['scripts/build-android.mjs'],{cwd:dir,encoding:'utf8',timeout:120000});
  assert.equal(built.status,0,built.stdout+built.stderr);
  assert.equal(existsSync(join(dir,'build/android/stale-remote.js')),false);
  const manifest=JSON.parse(await readFile(join(dir,'build/android/build-manifest.json'),'utf8'));
  const formal=JSON.parse(await readFile(join(dir,'build/browser/build-manifest.json'),'utf8'));
  assert.equal(manifest.version,'1.0.19');
  assert.equal(manifest.sourceContentVersion,'1.0.19');
  assert.equal(formal.version,'1.0.19');
  assert.equal(manifest.shopPricingMode,'paid');
  assert.equal(manifest.developerDiagnostics,false);
  assert.equal(manifest.platform,'android');
  assert.equal(formal.uiClick.playbackGain,0.2428740327036814);
  assert.equal(formal.uiClick.effectiveTargetPeak,.24);
  assert.equal(manifest.uiClick.playbackGain,0.2428740327036814*10**(6/20));
  assert.equal(manifest.uiClick.androidBoostDb,6);
  assert.equal(manifest.uiClick.playbackVolume,.45*manifest.uiClick.playbackGain);
  assert.equal(manifest.uiClick.effectiveTargetPeak,.24*10**(6/20));
  assert.equal(manifest.uiClick.assetGain,formal.uiClick.assetGain);
  assert.equal(manifest.uiClick.sha256,formal.uiClick.sha256);
  assert.equal(manifest.soundEffects.androidVolume,.45);
  assert.equal(formal.soundEffects.androidVolume,undefined);
  assert.equal(manifest.androidShellLockSha256,createHash('sha256').update(await read('android-shell/package-lock.json')).digest('hex'));
  assert.ok(existsSync(join(dir,'build/android/CAPACITOR_LICENSE.txt')),'Android staging must include the native runtime MIT license');
  for(const name of ['core','android'])assert.equal(await readFile(join(dir,'build/android/CAPACITOR_LICENSE.txt'),'utf8'),await read(`android-shell/node_modules/@capacitor/${name}/LICENSE`));
  assert.match(await read('scripts/android-bundle-options.ts'),/nodePaths/);
  assert.deepEqual((await json('tsconfig.json')).compilerOptions.paths['@capacitor/core'],['./android-shell/node_modules/@capacitor/core']);
  const html=await readFile(join(dir,'build/android/index.html'),'utf8');
  assert.match(html,/<title>货箱最后一格<\/title>/);
  assert.doesNotMatch(html,/safe-area-inset|https?:\/\/|<iframe|\bsrc="\/\//i);
  assert.match(html,/script-src 'self'/);
  assert.match(html,/frame-src 'none'/);
  assert.match(html,/object-src 'none'/);
  assert.match(html,/worker-src 'none'/);
  assert.match(html,/<canvas id="game"/);
  assert.match(html,/<div id="startup-status"[^>]*\bhidden[^>]*><\/div>/);
  assert.doesNotMatch(html,/正在检查|正在启动|正在加载/);
  const entry=await read('src/android-main.ts');
  assert.doesNotMatch(entry,/browser-main|wechat-main|acquireBrowserWriter/);
  const walk=async(path:string):Promise<string[]>=>{
   const entries=await readdir(join(dir,path),{withFileTypes:true});
   return (await Promise.all(entries.map(async item=>item.isDirectory()?walk(`${path}/${item.name}`):[`${path}/${item.name}`]))).flat().sort();
  };
  const formalAssets=await walk('build/browser/assets');
  assert.equal(existsSync(join(dir,'build/browser/cosmetics')),false);assert.equal(existsSync(join(dir,'build/android/cosmetics')),false);
  assert.deepEqual((await walk('build/android/assets')).map(path=>path.replace('build/android/','')),formalAssets.map(path=>path.replace('build/browser/','')));
  for(const path of formalAssets){
   const androidPath=path.replace('build/browser/','build/android/');
   const hash=(bytes:Buffer)=>createHash('sha256').update(bytes).digest('hex');
   assert.equal(hash(await readFile(join(dir,androidPath))),hash(await readFile(join(dir,path))),androidPath);
  }
  for(const key of ['cargoAtlas','sceneMaterialAtlas','boardMaterialAtlas','staticArt','backgroundMusic'])assert.deepEqual(manifest[key],formal[key]);
  const checksumText=await readFile(join(dir,'build/android/SHA256SUMS'),'utf8');
  const files=(await walk('build/android')).filter(path=>!path.endsWith('/SHA256SUMS'));
  assert.equal(checksumText.trim().split('\n').length,files.length);
  for(const path of files){
   const hash=createHash('sha256').update(await readFile(join(dir,path))).digest('hex');
   assert.ok(checksumText.includes(`${hash}  ${path.slice('build/android/'.length)}\n`),path);
  }
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('Android public Capacitor imports resolve through real production bundle and TypeScript options',async()=>{
 assert.ok(existsSync('scripts/android-bundle-options.ts'),'Shared production Android bundle options are missing');
 const {androidBundleOptions}=await import('../scripts/android-bundle-options.ts');
 assert.equal(androidBundleOptions(root).define?.__APP_VERSION__,JSON.stringify('1.0.19'));
 const bundled=await build({...androidBundleOptions(root),stdin:{contents:"import {Capacitor} from '@capacitor/core'; globalThis.resolvedPlatform=Capacitor.getPlatform();",resolveDir:resolve(root,'src'),loader:'ts'},write:false,metafile:true});
 assert.ok(Object.keys(bundled.metafile?.inputs??{}).some(path=>path.includes('android-shell/node_modules/@capacitor/core/')));
 const context:{resolvedPlatform?:string}={};
 runInNewContext(bundled.outputFiles?.[0].text??'',context);
 assert.equal(context.resolvedPlatform,'web');
 const dir=await mkdtemp(join(tmpdir(),'warehouse-android-types-'));
 try{
  const fixture=join(dir,'capacitor-import.ts');
  await writeFile(fixture,"import {Capacitor} from '@capacitor/core'; const platform:string=Capacitor.getPlatform(); export {platform};\n");
  const parsed=ts.parseJsonConfigFileContent(await json('tsconfig.json'),ts.sys,root);
  const program=ts.createProgram([fixture],parsed.options);
  const diagnostics=ts.getPreEmitDiagnostics(program);
  assert.equal(diagnostics.length,0,ts.formatDiagnosticsWithColorAndContext(diagnostics,{getCanonicalFileName:path=>path,getCurrentDirectory:()=>root,getNewLine:()=> '\n'}));
  assert.ok(program.getSourceFiles().some(file=>file.fileName.includes('android-shell/node_modules/@capacitor/core/types/')));
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('official Android project fixes version, SDK, Gradle and offline WebView restrictions',async()=>{
 assert.ok(existsSync('android/app/build.gradle'),'Official Android project is missing');
 const app=await read('android/app/build.gradle');
 assert.match(app,/applicationId ['"]io\.github\.nightshang\.chache['"]/);
 assert.match(app,/versionCode 1\b/);
 assert.match(app,/versionName ['"]1\.0\.19['"]/);
 assert.match(app,/buildToolsVersion ['"]35\.0\.0['"]/);
 const vars=await read('android/variables.gradle');
 assert.match(vars,/minSdkVersion = 24/);
 assert.match(vars,/compileSdkVersion = 36/);
 assert.match(vars,/targetSdkVersion = 36/);
 assert.match(await read('android/build.gradle'),/com\.android\.tools\.build:gradle:8\.13\.0/);
 assert.match(await read('android/capacitor.settings.gradle'),/android-shell\/node_modules\/@capacitor\/android\/capacitor/);
 assert.match(await read('android/gradle/wrapper/gradle-wrapper.properties'),/gradle-8\.14\.3-all\.zip/);
 const manifest=await read('android/app/src/main/AndroidManifest.xml');
 assert.match(manifest,/android:allowBackup="false"/);
 assert.match(manifest,/android:usesCleartextTraffic="false"/);
 assert.match(manifest,/android:appCategory="game"/);
 assert.match(manifest,/android:screenOrientation="portrait"/);
 assert.doesNotMatch(manifest,/android\.permission\.INTERNET|FileProvider/);
 assert.match(await read('android/app/src/main/res/values/strings.xml'),/<string name="app_name">货箱最后一格<\/string>/);
 const activity=await read('android/app/src/main/java/io/github/nightshang/chache/MainActivity.java');
 const rootPlugin=await read('android/app/src/main/java/io/github/nightshang/chache/FixedAssetWebViewPlugin.java');
 assert.match(rootPlugin,/setAllowFileAccess\(false\)/);
 assert.match(rootPlugin,/setAllowContentAccess\(false\)/);
 assert.match(rootPlugin,/setMixedContentMode\(WebSettings\.MIXED_CONTENT_NEVER_ALLOW\)/);
 assert.match(rootPlugin,/new OfflineWebViewClient\(bridge\)/);
 assert.match(activity,/registerPlugin\(FixedAssetWebViewPlugin\.class\)/);
 assert.match(activity,/OfflineServiceWorkerClient\.install\(\)/);
 assert.ok(activity.indexOf('registerPlugin(FixedAssetWebViewPlugin.class)')<activity.indexOf('super.load()'));
 assert.ok(activity.indexOf('OfflineServiceWorkerClient.install()')<activity.indexOf('super.load()'));
 assert.match(activity,/setServerPath\(new ServerPath\(ServerPath\.PathType\.ASSET_PATH, "public"\)\)/);
 const client=await read('android/app/src/main/java/io/github/nightshang/chache/OfflineWebViewClient.java');
 assert.match(client,/shouldOverrideUrlLoading/);
 assert.match(client,/shouldInterceptRequest/);
 const policy=await read('android/app/src/main/java/io/github/nightshang/chache/BundledAssetPolicy.java');
 assert.match(policy,/"https"\.equals/);
 assert.match(policy,/"localhost"\.equals/);
 assert.match(policy,/getPort\(\) == -1/);
 assert.match(client,/request\.isForMainFrame\(\)/);
 assert.match(client,/403/);
 assert.ok(existsSync('android/gradle/wrapper/gradle-wrapper.jar'),'Official Gradle wrapper JAR is missing');
 assert.match(await read('android/app/src/androidTest/java/com/getcapacitor/myapp/ExampleInstrumentedTest.java'),/assertEquals\("io\.github\.nightshang\.chache", appContext\.getPackageName\(\)\)/);
 const ignore=await read('.gitignore');
 for(const path of ['android/local.properties','android/.gradle/','*.keystore','*.jks'])assert.ok(ignore.includes(path),path);
});

test('Android supported Insets and worker policy survive the official native config copy',async()=>{
 const config=await json('android-shell/capacitor.config.json');
 assert.equal(config.android.resolveServiceWorkerRequests,false);
 assert.equal(config.plugins.SystemBars.insetsHandling,'disable');
 const dir=await mkdtemp(join(tmpdir(),'warehouse-android-config-'));
 try{
  await mkdir(join(dir,'shell'));
  await mkdir(join(dir,'native/app/src/main/assets'),{recursive:true});
  await mkdir(join(dir,'web'));
  await writeFile(join(dir,'web/index.html'),'<!doctype html><title>test</title>');
  await symlink(resolve(root,'android-shell/node_modules'),join(dir,'shell/node_modules'));
  await writeFile(join(dir,'shell/package.json'),await read('android-shell/package.json'));
  await writeFile(join(dir,'shell/capacitor.config.json'),JSON.stringify({...config,webDir:'../web',android:{...config.android,path:'../native'}}));
  const copied=spawnSync(process.execPath,[resolve(root,'android-shell/node_modules/@capacitor/cli/bin/capacitor'),'copy','android'],{cwd:join(dir,'shell'),encoding:'utf8',timeout:120000});
  assert.equal(copied.status,0,copied.stdout+copied.stderr);
  const synced=JSON.parse(await readFile(join(dir,'native/app/src/main/assets/capacitor.config.json'),'utf8'));
  assert.equal(synced.plugins.SystemBars.insetsHandling,'disable');
  assert.equal(synced.android.resolveServiceWorkerRequests,false);
  assert.equal(synced.android.adjustMarginsForEdgeToEdge,undefined);
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('Android real Java asset policy rejects file routes, foreign origins and traversal',async()=>{
 const source='android/app/src/main/java/io/github/nightshang/chache/BundledAssetPolicy.java';
 assert.ok(existsSync(source),'Executable native asset policy is missing');
 const dir=await mkdtemp(join(tmpdir(),'warehouse-android-java-'));
 try{
  const compiled=spawnSync('java',['-m','jdk.compiler/com.sun.tools.javac.Main','-d',dir,resolve(root,source),resolve(root,'tests/fixtures/android/AssetPolicyProbe.java')],{encoding:'utf8',timeout:30000});
  assert.equal(compiled.status,0,compiled.stdout+compiled.stderr);
  const run=spawnSync('java',['-cp',dir,'io.github.nightshang.chache.AssetPolicyProbe'],{encoding:'utf8',timeout:30000});
  assert.equal(run.status,0,run.stdout+run.stderr);
  assert.match(run.stdout,/15 asset policy probes passed/);
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('Android app declares its directly imported WebKit API at the pinned Capacitor version',async()=>{
 const worker=await read('android/app/src/main/java/io/github/nightshang/chache/OfflineServiceWorkerClient.java');
 assert.match(worker,/import androidx\.webkit\.WebViewFeature;/);
 assert.match(await read('android/app/build.gradle'),/implementation "androidx\.webkit:webkit:\$androidxWebkitVersion"/);
 assert.match(await read('android/variables.gradle'),/androidxWebkitVersion = '1\.14\.0'/);
 assert.match(await read('android-shell/node_modules/@capacitor/android/capacitor/build.gradle'),/implementation "androidx\.webkit:webkit:\$androidxWebkitVersion"/);
});
