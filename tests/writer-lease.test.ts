import test from 'node:test';
import assert from 'node:assert/strict';
import { acquireBrowserWriter } from '../src/platform/writer-lease.ts';

test('browser writer uses an exclusive nonqueued lock until explicitly released',async()=>{
 let occupied=false;const calls:{name:string;options:LockOptions}[]=[];
 const locks={request(name:string,options:LockOptions,callback:(lock:object|null)=>Promise<void>){calls.push({name,options});if(occupied)return callback(null);occupied=true;return callback({}).finally(()=>{occupied=false;});}} as unknown as LockManager;
 const first=await acquireBrowserWriter(locks);assert.equal(first.status,'held');
 const second=await acquireBrowserWriter(locks);assert.equal(second.status,'busy');
 assert.deepEqual(calls[0],{name:'warehouse.account.s1.writer',options:{mode:'exclusive',ifAvailable:true}});
 first.release();first.release();await new Promise(resolve=>setImmediate(resolve));
 const third=await acquireBrowserWriter(locks);assert.equal(third.status,'held');third.release();
});
test('missing or rejected Web Locks fail closed without claiming ownership',async()=>{
 assert.equal((await acquireBrowserWriter(undefined)).status,'unsupported');
 const denied={request(){return Promise.reject(Error('not available'));}} as unknown as LockManager;
 assert.equal((await acquireBrowserWriter(denied)).status,'unsupported');
});

test('releasing ownership immediately invalidates the lease for subsequent account actions',async()=>{
 const locks={request(_name:string,_options:LockOptions,callback:(lock:object)=>Promise<void>){return callback({});}} as unknown as LockManager;
 const lease=await acquireBrowserWriter(locks);lease.release();assert.equal(lease.status,'busy');
});
