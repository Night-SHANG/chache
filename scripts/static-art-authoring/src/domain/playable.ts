import type {RushRunV21} from './v21/types.ts';
import {createRunV21,applyCommandV21,previewPlacementV21,findLegalMovesV21} from './v21/engine.ts';
import {checksumV21} from './v21/replay.ts';
import type {RushRunV20} from './v20/types.ts';
import {createRunV20,applyCommandV20,previewPlacementV20,findLegalMovesV20} from './v20/engine.ts';
import {checksumV20} from './v20/replay.ts';
import type {RushRunV19} from './v19/types.ts';
import {createRunV19,applyCommandV19,previewPlacementV19,findLegalMovesV19} from './v19/engine.ts';
import {checksumV19} from './v19/replay.ts';
import type {InboundRunV18} from './v18/types.ts';
import {createRunV18,applyCommandV18,previewPlacementV18,findLegalMovesV18} from './v18/engine.ts';
import {checksumV18} from './v18/replay.ts';
import {isInboundDifficultyV18} from './v18/content.ts';
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

export type InboundRun = InboundRunV9 | InboundRunV11 | InboundRunV14 | InboundRunV15 | InboundRunV16 | InboundRunV18 | RushRunV19 | RushRunV20 | RushRunV21;
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
export type InboundRunSpec = {family:'inbound';mode:'rush';rulesetVersion:21;seed:number;guided:false;toolCharges:ToolChargesV9;inboundDifficulty?:'normal'} | {family:'inbound';mode:'rush';rulesetVersion:20;seed:number;guided:false;toolCharges:ToolChargesV9;inboundDifficulty?:'normal'} | {family:'inbound';mode:'rush';rulesetVersion:19;seed:number;guided:false;toolCharges:ToolChargesV9;inboundDifficulty?:import('./v18/types.ts').InboundDifficultyV18} | {family:'inbound';mode:'standard'|'daily'|'endless';rulesetVersion:9|11|14|15|16|18;seed:number;guided:boolean;toolCharges:ToolChargesV9;inboundDifficulty?:import('./v16/types.ts').InboundDifficultyV16};
export type OutboundRunSpec =
 | {family:'outbound';variant:'normal'|'endless';rulesetVersion:8|10;seed:number;difficultyId:OutboundDifficulty}
 | {family:'outbound';variant:'normal'|'endless';rulesetVersion:12|13;seed:number;difficultyId:OutboundDifficulty;toolCharges:ToolChargesV12};
export type RunSpec = InboundRunSpec | OutboundRunSpec;

export const isInboundV9=(state:GameRun):state is InboundRunV9=>state.rulesetVersion===9;
export const isInboundV11=(state:GameRun):state is InboundRunV11=>state.rulesetVersion===11;
export const isInboundV14=(state:GameRun):state is InboundRunV14=>state.rulesetVersion===14;
export const isBaseRushV21=(state:GameRun):state is RushRunV21=>state.rulesetVersion===21;
export const isFixedRushV20=(state:GameRun):state is RushRunV20=>state.rulesetVersion===20;
export const isRushV19=(state:GameRun):state is RushRunV19=>state.rulesetVersion===19;
export const isInboundV18=(state:GameRun):state is InboundRunV18=>state.rulesetVersion===18;
export const isTieredInbound=(state:GameRun):state is InboundRunV16|InboundRunV18|RushRunV19|RushRunV20|RushRunV21=>state.rulesetVersion===16||state.rulesetVersion===18||state.rulesetVersion===19||state.rulesetVersion===20||state.rulesetVersion===21;
export const isInboundV16=(state:GameRun):state is InboundRunV16=>state.rulesetVersion===16;
export const isInboundV15=(state:GameRun):state is InboundRunV15=>state.rulesetVersion===15;
export const isInboundRun=(state:GameRun):state is InboundRun=>isInboundV9(state)||isInboundV11(state)||isInboundV14(state)||isInboundV15(state)||isInboundV16(state)||isInboundV18(state)||isRushV19(state)||isFixedRushV20(state)||isBaseRushV21(state);
export const isOutboundEndlessV10=(state:GameRun):state is OutboundEndlessRunV10=>state.rulesetVersion===10;
export const isOutboundToolsRun=(state:GameRun):state is OutboundToolsRun=>state.rulesetVersion===12||state.rulesetVersion===13;
export const isOutboundV12=(state:GameRun):state is OutboundToolRunV12=>state.rulesetVersion===12;
export const isOutboundV13=(state:GameRun):state is OutboundToolRunV13=>state.rulesetVersion===13;
export const isToolRun=(state:GameRun):state is ToolRun=>isInboundRun(state)||isOutboundToolsRun(state);
export function reservedEntryCells(state:GameRun):number[] {
 if(isTieredInbound(state))return reservedEntryCellsV16(state);
 if(isInboundV15(state))return reservedEntryCellsV15(state);
 if(isInboundV14(state))return reservedEntryCellsV14(state);
 if(isOutboundToolsRun(state))return [OUTBOUND_ENTRY.entry.y*state.boardSize+OUTBOUND_ENTRY.entry.x];
 return [];
}

