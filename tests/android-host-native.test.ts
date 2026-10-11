import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';

test('Android-free native host helper executes per-edge Insets maximum and fail-closed ownership on the real JVM',()=>{
 const out=mkdtempSync(join(tmpdir(),'warehouse-host-'));
 try{
  const base='android/app/src',path='java/io/github/nightshang/chache';
  const compile=spawnSync('java',['-m','jdk.compiler/com.sun.tools.javac.Main','-d',out,`${base}/main/${path}/WarehouseHostGeometry.java`,`${base}/test/${path}/WarehouseHostGeometryTest.java`],{encoding:'utf8'});
  assert.equal(compile.status,0,compile.stderr||compile.stdout);
  const run=spawnSync('java',['-cp',out,'io.github.nightshang.chache.WarehouseHostGeometryTest'],{encoding:'utf8'});
  assert.equal(run.status,0,run.stderr||run.stdout);assert.match(run.stdout,/15 assertions passed/);
 }finally{rmSync(out,{recursive:true,force:true});}
});

// These source gates protect native API guards and actual hook use without claiming Android execution.
const pluginPath='android/app/src/main/java/io/github/nightshang/chache/WarehouseHostPlugin.java';
test('native cutout configuration guards API 28 and 30 before entering immersive layout',()=>{
 const source=readFileSync(pluginPath,'utf8');
 assert.match(source,/import android\.os\.Build;/);assert.match(source,/import android\.view\.WindowManager;/);
 const method=source.match(/private static void applyCutoutMode\(Window window\) \{([\s\S]*?)\n    \}/)?.[1];assert.ok(method,'cutout mode setter exists');
 assert.match(method,/^\s*if \(Build\.VERSION\.SDK_INT >= Build\.VERSION_CODES\.P\) \{/);
 assert.match(method,/if \(Build\.VERSION\.SDK_INT >= Build\.VERSION_CODES\.R\) \{\s*attributes\.layoutInDisplayCutoutMode = WindowManager\.LayoutParams\.LAYOUT_IN_DISPLAY_CUTOUT_MODE_ALWAYS;\s*\} else \{\s*attributes\.layoutInDisplayCutoutMode = WindowManager\.LayoutParams\.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;\s*\}/);
 assert.match(method,/window\.setAttributes\(attributes\);\s*\}\s*$/);
 assert.ok(source.indexOf('applyCutoutMode(window);')>0);assert.ok(source.indexOf('applyCutoutMode(window);')<source.indexOf('WindowCompat.setDecorFitsSystemWindows(window, false);'));
});
test('native layout listener applies the tested equality guard before invalidating measured Insets',()=>{
 const source=readFileSync(pluginPath,'utf8');
 const listener=source.match(/layoutListener = \(view, left, top, right, bottom, oldLeft, oldTop, oldRight, oldBottom\) -> \{([\s\S]*?)\n            \};/)?.[1];assert.ok(listener);
 assert.match(listener,/^\s*if \(!WarehouseHostGeometry\.layoutChanged\(insetsReady, left, top, right, bottom, oldLeft, oldTop, oldRight, oldBottom\)\) return;/);
 assert.ok(listener.indexOf('layoutChanged(')<listener.indexOf('insetsReady = false;'));assert.ok(listener.indexOf('insetsReady = false;')<listener.indexOf('ViewCompat.requestApplyInsets(view);'));
});
