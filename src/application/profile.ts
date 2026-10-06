import type { RunState } from '../domain/types.ts';
import { loadRun, type StoragePort } from './save.ts';
import { RULES_V4_CONFIG } from '../domain/v4/content.ts';

/** Purely local preferences, cosmetics and results, independent of Run snapshots. */
export type ThemeId='day'|'night';
export type ForkliftId='yellow'|'blue'|'red';
export type CargoStyleId='classic'|'outline';
export interface ColorExitProfile {
 stats:{runs:number;batches:number;wins:number;maxChain:number};
 bestScores:Partial<Record<'v4',{score:number;chain:number}>>;
 lastRecordedRun:{serial:number;batches:number;score:number;ignored?:boolean}|null;
 resetCursor?:{serial:number;commandIndex:number};
}
export interface Profile {
 schemaVersion:1;
 settings:{sound:boolean;reducedMotion:boolean};
 cosmetics:{theme:ThemeId;forklift:ForkliftId;cargo:CargoStyleId};
 tutorialComplete:boolean;
 stats:{runs:number;orders:number;wins:number;maxChain:number};
 bestScores:Record<string,{score:number;chain:number}>;
 dailyHistory:Record<string,{day:string;seed:number;rulesetVersion:number;score:number;orders:number;won:boolean}>;
 achievements:string[];
 nextRunSerial:number;
 lastRecordedRun:{serial:number;orders:number;score:number;ignored?:boolean}|null;
 resetCursor?:{serial:number;commandIndex:number};
 colorExit?:ColorExitProfile;
}
export function createProfile():Profile {
 return {schemaVersion:1,settings:{sound:true,reducedMotion:false},cosmetics:{theme:'day',forklift:'yellow',cargo:'classic'},tutorialComplete:false,stats:{runs:0,orders:0,wins:0,maxChain:0},bestScores:{},dailyHistory:{},achievements:[],nextRunSerial:1,lastRecordedRun:null};
}

function createColorExitProfile():ColorExitProfile {return {stats:{runs:0,batches:0,wins:0,maxChain:0},bestScores:{},lastRecordedRun:null};}
/** Reading old profiles does not migrate their serialized shape or share mutable defaults. */
export function getColorExitProfile(profile:Profile):ColorExitProfile {return profile.colorExit??createColorExitProfile();}

