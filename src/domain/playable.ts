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

export type InboundRun = InboundRunV9 | InboundRunV11;
export type GameRun = RunState | InboundRun | OutboundEndlessRunV10;
export type GameCommand = Command | InboundCommandV9 | InboundCommandV11 | OutboundEndlessCommandV10;
export type GameEvent = DomainEvent | InboundEventV9 | InboundEventV11 | OutboundEventV10;
export type GameShipment = Shipment | ShipmentV9 | ShipmentV11 | OutboundShipmentV10;
export interface GameStepResult {state:GameRun;events:GameEvent[];error?:string}
export interface PlayablePreview {
 valid:boolean;cells:number[];shipments:GameShipment[];events:GameEvent[];stateAfter?:GameRun;reason?:string;
}
export type RunSpec =
 | {family:'inbound';mode:'standard'|'daily'|'endless';rulesetVersion:9|11;seed:number;guided:boolean;toolCharges:ToolChargesV9}
 | {family:'outbound';variant:'normal'|'endless';rulesetVersion:8|10;seed:number;difficultyId:OutboundDifficulty};

export const isInboundV9=(state:GameRun):state is InboundRunV9=>state.rulesetVersion===9;
export const isInboundV11=(state:GameRun):state is InboundRunV11=>state.rulesetVersion===11;
export const isInboundRun=(state:GameRun):state is InboundRun=>isInboundV9(state)||isInboundV11(state);
export const isOutboundEndlessV10=(state:GameRun):state is OutboundEndlessRunV10=>state.rulesetVersion===10;

/** New identities meet at this bridge; frozen 1–8 dispatch remains untouched. */
export function createPlayableRun(spec:RunSpec):GameRun {
 if(!spec||!Number.isSafeInteger(spec.seed)||spec.seed < -2147483648||spec.seed>4294967295)throw Error('种子无效');
 if(spec.family==='inbound'){
  if(![9,11].includes(spec.rulesetVersion)||!['standard','daily','endless'].includes(spec.mode)||typeof spec.guided!=='boolean')throw Error('入库规则身份不匹配');
  if(spec.rulesetVersion===11)return createRunV11({seed:spec.seed,mode:spec.mode,guided:spec.guided,toolCharges:spec.toolCharges});
  return createRunV9({seed:spec.seed,mode:spec.mode,guided:spec.guided,toolCharges:spec.toolCharges});
 }
 if(spec.family!=='outbound'||!isOutboundDifficulty(spec.difficultyId))throw Error('出库规则身份不匹配');
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
 if(isOutboundEndlessV10(state))return command.type==='place'||command.type==='finishOutboundEndless'?applyCommandV10(state,command):rejected();
 if(!LEGACY_COMMANDS.has(command.type))return rejected();
 return applyCommand(state,command as Command);
}

export function previewPlayablePlacement(state:GameRun,pieceId:string,origin:Point):PlayablePreview {
 if(isInboundV11(state))return previewPlacementV11(state,pieceId,origin);
 if(isInboundV9(state)){
  const preview=previewPlacementV9(state,pieceId,origin);
  return {...preview,shipments:preview.events.filter((event):event is ShipmentV9=>event.type==='shipment')};
 }
 const preview=isOutboundEndlessV10(state)?previewPlacementV10(state,pieceId,origin):previewPlacement(state,pieceId,origin);
 if(!preview.valid)return {...preview,events:[]};
 const settled=applyPlayableCommand(state,{type:'place',pieceId,origin});
 return {...preview,events:settled.events,stateAfter:settled.state};
}

export function playableChecksum(state:GameRun):string {
 if(isInboundV11(state))return checksumV11(state);
 if(isInboundV9(state))return checksumV9(state);
 if(isOutboundEndlessV10(state))return checksumV10(state);
 return checksum(state);
}
export function findPlayableMoves(state:GameRun):{pieceId:string;origin:Point}[] {
 if(isInboundV11(state))return findLegalMovesV11(state);
 if(isInboundV9(state))return findLegalMovesV9(state);
 if(isOutboundEndlessV10(state))return findLegalMovesV10(state);
 return findLegalMoves(state);
}
