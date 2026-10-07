import type {OutboundDifficulty} from '../types.ts';
import {RULES_V6_CONFIG,isOutboundDifficulty,isValidOutboundPieceV6} from '../v6/content.ts';
import type {OutboundToolPieceV12,ToolChargesV12} from './types.ts';

export {MIXED_COLOR_PERCENT_V6 as MIXED_COLOR_PERCENT_V12} from '../v6/content.ts';
export const RULES_V12_CONFIG={...RULES_V6_CONFIG,rulesetVersion:12,runConfigId:'run.outbound9_v12',historySegmentSize:128,
 toolPrices:{rotate:80,clear:120,wildcard:160}} as const;
export function outboundRunConfigIdV12(difficulty:OutboundDifficulty):string {
 if(!isOutboundDifficulty(difficulty))throw Error('出库规则版本必须指定有效难度');
 return `${RULES_V12_CONFIG.runConfigId}.${difficulty}`;
}
export function validToolChargesV12(value:unknown):value is ToolChargesV12 {
 if(!value||typeof value!=='object'||Array.isArray(value))return false;
 const charges=value as Record<string,unknown>;
 return Object.keys(charges).length===3&&['rotate','clear','wildcard'].every(id=>charges[id]===0||charges[id]===1)
  &&(charges.rotate as number)+(charges.clear as number)+(charges.wildcard as number)<=2;
}
export function isValidOutboundPieceV12(value:unknown):value is OutboundToolPieceV12 {
 return isValidOutboundPieceV6(value)&&[0,1,2,3].includes((value as OutboundToolPieceV12).quarterTurns);
}
