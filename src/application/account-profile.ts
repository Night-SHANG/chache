import {inboundConfigIdV16,isInboundDifficultyV16} from '../domain/v16/content.ts';
import {inboundConfigIdV18,isInboundDifficultyV18} from '../domain/v18/content.ts';
import {rushConfigIdV19} from '../domain/v19/content.ts';
import {assertGameRun,assertGameCommandShape} from './game-codec.ts';
import {assertAccountGuidesV4} from './account-guides.ts';
import {isRunSlot} from './run-slots.ts';
import { cloneData } from '../shared/data.ts';
import type { AccountRun, AccountSnapshot, ResultBucket, ResultCursor } from './account-types.ts';
import { assertProfile, createProfile, localDailyChallenge } from './profile.ts';
import { baseCoins } from './economy.ts';
import { assertAccountCosmetics } from './cosmetics.ts';
const safe=(n:number)=>Number.isSafeInteger(n)&&n>=0;
function add(a:number,b:number):number {const n=a+b;if(!safe(n))throw Error('成绩超出安全整数范围');return n;}
function resultKey(run:AccountRun):string {
 const id=run.identity,used='usedToolIds' in run.state?run.state.usedToolIds:[];
 const mode=id.rulesetVersion===18&&id.mode==='standard'&&run.state.overtime?'endless':id.mode;
 const tools=Array.isArray(used)&&used.length>0?'tools':'plain';
 return id.mode==='outbound'||id.mode==='outboundEndless'||id.mode==='outboundGuided'?`${id.mode}.v${id.rulesetVersion}.${id.difficultyId}${id.rulesetVersion===12||id.rulesetVersion===13?`.${tools}`:''}`:`inbound.${mode}.v${id.rulesetVersion}.${(id.rulesetVersion===19||id.rulesetVersion===18||id.rulesetVersion===16&&['standard','guided'].includes(id.mode))?`${id.inboundDifficulty}.`:''}${tools}`;
}
const emptyBucket=():ResultBucket=>({runs:0,units:0,maxUnits:0,score:0,wins:0,retirements:0,maxChain:0,best:null});
const zeroBaseline=()=>({units:0,score:0,countedWin:false,countedRetirement:false});
export function recordAccountResult(account:AccountSnapshot,run:AccountRun):AccountSnapshot {
 if(account.run?.identity.runId!==run.identity.runId||account.run.identity.serial!==run.identity.serial)throw Error('只能记录当前账户的本局成绩');
 const state=run.state,previous=run.resultCursor;
 if(previous&&previous.runId!==run.identity.runId)throw Error('结算游标不属于本局');
 if(state.phase!=='result'||run.identity.serial<account.resetCursor.serial||run.identity.serial===account.resetCursor.serial&&state.commandIndex<=account.resetCursor.commandIndex)return account;
 if(previous&&state.commandIndex<=previous.commandIndex)return account;
 for(const n of [state.commandIndex,state.completedOrders,state.score,state.maxChain])if(!safe(n))throw Error('成绩数据无效');
 if(previous&&(state.completedOrders<previous.units||state.score<previous.score))throw Error('成绩进度倒退');
 const key=resultKey(run),results={...account.profile.results},baseline=previous?.baseline??zeroBaseline(),changed=previous!==null&&previous.bucketKey!==key;
 const continued=run.identity.rulesetVersion===18&&run.identity.mode==='standard'&&state.overtime;
 // A phase boundary keeps the completed five record. Tool migration within either phase
 // still replaces only this run's contribution using that bucket's existing snapshot.
 const phaseBoundary=continued&&changed&&previous.bucketKey.startsWith('inbound.standard.v18.');
 if(changed&&!phaseBoundary){if(previous.bucketBefore===null)delete results[previous.bucketKey];else results[previous.bucketKey]=cloneData(previous.bucketBefore);}
 const old=results[key]??emptyBucket(),bucketBefore=changed||!previous?results[key]??null:previous.bucketBefore;
 const fullUnits=state.completedOrders-baseline.units,fullScore=state.score-baseline.score;
 const units=changed||!previous?fullUnits:state.completedOrders-previous.units,score=changed||!previous?fullScore:state.score-previous.score;
 const countedWin=!continued&&(state.endReason==='completed'||previous?.countedWin===true),countedRetirement=state.endReason==='retired'||previous?.countedRetirement===true;
 const maxChainSinceBaseline=previous?.maxChainSinceBaseline??state.maxChain;
 const bucket:ResultBucket={runs:add(old.runs,changed||!previous||!previous.countedRun?1:0),units:add(old.units,units),maxUnits:Math.max(old.maxUnits,fullUnits),score:add(old.score,score),wins:add(old.wins,(changed||!previous?countedWin&&!baseline.countedWin:state.endReason==='completed'&&!previous.countedWin)?1:0),retirements:add(old.retirements,(changed||!previous?countedRetirement&&!baseline.countedRetirement:state.endReason==='retired'&&!previous.countedRetirement)?1:0),maxChain:Math.max(old.maxChain,maxChainSinceBaseline),best:old.best};
 if(!old.best||fullScore>old.best.score)bucket.best={score:fullScore,units:fullUnits,chain:maxChainSinceBaseline};
 const cursor:ResultCursor={runId:run.identity.runId,commandIndex:state.commandIndex,units:state.completedOrders,score:state.score,countedRun:true,countedWin,countedRetirement,maxChainSinceBaseline,bucketKey:key,bucketBefore:bucketBefore===null?null:cloneData(bucketBefore),baseline:{...baseline}};
 return {...account,profile:{...account.profile,results:{...results,[key]:bucket}},run:{...run,resultCursor:cursor}};
}
export function resetAccountResults(account:AccountSnapshot):AccountSnapshot {
 const {schemaVersion,settings,cosmetics,tutorialComplete,nextRunSerial,...legacyResults}=createProfile();
 void schemaVersion;void settings;void cosmetics;void tutorialComplete;void nextRunSerial;
 let run=account.run;
 if(run){const countedWin=run.state.endReason==='completed'||run.resultCursor?.countedWin===true,countedRetirement=run.state.endReason==='retired'||run.resultCursor?.countedRetirement===true;const baseline={units:run.state.completedOrders,score:run.state.score,countedWin,countedRetirement};run={...run,resultCursor:{runId:run.identity.runId,commandIndex:run.state.commandIndex,units:run.state.completedOrders,score:run.state.score,countedRun:false,countedWin,countedRetirement,maxChainSinceBaseline:0,bucketKey:resultKey(run),bucketBefore:null,baseline}};}
 return {...account,profile:{...account.profile,legacyResults:resetLegacyDisplay(account.profile.legacyResults,legacyResults),results:{}},run,resetCursor:run?{serial:run.identity.serial,commandIndex:run.state.commandIndex}:{serial:Math.max(account.resetCursor.serial,account.nextRunSerial-1),commandIndex:account.resetCursor.commandIndex}};
}

