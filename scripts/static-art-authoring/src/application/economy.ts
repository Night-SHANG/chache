import type { AccountSnapshot, EconomyScope, ItemId } from './account-types.ts';
export const ITEM_PRICES:Readonly<Record<ItemId,number>>=Object.freeze({rotate:80,clear:120,wildcard:160});
const safe=(value:number)=>Number.isSafeInteger(value)&&value>=0;
export function baseCoins(scope:EconomyScope,units:number,score:number,economyVersion:1|2=1):number {
 if((scope!=='inbound'&&scope!=='outbound')||!safe(units)||!safe(score))throw Error('收益数据无效');
 if(economyVersion===2)return Math.floor(score/(scope==='inbound'?120:30));
 if(economyVersion!==1)throw Error('收益版本无效');
 const result=units+Math.min(Math.floor(score/(scope==='inbound'?1000:200)),Math.floor(units/2))+15*Math.floor(units/30);
 if(!safe(result))throw Error('收益超出安全整数范围');return result;
}

/** Frozen daily9/11 only: a failed/abandoned pre-win run has at most
 * 29 + floor(29/2) = 43 coins, while reaching 30 has at least 30 + 15 = 45.
 * In v9, the last upgrade is at 26 and one placement resolves <=4 old orders:
 * an unclaimed final upgrade can reach at most 25+4=29, then blocks placement.
 * V11 has no upgrades. Do not generalize this proof to future economic ledgers. */
export function dailyRewardRecord(account:Readonly<AccountSnapshot>,day:string):{completedRunId:string|null;bonusPaid:number} {
 const existing=account.dailyRewards?.[day],legacy=account.dailyPaid[day];
 let completedRunId=existing?.completedRunId??null;
 if(!completedRunId&&legacy&&legacy.bestBase>=45)completedRunId=`legacy.${day}`;
 if(!completedRunId&&Object.values(account.profile.legacyResults.dailyHistory).some(entry=>entry.day===day&&entry.won))completedRunId=`legacy.${day}`;
 for(const run of [account.run,account.lastClosedResult])if(run?.identity.mode==='daily'&&run.identity.challengeDay===day
  &&('state' in run?run.state.result==='won':run.result==='won'))completedRunId??=run.identity.runId;
 return {completedRunId,bonusPaid:Math.max(existing?.bonusPaid??0,legacy?.paid??0)};
}

/** Read-only preparation: the caller persists schema and the triggering operation together. */
export function upgradeEconomy(account:AccountSnapshot):AccountSnapshot {
 const days=new Set(Object.values(account.profile.legacyResults.dailyHistory).filter(entry=>entry.won).map(entry=>entry.day));
 for(const run of [account.run,account.lastClosedResult])if(run?.identity.mode==='daily'&&run.identity.challengeDay
  &&('state' in run?run.state.result==='won':run.result==='won'))days.add(run.identity.challengeDay);
 const dailyRewards={...account.dailyRewards,...Object.fromEntries([...days].map(day=>[day,dailyRewardRecord(account,day)]))};
 return {...account,formatVersion:account.formatVersion>=3?account.formatVersion:2,economyVersion:2,dailyRewards};
}
export function dailyAward(base:number,previous:{bestBase:number;paid:number}):{extra:number;next:{bestBase:number;paid:number}} {
 if(!safe(base)||!safe(previous.bestBase)||!safe(previous.paid)||previous.paid>120||previous.paid!==Math.min(120,previous.bestBase>=60?120:previous.bestBase*2))throw Error('每日收益记录无效');
 const bestBase=Math.max(base,previous.bestBase),paid=bestBase>=60?120:bestBase*2;
 return {extra:paid-previous.paid,next:{bestBase,paid}};
}
