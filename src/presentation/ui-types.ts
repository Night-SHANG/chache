import type { ColorTier, OutboundDifficulty } from '../domain/types.ts';
import type { ItemId, GuideTrack } from '../application/account-types.ts';
import type { CargoId } from '../domain/types.ts';
import type { UpgradeIdV9 } from '../domain/v9/types.ts';
import type { RunSlot } from '../application/run-slots.ts';

type LegacyUiAction = {type:'newRun';mode:'standard'|'daily'|'color_exit'|'endless';colorTier?:ColorTier;difficultyId?:OutboundDifficulty;outboundMode?:'normal'|'endless'}|{type:'switchMode';variant:RunSlot}|{type:'chooseInbound'}|{type:'chooseColorTier'}|{type:'chooseLegacy'}|{type:'comparisonSeedNext'}|{type:'introStart'}|{type:'colorHelp'}|{type:'help'}|{type:'helpBack'}|{type:'helpDetails'}|{type:'skipTutorial'}|{type:'continue'}|{type:'settings'}|{type:'home'}|{type:'back'}|{type:'confirm'}|{type:'cancel'}|{type:'toggleSound'}|{type:'toggleMotion'}|{type:'cosmetic';kind:'theme'|'forklift'|'cargo';id:string}|{type:'resetProfile'}|{type:'recoverProfile'}|{type:'continueOvertime'}|{type:'finishOvertime'}|{type:'finishEndless'};
export type UiAction = LegacyUiAction | GrowthAction;
export type GrowthAction = {type:'shop'}|{type:'toggleToolbox'}|{type:'purchase';item:ItemId}|{type:'toggleItem';item:ItemId}|{type:'prepareNext'}|{type:'chooseCleanup';branch:'orders'|'placements'}|{type:'guidedStart';track:GuideTrack}|{type:'directStart'}|{type:'retrySave'}|{type:'tool';item:ItemId}|{type:'toolPiece';pieceId:string}|{type:'toolCell';cell:number}|{type:'toolCargo';cargo:CargoId}|{type:'toolRotate'}|{type:'toolConfirm'}|{type:'toolCancel'}|{type:'chooseUpgrade';upgradeId:UpgradeIdV9}|{type:'supplyCargo';cargo:CargoId}|{type:'supplyCancel'}|{type:'declineOvertime'};
