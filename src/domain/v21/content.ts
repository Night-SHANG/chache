import {RULES_V20_CONFIG} from '../v20/content.ts';
export {CARGO,SHAPES} from '../v20/content.ts';
export const RULES_V21_CONFIG=Object.freeze({...RULES_V20_CONFIG,rulesetVersion:21,runConfigId:'run.rush_v21.base'} as const);
export function rushConfigIdV21():'run.rush_v21.base' {return 'run.rush_v21.base';}
