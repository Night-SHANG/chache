import type { InboundRunV9, StartV9, ToolChargesV9, UpgradeV9, UpgradeIdV9 } from './types.ts';
export { CARGO, SHAPES } from '../rulesets/v1/content.ts';

const upgrade=(id:UpgradeIdV9,title:string,description:string,maxStack:number,unlockOrders:number,functional:boolean):UpgradeV9=>Object.freeze({id,title,description,maxStack,unlockOrders,functional});
export const UPGRADES_V9:readonly UpgradeV9[]=Object.freeze([
  upgrade('candidate_slots','候选扩容','候选3→4→5，立即补足新增槽',2,4,true),
  upgrade('warehouse_expand','扩仓','7×7→8×8，增加15个空格',1,12,true),
  upgrade('side_gate','公共叉车侧门','西南公共出入口；从此门进出',1,8,true),
  upgrade('small_parcels','小件更多','普通货件的小件概率每层增加10个百分点',2,4,true),
  upgrade('cargo_supply','货类专供','锁定一种已解锁货类，概率每层增加10个百分点',2,4,true),
  upgrade('light_orders','订单减量','现有和未来订单少1件，最低3件',1,4,true),
  upgrade('pallet_rate','双倍箱更多','双倍箱概率5%→10%→15%',2,12,true),
  upgrade('order_bonus','订单奖金','每单额外加50分，每层累加',3,4,false),
  upgrade('overfill_bonus','超额奖金','每个超额单位额外加10分，每层累加',3,4,false),
  upgrade('chain_bonus','连单奖金','同次第2单起每单额外加100分，每层累加',3,4,false),
]);
export const RULES_V9_CONFIG=Object.freeze({
  balanced:false,rulesetVersion:9,runConfigId:'run.inbound_v9',boardSize:7,candidateCount:3,shiftCount:5,ordersPerShift:6,resolutionLimit:64,
  upgradeThresholds:Object.freeze([4,8,12,16,20,24,26]),
  cargoByShift:Object.freeze([3,3,4,5,5]),docksByShift:Object.freeze([2,3,3,4,4]),
  orderMinByShift:Object.freeze([4,4,4,4,5]),orderMaxByShift:Object.freeze([4,5,5,6,7]),
  score:Object.freeze({orderBase:100,orderPerShift:25,overfill:12,routeDepth:5,chainPercent:25,shiftBonus:200}),
  generation:Object.freeze({occupancySmallPercent:200,recentShapeDivisor:2,cargoPresenceWeight:2}),
  special:Object.freeze({minShift:3,rushTurns:3,weights:Object.freeze({normal:85,pallet:5,rush:6,hazard:3,wildcard:1})}),
  cleanup:Object.freeze({orders:2,placements:6}),toolPrices:Object.freeze({rotate:80,clear:120,wildcard:160}),
} as const);
export function getStageV9(completedOrders:number):1|2|3|4|5 {
  if(!Number.isSafeInteger(completedOrders)||completedOrders<0)throw new Error('Invalid completed orders');
  return Math.min(5,Math.floor(completedOrders/6)+1) as 1|2|3|4|5;
}
export function upgradeLevelV9(state:Pick<InboundRunV9,'levels'>,id:UpgradeIdV9):number{return state.levels[id];}
export function validToolChargesV9(value:unknown,mode:StartV9['mode']):value is ToolChargesV9 {
  if(!value||typeof value!=='object')return false;
  const charges=value as Record<string,unknown>;
  if(Object.keys(charges).length!==3||!['rotate','clear','wildcard'].every(id=>charges[id]===0||charges[id]===1))return false;
  const total=(charges.rotate as number)+(charges.clear as number)+(charges.wildcard as number);
  return total<=2&&(mode!=='daily'||total===0);
}

export function emptyLevelsV9():Record<UpgradeIdV9,number>{return Object.fromEntries(UPGRADES_V9.map(u=>[u.id,0])) as Record<UpgradeIdV9,number>;}
