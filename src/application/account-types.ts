import type { GameCommand, GameRun } from '../domain/playable.ts';
import type { OutboundDifficulty } from '../domain/types.ts';
import type { Profile } from './profile.ts';
import type {RunSlot} from './run-slots.ts';

export type ItemId = 'rotate' | 'clear' | 'wildcard';
export type EconomyScope = 'inbound' | 'outbound';
export type Inventory = Record<ItemId, number>;
export interface RunIdentity {
 runId:string; serial:number; rulesetVersion:8|9|10|11|12|13|14; runConfigId:string;
 mode:'standard'|'daily'|'guided'|'endless'|'outbound'|'outboundEndless'|'outboundGuided';
 difficultyId?:OutboundDifficulty; challengeDay?:string; economyVersion:1|2;
}
export interface HistoryRef { key:string; digest:string; commandCount:number }
/** The sole persisted command tail. Domain commands are rebuilt from this field. */
export interface HistoryCursor {
 seed:number; runConfigId:string; head:HistoryRef|null; totalCommands:number; tail:GameCommand[];
}
export interface HistoryChunk {
 formatVersion:1; runId:string; firstCommandIndex:number; commands:GameCommand[];
 previous:HistoryRef|null; digest:string;
}
export interface ResultCursor {
 runId:string; commandIndex:number; units:number; score:number; countedRun:boolean; countedWin:boolean; countedRetirement:boolean;
 bucketKey:string; bucketBefore:ResultBucket|null;
 maxChainSinceBaseline:number;
 baseline:{units:number;score:number;countedWin:boolean;countedRetirement:boolean};
}
export interface AccountRun {
 identity:RunIdentity; state:GameRun; history:HistoryCursor; lifecycle:'active'|'closed';
 reserved:ItemId[]; creditedBase:number; earnedCoins:number; resultCursor:ResultCursor|null;
}
export type GuideTrack = 'inbound'|'outbound';
export type GuideStep = 'place'|'order'|'route'|'upgrade'|'rushTimer'|'expired'|'sweepChoice'|'colorGroup'|'colorExit'|'mixedRemainder';
export interface GuideProgress { learned:GuideStep[]; skipped:boolean; authoredStartConsumed:boolean }
export interface ResultBucket {
 runs:number; units:number; maxUnits:number; score:number; wins:number; retirements:number; maxChain:number;
 best:{score:number;units:number;chain:number}|null;
}
export interface AccountProfile {
 settings:Profile['settings']; cosmetics:Profile['cosmetics'];
 legacyResults:Omit<Profile,'schemaVersion'|'settings'|'cosmetics'|'tutorialComplete'|'nextRunSerial'>;
 results:Record<string,ResultBucket>;
}
export interface ClosedResult {
 identity:RunIdentity; reason:'blocked'|'completed'|'retired'|'abandoned';
 commandIndex:number; units:number; score:number; maxChain:number; result:'failed'|'won'|null;
 coinDelta:number; earnedCoins:number; returned:ItemId[]; history:HistoryCursor; elapsedMs?:number;
}
export interface OperationRequest { operationId:string; expectedGeneration:number }
export interface OperationReceipt extends OperationRequest { requestDigest:string; committedGeneration:number }
export interface AccountSnapshot {
 formatVersion:1|2; economyVersion:1|2; epoch:string; generation:number;
 nextRunSerial:number; closedThroughSerial:number; wallet:number; inventory:Inventory;
 run:AccountRun|null; lastClosedResult:ClosedResult|null; profile:AccountProfile;
 guides:Record<GuideTrack,GuideProgress>; dailyPaid:Record<string,{bestBase:number;paid:number}>;
 /** Version 2 keeps reward safety independently of display/profile resets. */
 dailyRewards?:Record<string,{completedRunId:string|null;bonusPaid:number}>;
 resetCursor:{serial:number;commandIndex:number}; legacyImported:boolean;
 migration:{version:1;sourceDigests:Record<string,string>;legacySerialCeiling:number;legacySerials:Partial<Record<RunSlot,number>>}; lastOperation:OperationReceipt|null;
}
