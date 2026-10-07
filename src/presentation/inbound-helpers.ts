import {isInboundV11,isInboundV14} from '../domain/playable.ts';
import type {InboundRun} from '../domain/playable.ts';
import type {Order,CargoId,Piece,Point} from '../domain/types.ts';
import {SHAPES} from '../domain/content.ts';
import {collectGroupsV9,selectOrderGroupV9,docksV9,pieceCellsV9} from '../domain/v9/board.ts';
import {collectGroupsV11,selectOrderGroupV11,docksV11,pieceCellsV11} from '../domain/v11/board.ts';
import {collectGroupsV14,selectOrderGroupV14,docksV14,pieceCellsV14} from '../domain/v14/board.ts';
import {pieceCellsV12} from '../domain/v12/board.ts';
import type {PieceV9} from '../domain/v9/types.ts';
import type {PieceV11} from '../domain/v11/types.ts';
import type {PieceV14} from '../domain/v14/types.ts';
import type {OutboundToolPieceV12} from '../domain/v12/types.ts';
export type InboundPiece=PieceV9|PieceV11|PieceV14;
/** The version identifies the family; both families now have quarterTurns. */
export const isInboundPiece=(piece:Piece|InboundPiece,rulesetVersion:number):piece is InboundPiece=>[9,11,14].includes(rulesetVersion)&&'quarterTurns' in piece&&typeof piece.quarterTurns==='number';
export const inboundGroups=(state:InboundRun,cargo:CargoId)=>isInboundV14(state)?collectGroupsV14(state,cargo):isInboundV11(state)?collectGroupsV11(state,cargo):collectGroupsV9(state,cargo);
export const inboundOrderGroup=(state:InboundRun,order:Order)=>isInboundV14(state)?selectOrderGroupV14(state,order):isInboundV11(state)?selectOrderGroupV11(state,order):selectOrderGroupV9(state,order);
export const inboundDocks=(state:InboundRun)=>isInboundV14(state)?docksV14(state):isInboundV11(state)?docksV11(state):docksV9(state);
export const inboundPieceCells=(piece:InboundPiece,rulesetVersion:number)=>rulesetVersion===14?pieceCellsV14(piece):rulesetVersion===11?pieceCellsV11(piece):pieceCellsV9(piece);
/** Outbound offsets keep the original index-to-cargo mapping through every rotation. */
export function presentationPieceCells(piece:Piece|InboundPiece|OutboundToolPieceV12,rulesetVersion:number):Point[]{
 if((rulesetVersion===12||rulesetVersion===13)&&'quarterTurns' in piece)return pieceCellsV12(piece);
 if(isInboundPiece(piece,rulesetVersion))return inboundPieceCells(piece,rulesetVersion);
 return SHAPES.find(shape=>shape.id===piece.shapeId)?.cells??[];
}
