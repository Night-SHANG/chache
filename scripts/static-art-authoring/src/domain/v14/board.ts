import { SHAPES, DOCKS } from '../rulesets/v1/content.ts';
import type { Point, CargoId, Order } from '../types.ts';
import type { InboundRunV14, PieceV14, CargoGroupV14, RouteV14, ReachableGroupV14, DockV14 } from './types.ts';

export function toIndexV14(point:Point,size:7):number{return point.y*size+point.x;}
export function toPointV14(index:number,size:7):Point{return {x:index%size,y:Math.floor(index/size)};}
export function neighborsV14(index:number,size:7):number[]{
 const {x,y}=toPointV14(index,size);return [{x,y:y-1},{x:x-1,y},{x:x+1,y},{x,y:y+1}].filter(p=>p.x>=0&&p.x<size&&p.y>=0&&p.y<size).map(p=>toIndexV14(p,size));
}
export function docksV14(state:Pick<InboundRunV14,'boardSize'>):DockV14[]{return DOCKS.map(d=>({...d,entry:{x:d.side==='east'?state.boardSize-1:d.entry.x,y:d.side==='south'?state.boardSize-1:d.entry.y}}));}
/** All fixed dock entries stay empty, including the doors not yet active for orders. */
export function reservedEntryCellsV14(state:Pick<InboundRunV14,'boardSize'>):number[]{return docksV14(state).map(dock=>toIndexV14(dock.entry,state.boardSize));}
export function pieceCellsV14(piece:PieceV14):Point[]{
 const shape=SHAPES.find(s=>s.id===piece.shapeId);if(!shape||![0,1,2,3].includes(piece.quarterTurns))return [];
 let cells=shape.cells.map(p=>({...p}));
 for(let turn=0;turn<piece.quarterTurns;turn++)cells=cells.map(p=>({x:-p.y,y:p.x}));
 const minX=Math.min(...cells.map(p=>p.x)),minY=Math.min(...cells.map(p=>p.y));
 return cells.map(p=>({x:p.x-minX,y:p.y-minY})).sort((a,b)=>a.y-b.y||a.x-b.x);
}
export function cellUnitsV14(state:InboundRunV14,index:number):number{return state.board[index]===null||state.cellTraits[index]?.kind==='waste'?0:state.cellTraits[index]?.kind==='pallet'?2:1;}
export function collectGroupsV14(state:InboundRunV14,cargo:CargoId):CargoGroupV14[]{
 const eligible=(i:number)=>cellUnitsV14(state,i)>0&&(state.board[i]===cargo||state.cellTraits[i]?.kind==='wildcard');
 const groups:CargoGroupV14[]=[],visited=new Set<number>();
 for(let i=0;i<state.board.length;i++){
  if(!eligible(i)||visited.has(i))continue;
  const cells=[i];visited.add(i);
  for(let cursor=0;cursor<cells.length;cursor++)for(const n of neighborsV14(cells[cursor],state.boardSize))if(eligible(n)&&!visited.has(n)){cells.push(n);visited.add(n);}
  cells.sort((a,b)=>a-b);groups.push({cargo,cells,units:cells.reduce((sum,i)=>sum+cellUnitsV14(state,i),0)});
 }
 return groups;
}
function routeFrom(state:InboundRunV14,entry:Point,cells:number[],gateId:string):RouteV14|null {
 const start=toIndexV14(entry,state.boardSize);if(state.board[start]!==null)return null;
 const targets=new Set(cells.flatMap(i=>neighborsV14(i,state.boardSize)).filter(i=>state.board[i]===null));
 const queue=[start],parent=new Map<number,number>([[start,-1]]);
 for(let cursor=0;cursor<queue.length;cursor++){
  const current=queue[cursor];
  if(targets.has(current)){const path:Point[]=[];let step=current;while(step!==-1){path.push(toPointV14(step,state.boardSize));step=parent.get(step)!;}return {path:path.reverse(),entry:{...entry},gateId};}
  for(const n of neighborsV14(current,state.boardSize))if(state.board[n]===null&&!parent.has(n)){parent.set(n,current);queue.push(n);}
 }
 return null;
}
export function findRouteV14(state:InboundRunV14,order:Order,cells:number[]):RouteV14|null {
 const dock=docksV14(state).find(d=>d.id===order.dockId);if(!dock)return null;
 return routeFrom(state,dock.entry,cells,dock.id);
}
export function selectOrderGroupV14(state:InboundRunV14,order:Order):ReachableGroupV14|null {
 const choices:ReachableGroupV14[]=[];
 for(const group of collectGroupsV14(state,order.cargo)){if(group.units<order.amount)continue;const route=findRouteV14(state,order,group.cells);if(route)choices.push({...route,group});}
 choices.sort((a,b)=>a.path.length-b.path.length||b.group.units-a.group.units||a.group.cells[0]-b.group.cells[0]);return choices[0]??null;
}
export function placementCellsV14(state:InboundRunV14,pieceId:string,origin:Point):{cells:number[];reason?:string}{
 const piece=state.candidates.find(p=>p.id===pieceId);if(!piece)return {cells:[],reason:'货件已不存在'};
 const offsets=pieceCellsV14(piece);if(!offsets.length||piece.trait&&piece.trait!=='rush'&&offsets.length!==1)return {cells:[],reason:'货件形状无效'};
 if(!origin||!Number.isInteger(origin.x)||!Number.isInteger(origin.y))return {cells:[],reason:'落点必须是完整格子'};
 const points=offsets.map(p=>({x:p.x+origin.x,y:p.y+origin.y})),cells=points.map(p=>toIndexV14(p,state.boardSize));
 if(points.some(p=>p.x<0||p.x>=state.boardSize||p.y<0||p.y>=state.boardSize))return {cells,reason:'超出仓库边界'};
 const reserved=reservedEntryCellsV14(state);
 if(cells.some(i=>reserved.includes(i)))return {cells,reason:'入口需留空'};
 if(cells.some(i=>state.board[i]!==null))return {cells,reason:'这里已有货物'};
 return {cells};
}
export function findLegalMovesV14(state:InboundRunV14):{pieceId:string;origin:Point}[]{
 const moves:{pieceId:string;origin:Point}[]=[];
 for(const piece of state.candidates)for(let y=0;y<state.boardSize;y++)for(let x=0;x<state.boardSize;x++)if(!placementCellsV14(state,piece.id,{x,y}).reason)moves.push({pieceId:piece.id,origin:{x,y}});
 return moves;
}
