import type {Order,Point,RunState,Shipment} from '../types.ts';
import type {OrderStatus} from '../board.ts';
import {collectGroups,findRoute,neighbors,toIndex,toPoint} from '../rulesets/v1/board.ts';
import type {CargoGroup} from '../rulesets/v1/board.ts';
import {COLOR_EXIT_DOCKS,COLOR_EXIT_ENTRY,RULES_V4_CONFIG as CONFIG} from './content.ts';
export interface ReachableExitGroup {group:CargoGroup;path:Point[];cargoPaths:NonNullable<Shipment['cargoPaths']>}
function connectedGroup(state:RunState,order:Order):CargoGroup|null {
 const dock=COLOR_EXIT_DOCKS.find(d=>d.id===order.dockId&&d.cargo===order.cargo);
 if(!dock)return null;
 return collectGroups(state.board).find(group=>group.cargo===dock.cargo&&group.cells.includes(toIndex(dock.entry)))??null;
}
/** Reverse BFS from the fixed gate builds one stable tree. Every cargo step stays inside this group. */
function cargoPaths(cells:number[],gate:Point):NonNullable<Shipment['cargoPaths']> {
 const root=toIndex(gate),group=new Set(cells),queue=[root],parents=new Map<number,number>([[root,-1]]);
 for(let cursor=0;cursor<queue.length;cursor++)for(const next of neighbors(queue[cursor]))if(group.has(next)&&!parents.has(next)){
  parents.set(next,queue[cursor]);queue.push(next);
 }
 return cells.map(cell=>{const path:Point[]=[];for(let step=cell;step!==-1;step=parents.get(step)!)path.push(toPoint(step));return {cell,path};});
}
export function selectExitGroupV4(state:RunState,order:Order):ReachableExitGroup|null {
 const group=connectedGroup(state,order);if(!group||group.cells.length<CONFIG.minBatch)return null;
 const path=findRoute(state.board,COLOR_EXIT_ENTRY,group.cells);if(!path)return null;
 return {group,path,cargoPaths:cargoPaths(group.cells,COLOR_EXIT_DOCKS.find(d=>d.id===order.dockId)!.entry)};
}
/** count is gate-connected progress, never the largest detached group. */
export function orderStatusV4(state:RunState,order:Order):OrderStatus {
 const group=connectedGroup(state,order),count=group?.cells.length??0;
 const largestGroupCount=Math.max(0,...collectGroups(state.board).filter(g=>g.cargo===order.cargo).map(g=>g.cells.length));
 const progress={count,largestGroupCount,exitConnected:group!==null};
 if(!group&&largestGroupCount>=CONFIG.minBatch)return {...progress,status:'blocked',path:[],reason:'exit-unconnected'};
 if(count<CONFIG.minBatch)return {...progress,status:'need',path:[],reason:'insufficient'};
 if(state.board[toIndex(COLOR_EXIT_ENTRY.entry)]!==null)return {...progress,status:'blocked',path:[],reason:'entry-blocked'};
 const path=findRoute(state.board,COLOR_EXIT_ENTRY,group!.cells);
 return {...progress,status:path?'ready':'blocked',path:path??[],reason:path?'ready':'route-blocked'};
}
