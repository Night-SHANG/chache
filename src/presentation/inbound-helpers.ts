import {isInboundV11} from '../domain/playable.ts';
import type {InboundRun} from '../domain/playable.ts';
import type {Order,CargoId,Piece} from '../domain/types.ts';
import {collectGroupsV9,selectOrderGroupV9,docksV9,pieceCellsV9} from '../domain/v9/board.ts';
import {collectGroupsV11,selectOrderGroupV11,docksV11,pieceCellsV11} from '../domain/v11/board.ts';
import type {PieceV9} from '../domain/v9/types.ts';
import type {PieceV11} from '../domain/v11/types.ts';
export type InboundPiece=PieceV9|PieceV11;
export const isInboundPiece=(piece:Piece|InboundPiece):piece is InboundPiece=>'quarterTurns' in piece&&typeof piece.quarterTurns==='number';
/** Presentation dispatches through each version's real helpers; it never rebrands a run. */
export const inboundGroups=(state:InboundRun,cargo:CargoId)=>isInboundV11(state)?collectGroupsV11(state,cargo):collectGroupsV9(state,cargo);
export const inboundOrderGroup=(state:InboundRun,order:Order)=>isInboundV11(state)?selectOrderGroupV11(state,order):selectOrderGroupV9(state,order);
export const inboundDocks=(state:InboundRun)=>isInboundV11(state)?docksV11(state):docksV9(state);
export const inboundPieceCells=(piece:InboundPiece,rulesetVersion:number)=>rulesetVersion===11?pieceCellsV11(piece):pieceCellsV9(piece);
