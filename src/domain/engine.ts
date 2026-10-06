import type { RunState, Command, CommandResult, PlacementPreview, Point } from './types.ts';
import type {RunState as LegacyState,Command as LegacyCommand} from './rulesets/v1/types.ts';
import {createRunV3,applyCommandV3,previewPlacementV3,findLegalMovesV3} from './v3/engine.ts';
import {createRunV4,applyCommandV4,previewPlacementV4,findLegalMovesV4} from './v4/engine.ts';
import * as legacy from './rulesets/v1/engine.ts';
import {createRunV2,applyCommandV2,previewPlacementV2,findLegalMovesV2} from './v2/engine.ts';
/** Legacy callers retain v1; application new-run entry explicitly selects CURRENT_RULESET. */
export function createRun(seed:number,mode:RunState['mode']='standard',rulesetVersion=1):RunState {
 if((mode==='color_exit')!==(rulesetVersion===4))throw Error('模式与规则版本不匹配');
 if(rulesetVersion===4)return createRunV4(seed);
 if(rulesetVersion===1)return legacy.createRun(seed,mode as LegacyState['mode']);
 if(rulesetVersion===2)return createRunV2(seed,mode);
 if(rulesetVersion===3)return createRunV3(seed,mode);
 throw Error(`不支持规则版本 ${rulesetVersion}`);
}
function version(state:RunState):void {if((state.mode==='color_exit')!==(state.rulesetVersion===4))throw Error('模式与规则版本不匹配');if(state.rulesetVersion!==1&&state.rulesetVersion!==2&&state.rulesetVersion!==3&&state.rulesetVersion!==4)throw Error(`不支持规则版本 ${state.rulesetVersion}`);}
export function applyCommand(state:RunState,command:Command):CommandResult {version(state);return state.rulesetVersion===1?legacy.applyCommand(state as LegacyState,command as LegacyCommand):state.rulesetVersion===2?applyCommandV2(state,command):state.rulesetVersion===3?applyCommandV3(state,command):applyCommandV4(state,command);}
export function previewPlacement(state:RunState,pieceId:string,origin:Point):PlacementPreview {version(state);return state.rulesetVersion===1?legacy.previewPlacement(state as LegacyState,pieceId,origin):state.rulesetVersion===2?previewPlacementV2(state,pieceId,origin):state.rulesetVersion===3?previewPlacementV3(state,pieceId,origin):previewPlacementV4(state,pieceId,origin);}
export function findLegalMoves(state:RunState):{pieceId:string;origin:Point}[] {version(state);return state.rulesetVersion===1?legacy.findLegalMoves(state as LegacyState):state.rulesetVersion===2?findLegalMovesV2(state):state.rulesetVersion===3?findLegalMovesV3(state):findLegalMovesV4(state);}
