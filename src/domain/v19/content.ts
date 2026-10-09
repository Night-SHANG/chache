import {RULES_V16_CONFIG} from '../v16/content.ts';
import type {RushDifficultyV19,RushRunV19} from './types.ts';

export {CARGO,SHAPES} from '../v16/content.ts';
export const RULES_V19_CONFIG=Object.freeze({...RULES_V16_CONFIG,rulesetVersion:19,runConfigId:'run.rush_v19.hard',orderMinByShift:Object.freeze([4,4,5,5,6]),orderMaxByShift:Object.freeze([4,5,5,6,7])} as const);
export function rushConfigIdV19(difficulty:RushDifficultyV19):RushRunV19['runConfigId'] {
 if(difficulty!=='hard'&&difficulty!=='expert')throw new Error('Invalid v19 difficulty');
 return `run.rush_v19.${difficulty}`;
}
