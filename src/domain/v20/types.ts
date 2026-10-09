import type {InboundCommandV16,InboundEventV16,InboundRunV16,PlacementPreviewV16,ToolChargesV16} from '../v16/types.ts';

export type {CargoId,Point,TraitId} from '../types.ts';
export type {ToolIdV16 as ToolIdV20,ToolChargesV16 as ToolChargesV20,CleanupBranchV16 as CleanupBranchV20,CellTraitV16 as CellTraitV20,PieceV16 as PieceV20,ToolCommandV16 as ToolCommandV20,ShipmentV16 as ShipmentV20} from '../v16/types.ts';
export interface StartRushV20 {seed:number;mode:'rush';inboundDifficulty?:'normal';guided?:false;toolCharges?:ToolChargesV16}
export interface RushRunV20 extends Omit<InboundRunV16,'rulesetVersion'|'runConfigId'|'mode'|'inboundDifficulty'|'guided'|'overtime'> {
 rulesetVersion:20;runConfigId:'run.rush_v20.fixed';mode:'rush';inboundDifficulty:'normal';guided:false;rawScore:number;overtime:false;
}
export type RushCommandV20=InboundCommandV16;
export type RushEventV20=InboundEventV16;
export interface RushStepResultV20 {state:RushRunV20;events:RushEventV20[];error?:string}
export interface RushPreviewV20 extends Omit<PlacementPreviewV16,'stateAfter'> {stateAfter?:RushRunV20}
