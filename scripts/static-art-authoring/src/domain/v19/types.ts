import type {InboundCommandV16,InboundEventV16,InboundRunV16,PlacementPreviewV16,ToolChargesV16} from '../v16/types.ts';

export type {CargoId,Point,TraitId} from '../types.ts';
export type {UpgradeIdV16 as UpgradeIdV19,ToolIdV16 as ToolIdV19,ToolChargesV16 as ToolChargesV19,CleanupBranchV16 as CleanupBranchV19,CleanupV16 as CleanupV19,CellTraitV16 as CellTraitV19,PieceV16 as PieceV19,ToolCommandV16 as ToolCommandV19,CargoGroupV16 as CargoGroupV19,RouteV16 as RouteV19,ReachableGroupV16 as ReachableGroupV19,ShipmentV16 as ShipmentV19,GenerationDistributionV16 as GenerationDistributionV19,DockV16 as DockV19} from '../v16/types.ts';
export type RushDifficultyV19='hard'|'expert';
export interface StartRushV19 {seed:number;mode:'rush';inboundDifficulty?:RushDifficultyV19;guided?:false;toolCharges?:ToolChargesV16}
export interface RushRunV19 extends Omit<InboundRunV16,'rulesetVersion'|'runConfigId'|'mode'|'inboundDifficulty'|'guided'|'overtime'> {
 rulesetVersion:19;runConfigId:'run.rush_v19.hard'|'run.rush_v19.expert';mode:'rush';inboundDifficulty:RushDifficultyV19;guided:false;rawScore:number;overtime:false;
}
export type RushCommandV19=InboundCommandV16;
export type RushEventV19=InboundEventV16;
export interface RushStepResultV19 {state:RushRunV19;events:RushEventV19[];error?:string}
export interface RushPreviewV19 extends Omit<PlacementPreviewV16,'stateAfter'> {stateAfter?:RushRunV19}
