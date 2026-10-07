import test from 'node:test';
import assert from 'node:assert/strict';
import {outboundModeRecordStorage,outboundModeHudStorage,outboundRecordScores} from '../scripts/host-outbound-mode-switch.mjs';
import {validateResumeStorage} from '../scripts/growth-host-support.mjs';

test('outbound mode native-host record fixtures separate variants, old rules, guides, absent best and real zero',()=>{
 const account=validateResumeStorage(outboundModeRecordStorage()).account!;
 assert.equal(account.run,null);assert.equal(account.profile.results['outbound.v12.easy.tools']!.best!.score,0);assert.equal(account.profile.results['outbound.v12.normal.tools'],undefined);
 assert.equal(account.profile.results['outboundEndless.v13.easy.tools'],undefined);assert.equal(account.profile.results['outboundEndless.v13.normal.tools']!.best!.score,0);
 assert.equal(account.profile.results['outboundEndless.v13.easy.plain']!.maxUnits,50);assert.equal(account.profile.results['outboundEndless.v13.easy.plain']!.best!.units,5);
 for(const [index,difficulty]of (['easy','normal','hard','expert'] as const).entries())for(const mode of ['normal','endless'] as const){const prefix=mode==='normal'?'outbound.v12':'outboundEndless.v13';assert.equal(account.profile.results[`${prefix}.${difficulty}.plain`]!.best!.score,outboundRecordScores[mode].plain[index]);}
 assert.equal(account.profile.results['outbound.v8.easy']!.best!.score,999999);assert.equal(account.profile.results['outboundGuided.v12.easy.plain']!.best!.score,888888);
});
test('native HUD fixtures are strict verified current saves with explicit finite or infinite identity',()=>{
 for(const family of ['inbound','outbound'] as const)for(const mode of ['normal','endless'] as const){const run=validateResumeStorage(outboundModeHudStorage(family,mode)).account!.run!;assert.equal(run.state.phase,'input');assert.equal(run.state.completedOrders,11);assert.equal(run.state.shift,2);assert.equal(run.identity.rulesetVersion,family==='inbound'?14:mode==='normal'?12:13);assert.equal(run.identity.mode,family==='inbound'?mode==='normal'?'standard':'endless':mode==='normal'?'outbound':'outboundEndless');assert.equal(run.identity.economyVersion,2);}
 for(const family of ['inbound','outbound'] as const){const run=validateResumeStorage(outboundModeHudStorage(family,'endless',{units:42,shift:5})).account!.run!;assert.equal(run.state.phase,'input');assert.equal(run.state.completedOrders,42);assert.equal(run.state.shift,5);}
});

import {createCanvas} from '@napi-rs/canvas';
import {outboundZeroRecordFixture,unitStripEvidence,assertUnitStripEvidence} from '../scripts/host-outbound-mode-switch.mjs';
import {createAccountService,type AccountRequest} from '../src/application/account-service.ts';

test('zero-record host fixtures produce true zero only after blocked failure or explicit retirement, while abandonment stays absent',()=>{
 for(const mode of ['normal','endless'] as const)for(const used of [false,true]){
  const fixture=outboundZeroRecordFixture(mode),storage={get:(key:string)=>fixture.storage.get(key)??null,set:(key:string,value:string)=>{fixture.storage.set(key,value);},remove:(key:string)=>{fixture.storage.delete(key);},listKeys:(prefix:string)=>[...fixture.storage.keys()].filter(key=>key.startsWith(prefix))},service=createAccountService(storage,{status:'held',release(){}},()=>0);
  const runId=service.getSnapshot()!.run!.identity.runId;
  const send=(request:Omit<AccountRequest,'operationId'>)=>{const before=service.getSnapshot()!,result=service.transact({...request,operationId:`zero.protocol.${before.generation}`} as AccountRequest,before.generation);assert.equal(result.status,'acknowledged');};
  if(used)send({type:'command',runId,command:{type:'clear',cells:[fixture.clearCell]}} as Omit<AccountRequest,'operationId'>);
  if(mode==='normal')send({type:'command',runId,command:fixture.finishCommand} as Omit<AccountRequest,'operationId'>);
  send({type:'close',runId,reason:mode==='normal'?'failed':'retired'} as Omit<AccountRequest,'operationId'>);
  const account=service.getSnapshot()!,prefix=mode==='normal'?'outbound.v12':'outboundEndless.v13',policy=used?'tools':'plain';
  assert.equal(account.run,null);assert.equal(account.lastClosedResult!.reason,mode==='normal'?'blocked':'retired');assert.equal(account.lastClosedResult!.score,0);assert.equal(account.profile.results[`${prefix}.normal.${policy}`]!.best!.score,0);assert.equal(account.profile.results[`${prefix}.normal.${used?'plain':'tools'}`],undefined);assert.equal(account.inventory.clear,used?0:1);
 }
 const fixture=outboundZeroRecordFixture('normal'),storage={get:(key:string)=>fixture.storage.get(key)??null,set:(key:string,value:string)=>{fixture.storage.set(key,value);},remove:(key:string)=>{fixture.storage.delete(key);}},service=createAccountService(storage,{status:'held',release(){}},()=>0),account=service.getSnapshot()!;
 assert.equal(service.transact({type:'close',runId:account.run!.identity.runId,reason:'home',operationId:'zero.protocol.abandon'},account.generation).status,'acknowledged');assert.deepEqual(service.getSnapshot()!.profile.results,{});
});

test('six-unit pixel evidence tolerates the ambient beam but rejects real progress pixels in infinite mode',()=>{
 for(const [w,h,safe,dpr]of [[360,800,24,2],[540,960,0,1],[1200,900,0,1]]){
  const canvas=createCanvas(w*dpr,h*dpr),context=canvas.getContext('2d'),scale=Math.min(w/1080,(h-safe)/1920),ox=(w-1080*scale)/2,oy=safe+(h-safe-1920*scale)/2;
  context.setTransform(scale*dpr,0,0,scale*dpr,ox*dpr,oy*dpr);context.fillStyle='#212f40';context.fillRect(0,0,1080,1920);context.fillStyle='rgba(221,158,71,.07)';context.beginPath();context.moveTo(440,0);context.lineTo(180,520);context.lineTo(900,520);context.lineTo(640,0);context.fill();
  const host={viewport:{w,h,safe,dpr},context},blank=unitStripEvidence(host);assert.notDeepEqual(blank[0].bar,blank[5].bar,'Fixture contains the same ambient background split as the actual failed screenshots');assert.doesNotThrow(()=>assertUnitStripEvidence(blank,false));assert.throws(()=>assertUnitStripEvidence(blank,true),/finite/);
  for(let i=0;i<6;i++){context.fillStyle=i<5?'#ffc74d':'#111c27';context.fillRect(180+i*43,281,35,16);}
  const finite=unitStripEvidence(host);assert.doesNotThrow(()=>assertUnitStripEvidence(finite,true));assert.throws(()=>assertUnitStripEvidence(finite,false),/Infinite/);
 }
});
