import type {InboundCommandV16,InboundEventV16,InboundRunV16,PlacementPreviewV16,StartV16} from '../v16/types.ts';

export type {CargoId,Point} from '../types.ts';
export type {UpgradeIdV16 as UpgradeIdV18,ToolIdV16 as ToolIdV18,ToolChargesV16 as ToolChargesV18,CleanupBranchV16 as CleanupBranchV18,CleanupV16 as CleanupV18,CellTraitV16 as CellTraitV18,PieceV16 as PieceV18,ToolCommandV16 as ToolCommandV18,CargoGroupV16 as CargoGroupV18,RouteV16 as RouteV18,ReachableGroupV16 as ReachableGroupV18,ShipmentV16 as ShipmentV18,GenerationDistributionV16 as GenerationDistributionV18,DockV16 as DockV18} from '../v16/types.ts';
export type InboundDifficultyV18='hard'|'expert';
export interface StartV18 extends Omit<StartV16,'inboundDifficulty'|'guided'> {inboundDifficulty?:InboundDifficultyV18;guided?:false}
export interface InboundRunV18 extends Omit<InboundRunV16,'rulesetVersion'|'runConfigId'|'inboundDifficulty'|'guided'> {
 rulesetVersion:18;runConfigId:'run.inbound_v18.hard'|'run.inbound_v18.expert';inboundDifficulty:InboundDifficultyV18;guided:false;rawScore:number;
}
export type InboundCommandV18=InboundCommandV16;
export type InboundEventV18=InboundEventV16;
export interface InboundStepResultV18 {state:InboundRunV18;events:InboundEventV18[];error?:string}
export interface PlacementPreviewV18 extends Omit<PlacementPreviewV16,'stateAfter'> {stateAfter?:InboundRunV18}
