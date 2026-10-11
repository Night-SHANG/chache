import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, mkdtempSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createAndroidStorage, type NativeStorageBridge } from '../src/platform/android-storage.ts';
import { ACCOUNT_KEYS, commitAccount, encodeAccount, loadAccount } from '../src/application/account-store.ts';
import { assertAccountSnapshot } from '../src/application/account-profile.ts';
import { makeAccountFixture } from './helpers/account-fixtures.ts';
import { ACCOUNT_MAX_BYTES } from '../src/application/history-store.ts';

const ok=(value:unknown)=>JSON.stringify({v:1,ok:true,value});
const bad=(code:string)=>JSON.stringify({v:1,ok:false,code});
// Transport fixture only. Disk/commit semantics are tested by WarehouseStoreTest on Android.
function transport(){
 const values=new Map<string,string>();let writeError:string|null=null,readError:string|null=null;
 const bridge:NativeStorageBridge={
  get:key=>readError?bad(readError):ok(values.get(key)??null),
  set:(key,value)=>{if(writeError)return bad(writeError);values.set(key,value);return ok(null);},
  remove:key=>{if(writeError)return bad(writeError);values.delete(key);return ok(null);},
  listKeys:prefix=>readError?bad(readError):ok([...values.keys()].filter(key=>key.startsWith(prefix)).sort())
 };
 return {bridge,values,setWriteError:(error:string|null)=>{writeError=error;},setReadError:(error:string|null)=>{readError=error;}};
}

test('Android storage preserves missing, empty, Chinese and synchronous return semantics',()=>{
 const {bridge}=transport(),store=createAndroidStorage(bridge);
 assert.equal(store.get('warehouse.missing'),null);
 assert.equal(store.set('warehouse.中文','最后一格📦'),undefined);
 store.set('warehouse.empty','');store.set('warehouse.a','a');
 assert.equal(store.get('warehouse.中文'),'最后一格📦');assert.equal(store.get('warehouse.empty'),'');
 assert.deepEqual(store.listKeys?.('warehouse.'),['warehouse.a','warehouse.empty','warehouse.中文']);
 assert.equal(store.remove('warehouse.empty'),undefined);assert.equal(store.get('warehouse.empty'),null);
});

for(const code of ['IO_ERROR','CORRUPT_DB','UNSUPPORTED_VERSION','NOT_OWNER','OWNER_BUSY','COMMIT_UNKNOWN','STORE_UNAVAILABLE','DURABILITY_UNAVAILABLE']){
 test(`Android ${code} is an exception, never missing or empty`,()=>{
  const fixture=transport(),store=createAndroidStorage(fixture.bridge);fixture.setReadError(code);fixture.setWriteError(code);
  for(const action of [()=>store.get('warehouse.a'),()=>store.set('warehouse.a','new'),()=>store.remove('warehouse.a'),()=>store.listKeys?.('warehouse.')])assert.throws(action,{name:'AndroidStorageError',code});
 });
}

for(const response of ['{','null','[]','{}','true','{"v":2,"ok":true,"value":null}','{"v":1,"ok":"true","value":null}','{"v":1,"ok":true}','{"v":1,"ok":true,"value":null,"extra":0}','{"v":1,"ok":false,"code":""}','{"v":1,"ok":false,"code":"IO_ERROR","value":null}']){
 test(`Android rejects malformed envelope ${response}`,()=>{
  const bridge={get:()=>response,set:()=>response,remove:()=>response,listKeys:()=>response};
  const store=createAndroidStorage(bridge);assert.throws(()=>store.get('warehouse.a'),{code:'INVALID_RESPONSE'});
 });
}

