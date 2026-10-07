import {RULES_V16_CONFIG,INBOUND_ORDER_RANGES_V16} from '../v16/content.ts';
import type {InboundDifficultyV18,InboundRunV18} from './types.ts';

export {CARGO,SHAPES} from '../v16/content.ts';
export const RULES_V18_CONFIG=Object.freeze({...RULES_V16_CONFIG,rulesetVersion:18,runConfigId:'run.inbound_v18.hard',orderMinByShift:Object.freeze([4,4,5,5,6]),orderMaxByShift:Object.freeze([4,5,5,6,7])} as const);
export const INBOUND_ORDER_RANGES_V18=Object.freeze({hard:INBOUND_ORDER_RANGES_V16.hard,expert:INBOUND_ORDER_RANGES_V16.expert});
export const isInboundDifficultyV18=(value:unknown):value is InboundDifficultyV18=>value==='hard'||value==='expert';
export function inboundConfigIdV18(difficulty:InboundDifficultyV18):InboundRunV18['runConfigId'] {
 if(!isInboundDifficultyV18(difficulty))throw new Error('Invalid v18 difficulty');
 return `run.inbound_v18.${difficulty}`;
}
/** Scale quotient and remainder separately so every displayed score remains exact and safe. */
export function scaledScoreV18(rawScore:number,difficulty:InboundDifficultyV18):number {
 if(!Number.isSafeInteger(rawScore)||rawScore<0)throw new RangeError('Invalid v18 raw score');
 if(!isInboundDifficultyV18(difficulty))throw new RangeError('Invalid v18 score difficulty');
 const numerator=difficulty==='hard'?3:2,denominator=difficulty==='hard'?2:1;
 const quotient=Math.floor(rawScore/denominator),remainder=Math.floor(rawScore%denominator*numerator/denominator);
 if(quotient>Math.floor((Number.MAX_SAFE_INTEGER-remainder)/numerator))throw new RangeError('V18 score exceeds safe integer range');
 return quotient*numerator+remainder;
}
