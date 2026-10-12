import type {OutboundDifficulty} from '../types.ts';
import {isOutboundDifficulty} from '../v6/content.ts';

const multipliers:Readonly<Record<OutboundDifficulty,Readonly<{numerator:number;denominator:number}>>>=Object.freeze({
 easy:Object.freeze({numerator:1,denominator:1}),
 normal:Object.freeze({numerator:5,denominator:4}),
 hard:Object.freeze({numerator:3,denominator:2}),
 expert:Object.freeze({numerator:2,denominator:1}),
});

export function difficultyScoreMultiplierV12(difficulty:OutboundDifficulty):Readonly<{numerator:number;denominator:number}> {
 if(!isOutboundDifficulty(difficulty))throw new RangeError('Invalid outbound score difficulty');
 return multipliers[difficulty];
}

/** Multiply only the quotient and small remainder, never the entire raw score. */
export function displayScoreV12(rawScore:number,difficulty:OutboundDifficulty):number {
 if(!Number.isSafeInteger(rawScore)||rawScore<0)throw new RangeError('Invalid outbound raw score');
 const {numerator,denominator}=difficultyScoreMultiplierV12(difficulty);
 const quotient=Math.floor(rawScore/denominator),remainderScore=Math.floor((rawScore%denominator)*numerator/denominator);
 if(quotient>Math.floor((Number.MAX_SAFE_INTEGER-remainderScore)/numerator))throw new RangeError('Outbound score exceeds safe integer range');
 return quotient*numerator+remainderScore;
}

/** Decode both persisted values together: displayed score must never be scaled a second time. */
export function validScoreStateV12(rawScore:unknown,score:unknown,difficulty:OutboundDifficulty):boolean {
 if(typeof rawScore!=='number'||typeof score!=='number'||!Number.isSafeInteger(score)||score<0)return false;
 try{return displayScoreV12(rawScore,difficulty)===score;}catch{return false;}
}
