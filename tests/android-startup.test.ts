import assert from 'node:assert/strict';
import test from 'node:test';
import {assertAndroidCapabilities,connectAndroidHost,startAndroidSession} from '../src/platform/android-host.ts';
import {androidHost} from './helpers/android-platform-fixture.ts';
import {androidSessionFixture,nativeHostFixture} from './helpers/android-host-fixture.ts';
const settle=()=>new Promise<void>(resolve=>setImmediate(resolve));

test('Android startup waits zero native and CSS geometry without reading or creating a save',async()=>{
 const f=androidSessionFixture(),native=nativeHostFixture({...androidHost,widthPx:0,heightPx:0});try{
  f.setRect({x:0,y:0,w:0,h:0});const host=await connectAndroidHost(native.plugin);let ready=false,reads=0;const original=f.bridge.listKeys;f.bridge.listKeys=prefix=>{reads++;return original(prefix);};const started=startAndroidSession(f.canvas,host,f.bridge,f.visibility).then(value=>{ready=true;return value;});await settle();assert.equal(ready,false);assert.equal(reads,0);assert.equal(f.writes.length,0);
  native.setState(androidHost);f.nextFrame();await settle();assert.equal(ready,false);assert.equal(reads,0);f.setRect({x:0,y:0,w:1080,h:2400});f.nextFrame();const runtime=await started;assert.equal(ready,true);assert.equal(runtime.lease.status,'held');assert.equal(runtime.session.view.developerMode,false);assert.equal(runtime.session.view.screen,'menu');runtime.dispose();await host.disconnect();
 }finally{f.restore();}
});
test('missing bridge and false native owner block startup without inventing writer success',async()=>{
 for(const missing of [false,true]){const f=androidSessionFixture(),native=nativeHostFixture({...androidHost,owner:missing});try{const host=await connectAndroidHost(native.plugin);await assert.rejects(startAndroidSession(f.canvas,host,missing?undefined:f.bridge,f.visibility),/存储|保存|宿主/);assert.equal(f.writes.length,0);await host.disconnect();}finally{f.restore();}}
});
test('storage protocol, native read failures and corrupt envelopes block startup before account initialization',async()=>{
 for(const value of ['not JSON',JSON.stringify({v:2,ok:true,value:[]}),JSON.stringify({v:1,ok:false,code:'CORRUPT_DB'}),JSON.stringify({v:1,ok:false,code:'IO_ERROR'})]){const f=androidSessionFixture(),native=nativeHostFixture();try{const host=await connectAndroidHost(native.plugin);f.bridge.listKeys=()=>value;await assert.rejects(startAndroidSession(f.canvas,host,f.bridge,f.visibility));assert.equal(f.writes.length,0);await host.disconnect();}finally{f.restore();}}
});
test('every existing warehouse record is probed and a read fault cannot become an empty fresh account',async()=>{
 const f=androidSessionFixture(),native=nativeHostFixture();try{f.values.set('warehouse.account.s1.a','existing');f.bridge.get=()=>JSON.stringify({v:1,ok:false,code:'IO_ERROR'});const host=await connectAndroidHost(native.plugin);await assert.rejects(startAndroidSession(f.canvas,host,f.bridge,f.visibility));assert.deepEqual([...f.values],[['warehouse.account.s1.a','existing']]);assert.equal(f.writes.length,0);await host.disconnect();}finally{f.restore();}
});
test('actual built-in capabilities, 2D canvas and exact trusted origin are checked before storage access',()=>{
 const f=androidSessionFixture();try{assertAndroidCapabilities(f.canvas);const flat=Array.prototype.flat;try{Object.defineProperty(Array.prototype,'flat',{configurable:true,writable:true,value:undefined});assert.throws(()=>assertAndroidCapabilities(f.canvas),/flat|能力/);}finally{Object.defineProperty(Array.prototype,'flat',{configurable:true,writable:true,value:flat});}
 const original=f.canvas.getContext;f.canvas.getContext=()=>null;assert.throws(()=>assertAndroidCapabilities(f.canvas),/2D/);f.canvas.getContext=original;Object.assign(window,{location:{origin:'https://evil.example'}});assert.throws(()=>assertAndroidCapabilities(f.canvas),/来源/);assert.equal(f.writes.length,0);
 }finally{f.restore();}
});
test('malformed native state rejects initial connection and malformed later events revoke capability',async()=>{
 const native=nativeHostFixture();native.plugin.getState=async()=>({...androidHost,owner:'yes'} as unknown as typeof androidHost);await assert.rejects(connectAndroidHost(native.plugin),/宿主|state/);assert.equal(native.removed,1);
 const good=nativeHostFixture(),host=await connectAndroidHost(good.plugin);good.emit('state',{...androidHost,widthPx:NaN});assert.equal(host.state.owner,false);assert.equal(host.state.active,false);await host.disconnect();
});

test('bundled Android entry explains missing primitives before gameplay modules initialize',async()=>{
 const {build}=await import('esbuild'),{androidBundleOptions}=await import('../scripts/android-bundle-options.ts'),{runInNewContext}=await import('node:vm');
 const bundle=await build({...androidBundleOptions(),entryPoints:['src/android-main.ts'],write:false});
 for(const missing of ['Promise','Map','Set','Object.fromEntries','Array.prototype.flat','Array.prototype.flatMap']){
  const status={textContent:'',hidden:false},canvas={getContext:()=>({}),setPointerCapture(){},releasePointerCapture(){},hasPointerCapture(){return false;}};
  const context={window:{location:{origin:'https://localhost'},requestAnimationFrame(){}},document:{querySelector:(selector:string)=>selector==='#game'?canvas:status},performance:{now:()=>0},Image:class {},console};
  assert.doesNotThrow(()=>runInNewContext(`${missing}=undefined;\n${bundle.outputFiles![0].text}`,context));await settle();assert.match(status.textContent,/无法开始游戏/);assert.ok(status.textContent.includes(missing.replace('.prototype','')),status.textContent);assert.equal(status.hidden,false);
 }
});

test('Android HTML retains a readable fail-closed fallback even when app.js cannot parse',async()=>{
 const {readFile}=await import('node:fs/promises');const script=await readFile('scripts/build-android.mjs','utf8');
 assert.match(script,/<div id="startup-status"[^>]*><strong>货箱最后一格<\/strong><span>正在启动…<\/span>/);
 assert.match(script,/class="startup-help"[^>]*>[^<]*WebView[^<]*存档/);
 assert.match(script,/\.startup-help\{[^}]*visibility:hidden[^}]*animation:startup-help 0s 12s forwards/);
 assert.match(script,/@keyframes startup-help\{to\{visibility:visible/);
 assert.match(script,/#startup-status\[hidden\]\{display:none!important\}/);
 assert.doesNotMatch(script,/<script(?! src=)/);
});