export interface CosmeticMetadata {id:string;name:string;description?:string;achievementId?:string}
export const THEMES:readonly CosmeticMetadata[]=[{id:'day',name:'日班仓库',description:'明亮的日班色调，仅改变外观'},{id:'night',name:'夜班仓库',description:'深色夜班色调，仅改变外观'}];
export const FORKLIFTS:readonly CosmeticMetadata[]=[{id:'yellow',name:'黄色叉车',description:'默认涂装，仅改变外观'},{id:'blue',name:'蓝色叉车',description:'完成首次正式出货解锁',achievementId:'first_shipment'},{id:'red',name:'红色叉车',description:'完成标准五班胜利解锁',achievementId:'five_shifts'}];
export const CARGO_STYLES:readonly CosmeticMetadata[]=[{id:'classic',name:'经典货箱',description:'默认货箱外观'},{id:'outline',name:'醒目轮廓',description:'更清晰的货箱轮廓，仅改变外观'}];
export const ACHIEVEMENTS:readonly CosmeticMetadata[]=[{id:'first_shipment',name:'首次出货',description:'正式局累计完成 1 个订单，解锁蓝色叉车'},{id:'chain_3',name:'连锁高手',description:'正式局达成 3 连锁'},{id:'five_shifts',name:'五班全勤',description:'完成一次标准五班胜利，解锁红色叉车'},{id:'ship_100',name:'百单老手',description:'正式局累计完成 100 个订单'}];
export const PROFILE_KEYS={main:'warehouse.profile.v1',backup:'warehouse.profile.backup.v1',temp:'warehouse.profile.temp.v1'};
const MAX_PROFILE_LENGTH=256000;
const MAX_BEST_SCORES=128;
const MAX_DAILY_DAYS=60;
const MAX_DAILY_RECORDS=240;
const MAX_RULESET=9999;
const MAX=Number.MAX_SAFE_INTEGER;
type UnknownRecord=Record<string,unknown>;
const object=(v:unknown):v is UnknownRecord=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const integer=(v:unknown,min=0,max=MAX):v is number=>Number.isSafeInteger(v)&&Number(v)>=min&&Number(v)<=max;
function requireValue(value:unknown,message:string):asserts value {if(!value)throw Error(message);}
function keys(value:UnknownRecord,expected:readonly string[]):boolean {const actual=Object.keys(value);return actual.length===expected.length&&actual.every(key=>expected.includes(key));}
function digest(raw:string):string {let hash=2166136261;for(let i=0;i<raw.length;i++){hash^=raw.charCodeAt(i);hash=Math.imul(hash,16777619);}return (hash>>>0).toString(16).padStart(8,'0');}
const known=(list:readonly CosmeticMetadata[],id:unknown)=>typeof id==='string'&&list.some(item=>item.id===id);
function dayValid(day:unknown):day is string {
 if(typeof day!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(day))return false;
 const epoch=Date.parse(`${day}T00:00:00.000Z`);return Number.isFinite(epoch)&&new Date(epoch).toISOString().slice(0,10)===day;
}
function dailyIdentity(day:string,rulesetVersion:number){const id=`daily.${day}.v${rulesetVersion}`;return {id,day,seed:parseInt(digest(id),16),rulesetVersion,timeZone:'Asia/Shanghai' as const,localOnly:true as const};}
/** Client clock only: no server time, anti-cheat, uploads or worldwide ranking. */
export function localDailyChallenge(epochMs:number,rulesetVersion:number):ReturnType<typeof dailyIdentity> {
 requireValue(integer(epochMs,-8640000000000000,8640000000000000-28800000),'日期无效');
 requireValue(integer(rulesetVersion,1,MAX_RULESET),'规则版本无效');
 const day=new Date(epochMs+28800000).toISOString().slice(0,10);requireValue(dayValid(day),'日期无效');
 return dailyIdentity(day,rulesetVersion);
}
/** Reject unknown schemas, unbounded collections and malformed values before serializing. */
export function assertProfile(value:unknown):asserts value is Profile {
 requireValue(object(value),'长期记录结构无效');
 requireValue(value.schemaVersion===1,'长期记录版本不兼容');
 requireValue(keys(value,['schemaVersion','settings','cosmetics','tutorialComplete','stats','bestScores','dailyHistory','achievements','nextRunSerial','lastRecordedRun',...(value.resetCursor===undefined?[]:['resetCursor']),...(value.colorExit===undefined?[]:['colorExit'])]),'长期记录字段无效');
 const settings=value.settings,cosmetics=value.cosmetics,stats=value.stats;
 requireValue(object(settings)&&keys(settings,['sound','reducedMotion'])&&typeof settings.sound==='boolean'&&typeof settings.reducedMotion==='boolean','设置无效');
 requireValue(object(cosmetics)&&keys(cosmetics,['theme','forklift','cargo'])&&known(THEMES,cosmetics.theme)&&known(FORKLIFTS,cosmetics.forklift)&&known(CARGO_STYLES,cosmetics.cargo),'外观无效');
 requireValue(typeof value.tutorialComplete==='boolean','教学记录无效');
 requireValue(object(stats)&&keys(stats,['runs','orders','wins','maxChain'])&&integer(stats.runs)&&integer(stats.orders)&&integer(stats.wins,0,stats.runs)&&integer(stats.maxChain,0,64),'统计无效');
 requireValue(integer(value.nextRunSerial,1),'值班序号无效');
 requireValue(value.resetCursor===undefined||object(value.resetCursor)&&keys(value.resetCursor,['serial','commandIndex'])&&integer(value.resetCursor.serial,1,value.nextRunSerial-1)&&integer(value.resetCursor.commandIndex),'重置边界无效');
 const last=value.lastRecordedRun;
 requireValue(last===null||object(last)&&keys(last,last.ignored===undefined?['serial','orders','score']:['serial','orders','score','ignored'])&&(last.ignored===undefined||typeof last.ignored==='boolean')&&integer(last.serial,1,value.nextRunSerial-1)&&integer(last.orders)&&integer(last.score),'结算记录无效');
 requireValue(Array.isArray(value.achievements)&&value.achievements.length<=ACHIEVEMENTS.length&&value.achievements.every(id=>known(ACHIEVEMENTS,id))&&new Set(value.achievements).size===value.achievements.length,'成就无效');
 const achievements=value.achievements as string[];
 requireValue(!achievements.includes('first_shipment')||stats.orders>=1,'出货成就无效');
 requireValue(!achievements.includes('chain_3')||stats.maxChain>=3,'连锁成就无效');
 requireValue(!achievements.includes('five_shifts')||stats.wins>=1,'五班成就无效');
 requireValue(!achievements.includes('ship_100')||stats.orders>=100,'百单成就无效');
 const forklift=FORKLIFTS.find(item=>item.id===cosmetics.forklift)!;
 requireValue(!forklift.achievementId||achievements.includes(forklift.achievementId),'叉车外观尚未解锁');
 requireValue(object(value.bestScores)&&Object.keys(value.bestScores).length<=MAX_BEST_SCORES,'最好成绩数量无效');
 for(const [key,best] of Object.entries(value.bestScores))requireValue(/^(standard|overtime)\.v[1-9]\d{0,3}$/.test(key)&&object(best)&&keys(best,['score','chain'])&&integer(best.score)&&integer(best.chain,0,64),'最好成绩无效');
 requireValue(object(value.dailyHistory)&&Object.keys(value.dailyHistory).length<=MAX_DAILY_RECORDS,'每日记录数量无效');
 const days=new Set<string>();
 for(const [key,entry] of Object.entries(value.dailyHistory)){
  requireValue(object(entry)&&keys(entry,['day','seed','rulesetVersion','score','orders','won'])&&dayValid(entry.day)&&integer(entry.rulesetVersion,1,MAX_RULESET)&&integer(entry.score)&&integer(entry.orders)&&typeof entry.won==='boolean','每日记录无效');
  const identity=dailyIdentity(entry.day,entry.rulesetVersion);requireValue(key===identity.id&&entry.seed===identity.seed,'每日挑战标识无效');days.add(entry.day);
 }
 requireValue(days.size<=MAX_DAILY_DAYS,'每日记录日期过多');
 if(value.colorExit!==undefined)assertColorExitProfile(value.colorExit,value.nextRunSerial);
}
function assertColorExitProfile(value:unknown,nextRunSerial:number):asserts value is ColorExitProfile {
 requireValue(object(value)&&keys(value,['stats','bestScores','lastRecordedRun',...(value.resetCursor===undefined?[]:['resetCursor'])]),'颜色出口记录字段无效');
 const stats=value.stats;
 requireValue(object(stats)&&keys(stats,['runs','batches','wins','maxChain'])&&integer(stats.runs)&&integer(stats.batches)&&integer(stats.wins,0,stats.runs)&&integer(stats.maxChain,0,3),'颜色出口统计无效');
 requireValue(object(value.bestScores)&&Object.keys(value.bestScores).length<=1,'颜色出口最好成绩数量无效');
 for(const [key,best] of Object.entries(value.bestScores))requireValue(key==='v4'&&object(best)&&keys(best,['score','chain'])&&integer(best.score)&&best.score%RULES_V4_CONFIG.pointsPerCell===0&&integer(best.chain,0,3),'颜色出口最好成绩无效');
 const last=value.lastRecordedRun;
 requireValue(last===null||object(last)&&keys(last,last.ignored===undefined?['serial','batches','score']:['serial','batches','score','ignored'])&&(last.ignored===undefined||typeof last.ignored==='boolean')&&integer(last.serial,1,nextRunSerial-1)&&integer(last.batches,0,32)&&integer(last.score)&&last.score%RULES_V4_CONFIG.pointsPerCell===0,'颜色出口结算记录无效');
 requireValue(value.resetCursor===undefined||object(value.resetCursor)&&keys(value.resetCursor,['serial','commandIndex'])&&integer(value.resetCursor.serial,1,nextRunSerial-1)&&integer(value.resetCursor.commandIndex),'颜色出口重置边界无效');
}
export function encodeProfile(profile:Profile):string {
 assertProfile(profile);const body=JSON.stringify(profile);const raw=JSON.stringify({schemaVersion:1,digest:digest(body),profile});requireValue(raw.length<=MAX_PROFILE_LENGTH,'长期记录超出大小限制');return raw;
}
export function decodeProfile(raw:string):Profile {
 requireValue(typeof raw==='string'&&raw.length<=MAX_PROFILE_LENGTH,'长期记录超出大小限制');const envelope:unknown=JSON.parse(raw);
 requireValue(object(envelope),'长期记录结构无效');requireValue(envelope.schemaVersion===1,'长期记录版本不兼容');
 requireValue(object(envelope.profile)&&typeof envelope.digest==='string'&&envelope.digest===digest(JSON.stringify(envelope.profile)),'长期记录校验失败');
 assertProfile(envelope.profile);return envelope.profile;
}
export function allocateRun(profile:Profile,minimum=1):{profile:Profile;serial:number} {
 assertProfile(profile);requireValue(integer(minimum,1,MAX-1),'值班序号无效');const serial=Math.max(profile.nextRunSerial,minimum);requireValue(serial<MAX,'值班序号已用尽');
 return {profile:{...profile,nextRunSerial:serial+1},serial};
}
export function setProfileSettings(profile:Profile,patch:Partial<Profile['settings']>):Profile {
 assertProfile(profile);requireValue(object(patch)&&Object.keys(patch).every(key=>['sound','reducedMotion'].includes(key)&&typeof (patch as UnknownRecord)[key]==='boolean'),'设置无效');
 return {...profile,settings:{...profile.settings,...patch}};
}
export function setProfileCosmetic(profile:Profile,kind:string,id:string):{profile:Profile;error?:string} {
 assertProfile(profile);const catalogue=kind==='theme'?THEMES:kind==='forklift'?FORKLIFTS:kind==='cargo'?CARGO_STYLES:null;
 const item=catalogue?.find(item=>item.id===id);if(!item)return {profile,error:'未知外观'};
 if(item.achievementId&&!profile.achievements.includes(item.achievementId))return {profile,error:'该外观尚未解锁'};
 return {profile:{...profile,cosmetics:{...profile.cosmetics,[kind]:id}}};
}
const add=(left:number,right:number)=>Math.min(MAX,left+right);
function trimDaily(history:Profile['dailyHistory']):Profile['dailyHistory'] {
 const entries=Object.entries(history).sort(([a,x],[b,y])=>y.day.localeCompare(x.day)||y.rulesetVersion-x.rulesetVersion||a.localeCompare(b));
 const days=new Set<string>();return Object.fromEntries(entries.filter(([,entry])=>{days.add(entry.day);return days.size<=MAX_DAILY_DAYS;}).slice(0,MAX_DAILY_RECORDS));
}
/** Called only for stable terminal snapshots; the same run may later finish overtime. */
export function recordResult(profile:Profile,run:RunState):Profile {
 assertProfile(profile);
 if(run.mode==='color_exit'||run.rulesetVersion===4)return recordColorExitResult(profile,run);
 if(run.phase!=='result'||!['won','failed'].includes(String(run.result))||!integer(run.runSerial,1,MAX-1)||!integer(run.completedOrders)||!integer(run.score)||!integer(run.maxChain,0,64)||!integer(run.rulesetVersion,1,MAX_RULESET)||!['standard','daily','tutorial'].includes(run.mode))return profile;
 const cutoff=profile.resetCursor;
 if(cutoff&&(run.runSerial<cutoff.serial||run.runSerial===cutoff.serial&&run.commandIndex<=cutoff.commandIndex))return profile;
 const previous=profile.lastRecordedRun;if(previous&&run.runSerial<previous.serial)return profile;
 const same=previous?.serial===run.runSerial;
 if(run.mode==='tutorial')return {...profile,tutorialComplete:profile.tutorialComplete||run.result==='won',nextRunSerial:Math.max(profile.nextRunSerial,run.runSerial+1),lastRecordedRun:{serial:run.runSerial,orders:0,score:0}};
 const orders=same?Math.max(0,run.completedOrders-previous.orders):run.completedOrders;
 const clearedStandard=run.mode==='standard'&&(run.result==='won'||run.overtime===true);
 const newlyCredited=!same||!!previous?.ignored;
 const stats={runs:add(profile.stats.runs,newlyCredited?1:0),orders:add(profile.stats.orders,orders),wins:add(profile.stats.wins,newlyCredited&&(run.result==='won'||clearedStandard)?1:0),maxChain:Math.max(profile.stats.maxChain,run.maxChain)};
 const bestScores={...profile.bestScores};let dailyHistory={...profile.dailyHistory};
 if(run.mode==='standard'){
  const key=`${run.overtime?'overtime':'standard'}.v${run.rulesetVersion}`,best=bestScores[key];
  bestScores[key]={score:Math.max(best?.score??0,run.score),chain:Math.max(best?.chain??0,run.maxChain)};
  const retained=Object.keys(bestScores).sort((a,b)=>Number(b.split('.v')[1])-Number(a.split('.v')[1])||a.localeCompare(b)).slice(MAX_BEST_SCORES);for(const old of retained)delete bestScores[old];
 }else if(dayValid(run.challengeDay)){
  const challenge=dailyIdentity(run.challengeDay,run.rulesetVersion);
  if(run.challengeId===challenge.id&&run.seed===challenge.seed){
   const old=dailyHistory[challenge.id];dailyHistory[challenge.id]={day:challenge.day,seed:challenge.seed,rulesetVersion:challenge.rulesetVersion,score:Math.max(old?.score??0,run.score),orders:Math.max(old?.orders??0,run.completedOrders),won:!!old?.won||run.result==='won'};
   dailyHistory=trimDaily(dailyHistory);
  }
 }
 const achievements=[...profile.achievements];
 for(const [id,achieved] of [['first_shipment',stats.orders>=1],['chain_3',stats.maxChain>=3],['five_shifts',clearedStandard],['ship_100',stats.orders>=100]] as const)if(achieved&&!achievements.includes(id))achievements.push(id);
 return {...profile,stats,bestScores,dailyHistory,achievements,nextRunSerial:Math.max(profile.nextRunSerial,run.runSerial+1),lastRecordedRun:{serial:run.runSerial,orders:Math.max(same?previous.orders:0,run.completedOrders),score:Math.max(same?previous.score:0,run.score)}};
}

