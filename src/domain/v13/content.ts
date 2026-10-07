import type {OutboundDifficulty} from '../types.ts';
import {isOutboundDifficulty} from '../v6/content.ts';
import {RULES_V12_CONFIG} from '../v12/content.ts';
export {MIXED_COLOR_PERCENT_V12 as MIXED_COLOR_PERCENT_V13,isValidOutboundPieceV12 as isValidOutboundPieceV13,validToolChargesV12 as validToolChargesV13} from '../v12/content.ts';
export const RULES_V13_CONFIG={...RULES_V12_CONFIG,rulesetVersion:13,runConfigId:'run.outbound9_v13'} as const;
export function outboundRunConfigIdV13(difficulty:OutboundDifficulty):string {
 if(!isOutboundDifficulty(difficulty))throw Error('出库规则版本必须指定有效难度');
 return `${RULES_V13_CONFIG.runConfigId}.${difficulty}`;
}
