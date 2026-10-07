import type { ColorTier, OutboundDifficulty } from '../domain/types.ts';
import type { ItemId, GuideTrack } from '../application/account-types.ts';
import type { CargoId } from '../domain/types.ts';
import type { UpgradeIdV9 } from '../domain/v9/types.ts';
import type { CosmeticKind } from '../application/cosmetics.ts';
import type { RunSlot } from '../application/run-slots.ts';
import type { InboundDifficultyV18 } from '../domain/v18/types.ts';

/** Normal is retained only to represent stale actions and restored old menu state. */
export type InboundUiDifficulty = InboundDifficultyV18|'normal';
type LegacyUiAction = {type:'newRun';mode:'standard'|'daily'|'color_exit'|'endless';colorTier?:ColorTier;inboundDifficulty?:InboundUiDifficulty;difficultyId?:OutboundDifficulty;outboundMode?:'normal'|'endless'}|{type:'switchMode';variant:RunSlot}|{type:'chooseInbound'}|{type:'chooseColorTier'}|{type:'chooseLegacy'}|{type:'comparisonSeedNext'}|{type:'introStart'}|{type:'colorHelp'}|{type:'help'}|{type:'helpBack'}|{type:'helpDetails'}|{type:'skipTutorial'}|{type:'continue'}|{type:'settings'}|{type:'home'}|{type:'back'}|{type:'confirm'}|{type:'cancel'}|{type:'toggleSound'}|{type:'toggleMotion'}|{type:'cosmetic';kind:'theme'|'forklift'|'cargo';id:string}|{type:'resetProfile'}|{type:'recoverProfile'}|{type:'continueOvertime'}|{type:'finishOvertime'}|{type:'finishEndless'};
export type CosmeticShopAction = {type:'selectShopTab';tab:'tools'|'cosmetics'}|{type:'selectCosmeticCategory';kind:CosmeticKind}|{type:'previewCosmetic';kind:CosmeticKind;id:string}|{type:'purchaseCosmetic';kind:CosmeticKind;id:string}|{type:'equipCosmetic';kind:CosmeticKind;id:string}|{type:'setCargoOutline';enabled:boolean};
export type UiAction = {type:'helpMenu'}|{type:'selectHelp';topic:'inbound'|'outbound'}|{type:'pausePractice'}|{type:'toggleTutorials'}|{type:'openPracticeSelect'}|{type:'startPractice';kind:import('../application/tutorial-practice.ts').PracticeKind}|{type:'exitPractice'}| {type:'selectInboundDifficulty';inboundDifficulty:InboundUiDifficulty} | LegacyUiAction | GrowthAction | CosmeticShopAction | {type:'selectOutboundMode';mode:'normal'|'endless'};
export type GrowthAction = {type:'shop'}|{type:'toggleToolbox'}|{type:'purchase';item:ItemId}|{type:'toggleItem';item:ItemId}|{type:'prepareNext'}|{type:'chooseCleanup';branch:'orders'|'placements'}|{type:'guidedStart';track:GuideTrack}|{type:'directStart'}|{type:'retrySave'}|{type:'tool';item:ItemId}|{type:'toolPiece';pieceId:string}|{type:'toolCell';cell:number}|{type:'toolCargo';cargo:CargoId}|{type:'toolRotate'}|{type:'toolConfirm'}|{type:'toolCancel'}|{type:'chooseUpgrade';upgradeId:UpgradeIdV9}|{type:'supplyCargo';cargo:CargoId}|{type:'supplyCancel'}|{type:'declineOvertime'};