test('Android validates operation-specific response types and canonical key lists',()=>{
 const {bridge}=transport();const store=createAndroidStorage(bridge);
 for(const value of [false,0,{},[],undefined]){bridge.get=()=>ok(value);assert.throws(()=>store.get('warehouse.a'),{code:'INVALID_RESPONSE'});}
 for(const value of ['',true,0,{},[]]){bridge.set=()=>ok(value);bridge.remove=()=>ok(value);assert.throws(()=>store.set('warehouse.a','v'),{code:'INVALID_RESPONSE'});assert.throws(()=>store.remove('warehouse.a'),{code:'INVALID_RESPONSE'});}
 for(const value of [null,{},['foreign.a'],['warehouse.other'],['warehouse.a','warehouse.a'],['warehouse.az','warehouse.aa'],['warehouse.a',2]]){
  bridge.listKeys=()=>ok(value);assert.throws(()=>store.listKeys?.('warehouse.a'),{code:'INVALID_RESPONSE'});
 }
 bridge.get=()=>ok('x'.repeat(2*1024*1024+1));assert.throws(()=>store.get('warehouse.a'),{code:'INVALID_RESPONSE'});
});

test('Android validates namespace and UTF-16 limits before touching bridge',()=>{
 const {bridge}=transport();let calls=0;for(const method of ['get','set','remove','listKeys'] as const)bridge[method]=()=>{calls++;return ok(null);};
 const store=createAndroidStorage(bridge);
 for(const key of ['', 'warehouse', 'other.a', 'warehouse.'+'x'.repeat(247), 'warehouse.\0x', 'warehouse.\ud800']){
  for(const action of [()=>store.get(key),()=>store.set(key,'v'),()=>store.remove(key),()=>store.listKeys?.(key)])assert.throws(action,{code:'INVALID_ARGUMENT'});
 }
 assert.throws(()=>store.set('warehouse.a','x'.repeat(2*1024*1024+1)),{code:'INVALID_ARGUMENT'});
 assert.throws(()=>store.set('warehouse.a','\ud800'),{code:'INVALID_ARGUMENT'});
 assert.equal(calls,0);
 const valid=transport(),validStore=createAndroidStorage(valid.bridge),key='warehouse.'+'x'.repeat(246),value='中'.repeat(2*1024*1024);
 validStore.set(key,value);assert.equal(validStore.get(key),value);
});

test('Android bridge exceptions and absent methods remain failures',()=>{
 assert.throws(()=>createAndroidStorage({} as NativeStorageBridge),{code:'BRIDGE_UNAVAILABLE'});
 const {bridge}=transport(),store=createAndroidStorage(bridge);bridge.get=()=>{throw Error('disconnected');};
 assert.throws(()=>store.get('warehouse.a'),{code:'BRIDGE_UNAVAILABLE'});
 bridge.get=(()=>Promise.resolve(ok(null))) as unknown as NativeStorageBridge['get'];assert.throws(()=>store.get('warehouse.a'),{code:'INVALID_RESPONSE'});
});

test('failed native write cannot acknowledge an account generation; committed A/B retries stay idempotent',()=>{
 const fixture=transport(),store=createAndroidStorage(fixture.bridge);
 const initial={...makeAccountFixture(),generation:1,lastOperation:{operationId:'android.1',expectedGeneration:0,requestDigest:'r1',committedGeneration:1}};
 assert.equal(commitAccount(store,null,initial,assertAccountSnapshot).status,'acknowledged');
 const next={...initial,wallet:7,generation:2,lastOperation:{operationId:'android.2',expectedGeneration:1,requestDigest:'r2',committedGeneration:2}};
 fixture.setWriteError('IO_ERROR');assert.throws(()=>store.set(ACCOUNT_KEYS.b,encodeAccount(next)),{code:'IO_ERROR'});
 assert.equal(store.get(ACCOUNT_KEYS.b),encodeAccount(initial));assert.equal(commitAccount(store,initial,next,assertAccountSnapshot).status,'not_committed');
 fixture.setReadError('STORE_UNAVAILABLE');assert.equal(commitAccount(store,initial,next,assertAccountSnapshot).status,'unknown');assert.equal(loadAccount(store,assertAccountSnapshot).status,'unavailable');
 fixture.setReadError(null);fixture.setWriteError(null);
 assert.equal(commitAccount(store,initial,next,assertAccountSnapshot).status,'acknowledged');assert.equal(commitAccount(store,initial,next,assertAccountSnapshot).status,'acknowledged');
 assert.equal(loadAccount(store,assertAccountSnapshot).account?.wallet,7);
});

