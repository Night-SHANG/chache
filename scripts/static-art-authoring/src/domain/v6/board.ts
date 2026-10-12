import type {CargoId,Cell,Dock,Order,Point,RunState,Shipment} from '../types.ts';
import type {OrderStatus} from '../board.ts';
import {OUTBOUND_DOCKS,OUTBOUND_ENTRY,RULES_V6_CONFIG as CONFIG} from './content.ts';
export const BOARD_SIZE_V6=CONFIG.boardSize;
export const toIndexV6=(point:Point):number=>point.y*BOARD_SIZE_V6+point.x;
export const toPointV6=(index:number):Point=>({x:index%BOARD_SIZE_V6,y:Math.floor(index/BOARD_SIZE_V6)});
export interface CargoGroupV6 {cargo:CargoId;cells:number[]}
export interface ReachableExitGroupV6 {group:CargoGroupV6;path:Point[];cargoPaths:NonNullable<Shipment['cargoPaths']>}
/** Fixed north/east/south/west order is part of v6 route determinism. */
export function neighborsV6(index:number):number[] {
 const x=index%BOARD_SIZE_V6,y=Math.floor(index/BOARD_SIZE_V6),out:number[]=[];
 if(y>0)out.push(index-BOARD_SIZE_V6);if(x<BOARD_SIZE_V6-1)out.push(index+1);if(y<BOARD_SIZE_V6-1)out.push(index+BOARD_SIZE_V6);if(x>0)out.push(index-1);return out;
}
export function collectGroupsV6(board:Cell[]):CargoGroupV6[] {
 const visited=new Set<number>(),groups:CargoGroupV6[]=[];
 for(let i=0;i<board.length;i++){
  const cargo=board[i];if(cargo===null||visited.has(i))continue;
  const cells=[i];visited.add(i);
  for(let cursor=0;cursor<cells.length;cursor++)for(const next of neighborsV6(cells[cursor]))if(board[next]===cargo&&!visited.has(next)){visited.add(next);cells.push(next);}
  cells.sort((a,b)=>a-b);groups.push({cargo,cells});
 }
 return groups;
}
export function findRouteV6(board:Cell[],dock:Dock,cells:number[]):Point[]|null {
 const start=toIndexV6(dock.entry);if(board[start]!==null)return null;
 const targets=new Set(cells.flatMap(neighborsV6).filter(index=>board[index]===null));
 const queue=[start],parents=new Map<number,number>([[start,-1]]);
 for(let cursor=0;cursor<queue.length;cursor++){
  const current=queue[cursor];if(targets.has(current)){const route:Point[]=[];for(let step=current;step!==-1;step=parents.get(step)!)route.push(toPointV6(step));return route.reverse();}
  for(const next of neighborsV6(current))if(board[next]===null&&!parents.has(next)){parents.set(next,current);queue.push(next);}
 }
 return null;
}
function connectedGroup(state:RunState,order:Order):CargoGroupV6|null {
 const dock=OUTBOUND_DOCKS.find(d=>d.id===order.dockId&&d.cargo===order.cargo);if(!dock)return null;
 return collectGroupsV6(state.board).find(group=>group.cargo===dock.cargo&&group.cells.includes(toIndexV6(dock.entry)))??null;
}
/** Each event owns its exact same-color tree; residual mixed cells can never enter these paths. */
function cargoPaths(cells:number[],gate:Point):NonNullable<Shipment['cargoPaths']> {
 const root=toIndexV6(gate),group=new Set(cells),queue=[root],parents=new Map<number,number>([[root,-1]]);
 for(let cursor=0;cursor<queue.length;cursor++)for(const next of neighborsV6(queue[cursor]))if(group.has(next)&&!parents.has(next)){parents.set(next,queue[cursor]);queue.push(next);}
 return cells.map(cell=>{const path:Point[]=[];for(let step=cell;step!==-1;step=parents.get(step)!)path.push(toPointV6(step));return {cell,path};});
}
export function selectExitGroupV6(state:RunState,order:Order):ReachableExitGroupV6|null {
 const group=connectedGroup(state,order);if(!group||group.cells.length<CONFIG.minBatch)return null;
 const path=findRouteV6(state.board,OUTBOUND_ENTRY,group.cells);if(!path)return null;
 return {group,path,cargoPaths:cargoPaths(group.cells,OUTBOUND_DOCKS.find(d=>d.id===order.dockId)!.entry)};
}
export function orderStatusV6(state:RunState,order:Order):OrderStatus {
 const group=connectedGroup(state,order),count=group?.cells.length??0;
 const largestGroupCount=Math.max(0,...collectGroupsV6(state.board).filter(g=>g.cargo===order.cargo).map(g=>g.cells.length));
 const progress={count,largestGroupCount,exitConnected:group!==null};
 if(!group&&largestGroupCount>=CONFIG.minBatch)return {...progress,status:'blocked',path:[],reason:'exit-unconnected'};
 if(count<CONFIG.minBatch)return {...progress,status:'need',path:[],reason:'insufficient'};
 if(state.board[toIndexV6(OUTBOUND_ENTRY.entry)]!==null)return {...progress,status:'blocked',path:[],reason:'entry-blocked'};
 const path=findRouteV6(state.board,OUTBOUND_ENTRY,group!.cells);
 return {...progress,status:path?'ready':'blocked',path:path??[],reason:path?'ready':'route-blocked'};
}
