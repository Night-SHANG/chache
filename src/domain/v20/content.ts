import {RULES_V16_CONFIG} from '../v16/content.ts';

export {CARGO,SHAPES} from '../v16/content.ts';
export const RULES_V20_CONFIG=Object.freeze({...RULES_V16_CONFIG,rulesetVersion:20,runConfigId:'run.rush_v20.fixed'} as const);
export function rushConfigIdV20():'run.rush_v20.fixed' {return 'run.rush_v20.fixed';}
