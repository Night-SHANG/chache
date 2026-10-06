import type { EconomyScope, ItemId } from './account-types.ts';
export const ITEM_PRICES:Readonly<Record<ItemId,number>>=Object.freeze({rotate:80,clear:120,wildcard:160});
const safe=(value:number)=>Number.isSafeInteger(value)&&value>=0;
export function baseCoins(scope:EconomyScope,units:number,score:number):number {
 if((scope!=='inbound'&&scope!=='outbound')||!safe(units)||!safe(score))throw Error('收益数据无效');
 const result=units+Math.min(Math.floor(score/(scope==='inbound'?1000:200)),Math.floor(units/2))+15*Math.floor(units/30);
 if(!safe(result))throw Error('收益超出安全整数范围');return result;
}
export function dailyAward(base:number,previous:{bestBase:number;paid:number}):{extra:number;next:{bestBase:number;paid:number}} {
 if(!safe(base)||!safe(previous.bestBase)||!safe(previous.paid)||previous.paid>120||previous.paid!==Math.min(120,previous.bestBase>=60?120:previous.bestBase*2))throw Error('每日收益记录无效');
 const bestBase=Math.max(base,previous.bestBase),paid=bestBase>=60?120:bestBase*2;
 return {extra:paid-previous.paid,next:{bestBase,paid}};
}
