import {collectGroupsV16,selectOrderGroupV16,docksV16,pieceCellsV16} from '../domain/v16/board.ts';
import type {PieceV16} from '../domain/v16/types.ts';
import {isInboundV11,isInboundV14,isInboundV15,isInboundV16} from '../domain/playable.ts';
import type {InboundRun} from '../domain/playable.ts';
import type {Order,CargoId,Piece,Point} from '../domain/types.ts';
import {SHAPES} from '../domain/content.ts';
import {collectGroupsV9,selectOrderGroupV9,docksV9,pieceCellsV9} from '../domain/v9/board.ts';
import {collectGroupsV11,selectOrderGroupV11,docksV11,pieceCellsV11} from '../domain/v11/board.ts';
import {collectGroupsV14,selectOrderGroupV14,docksV14,pieceCellsV14} from '../domain/v14/board.ts';
import {collectGroupsV15,selectOrderGroupV15,docksV15,pieceCellsV15} from '../domain/v15/board.ts';
import {pieceCellsV12} from '../domain/v12/board.ts';
import type {PieceV9} from '../domain/v9/types.ts';
import type {PieceV11} from '../domain/v11/types.ts';
import type {PieceV14} from '../domain/v14/types.ts';
import type {PieceV15} from '../domain/v15/types.ts';
import type {OutboundToolPieceV12} from '../domain/v12/types.ts';
export type InboundPiece=PieceV9|PieceV11|PieceV14|PieceV15|PieceV16;
/** The version identifies the family; both families now have quarterTurns. */
export const isInboundPiece=(piece:Piece|InboundPiece,rulesetVersion:number):piece is InboundPiece=>[9,11,14,15,16].includes(rulesetVersion)&&'quarterTurns' in piece&&typeof piece.quarterTurns==='number';
export const inboundGroups=(state:InboundRun,cargo:CargoId)=>isInboundV16(state)?collectGroupsV16(state,cargo):isInboundV15(state)?collectGroupsV15(state,cargo):isInboundV14(state)?collectGroupsV14(state,cargo):isInboundV11(state)?collectGroupsV11(state,cargo):collectGroupsV9(state,cargo);
export const inboundOrderGroup=(state:InboundRun,order:Order)=>isInboundV16(state)?selectOrderGroupV16(state,order):isInboundV15(state)?selectOrderGroupV15(state,order):isInboundV14(state)?selectOrderGroupV14(state,order):isInboundV11(state)?selectOrderGroupV11(state,order):selectOrderGroupV9(state,order);
export const inboundDocks=(state:InboundRun)=>isInboundV16(state)?docksV16(state):isInboundV15(state)?docksV15(state):isInboundV14(state)?docksV14(state):isInboundV11(state)?docksV11(state):docksV9(state);
export const inboundPieceCells=(piece:InboundPiece,rulesetVersion:number)=>rulesetVersion===16?pieceCellsV16(piece):rulesetVersion===15?pieceCellsV15(piece):rulesetVersion===14?pieceCellsV14(piece):rulesetVersion===11?pieceCellsV11(piece):pieceCellsV9(piece);
/** Outbound offsets keep the original index-to-cargo mapping through every rotation. */
export function presentationPieceCells(piece:Piece|InboundPiece|OutboundToolPieceV12,rulesetVersion:number):Point[]{
 if((rulesetVersion===12||rulesetVersion===13)&&'quarterTurns' in piece)return pieceCellsV12(piece);
 if(isInboundPiece(piece,rulesetVersion))return inboundPieceCells(piece,rulesetVersion);
 return SHAPES.find(shape=>shape.id===piece.shapeId)?.cells??[];
}
