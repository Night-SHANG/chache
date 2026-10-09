/** Host-only preparation protocol. No product import, bundle execution, or storage access. */
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
export const sha256=value=>createHash('sha256').update(value).digest('hex');
export const MUSIC_SHA='63ae1249b7da1931cc536cac435ff2738ec55718eee0d10e579c8c650b88c1da';
export const VIEWPORTS=[{width:360,height:800,safeTop:24,dpr:2},{width:540,height:960,safeTop:0,dpr:1},{width:1200,height:900,safeTop:0,dpr:1}];
export const SHELLS=['wood','reinforced','taped','toy_brick','paper_fold','insulated','space_case'];
export const EXACT_SENTENCE='加急数字按后续成功放置次数倒数，不是倒计时';
export function assertManifestPair(browser,wechat,binding,mode='playtest-free'){
 assert.deepEqual(browser,wechat,'Both targets must have identical manifest policy and source binding');
 assert.equal(wechat.version,'0.17.0-dev');assert.equal(wechat.shopPricingMode,mode);assert.equal(wechat.developerDiagnostics,false);
 assert.equal(wechat.commit,binding.expectedCommit);assert.equal(wechat.sourceSha256,binding.expectedSourceSha256);
 assert.equal(wechat.backgroundMusic.sha256,MUSIC_SHA);assert.equal(wechat.backgroundMusic.defaultVolume,.18);
 assert.deepEqual(wechat.soundEffects,{browserVolume:.45,wechatVolume:1});assert.equal(wechat.cosmetics.catalogSize,28);
 assert.equal(wechat.modes.rush.maxToolTypes,2);return wechat;
}
export function assertOwnerBinding(binding){
 for(const name of ['expectedCommit'])assert.match(binding[name]??'',/^[a-f0-9]{40}$/,`${name}: exact owner value required`);
 for(const name of ['expectedSourceSha256','expectedGameJsSha256','expectedBrowserJsSha256'])assert.match(binding[name]??'',/^[a-f0-9]{64}$/,`${name}: exact owner value required`);
 assert.equal(binding.ownerFrozen,true,'Owner must explicitly authorize the frozen source snapshot');
 assert.equal(binding.aggregateChecksPassed,true,'Aggregate verification must precede host acceptance');
 assert.ok(binding.freeBuildRoot&&binding.paidBuildRoot,'Separate free and paid artifacts are required');
 assert.notEqual(resolve(binding.freeBuildRoot),resolve(binding.paidBuildRoot),'Paid check must never overwrite final free artifact');
 assert.match(binding.expectedPaidGameJsSha256??'',/^[a-f0-9]{64}$/,'Exact isolated paid bundle hash required');
}
export function waveTimeline(waves){return Array.from({length:waves},(_,wave)=>[0,350,700].map(elapsed=>({wave,elapsed,absoluteMs:wave*1000+elapsed}))).flat().concat({wave:waves,elapsed:0,absoluteMs:waves*1000});}
/** Six interior logical samples avoid the closed shutter's 2px horizontal ribs at all declared scales. */
export function sampleEastGatePatch(readPixel){return [995,997,999].flatMap(x=>[995,997].map(y=>({x,y,rgba:readPixel(x,y)})));}
export function assertNaturalPixels(row){
 const wave=row.wave,old=wave<2;
 assert.deepEqual(row.cards.map(card=>card.cargo),old?['化工','机械']:['机械','化工'],'Actual slot cargo labels');
 assert.deepEqual(row.cards.map(card=>card.dock),['北门','东门']);
 assert.deepEqual(row.cards.map(card=>card.strong),wave===0?[false,true]:wave===1?[true,false]:[false,false],'Exactly the active old order has strong green paint');
 if(wave===1)assert.ok(row.cards[1].labels.includes('已出货'),'Second-wave east card is completed, not active');
 const expected={north:wave===2?[118,167,77,255]:[239,185,56,255],east:wave===0?[118,167,77,255]:wave===1?[75,83,91,255]:[239,185,56,255]};
 for(const gate of ['north','east'])for(let i=0;i<4;i++)assert.ok(Math.abs(row.gates[gate][i]-expected[gate][i])<=2,`Actual ${gate} gate channel ${i}: ${row.gates[gate]} != ${expected[gate]}`);
 if(row.eastGatePatch){assert.equal(row.eastGatePatch.length,6,'Closed-gate proof requires six interior samples');for(const sample of row.eastGatePatch)for(let channel=0;channel<4;channel++)assert.ok(Math.abs(sample.rgba[channel]-expected.east[channel])<=2,`East gate patch ${sample.x},${sample.y}: ${sample.rgba} != ${expected.east}`);}
 assert.equal(row.checksum,'31c7e4cc');return row;
}
export function traceSummary(drivers){return drivers.map((d,i)=>({id:i+1,viewport:d.h.viewport,inputs:d.nativeInputs,commands:d.trace,audio:d.h.audioTrace,storageOperations:d.h.operations,finalStorageDigests:[...d.h.storage].map(([key,value])=>({key,sha256:sha256(value)}))}));}
