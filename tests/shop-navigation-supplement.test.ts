import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './helpers/shop-navigation-driver-harness.mjs';
import {probeNativeModeStartEdges,runShopGameplaySupplement,constructedFiveContinuation} from '../scripts/shop-navigation-gameplay-supplement.mjs';
import {validateResumeStorage} from '../scripts/growth-host-support.mjs';

test('draft supplemental game.js driver edges agree with real source pointer controller',()=>{
 const {d,check}=fixture();d.action({type:'chooseInbound'});assert.equal(probeNativeModeStartEdges(d).length,3);check();d.action({type:'home'});d.action({type:'chooseColorTier'});assert.equal(probeNativeModeStartEdges(d).length,4);check();
});
test('draft constructed continuation fixtures validate and require a real final placement',()=>{
 for(const tier of ['hard','expert']){const f=constructedFiveContinuation(tier),a=validateResumeStorage(f.storage).account;assert.ok(a?.run);assert.equal(a.run.state.completedOrders,29);assert.equal(a.run.state.phase,'input');assert.equal(a.run.identity.inboundDifficulty,tier);assert.match(f.label,/CONSTRUCTED/);}
});
test('draft gameplay supplement uses real source session pointers for launches tools resumes and continuation',async()=>{
 const rows:{name:string;rows:unknown[]}[]=[];await runShopGameplaySupplement({mode:'paid',run:async(name,fn)=>{rows.push({name,...await fn()});},driver:async(storage)=>fixture(storage).d,capture:async()=>({kind:'Source-session smoke only; no native acceptance claim'})});
 assert.equal(rows.length,2);assert.equal(rows[0].rows.length,5);assert.equal(rows[1].rows.length,2);
});
