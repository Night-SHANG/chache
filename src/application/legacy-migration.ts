import {cloneData} from '../shared/data.ts';
import type { AccountSnapshot, GuideProgress, GuideStep } from './account-types.ts';
import { PROFILE_KEYS, createProfile, decodeProfile, getColorExitProfile, getOutboundProfile, getEndlessProfile, type Profile } from './profile.ts';
import { decodeRun, saveKeysFor, type StoragePort } from './save.ts';
import { RUN_SLOTS, slotForRun, type RunSlot } from './run-slots.ts';
import { runLifecycleKeysFor } from './run-lifecycle.ts';
import { loadAccount } from './account-store.ts';
import { accountDigest, canonicalStringify, verifyAccountReferences } from './history-store.ts';
function requireValue(ok:unknown,message:string):asserts ok {if(!ok)throw Error(message);}
function legacyDigest(raw:string):string {let hash=2166136261;for(let i=0;i<raw.length;i++){hash^=raw.charCodeAt(i);hash=Math.imul(hash,16777619);}return (hash>>>0).toString(16).padStart(8,'0');}

type LegacyBounds={resetCursor?:{serial:number;commandIndex:number};lastRecordedRun:{serial:number;score:number;orders?:number;batches?:number;ignored?:boolean}|null};
function mergeBounds<T extends LegacyBounds>(base:T,sources:readonly (T|undefined)[]):T {
 const result=cloneData(base);
 for(const source of sources){if(!source)continue;
  const cut=source.resetCursor,old=result.resetCursor;
  if(cut&&(!old||cut.serial>old.serial||cut.serial===old.serial&&cut.commandIndex>old.commandIndex))result.resetCursor={...cut};
  const record=source.lastRecordedRun,prior=result.lastRecordedRun;
  if(record&&(!prior||record.serial>prior.serial))result.lastRecordedRun=cloneData(record);
  else if(record&&prior&&record.serial===prior.serial){
   const beforeUnits=prior.orders??prior.batches??0,sourceUnits=record.orders??record.batches??0;
   const advances=record.score>=prior.score&&sourceUnits>=beforeUnits&&(record.score>prior.score||sourceUnits>beforeUnits);
   const {ignored:priorIgnored,...priorFacts}=prior;
   const ignored=advances?record.ignored:priorIgnored;
   result.lastRecordedRun={...priorFacts,score:Math.max(prior.score,record.score),...(prior.orders===undefined?{}:{orders:Math.max(prior.orders,record.orders??0)}),...(prior.batches===undefined?{}:{batches:Math.max(prior.batches,record.batches??0)}),...(ignored===undefined?{}:{ignored})};
  }
 }
 return result;
}
function mergeLegacyBoundaries(profiles:readonly Profile[]):Profile {
 const main=profiles[0]??createProfile(),result=mergeBounds(main,profiles);
 if(profiles.some(p=>p.colorExit))result.colorExit=mergeBounds(getColorExitProfile(main),profiles.map(p=>p.colorExit));
 for(const tier of ['entry','middle','late'] as const)if(profiles.some(p=>p.colorComparisons?.[tier]))result.colorComparisons={...result.colorComparisons,[tier]:mergeBounds(getColorExitProfile(main,tier),profiles.map(p=>p.colorComparisons?.[tier]))};
 for(const version of [6,8] as const)for(const difficulty of ['easy','normal','hard','expert'] as const){const key=version===8?'outboundV8':'outboundDifficulties';if(profiles.some(p=>p[key]?.[difficulty]))result[key]={...result[key],[difficulty]:mergeBounds(getOutboundProfile(main,difficulty,version),profiles.map(p=>p[key]?.[difficulty]))};}
 if(profiles.some(p=>p.endless))result.endless=mergeBounds(getEndlessProfile(main),profiles.map(p=>p.endless));
 return result;
}