function resetLegacyDisplay(before:AccountSnapshot['profile']['legacyResults'],fresh:AccountSnapshot['profile']['legacyResults']):AccountSnapshot['profile']['legacyResults'] {
 const result={...fresh,...before.resetCursor?{resetCursor:{...before.resetCursor}}:{},lastRecordedRun:before.lastRecordedRun?{...before.lastRecordedRun,ignored:true}:null};
 if(before.colorExit)result.colorExit={stats:{runs:0,batches:0,wins:0,maxChain:0},bestScores:{},lastRecordedRun:before.colorExit.lastRecordedRun?{...before.colorExit.lastRecordedRun,ignored:true}:null,...before.colorExit.resetCursor?{resetCursor:{...before.colorExit.resetCursor}}:{}};
 for(const name of ['colorComparisons','outboundDifficulties','outboundV8'] as const){const records=before[name];if(records)result[name]=Object.fromEntries(Object.entries(records).map(([key,record])=>[key,{stats:{runs:0,batches:0,wins:0,maxChain:0},bestScores:{},lastRecordedRun:record.lastRecordedRun?{...record.lastRecordedRun,ignored:true}:null,...record.resetCursor?{resetCursor:{...record.resetCursor}}:{}}]));}
 if(before.endless)result.endless={stats:{runs:0,orders:0,score:0,maxChain:0,retirements:0},bestScores:{},lastRecordedRun:before.endless.lastRecordedRun?{...before.endless.lastRecordedRun,ignored:true}:null,...before.endless.resetCursor?{resetCursor:{...before.endless.resetCursor}}:{}};
 return result;
}

