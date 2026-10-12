import type { CargoId, Shape, Dock, Upgrade } from './types.ts';

/** P0 tuning only: these values are explicitly unbalanced, not release economy. */
export const P0_CONFIG = {
  balanced: false, rulesetVersion: 1, runConfigId: 'run.standard_p0_v1',
  boardSize: 7, candidateCount: 3, shiftCount: 5, ordersPerShift: 6,
  upgradeEvery: 4, resolutionLimit: 64,
  docksByShift: [2, 3, 3, 4, 4], cargoByShift: [3, 3, 4, 5, 5],
  orderMinByShift: [3, 3, 4, 4, 5], orderMaxByShift: [4, 5, 5, 6, 7],
  score: { orderBase: 100, orderPerShift: 25, overfill: 12, routeDepth: 5, chainPercent: 25, shiftBonus: 200 },
  upgrade: { overfill: 12, deepRoute: 8, chainPercent: 20, contract: 40, variety: 65, smallWeightPercent: 60 },
  generation: { occupancySmallPercent: 200, recentShapeDivisor: 2, cargoPresenceWeight: 2 },
} as const;

export const CARGO: {id: CargoId; name: string; color: string; icon: string}[] = [
  {id: 'cargo.food', name: '食品', color: '#e9584b', icon: 'apple'},
  {id: 'cargo.machine', name: '机械', color: '#76a74d', icon: 'gear'},
  {id: 'cargo.chem', name: '化工', color: '#efb938', icon: 'warning'},
  {id: 'cargo.electronic', name: '电子', color: '#8f70d1', icon: 'chip'},
  {id: 'cargo.cold', name: '冷藏', color: '#59b5e7', icon: 'snow'},
];
const shape = (id: string, points: number[][], minShift: number, weight: number): Shape => ({ id: `shape.${id}`, cells: points.map(([x,y]) => ({x,y})), minShift, weight });
export const SHAPES: Shape[] = [
  shape('single', [[0,0]], 1, 22),
  shape('domino_h', [[0,0],[1,0]], 1, 18), shape('domino_v', [[0,0],[0,1]], 1, 18),
  shape('i3_h', [[0,0],[1,0],[2,0]], 1, 12), shape('i3_v', [[0,0],[0,1],[0,2]], 1, 12),
  shape('l3_ne', [[0,0],[1,0],[0,1]], 1, 10), shape('l3_nw', [[0,0],[1,0],[1,1]], 1, 10),
  shape('l3_se', [[0,0],[0,1],[1,1]], 1, 10), shape('l3_sw', [[1,0],[0,1],[1,1]], 1, 10),
  shape('square', [[0,0],[1,0],[0,1],[1,1]], 2, 10),
  shape('i4_h', [[0,0],[1,0],[2,0],[3,0]], 2, 6), shape('i4_v', [[0,0],[0,1],[0,2],[0,3]], 2, 6),
  shape('t4_n', [[0,0],[1,0],[2,0],[1,1]], 2, 8), shape('t4_s', [[1,0],[0,1],[1,1],[2,1]], 2, 8),
  shape('l4_e', [[0,0],[0,1],[0,2],[1,2]], 2, 7), shape('l4_w', [[1,0],[1,1],[0,2],[1,2]], 2, 7),
  shape('s4_h', [[1,0],[2,0],[0,1],[1,1]], 3, 5), shape('z4_h', [[0,0],[1,0],[1,1],[2,1]], 3, 5),
  shape('p5', [[0,0],[1,0],[0,1],[1,1],[0,2]], 4, 3),
  shape('cross5', [[1,0],[0,1],[1,1],[2,1],[1,2]], 4, 3),
];
export const DOCKS: Dock[] = [
  {id:'dock.north', name:'北门', entry:{x:3,y:0}, side:'north', priority:0},
  {id:'dock.east', name:'东门', entry:{x:6,y:3}, side:'east', priority:1},
  {id:'dock.south', name:'南门', entry:{x:3,y:6}, side:'south', priority:2},
  {id:'dock.west', name:'西门', entry:{x:0,y:3}, side:'west', priority:3},
];
/** The three 99-stack score upgrades cannot exhaust during the seven selections of a P0 run.
 * They are the deterministic fallback after the three low-cap upgrades are exhausted. */
export const UPGRADES: Upgrade[] = [
  {id:'upgrade.overfill',title:'超额装载',description:'每个超额货箱再加12分，可叠加',color:'#f4b85e',maxStack:99,effect:'overfill'},
  {id:'upgrade.deep_route',title:'深入仓库',description:'路线至少3步时，每步再加8分',color:'#74b9db',maxStack:3,effect:'deep_route'},
  {id:'upgrade.small_parcels',title:'小件补给',description:'后续1–2格货件的基础权重增加60%',color:'#81c89b',maxStack:3,effect:'small_parcels'},
  {id:'upgrade.chain',title:'连锁加速',description:'每层连锁的倍率再增加20个百分点',color:'#e7a4a7',maxStack:99,effect:'chain'},
  {id:'upgrade.contract',title:'优质合约',description:'每张完成订单再加40基础分',color:'#d7bf75',maxStack:99,effect:'contract'},
  {id:'upgrade.variety',title:'多品联运',description:'同次连锁更换货物类别时再加65分',color:'#ba9eda',maxStack:3,effect:'variety'},
];
