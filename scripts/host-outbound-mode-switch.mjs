/** Outbound-mode native wx/Canvas selector and infinite-HUD evidence from owner-bound game.js. */
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {Driver} from './host-refinement.mjs';
import {verifyFinalEconomyBinding,createBoundFinalEconomyHost,finalEconomyFixtureStorage} from './final-economy-host-support.mjs';
import {growthSourceHash,sha256,assertVisibleGlyphs,validateResumeStorage} from './growth-host-support.mjs';
import {attachPixelWitness,physicalRect,assertTextPaint} from './refinement-host-support.mjs';
import {ACCOUNT_KEYS,encodeAccount} from '../src/application/account-store.ts';
import {makeAccountFixture} from '../tests/helpers/account-fixtures.ts';
import {createPlayableRun,applyPlayableCommand,playableChecksum} from '../src/domain/playable.ts';
import {refreshOrdersV14} from '../src/domain/v14/generation.ts';

const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const difficulties=['easy','normal','hard','expert'],modes=['normal','endless'];
const noTools=()=>({rotate:0,clear:0,wildcard:0});
const outSpec=(difficultyId,variant)=>({family:'outbound',variant,rulesetVersion:variant==='endless'?13:12,seed:17,difficultyId,toolCharges:noTools()});
const writes=h=>h.operations.filter(o=>o.kind==='set'||o.kind==='remove');
const stableState=state=>{const answer=structuredClone(state);delete answer.elapsedMs;return answer;};
const encodedRoots=h=>Object.fromEntries([ACCOUNT_KEYS.a,ACCOUNT_KEYS.b].map(key=>[key,h.storage.get(key)]));
const scoreText=n=>n===undefined?'暂无':n.toLocaleString('en-US');
export const outboundRecordScores={normal:{plain:[125,225,325,425],tools:[0,undefined,375,450]},endless:{plain:[725,825,925,1025],tools:[undefined,0,975,1050]}};
export function outboundModeRecordStorage(){
 const account=makeAccountFixture({formatVersion:2,economyVersion:2,dailyRewards:{},epoch:'outbound.mode.records',generation:1,lastOperation:{operationId:'fixture.records',expectedGeneration:0,requestDigest:'fixture',committedGeneration:1}});
 for(const mode of modes)for(const [index,difficulty] of difficulties.entries())for(const policy of ['plain','tools']){
  const score=outboundRecordScores[mode][policy][index];if(score===undefined)continue;
  const key=`${mode==='normal'?'outbound.v12':'outboundEndless.v13'}.${difficulty}.${policy}`;
  account.profile.results[key]={runs:2,units:55+index*10,maxUnits:50+index*10,score:score*2,wins:0,retirements:2,maxChain:1,best:{score,units:5,chain:1}};
 }
 // Old rules and guided records are deliberately larger, so accidental fallback is visible.
 account.profile.results['outbound.v8.easy']={runs:1,units:1,maxUnits:1,score:999999,wins:0,retirements:1,maxChain:1,best:{score:999999,units:1,chain:1}};
 account.profile.results['outboundGuided.v12.easy.plain']={runs:1,units:1,maxUnits:1,score:888888,wins:0,retirements:1,maxChain:1,best:{score:888888,units:1,chain:1}};
 const raw=encodeAccount(account),storage=new Map([[ACCOUNT_KEYS.a,raw],[ACCOUNT_KEYS.b,raw]]);validateResumeStorage(storage);return storage;
}
export function outboundModeHudStorage(family,mode,{units=11,shift=2}={}){
 const spec=family==='outbound'?outSpec('normal',mode):{family:'inbound',mode:mode==='endless'?'endless':'standard',rulesetVersion:14,seed:17,guided:false,toolCharges:noTools()};
 let state=createPlayableRun(spec);if(family==='inbound'){const next=applyPlayableCommand(state,{type:'chooseCleanup',branch:'orders'});assert.equal(next.error,undefined);state=next.state;}
 state.completedOrders=units;state.shift=shift;if(family==='inbound')state=refreshOrdersV14(state);
 return finalEconomyFixtureStorage(spec,[],{constructedState:state,label:`CONSTRUCTED: ${family} ${mode} HUD at ${units} cumulative units and stage ${shift}; presentation-only evidence, not replay reachability`});
}
function attachHudWitness(host){
 const arc=host.context.arc.bind(host.context),frame=host.frame;host.hudArcs=[];
 host.context.arc=(x,y,r,...args)=>{if(y===260&&r===12)host.hudArcs.push({x,y,r});return arc(x,y,r,...args);};
 host.frame=(...args)=>{host.hudArcs.length=0;return frame(...args);};return host;
}
function stripPixels(h){return Array.from({length:6},(_,i)=>{const r=physicalRect(h,{x:190+i*43,y:287,w:0,h:0});return [...h.context.getImageData(Math.round(r.x),Math.round(r.y),1,1).data];});}
function tabPixels(h,rect){const r=physicalRect(h,{x:rect.x+22,y:rect.y+22,w:0,h:0});return [...h.context.getImageData(Math.round(r.x),Math.round(r.y),1,1).data];}
class ModeDriver extends Driver{
 constructor(host,out,images){super(host,out,images);this.outboundSelectionMode=[10,13].includes(this.state().rulesetVersion)?'endless':'normal';}
 view(){return {...super.view(),outboundSelectionMode:this.outboundSelectionMode};}
 paint(){this.h.pixelWitness.enabled=true;this.frame(0);assertVisibleGlyphs(this.h,'native rendered frame');}
 action(action,options){this.paint();this.assertControlVisible(action);const result=super.action(action,options);this.h.pixelWitness.enabled=false;return result;}
 select(mode){this.action({type:'selectOutboundMode',mode});this.outboundSelectionMode=mode;this.frame();}
 open(){this.action({type:'chooseColorTier'});this.screen='colorTiers';this.frame();}
 enter(difficulty,mode){
  this.action({type:'newRun',mode:'color_exit',difficultyId:difficulty,outboundMode:mode});this.guideTrack='outbound';this.prepareIntent={spec:outSpec(difficulty,mode),items:[],guide:'direct'};
  const offer=mode==='normal'&&difficulty==='easy'&&!this.h.account().account?.guides.outbound.authoredStartConsumed&&!this.h.account().account?.guides.outbound.skipped;
  this.screen=offer?'guideOffer':'prepareTools';this.frame();this.paint();for(const control of this.controls())this.assertControlVisible(control.action);this.h.pixelWitness.enabled=false;return offer;
 }
 back(){this.action({type:'back'});this.screen='colorTiers';this.prepareIntent=null;this.frame();}
 direct(){this.action({type:'directStart'});this.screen='prepareTools';this.frame();}
 start(){this.action({type:'prepareNext'});this.screen='game';this.prepareIntent=null;this.needsResume=false;this.frame();this.stateFallback=this.account().run.state;}
 async capture(name){
  this.paint();const controls=this.controls(),paint=[];
  for(const control of controls){this.assertControlVisible(control.action);const r=physicalRect(this.h,control.rect),target={width:r.w/(this.h.viewport.dpr??1),height:r.h/(this.h.viewport.dpr??1)};
   if(['selectOutboundMode','newRun'].includes(control.action.type))assert.ok(target.width>=44-.01&&target.height>=44-.01,`Touch target under44px: ${JSON.stringify(control.action)}`);
   paint.push({...control,target});
  }
  const picture=`${this.out}/${name}.png`;await writeFile(picture,await this.h.canvas.encode('png'));
  const result={picture,sha256:sha256(await readFile(picture)),gameJsSha256:this.h.gameJsSha256,viewport:this.h.viewport,controls:paint,labels:[...this.h.labels],hudArcs:[...this.h.hudArcs],stripPixels:stripPixels(this.h)};
  this.images.push(result);await writeFile(`${this.out}/${name}-glyphs.json`,JSON.stringify(result,null,2));this.h.pixelWitness.enabled=false;return result;
 }
 assertSelector(mode){
  this.paint();const controls=this.controls(),starts=controls.filter(c=>c.action.type==='newRun'),tabs=controls.filter(c=>c.action.type==='selectOutboundMode');
  assert.equal(starts.length,4);assert.deepEqual(starts.map(c=>c.action.difficultyId),difficulties);assert.ok(starts.every(c=>c.action.outboundMode===mode&&c.label==='开始'));
  assert.equal(this.h.labels.filter(g=>g.text==='开始').length,4,'Actual canvas has exactly four start labels');
  assert.equal(tabs.filter(c=>c.selected).length,1);assert.equal(tabs.find(c=>c.selected).action.mode,mode);
  for(const c of [...starts,...tabs]){this.assertControlVisible(c.action);const r=physicalRect(this.h,c.rect);assert.ok(r.w/(this.h.viewport.dpr??1)>=44-.01&&r.h/(this.h.viewport.dpr??1)>=44-.01);}
  assert.equal(this.h.labels.some(g=>/简单 ×1|中等 ×1.25|困难 ×1.5|专业 ×2/.test(g.text)),false);
  assertTextPaint(this.h,mode==='normal'?'普通 · 完成30批':'无限 · 挑战最高分');
  const pixels=tabs.map(c=>({mode:c.action.mode,rgba:tabPixels(this.h,c.rect)}));assert.notDeepEqual(pixels[0].rgba,pixels[1].rgba,'Selected and unselected tabs have visibly different final pixels');
  this.h.pixelWitness.enabled=false;return pixels;
 }
}
export async function runOutboundModeSwitchHostQA({out='artifacts/outbound-mode-switch-host',expectedCommit,expectedSourceSha256,expectedGameJsSha256}={}){
 await mkdir(out,{recursive:true});const manifest=JSON.parse(await readFile('build/wechat/build-manifest.json','utf8'));
 const binding={commit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),expectedCommit,sourceSha256:await growthSourceHash(),expectedSourceSha256,manifestSourceSha256:manifest.sourceSha256,gameJsSha256:sha256(await readFile('build/wechat/game.js')),expectedGameJsSha256};verifyFinalEconomyBinding(binding);
 const cases=[],images=[],drivers=[],viewports=[{width:360,height:800,safeTop:24,dpr:2},{width:540,height:960},{width:1200,height:900}];
 const report={status:'RUNNING',kind:'Actual owner-bound unmodified game.js in strict native wx/Canvas VM; touch and final-pixel evidence, not a physical WeChat device claim',...binding,manifest,viewports,cases,images,limitations:['Record ledgers and HUD counts are explicit controlled fixtures, not generated play or balance evidence.','Three viewport captures are native Canvas pixels; physical device acceptance remains separate.']};
 const save=()=>writeFile(`${out}/report.json`,JSON.stringify(report,null,2));
 const run=async(name,fn)=>{try{cases.push({name,status:'PASS',...await fn()});console.log(`PASS ${name}`);}catch(error){cases.push({name,status:'FAIL',error:String(error),stack:error.stack});console.error(`FAIL ${name}: ${error}`);}await save();};
 const driver=async(viewport,storage=new Map())=>{const h=attachHudWitness(attachPixelWitness(await createBoundFinalEconomyHost(binding,{...viewport,storage}))),d=new ModeDriver(h,out,images);drivers.push(d);return d;};
 for(const viewport of viewports){const tag=`${viewport.width}x${viewport.height}`;
  await run(`selector-toggle-and-record-isolation-${tag}`,async()=>{
   const d=await driver(viewport,outboundModeRecordStorage()),before=[...d.h.storage];d.open();const writeCount=writes(d.h).length,frames=[];
   for(let i=0;i<8;i++){const mode=modes[i%2];d.select(mode);const tabs=d.assertSelector(mode);const words=d.h.labels.map(g=>g.text);
    for(const [index,score]of outboundRecordScores[mode].plain.entries()){assert.ok(words.includes(`最高分 ${scoreText(score)}`));const tool=outboundRecordScores[mode].tools[index];assert.ok(words.includes(`使用道具最高分 ${scoreText(tool)}`));}
    for(const score of outboundRecordScores[mode==='normal'?'endless':'normal'].plain)assert.equal(words.includes(`最高分 ${scoreText(score)}`),false);
    assert.equal(words.filter(s=>s==='使用道具最高分 0').length,1);assert.equal(words.filter(s=>s==='使用道具最高分 暂无').length,1);assert.equal(words.some(s=>/999,999|888,888|工具最高/.test(s)),false);
    if(mode==='endless')assert.ok(words.some(s=>s.includes('50批')),'Endless maxUnits remains distinct from best-score units5');
    if(i<2)frames.push({mode,tabs,capture:await d.capture(`${tag}-selector-${mode}`)});
   }
   assert.deepEqual([...d.h.storage],before,'Toggling must preserve every account/history/storage byte');assert.equal(writes(d.h).length,writeCount,'Toggling must issue zero ledger writes');
   d.h.callbacks.hide();d.h.callbacks.show();d.frame();d.assertSelector('endless');assert.deepEqual([...d.h.storage],before);
   return {provenance:'Explicit normal/endless, plain/used-tool, legacy/guided record fixture; eight real alternating tab taps',toggleCount:8,ledgerWrites:0,frames};
  });
  for(const mode of modes)for(const difficulty of difficulties)await run(`start-${mode}-${difficulty}-${tag}`,async()=>{
   const d=await driver(viewport);d.open();d.select(mode);d.assertSelector(mode);const before=[...d.h.storage],writeCount=writes(d.h).length,offer=d.enter(difficulty,mode);
   assert.equal(offer,mode==='normal'&&difficulty==='easy');await d.capture(`${tag}-${mode}-${difficulty}-preparation`);d.back();d.assertSelector(mode);
   assert.deepEqual([...d.h.storage],before);assert.equal(writes(d.h).length,writeCount,'Canceled preparation/guide offer does not create a run');
   if(d.enter(difficulty,mode)){d.direct();d.back();d.assertSelector(mode);assert.deepEqual([...d.h.storage],before);assert.equal(writes(d.h).length,writeCount);d.enter(difficulty,mode);d.direct();}
   d.start();const started=d.account(),identity=structuredClone(started.run.identity),checksum=playableChecksum(d.state());
   assert.equal(identity.mode,mode==='normal'?'outbound':'outboundEndless');assert.equal(identity.rulesetVersion,mode==='normal'?12:13);assert.equal(identity.difficultyId,difficulty);assert.equal(identity.mode.includes('Guided'),false);assert.equal(started.wallet,0);assert.deepEqual(started.inventory,noTools());
   await d.capture(`${tag}-${mode}-${difficulty}-started`);d.pause();d.action({type:'newRun',mode:'color_exit',difficultyId:difficulty,outboundMode:mode});d.confirmation={kind:'newRun',mode:'color_exit',difficultyId:difficulty,outboundMode:mode};d.frame();const cancelRoots=encodedRoots(d.h);d.action({type:'cancel'});d.confirmation=null;d.frame();assert.deepEqual(encodedRoots(d.h),cancelRoots);assert.deepEqual(d.account().run.identity,identity);assert.equal(playableChecksum(d.state()),checksum);
   d.action({type:'home'});d.confirmation={kind:'leaveRun',nextScreen:'menu'};d.frame();d.action({type:'cancel'});d.confirmation=null;d.frame();assert.deepEqual(d.account().run.identity,identity);
   d.action({type:'continue'});d.paused=false;d.frame();const gameplay=stableState(d.state());d.h.callbacks.hide();d.h.callbacks.show();d.paused=true;d.frame();assert.deepEqual(stableState(d.state()),gameplay);assert.deepEqual(d.account().run.identity,identity);
   const reloaded=await driver(viewport,new Map(d.h.storage));assert.deepEqual(reloaded.account().run.identity,identity);reloaded.h.tap(540,380);reloaded.frame();assert.deepEqual(reloaded.account().run.identity,identity);reloaded.resume();assert.deepEqual(stableState(reloaded.state()),gameplay);reloaded.pause();reloaded.paint();reloaded.assertControlVisible({type:'newRun',mode:'color_exit',difficultyId:difficulty,outboundMode:mode});reloaded.h.pixelWitness.enabled=false;
   return {guideOffer:offer,startedIdentity:identity,checksum,canceledPreparationWrites:0,restoredIdentity:reloaded.account().run.identity};
  });
  for(const mode of modes)await run(`actual-used-versus-carried-zero-record-${mode}-${tag}`,async()=>{
   const outcomes=[];
   for(const used of [false,true]){const spec={...outSpec('normal',mode),toolCharges:{rotate:0,clear:1,wildcard:0}},state=createPlayableRun(spec);state.board[40]='cargo.food';
    const d=await driver(viewport,finalEconomyFixtureStorage(spec,[],{constructedState:state,label:'CONSTRUCTED: one isolated center cargo with carried clear tool; real tool use and zero-score close determine the result bucket'}));d.resume();
    if(used){await d.command({type:'clear',cells:[40]});assert.deepEqual(d.state().usedToolIds,['clear']);assert.equal(d.state().score,0);}
    else assert.deepEqual(d.state().usedToolIds,[]);
    await d.home();const account=d.account(),prefix=mode==='normal'?'outbound.v12':'outboundEndless.v13',policy=used?'tools':'plain',other=used?'plain':'tools';
    assert.equal(account.profile.results[`${prefix}.normal.${policy}`].best.score,0);assert.equal(account.profile.results[`${prefix}.normal.${other}`],undefined);assert.equal(account.inventory.clear,used?0:1);
    d.open();d.select(mode);await d.capture(`${tag}-${mode}-${used?'used':'carried'}-real-zero`);const words=d.h.labels.map(g=>g.text);
    assert.equal(words.filter(s=>s==='使用道具最高分 0').length,used?1:0);assert.equal(words.filter(s=>s==='最高分 0').length,used?0:1);assert.equal(words.filter(s=>s==='使用道具最高分 暂无').length,used?3:4);
    outcomes.push({used,policy,score:account.profile.results[`${prefix}.normal.${policy}`].best.score,refundedClear:account.inventory.clear,closed:account.lastClosedResult});
   }
   return {provenance:'Explicit strict-save one-cell geometry; actual clear confirmation or unused carry, actual close, and actual selector pixels establish used-tool versus plain true-zero records',outcomes};
  });
  for(const family of ['inbound','outbound'])for(const mode of modes)await run(`hud-${family}-${mode}-${tag}`,async()=>{
   const d=await driver(viewport,outboundModeHudStorage(family,mode));d.resume();const capture=await d.capture(`${tag}-hud-${family}-${mode}`),words=d.h.labels.map(g=>g.text),infinite=mode==='endless';
   assert.ok(words.includes(infinite?'无限 · 阶段2':family==='outbound'?'阶段 2/5':'第 2 班'));
   assert.equal(d.h.hudArcs.length,infinite?0:5,'Only finite modes render the five-stage completion nodes');
   if(infinite){assert.equal(words.some(s=>/阶段.*\/5|11\/30|5 \/ 6/.test(s)),false);assert.ok(words.includes(family==='outbound'?'11 批':'11 单'));const pixels=stripPixels(d.h);assert.ok(pixels.every(pixel=>JSON.stringify(pixel)===JSON.stringify(pixels[0])),'Infinite HUD has no six-batch terminal-progress strip');}
   else{assert.ok(words.includes(family==='outbound'?'11/30 批':'5 / 6'));const pixels=stripPixels(d.h);assert.notDeepEqual(pixels[0],pixels[5],'Finite per-stage six-unit progress remains rendered');}
   return {provenance:`CONSTRUCTED: ${family}/${mode} validated state at11 cumulative units, stage2; no claim of natural replay`,capture};
  });
  for(const family of ['inbound','outbound'])await run(`infinite-stage-five-continues-${family}-${tag}`,async()=>{
   const d=await driver(viewport,outboundModeHudStorage(family,'endless',{units:42,shift:5}));d.resume();await d.capture(`${tag}-hud-${family}-endless-42`);const words=d.h.labels.map(g=>g.text);assert.ok(words.includes('无限 · 阶段5'));assert.ok(words.includes(family==='outbound'?'42 批':'42 单'));assert.equal(words.some(s=>/阶段.*\/5|42\/30/.test(s)),false);assert.equal(d.state().phase,'input');assert.equal(d.h.hudArcs.length,0);return {provenance:'CONSTRUCTED: validated infinite state at42 cumulative units proves HUD remains open-ended; not a gameplay progression experiment',units:42,shift:5};
  });
 }
 report.finalSourceSha256=await growthSourceHash();report.finalGameJsSha256=sha256(await readFile('build/wechat/game.js'));try{verifyFinalEconomyBinding({...binding,sourceSha256:report.finalSourceSha256,gameJsSha256:report.finalGameJsSha256});}catch(error){cases.push({name:'final-source-binding',status:'FAIL',error:String(error)});}
 report.status=cases.some(c=>c.status==='FAIL')?'FAIL':'PASS';report.completedAt=new Date().toISOString();
 await writeFile(`${out}/touch-and-storage-traces.json`,JSON.stringify({gameJsSha256:binding.gameJsSha256,sourceSha256:binding.sourceSha256,drivers:drivers.map((d,index)=>({id:index+1,viewport:d.h.viewport,touches:d.trace,storageOperations:d.h.operations,finalAccount:d.h.account(),rootHashes:Object.fromEntries(Object.entries(encodedRoots(d.h)).filter(([,value])=>value!==undefined).map(([key,value])=>[key,sha256(value)]))}))},null,2));await save();return report;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){const arg=name=>{const i=process.argv.indexOf(name);return i>=0?process.argv[i+1]:undefined;},out=arg('--out')??'artifacts/outbound-mode-switch-host';try{process.chdir(ROOT);const report=await runOutboundModeSwitchHostQA({out,expectedCommit:arg('--expected-commit'),expectedSourceSha256:arg('--expected-source-sha256'),expectedGameJsSha256:arg('--expected-game-sha256')});console.log(`${report.status}: ${report.cases.filter(c=>c.status==='PASS').length}/${report.cases.length} actual native host cases`);if(report.status==='FAIL')process.exitCode=1;}catch(error){await mkdir(out,{recursive:true});await writeFile(`${out}/report.json`,JSON.stringify({status:'FAIL',kind:'Actual native host initialization failure is never passing evidence',error:String(error),stack:error.stack},null,2));console.error(error);process.exitCode=1;}}