function recordColorExitResult(profile:Profile,run:RunState):Profile {
 if(run.mode!=='color_exit'||run.rulesetVersion!==4||run.runConfigId!==RULES_V4_CONFIG.runConfigId||run.phase!=='result'||!integer(run.runSerial,1,MAX-1)||!integer(run.commandIndex)||!integer(run.completedOrders,0,32)||!integer(run.score)||run.score%RULES_V4_CONFIG.pointsPerCell!==0||!integer(run.maxChain,0,3)||run.overtime!==false)return profile;
 if(run.result==='won'?run.endReason!=='completed'||run.completedOrders<30:run.result!=='failed'||run.endReason!=='blocked'||run.completedOrders>=30)return profile;
 const current=getColorExitProfile(profile),cutoff=current.resetCursor,previous=current.lastRecordedRun;
 if(cutoff&&(run.runSerial<cutoff.serial||run.runSerial===cutoff.serial&&run.commandIndex<=cutoff.commandIndex))return profile;
 // Color exits never continue after a terminal result; each serial is credited once.
 if(previous&&run.runSerial<=previous.serial)return profile;
 const best=current.bestScores.v4;
 const colorExit:ColorExitProfile={...current,
  stats:{runs:add(current.stats.runs,1),batches:add(current.stats.batches,run.completedOrders),wins:add(current.stats.wins,run.result==='won'?1:0),maxChain:Math.max(current.stats.maxChain,run.maxChain)},
  bestScores:{v4:{score:Math.max(best?.score??0,run.score),chain:Math.max(best?.chain??0,run.maxChain)}},
  lastRecordedRun:{serial:run.runSerial,batches:run.completedOrders,score:run.score},
 };
 return {...profile,colorExit,nextRunSerial:Math.max(profile.nextRunSerial,run.runSerial+1)};
}

