import { P0_CONFIG } from '../rulesets/v1/content.ts';
import type { Upgrade } from '../types.ts';
export { CARGO, SHAPES, DOCKS } from '../rulesets/v1/content.ts';

/** Versioned tuning proposals; behavioral rules are fixed, balance is not claimed. */
export const RULES_V2_CONFIG = {
  ...P0_CONFIG, balanced: false, rulesetVersion: 2, runConfigId: 'run.standard_v2',
  special: { minShift: 3, weights: { normal: 88, pallet: 5, rush: 3, hazard: 3, wildcard: 1 }, rushTurns: 3 },
  sideEntry: { x: 0, y: 6 },
} as const;
const source = (section:string) => `docs/research/01-rules.md#${section}`;
function upgrade(id:string,title:string,description:string,effect:string,behavior:boolean,maxStack:number,minShift:number,tags:string[],params:Record<string,number>,sourceSection:string,provisional=false):Upgrade {
  return {id:`upgrade.${id}`,title,description,color:behavior?'#81c89b':'#d7bf75',effect,behavior,maxStack,minShift,tags,
    prerequisites:[],conflicts:[],params:{baseWeight:100,...params},sourceRef:source(sourceSection),provisional};
}
/** Every effect is grounded in a named rule family. New numerical choices are provisional. */
export const UPGRADES_V2: Upgrade[] = [
  upgrade('overfill','超额装载','每个超额订单单位再加12分，可叠加','overfill',false,99,1,['score','order'],{points:12},'Roguelite升级原则/订单类/超额装载收益'),
  upgrade('deep_route','深入仓库','路线至少3步时，每步再加8分','deep_route',false,3,1,['score','route'],{points:8,minDepth:3},'Roguelite升级原则/Combo类/深路线奖励'),
  upgrade('small_parcels','小件补给','后续1–2格普通货件的基础权重增加60%','small_parcels',true,3,1,['generation','piece'],{weightPercent:60},'Roguelite升级原则/货件类/小件权重'),
  upgrade('chain','连锁加速','每层连锁的倍率再增加20个百分点','chain',false,99,1,['score','chain'],{percent:20},'Chain/真实清路级联；Score/ChainMultiplier'),
  upgrade('contract','优质合约','每张完成订单再加40基础分','contract',false,99,1,['score','order'],{points:40},'订单与叉车通路/Dock/订单基础分值'),
  upgrade('variety','多品联运','同次连锁更换货物类别时再加65分','variety',false,3,1,['score','chain'],{points:65},'Roguelite升级原则/Combo类/不同类别奖励'),
  upgrade('side_gate','西南侧门','整局增加西南空格(0,6)入口；各Dock选择最短通路','side_gate',true,1,1,['route','entry'],{x:RULES_V2_CONFIG.sideEntry.x,y:RULES_V2_CONFIG.sideEntry.y},'Roguelite升级原则/路线类/临时侧入口（整局作用域为本批提案）',true),
  upgrade('pallet_pass','托盘通行','每次放置首单的路线可穿过1个非目标托盘，托盘保留','pallet_pass',true,1,3,['route','pallet'],{maxPallets:1},'Roguelite升级原则/路线类/路线例外；特殊货件/Pallet',true),
  upgrade('small_order_first','小单先行','旧订单按最低数量优先，其次数量相同按原Dock顺序','small_order_first',true,1,1,['order','priority'],{priorityAmount:1},'Roguelite升级原则/叉车类/Dock结算先后选择',true),
  upgrade('light_orders','轻量订单','之后新订单的需求数量减少1，最低2；旧单不变','light_orders',true,1,1,['order','generation'],{reduction:1,floor:2},'Roguelite升级原则/订单类/可选订单（数量分布提案）',true),
  upgrade('stock_orders','库存合约','新订单按已有库存加权货类，仍不重复、不保证可完成','stock_orders',true,1,1,['order','generation'],{baseCargoWeight:20,unitWeight:8},'Roguelite升级原则/订单类/可选订单；04-contract/PieceGenerator/当前货物分布',true),
  upgrade('four_choices','四件候选','立即增加第4件候选，全部候选均无处可放才爆仓','four_choices',true,1,1,['piece','generation'],{candidateCount:4},'Roguelite升级原则/货件类/四选一',true),
  upgrade('pallet_supply','托盘补给','Shift3起每第4次生成固定为单格托盘','pallet_supply',true,1,3,['piece','generation','pallet'],{interval:4},'特殊货件/Pallet；04-contract/PieceGenerator/特殊货件节奏',true),
  upgrade('rush_buffer','加急缓冲','之后生成的加急货件增加2次有效放置期限','rush_buffer',true,1,3,['piece','rush'],{extraTurns:2},'特殊货件/Rush/多次操作仍未出库会变占位障碍',true),
  upgrade('hazard_clearance','危险品清障','危险品出货时最多清2个货组相邻废弃物','hazard_clearance',true,1,3,['clear','hazard'],{maxWaste:2},'特殊货件/Hazard；Roguelite升级原则/叉车类/清障',true),
  upgrade('wild_supply','万能补给','万能生成权重由1增至3，普通等量减少，仍低频','wild_supply',true,1,3,['piece','generation','wildcard'],{weightBonus:2},'特殊货件/Wildcard/生成率极低；Roguelite升级原则/货件类/低频万能托盘',true),
  upgrade('sweep_route','路线清扫','每次放置首单后清理路线旁扫描序第1个废弃物','sweep_route',true,1,1,['route','clear'],{maxWaste:1},'Roguelite升级原则/叉车类/清障',true),
  upgrade('extra_pickup','顺路搬运','每次放置首单后清路线旁第1格非目标普通货物；不计出货分','extra_pickup',true,1,1,['route','clear'],{maxCargo:1},'Roguelite升级原则/叉车类/一次额外搬运',true),
];
/** Each registered effect is implemented by v2 board/engine, checked by preflight. */
export const EFFECTS_V2 = UPGRADES_V2.map(upgrade=>upgrade.effect);
export function upgradeStackV2(state:{upgrades:string[]},effect:string):number {return state.upgrades.filter(id=>id===`upgrade.${effect}`).length;}
export function upgradeParamV2(effect:string,param:string):number {
  const value=UPGRADES_V2.find(upgrade=>upgrade.effect===effect)?.params?.[param];
  if(value===undefined)throw new Error(`Missing v2 upgrade parameter: ${effect}.${param}`);
  return value;
}
