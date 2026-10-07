import { SHAPES, DOCKS } from '../rulesets/v1/content.ts';
import type { Point, CargoId, Order } from '../types.ts';
import type { InboundRunV11, PieceV11, CargoGroupV11, RouteV11, ReachableGroupV11, DockV11 } from './types.ts';

export function toIndexV11(point:Point,size:7):number{return point.y*size+point.x;}
export function toPointV11(index:number,size:7):Point{return {x:index%size,y:Math.floor(index/size)};}
export function neighborsV11(index:number,size:7):number[]{
 const {x,y}=toPointV11(index,size);return [{x,y:y-1},{x:x-1,y},{x:x+1,y},{x,y:y+1}].filter(p=>p.x>=0&&p.x<size&&p.y>=0&&p.y<size).map(p=>toIndexV11(p,size));
}
export function docksV11(state:Pick<InboundRunV11,'boardSize'>):DockV11[]{return DOCKS.map(d=>({...d,entry:{x:d.side==='east'?state.boardSize-1:d.entry.x,y:d.side==='south'?state.boardSize-1:d.entry.y}}));}
export function pieceCellsV11(piece:PieceV11):Point[]{
 const shape=SHAPES.find(s=>s.id===piece.shapeId);if(!shape||![0,1,2,3].includes(piece.quarterTurns))return [];
 let cells=shape.cells.map(p=>({...p}));
 for(let turn=0;turn<piece.quarterTurns;turn++)cells=cells.map(p=>({x:-p.y,y:p.x}));
 const minX=Math.min(...cells.map(p=>p.x)),minY=Math.min(...cells.map(p=>p.y));
 return cells.map(p=>({x:p.x-minX,y:p.y-minY})).sort((a,b)=>a.y-b.y||a.x-b.x);
}
export function cellUnitsV11(state:InboundRunV11,index:number):number{return state.board[index]===null||state.cellTraits[index]?.kind==='waste'?0:state.cellTraits[index]?.kind==='pallet'?2:1;}
export function collectGroupsV11(state:InboundRunV11,cargo:CargoId):CargoGroupV11[]{
 const eligible=(i:number)=>cellUnitsV11(state,i)>0&&(state.board[i]===cargo||state.cellTraits[i]?.kind==='wildcard');
 const groups:CargoGroupV11[]=[],visited=new Set<number>();
 for(let i=0;i<state.board.length;i++){
  if(!eligible(i)||visited.has(i))continue;
  const cells=[i];visited.add(i);
  for(let cursor=0;cursor<cells.length;cursor++)for(const n of neighborsV11(cells[cursor],state.boardSize))if(eligible(n)&&!visited.has(n)){cells.push(n);visited.add(n);}
  cells.sort((a,b)=>a-b);groups.push({cargo,cells,units:cells.reduce((sum,i)=>sum+cellUnitsV11(state,i),0)});
 }
 return groups;
}
function routeFrom(state:InboundRunV11,entry:Point,cells:number[],gateId:string):RouteV11|null {
 const start=toIndexV11(entry,state.boardSize);if(state.board[start]!==null)return null;
 const targets=new Set(cells.flatMap(i=>neighborsV11(i,state.boardSize)).filter(i=>state.board[i]===null));
 const queue=[start],parent=new Map<number,number>([[start,-1]]);
 for(let cursor=0;cursor<queue.length;cursor++){
  const current=queue[cursor];
  if(targets.has(current)){const path:Point[]=[];let step=current;while(step!==-1){path.push(toPointV11(step,state.boardSize));step=parent.get(step)!;}return {path:path.reverse(),entry:{...entry},gateId};}
  for(const n of neighborsV11(current,state.boardSize))if(state.board[n]===null&&!parent.has(n)){parent.set(n,current);queue.push(n);}
 }
 return null;
}
export function findRouteV11(state:InboundRunV11,order:Order,cells:number[]):RouteV11|null {
 const dock=docksV11(state).find(d=>d.id===order.dockId);if(!dock)return null;
 return routeFrom(state,dock.entry,cells,dock.id);
}
export function selectOrderGroupV11(state:InboundRunV11,order:Order):ReachableGroupV11|null {
 const choices:ReachableGroupV11[]=[];
 for(const group of collectGroupsV11(state,order.cargo)){if(group.units<order.amount)continue;const route=findRouteV11(state,order,group.cells);if(route)choices.push({...route,group});}
 choices.sort((a,b)=>a.path.length-b.path.length||b.group.units-a.group.units||a.group.cells[0]-b.group.cells[0]);return choices[0]??null;
}
export function placementCellsV11(state:InboundRunV11,pieceId:string,origin:Point):{cells:number[];reason?:string}{
 const piece=state.candidates.find(p=>p.id===pieceId);if(!piece)return {cells:[],reason:'货件已不存在'};
 const offsets=pieceCellsV11(piece);if(!offsets.length||piece.trait&&offsets.length!==1)return {cells:[],reason:'货件形状无效'};
 if(!origin||!Number.isInteger(origin.x)||!Number.isInteger(origin.y))return {cells:[],reason:'落点必须是完整格子'};
 const points=offsets.map(p=>({x:p.x+origin.x,y:p.y+origin.y})),cells=points.map(p=>toIndexV11(p,state.boardSize));
 if(points.some(p=>p.x<0||p.x>=state.boardSize||p.y<0||p.y>=state.boardSize))return {cells,reason:'超出仓库边界'};
 if(cells.some(i=>state.board[i]!==null))return {cells,reason:'这里已有货物'};
 return {cells};
}
export function findLegalMovesV11(state:InboundRunV11):{pieceId:string;origin:Point}[]{
 const moves:{pieceId:string;origin:Point}[]=[];
 for(const piece of state.candidates)for(let y=0;y<state.boardSize;y++)for(let x=0;x<state.boardSize;x++)if(!placementCellsV11(state,piece.id,{x,y}).reason)moves.push({pieceId:piece.id,origin:{x,y}});
 return moves;
}