/** Preparation is entirely read-only. Its result and provenance commit together through A/B. */
export function prepareLegacyMigration(storage:StoragePort):{status:'ready';account:AccountSnapshot}|{status:'blocked';message:string} {
 try {
  const current=loadAccount(storage,account=>verifyAccountReferences(storage,account));
  if(current.status==='ready'&&current.account)return {status:'ready',account:current.account};
  if(current.status!=='empty')return {status:'blocked',message:'现有账户尚未确认，旧数据未覆盖'};
  const sourceDigests:Record<string,string>={},profiles:Profile[]=[],unassignedSlots=new Set<RunSlot>();let closedThroughSerial=0,nextRunSerial=1;
  const resetCursor={serial:0,commandIndex:0};let inboundPlayed=false,outboundPlayed=false;const learned={inbound:new Set<GuideStep>(),outbound:new Set<GuideStep>()};
  const learn=(track:'inbound'|'outbound',steps:GuideStep[])=>{for(const step of steps)learned[track].add(step);};
  function retainBoundary(cursor:{serial:number;commandIndex:number}|undefined){if(cursor&&(cursor.serial>resetCursor.serial||cursor.serial===resetCursor.serial&&cursor.commandIndex>resetCursor.commandIndex)){resetCursor.serial=cursor.serial;resetCursor.commandIndex=cursor.commandIndex;}if(cursor)nextRunSerial=Math.max(nextRunSerial,cursor.serial+1);}
  function read(key:string):string|null {const raw=storage.get(key);requireValue(storage.get(key)===raw,'旧来源读取不一致');if(raw!==null)sourceDigests[key]=accountDigest(raw);return raw;}
  for(const key of [PROFILE_KEYS.main,PROFILE_KEYS.backup,PROFILE_KEYS.temp]){const raw=read(key);if(raw===null)continue;const profile=decodeProfile(raw);profiles.push(profile);nextRunSerial=Math.max(nextRunSerial,profile.nextRunSerial);retainBoundary(profile.resetCursor);
   const records=[profile,profile.colorExit,...Object.values(profile.colorComparisons??{}),...Object.values(profile.outboundDifficulties??{}),...Object.values(profile.outboundV8??{}),profile.endless];
   for(const record of records)if(record){retainBoundary(record.resetCursor);if(record.lastRecordedRun)nextRunSerial=Math.max(nextRunSerial,record.lastRecordedRun.serial+1);}
   inboundPlayed ||= profile.tutorialComplete||profile.stats.runs>0||profile.stats.orders>0||(profile.endless?.stats.runs??0)>0;
   if(profile.tutorialComplete)learn('inbound',['place','order','route','upgrade']);else if(profile.stats.orders>0||(profile.endless?.stats.orders??0)>0){learn('inbound',['place','order','route']);if(profile.stats.orders>=4||(profile.endless?.stats.orders??0)>=4)learn('inbound',['upgrade']);}
   outboundPlayed ||= (profile.colorExit?.stats.runs??0)>0||[...Object.values(profile.colorComparisons??{}),...Object.values(profile.outboundDifficulties??{}),...Object.values(profile.outboundV8??{})].some(record=>record.stats.runs>0);
  }
  for(const slot of RUN_SLOTS){const keys=saveKeysFor(slot);for(const key of [keys.main,keys.backup,keys.temp]){const raw=read(key);if(raw===null)continue;const state=decodeRun(raw);requireValue(slotForRun(state)===slot,'旧存档槽身份不匹配');if(state.runSerial!==undefined)nextRunSerial=Math.max(nextRunSerial,state.runSerial+1);else unassignedSlots.add(slot);if(state.rulesetVersion<=3||state.rulesetVersion===7){inboundPlayed=true;if(state.commands.some(command=>command.type==='place'))learn('inbound',['place']);if(state.completedOrders>0)learn('inbound',['order','route']);if(state.upgrades.length>0)learn('inbound',['upgrade']);}else {outboundPlayed=true;if(state.commands.some(command=>command.type==='place'))learn('outbound',['place']);if(state.completedOrders>0)learn('outbound',['route','colorGroup','colorExit']);}}
   const markers=runLifecycleKeysFor(slot);for(const key of [markers.main,markers.backup,markers.temp]){const raw=read(key);if(raw===null)continue;const value:unknown=JSON.parse(raw);requireValue(value!==null&&typeof value==='object'&&!Array.isArray(value),'旧关闭记录无效');const marker=value as Record<string,unknown>;
    requireValue(Object.keys(marker).length===5&&marker.schemaVersion===1&&marker.slot===slot&&marker.reason==='abandoned'&&Number.isSafeInteger(marker.closedSerial)&&Number(marker.closedSerial)>0,'旧关闭记录无效');
    const body={schemaVersion:1,slot,reason:'abandoned',closedSerial:marker.closedSerial};requireValue(raw===JSON.stringify({...body,digest:legacyDigest(JSON.stringify(body))}),'旧关闭记录摘要无效');
    nextRunSerial=Math.max(nextRunSerial,Number(marker.closedSerial)+1);if(key!==markers.temp)closedThroughSerial=Math.max(closedThroughSerial,Number(marker.closedSerial));
   }
  }
  const legacySerials:Partial<Record<RunSlot,number>>={};for(const slot of RUN_SLOTS)if(unassignedSlots.has(slot))legacySerials[slot]=nextRunSerial++;
  const legacySerialCeiling=nextRunSerial-1;
  requireValue(Number.isSafeInteger(nextRunSerial),'旧序号超出范围');const profile=mergeLegacyBoundaries(profiles);
  const {schemaVersion,settings,cosmetics,tutorialComplete,nextRunSerial:oldNext,...legacyResults}=profile;void schemaVersion;void tutorialComplete;void oldNext;
  const guide=(track:'inbound'|'outbound',played:boolean):GuideProgress=>({learned:[...learned[track]],skipped:false,authoredStartConsumed:played});
  const account:AccountSnapshot={formatVersion:1,economyVersion:1,epoch:`local.${accountDigest(canonicalStringify(sourceDigests))}`,generation:0,nextRunSerial,closedThroughSerial,wallet:0,inventory:{rotate:0,clear:0,wildcard:0},run:null,lastClosedResult:null,profile:{settings,cosmetics,legacyResults,results:{}},guides:{inbound:guide('inbound',inboundPlayed),outbound:guide('outbound',outboundPlayed)},dailyPaid:{},resetCursor,legacyImported:true,migration:{version:1,sourceDigests,legacySerialCeiling,legacySerials},lastOperation:null};
  verifyAccountReferences(storage,account);return {status:'ready',account};
 }catch {return {status:'blocked',message:'旧记录无法完整验证，原文已保留，暂不初始化账户'};}
}
