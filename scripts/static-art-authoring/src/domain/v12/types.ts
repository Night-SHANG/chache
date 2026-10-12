import type {CargoId,Piece,Point} from '../types.ts';
import type {OutboundEndlessRunV10,OutboundShipmentV10} from '../v10/types.ts';

export type ToolIdV12='rotate'|'clear'|'wildcard';
export interface ToolChargesV12 {rotate:0|1;clear:0|1;wildcard:0|1}
/** Offsets retain the original shape index, so cellCargos never move independently. */
export interface OutboundToolPieceV12 extends Piece {quarterTurns:0|1|2|3}
export type OutboundItemCommandV12=
 | {type:'rotate';pieceId:string;quarterTurns:1|2|3}
 | {type:'clear';cells:number[]}
 | {type:'wildcard';pieceId:string;cargo:CargoId};
export type OutboundToolCommandV12={type:'place';pieceId:string;origin:Point}|OutboundItemCommandV12;
export interface OutboundToolRunFieldsV12<C> extends Omit<OutboundEndlessRunV10,'rulesetVersion'|'candidates'|'phase'|'commands'|'endReason'> {
 /** Cumulative unscaled shipment points; preserves fractional difficulty credit across commands. */
 rawScore:number;
 candidates:OutboundToolPieceV12[];
 phase:'input'|'rescue'|'result';
 commands:C[];
 endReason:'blocked'|'completed'|'retired'|null;
 toolCharges:ToolChargesV12;
 usedToolIds:ToolIdV12[];
}
export interface OutboundToolRunV12 extends OutboundToolRunFieldsV12<OutboundToolCommandV12> {rulesetVersion:12}
export type OutboundShipmentV12=OutboundShipmentV10;
export type OutboundToolEventV12=
 | OutboundShipmentV12
 | {type:'placed';pieceId:string;cells:number[]}
 | {type:'shift';shift:number}
 | {type:'toolUsed';toolId:ToolIdV12;cells?:number[];pieceId?:string}
 | {type:'rescue';plan:OutboundItemCommandV12[]}
 | {type:'result';result:'failed'|'won';endReason:'blocked'|'completed'|'retired'};
export interface OutboundStepResultV12 {state:OutboundToolRunV12;events:OutboundToolEventV12[];error?:string}
export interface OutboundPreviewV12 {valid:boolean;cells:number[];shipments:OutboundShipmentV12[];reason?:string}
