import { SHAPES, DOCKS } from '../rulesets/v1/content.ts';
import type { Point, CargoId, Order } from '../types.ts';
import type { InboundRunV16, PieceV16, CargoGroupV16, RouteV16, ReachableGroupV16, DockV16 } from './types.ts';

export function toIndexV16(point:Point,size:7):number{return point.y*size+point.x;}
export function toPointV16(index:number,size:7):Point{return {x:index%size,y:Math.floor(index/size)};}
export function neighborsV16(index:number,size:7):number[]{
 const {x,y}=toPointV16(index,size);return [{x,y:y-1},{x:x-1,y},{x:x+1,y},{x,y:y+1}].filter(p=>p.x>=0&&p.x<size&&p.y>=0&&p.y<size).map(p=>toIndexV16(p,size));
}
export function docksV16(state:Pick<InboundRunV16,'boardSize'>):DockV16[]{return DOCKS.map(d=>({...d,entry:{x:d.side==='east'?state.boardSize-1:d.entry.x,y:d.side==='south'?state.boardSize-1:d.entry.y}}));}
/** All fixed dock entries stay empty, including the doors not yet active for orders. */
export function reservedEntryCellsV16(state:Pick<InboundRunV16,'boardSize'>):number[]{return docksV16(state).map(dock=>toIndexV16(dock.entry,state.boardSize));}
export function pieceCellsV16(piece:PieceV16):Point[]{
 const shape=SHAPES.find(s=>s.id===piece.shapeId);if(!shape||![0,1,2,3].includes(piece.quarterTurns))return [];
 let cells=shape.cells.map(p=>({...p}));
 for(let turn=0;turn<piece.quarterTurns;turn++)cells=cells.map(p=>({x:-p.y,y:p.x}));
 const minX=Math.min(...cells.map(p=>p.x)),minY=Math.min(...cells.map(p=>p.y));
 return cells.map(p=>({x:p.x-minX,y:p.y-minY})).sort((a,b)=>a.y-b.y||a.x-b.x);
}
export function cellUnitsV16(state:InboundRunV16,index:number):number{return state.board[index]===null||state.cellTraits[index]?.kind==='waste'?0:state.cellTraits[index]?.kind==='pallet'?2:1;}
export function collectGroupsV16(state:InboundRunV16,cargo:CargoId):CargoGroupV16[]{
 const eligible=(i:number)=>cellUnitsV16(state,i)>0&&(state.board[i]===cargo||state.cellTraits[i]?.kind==='wildcard');
 const groups:CargoGroupV16[]=[],visited=new Set<number>();
 for(let i=0;i<state.board.length;i++){
  if(!eligible(i)||visited.has(i))continue;
  const cells=[i];visited.add(i);
  for(let cursor=0;cursor<cells.length;cursor++)for(const n of neighborsV16(cells[cursor],state.boardSize))if(eligible(n)&&!visited.has(n)){cells.push(n);visited.add(n);}
  cells.sort((a,b)=>a-b);groups.push({cargo,cells,units:cells.reduce((sum,i)=>sum+cellUnitsV16(state,i),0)});
 }
 return groups;
}
function routeFrom(state:InboundRunV16,entry:Point,cells:number[],gateId:string):RouteV16|null {
 const start=toIndexV16(entry,state.boardSize);if(state.board[start]!==null)return null;
 const targets=new Set(cells.flatMap(i=>neighborsV16(i,state.boardSize)).filter(i=>state.board[i]===null));
 const queue=[start],parent=new Map<number,number>([[start,-1]]);
 for(let cursor=0;cursor<queue.length;cursor++){
  const current=queue[cursor];
  if(targets.has(current)){const path:Point[]=[];let step=current;while(step!==-1){path.push(toPointV16(step,state.boardSize));step=parent.get(step)!;}return {path:path.reverse(),entry:{...entry},gateId};}
  for(const n of neighborsV16(current,state.boardSize))if(state.board[n]===null&&!parent.has(n)){parent.set(n,current);queue.push(n);}
 }
 return null;
}
export function findRouteV16(state:InboundRunV16,order:Order,cells:number[]):RouteV16|null {
 const dock=docksV16(state).find(d=>d.id===order.dockId);if(!dock)return null;
 return routeFrom(state,dock.entry,cells,dock.id);
}
export function selectOrderGroupV16(state:InboundRunV16,order:Order):ReachableGroupV16|null {
 const choices:ReachableGroupV16[]=[];
 for(const group of collectGroupsV16(state,order.cargo)){if(group.units<order.amount)continue;const route=findRouteV16(state,order,group.cells);if(route)choices.push({...route,group});}
 choices.sort((a,b)=>a.path.length-b.path.length||b.group.units-a.group.units||a.group.cells[0]-b.group.cells[0]);return choices[0]??null;
}
export function placementCellsV16(state:InboundRunV16,pieceId:string,origin:Point):{cells:number[];reason?:string}{
 const piece=state.candidates.find(p=>p.id===pieceId);if(!piece)return {cells:[],reason:'货件已不存在'};
 const offsets=pieceCellsV16(piece);if(!offsets.length||piece.trait&&piece.trait!=='rush'&&offsets.length!==1)return {cells:[],reason:'货件形状无效'};
 if(!origin||!Number.isInteger(origin.x)||!Number.isInteger(origin.y))return {cells:[],reason:'落点必须是完整格子'};
 const points=offsets.map(p=>({x:p.x+origin.x,y:p.y+origin.y})),cells=points.map(p=>toIndexV16(p,state.boardSize));
 if(points.some(p=>p.x<0||p.x>=state.boardSize||p.y<0||p.y>=state.boardSize))return {cells,reason:'超出仓库边界'};
 const reserved=reservedEntryCellsV16(state);
 if(cells.some(i=>reserved.includes(i)))return {cells,reason:'入口需留空'};
 if(cells.some(i=>state.board[i]!==null))return {cells,reason:'这里已有货物'};
 return {cells};
}
export function findLegalMovesV16(state:InboundRunV16):{pieceId:string;origin:Point}[]{
 const moves:{pieceId:string;origin:Point}[]=[];
 for(const piece of state.candidates)for(let y=0;y<state.boardSize;y++)for(let x=0;x<state.boardSize;x++)if(!placementCellsV16(state,piece.id,{x,y}).reason)moves.push({pieceId:piece.id,origin:{x,y}});
 return moves;
}
