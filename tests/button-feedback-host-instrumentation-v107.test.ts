import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createGrowthHost} from '../scripts/growth-host-support.mjs';
import {createPaginatedBrowserHost} from '../scripts/paginated-cosmetics-browser-host.mjs';

// These minimal bundles test only host plumbing, never stand in for production gameplay evidence.
test('wx host optionally observes the original short-haptic arguments without modifying bundle bytes',async()=>{
 const folder=await mkdtemp(join(tmpdir(),'v107-wx-host-'));
 try{
  const file=join(folder,'game.js'),source="wx.createCanvas();for(const name of ['onTouchStart','onTouchMove','onTouchEnd','onTouchCancel','onHide','onShow'])wx[name](()=>{});wx.vibrateShort?.({type:'light',fail:()=>{}});requestAnimationFrame(()=>{});";
  await writeFile(file,source);const calls:unknown[]=[];await createGrowthHost({bundlePath:file,vibrate:(options:unknown)=>calls.push(options)});
  assert.equal(calls.length,1);assert.equal((calls[0] as {type:string}).type,'light');assert.equal(typeof (calls[0] as {fail:unknown}).fail,'function');assert.equal(await readFile(file,'utf8'),source);
  await createGrowthHost({bundlePath:file});assert.equal(calls.length,1);
 }finally{await rm(folder,{recursive:true,force:true});}
});
test('browser host exposes a real blur event and optional native vibration callback without modifying bundle bytes',async()=>{
 const folder=await mkdtemp(join(tmpdir(),'v107-browser-host-'));
 try{
  const file=join(folder,'app.js'),source="navigator.vibrate?.(15);window.addEventListener('blur',()=>navigator.vibrate?.(3));window.requestAnimationFrame(()=>{});";
  await writeFile(file,source);const calls:number[]=[];const host=await createPaginatedBrowserHost({bundlePath:file,vibrate:(duration:number)=>{calls.push(duration);return false;}});
  assert.deepEqual(calls,[15]);assert.equal(typeof host.callbacks.blur,'function');host.callbacks.blur();assert.deepEqual(calls,[15,3]);assert.equal(await readFile(file,'utf8'),source);
  const defaults=await createPaginatedBrowserHost({bundlePath:file});defaults.callbacks.blur();assert.deepEqual(calls,[15,3]);
 }finally{await rm(folder,{recursive:true,force:true});}
});
