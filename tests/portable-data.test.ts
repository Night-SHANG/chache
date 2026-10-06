import assert from 'node:assert/strict';
import test from 'node:test';
import {cloneData,utf8Bytes} from '../src/shared/data.ts';

test('portable plain-data clone preserves optional fields and isolates nested game facts',()=>{
 const source={board:[null,'cargo.food'],traits:[null,{kind:'rush',remaining:2}],missing:undefined,zero:-0};
 const copied=cloneData(source);assert.deepEqual(copied,source);assert.notEqual(copied,source);assert.notEqual(copied.traits[1],source.traits[1]);
 copied.traits[1]!.remaining=1;assert.equal(source.traits[1]!.remaining,2);
 assert.equal(Object.prototype.hasOwnProperty.call(copied,'missing'),true);assert.equal(Object.is(copied.zero,-0),true);
 const unusual=JSON.parse('{"__proto__":{"polluted":true}}');
 const safe=cloneData(unusual);assert.equal(Object.getPrototypeOf(safe),Object.prototype);assert.equal(Object.prototype.hasOwnProperty.call(safe,'__proto__'),true);assert.equal(({} as {polluted?:boolean}).polluted,undefined);
});

test('plain data clone rejects cycles and host objects rather than silently changing them',()=>{
 const cycle:{self?:unknown}={};cycle.self=cycle;assert.throws(()=>cloneData(cycle));
 assert.throws(()=>cloneData(new Date()));assert.throws(()=>cloneData(new Map()));assert.throws(()=>cloneData({callback:()=>{}}));
});

test('portable UTF-8 matches standard bytes for Chinese, astral symbols and lone surrogates',()=>{
 for(const value of ['', '仓库金币', '\u0000\u007f\u0080\u07ff\u0800\uffff', '😀🧹📦', '\ud800', '\udfff', '\ud800x\udfff', '\ud800\ud800\udfff'])assert.deepEqual(utf8Bytes(value),[...new TextEncoder().encode(value)]);
 let all='';for(let i=0;i<=0xffff;i++)all+=String.fromCharCode(i);
 assert.deepEqual(utf8Bytes(all),[...new TextEncoder().encode(all)]);
});
