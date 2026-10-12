import type {OutboundDifficulty} from '../types.ts';
import {RULES_V6_CONFIG,isOutboundDifficulty} from '../v6/content.ts';

export {MIXED_COLOR_PERCENT_V6 as MIXED_COLOR_PERCENT_V8} from '../v6/content.ts';

/** Only identity and the proven entry-blocking termination differ from frozen v6. */
export const RULES_V8_CONFIG={...RULES_V6_CONFIG,rulesetVersion:8,runConfigId:'run.outbound9_v8'} as const;
export function outboundRunConfigIdV8(difficulty:OutboundDifficulty):string {
 if(!isOutboundDifficulty(difficulty))throw Error('出库规则版本必须指定有效难度');
 return `${RULES_V8_CONFIG.runConfigId}.${difficulty}`;
}
