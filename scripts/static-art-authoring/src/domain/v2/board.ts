import type { CargoId, Dock, Order, Point, RunState } from '../types.ts';
import { DOCKS, RULES_V2_CONFIG, upgradeStackV2 } from './content.ts';
export { BOARD_SIZE, toIndex, toPoint, neighbors } from '../rulesets/v1/board.ts';
import { toIndex, toPoint, neighbors } from '../rulesets/v1/board.ts';
export interface CargoGroupV2 { cargo:CargoId;cells:number[];units:number }
export interface ReachableGroupV2 {group:CargoGroupV2;path:Point[];usedPalletPass:boolean}
export function cellUnitsV2(state:RunState,index:number):number {
  if(state.board[index]===null||state.cellTraits?.[index]?.kind==='waste')return 0;
  return state.cellTraits?.[index]?.kind==='pallet'?2:1;
}
/** Wildcard membership is evaluated against one current order, never assigned globally. */
export function collectGroupsV2(state:RunState,cargo:CargoId):CargoGroupV2[] {
  const eligible=(index:number)=>state.board[index]!==null&&state.cellTraits?.[index]?.kind!=='waste'&&(state.board[index]===cargo||state.cellTraits?.[index]?.kind==='wildcard');
  const groups:CargoGroupV2[]=[],visited=new Set<number>();
  for(let i=0;i<state.board.length;i++){
    if(!eligible(i)||visited.has(i))continue;
    const cells=[i];visited.add(i);
    for(let cursor=0;cursor<cells.length;cursor++)for(const next of neighbors(cells[cursor]))if(eligible(next)&&!visited.has(next)){visited.add(next);cells.push(next);}
    cells.sort((a,b)=>a-b);groups.push({cargo,cells,units:cells.reduce((sum,index)=>sum+cellUnitsV2(state,index),0)});
  }
  return groups;
}
function routeFrom(state:RunState,entry:Point,cells:number[],allowPallet:boolean):{path:Point[];usedPalletPass:boolean}|null {
  const start=toIndex(entry);if(state.board[start]!==null)return null;
  const group=new Set(cells),targets=new Set(cells.flatMap(neighbors).filter(i=>state.board[i]===null));
  // BFS state includes whether the one allowed occupied pallet has already been crossed.
  const queue=[start],parent=new Map<number,number>([[start,-1]]);
  for(let cursor=0;cursor<queue.length;cursor++){
    const key=queue[cursor],current=key%49,used=key>=49;
    if(targets.has(current)){
      const path:Point[]=[];let step=key;while(step!==-1){path.push(toPoint(step%49));step=parent.get(step)!;}
      return {path:path.reverse(),usedPalletPass:used};
    }
    for(const next of neighbors(current)){
      const isPallet=state.cellTraits?.[next]?.kind==='pallet'&&!group.has(next);
      if(state.board[next]!==null&&!(allowPallet&&!used&&isPallet))continue;
      const nextKey=next+(used||state.board[next]!==null?49:0);
      if(!parent.has(nextKey)){parent.set(nextKey,key);queue.push(nextKey);}
    }
  }
  return null;
}
export function findRouteV2(state:RunState,dock:Dock,cells:number[],allowPallet=false):{path:Point[];usedPalletPass:boolean}|null {
  const original=routeFrom(state,dock.entry,cells,allowPallet);
  if(!upgradeStackV2(state,'side_gate'))return original;
  const side=routeFrom(state,RULES_V2_CONFIG.sideEntry,cells,allowPallet);
  return side&&(!original||side.path.length<original.path.length)?side:original;
}
export function selectOrderGroupV2(state:RunState,order:Order,allowPallet=upgradeStackV2(state,'pallet_pass')>0):ReachableGroupV2|null {
  const dock=DOCKS.find(d=>d.id===order.dockId);if(!dock)return null;
  const eligible:ReachableGroupV2[]=[];
  for(const group of collectGroupsV2(state,order.cargo)){
    if(group.units<order.amount)continue;
    const route=findRouteV2(state,dock,group.cells,allowPallet);if(route)eligible.push({group,...route});
  }
  eligible.sort((a,b)=>a.path.length-b.path.length||b.group.units-a.group.units||a.group.cells[0]-b.group.cells[0]);
  return eligible[0]??null;
}
export function orderStatusV2(state:RunState,order:Order):{count:number;status:'ready'|'blocked'|'need';path:Point[];reason:'insufficient'|'entry-blocked'|'route-blocked'|'ready'} {
  const count=Math.max(0,...collectGroupsV2(state,order.cargo).map(group=>group.units));
  if(count<order.amount)return {count,status:'need',path:[],reason:'insufficient'};
  const selected=selectOrderGroupV2(state,order);if(selected)return {count,status:'ready',path:selected.path,reason:'ready'};
  const dock=DOCKS.find(d=>d.id===order.dockId);
  const entryBlocked=!dock||state.board[toIndex(dock.entry)]!==null;
  const sideBlocked=!upgradeStackV2(state,'side_gate')||state.board[toIndex(RULES_V2_CONFIG.sideEntry)]!==null;
  return {count,status:'blocked',path:[],reason:entryBlocked&&sideBlocked?'entry-blocked':'route-blocked'};
}
