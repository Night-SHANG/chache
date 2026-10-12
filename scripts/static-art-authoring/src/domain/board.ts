import type {RunState,Order,Point} from './types.ts';
import type {RunState as LegacyState} from './rulesets/v1/types.ts';
import {orderStatus as legacyStatus} from './rulesets/v1/board.ts';
import {orderStatusV6} from './v6/board.ts';
import {orderStatusV4} from './v4/board.ts';
import {assertRulesIdentity} from './engine.ts';
import {orderStatusV2} from './v2/board.ts';
export {BOARD_SIZE,toIndex,toPoint,neighbors,collectGroups,findRoute,selectOrderGroup} from './rulesets/v1/board.ts';
export type {CargoGroup,ReachableGroup} from './rulesets/v1/board.ts';
export interface OrderStatus {count:number;status:'ready'|'blocked'|'need';path:Point[];reason?:'insufficient'|'exit-unconnected'|'entry-blocked'|'route-blocked'|'ready';largestGroupCount?:number;exitConnected?:boolean}
export function orderStatus(state:RunState,order:Order):OrderStatus {
 assertRulesIdentity(state);
 if(state.rulesetVersion===6||state.rulesetVersion===8)return orderStatusV6(state,order);
 if(state.rulesetVersion===5)return orderStatusV4(state,order);
 if(state.rulesetVersion===4)return orderStatusV4(state,order);
 if(state.rulesetVersion===2||state.rulesetVersion===3||state.rulesetVersion===7)return orderStatusV2(state,order);
 if(state.rulesetVersion===1)return legacyStatus(state as LegacyState,order);
 throw Error(`不支持规则版本 ${state.rulesetVersion}`);
}