export interface ProfileSaveResult {ok:boolean;message:string}
export interface ProfileLoadResult {profile:Profile;source:'main'|'backup'|'empty'|'corrupt'|'unavailable';message:string}
function parsed(raw:string|null):Profile|null {if(raw===null)return null;try{return decodeProfile(raw);}catch{return null;}}
export function loadProfile(storage:StoragePort):ProfileLoadResult {
 try {
  const main=storage.get(PROFILE_KEYS.main),backup=storage.get(PROFILE_KEYS.backup),profile=parsed(main),fallback=parsed(backup);
  if(profile)return {profile,source:'main',message:'已读取本地长期记录'};
  if(fallback)return {profile:fallback,source:'backup',message:'主记录不可用，可恢复上一份长期记录备份'};
  return {profile:createProfile(),source:main!==null||backup!==null?'corrupt':'empty',message:main!==null||backup!==null?'长期记录无法读取，原始内容已保留':'尚无长期记录'};
 }catch{return {profile:createProfile(),source:'unavailable',message:'无法访问本地存储，长期记录暂不能保存'};}
}
function archiveRaw(storage:StoragePort,key:string,raw:string):void {
 const archive=`${key}.archive.${digest(raw)}`,existing=storage.get(archive);requireValue(existing===null||existing===raw,'长期记录归档标识冲突');
 storage.set(archive,raw);requireValue(storage.get(archive)===raw,'长期记录归档校验失败');
}
function restore(storage:StoragePort,key:string,raw:string|null):void {try{if(raw===null)storage.remove(key);else storage.set(key,raw);}catch{/* The verified archive or prior valid backup remains available. */}}
/** Two stable pointers plus a read-back-verified staging slot; no Run keys are touched. */
function writeProfile(storage:StoragePort,profile:Profile,replace=false):ProfileSaveResult {
 let previous:string|null=null,backup:string|null=null,changed=false;
 try {
  const raw=encodeProfile(profile);previous=storage.get(PROFILE_KEYS.main);backup=storage.get(PROFILE_KEYS.backup);
  if(!replace&&previous!==null&&!parsed(previous))return {ok:false,message:'旧长期记录损坏，已保护原文；请先选择恢复或重置'};
  if(replace){for(const [key,value] of [[PROFILE_KEYS.main,previous],[PROFILE_KEYS.backup,backup]] as const)if(value!==null)archiveRaw(storage,key,value);}
  else if(backup!==null&&!parsed(backup))archiveRaw(storage,PROFILE_KEYS.backup,backup);
  storage.set(PROFILE_KEYS.temp,raw);const verified=storage.get(PROFILE_KEYS.temp);requireValue(verified===raw,'临时写入校验失败');decodeProfile(verified);
  changed=true;
  if(replace||previous!==null){const nextBackup=replace?raw:previous!;storage.set(PROFILE_KEYS.backup,nextBackup);requireValue(storage.get(PROFILE_KEYS.backup)===nextBackup,'备份读回校验失败');}
  storage.set(PROFILE_KEYS.main,raw);requireValue(storage.get(PROFILE_KEYS.main)===raw,'长期记录保存读回校验失败');
  try{storage.remove(PROFILE_KEYS.temp);}catch{/* An abandoned temporary slot never wins loading. */}
  return {ok:true,message:'长期记录已保存'};
 }catch{
  if(changed){restore(storage,PROFILE_KEYS.main,previous);restore(storage,PROFILE_KEYS.backup,backup);}
  return {ok:false,message:'长期记录保存失败，旧记录已保护'};
 }
}
export function saveProfile(storage:StoragePort,profile:Profile):ProfileSaveResult {return writeProfile(storage,profile);}
/** User-requested repair only: archive exact bytes, then adopt verified backup or defaults. */
export function recoverProfile(storage:StoragePort):ProfileSaveResult {
 const loaded=loadProfile(storage);if(loaded.source==='unavailable')return {ok:false,message:loaded.message};
 if(loaded.source==='main')return {ok:true,message:'长期记录有效，无需恢复'};
 const result=writeProfile(storage,loaded.profile,true);return result.ok?{ok:true,message:loaded.source==='backup'?'原始记录已归档，已恢复有效备份':'原始记录已归档，已建立新记录'}:result;
}
function retainResetCursor(target:{resetCursor?:{serial:number;commandIndex:number}},prior:{serial:number;commandIndex:number}|undefined):void {
 const next=target.resetCursor;
 if(prior&&(!next||prior.serial>next.serial||prior.serial===next.serial&&prior.commandIndex>next.commandIndex))target.resetCursor={...prior};
}
/** App must obtain explicit confirmation; active Run snapshots are never removed. */
export function resetProfile(storage:StoragePort,minimumNextSerial=1,activeRun?:RunState|null,otherRun?:RunState|null):ProfileSaveResult&{profile?:Profile} {
 try {
  requireValue(integer(minimumNextSerial,1),'值班序号无效');const loaded=loadProfile(storage);if(loaded.source==='unavailable')return {ok:false,message:loaded.message};
  const snapshots=[activeRun,otherRun].filter((run):run is RunState=>!!run);
  // Older callers know only the foreground run. Read missing mode slots before committing a reset.
  for(const slot of ['orders','color_exit'] as const){
   if(snapshots.some(run=>(run.mode==='color_exit')===(slot==='color_exit')))continue;
   const stored=loadRun(storage,slot);
   if(stored.source==='unavailable'||stored.source==='corrupt')return {ok:false,message:'无法读取某个模式存档，未重置；请先恢复该模式'};
   if(stored.state)snapshots.push(stored.state);
  }
  if(snapshots.some(run=>run.phase==='result'&&!integer(run.runSerial,1,MAX-1)))return {ok:false,message:'请先打开旧结算，再重置长期记录'};
  const profile=createProfile();profile.nextRunSerial=Math.max(minimumNextSerial,loaded.profile.nextRunSerial);
  const active=snapshots.filter(run=>integer(run.runSerial,1,MAX-1)&&integer(run.commandIndex));
  const ordersRun=active.find(run=>run.mode!=='color_exit');
  const colorRun=active.find(run=>run.mode==='color_exit'&&run.rulesetVersion===4);
  const previous=loaded.profile.lastRecordedRun;
  if(ordersRun&&integer(ordersRun.runSerial,1)&&integer(ordersRun.commandIndex)){
   profile.nextRunSerial=Math.max(profile.nextRunSerial,ordersRun.runSerial+1);
   profile.resetCursor={serial:ordersRun.runSerial,commandIndex:ordersRun.commandIndex};
   if(ordersRun.phase==='result')profile.lastRecordedRun={serial:ordersRun.runSerial,orders:ordersRun.completedOrders,score:ordersRun.score,ignored:true};
   else if(previous)profile.lastRecordedRun={...previous,ignored:true};
  }else if(previous){profile.resetCursor={serial:previous.serial,commandIndex:MAX};profile.lastRecordedRun={...previous,ignored:true};}
  retainResetCursor(profile,loaded.profile.resetCursor);
  const oldColor=loaded.profile.colorExit;
  if(oldColor||colorRun){
   const color=createColorExitProfile(),previousColor=oldColor?.lastRecordedRun;
   if(colorRun){
    profile.nextRunSerial=Math.max(profile.nextRunSerial,colorRun.runSerial!+1);
    color.resetCursor={serial:colorRun.runSerial!,commandIndex:colorRun.commandIndex};
    if(colorRun.phase==='result')color.lastRecordedRun={serial:colorRun.runSerial!,batches:colorRun.completedOrders,score:colorRun.score,ignored:true};
    else if(previousColor)color.lastRecordedRun={...previousColor,ignored:true};
   }else if(previousColor){color.resetCursor={serial:previousColor.serial,commandIndex:MAX};color.lastRecordedRun={...previousColor,ignored:true};}
   retainResetCursor(color,oldColor?.resetCursor);
   profile.colorExit=color;
  }
  const result=writeProfile(storage,profile,true);return result.ok?{ok:true,message:'长期记录已重置；当前值班仍保留，之后结算会计入新记录',profile}:result;
 }catch{return {ok:false,message:'重置失败，旧长期记录已保护'};}
}
