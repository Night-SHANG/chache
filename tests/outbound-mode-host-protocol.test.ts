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
