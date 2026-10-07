import type {Command, DomainEvent, OutboundDifficulty, Point, RunState, Shipment} from './types.ts';
import {applyCommand, createRun, findLegalMoves, previewPlacement} from './engine.ts';
import {checksum} from './replay.ts';
import {isOutboundDifficulty} from './v6/content.ts';
import type {InboundCommandV9, InboundEventV9, InboundRunV9, ShipmentV9, ToolChargesV9} from './v9/types.ts';
import {applyCommandV9, createRunV9, findLegalMovesV9, previewPlacementV9} from './v9/engine.ts';
import {checksumV9} from './v9/replay.ts';
import type {OutboundEndlessCommandV10, OutboundEndlessRunV10, OutboundEventV10, OutboundShipmentV10} from './v10/types.ts';
import {applyCommandV10, createRunV10, findLegalMovesV10, previewPlacementV10} from './v10/engine.ts';
import {checksumV10} from './v10/replay.ts';
import type {InboundCommandV11, InboundEventV11, InboundRunV11, ShipmentV11} from './v11/types.ts';
import {applyCommandV11, createRunV11, findLegalMovesV11, previewPlacementV11} from './v11/engine.ts';
import {checksumV11} from './v11/replay.ts';
import type {InboundRunV14, InboundCommandV14, InboundEventV14, ShipmentV14} from './v14/types.ts';
import {applyCommandV14,createRunV14,findLegalMovesV14,previewPlacementV14} from './v14/engine.ts';
import {reservedEntryCellsV14} from './v14/board.ts';
import {checksumV14} from './v14/replay.ts';
import type {InboundRunV16, InboundCommandV16, InboundEventV16, ShipmentV16} from './v16/types.ts';
import {applyCommandV16,createRunV16,findLegalMovesV16,previewPlacementV16} from './v16/engine.ts';
import {reservedEntryCellsV16} from './v16/board.ts';
import {checksumV16} from './v16/replay.ts';
import type {InboundRunV15, InboundCommandV15, InboundEventV15, ShipmentV15} from './v15/types.ts';
import {applyCommandV15,createRunV15,findLegalMovesV15,previewPlacementV15} from './v15/engine.ts';
import {reservedEntryCellsV15} from './v15/board.ts';
import {checksumV15} from './v15/replay.ts';
import type {OutboundToolRunV12,OutboundToolCommandV12,OutboundToolEventV12,ToolChargesV12} from './v12/types.ts';
import {applyCommandV12,createRunV12,findLegalMovesV12,previewPlacementV12} from './v12/engine.ts';
import {checksumV12} from './v12/replay.ts';
import type {OutboundToolRunV13,OutboundToolCommandV13,OutboundToolEventV13} from './v13/types.ts';
import {applyCommandV13,createRunV13,findLegalMovesV13,previewPlacementV13} from './v13/engine.ts';
import {checksumV13} from './v13/replay.ts';
import {OUTBOUND_ENTRY} from './v6/content.ts';
import {validToolChargesV12} from './v12/content.ts';

export type InboundRun = InboundRunV9 | InboundRunV11 | InboundRunV14 | InboundRunV15 | InboundRunV16;
export type OutboundToolsRun = OutboundToolRunV12 | OutboundToolRunV13;
export type ToolRun = InboundRun | OutboundToolsRun;
export type GameRun = RunState | InboundRun | OutboundEndlessRunV10 | OutboundToolsRun;
export type GameCommand = Command | InboundCommandV9 | InboundCommandV11 | InboundCommandV14 | InboundCommandV15 | InboundCommandV16 | OutboundEndlessCommandV10 | OutboundToolCommandV12 | OutboundToolCommandV13;
export type GameEvent = DomainEvent | InboundEventV9 | InboundEventV11 | InboundEventV14 | InboundEventV15 | InboundEventV16 | OutboundEventV10 | OutboundToolEventV12 | OutboundToolEventV13;
export type GameShipment = Shipment | ShipmentV9 | ShipmentV11 | ShipmentV14 | ShipmentV15 | ShipmentV16 | OutboundShipmentV10 | Extract<OutboundToolEventV12 | OutboundToolEventV13,{type:'shipment'}>;
export interface GameStepResult {state:GameRun;events:GameEvent[];error?:string}
export interface PlayablePreview {
 valid:boolean;cells:number[];shipments:GameShipment[];events:GameEvent[];stateAfter?:GameRun;reason?:string;
}
export type InboundRunSpec = {family:'inbound';mode:'standard'|'daily'|'endless';rulesetVersion:9|11|14|15|16;seed:number;guided:boolean;toolCharges:ToolChargesV9};
export type OutboundRunSpec =
 | {family:'outbound';variant:'normal'|'endless';rulesetVersion:8|10;seed:number;difficultyId:OutboundDifficulty}
 | {family:'outbound';variant:'normal'|'endless';rulesetVersion:12|13;seed:number;difficultyId:OutboundDifficulty;toolCharges:ToolChargesV12};
