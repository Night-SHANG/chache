import type { RunState, Command, CommandResult, PlacementPreview, Point, ColorTier } from './types.ts';
import type {RunState as LegacyState,Command as LegacyCommand} from './rulesets/v1/types.ts';
import {createRunV3,applyCommandV3,previewPlacementV3,findLegalMovesV3} from './v3/engine.ts';
import {createRunV4,applyCommandV4,previewPlacementV4,findLegalMovesV4} from './v4/engine.ts';
import {createRunV5,applyCommandV5,previewPlacementV5,findLegalMovesV5} from './v5/engine.ts';
import {isColorTier,mixedColorRunConfigId} from './v5/content.ts';
import * as legacy from './rulesets/v1/engine.ts';
import {createRunV2,applyCommandV2,previewPlacementV2,findLegalMovesV2} from './v2/engine.ts';
function assertVersion(mode:RunState['mode'],rulesetVersion:number,colorTier?:ColorTier):void {
 if((mode==='color_exit')!==(rulesetVersion===4||rulesetVersion===5))throw Error('模式与规则版本不匹配');
 if(rulesetVersion===5){if(!isColorTier(colorTier))throw Error('双色规则版本必须指定有效档位');}
 else if(colorTier!==undefined)throw Error('非双色规则版本不接受档位');
 if(![1,2,3,4,5].includes(rulesetVersion))throw Error(`不支持规则版本 ${rulesetVersion}`);
}
/** Legacy callers retain v1; application new-run entry explicitly selects CURRENT_RULESET. */
export function createRun(seed:number,mode:RunState['mode']='standard',rulesetVersion=1,colorTier?:ColorTier):RunState {
 assertVersion(mode,rulesetVersion,colorTier);
 if(rulesetVersion===1)return legacy.createRun(seed,mode as LegacyState['mode']);
 if(rulesetVersion===2)return createRunV2(seed,mode);
 if(rulesetVersion===3)return createRunV3(seed,mode);
 if(rulesetVersion===4)return createRunV4(seed);
 if(rulesetVersion===5)return createRunV5(seed,colorTier!);
 throw Error(`不支持规则版本 ${rulesetVersion}`);
}
/** Shared by all public read/command routes, without altering any frozen legacy implementation. */
export function assertRulesIdentity(state:RunState):void {
 assertVersion(state.mode,state.rulesetVersion,state.colorTier);
 if(state.rulesetVersion===5){if(state.runConfigId!==mixedColorRunConfigId(state.colorTier!))throw Error('双色规则版本与档位配置不匹配');}
 else if(state.candidates.some(piece=>Object.prototype.hasOwnProperty.call(piece,'cellCargos')))throw Error('旧规则版本不接受逐格双色货件');
}
export function applyCommand(state:RunState,command:Command):CommandResult {
 assertRulesIdentity(state);
 if(state.rulesetVersion===1)return legacy.applyCommand(state as LegacyState,command as LegacyCommand);
 if(state.rulesetVersion===2)return applyCommandV2(state,command);
 if(state.rulesetVersion===3)return applyCommandV3(state,command);
 if(state.rulesetVersion===4)return applyCommandV4(state,command);
 if(state.rulesetVersion===5)return applyCommandV5(state,command);
 throw Error(`不支持规则版本 ${state.rulesetVersion}`);
}
export function previewPlacement(state:RunState,pieceId:string,origin:Point):PlacementPreview {
 assertRulesIdentity(state);
 if(state.rulesetVersion===1)return legacy.previewPlacement(state as LegacyState,pieceId,origin);
 if(state.rulesetVersion===2)return previewPlacementV2(state,pieceId,origin);
 if(state.rulesetVersion===3)return previewPlacementV3(state,pieceId,origin);
 if(state.rulesetVersion===4)return previewPlacementV4(state,pieceId,origin);
 if(state.rulesetVersion===5)return previewPlacementV5(state,pieceId,origin);
 throw Error(`不支持规则版本 ${state.rulesetVersion}`);
}
export function findLegalMoves(state:RunState):{pieceId:string;origin:Point}[] {
 assertRulesIdentity(state);
 if(state.rulesetVersion===1)return legacy.findLegalMoves(state as LegacyState);
 if(state.rulesetVersion===2)return findLegalMovesV2(state);
 if(state.rulesetVersion===3)return findLegalMovesV3(state);
 if(state.rulesetVersion===4)return findLegalMovesV4(state);
 if(state.rulesetVersion===5)return findLegalMovesV5(state);
 throw Error(`不支持规则版本 ${state.rulesetVersion}`);
}
