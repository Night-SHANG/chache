import type { StartV14, ToolChargesV14, UpgradeIdV14 } from './types.ts';
export { CARGO, SHAPES } from '../rulesets/v1/content.ts';

/** Neutral compatibility keys; rules14 never grants or evaluates upgrades. */
export const NEUTRAL_LEVEL_IDS_V14=Object.freeze(['candidate_slots','warehouse_expand','side_gate','small_parcels','cargo_supply','light_orders','pallet_rate','order_bonus','overfill_bonus','chain_bonus'] as const);
export const RULES_V14_CONFIG=Object.freeze({
  balanced:false,rulesetVersion:14,runConfigId:'run.inbound_v14',boardSize:7,candidateCount:3,shiftCount:5,ordersPerShift:6,resolutionLimit:64,
  cargoByShift:Object.freeze([3,3,4,5,5]),docksByShift:Object.freeze([2,3,3,4,4]),
  orderMinByShift:Object.freeze([3,3,4,4,5]),orderMaxByShift:Object.freeze([4,5,5,6,7]),
  score:Object.freeze({orderBase:100,orderPerShift:25,overfill:12,routeDepth:5,chainPercent:25,shiftBonus:200}),
  generation:Object.freeze({occupancySmallPercent:200,recentShapeDivisor:2,cargoPresenceWeight:2}),
  special:Object.freeze({minShift:3,rushTurns:3,weights:Object.freeze({normal:85,pallet:5,rush:6,hazard:3,wildcard:1})}),
  cleanup:Object.freeze({orders:2,placements:6}),toolPrices:Object.freeze({rotate:80,clear:120,wildcard:160}),
} as const);
export function getStageV14(completedOrders:number):1|2|3|4|5 {
  if(!Number.isSafeInteger(completedOrders)||completedOrders<0)throw new Error('Invalid completed orders');
  return Math.min(5,Math.floor(completedOrders/6)+1) as 1|2|3|4|5;
}
export function validToolChargesV14(value:unknown,mode:StartV14['mode']):value is ToolChargesV14 {
  if(!value||typeof value!=='object')return false;
  const charges=value as Record<string,unknown>;
  if(Object.keys(charges).length!==3||!['rotate','clear','wildcard'].every(id=>charges[id]===0||charges[id]===1))return false;
  const total=(charges.rotate as number)+(charges.clear as number)+(charges.wildcard as number);
  return total<=2&&(mode!=='daily'||total===0);
}

export function emptyLevelsV14():Record<UpgradeIdV14,0>{return Object.fromEntries(NEUTRAL_LEVEL_IDS_V14.map(id=>[id,0])) as Record<UpgradeIdV14,0>;}