/** New identities meet at this bridge; frozen 1–8 dispatch remains untouched. */
export function createPlayableRun(spec:RunSpec):GameRun {
 if(!spec||!Number.isSafeInteger(spec.seed)||spec.seed < -2147483648||spec.seed>4294967295)throw Error('种子无效');
 if(spec.family==='inbound'){
  if(spec.rulesetVersion===21){if(spec.mode!=='rush'||spec.guided!==false)throw Error('基础奖励加急规则21身份不匹配');return createRunV21({seed:spec.seed,mode:'rush',inboundDifficulty:spec.inboundDifficulty,guided:false,toolCharges:spec.toolCharges});}
  if(spec.rulesetVersion===20){if(spec.mode!=='rush'||spec.guided!==false)throw Error('固定加急规则20身份不匹配');return createRunV20({seed:spec.seed,mode:'rush',inboundDifficulty:spec.inboundDifficulty,guided:false,toolCharges:spec.toolCharges});}
  if(spec.rulesetVersion===19){if(spec.mode!=='rush'||spec.guided!==false)throw Error('加急规则19身份不匹配');return createRunV19({seed:spec.seed,mode:'rush',inboundDifficulty:spec.inboundDifficulty,guided:false,toolCharges:spec.toolCharges});}
  if(![9,11,14,15,16,18].includes(spec.rulesetVersion)||!['standard','daily','endless'].includes(spec.mode)||typeof spec.guided!=='boolean')throw Error('入库规则身份不匹配');
  if(spec.rulesetVersion===18){const inboundDifficulty=spec.inboundDifficulty===undefined?'hard':spec.inboundDifficulty;if(!isInboundDifficultyV18(inboundDifficulty)||spec.guided)throw Error('入库规则18身份不匹配');return createRunV18({seed:spec.seed,mode:spec.mode,inboundDifficulty,guided:false,toolCharges:spec.toolCharges});}
  if(spec.rulesetVersion===16)return createRunV16({inboundDifficulty:spec.inboundDifficulty,seed:spec.seed,mode:spec.mode,guided:spec.guided,toolCharges:spec.toolCharges});
  if(spec.inboundDifficulty!==undefined)throw Error('旧入库不接受难度');
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
 if(isBaseRushV21(state))return INBOUND_V11_COMMANDS.has(command.type)?applyCommandV21(state,command as InboundCommandV16):rejected();
 if(isFixedRushV20(state))return INBOUND_V11_COMMANDS.has(command.type)?applyCommandV20(state,command as InboundCommandV16):rejected();
 if(isRushV19(state))return INBOUND_V11_COMMANDS.has(command.type)?applyCommandV19(state,command as InboundCommandV16):rejected();
 if(isInboundV18(state))return INBOUND_V11_COMMANDS.has(command.type)?applyCommandV18(state,command as InboundCommandV16):rejected();
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
 if(isBaseRushV21(state))return previewPlacementV21(state,pieceId,origin);
 if(isFixedRushV20(state))return previewPlacementV20(state,pieceId,origin);
 if(isRushV19(state))return previewPlacementV19(state,pieceId,origin);
 if(isInboundV18(state))return previewPlacementV18(state,pieceId,origin);
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
 if(isBaseRushV21(state))return checksumV21(state);
 if(isFixedRushV20(state))return checksumV20(state);
 if(isRushV19(state))return checksumV19(state);
 if(isInboundV18(state))return checksumV18(state);
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
 if(isBaseRushV21(state))return findLegalMovesV21(state);
 if(isFixedRushV20(state))return findLegalMovesV20(state);
 if(isRushV19(state))return findLegalMovesV19(state);
 if(isInboundV18(state))return findLegalMovesV18(state);
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