test('current account capacity and saved legacy fixtures fit the native non-truncating limits',()=>{
 assert.ok(ACCOUNT_MAX_BYTES<2*1024*1024);
 const fixture=transport(),store=createAndroidStorage(fixture.bridge);
 const files=readdirSync(new URL('./fixtures/',import.meta.url)).filter(name=>name.endsWith('.json'));
 let checked=0;
 function scan(value:unknown){
  if(!value||typeof value!=='object')return;
  for(const [key,child] of Object.entries(value)){
   if(key.startsWith('warehouse.')&&typeof child==='string'){store.set(key,child);assert.equal(store.get(key),child);checked++;}
   scan(child);
  }
 }
 for(const name of files)scan(JSON.parse(readFileSync(new URL(`./fixtures/${name}`,import.meta.url),'utf8')));
 // Some golden fixtures store whole run JSON rather than a KV export.
 for(const name of files.filter(name=>/golden|tutorial|natural-win/.test(name))){const value=readFileSync(new URL(`./fixtures/${name}`,import.meta.url),'utf8');store.set(`warehouse.fixture.${name}`,value);assert.equal(store.get(`warehouse.fixture.${name}`),value);checked++;}
 assert.ok(checked>=10);
});

// This exercises the actual Java lifetime owner; it makes no SQLite-runtime claim.
test('Android real Java owner rejects stale hosts, concurrent claims and a second process',()=>{
 const dir=mkdtempSync(join(tmpdir(),'warehouse-storage-owner-'));
 try{
  const compiled=spawnSync('java',['-m','jdk.compiler/com.sun.tools.javac.Main','-d',dir,'android/app/src/main/java/io/github/nightshang/chache/storage/HostOwnership.java','tests/fixtures/android/HostOwnershipProbe.java'],{encoding:'utf8',timeout:30000});
  assert.equal(compiled.status,0,compiled.stdout+compiled.stderr);
  const run=spawnSync('java',['-cp',dir,'io.github.nightshang.chache.storage.HostOwnershipProbe',join(dir,'private.owner')],{encoding:'utf8',timeout:30000});
  assert.equal(run.status,0,run.stdout+run.stderr);assert.match(run.stdout,/cross-process lock passed/);
 }finally{rmSync(dir,{recursive:true,force:true});}
});

test('Android recovery staging uses actual killed-writer files without mutating rejected originals',()=>{
 const dir=mkdtempSync(join(tmpdir(),'warehouse-recovery-java-'));
 try{
  const compiled=spawnSync('java',['-m','jdk.compiler/com.sun.tools.javac.Main','-d',dir,'android/app/src/main/java/io/github/nightshang/chache/storage/RecoverySnapshot.java','tests/fixtures/android/RecoverySnapshotProbe.java'],{encoding:'utf8',timeout:30000});
  assert.equal(compiled.status,0,compiled.stdout+compiled.stderr);
  const run=spawnSync('python3',['tests/fixtures/android/probe-recovery-snapshot.py',dir,'android/app/src/androidTest/assets/storage'],{encoding:'utf8',timeout:60000});
  assert.equal(run.status,0,run.stdout+run.stderr);assert.match(run.stdout,/real killed-writer fixtures: v1 recovery/);
 }finally{rmSync(dir,{recursive:true,force:true});}
});

test('Android UI ownership snapshot never waits for native I/O or authorizes writes',()=>{
 const dir=mkdtempSync(join(tmpdir(),'warehouse-owner-snapshot-'));
 try{
  const compiled=spawnSync('java',['-m','jdk.compiler/com.sun.tools.javac.Main','-d',dir,'android/app/src/main/java/io/github/nightshang/chache/storage/HostOwnership.java','tests/fixtures/android/OwnerSnapshotProbe.java'],{encoding:'utf8',timeout:30000});
  assert.equal(compiled.status,0,compiled.stdout+compiled.stderr);
  const run=spawnSync('java',['-cp',dir,'io.github.nightshang.chache.storage.OwnerSnapshotProbe',join(dir,'private.owner')],{encoding:'utf8',timeout:30000});
  assert.equal(run.status,0,run.stdout+run.stderr);assert.match(run.stdout,/nonblocking owner snapshots, serialized writes, early revocation and actual-lock authority passed/);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
