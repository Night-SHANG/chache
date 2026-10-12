import type {RushRunV20,RushPreviewV20} from '../v20/types.ts';
export type {Point,StartRushV20 as StartRushV21,RushCommandV20 as RushCommandV21,RushEventV20 as RushEventV21} from '../v20/types.ts';
export interface RushRunV21 extends Omit<RushRunV20,'rulesetVersion'|'runConfigId'> {
 rulesetVersion:21;runConfigId:'run.rush_v21.base';
}
export interface RushStepResultV21 {state:RushRunV21;events:import('../v20/types.ts').RushEventV20[];error?:string}
export interface RushPreviewV21 extends Omit<RushPreviewV20,'stateAfter'> {stateAfter?:RushRunV21}