const object=(v:unknown):v is Record<string,unknown>=>v!==null&&typeof v==='object'&&!Array.isArray(v);
function requireValue(ok:unknown,message:string):asserts ok {if(!ok)throw Error(message);}
const integer=(v:unknown,min=0):v is number=>Number.isSafeInteger(v)&&Number(v)>=min;
const identifier=(v:unknown):v is string=>typeof v==='string'&&/^[a-zA-Z0-9_.:-]{1,100}$/.test(v);
function fields(value:Record<string,unknown>,expected:readonly string[]):void {requireValue(Object.keys(value).length===expected.length&&Object.keys(value).every(key=>expected.includes(key)),'账户字段无效');}
function assertIdentity(value:unknown):void {
 requireValue(object(value),'本局身份无效');
 if(Number(value.rulesetVersion)===19){
  fields(value,['runId','serial','rulesetVersion','runConfigId','mode','economyVersion','inboundDifficulty']);
  requireValue(value.rulesetVersion===19&&value.mode==='rush'&&isInboundDifficultyV18(value.inboundDifficulty)&&value.economyVersion===2,'规则19身份字段无效');
  requireValue(identifier(value.runId)&&integer(value.serial,1)&&value.runConfigId===rushConfigIdV19(value.inboundDifficulty),'规则19身份配置无效');return;
 }
 if(Number(value.rulesetVersion)===18){
  requireValue(value.rulesetVersion===18&&typeof value.mode==='string'&&['standard','daily','endless'].includes(value.mode)&&isInboundDifficultyV18(value.inboundDifficulty)&&value.economyVersion===2,'规则18身份字段无效');
  fields(value,['runId','serial','rulesetVersion','runConfigId','mode','economyVersion','inboundDifficulty',...(value.mode==='daily'?['challengeDay']:[])]);
  requireValue(identifier(value.runId)&&integer(value.serial,1)&&value.runConfigId===inboundConfigIdV18(value.inboundDifficulty),'规则18身份配置无效');
  requireValue(value.mode==='daily'?value.inboundDifficulty==='hard'&&validDay(value.challengeDay):value.challengeDay===undefined,'规则18每日身份无效');return;
 }
 if(Number(value.rulesetVersion)===16)requireValue(value.rulesetVersion===16&&typeof value.mode==='string'&&isInboundDifficultyV16(value.inboundDifficulty),'规则16身份字段无效');fields(value,['runId','serial','rulesetVersion','runConfigId','mode','economyVersion',...(value.rulesetVersion===16?['inboundDifficulty']:[]),...(value.difficultyId===undefined?[]:['difficultyId']),...(value.challengeDay===undefined?[]:['challengeDay'])]);
 requireValue(identifier(value.runId)&&identifier(value.runConfigId)&&integer(value.serial,1)&&[8,9,10,11,12,13,14,15,16].includes(Number(value.rulesetVersion))&&[1,2].includes(Number(value.economyVersion)),'本局身份无效');
 requireValue(['standard','daily','guided','endless','outbound','outboundEndless','outboundGuided'].includes(String(value.mode)),'账户模式无效');
 requireValue((value.rulesetVersion===9||value.rulesetVersion===11||value.rulesetVersion===14||value.rulesetVersion===15||value.rulesetVersion===16)?!['outbound','outboundEndless','outboundGuided'].includes(String(value.mode))&&value.difficultyId===undefined:(value.rulesetVersion===8||value.rulesetVersion===12?value.mode==='outbound'||value.mode==='outboundGuided'&&value.difficultyId==='easy':value.mode==='outboundEndless')&&['easy','normal','hard','expert'].includes(String(value.difficultyId)),'账户规则与模式不匹配');
 requireValue(value.mode==='daily'?validDay(value.challengeDay):value.challengeDay===undefined,'每日账户身份无效');
 requireValue(value.rulesetVersion!==15||value.mode==='standard'||value.mode==='daily'||value.mode==='guided','规则15账户模式无效');
 requireValue(value.rulesetVersion===16?isInboundDifficultyV16(value.inboundDifficulty)&&(value.mode==='standard'||value.inboundDifficulty==='normal'):value.inboundDifficulty===undefined,'账户入库难度无效');
 requireValue(value.runConfigId===(value.rulesetVersion===16?inboundConfigIdV16(value.inboundDifficulty as import('../domain/v16/types.ts').InboundDifficultyV16):(value.rulesetVersion===9||value.rulesetVersion===11||value.rulesetVersion===14||value.rulesetVersion===15||value.rulesetVersion===16)?`run.inbound_v${value.rulesetVersion}`:`run.outbound9_v${value.rulesetVersion}.${value.difficultyId}`),'账户规则配置无效');
}
function validDay(value:unknown):value is string {if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;const ms=Date.parse(value+'T00:00:00.000Z');return Number.isFinite(ms)&&new Date(ms).toISOString().slice(0,10)===value;}
export function assertHistoryCursor(value:unknown):asserts value is import('./account-types.ts').HistoryCursor {
 requireValue(object(value),'历史游标无效');fields(value,['seed','runConfigId','head','totalCommands','tail']);
 requireValue(integer(value.seed,-2147483648)&&Number(value.seed)<=4294967295&&identifier(value.runConfigId)&&integer(value.totalCommands)&&Array.isArray(value.tail)&&value.tail.length<128,'历史游标无效');
 requireValue(value.totalCommands>=value.tail.length&&(value.totalCommands-value.tail.length)%128===0,'历史尾段边界无效');
 if(value.head===null)requireValue(value.totalCommands===value.tail.length,'历史头缺失');
 else {requireValue(object(value.head),'历史引用无效');fields(value.head,['key','digest','commandCount']);requireValue(typeof value.head.key==='string'&&value.head.key.startsWith('warehouse.account.history.s1.')&&typeof value.head.digest==='string'&&/^[a-f0-9]{8}$/.test(value.head.digest)&&value.head.commandCount===128,'历史引用无效');}
}
function assertResultBucket(value:unknown):void {
 requireValue(object(value),'成绩快照无效');fields(value,['runs','units','maxUnits','score','wins','retirements','maxChain','best']);
 for(const key of ['runs','units','maxUnits','score','wins','retirements','maxChain'])requireValue(integer(value[key]),'成绩快照数值无效');
 requireValue(Number(value.wins)<=Number(value.runs)&&Number(value.retirements)<=Number(value.runs),'成绩快照计数无效');
 if(value.best!==null){requireValue(object(value.best),'最佳成绩快照无效');fields(value.best,['score','units','chain']);requireValue(Object.values(value.best).every(n=>integer(n))&&Number(value.best.units)<=Number(value.maxUnits),'最佳成绩快照无效');}
}
function assertEarnedCoins(mode:unknown,earned:unknown,base:number,economyVersion:unknown,won=false):void {
 requireValue(integer(earned),'本局累计收益无效');
 requireValue(mode==='rush'?earned===base*(won?3:1):mode==='daily'?earned>=base&&earned-base<=(economyVersion===2?base*2:120):earned===base,'本局累计收益与已发事实不一致');
}
function assertDailyRewardConsistency(account:AccountSnapshot):void {
 for(const record of [account.run,account.lastClosedResult]){
  if(!record||record.identity.economyVersion!==2||record.identity.mode!=='daily')continue;
  const day=record.identity.challengeDay!,reward=account.dailyRewards?.[day];
  const base='state' in record?record.creditedBase:baseCoins('inbound',record.units,record.score,2);
  const ownsAward=reward?.completedRunId===record.identity.runId;
  const expectedBonus=ownsAward?Math.max(0,base*2-(account.dailyPaid[day]?.paid??0)):0;
  requireValue(record.earnedCoins===base+expectedBonus,'每日累计收益与完成凭据不一致');
  if(ownsAward)requireValue(reward.bonusPaid>=base*2&&('state' in record?record.state.result==='won':record.result==='won'),'每日完成凭据与结算不一致');
 }
}
export function assertAccountSnapshot(value:unknown):asserts value is AccountSnapshot {
 requireValue(object(value),'账户结构无效');if(value.formatVersion===3||value.formatVersion===4)assertAccountCosmetics(value.profile);if(value.formatVersion===4)assertAccountGuidesV4(value.guides,value.tutorialsEnabled);fields(value,['formatVersion','economyVersion','epoch','generation','nextRunSerial','closedThroughSerial','wallet','inventory','run','lastClosedResult','profile','guides','dailyPaid','resetCursor','legacyImported','migration','lastOperation',...(value.formatVersion===4?['tutorialsEnabled']:[]),...(value.formatVersion===2||value.formatVersion===3||value.formatVersion===4?['dailyRewards']:[])]);
 requireValue(value.formatVersion===1&&value.economyVersion===1||(value.formatVersion===2||value.formatVersion===3||value.formatVersion===4)&&value.economyVersion===2,'账户版本不兼容');
 if(value.formatVersion===2||value.formatVersion===3||value.formatVersion===4){requireValue(object(value.dailyRewards),'每日奖励安全记录无效');for(const [day,reward] of Object.entries(value.dailyRewards)){requireValue(validDay(day)&&object(reward),'每日奖励安全记录无效');fields(reward,['completedRunId','bonusPaid']);requireValue((reward.completedRunId===null||identifier(reward.completedRunId))&&integer(reward.bonusPaid),'每日奖励安全记录无效');}}
 requireValue(identifier(value.epoch)&&integer(value.generation)&&integer(value.nextRunSerial,1)&&integer(value.closedThroughSerial)&&value.closedThroughSerial<value.nextRunSerial&&integer(value.wallet),'账户进度无效');
 requireValue(object(value.inventory),'库存无效');fields(value.inventory,['rotate','clear','wildcard']);requireValue(Object.values(value.inventory).every(n=>integer(n)),'库存无效');
 requireValue(object(value.resetCursor),'重置边界无效');fields(value.resetCursor,['serial','commandIndex']);requireValue(integer(value.resetCursor.serial)&&value.resetCursor.serial<value.nextRunSerial&&integer(value.resetCursor.commandIndex),'重置边界无效');
 requireValue(typeof value.legacyImported==='boolean'&&object(value.migration),'迁移记录无效');const migration=value.migration;fields(migration,['version','sourceDigests','legacySerialCeiling','legacySerials']);requireValue(integer(value.migration.legacySerialCeiling)&&value.migration.legacySerialCeiling<value.nextRunSerial&&object(value.migration.legacySerials)&&Object.entries(value.migration.legacySerials).every(([slot,serial])=>isRunSlot(slot)&&integer(serial,1)&&serial<=Number(migration.legacySerialCeiling))&&new Set(Object.values(value.migration.legacySerials)).size===Object.keys(value.migration.legacySerials).length,'旧局序号边界无效');requireValue(value.migration.version===1&&object(value.migration.sourceDigests)&&Object.entries(value.migration.sourceDigests).every(([key,digest])=>key.startsWith('warehouse.')&&typeof digest==='string'&&/^[a-f0-9]{8}$/.test(digest)),'迁移摘要无效');
 requireValue(object(value.guides),'引导记录无效');fields(value.guides,value.formatVersion===4?['inbound','outbound','daily']:['inbound','outbound']);
 const steps=['place','order','route','upgrade','rushTimer','expired','sweepChoice','colorGroup','colorExit','mixedRemainder'];
 for(const progress of Object.values(value.guides)){requireValue(object(progress),'引导记录无效');fields(progress,['learned','skipped','authoredStartConsumed']);requireValue(Array.isArray(progress.learned)&&progress.learned.every(step=>steps.includes(String(step)))&&new Set(progress.learned).size===progress.learned.length&&typeof progress.skipped==='boolean'&&typeof progress.authoredStartConsumed==='boolean','引导记录无效');}
 requireValue(object(value.dailyPaid),'每日经济记录无效');for(const [day,paid] of Object.entries(value.dailyPaid)){requireValue(validDay(day)&&object(paid),'每日经济记录无效');fields(paid,['bestBase','paid']);requireValue(integer(paid.bestBase)&&integer(paid.paid)&&paid.paid===Math.min(120,paid.bestBase>=60?120:paid.bestBase*2),'每日经济记录无效');}
 requireValue(object(value.profile),'账户成绩无效');fields(value.profile,['settings','cosmetics','legacyResults','results',...(value.formatVersion===3||value.formatVersion===4?['ownedCosmetics','cargoOutline']:[])]);
 requireValue(object(value.profile.legacyResults)&&object(value.profile.results)&&!Object.keys(value.profile.legacyResults).some(key=>['schemaVersion','settings','cosmetics','tutorialComplete','nextRunSerial'].includes(key)),'账户成绩无效');
 requireValue(object(value.profile.settings)&&object(value.profile.cosmetics),'账户设置无效');fields(value.profile.settings,['sound','reducedMotion']);fields(value.profile.cosmetics,['theme','forklift','cargo']);requireValue(Object.values(value.profile.settings).every(v=>typeof v==='boolean')&&(value.formatVersion===3||value.formatVersion===4||['day','night'].includes(String(value.profile.cosmetics.theme))&&['yellow','blue','red'].includes(String(value.profile.cosmetics.forklift))&&['classic','outline'].includes(String(value.profile.cosmetics.cargo))),'账户设置无效');
 assertProfile({...value.profile.legacyResults,schemaVersion:1,settings:value.profile.settings,cosmetics:createProfile().cosmetics,tutorialComplete:false,nextRunSerial:value.nextRunSerial});
 for(const [key,bucket] of Object.entries(value.profile.results)){requireValue(/^(inbound\.(standard|daily|guided|endless)\.v(9|11|14|15)\.(plain|tools)|inbound\.(standard|guided)\.v16\.(normal|hard|expert)\.(plain|tools)|inbound\.(daily|endless)\.v16\.(plain|tools)|inbound\.(standard|endless)\.v18\.(hard|expert)\.(plain|tools)|inbound\.daily\.v18\.hard\.plain|inbound\.rush\.v19\.(hard|expert)\.(plain|tools)|outbound\.v8\.(easy|normal|hard|expert)|outboundEndless\.v10\.(easy|normal|hard|expert)|outboundGuided\.v8\.easy|outbound\.v12\.(easy|normal|hard|expert)\.(plain|tools)|outboundEndless\.v13\.(easy|normal|hard|expert)\.(plain|tools)|outboundGuided\.v12\.easy\.plain)$/.test(key)&&!key.startsWith('inbound.endless.v15.')&&object(bucket),'成绩分类无效');fields(bucket,['runs','units','maxUnits','score','wins','retirements','maxChain','best']);for(const key of ['runs','units','maxUnits','score','wins','retirements','maxChain'])requireValue(integer(bucket[key]),'成绩数值无效');requireValue(Number(bucket.wins)<=Number(bucket.runs)&&Number(bucket.retirements)<=Number(bucket.runs),'成绩计数无效');if(bucket.best!==null){requireValue(object(bucket.best),'最佳成绩无效');fields(bucket.best,['score','units','chain']);requireValue(Object.values(bucket.best).every(n=>integer(n))&&Number(bucket.best.units)<=Number(bucket.maxUnits),'最佳成绩无效');}}
 if(value.lastOperation!==null){requireValue(object(value.lastOperation),'操作凭据无效');fields(value.lastOperation,['operationId','expectedGeneration','requestDigest','committedGeneration']);requireValue(identifier(value.lastOperation.operationId)&&integer(value.lastOperation.expectedGeneration)&&typeof value.lastOperation.requestDigest==='string'&&value.lastOperation.requestDigest.length>0&&value.lastOperation.requestDigest.length<=100&&value.lastOperation.committedGeneration===value.generation&&value.lastOperation.expectedGeneration===value.generation-1,'操作凭据无效');}
 if(value.run!==null){const run=value.run;requireValue(object(run),'账户棋盘无效');fields(run,['identity','state','history','lifecycle','reserved','creditedBase','earnedCoins','resultCursor']);assertIdentity(run.identity);assertHistoryCursor(run.history);requireValue(object(run.state)&&run.state.rulesetVersion===(run.identity as Record<string,unknown>).rulesetVersion&&run.state.runConfigId===run.history.runConfigId&&run.state.runConfigId===(run.identity as Record<string,unknown>).runConfigId&&run.state.seed===run.history.seed&&((run.state.rulesetVersion!==16&&run.state.rulesetVersion!==18&&run.state.rulesetVersion!==19)||run.state.inboundDifficulty===(run.identity as Record<string,unknown>).inboundDifficulty)&&run.state.commandIndex===run.history.totalCommands&&integer(run.state.completedOrders)&&integer(run.state.score)&&integer(run.state.maxChain)&&(run.state.runSerial===undefined||run.state.runSerial===(run.identity as Record<string,unknown>).serial)&&((run.state.rulesetVersion===9||run.state.rulesetVersion===11||run.state.rulesetVersion===14||run.state.rulesetVersion===15||run.state.rulesetVersion===16||run.state.rulesetVersion===18||run.state.rulesetVersion===19)?['standard','daily','endless','rush'].includes(String(run.state.mode))&&((run.identity as Record<string,unknown>).mode==='guided'?run.state.guided===true:run.state.guided===false&&run.state.mode===(run.identity as Record<string,unknown>).mode):run.state.mode==='color_exit'&&run.state.difficultyId===(run.identity as Record<string,unknown>).difficultyId),'账户棋盘身份无效');requireValue(run.lifecycle==='active'||run.lifecycle==='closed','棋盘生命周期无效');requireValue(integer(run.creditedBase)&&Array.isArray(run.reserved)&&run.reserved.length<=2&&run.reserved.every(id=>['rotate','clear','wildcard'].includes(String(id)))&&new Set(run.reserved).size===run.reserved.length,'预留工具无效');assertEarnedCoins((run.identity as Record<string,unknown>).mode,run.earnedCoins,Number(run.creditedBase),(run.identity as Record<string,unknown>).economyVersion,run.state.result==='won'&&run.state.endReason==='completed');requireValue(Number(run.creditedBase)<=baseCoins([9,11,14,15,16,18,19].includes(Number((run.identity as Record<string,unknown>).rulesetVersion))?'inbound':'outbound',Number(run.state.completedOrders),Number(run.state.score),(run.identity as Record<string,unknown>).economyVersion as 1|2),'累计收益不能超过本局分数');requireValue(value.economyVersion===2||(run.identity as Record<string,unknown>).economyVersion===1,'旧账户不能持有新版收益身份');requireValue(Number((run.identity as Record<string,unknown>).serial)<value.nextRunSerial&&Number((run.identity as Record<string,unknown>).serial)>value.closedThroughSerial,'本局序号无效');if(run.resultCursor!==null){requireValue(object(run.resultCursor),'结算游标无效');fields(run.resultCursor,['runId','commandIndex','units','score','countedRun','countedWin','countedRetirement','maxChainSinceBaseline','bucketKey','bucketBefore','baseline']);requireValue(run.resultCursor.runId===(run.identity as Record<string,unknown>).runId&&typeof run.resultCursor.bucketKey==='string'&&object(run.resultCursor.baseline),'结算游标归属无效');fields(run.resultCursor.baseline,['units','score','countedWin','countedRetirement']);requireValue(integer(run.resultCursor.baseline.units)&&integer(run.resultCursor.baseline.score)&&Number(run.resultCursor.baseline.units)<=Number(run.resultCursor.units)&&Number(run.resultCursor.baseline.score)<=Number(run.resultCursor.score)&&typeof run.resultCursor.baseline.countedWin==='boolean'&&typeof run.resultCursor.baseline.countedRetirement==='boolean','重置基线无效');if(run.resultCursor.bucketBefore!==null)assertResultBucket(run.resultCursor.bucketBefore);requireValue(integer(run.resultCursor.maxChainSinceBaseline)&&Number(run.resultCursor.maxChainSinceBaseline)<=Number(run.state.maxChain)&&integer(run.resultCursor.commandIndex)&&run.resultCursor.commandIndex<=run.history.totalCommands&&integer(run.resultCursor.units)&&integer(run.resultCursor.score)&&['countedRun','countedWin','countedRetirement'].every(key=>typeof (run.resultCursor as Record<string,unknown>)[key]==='boolean'),'结算游标无效');}}
 if(value.lastClosedResult!==null){const result=value.lastClosedResult;requireValue(object(result),'最后结算无效');fields(result,['identity','reason','commandIndex','units','score','maxChain','result','coinDelta','earnedCoins','returned','history',...(result.elapsedMs===undefined?[]:['elapsedMs'])]);requireValue(result.elapsedMs===undefined||integer(result.elapsedMs),'结算时长无效');assertIdentity(result.identity);assertHistoryCursor(result.history);requireValue(['blocked','completed','retired','abandoned'].includes(String(result.reason))&&['failed','won',null].includes(result.result as 'failed'|'won'|null)&&['commandIndex','units','score','maxChain','coinDelta'].every(key=>integer(result[key]))&&result.commandIndex===result.history.totalCommands&&Array.isArray(result.returned)&&result.returned.length<=2&&new Set(result.returned).size===result.returned.length&&result.returned.every(id=>['rotate','clear','wildcard'].includes(String(id)))&&Number((result.identity as Record<string,unknown>).serial)<=value.closedThroughSerial,'最后结算事实无效');assertEarnedCoins((result.identity as Record<string,unknown>).mode,result.earnedCoins,baseCoins([9,11,14,15,16,18,19].includes(Number((result.identity as Record<string,unknown>).rulesetVersion))?'inbound':'outbound',Number(result.units),Number(result.score),(result.identity as Record<string,unknown>).economyVersion as 1|2),(result.identity as Record<string,unknown>).economyVersion,result.result==='won');requireValue(value.economyVersion===2||(result.identity as Record<string,unknown>).economyVersion===1,'旧账户不能持有新版收益身份');}
 for(const record of [value.run,value.lastClosedResult]){
  if(!object(record)||!object(record.identity)||![18,19].includes(Number(record.identity.rulesetVersion)))continue;
  const identity=record.identity,version=identity.rulesetVersion as 18|19,history=record.history as Record<string,unknown>;
  requireValue(history.runConfigId===identity.runConfigId,'规则18历史配置无效');
  (history.tail as unknown[]).forEach(command=>assertGameCommandShape(command,version));
  if(identity.mode==='daily')requireValue(history.seed===localDailyChallenge(Date.parse(String(identity.challengeDay)+'T00:00:00.000Z'),18).seed,'规则18每日日期与种子不一致');
  if(object(record.state)){
   assertGameRun({...record.state,commands:record.state.commands??history.tail});
   requireValue(identity.mode!=='daily'||Array.isArray(record.reserved)&&record.reserved.length===0,'每日不接受预留工具');
   if(record.resultCursor!==null){const cursor=record.resultCursor as Record<string,unknown>,modes=identity.mode==='standard'&&record.state.overtime===true?['standard','endless']:[identity.mode];requireValue(modes.some(mode=>cursor.bucketKey===`inbound.${mode}.v${version}.${identity.inboundDifficulty}.plain`||mode!=='daily'&&cursor.bucketKey===`inbound.${mode}.v${version}.${identity.inboundDifficulty}.tools`),'规则18结算游标分类无效');}
  }
 }
 if(value.formatVersion===2||value.formatVersion===3||value.formatVersion===4)assertDailyRewardConsistency(value as unknown as AccountSnapshot);
}
