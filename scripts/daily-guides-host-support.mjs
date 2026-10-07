/** Final rules16 host evidence. Pure expectations are never represented as bundle state. */
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {verifyFinalEconomyBinding} from './final-economy-host-support.mjs';
import {createPlayableRun,applyPlayableCommand,playableChecksum} from '../src/domain/playable.ts';
import {localDailyChallenge} from '../src/application/profile.ts';
import {L} from '../src/presentation/layout.ts';
import {sha256,mapPort,validateResumeStorage} from './growth-host-support.mjs';
import {makeAccountFixture} from '../tests/helpers/account-fixtures.ts';
import {ACCOUNT_KEYS,encodeAccount} from '../src/application/account-store.ts';
import {stageHistory,verifyAccountReferences} from '../src/application/history-store.ts';
import {retainAccountCosmetics} from '../src/application/cosmetics.ts';
import {upgradeAccountGuides} from '../src/application/account-guides.ts';
import {baseCoins} from '../src/application/economy.ts';

export const verifyDailyGuidesBinding=verifyFinalEconomyBinding;
export function dailyGuidesResumeStorage(spec,commands=[],options={}){
 assert.ok(spec.family!=='inbound'||spec.mode!=='daily','Daily requires real account start');let state=createPlayableRun(spec);
 for(const command of commands){const next=applyPlayableCommand(state,command);assert.equal(next.error,undefined,'Resume replay command rejected');state=next.state;}
 if(options.constructedState){assert.match(options.label??'',/^CONSTRUCTED: .+/);assert.equal(commands.length,0);state=structuredClone(options.constructedState);}
 const mode=spec.family==='inbound'?spec.guided?'guided':spec.mode:spec.guided?'outboundGuided':spec.variant==='endless'?'outboundEndless':'outbound';
 const identity={runId:'daily.guides.fixture.1',serial:1,rulesetVersion:state.rulesetVersion,runConfigId:state.runConfigId,economyVersion:2,mode,...(state.rulesetVersion===16?{inboundDifficulty:state.inboundDifficulty}:{}),...(spec.family==='outbound'?{difficultyId:spec.difficultyId}:{})};
 const storage=new Map(),port=mapPort(storage),history=stageHistory(port,identity,{seed:state.seed,runConfigId:state.runConfigId,head:null,totalCommands:0,tail:[]},state.commands,state.commandIndex);state={...state,runSerial:1,elapsedMs:0,commands:history.tail,commandBaseIndex:history.commandBaseIndex};
 const creditedBase=baseCoins(spec.family,state.completedOrders,state.score,2),account=upgradeAccountGuides(retainAccountCosmetics(makeAccountFixture({formatVersion:2,economyVersion:2,dailyRewards:{},epoch:'daily.guides.fixture',generation:1,nextRunSerial:2,wallet:(options.wallet??0)+creditedBase,inventory:options.inventory??{rotate:0,clear:0,wildcard:0},run:{identity,state,history:history.cursor,lifecycle:'active',reserved:Object.keys(state.toolCharges??{}).filter(k=>state.toolCharges[k]===1),creditedBase,earnedCoins:creditedBase,resultCursor:null},lastOperation:{operationId:'daily.guides.fixture',expectedGeneration:0,requestDigest:'fixture',committedGeneration:1}})));
 if(options.guides)account.guides=options.guides;if(options.appearance)Object.assign(account.profile,options.appearance);verifyAccountReferences(port,account);const raw=encodeAccount(account);for(const key of [ACCOUNT_KEYS.a,ACCOUNT_KEYS.b])storage.set(key,raw);validateResumeStorage(storage);return storage;
}
export const snapshotStorage=host=>({bytes:[...host.storage].sort(([a],[b])=>a.localeCompare(b)),operationIndex:host.operations.length});
export function assertZeroWrites(host,before){
 assert.deepEqual([...host.storage].sort(([a],[b])=>a.localeCompare(b)),before.bytes,'Every storage key remains byte-identical');
 const writes=host.operations.slice(before.operationIndex).filter(op=>op.kind==='set'||op.kind==='remove');
 assert.deepEqual(writes,[],'Practice/read-only transaction must attempt zero writes, including same-byte rewrites');return {keys:before.bytes.length,byteWrites:0};
}
export function rebindDailyScenario(raw){
 const identity=localDailyChallenge(raw.wallTime,16);assert.equal(identity.seed,raw.seed,'Daily date seed differs');assert.equal(identity.day,raw.identity.day,'Daily date differs');
 const spec={family:'inbound',mode:'daily',rulesetVersion:16,seed:raw.seed,guided:false,inboundDifficulty:'normal',toolCharges:{rotate:0,clear:0,wildcard:0}};
 let state=createPlayableRun(spec),firstRush=null,firstTick=null;const states=[state];
 for(const [i,command] of raw.commands.entries()){
  const before=state,next=applyPlayableCommand(state,command);assert.equal(next.error,undefined,`Daily command ${i+1} rejects current domain`);state=next.state;states.push(state);
  if(firstRush===null&&state.cellTraits.some(t=>t?.kind==='rush'))firstRush=state.commandIndex;
  if(firstTick===null&&before.cellTraits.some((t,cell)=>t?.kind==='rush'&&state.cellTraits[cell]?.kind==='rush'&&state.cellTraits[cell].remaining<t.remaining))firstTick=state.commandIndex;
 }
 assert.equal(state.result,raw.result,'Daily terminal result differs');assert.equal(state.completedOrders,raw.orders,'Daily terminal orders differ');assert.equal(state.score,raw.score,'Daily score differs');assert.equal(firstRush,raw.firstRush,'Daily first rush differs');assert.equal(firstTick,raw.firstTick,'Daily first tick differs');
 return {...raw,identity,spec,state,states,firstRush,firstTick,expectedModelChecksum:playableChecksum(state),provenance:'Selected real-date pure-reducer command trace rebound to current normal metadata; old checksum is historical only'};
}
const normalizedResearch=state=>{const copy=structuredClone(state);delete copy.inboundDifficulty;copy.rulesetVersion=16;copy.runConfigId='run.inbound_v16';return copy;};
export function rebindTierScenario(raw,tier){
 assert.equal(({A:'normal',B:'expert',C:'hard'})[raw.arm],tier,'Tier research arm mismatch');
 const spec={family:'inbound',mode:'standard',rulesetVersion:16,seed:raw.seed,guided:false,inboundDifficulty:tier,toolCharges:{rotate:0,clear:0,wildcard:0}};
 let state=createPlayableRun(spec);assert.deepEqual(normalizedResearch(state),normalizedResearch(raw.initialExperimentalState),'Initial gameplay state differs');const states=[state],commands=[];
 for(const step of raw.trace){assert.equal(sha256(JSON.stringify(normalizedResearch(state))),step.beforeStateHash,'Before gameplay state hash differs');const result=applyPlayableCommand(state,step.command);assert.equal(result.error,undefined,'Tier command rejected');assert.deepEqual(result.events,step.events,'Tier gameplay events differ');state=result.state;states.push(state);commands.push(step.command);assert.equal(sha256(JSON.stringify(normalizedResearch(state))),step.afterStateHash,'After gameplay state hash differs');}
 assert.deepEqual(normalizedResearch(state),normalizedResearch(raw.experimentalState),'Terminal gameplay state differs');assert.equal(state.result,'won');
 return {spec,state,states,commands,expectedModelChecksum:playableChecksum(state),provenance:'Frozen approved research commands replayed against current formal tier with every gameplay hash and event checked'};
}
export function practiceEvidence(practice,observed){
 assert.ok(observed.labels.includes('教学练习 · 不计金币和成绩'),'Actual practice label missing');assert.ok(observed.cellPixels.length,'Actual canvas cell pixel witnesses missing');assert.equal(observed.byteWrites,0,'Practice must have zero writes');
 return {expectedModel:{source:'pure-practice-reducer-not-bundle-readback',kind:practice.kind,commandIndex:practice.state.commandIndex,checksum:playableChecksum(practice.state),score:practice.state.score,completed:practice.completed},observed:{source:'unmodified-bundle-canvas-and-storage',labels:observed.labels,cellPixels:observed.cellPixels,byteWrites:0}};
}
const overlap=(a,b)=>Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x)>0.01&&Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y)>0.01;
export function assertNewControlGeometry(controls,viewport,avoid=[]){
 const scale=Math.min(viewport.w/L.width,(viewport.h-(viewport.safe??0))/L.height),newTypes=['skipTutorial','toggleTutorials','openPracticeSelect','startPractice','exitPractice','pausePractice','selectInboundDifficulty'];
 for(const control of controls.filter(c=>newTypes.includes(c.action.type))){assert.ok(control.rect.w*scale>=43.99&&control.rect.h*scale>=43.99,`New control must be at least 44 CSS pixels: ${control.action.type}`);for(const r of [...avoid,...controls.filter(c=>c!==control).map(c=>c.rect)])assert.ok(!overlap(control.rect,r),`New control overlaps another target: ${control.action.type}`);}
 return controls.map(c=>({action:c.action,cssWidth:c.rect.w*scale,cssHeight:c.rect.h*scale}));
}
export async function writeHostReport(out,report){
 await mkdir(out,{recursive:true});const json=JSON.stringify(report,null,2)+'\n';
 if(report.status==='FAIL')try{await writeFile(join(out,'first-failure.json'),json,{flag:'wx'});}catch(error){if(error.code!=='EEXIST')throw error;}
 await writeFile(join(out,'report.json'),json);
}
