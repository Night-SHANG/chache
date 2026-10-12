import type { RunState, Command, CommandResult, PlacementPreview, Point, ColorTier, OutboundDifficulty } from './types.ts';
import type {RunState as LegacyState,Command as LegacyCommand} from './rulesets/v1/types.ts';
import {createRunV3,applyCommandV3,previewPlacementV3,findLegalMovesV3} from './v3/engine.ts';
import {createRunV4,applyCommandV4,previewPlacementV4,findLegalMovesV4} from './v4/engine.ts';
import {createRunV5,applyCommandV5,previewPlacementV5,findLegalMovesV5} from './v5/engine.ts';
import {isColorTier,mixedColorRunConfigId} from './v5/content.ts';
import {createRunV6,applyCommandV6,previewPlacementV6,findLegalMovesV6} from './v6/engine.ts';
import {isOutboundDifficulty,outboundRunConfigId} from './v6/content.ts';
import {createRunV7,applyCommandV7,previewPlacementV7,findLegalMovesV7} from './v7/engine.ts';
import {createRunV8,applyCommandV8,previewPlacementV8,findLegalMovesV8} from './v8/engine.ts';
import {outboundRunConfigIdV8} from './v8/content.ts';
import * as legacy from './rulesets/v1/engine.ts';
import {createRunV2,applyCommandV2,previewPlacementV2,findLegalMovesV2} from './v2/engine.ts';
type RunVariant=ColorTier|OutboundDifficulty;
function assertVersion(mode:RunState['mode'],rulesetVersion:number,variant?:RunVariant):void {
 if(![1,2,3,4,5,6,7,8].includes(rulesetVersion))throw Error(`不支持规则版本 ${rulesetVersion}`);
 if((mode==='color_exit')!==[4,5,6,8].includes(rulesetVersion)||(mode==='endless')!==(rulesetVersion===7))throw Error('模式与规则版本不匹配');
 if(rulesetVersion===5){if(!isColorTier(variant))throw Error('双色规则版本必须指定有效档位');}
 else if(rulesetVersion===6||rulesetVersion===8){if(!isOutboundDifficulty(variant))throw Error('出库规则版本必须指定有效难度');}
 else if(variant!==undefined)throw Error('此规则版本不接受档位');
}
/** Legacy callers retain v1; application new-run entry explicitly selects CURRENT_RULESET. */
export function createRun(seed:number,mode:RunState['mode']='standard',rulesetVersion=1,colorTier?:RunVariant):RunState {
 assertVersion(mode,rulesetVersion,colorTier);
 if(rulesetVersion===1)return legacy.createRun(seed,mode as LegacyState['mode']);
 if(rulesetVersion===2)return createRunV2(seed,mode);
 if(rulesetVersion===3)return createRunV3(seed,mode);
 if(rulesetVersion===4)return createRunV4(seed);
 if(rulesetVersion===5)return createRunV5(seed,colorTier as ColorTier);
 if(rulesetVersion===6)return createRunV6(seed,colorTier as OutboundDifficulty);
 if(rulesetVersion===7)return createRunV7(seed);
 if(rulesetVersion===8)return createRunV8(seed,colorTier as OutboundDifficulty);
 throw Error(`不支持规则版本 ${rulesetVersion}`);
}
/** Shared by all public read/command routes, without altering any frozen legacy implementation. */
export function assertRulesIdentity(state:RunState):void {
 const owns=(field:string):boolean=>Object.prototype.hasOwnProperty.call(state,field);
 assertVersion(state.mode,state.rulesetVersion,(state.rulesetVersion===6||state.rulesetVersion===8)?state.difficultyId:state.colorTier);
 if(state.rulesetVersion===6||state.rulesetVersion===8){
  if(state.boardSize!==9||state.board.length!==81)throw Error('出库规则尺寸身份不匹配');
  if(owns('colorTier')||state.runConfigId!==(state.rulesetVersion===8?outboundRunConfigIdV8(state.difficultyId!):outboundRunConfigId(state.difficultyId!)))throw Error('出库规则难度配置身份不匹配');
 }else{
  if(owns('boardSize')||owns('difficultyId'))throw Error('旧规则版本不接受新尺寸或难度身份');
  if(state.rulesetVersion===5){if(state.runConfigId!==mixedColorRunConfigId(state.colorTier!))throw Error('双色规则版本与档位配置不匹配');}
  else if(state.candidates.some(piece=>Object.prototype.hasOwnProperty.call(piece,'cellCargos')))throw Error('旧规则版本不接受逐格双色货件');
  if(state.rulesetVersion===7&&(state.runConfigId!=='run.endless_v7'||owns('colorTier')||state.board.length!==49||state.cellTraits?.length!==49||state.overtime!==false||state.tutorialStep!==3))throw Error('无限入库规则身份不匹配');
 }
}
export function applyCommand(state:RunState,command:Command):CommandResult {
 assertRulesIdentity(state);
 if(state.rulesetVersion===1)return legacy.applyCommand(state as LegacyState,command as LegacyCommand);
 if(state.rulesetVersion===2)return applyCommandV2(state,command);
 if(state.rulesetVersion===3)return applyCommandV3(state,command);
 if(state.rulesetVersion===4)return applyCommandV4(state,command);
 if(state.rulesetVersion===5)return applyCommandV5(state,command);
 if(state.rulesetVersion===6)return applyCommandV6(state,command);
 if(state.rulesetVersion===7)return applyCommandV7(state,command);
 if(state.rulesetVersion===8)return applyCommandV8(state,command);
 throw Error(`不支持规则版本 ${state.rulesetVersion}`);
}
export function previewPlacement(state:RunState,pieceId:string,origin:Point):PlacementPreview {
 assertRulesIdentity(state);
 if(state.rulesetVersion===1)return legacy.previewPlacement(state as LegacyState,pieceId,origin);
 if(state.rulesetVersion===2)return previewPlacementV2(state,pieceId,origin);
 if(state.rulesetVersion===3)return previewPlacementV3(state,pieceId,origin);
 if(state.rulesetVersion===4)return previewPlacementV4(state,pieceId,origin);
 if(state.rulesetVersion===5)return previewPlacementV5(state,pieceId,origin);
 if(state.rulesetVersion===6)return previewPlacementV6(state,pieceId,origin);
 if(state.rulesetVersion===7)return previewPlacementV7(state,pieceId,origin);
 if(state.rulesetVersion===8)return previewPlacementV8(state,pieceId,origin);
 throw Error(`不支持规则版本 ${state.rulesetVersion}`);
}
export function findLegalMoves(state:RunState):{pieceId:string;origin:Point}[] {
 assertRulesIdentity(state);
 if(state.rulesetVersion===1)return legacy.findLegalMoves(state as LegacyState);
 if(state.rulesetVersion===2)return findLegalMovesV2(state);
 if(state.rulesetVersion===3)return findLegalMovesV3(state);
 if(state.rulesetVersion===4)return findLegalMovesV4(state);
 if(state.rulesetVersion===5)return findLegalMovesV5(state);
 if(state.rulesetVersion===6)return findLegalMovesV6(state);
 if(state.rulesetVersion===7)return findLegalMovesV7(state);
 if(state.rulesetVersion===8)return findLegalMovesV8(state);
 throw Error(`不支持规则版本 ${state.rulesetVersion}`);
}