export type RunSpec = InboundRunSpec | OutboundRunSpec;

export const isInboundV9=(state:GameRun):state is InboundRunV9=>state.rulesetVersion===9;
export const isInboundV11=(state:GameRun):state is InboundRunV11=>state.rulesetVersion===11;
export const isInboundV14=(state:GameRun):state is InboundRunV14=>state.rulesetVersion===14;
export const isInboundV16=(state:GameRun):state is InboundRunV16=>state.rulesetVersion===16;
export const isInboundV15=(state:GameRun):state is InboundRunV15=>state.rulesetVersion===15;
export const isInboundRun=(state:GameRun):state is InboundRun=>isInboundV9(state)||isInboundV11(state)||isInboundV14(state)||isInboundV15(state)||isInboundV16(state);
export const isOutboundEndlessV10=(state:GameRun):state is OutboundEndlessRunV10=>state.rulesetVersion===10;
export const isOutboundToolsRun=(state:GameRun):state is OutboundToolsRun=>state.rulesetVersion===12||state.rulesetVersion===13;
export const isOutboundV12=(state:GameRun):state is OutboundToolRunV12=>state.rulesetVersion===12;
export const isOutboundV13=(state:GameRun):state is OutboundToolRunV13=>state.rulesetVersion===13;
export const isToolRun=(state:GameRun):state is ToolRun=>isInboundRun(state)||isOutboundToolsRun(state);
export function reservedEntryCells(state:GameRun):number[] {
 if(isInboundV16(state))return reservedEntryCellsV16(state);
 if(isInboundV15(state))return reservedEntryCellsV15(state);
 if(isInboundV14(state))return reservedEntryCellsV14(state);
 if(isOutboundToolsRun(state))return [OUTBOUND_ENTRY.entry.y*state.boardSize+OUTBOUND_ENTRY.entry.x];
 return [];
}

/** New identities meet at this bridge; frozen 1–8 dispatch remains untouched. */
export function createPlayableRun(spec:RunSpec):GameRun {
 if(!spec||!Number.isSafeInteger(spec.seed)||spec.seed < -2147483648||spec.seed>4294967295)throw Error('种子无效');
 if(spec.family==='inbound'){
  if(![9,11,14,15,16].includes(spec.rulesetVersion)||!['standard','daily','endless'].includes(spec.mode)||typeof spec.guided!=='boolean')throw Error('入库规则身份不匹配');
  if(spec.rulesetVersion===16)return createRunV16({seed:spec.seed,mode:spec.mode,guided:spec.guided,toolCharges:spec.toolCharges});
  if(spec.rulesetVersion===15)return createRunV15({seed:spec.seed,mode:spec.mode,guided:spec.guided,toolCharges:spec.toolCharges});
  if(spec.rulesetVersion===14)return createRunV14({seed:spec.seed,mode:spec.mode,guided:spec.guided,toolCharges:spec.toolCharges});
  if(spec.rulesetVersion===11)return createRunV11({seed:spec.seed,mode:spec.mode,guided:spec.guided,toolCharges:spec.toolCharges});
  return createRunV9({seed:spec.seed,mode:spec.mode,guided:spec.guided,toolCharges:spec.toolCharges});
 }
 if(spec.family!=='outbound'||!isOutboundDifficulty(spec.difficultyId))throw Error('出库规则身份不匹配');
 if(spec.rulesetVersion===12||spec.rulesetVersion===13){
  if(!Object.prototype.hasOwnProperty.call(spec,'toolCharges')||!validToolChargesV12(spec.toolCharges))throw Error('出库工具预算缺失或无效');
  if(spec.variant==='normal'&&spec.rulesetVersion===12)return createRunV12(spec.seed,spec.difficultyId,spec.toolCharges);
  if(spec.variant==='endless'&&spec.rulesetVersion===13)return createRunV13(spec.seed,spec.difficultyId,spec.toolCharges);
  throw Error('出库规则身份不匹配');
 }
 if(Object.prototype.hasOwnProperty.call(spec,'toolCharges'))throw Error('旧出库不接受工具预算');
 if(spec.variant==='normal'&&spec.rulesetVersion===8)return createRun(spec.seed,'color_exit',8,spec.difficultyId);
 if(spec.variant==='endless'&&spec.rulesetVersion===10)return createRunV10(spec.seed,spec.difficultyId);
 throw Error('出库规则身份不匹配');
}

