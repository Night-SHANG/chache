import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const api=await import(new URL('../scripts/android-native-instrumentation.mjs',import.meta.url).href).catch(()=>null) as null|{parseNativeInstrumentation:(raw:string,options:Record<string,unknown>)=>{status:string;counts:Record<string,number>;cases:Record<string,unknown>;reasons:string[]};nativeInventory:(root:string)=>Promise<{tests:string[]}>};
const driver='io.github.nightshang.chache.DeviceAcceptanceTest#runAcceptanceAction';
const expected=['demo.Native#one',driver];
function packet(key:string,current:number,code:number,stack=''){
 const [cls,method]=key.split('#');return `INSTRUMENTATION_STATUS: class=${cls}\nINSTRUMENTATION_STATUS: current=${current}\nINSTRUMENTATION_STATUS: id=AndroidJUnitRunner\nINSTRUMENTATION_STATUS: numtests=2\nINSTRUMENTATION_STATUS: test=${method}\n${stack?'INSTRUMENTATION_STATUS: stack='+stack+'\n':''}INSTRUMENTATION_STATUS_CODE: ${code}\n`;
}
const known='org.junit.AssumptionViolatedException: Requires the explicit disposable-emulator acceptance driver';
const success=()=>packet(expected[0],1,1)+packet(expected[0],1,0)+packet(driver,2,1)+packet(driver,2,-4,known)+'INSTRUMENTATION_RESULT: stream=\nTime: 1.23\n\nOK (2 tests)\n\nINSTRUMENTATION_CODE: -1\n';
function parse(raw:string,exitCode=0,timedOut=false){assert.ok(api,'Direct adb native test-set parser is missing');return api.parseNativeInstrumentation(raw,{expected,exitCode,timedOut});}
test('native parser reconciles all individual starts completions and the single exact driver-only assumption skip',()=>{
 const result=parse(success());assert.equal(result.status,'passed');assert.deepEqual(result.counts,{tests:2,passed:1,failed:0,errors:0,skipped:1});assert.equal(Object.keys(result.cases).length,2);
});
test('native parser fails closed on bare OK missing duplicate unknown or unmatched start/end results',()=>{
 for(const raw of ['OK (2 tests)\n',success().replace(packet(expected[0],1,0),''),success()+packet(expected[0],1,0),success().split('demo.Native').join('demo.Other'),success().replace(packet(expected[0],1,1),''),success().replace('current=1','current=2'),success().split('numtests=2').join('numtests=3')])assert.notEqual(parse(raw).status,'passed');
});
test('native parser forbids arbitrary skips failures errors bad counts incomplete process and timeouts',()=>{
 for(const raw of [success().replace(packet(expected[0],1,0),packet(expected[0],1,-3)),success().replace(known,'unrelated assumption'),success().replace(packet(driver,2,-4,known),packet(driver,2,0)),success().replace('OK (2 tests)','OK (1 test)'),success().replace('INSTRUMENTATION_CODE: -1','INSTRUMENTATION_CODE: 0'),success().replace('INSTRUMENTATION_CODE: -1',''),success()+ 'INSTRUMENTATION_FAILED: process crashed\n'])assert.notEqual(parse(raw).status,'passed');
 for(const code of [-1,-2])assert.equal(parse(success().replace(packet(expected[0],1,0),packet(expected[0],1,code,'failure assertion'))).status,'failed');
 for(const exit of [1,124,137])assert.equal(parse(success(),exit).status,'failed');assert.equal(parse(success(),0,true).status,'failed');
});
test('generic native inventory derives unchanged exact class-method set with the known driver included',async()=>{
 assert.ok(api);const inventory=await api.nativeInventory(process.cwd());assert.ok(inventory.tests.includes(driver));assert.ok(inventory.tests.includes('io.github.nightshang.chache.ShellBoundaryInstrumentedTest#workerCallbackNeverDelegatesToNativeAssetOrFileServer'));assert.equal(new Set(inventory.tests).size,inventory.tests.length);assert.equal(inventory.tests.length,27);
});

test('native inventory includes timeout annotations but ignores comments and quoted fake declarations',async()=>{
 assert.ok(api);const root=await mkdtemp(join(tmpdir(),'native-inventory-'));
 try{
  const path=join(root,'android/app/src/androidTest/java/io/github/nightshang/chache');await mkdir(path,{recursive:true});
  await writeFile(join(path,'DeviceAcceptanceTest.java'),`package io.github.nightshang.chache;
public class DeviceAcceptanceTest {
// @Test public void commented() {}
/* @Test public void alsoCommented() {} */
String comment = "@Test public void quoted() {}";
@Test public void runAcceptanceAction() {}
@Test(timeout = 45000) public void actualTimeout() {}
}`);
  const result=await api.nativeInventory(root);assert.deepEqual(result.tests,['io.github.nightshang.chache.DeviceAcceptanceTest#actualTimeout',driver]);
 }finally{await rm(root,{recursive:true,force:true});}
});

test('empty malformed and start-only zero-exit native evidence stays blocked while observed failures retain precedence',()=>{
 for(const raw of ['', 'OK (2 tests)\n',packet(expected[0],1,1)])assert.equal(parse(raw).status,'blocked');
 for(const code of [-1,-2])assert.equal(parse(packet(expected[0],1,1)+packet(expected[0],1,code,'observed failure')).status,'failed');
 for(const exit of [1,124,137])assert.equal(parse('',exit).status,'failed');assert.equal(parse('',0,true).status,'failed');
});
