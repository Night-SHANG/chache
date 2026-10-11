import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
const source=resolve(process.argv[2]??'.'),build=resolve(process.argv[3]??`${source}/build`),out=resolve(process.argv[4]??'qa/v108/independent');
const imp=p=>import(`${source}/${p}`),target=process.env.TARGET??'browser';
const {createPaginatedBrowserHost}=await imp('scripts/paginated-cosmetics-browser-host.mjs');
const {createGrowthHost,validateResumeStorage}=await imp('scripts/growth-host-support.mjs');
const {shopNavigationFixtureStorage}=await imp('scripts/shop-navigation-host-runtime.mjs');
const {attachPixelWitness}=await imp('scripts/refinement-host-support.mjs');
const {PaginatedCosmeticsDriver}=await imp('scripts/paginated-cosmetics-host-runtime.mjs');
const {ACCOUNT_KEYS,encodeAccount}=await imp('src/application/account-store.ts');
const {playableChecksum}=await imp('src/domain/playable.ts');
const report={status:'RUNNING',target,source,build,cases:[],failures:[],limitations:['Unmodified production bundles executed in simulated DOM/wx hosts with native Canvas. No real-device listening or WeChat developer-tools claim.']};
const check=async(name,fn)=>{try{report.cases.push({name,status:'PASS',...await fn()});}catch(error){report.failures.push({name,error:String(error),stack:error.stack});console.error(name,error);}};
const hash=b=>createHash('sha256').update(b).digest('hex');
const settle=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};
function audioFixture(rejectFirst=false){
 let reject=rejectFirst,clock=()=>0;const rows=[],events=[];
 const create=(initialSrc='')=>{
  const row={src:initialSrc,loop:false,volume:1,plays:0,pauses:0,stops:0,audible:false,currentTime:0,volumeWrites:[],sourceWrites:[]};rows.push(row);let err=()=>{},volume=1,src=initialSrc;
  Object.defineProperty(row,'volume',{get:()=>volume,set:v=>{volume=v;row.volumeWrites.push(v);events.push({kind:'volume',src,value:v,time:clock()});}});
  Object.defineProperty(row,'src',{get:()=>src,set:v=>{src=v;row.sourceWrites.push(v);events.push({kind:'src',src,time:clock()});}});
  return Object.assign(row,{play(){row.plays++;events.push({kind:'play',src,time:clock()});if(reject){reject=false;if(target==='browser')return Promise.reject(Error('autoplay denied'));queueMicrotask(err);return;}row.audible=true;return target==='browser'?Promise.resolve():undefined;},pause(){row.pauses++;row.audible=false;events.push({kind:'pause',src,time:clock()});},stop(){row.stops++;row.audible=false;row.currentTime=0;events.push({kind:'stop',src,time:clock()});},destroy(){},onError(fn){err=fn;},addEventListener(name,fn){if(name==='error')err=fn;}});
 };
 return {rows,events,create,setClock:f=>clock=f,music:()=>rows.filter(r=>r.src==='assets/bgm.mp3')};
}
const storage=()=>shopNavigationFixtureStorage(20000);
async function host({data=storage(),reject=false}={}){
 const audio=audioFixture(reject),bundlePath=resolve(build,target,target==='browser'?'app.js':'game.js'),options={bundlePath,storage:data,width:540,height:960,dpr:1,audioFactory:audio.create};
 const h=target==='browser'?await createPaginatedBrowserHost(options):await createGrowthHost({...options,deferImageLoads:true});audio.setClock(()=>h.time);await settle();await h.settleImages();
 const d=new PaginatedCosmeticsDriver(attachPixelWitness(h),out,[],Date.parse('2026-10-11T00:00:00Z'));const view=d.view.bind(d);d.view=()=>({...view(),helpTopic:'inbound',helpFromHome:false});
 return {h,d,audio};
}
const volume=(music,expected)=>{assert.equal(music.volume,expected);assert.equal(music.audible,true);};
const continued=(audio,music,plays,position)=>{assert.equal(audio.music().length,1);assert.equal(music.plays,plays);assert.equal(music.currentTime,position);};
const start=d=>{d.action({type:'chooseInbound'});d.action({type:'newRun',mode:'standard',inboundDifficulty:'hard'});d.action({type:'prepareNext'});};
const manifest=JSON.parse(await readFile(resolve(build,target,'build-manifest.json'),'utf8'));
assert.equal(manifest.developerDiagnostics,false);assert.equal(manifest.shopPricingMode,'paid');assert.equal(manifest.version,'1.0.8');
report.manifest=manifest;report.bundleSha256=hash(await readFile(resolve(build,target,target==='browser'?'app.js':'game.js')));
let activeStorage;
await check('startup-pause-help-settings-return-background-fast-toggle-home',async()=>{
 const {h,d,audio}=await host();assert.equal(audio.music().length,1);const music=audio.music()[0];volume(music,.18);assert.equal(music.plays,1);assert.equal(music.loop,true);
 start(d);const checksum=playableChecksum(d.state()),accountBefore=structuredClone(h.account().account),plays=music.plays,sourceWrites=music.sourceWrites.length;music.currentTime=123.456;
 d.pause();assert.ok(h.labels.some(l=>l.text==='已暂停'));volume(music,.12);continued(audio,music,plays,123.456);
 d.action({type:'help'});d.screen='colorIntro';d.frame();volume(music,.12);continued(audio,music,plays,123.456);
 d.action({type:'helpBack'});d.screen='game';d.frame();assert.ok(h.labels.some(l=>l.text==='已暂停'));volume(music,.12);continued(audio,music,plays,123.456);
 d.action({type:'settings'});d.screen='settings';d.frame();volume(music,.12);continued(audio,music,plays,123.456);
 d.frame(100);const rapidStart=audio.events.length;for(let i=0;i<8;i++){d.action({type:'toggleMotion'});d.frame(44);}const rapidClicks=audio.events.slice(rapidStart).filter(e=>e.kind==='play'&&e.src.endsWith('ui_click.wav'));assert.equal(rapidClicks.length,8);for(let i=1;i<rapidClicks.length;i++)assert.equal(rapidClicks[i].time-rapidClicks[i-1].time,60);assert.equal(audio.rows.filter(r=>r.src==='assets/ui_click.wav').length,1);volume(music,.12);continued(audio,music,plays,123.456);
 const beforeMute=audio.events.filter(e=>e.kind==='play'&&e.src.endsWith('.wav')).length;
 d.frame(100);d.action({type:'toggleSound'});assert.equal(h.account().account.profile.settings.sound,false);assert.equal(audio.events.filter(e=>e.kind==='play'&&e.src.endsWith('.wav')).length,beforeMute);volume(music,.12);
 d.frame(100);d.action({type:'toggleSound'});assert.equal(h.account().account.profile.settings.sound,true);assert.equal(audio.events.filter(e=>e.kind==='play'&&e.src.endsWith('.wav')).length,beforeMute);volume(music,.12);
 d.action({type:'toggleMusic'});assert.equal(music.audible,false);const offPlays=music.plays;h.callbacks.hide();h.callbacks.show();h.tap(1,1);assert.equal(music.plays,offPlays);assert.equal(music.audible,false);
 d.action({type:'toggleMusic'});volume(music,.12);assert.equal(music.plays,offPlays+1);assert.equal(audio.music().length,1);
 d.action({type:'back'});d.screen='game';d.frame();volume(music,.12);assert.ok(h.labels.some(l=>l.text==='已暂停'));
 d.action({type:'continue'});volume(music,.18);const normalPlays=music.plays;assert.equal(music.currentTime,123.456);
 for(let i=0;i<12;i++){d.pause();volume(music,.12);d.action({type:'continue'});volume(music,.18);continued(audio,music,normalPlays,123.456);}
 assert.equal(playableChecksum(d.state()),checksum);assert.equal(h.account().account.wallet,accountBefore.wallet);assert.deepEqual(h.account().account.inventory,accountBefore.inventory);assert.deepEqual(h.account().account.profile.cosmetics,accountBefore.profile.cosmetics);
 h.callbacks.hide();assert.equal(music.audible,false);const hiddenPlays=music.plays;h.callbacks.hide();h.frame(h.time+16);assert.equal(music.plays,hiddenPlays);h.callbacks.show();d.paused=true;d.frame();volume(music,.12);assert.equal(music.plays,hiddenPlays+1);h.callbacks.show();assert.equal(music.plays,hiddenPlays+1);assert.ok(h.labels.some(l=>l.text==='已暂停'));assert.equal(music.currentTime,123.456);
 d.action({type:'continue'});volume(music,.18);assert.equal(music.plays,hiddenPlays+1);activeStorage=new Map(h.storage);
 d.pause();d.action({type:'home'});d.screen='game';d.confirmation={kind:'leaveRun',nextScreen:'menu'};d.frame();volume(music,.12);d.action({type:'confirm'});d.screen='menu';d.paused=false;d.frame();volume(music,.18);assert.equal(h.account().account.run,null);
 d.action({type:'chooseInbound'});d.action({type:'newRun',mode:'endless',inboundDifficulty:'hard'});d.action({type:'prepareNext'});await d.retire();assert.ok(h.labels.some(l=>l.text.includes('结算')));volume(music,.18);assert.equal(music.sourceWrites.length,sourceWrites);assert.equal(audio.music().length,1);return {sameTrackPosition:music.currentTime,oneMusicHandle:true,pauseGain:.12,normalGain:.18,rapidPauseResumeCycles:12,rapidClickReplaysAt60ms:8,musicPlayCalls:music.plays,sourceReassignments:music.sourceWrites.length-sourceWrites};
});
await check('cold-saved-run-needs-resume-is-silent',async()=>{
 assert.ok(activeStorage);const {h,d,audio}=await host({data:new Map(activeStorage)});assert.equal(audio.music().length,0);const before=new Map(h.storage);h.tap(1,1);h.callbacks.hide();h.callbacks.show();h.frame(h.time+16);assert.equal(audio.music().length,0);assert.deepEqual(h.storage,before);d.resume();assert.equal(audio.music().length,1);volume(audio.music()[0],.18);assert.equal(audio.music()[0].plays,1);return {silentUntilExplicitResume:true};
});
await check('music-disabled-cold-start-and-enable-in-pause',async()=>{
 const data=new Map(activeStorage??storage()),account=validateResumeStorage(data).account;account.profile.settings.music=false;const raw=encodeAccount(account);data.set(ACCOUNT_KEYS.a,raw);data.set(ACCOUNT_KEYS.b,raw);
 const {h,d,audio}=await host({data});assert.equal(audio.music().length,0);d.resume();assert.equal(audio.music().length,0);d.pause();d.action({type:'settings'});d.screen='settings';d.frame();d.action({type:'toggleMusic'});assert.equal(audio.music().length,1);volume(audio.music()[0],.12);assert.equal(audio.music()[0].plays,1);return {disabledDoesNotCreate:true,pausedEnableVolume:.12};
});
await check('autoplay-rejection-no-frame-or-show-loop-and-one-gesture-retry',async()=>{
 const {h,audio}=await host({reject:true});const music=audio.music()[0];assert.equal(music.plays,1);assert.equal(music.audible,false);for(let i=0;i<20;i++)h.frame(h.time+16);h.callbacks.hide();h.callbacks.show();h.pointer('move',1,1);h.pointer('up',1,1);assert.equal(music.plays,1);h.tap(1,1);await settle();volume(music,.18);assert.equal(music.plays,2);for(let i=0;i<20;i++)h.tap(1,1);assert.equal(music.plays,2);assert.equal(audio.music().length,1);return {autoplayAttempts:1,gestureRetries:1};
});
await check('corrupt-account-root-blocker-overrides-foreground-and-gestures',async()=>{
 const data=storage();data.set(ACCOUNT_KEYS.a,'{deliberately corrupt isolated QA fixture');data.set(ACCOUNT_KEYS.b,'{deliberately corrupt isolated QA fixture');const before=[...data];
 const {h,audio}=await host({data});assert.notEqual(h.account().status,'ready');assert.equal(audio.music().length,0);for(let i=0;i<10;i++){h.tap(1,1);h.frame(h.time+16);}h.callbacks.hide();h.callbacks.show();h.frame(h.time+16);assert.equal(audio.music().length,0);assert.deepEqual([...data],before);return {blockedRootStatus:h.account().status,noPlayback:true,noStorageWrites:true};
});
report.status=report.failures.length?'FAIL':'PASS';await mkdir(out,{recursive:true});await writeFile(resolve(out,`host-audio-${target}.json`),JSON.stringify(report,null,2));console.log(JSON.stringify({status:report.status,target,cases:report.cases.length,failures:report.failures.length,bundleSha256:report.bundleSha256}));if(report.failures.length)process.exitCode=1;