const LEGACY_COMMANDS=new Set(['place','upgrade','continueOvertime','finishOvertime','finishEndless']);
const INBOUND_COMMANDS=new Set(['place','chooseCleanup','upgrade','rotate','clear','wildcard','continueOvertime','finish']);
const INBOUND_V11_COMMANDS=new Set(['place','chooseCleanup','rotate','clear','wildcard','continueOvertime','finish']);
export function applyPlayableCommand(state:GameRun,command:GameCommand):GameStepResult {
 const rejected=():GameStepResult=>({state,events:[],error:'此玩法不支持该操作'});
 if(!command||typeof command!=='object')return rejected();
 if(isInboundV9(state))return INBOUND_COMMANDS.has(command.type)?applyCommandV9(state,command as InboundCommandV9):rejected();
 if(isInboundV11(state))return INBOUND_V11_COMMANDS.has(command.type)?applyCommandV11(state,command as InboundCommandV11):rejected();
 if(isInboundV16(state))return INBOUND_V11_COMMANDS.has(command.type)?applyCommandV16(state,command as InboundCommandV16):rejected();
 if(isInboundV15(state))return INBOUND_V11_COMMANDS.has(command.type)?applyCommandV15(state,command as InboundCommandV15):rejected();
 if(isInboundV14(state))return INBOUND_V11_COMMANDS.has(command.type)?applyCommandV14(state,command as InboundCommandV14):rejected();
 if(isOutboundV12(state))return applyCommandV12(state,command as OutboundToolCommandV12);
 if(isOutboundV13(state))return applyCommandV13(state,command as OutboundToolCommandV13);
 if(isOutboundEndlessV10(state))return command.type==='place'||command.type==='finishOutboundEndless'?applyCommandV10(state,command):rejected();
 if(!LEGACY_COMMANDS.has(command.type))return rejected();
 return applyCommand(state,command as Command);
}

export function previewPlayablePlacement(state:GameRun,pieceId:string,origin:Point):PlayablePreview {
 if(isInboundV16(state))return previewPlacementV16(state,pieceId,origin);
 if(isInboundV15(state))return previewPlacementV15(state,pieceId,origin);
 if(isInboundV14(state))return previewPlacementV14(state,pieceId,origin);
 if(isInboundV11(state))return previewPlacementV11(state,pieceId,origin);
 if(isInboundV9(state)){
  const preview=previewPlacementV9(state,pieceId,origin);
  return {...preview,shipments:preview.events.filter((event):event is ShipmentV9=>event.type==='shipment')};
 }
 const preview=isOutboundV12(state)?previewPlacementV12(state,pieceId,origin):isOutboundV13(state)?previewPlacementV13(state,pieceId,origin):isOutboundEndlessV10(state)?previewPlacementV10(state,pieceId,origin):previewPlacement(state,pieceId,origin);
 if(!preview.valid)return {...preview,events:[]};
 const settled=applyPlayableCommand(state,{type:'place',pieceId,origin});
 return {...preview,events:settled.events,stateAfter:settled.state};
}

export function playableChecksum(state:GameRun):string {
 if(isInboundV16(state))return checksumV16(state);
 if(isInboundV15(state))return checksumV15(state);
 if(isInboundV14(state))return checksumV14(state);
 if(isOutboundV12(state))return checksumV12(state);
 if(isOutboundV13(state))return checksumV13(state);
 if(isInboundV11(state))return checksumV11(state);
 if(isInboundV9(state))return checksumV9(state);
 if(isOutboundEndlessV10(state))return checksumV10(state);
 return checksum(state);
}
export function findPlayableMoves(state:GameRun):{pieceId:string;origin:Point}[] {
 if(isInboundV16(state))return findLegalMovesV16(state);
 if(isInboundV15(state))return findLegalMovesV15(state);
 if(isInboundV14(state))return findLegalMovesV14(state);
 if(isOutboundV12(state))return findLegalMovesV12(state);
 if(isOutboundV13(state))return findLegalMovesV13(state);
 if(isInboundV11(state))return findLegalMovesV11(state);
 if(isInboundV9(state))return findLegalMovesV9(state);
 if(isOutboundEndlessV10(state))return findLegalMovesV10(state);
 return findLegalMoves(state);
}
