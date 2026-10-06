import type {RunState,Order,Point} from './types.ts';
import type {RunState as LegacyState} from './rulesets/v1/types.ts';
import {orderStatus as legacyStatus} from './rulesets/v1/board.ts';
import {orderStatusV2} from './v2/board.ts';
export {BOARD_SIZE,toIndex,toPoint,neighbors,collectGroups,findRoute,selectOrderGroup} from './rulesets/v1/board.ts';
export type {CargoGroup,ReachableGroup} from './rulesets/v1/board.ts';
export interface OrderStatus {count:number;status:'ready'|'blocked'|'need';path:Point[];reason?:'insufficient'|'entry-blocked'|'route-blocked'|'ready'}
export function orderStatus(state:RunState,order:Order):OrderStatus {return state.rulesetVersion>=2?orderStatusV2(state,order):legacyStatus(state as LegacyState,order);}
