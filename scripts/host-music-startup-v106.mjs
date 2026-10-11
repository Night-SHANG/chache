/** Executes unchanged production bundles with deterministic audio host outcomes, not real-device acoustics. */
import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createPaginatedBrowserHost} from './paginated-cosmetics-browser-host.mjs';
import {createGrowthHost,validateResumeStorage} from './growth-host-support.mjs';
import {cosmeticAccountStorage} from './cosmetic-stage15-host-support.mjs';
import {attachPixelWitness} from './refinement-host-support.mjs';
import {PaginatedCosmeticsDriver} from './paginated-cosmetics-host-runtime.mjs';
import {ACCOUNT_KEYS,encodeAccount} from '../src/application/account-store.ts';
const arg=name=>{const i=process.argv.indexOf(name);return i<0?undefined:process.argv[i+1];};
const build=resolve(arg('--build')??'build'),out=resolve(arg('--out')??'artifacts/v106-music-startup');
const report={status:'RUNNING',kind:'Unmodified production bundles with native Canvas and simulated audio outcomes',limitations:['Not a real browser, WeChat developer tool, physical phone or APK test. Audio play requests and lifecycle are verified; audible output is not.'],cases:[],failures:[]};
const settle=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};
function audioFixture(target,rejectFirst=false){
 const rows=[];let reject=rejectFirst;
 const create=(src='')=>{
  const row={src,loop:false,volume:1,plays:0,pauses:0,audible:false,currentTime:0};rows.push(row);let error=()=>{};
  return Object.assign(row,{play(){row.plays++;if(reject){reject=false;if(target==='browser')return Promise.reject(Error('host autoplay policy rejected'));queueMicrotask(error);return;}row.audible=true;return target==='browser'?Promise.resolve():undefined;},pause(){row.pauses++;row.audible=false;},stop(){row.audible=false;row.currentTime=0;},destroy(){},onError(fn){error=fn;},addEventListener(name,fn){if(name==='error')error=fn;}});
 };
 return {rows,create,music:()=>rows.filter(row=>row.src==='assets/bgm.mp3')};
}
function storage(music=true){const data=cosmeticAccountStorage({wallet:244,label:'FUNDED: Isolated v106 audio startup fixture'});const account=validateResumeStorage(data).account;account.profile.settings.music=music;const raw=encodeAccount(account);data.set(ACCOUNT_KEYS.a,raw);data.set(ACCOUNT_KEYS.b,raw);return data;}
async function host(target,{data=storage(),reject=false}={}){
 const audio=audioFixture(target,reject),bundlePath=resolve(build,`${target}/${target==='browser'?'app':'game'}.js`),options={bundlePath,storage:data,width:540,height:960,dpr:1,audioFactory:audio.create};
 const h=target==='browser'?await createPaginatedBrowserHost(options):await createGrowthHost({...options,deferImageLoads:true});await settle();h.frame(0);const d=new PaginatedCosmeticsDriver(attachPixelWitness(h),out,[],Date.parse('2026-10-11T00:00:00Z'));return {h,d,audio};
}
async function check(name,fn){try{report.cases.push({name,...await fn()});}catch(error){report.failures.push({name,error:String(error),stack:error.stack});}}
for(const target of ['browser','wechat']){
 const manifest=JSON.parse(await readFile(resolve(build,target,'build-manifest.json'),'utf8'));assert.equal(manifest.developerDiagnostics,false);assert.equal(manifest.shopPricingMode,'paid');assert.equal(manifest.version,'1.0.6');
 await check(`${target}-startup-allow-repeat-lifecycle-settings`,async()=>{
  const {h,d,audio}=await host(target);assert.equal(audio.music().length,1);const music=audio.music()[0];assert.equal(music.plays,1);assert.equal(music.audible,true);assert.equal(music.loop,true);assert.equal(music.volume,0.18);
  for(let i=0;i<30;i++){h.frame(h.time+16);h.tap(10,10);}assert.equal(music.plays,1);
  h.callbacks.hide();h.callbacks.hide();assert.equal(music.audible,false);h.callbacks.show();h.callbacks.show();assert.equal(music.plays,2);assert.equal(music.audible,true);
  d.action({type:'settings'});d.screen='settings';d.frame();d.action({type:'toggleMusic'});assert.equal(music.audible,false);const count=music.plays;h.callbacks.hide();h.callbacks.show();h.tap(10,10);assert.equal(music.plays,count);assert.equal(h.account().account.profile.settings.music,false);
  const cold=await host(target,{data:new Map(h.storage)});assert.equal(cold.audio.music().length,0);
  d.action({type:'toggleMusic'});assert.equal(music.audible,true);assert.equal(audio.music().length,1);
  d.action({type:'back'});d.screen='menu';d.frame();d.action({type:'chooseInbound'});d.action({type:'newRun',mode:'standard',inboundDifficulty:'hard'});d.action({type:'prepareNext'});d.pause();assert.equal(music.audible,false);d.action({type:'continue'});assert.equal(music.audible,true);
  h.callbacks.hide();assert.equal(music.audible,false);h.callbacks.show();assert.equal(music.audible,false);d.paused=true;d.frame();d.action({type:'continue'});assert.equal(music.audible,true);
  const saved=await host(target,{data:new Map(h.storage)});assert.equal(saved.audio.music().length,0);saved.h.tap(10,10);assert.equal(saved.audio.music().length,0);saved.d.resume();assert.equal(saved.audio.music().length,1);
  assert.equal(audio.music().length,1);return {bundleSha256:h.gameJsSha256,autoplayBeforeGesture:true,singleContext:true,mutedColdStart:true,pausedSavedStart:true,menuResume:true,gameRequiresResume:true};
 });
 await check(`${target}-startup-rejection-gesture-retry`,async()=>{
  const {h,audio}=await host(target,{reject:true});const music=audio.music()[0];assert.equal(music.plays,1);assert.equal(music.audible,false);for(let i=0;i<30;i++)h.frame(h.time+16);h.callbacks.show();h.pointer('move',10,10);h.pointer('up',10,10);assert.equal(music.plays,1);
  h.tap(10,10);await settle();assert.equal(music.plays,2);assert.equal(music.audible,true);for(let i=0;i<30;i++)h.tap(10,10);assert.equal(music.plays,2);assert.equal(audio.music().length,1);
  return {bundleSha256:h.gameJsSha256,oneStartupAttempt:true,noFrameRetry:true,firstGestureRetry:true,singleContext:true};
 });
}
report.status=report.failures.length?'FAIL':'PASS';await mkdir(out,{recursive:true});await writeFile(resolve(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));if(report.failures.length)process.exitCode=1;
