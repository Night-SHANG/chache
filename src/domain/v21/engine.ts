import {cloneData} from '../../shared/data.ts';
import {asV16,createRunV20,applyCommandV20,previewPlacementV20,findLegalMovesV20,findRescuePlanV20,settlePhaseV20} from '../v20/engine.ts';
import {rushConfigIdV20} from '../v20/content.ts';
import type {RushRunV20} from '../v20/types.ts';
import {rushConfigIdV21} from './content.ts';
import type {Point,RushRunV21,StartRushV21,RushCommandV21,RushStepResultV21,RushPreviewV21} from './types.ts';
/** Only identity and account reward policy change; fixed20 gameplay stays frozen. */
export function asV20(state:RushRunV21):RushRunV20 {
 if(!state||state.rulesetVersion!==21||state.runConfigId!==rushConfigIdV21())throw new Error('Invalid v21 projection identity');
 const projected={...cloneData(state),rulesetVersion:20 as const,runConfigId:rushConfigIdV20()};asV16(projected);return projected;
}
export function fromV20(state:RushRunV20):RushRunV21 {
 asV16(state);return {...cloneData(state),rulesetVersion:21,runConfigId:rushConfigIdV21()};
}
export function createRunV21(options:StartRushV21):RushRunV21 {return fromV20(createRunV20(options));}
export function applyCommandV21(state:RushRunV21,command:RushCommandV21):RushStepResultV21 {
 const result=applyCommandV20(asV20(state),command);return result.error?{state,events:[],error:result.error}:{state:fromV20(result.state),events:result.events};
}
export function previewPlacementV21(state:RushRunV21,pieceId:string,origin:Point):RushPreviewV21 {
 const preview=previewPlacementV20(asV20(state),pieceId,origin);return preview.stateAfter?{...preview,stateAfter:fromV20(preview.stateAfter)}:preview as RushPreviewV21;
}
export function findLegalMovesV21(state:RushRunV21):{pieceId:string;origin:Point}[] {return findLegalMovesV20(asV20(state));}
export function findRescuePlanV21(state:RushRunV21) {return findRescuePlanV20(asV20(state));}
export function settlePhaseV21(state:RushRunV21):RushRunV21 {return fromV20(settlePhaseV20(asV20(state)));}
