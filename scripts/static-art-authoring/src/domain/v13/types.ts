import type {OutboundToolCommandV12,OutboundToolEventV12,OutboundToolRunFieldsV12} from '../v12/types.ts';
export type {ToolChargesV12 as ToolChargesV13,ToolIdV12 as ToolIdV13,OutboundToolPieceV12 as OutboundToolPieceV13,
 OutboundItemCommandV12 as OutboundItemCommandV13,OutboundPreviewV12 as OutboundPreviewV13,OutboundShipmentV12 as OutboundShipmentV13} from '../v12/types.ts';
export type OutboundToolCommandV13=OutboundToolCommandV12|{type:'finishOutboundEndless'};
export interface OutboundToolRunV13 extends OutboundToolRunFieldsV12<OutboundToolCommandV13> {rulesetVersion:13}
export type OutboundToolEventV13=OutboundToolEventV12;
export interface OutboundStepResultV13 {state:OutboundToolRunV13;events:OutboundToolEventV13[];error?:string}
