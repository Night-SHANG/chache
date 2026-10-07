import type {Point} from '../types.ts';
import {SHAPES} from '../rulesets/v1/content.ts';
import {OUTBOUND_ENTRY} from '../v6/content.ts';
import {toIndexV6} from '../v6/board.ts';
import {isValidOutboundPieceV12} from './content.ts';
import type {OutboundToolPieceV12,OutboundToolRunV12} from './types.ts';

type GeometryState=Pick<OutboundToolRunV12,'board'|'candidates'>;
const reserved=toIndexV6(OUTBOUND_ENTRY.entry);
export function reservedEntryCellsV12():number[] {return [reserved];}
export function pieceCellsV12(piece:OutboundToolPieceV12):Point[] {
 const shape=SHAPES.find(shape=>shape.id===piece.shapeId);if(!shape||![0,1,2,3].includes(piece.quarterTurns))return [];
 let cells=shape.cells.map(point=>({...point}));
 for(let turn=0;turn<piece.quarterTurns;turn++)cells=cells.map(point=>({x:-point.y,y:point.x}));
 const minX=Math.min(...cells.map(point=>point.x)),minY=Math.min(...cells.map(point=>point.y));
 return cells.map(point=>({x:point.x-minX,y:point.y-minY}));
}
export function placementCellsV12(state:GeometryState,pieceId:string,origin:Point):{cells:number[];reason?:string} {
 const piece=state.candidates.find(piece=>piece.id===pieceId);
 if(!piece)return {cells:[],reason:'货件已不存在'};
 if(!isValidOutboundPieceV12(piece))return {cells:[],reason:'出库货件逐格内容无效'};
 if(!origin||!Number.isInteger(origin.x)||!Number.isInteger(origin.y))return {cells:[],reason:'落点必须是完整格子'};
 const points=pieceCellsV12(piece).map(point=>({x:point.x+origin.x,y:point.y+origin.y})),cells=points.map(toIndexV6);
 if(points.some(point=>point.x<0||point.x>=9||point.y<0||point.y>=9))return {cells,reason:'超出仓库边界'};
 if(cells.includes(reserved))return {cells,reason:'入口需留空'};
 if(cells.some(cell=>state.board[cell]!==null))return {cells,reason:'这里已有货物'};
 return {cells};
}
export function findGeometricMovesV12(state:GeometryState,firstOnly=false):{pieceId:string;origin:Point}[] {
 const moves:{pieceId:string;origin:Point}[]=[];
 for(const piece of state.candidates){
  if(!isValidOutboundPieceV12(piece))continue;
  const offsets=pieceCellsV12(piece);
  for(let y=0;y<9;y++)for(let x=0;x<9;x++){
   if(offsets.some(point=>point.x+x>=9||point.y+y>=9||toIndexV6({x:point.x+x,y:point.y+y})===reserved||state.board[(point.y+y)*9+point.x+x]!==null))continue;
   moves.push({pieceId:piece.id,origin:{x,y}});if(firstOnly)return moves;
  }
 }
 return moves;
}
